"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { validateDocumentForm } from "@/lib/documents/validate";
import {
  documentObjectName,
  documentPathPrefix,
  validateDocumentFile,
} from "@/lib/documents/upload";

export type DocumentFormState = { error?: string };

const DOCUMENTS_BUCKET = "documents";

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

  const file = readFile(formData);
  if (url && file) {
    return { error: "Provide either a link or a file, not both." };
  }
  if (!url && !file) {
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

  let storagePath: string | null = null;
  if (file) {
    const fileError = validateDocumentFile({ type: file.type, size: file.size });
    if (fileError) return { error: fileError };

    const documentId = randomUUID();
    storagePath = `${documentPathPrefix(
      profile.organization_id,
      assetId,
      documentId
    )}/${documentObjectName(documentId, file.type)}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      return { error: "Could not upload the file. Please try again." };
    }
  }

  const { error: insertError } = await supabase.from("documents").insert({
    organization_id: profile.organization_id,
    asset_id: assetId,
    title,
    document_type: documentType,
    url: file ? null : url,
    storage_path: storagePath,
    visibility,
    link_status: "unknown",
  });

  if (insertError) {
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
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (doc?.storage_path) {
    // Best-effort; the row delete is the source of truth.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  }

  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) return { error: "Could not delete the document." };

  redirect(`/dashboard/assets/${assetId}/documents`);
}
