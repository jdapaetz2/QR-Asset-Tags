import { describe, expect, it } from "vitest";

import { galleryBySource, galleryPhotoCount } from "./photo-gallery";
import type { PhotoSlotGroup } from "./session-comparison";

const groups: PhotoSlotGroup[] = [
  { source: "outbound", slotId: "front_hitch_photo", label: "Front / hitch", paths: ["a.jpg", "b.jpg"] },
  // Same path reused in another outbound slot → dedupe + merge labels.
  { source: "outbound", slotId: "deck_photo", label: "Deck", paths: ["a.jpg"] },
  { source: "staff", slotId: "damage_photos", label: "Damage photos", paths: ["c.jpg", "c.jpg"] },
  { source: "renter", slotId: "additional_photos", label: "Additional photos", paths: ["d.jpg"] },
];

describe("galleryBySource", () => {
  it("groups by source in outbound → renter → staff order", () => {
    const g = galleryBySource(groups);
    expect(g.map((s) => s.source)).toEqual(["outbound", "renter", "staff"]);
  });

  it("dedupes an exact repeated path within a source and merges its slot labels", () => {
    const outbound = galleryBySource(groups).find((s) => s.source === "outbound")!;
    const tileA = outbound.tiles.find((t) => t.path === "a.jpg")!;
    expect(tileA.labels).toEqual(["Front / hitch", "Deck"]); // one tile, both captions
    expect(outbound.tiles.map((t) => t.path)).toEqual(["a.jpg", "b.jpg"]); // a.jpg appears once
  });

  it("dedupes an identical path repeated within one slot", () => {
    const staff = galleryBySource(groups).find((s) => s.source === "staff")!;
    expect(staff.tiles).toHaveLength(1);
    expect(staff.tiles[0].path).toBe("c.jpg");
  });

  it("counts unique tiles across sources", () => {
    // a.jpg, b.jpg (outbound) + d.jpg (renter) + c.jpg (staff) = 4 unique.
    expect(galleryPhotoCount(galleryBySource(groups))).toBe(4);
  });

  it("omits sources with no photos and returns [] for no groups", () => {
    expect(galleryBySource([])).toEqual([]);
    expect(galleryPhotoCount([])).toBe(0);
  });
});
