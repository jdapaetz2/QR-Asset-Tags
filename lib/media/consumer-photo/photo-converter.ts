import type { EncodeTarget } from "@/lib/media/photo-policy";
import type { ConvertResult, PhotoConverter } from "@/lib/media/consumer-photo/prepare-photos";

/**
 * Browser photo conversion (Engineering Phase D4.1): the static worker in public/workers/photo-worker.js, fetched only
 * when a picked photo needs converting, with a main-thread canvas fallback for browsers that cannot run it. The worker
 * loads the HEIC decoder (public/vendor/libheif/) only when the browser cannot decode a HEIC itself.
 */

export const PHOTO_WORKER_URL = "/workers/photo-worker.js";
export const CONVERT_TIMEOUT_MS = 45_000;

type WorkerReply = { id: number; ok: true; blob: Blob } | { id: number; ok: false; reason: string };

export type PhotoConverterHandle = { convert: PhotoConverter; dispose(): void };

/** The output size for a source of `width` × `height` within the target's pixel and edge limits. Mirrors the worker. */
export function fitWithin(width: number, height: number, target: Pick<EncodeTarget, "maxPixels" | "maxEdge">) {
  const scale = Math.min(1, Math.sqrt(target.maxPixels / (width * height)), target.maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

async function decodeOnMainThread(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    if (!(error instanceof TypeError)) return null;
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

async function convertOnMainThread(file: Blob, target: EncodeTarget): Promise<ConvertResult> {
  const bitmap = await decodeOnMainThread(file);
  if (!bitmap) return { ok: false, reason: "decode" };
  try {
    const size = fitWithin(bitmap.width, bitmap.height, target);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, reason: "encode" };
    if (target.type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, target.type, target.quality));
    // Release the canvas backing store now; Safari counts it against a small total.
    canvas.width = 0;
    canvas.height = 0;
    return blob ? { ok: true, blob } : { ok: false, reason: "encode" };
  } finally {
    bitmap.close();
  }
}

export function createPhotoConverter(): PhotoConverterHandle {
  let worker: Worker | null = null;
  let workerUnavailable = typeof Worker === "undefined";
  let nextId = 0;
  const pending = new Map<number, (reply: WorkerReply | "unavailable") => void>();

  const stopWorker = () => {
    worker?.terminate();
    worker = null;
  };

  function ensureWorker(): Worker {
    if (!worker) {
      const created = new Worker(PHOTO_WORKER_URL);
      created.onmessage = (event: MessageEvent<WorkerReply>) => {
        const resolve = pending.get(event.data.id);
        pending.delete(event.data.id);
        resolve?.(event.data);
      };
      // A worker that cannot load at all: fall back to the main thread for this and later photos.
      created.onerror = () => {
        for (const resolve of pending.values()) resolve("unavailable");
        pending.clear();
        stopWorker();
      };
      worker = created;
    }
    return worker;
  }

  function convertInWorker(job: Parameters<PhotoConverter>[0]): Promise<ConvertResult | "unavailable"> {
    return new Promise((resolve) => {
      let instance: Worker;
      try {
        instance = ensureWorker();
      } catch {
        resolve("unavailable");
        return;
      }
      const id = ++nextId;
      const finish = (result: ConvertResult | "unavailable") => {
        clearTimeout(timer);
        job.signal.removeEventListener("abort", onAbort);
        pending.delete(id);
        resolve(result);
      };
      // A stuck decode (or a cancel) ends the worker; the next photo starts a fresh one.
      const timer = setTimeout(() => {
        stopWorker();
        finish({ ok: false, reason: "timeout" });
      }, CONVERT_TIMEOUT_MS);
      const onAbort = () => {
        stopWorker();
        finish({ ok: false, reason: "decode" });
      };
      job.signal.addEventListener("abort", onAbort, { once: true });
      pending.set(id, (reply) => {
        if (reply === "unavailable" || (!reply.ok && reply.reason === "unsupported")) finish("unavailable");
        else if (reply.ok) finish({ ok: true, blob: reply.blob });
        else finish({ ok: false, reason: reply.reason === "too-large" || reply.reason === "encode" ? reply.reason : "decode" });
      });
      instance.postMessage({ id, blob: job.file, kind: job.kind, target: job.target });
    });
  }

  const convert: PhotoConverter = async (job) => {
    if (!workerUnavailable) {
      const result = await convertInWorker(job);
      if (result !== "unavailable") return result;
      workerUnavailable = true;
    }
    return convertOnMainThread(job.file, job.target);
  };

  return {
    convert,
    dispose() {
      pending.clear();
      stopWorker();
    },
  };
}
