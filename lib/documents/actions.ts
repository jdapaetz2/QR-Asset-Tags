"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { validateDocumentForm } from "@/lib/documents/validate";
import {
  DOCUMENTS_BUCKET,
  STORAGE_CLAIM_FIELD,
  documentObjectName,
  documentPathPrefix,
  parseDocumentClaim,
  validateDocumentFile,
} from "@/lib/documents/upload";
import { DOCUMENT_OBJECT_RULES, documentStorage } from "@/lib/documents/storage";
import { verifyClaimedObject } from "@/lib/storage/verify-object";
import { sniffDocumentType, sniffedTypeMatchesMime } from "@/lib/media/sniff";
import {
  FILE_CHECK_FAILED_MESSAGE,
  FILE_VERIFY_FAILED_MESSAGE,
  isUuid,
  readDeclaredUpload,
  type DeclaredUpload,
  type PreparedSingleUpload,
} from "@/lib/storage/direct-upload";

export type DocumentFormState = { error?: string };

type UploadedFile = { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readFile(formData: FormData): UploadedFile | null {
  const entry = formData.get("file");
  if (typeof entry === "string" || !entry || entry.size === 0) return null;
  return entry;
}

/**
 * Step 1 of a hosted-file upload (lib/storage/direct-upload.ts). Vercel refuses request bodies over 4.5 MB and hosted
 * files may be 50 MB, so the file never passes through here: this validates the DECLARED file for an asset the caller
 * can see and returns one signed upload URL for a server-built path. It is signed with the caller's own RLS client,
 * so the `documents org write` storage policy (0005) must also allow the path. `createDocument` verifies the stored
 * object before any row references it.
 */
export async function prepareDocumentUpload(
  assetId: string,
  declared: DeclaredUpload
): Promise<PreparedSingleUpload> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { ok: false, error: "Your account is not attached to an organization." };
  }
  const file = readDeclaredUpload(declared);
  if (!file) return { ok: false, error: "Choose a file to upload." };
  const fileError = validateDocumentFile(file);
  if (fileError) return { ok: false, error: fileError };
  if (!isUuid(assetId)) return { ok: false, error: "Asset not found." };

  const supabase = await createClient();
  // RLS-scoped: another org's asset isn't returned → no URL for a cross-org path.
  const { data: asset } = await supabase.from("assets").select("id").eq("id", assetId).maybeSingle();
  if (!asset) return { ok: false, error: "Asset not found." };

  const documentId = randomUUID();
  const prefix = documentPathPrefix(profile.organization_id, assetId, documentId);
  const path = `${prefix}/${documentObjectName(documentId, file.type)}`;
  const signedUrl = await documentStorage(supabase.storage.from(DOCUMENTS_BUCKET), prefix).signUpload(path);
  if (!signedUrl) return { ok: false, error: "Could not start the upload. Please try again." };
  return { ok: true, path, signedUrl };
}

