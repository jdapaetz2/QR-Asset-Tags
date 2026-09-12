import { isStoredImage } from "@/lib/media/classify";

/**
 * Without JavaScript nothing prepares photos on the device, so photos posted in a request body are stored only when
 * their bytes are a web-safe image of the declared type within the size limits (lib/media/classify.ts). Every file is
 * checked before any is stored. Returns each file's bytes for the upload, or null when any file fails.
 */
export async function readNoJsPhotoBytes<T extends { type: string; arrayBuffer(): Promise<ArrayBuffer> }>(
  files: readonly T[]
): Promise<Map<T, Uint8Array> | null> {
  const bytesByFile = new Map<T, Uint8Array>();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isStoredImage(bytes, file.type)) return null;
    bytesByFile.set(file, bytes);
  }
  return bytesByFile;
}
