import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailAttachment, IncidentPreviews, PreviewFigure } from "@/lib/notifications/email";
import { isPreviewPath, type PreviewCandidate } from "@/lib/notifications/projection";
import { transformPreview, type PreviewImageResult } from "@/lib/notifications/preview-image";
import { MAX_PREVIEWS_PER_EMAIL } from "@/lib/notifications/routing";
import {
  PREVIEW_BUDGET_MS,
  PREVIEW_CONCURRENCY,
  PREVIEW_MAX_INPUT_BYTES,
  PREVIEW_MAX_TOTAL_BYTES,
  type PreviewFailureClass,
} from "@/lib/notifications/preview-limits";

/**
 * Engineering Phase D4 — build the bounded inline preview set for ONE notification. Server-only; called once per
 * submission notification inside the deferred `after()` work, before any recipient is sent to, so every route gets the
 * identical sanitized set and a provider retry resends an identical body under the same idempotency key.
 *
 * Storage is injected (`notify.ts` passes its allowlisted admin client through `submissionPreviewStorage`), so this
 * module holds no service-role client of its own. Every candidate path is re-checked against the submission's own
 * canonical prefix immediately before it is read. No signed URL is created, no object is written or deleted, and no
 * path, filename or content is logged — the caller logs counts and one coarse failure class.
 *
 * Any failure omits that preview only. All failing yields an empty set and the email goes out text-only.
 */

export const SUBMISSIONS_BUCKET = "submissions";

export type StorageLookup = { status: "ok"; size: number | null } | { status: "missing" } | { status: "error" };
export type StorageFetch = { status: "ok"; blob: Blob } | { status: "missing" } | { status: "error" };

export type PreviewStorage = {
  info(path: string): Promise<StorageLookup>;
  download(path: string): Promise<StorageFetch>;
};

export type PreviewOwner = { organizationId: string; assetId: string; submissionId: string };

export type BuiltPreviews = IncidentPreviews & {
  attached: number;
  failureClass: PreviewFailureClass | null;
  transformMs: number;
  totalBytes: number;
};

type Outcome =
  | { ok: true; image: Extract<PreviewImageResult, { ok: true }> }
  | { ok: false; failureClass: PreviewFailureClass };

const failed = (failureClass: PreviewFailureClass): Outcome => ({ ok: false, failureClass });

/** The empty set recorded when preview building itself could not run. */
export function failedPreviews(requested: number): BuiltPreviews {
  return {
    requested,
    attached: 0,
    figures: [],
    attachments: [],
    failureClass: "exception",
    transformMs: 0,
    totalBytes: 0,
  };
}

function isNotFound(error: unknown): boolean {
  const e = (error ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown };
  return (
    e.status === 404 ||
    String(e.statusCode) === "404" ||
    (typeof e.message === "string" && /not.?found/i.test(e.message))
  );
}

/** Read-only access to the private submissions bucket through the caller's trusted server client. */
export function submissionPreviewStorage(client: SupabaseClient): PreviewStorage {
  const bucket = () => client.storage.from(SUBMISSIONS_BUCKET);
  return {
    async info(path) {
      try {
        const { data, error } = await bucket().info(path);
        if (error) return isNotFound(error) ? { status: "missing" } : { status: "error" };
        const size = (data as { size?: unknown } | null)?.size;
        return { status: "ok", size: typeof size === "number" && Number.isFinite(size) ? size : null };
      } catch {
        return { status: "error" };
      }
    },
    async download(path) {
      try {
        const { data, error } = await bucket().download(path);
        if (error) return isNotFound(error) ? { status: "missing" } : { status: "error" };
        return data ? { status: "ok", blob: data } : { status: "missing" };
      } catch {
        return { status: "error" };
      }
    },
  };
}

/** Resolve `work`, or a `time_budget` failure once `ms` has elapsed. The late result is discarded. */
function withinBudget(work: Promise<Outcome>, ms: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(failed("time_budget")), ms);
    work.then(
      (outcome) => {
        clearTimeout(timer);
        resolve(outcome);
      },
      () => {
        clearTimeout(timer);
        resolve(failed("exception"));
      }
    );
  });
}

export async function buildPreviews(input: {
  /** Already ranked and capped by the projection (lib/notifications/projection.ts). */
  candidates: PreviewCandidate[];
  /** How many previews the organization's switch allows for this email (routing.previewRequestCount). */
  requested: number;
  owner: PreviewOwner;
  storage: PreviewStorage;
  now?: () => number;
  budgetMs?: number;
  concurrency?: number;
  transform?: (bytes: Uint8Array) => Promise<PreviewImageResult>;
}): Promise<BuiltPreviews> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + (input.budgetMs ?? PREVIEW_BUDGET_MS);
  const requested = Number.isFinite(input.requested) ? Math.max(0, Math.trunc(input.requested)) : 0;
  const candidates = input.candidates.slice(0, Math.min(requested, MAX_PREVIEWS_PER_EMAIL));
  const transform = input.transform ?? ((bytes: Uint8Array) => transformPreview(bytes));

  const one = async (candidate: PreviewCandidate): Promise<Outcome> => {
    try {
      if (!isPreviewPath(candidate.path, input.owner)) return failed("path_rejected");
      const info = await input.storage.info(candidate.path);
      if (info.status !== "ok") return failed(info.status === "missing" ? "missing_object" : "download_failed");
      if (info.size !== null && info.size > PREVIEW_MAX_INPUT_BYTES) return failed("too_large_input");
      const fetched = await input.storage.download(candidate.path);
      if (fetched.status !== "ok") return failed(fetched.status === "missing" ? "missing_object" : "download_failed");
      if (fetched.blob.size > PREVIEW_MAX_INPUT_BYTES) return failed("too_large_input");
      const image = await transform(new Uint8Array(await fetched.blob.arrayBuffer()));
      return image.ok ? { ok: true, image } : failed(image.failureClass);
    } catch {
      return failed("exception");
    }
  };

  const outcomes: Outcome[] = new Array(candidates.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= candidates.length) return;
      const remaining = deadline - now();
      outcomes[index] = remaining <= 0 ? failed("time_budget") : await withinBudget(one(candidates[index]), remaining);
    }
  };
  const workers = Math.max(1, Math.min(input.concurrency ?? PREVIEW_CONCURRENCY, candidates.length));
  if (candidates.length > 0) await Promise.all(Array.from({ length: workers }, worker));

  // Assemble in rank order, numbering only what survived, within the total byte budget.
  const attachments: EmailAttachment[] = [];
  const figures: PreviewFigure[] = [];
  let failureClass: PreviewFailureClass | null = null;
  let totalBytes = 0;
  candidates.forEach((candidate, index) => {
    const outcome = outcomes[index] ?? failed("time_budget");
    if (!outcome.ok) {
      failureClass ??= outcome.failureClass;
      return;
    }
    if (totalBytes + outcome.image.bytes > PREVIEW_MAX_TOTAL_BYTES) {
      failureClass ??= "total_budget";
      return;
    }
    const n = attachments.length + 1;
    const contentId = `mm-preview-${n}@mulemark`;
    attachments.push({
      filename: `incident-photo-${n}.jpg`,
      contentType: "image/jpeg",
      contentId,
      content: outcome.image.jpeg,
    });
    figures.push({ contentId, label: candidate.label, width: outcome.image.width, height: outcome.image.height });
    totalBytes += outcome.image.bytes;
  });

  return {
    requested: candidates.length,
    attached: attachments.length,
    figures,
    attachments,
    failureClass,
    transformMs: Math.max(0, Math.round(now() - startedAt)),
    totalBytes,
  };
}
