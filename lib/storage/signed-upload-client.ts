import { FILE_UPLOAD_FAILED_MESSAGE, type PrepareSingleUploadAction } from "@/lib/storage/direct-upload";

/**
 * Browser side of direct uploads. No Supabase SDK: the server returns a complete signed upload URL bound to one path
 * (no overwrite, expiring), and the browser PUTs the file to it. The server verifies the stored object before use.
 */

/** PUT one file to a server-issued signed upload URL. */
export async function putFileToSignedUrl(url: string, file: Blob, fetchImpl: typeof fetch = fetch): Promise<boolean> {
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

export type SingleUploadResult = { ok: true; path: string } | { ok: false; error: string };

/** Prepare (server) → PUT (browser) for one file. Returns the uploaded path for the save action to verify. */
export async function uploadFileDirect(input: {
  file: File;
  prepare: PrepareSingleUploadAction;
  fetchImpl?: typeof fetch;
}): Promise<SingleUploadResult> {
  let prepared;
  try {
    prepared = await input.prepare({ name: input.file.name, size: input.file.size, type: input.file.type });
  } catch {
    // Includes a prepare request the platform refused. A redirect thrown by the action navigates regardless.
    return { ok: false, error: FILE_UPLOAD_FAILED_MESSAGE };
  }
  if (!prepared || prepared.ok !== true) {
    return { ok: false, error: prepared && "error" in prepared ? prepared.error : FILE_UPLOAD_FAILED_MESSAGE };
  }
  if (!(await putFileToSignedUrl(prepared.signedUrl, input.file, input.fetchImpl ?? fetch))) {
    return { ok: false, error: FILE_UPLOAD_FAILED_MESSAGE };
  }
  return { ok: true, path: prepared.path };
}
