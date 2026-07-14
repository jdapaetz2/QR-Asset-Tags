import { describe, expect, it } from "vitest";

import {
  PHOTO_HELP_ADDITIONAL,
  PHOTO_HELP_DAMAGE,
  PHOTO_HELP_GENERAL,
  REVIEW_DAMAGE_NO_PHOTO,
  REVIEW_NO_PHOTOS,
  photoSlotHelp,
  reviewDamageNoPhoto,
  reviewNoPhotos,
  omissionDialogTitle,
} from "./photo-copy";
import { DAMAGE_PHOTOS_SLOT_ID as DMG } from "./templates";
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
  });
});

describe("outbound photo copy (Phase 3C.6)", () => {
  const OUTBOUND_STRINGS = [
    photoSlotHelp("overview_photos", true),
    photoSlotHelp("deck_photo", true),
    photoSlotHelp(DMG, true),
    photoSlotHelp("additional_photos", true),
    reviewNoPhotos(true),
    reviewDamageNoPhoto(true),
    omissionDialogTitle("damage", true),
    omissionDialogTitle("none", true),
  ];

  it("frames photos as a departure BASELINE and never hedges", () => {
    expect(photoSlotHelp("overview_photos", true)).toContain("before it leaves the yard");
    expect(photoSlotHelp("deck_photo", true)).toBe(
      "Add a photo showing the deck before the equipment leaves the yard."
    );
    expect(photoSlotHelp(DMG, true)).toContain("existing damage");
    for (const s of OUTBOUND_STRINGS) {
      for (const hedged of ["if possible", "if you can", "where practical", "strongly recommended"]) {
        expect(s).not.toContain(hedged);
      }
    }
  });

  it("uses outbound-specific review + dialog copy (start rental, not submit/return)", () => {
    expect(reviewNoPhotos(true)).toContain("No baseline photos were added");
    expect(reviewDamageNoPhoto(true)).toContain("Existing damage was recorded");
    expect(omissionDialogTitle("none", true)).toBe("Start rental without baseline photos?");
    expect(omissionDialogTitle("damage", true)).toBe("Start rental without damage photos?");
    // Return path unchanged.
    expect(reviewNoPhotos(false)).toBe(REVIEW_NO_PHOTOS);
    expect(reviewDamageNoPhoto(false)).toBe(REVIEW_DAMAGE_NO_PHOTO);
    expect(omissionDialogTitle("none", false)).toBe("Submit without condition photos?");
  });
});
