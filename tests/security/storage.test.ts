import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ASSET, ORG_A, ORG_B, STORAGE, anonClient, serviceClient, signInAs } from "./setup/fixtures";

// Executed storage-policy tests (Phase A3.2, Part D). Real Storage API calls prove the object
// policies in 0002/0005/0006/0037: submissions accept NO direct anon writes (only server-issued, path-bound
// signed uploads) + org-scoped read; documents are private unless a published-public document backs them;
// public-assets is public-by-URL.

let adminA: SupabaseClient;
let adminB: SupabaseClient;
let anon: SupabaseClient;

const png = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });

beforeAll(async () => {
  adminA = await signInAs("admin_a");
  adminB = await signInAs("admin_b");
  anon = anonClient();
});

const submissionObjectPath = (orgId: string, ext = "png") =>
  `org/${orgId}/asset/${ASSET.A_PUBLIC}/submission/${randomUUID()}/${randomUUID()}.${ext}`;

describe("submissions bucket (private; no direct anon writes — 0037)", () => {
  it("anon MAY NOT upload directly, even under an org/{id}/… path", async () => {
    const { error } = await anon.storage.from("submissions").upload(`org/${ORG_A}/anon-upload.png`, png());
    expect(error, "anon/submissions/direct-insert should be DENIED").toBeTruthy();
  });

  it("a server-issued signed upload URL lets anon write exactly its one path, once", async () => {
    const service = serviceClient();
    const path = submissionObjectPath(ORG_A);
    const { data: signed, error: signError } = await service.storage.from("submissions").createSignedUploadUrl(path);
    expect(signError?.message ?? null, "service/submissions/sign-upload").toBeNull();
    const token = signed?.token ?? "";

    const { error: uploadError } = await anon.storage.from("submissions").uploadToSignedUrl(path, token, png());
    expect(uploadError?.message ?? null, "anon/submissions/signed-upload").toBeNull();

    const { error: overwriteError } = await anon.storage.from("submissions").uploadToSignedUrl(path, token, png());
    expect(overwriteError, "anon/submissions/signed-upload-overwrite should be DENIED").toBeTruthy();

    const elsewhere = path.replace(/[^/]+$/, `${randomUUID()}.png`);
    const { error: elsewhereError } = await anon.storage.from("submissions").uploadToSignedUrl(elsewhere, token, png());
    expect(elsewhereError, "anon/submissions/signed-upload-other-path should be DENIED").toBeTruthy();

    await service.storage.from("submissions").remove([path]);
  });

  it("a signed upload of a type the bucket does not allow is refused (0037)", async () => {
    const service = serviceClient();
    const path = submissionObjectPath(ORG_A, "mp4");
    const { data: signed } = await service.storage.from("submissions").createSignedUploadUrl(path);
    const video = new Blob([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], { type: "video/mp4" });
    const { error } = await anon.storage.from("submissions").uploadToSignedUrl(path, signed?.token ?? "", video);
    expect(error, "anon/submissions/signed-upload-video should be DENIED").toBeTruthy();
    await service.storage.from("submissions").remove([path]);
  });

  it("the bucket accepts only JPEG, PNG and WebP up to 10 MB (0037)", async () => {
    const { data } = await serviceClient().storage.getBucket("submissions");
    expect(data?.file_size_limit, "submissions/file_size_limit").toBe(10485760);
    expect([...(data?.allowed_mime_types ?? [])].sort(), "submissions/allowed_mime_types").toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("an org member can sign uploads inside its own organization only", async () => {
    const own = await adminA.storage.from("submissions").createSignedUploadUrl(submissionObjectPath(ORG_A));
    expect(own.error?.message ?? null, "admin_a/submissions/sign-own-org").toBeNull();
    const cross = await adminA.storage.from("submissions").createSignedUploadUrl(submissionObjectPath(ORG_B));
    expect(!!cross.error || !cross.data?.signedUrl, "admin_a/submissions/sign-cross-org should be DENIED").toBe(true);
  });

  it("anon MAY NOT read a submission object", async () => {
    const { data, error } = await anon.storage.from("submissions").download(STORAGE.A_SUBMISSION);
    expect(!data || !!error, "anon/submissions/download should be DENIED").toBe(true);
  });

  it("anon MAY NOT list a submissions folder", async () => {
    const { data } = await anon.storage.from("submissions").list(`org/${ORG_A}`);
    expect((data ?? []).length, "anon/submissions/list leaked object names").toBe(0);
  });

  it("an org member MAY read its own submission object", async () => {
    const { data, error } = await adminA.storage.from("submissions").download(STORAGE.A_SUBMISSION);
    expect(error?.message ?? null, "admin_a/submissions/download-own").toBeNull();
    expect(data, "admin_a/submissions/download-own returned no data").toBeTruthy();
  });

  it("a member of another org MAY NOT read a cross-org submission object", async () => {
    const { data, error } = await adminB.storage.from("submissions").download(STORAGE.A_SUBMISSION);
    expect(!data || !!error, "admin_b/submissions/download-cross-org should be DENIED").toBe(true);
  });

  it("cross-org path spoofing is denied (org B cannot read org A's object)", async () => {
    // adminB authenticated; the object lives under org A, so its foldername[2] != current_org_id().
    const { data, error } = await adminB.storage.from("submissions").download(`org/${ORG_A}/anon-upload.png`);
    expect(!data || !!error, "admin_b/submissions/download-spoof should be DENIED").toBe(true);
  });
});

describe("documents bucket (private unless a published-public document backs the object)", () => {
  it("anon MAY NOT read a PRIVATE document object", async () => {
    const { data, error } = await anon.storage.from("documents").download(STORAGE.A_DOC_PRIVATE);
    expect(!data || !!error, "anon/documents/download-private should be DENIED").toBe(true);
  });

  it("anon MAY read a PUBLIC document object of a public asset (0006 policy)", async () => {
    const { data, error } = await anon.storage.from("documents").download(STORAGE.A_DOC_PUBLIC);
    expect(error?.message ?? null, "anon/documents/download-public").toBeNull();
    expect(data, "anon/documents/download-public returned no data").toBeTruthy();
  });

  it("a member of another org MAY NOT read a cross-org private document", async () => {
    const { data, error } = await adminB.storage.from("documents").download(STORAGE.A_DOC_PRIVATE);
    expect(!data || !!error, "admin_b/documents/download-cross-org should be DENIED").toBe(true);
  });

  it("an org member CAN mint a signed URL for its own private document", async () => {
    const { data, error } = await adminA.storage.from("documents").createSignedUrl(STORAGE.A_DOC_PRIVATE, 60);
    expect(error?.message ?? null, "admin_a/documents/sign-own").toBeNull();
    expect(data?.signedUrl, "admin_a/documents/sign-own produced no URL").toBeTruthy();
  });

  it("a member of another org CANNOT mint a signed URL for a cross-org document", async () => {
    const { data, error } = await adminB.storage.from("documents").createSignedUrl(STORAGE.A_DOC_PRIVATE, 60);
    expect(!data?.signedUrl || !!error, "admin_b/documents/sign-cross-org should be DENIED").toBe(true);
  });
});

describe("public-assets bucket (accepted pilot limitation: public by URL)", () => {
  it("anon MAY read a cover image object directly (documents the accepted limitation)", async () => {
    const { data, error } = await anon.storage.from("public-assets").download(STORAGE.A_COVER);
    expect(error?.message ?? null, "anon/public-assets/download").toBeNull();
    expect(data, "anon/public-assets/download returned no data").toBeTruthy();
  });

  it("only public-assets is a public bucket; submissions and documents are private (basis of the limitation)", async () => {
    const admin = serviceClient();
    const { data } = await admin.storage.listBuckets();
    const byId = new Map((data ?? []).map((b) => [b.id, b.public]));
    expect(byId.get("public-assets"), "public-assets should be a public bucket").toBe(true);
    expect(byId.get("submissions"), "submissions must stay private").toBe(false);
    expect(byId.get("documents"), "documents must stay private").toBe(false);
  });
});
