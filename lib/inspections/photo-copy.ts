/**
 * Renter/staff-facing photo guidance copy (Phase 3C.4; outbound variants 3C.6). Centralized so the renderer,
 * review warnings, and the omission dialog all read from one place and stay consistent regardless of a
 * template's stored `help`.
 *
 * Tone: direct + expectation-setting ("Add a photo showing…") — never hedged ("if possible", "if you can",
 * "where practical", "strongly recommended") and never a legal/mandatory claim. Photos remain OPTIONAL; the copy
 * sets an expectation, the omission-confirmation flow keeps them skippable. An outbound (pre-use) inspection
 * frames everything around the BASELINE condition before the equipment leaves the yard.
 */
import { ADDITIONAL_PHOTOS_SLOT_ID, DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";

// Return / renter-facing copy.
export const PHOTO_HELP_GENERAL =
  "Add a photo showing the equipment's condition. This helps the rental team verify the return and reduces follow-up questions.";
export const PHOTO_HELP_DAMAGE =
  "Add clear photos of the damage so the rental team can assess it faster.";
export const PHOTO_HELP_ADDITIONAL =
  "Add any other photos that help show the equipment's condition.";
export const REVIEW_NO_PHOTOS =
  "No condition photos were added. Add photos to help the rental team verify the return, or continue without them.";
export const REVIEW_DAMAGE_NO_PHOTO =
  "Damage was reported without photos. Add clear photos to help the rental team assess it, or continue without them.";

// Outbound (pre-use) baseline copy.
export const OUTBOUND_HELP_GENERAL =
  "Add a photo showing the equipment's condition before it leaves the yard. This creates a clear baseline for the rental.";
export const OUTBOUND_HELP_DAMAGE =
  "Add clear photos of the existing damage so its starting condition is documented.";
export const OUTBOUND_HELP_ADDITIONAL =
  "Add any other photos that help document the equipment's condition at departure.";
export const OUTBOUND_REVIEW_NO_PHOTOS =
  "No baseline photos were added. Add photos to document the equipment's condition before it leaves the yard, or continue without them.";
export const OUTBOUND_REVIEW_DAMAGE_NO_PHOTO =
  "Existing damage was recorded, but no damage photos were added. Add photos to document the starting condition, or continue without them.";

/** Named object phrases for the template-specific overview photo slots. `plural` picks its/their. */
const SLOT_OBJECT: Record<string, { object: string; plural?: boolean }> = {
  front_hitch_photo: { object: "front and hitch", plural: true },
  deck_photo: { object: "deck" },
  attachment_photo: { object: "attachment" },
  equipment_case_photo: { object: "equipment and case", plural: true },
  overall_photo: { object: "equipment" },
};

/** Approved guidance for a photo slot, keyed by its stable slot id + the inspection direction. */
export function photoSlotHelp(slotId: string, isOutbound = false): string {
  if (slotId === DAMAGE_PHOTOS_SLOT_ID) return isOutbound ? OUTBOUND_HELP_DAMAGE : PHOTO_HELP_DAMAGE;
  if (slotId === ADDITIONAL_PHOTOS_SLOT_ID)
    return isOutbound ? OUTBOUND_HELP_ADDITIONAL : PHOTO_HELP_ADDITIONAL;
  const named = SLOT_OBJECT[slotId];
  if (named) {
    return isOutbound
      ? `Add a photo showing the ${named.object} before the equipment leaves the yard.`
      : `Add a photo showing the ${named.object} so the rental team can verify ${
          named.plural ? "their" : "its"
        } condition.`;
  }
  return isOutbound ? OUTBOUND_HELP_GENERAL : PHOTO_HELP_GENERAL;
}

/** Review-step + omission-dialog body when no photos were added. */
export function reviewNoPhotos(isOutbound = false): string {
  return isOutbound ? OUTBOUND_REVIEW_NO_PHOTOS : REVIEW_NO_PHOTOS;
}

/** Review-step + omission-dialog body when damage was reported without a damage photo. */
export function reviewDamageNoPhoto(isOutbound = false): string {
  return isOutbound ? OUTBOUND_REVIEW_DAMAGE_NO_PHOTO : REVIEW_DAMAGE_NO_PHOTO;
}

/** Omission-dialog title, keyed by which warning applies + direction. */
export function omissionDialogTitle(kind: "damage" | "none", isOutbound = false): string {
  if (isOutbound) {
    return kind === "damage"
      ? "Start rental without damage photos?"
      : "Start rental without baseline photos?";
  }
  return kind === "damage"
    ? "Submit damage report without photos?"
    : "Submit without condition photos?";
}
