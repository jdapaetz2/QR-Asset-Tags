import { describe, expect, it } from "vitest";

import { checkClaimSlots, groupVerifiedPhotos } from "./claimed-photos";
import { MEDIA_VERIFY_FAILED_MESSAGE } from "@/lib/forms/upload-contract";
import type { InspectionField } from "./types";

const SLOTS: InspectionField[] = [
  { id: "overall", type: "photo_slot", label: "Overall", photo: { minPhotos: 0, maxPhotos: 2 } },
  { id: "damage_photos", type: "photo_slot", label: "Damage photos" },
];

describe("checkClaimSlots", () => {
  it("accepts claims for visible slots within their maximum", () => {
    expect(
      checkClaimSlots(SLOTS, [
        { slotId: "overall", path: "a" },
        { slotId: "damage_photos", path: "b" },
      ])
    ).toBeNull();
  });

  it("refuses a claim for a hidden, unknown or missing slot", () => {
    expect(checkClaimSlots(SLOTS, [{ slotId: "hidden_slot", path: "a" }])).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
    expect(checkClaimSlots(SLOTS, [{ slotId: null, path: "a" }])).toBe(MEDIA_VERIFY_FAILED_MESSAGE);
  });

  it("enforces the per-slot maximum (default 6)", () => {
    expect(checkClaimSlots(SLOTS, ["a", "b", "c"].map((path) => ({ slotId: "overall", path })))).toBe(
      '"Overall" allows at most 2 photos.'
    );
    expect(
      checkClaimSlots(SLOTS, Array.from({ length: 7 }, (_, i) => ({ slotId: "damage_photos", path: `p${i}` })))
    ).toBe('"Damage photos" allows at most 6 photos.');
  });
});

describe("groupVerifiedPhotos", () => {
  it("groups per slot in template order, keeping claim order within a slot", () => {
    const media = [
      { slotId: "damage_photos", path: "d1", size: 1, type: "image/jpeg" },
      { slotId: "overall", path: "o1", size: 1, type: "image/jpeg" },
      { slotId: "overall", path: "o2", size: 1, type: "image/png" },
    ];
    expect(groupVerifiedPhotos(SLOTS, media)).toEqual({
      photos: {
        overall: [
          { path: "o1", caption: "Overall" },
          { path: "o2", caption: "Overall" },
        ],
        damage_photos: [{ path: "d1", caption: "Damage photos" }],
      },
      mediaPaths: ["o1", "o2", "d1"],
    });
  });
});
