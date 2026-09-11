import {
  UPLOAD_FAILED_MESSAGE,
  type MediaClaim,
  type PrepareUploadsAction,
} from "@/lib/forms/upload-contract";

/**
 * Browser side of direct photo uploads (see lib/forms/upload-contract.ts). No Supabase SDK: the server returns a
 * complete signed upload URL per photo, and the browser PUTs the file to it. The URL is bound to one path, cannot
 * overwrite, and expires; the server verifies every object before the submission uses it.
 */

export type SelectedPhoto = { slotId: string | null; file: File };

export type DirectUploadResult =
  | { ok: true; submissionId: string; claims: MediaClaim[] }
  | { ok: false; error: string };

export const UPLOAD_CONCURRENCY = 2;

const PHOTO_SLOT_PREFIX = "photo:";
const MEDIA_FIELD = "media";

/** Every non-empty file in the form: the damage/support `media` field and each checklist `photo:<slotId>` field. */
export function collectSelectedPhotos(formData: FormData): SelectedPhoto[] {
  const photos: SelectedPhoto[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" || value.size === 0) continue;
    if (key === MEDIA_FIELD) photos.push({ slotId: null, file: value });
    else if (key.startsWith(PHOTO_SLOT_PREFIX)) photos.push({ slotId: key.slice(PHOTO_SLOT_PREFIX.length), file: value });
  }
  return photos;
}

/** Drop the file fields so the finalize request body carries text only. */
export function stripSelectedPhotos(formData: FormData): void {
  for (const key of new Set(formData.keys())) {
    if (key === MEDIA_FIELD || key.startsWith(PHOTO_SLOT_PREFIX)) formData.delete(key);
  }
}

async function putPhoto(fetchImpl: typeof fetch, url: string, file: File): Promise<boolean> {
  try {
    const res = await fetchImpl(url, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type, "x-upsert": "false" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadPhotosDirect(input: {
  photos: SelectedPhoto[];
  submissionId: string;
  honeypot: string;
  prepare: PrepareUploadsAction;
  onProgress?: (done: number, total: number) => void;
  fetchImpl?: typeof fetch;
  concurrency?: number;
}): Promise<DirectUploadResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const total = input.photos.length;

  let prepared;
  try {
    prepared = await input.prepare({
      submissionId: input.submissionId,
      honeypot: input.honeypot,
      files: input.photos.map((photo) => ({
        slotId: photo.slotId,
        name: photo.file.name,
        size: photo.file.size,
        type: photo.file.type,
      })),
    });
  } catch {
    // Includes a prepare request the platform refused. A redirect thrown by the action navigates regardless.
    return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  }
  if (!prepared || prepared.ok !== true) {
    return { ok: false, error: prepared && "error" in prepared ? prepared.error : UPLOAD_FAILED_MESSAGE };
  }
  // A silent (honeypot) prepare returns no uploads: finalize without media and let the server drop it.
  if (prepared.uploads.length === 0) return { ok: true, submissionId: prepared.submissionId, claims: [] };
  if (
    prepared.uploads.length !== total ||
    prepared.uploads.some((upload, index) => upload.slotId !== input.photos[index].slotId)
  ) {
    return { ok: false, error: UPLOAD_FAILED_MESSAGE };
  }

  let next = 0;
  let done = 0;
  let failed = false;
  input.onProgress?.(0, total);
  const worker = async () => {
    while (!failed) {
      const index = next++;
      if (index >= total) return;
      const ok = await putPhoto(fetchImpl, prepared.uploads[index].signedUrl, input.photos[index].file);
      if (!ok) {
        failed = true;
        return;
      }
      done++;
      input.onProgress?.(done, total);
    }
  };
  const workers = Math.max(1, Math.min(input.concurrency ?? UPLOAD_CONCURRENCY, total));
  await Promise.all(Array.from({ length: workers }, worker));
  if (failed) return { ok: false, error: UPLOAD_FAILED_MESSAGE };

  return {
    ok: true,
    submissionId: prepared.submissionId,
    claims: prepared.uploads.map((upload) => ({ slotId: upload.slotId, path: upload.path })),
  };
}