/** Add a document (external link OR one hosted file) to an asset the caller owns. */
export async function createDocument(
  assetId: string,
  _prev: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const title = readString(formData, "title");
  const documentType = readString(formData, "document_type");
  const visibility = readString(formData, "visibility");
  const url = readString(formData, "url");

  const fieldError = validateDocumentForm({
    title,
    document_type: documentType,
    visibility,
    url,
  });
  if (fieldError) return { error: fieldError };

  // A hosted file arrives either as an already-uploaded object (JavaScript, `storage_claim`) or, without JavaScript,
  // inside this request (subject to the platform's request-body limit).
  const file = readFile(formData);
  const claim = readString(formData, STORAGE_CLAIM_FIELD);
  const hosted = Boolean(file || claim);
  if ((file && claim) || (url && hosted)) {
    return { error: "Provide either a link or a file, not both." };
  }
  if (!url && !hosted) {
    return { error: "Provide a link or upload a file." };
  }

  const supabase = await createClient();

  // Confirm the asset is visible to the caller (RLS) → blocks cross-org ids.
  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  let documentId: string | null = null;
  let storagePath: string | null = null;
  if (claim) {
    // Verify the stored object — this organization, this asset, one object named after its document, PDF/image/video
    // by stored type, extension and leading bytes, ≤ 50 MB — before any row references it.
    const parsed = parseDocumentClaim(claim, profile.organization_id, assetId);
    if (!parsed) return { error: FILE_VERIFY_FAILED_MESSAGE };
    const bucket = documentStorage(
      supabase.storage.from(DOCUMENTS_BUCKET),
      documentPathPrefix(profile.organization_id, assetId, parsed.documentId)
    );
    const verified = await verifyClaimedObject(bucket, parsed.path, DOCUMENT_OBJECT_RULES);
    if (!verified.ok) {
      return { error: verified.reason === "storage" ? FILE_CHECK_FAILED_MESSAGE : FILE_VERIFY_FAILED_MESSAGE };
    }
    documentId = parsed.documentId;
    storagePath = parsed.path;
  } else if (file) {
    const fileError = validateDocumentFile({ type: file.type, size: file.size });
    if (fileError) return { error: fileError };

    const newId = randomUUID();
    storagePath = `${documentPathPrefix(
      profile.organization_id,
      assetId,
      newId
    )}/${documentObjectName(newId, file.type)}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    // The file travels in this request: its bytes must be the declared type, as a direct upload's are.
    if (!sniffedTypeMatchesMime(sniffDocumentType(bytes), file.type)) {
      return { error: "The file's contents don't match its type. Choose the file again." };
    }
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      return { error: "Could not upload the file. Please try again." };
    }
  }

  const { error: insertError } = await supabase.from("documents").insert({
    // An uploaded object is named after its document, so the row takes that id.
    ...(documentId ? { id: documentId } : {}),
    organization_id: profile.organization_id,
    asset_id: assetId,
    title,
    document_type: documentType,
    url: storagePath ? null : url,
    storage_path: storagePath,
    visibility,
    link_status: "unknown",
  });

  if (insertError) {
    // A repeated save of the same upload: the document already exists and references this object — keep both.
    if (documentId && insertError.code === "23505") {
      redirect(`/dashboard/assets/${assetId}/documents`);
    }
    // Nothing references the stored object, so remove it rather than orphan it (best effort).
    if (storagePath) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    }
    return { error: "Could not add the document. Please try again." };
  }

  redirect(`/dashboard/assets/${assetId}/documents`);
}

/** Edit a document's metadata, link status, and (for external docs) URL. */
export async function updateDocument(
  documentId: string,
  _prev: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  await requireProfile();

  const title = readString(formData, "title");
  const documentType = readString(formData, "document_type");
  const visibility = readString(formData, "visibility");
  const url = readString(formData, "url");
  const linkStatus = readString(formData, "link_status");

  const fieldError = validateDocumentForm({
    title,
    document_type: documentType,
    visibility,
    url,
    link_status: linkStatus,
  });
  if (fieldError) return { error: fieldError };

  const update: Record<string, unknown> = {
    title,
    document_type: documentType,
    visibility,
    link_status: linkStatus ?? "unknown",
    // Marking status counts as a manual check.
    last_checked_at: new Date().toISOString(),
  };
  // Only touch the URL when one is provided (external docs); never for hosted files.
  if (url) update.url = url;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", documentId)
    .select("asset_id")
    .maybeSingle();

  if (error) return { error: "Could not save the document." };
  if (!data) return { error: "Document not found." };

  redirect(`/dashboard/assets/${data.asset_id}/documents`);
}

/** Delete a document (and its hosted file, best-effort). RLS-scoped to own org. */
export async function deleteDocument(
  assetId: string,
  documentId: string,
  _prev: DocumentFormState,
  _formData: FormData
): Promise<DocumentFormState> {
  await requireProfile();
  if (!isUuid(documentId)) return { error: "Document not found." };
  const supabase = await createClient();

  // The caller's own client (RLS): a document outside their organization reads as not found.
  const { data: doc, error: loadError } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("asset_id", assetId)
    .maybeSingle();
  if (loadError) return { error: "Could not delete the document." };
  if (!doc) return { error: "Document not found." };

  // The row goes first and must actually go: RLS turns a refused delete into zero rows, not an error. If it fails the
  // stored file is left untouched, so the document still opens.
  const { data: deleted, error } = await supabase.from("documents").delete().eq("id", documentId).select("id");
  if (error || deleted?.length !== 1) return { error: "Could not delete the document." };

  if (doc.storage_path) {
    // Best-effort once nothing references the file. A leftover object is found by the abandoned-upload report
    // (docs/ORPHAN_MEDIA_CLEANUP.md); the log never carries the path.
    const { data: removed, error: removeError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
    if (removeError || !removed?.length) {
      console.warn("[storage]", JSON.stringify({ event: "document_object_orphaned", documentId }));
    }
  }

  redirect(`/dashboard/assets/${assetId}/documents`);
}
