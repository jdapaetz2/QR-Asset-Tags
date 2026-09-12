import { CLASSIFY_BYTES, classifyImageBytes, readImageDimensions } from "@/lib/media/classify";
import { SNIFF_BYTES, sniffImageType } from "@/lib/media/sniff";
import {
  PHOTO_REFUSAL_MESSAGES,
  decidePhoto,
  type EncodeTarget,
  type PhotoProfile,
  type RefusalReason,
} from "@/lib/media/photo-policy";

/**
 * Turns picked files into photos the upload flows can store (Engineering Phase D4.1). Runs in the browser; the
 * conversion itself is injected (lib/media/consumer-photo/photo-converter.ts) so this orchestration is unit-tested.
 *
 * Photos are prepared one at a time in selection order, so only one full-size decode is in memory. Each result stands
 * alone: a photo that cannot be prepared is reported with guidance and the others carry on. Kept and converted files
 * get a generic name and the type their bytes prove.
 */

export type ConvertFailure = "decode" | "too-large" | "encode" | "timeout";

export type ConvertResult = { ok: true; blob: Blob } | { ok: false; reason: ConvertFailure };

export type PhotoConverter = (job: {
  file: Blob;
  kind: string;
  target: EncodeTarget;
  signal: AbortSignal;
}) => Promise<ConvertResult>;

export type PreparedPhoto = { ok: true; file: File; converted: boolean } | { ok: false; name: string; message: string };

export class PhotoPreparationAborted extends Error {
  constructor() {
    super("Photo preparation was cancelled.");
    this.name = "AbortError";
  }
}

const OUTPUT_EXTENSION = { "image/jpeg": "jpg", "image/png": "png" } as const;

export async function preparePhotos(
  files: readonly File[],
  profile: PhotoProfile,
  options: { convert: PhotoConverter; signal: AbortSignal; onProgress?: (done: number, total: number) => void }
): Promise<PreparedPhoto[]> {
  const results: PreparedPhoto[] = [];
  for (const [index, file] of files.entries()) {
    if (options.signal.aborted) throw new PhotoPreparationAborted();
    options.onProgress?.(index, files.length);
    results.push(await prepareOne(file, index, profile, options));
  }
  if (options.signal.aborted) throw new PhotoPreparationAborted();
  options.onProgress?.(files.length, files.length);
  return results;
}

async function prepareOne(
  file: File,
  index: number,
  profile: PhotoProfile,
  options: { convert: PhotoConverter; signal: AbortSignal }
): Promise<PreparedPhoto> {
  const refuse = (reason: RefusalReason): PreparedPhoto => ({
    ok: false,
    name: file.name,
    message: PHOTO_REFUSAL_MESSAGES[reason],
  });
  const named = (extension: string) => `photo-${index + 1}.${extension}`;

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, CLASSIFY_BYTES).arrayBuffer());
  } catch {
    return refuse("unsupported");
  }
  const image = classifyImageBytes(head);
  const decision = decidePhoto(
    { image, dimensions: readImageDimensions(head), size: file.size, name: file.name },
    profile
  );
  if (decision.action === "refuse") return refuse(decision.reason);
  if (decision.action === "keep") {
    return {
      ok: true,
      converted: false,
      file: new File([file], named(decision.extension), { type: decision.type, lastModified: file.lastModified }),
    };
  }

  for (const target of profile.targets) {
    const result = await options.convert({ file, kind: image.kind ?? "", target, signal: options.signal });
    if (options.signal.aborted) throw new PhotoPreparationAborted();
    if (!result.ok) {
      if (result.reason === "encode") continue;
      return refuse(result.reason === "decode" ? "unsupported" : result.reason);
    }
    if (result.blob.size === 0 || result.blob.size > profile.maxBytes) continue;
    // Trust the output no more than the input: it must be the requested type by its bytes.
    const outputHead = new Uint8Array(await result.blob.slice(0, SNIFF_BYTES).arrayBuffer());
    if (`image/${sniffImageType(outputHead)}` !== target.type) continue;
    return {
      ok: true,
      converted: true,
      file: new File([result.blob], named(OUTPUT_EXTENSION[target.type]), {
        type: target.type,
        lastModified: file.lastModified,
      }),
    };
  }
  return refuse("too-large");
}
