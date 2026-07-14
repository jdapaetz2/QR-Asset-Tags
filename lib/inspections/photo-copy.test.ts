import { describe, expect, it } from "vitest";

import {
  PHOTO_HELP_ADDITIONAL,
  PHOTO_HELP_DAMAGE,
  PHOTO_HELP_GENERAL,
  REVIEW_DAMAGE_NO_PHOTO,
  REVIEW_NO_PHOTOS,
  photoSlotHelp,
} from "./photo-copy";
import { ADDITIONAL_PHOTOS_SLOT_ID, DAMAGE_PHOTOS_SLOT_ID } from "./templates";

const ALL_COPY = [
  PHOTO_HELP_GENERAL,
  PHOTO_HELP_DAMAGE,
  PHOTO_HELP_ADDITIONAL,
  REVIEW_NO_PHOTOS,
  REVIEW_DAMAGE_NO_PHOTO,
  photoSlotHelp("front_hitch_photo"),
  photoSlotHelp("deck_photo"),
];
const HEDGED = ["if possible", "if you can", "where practical", "strongly recommended", "Photo's"];

describe("photo-copy — direct, non-hedged, expectation-setting", () => {
  it("no approved string uses hedged/legacy phrasing", () => {
    for (const copy of ALL_COPY) {
      for (const phrase of HEDGED) expect(copy).not.toContain(phrase);
    }
  });

  it("never claims photos are required/mandatory", () => {
    for (const copy of ALL_COPY) {
      expect(copy.toLowerCase()).not.toContain("required");
      expect(copy.toLowerCase()).not.toContain("must ");
    }
  });

  it("uses the approved general/damage/additional copy", () => {
    expect(PHOTO_HELP_GENERAL).toContain("Add a photo showing the equipment's condition");
    expect(PHOTO_HELP_DAMAGE).toBe(
      "Add clear photos of the damage so the rental team can assess it faster."
    );
    expect(PHOTO_HELP_ADDITIONAL).toBe(
      "Add any other photos that help show the equipment's condition."
    );
  });

  it("uses the approved review warnings (soft: 'or continue without them')", () => {
    expect(REVIEW_NO_PHOTOS).toContain("No condition photos were added");
    expect(REVIEW_NO_PHOTOS).toContain("or continue without them");
    expect(REVIEW_DAMAGE_NO_PHOTO).toContain("Damage was reported without photos");
    expect(REVIEW_DAMAGE_NO_PHOTO).toContain("or continue without them");
  });
});

describe("photoSlotHelp — per-slot routing", () => {
  it("routes damage + additional slots to their copy", () => {
    expect(photoSlotHelp(DAMAGE_PHOTOS_SLOT_ID)).toBe(PHOTO_HELP_DAMAGE);
    expect(photoSlotHelp(ADDITIONAL_PHOTOS_SLOT_ID)).toBe(PHOTO_HELP_ADDITIONAL);
  });

  it("gives named object slots a direct, object-specific line", () => {
    expect(photoSlotHelp("front_hitch_photo")).toBe(
      "Add a photo showing the front and hitch so the rental team can verify their condition."
    );
    expect(photoSlotHelp("deck_photo")).toBe(
      "Add a photo showing the deck so the rental team can verify its condition."
    );
  });

  it("falls back to the general condition copy for unknown slots", () => {
    expect(photoSlotHelp("overview_photos")).toBe(PHOTO_HELP_GENERAL);
    expect(photoSlotHelp("overall_photo")).toBe(PHOTO_HELP_GENERAL);
  });
});
