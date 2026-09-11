import type { InspectionField, PhotoAnswer } from "@/lib/inspections/types";
import type { VerifiedMedia } from "@/lib/forms/media-verify";
import { MEDIA_VERIFY_FAILED_MESSAGE, type MediaClaim } from "@/lib/forms/upload-contract";

/**
 * Slot rules for photos a checklist uploaded directly to storage (lib/forms/upload-contract.ts). Pure.
 *
 * The browser may claim photos only for slots that are VISIBLE for the submitted answers, within each slot's
 * maximum — the same rules the file-upload path applies to `photo:<slotId>` files.
 */

export const TOTAL_TOO_LARGE_MESSAGE = "Photos total more than 40 MB — remove some and try again.";

export function checkClaimSlots(slots: InspectionField[], claims: MediaClaim[]): string | null {
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const counts = new Map<string, number>();
  for (const claim of claims) {
    const slot = claim.slotId ? byId.get(claim.slotId) : undefined;
    if (!slot) return MEDIA_VERIFY_FAILED_MESSAGE;
    counts.set(slot.id, (counts.get(slot.id) ?? 0) + 1);
  }
  for (const slot of slots) {
    const max = slot.photo?.maxPhotos ?? 6;
    if ((counts.get(slot.id) ?? 0) > max) return `"${slot.label}" allows at most ${max} photos.`;
  }
  return null;
}

/** Verified photos grouped per slot in template order (claim order within a slot), plus the flat path list. */
export function groupVerifiedPhotos(
  slots: InspectionField[],
  media: VerifiedMedia[]
): { photos: Record<string, PhotoAnswer[]>; mediaPaths: string[] } {
  const photos: Record<string, PhotoAnswer[]> = {};
  const mediaPaths: string[] = [];
  for (const slot of slots) {
    const list = media.filter((item) => item.slotId === slot.id).map((item) => ({ path: item.path, caption: slot.label }));
    if (list.length === 0) continue;
    photos[slot.id] = list;
    mediaPaths.push(...list.map((photo) => photo.path));
  }
  return { photos, mediaPaths };
}
