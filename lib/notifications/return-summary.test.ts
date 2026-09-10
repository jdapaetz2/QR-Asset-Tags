import { describe, expect, it } from "vitest";

import { summarizeReturnChecklist } from "./return-summary";
import {
  CLEAN_FLAGS,
  cleanGeneratorValues,
  customTemplate,
  photo,
  returnRowV1,
  returnRowV2,
  templateV2_20260701Initial,
  templateV2_20260701WithAdditional,
  templateV2_20260702,
} from "./__fixtures__/rows";

function summarize(row: { submission_data_json: unknown }) {
  return summarizeReturnChecklist(row.submission_data_json);
}

describe("V1 flat checklists", () => {
  it("reads damage and missing accessories from the flat keys", () => {
    const s = summarize(returnRowV1({ damage_observed: "yes", accessories_returned: "no", condition_notes: "x" }));
    expect(s).toMatchObject({ shape: "v1", damage: true, accessoriesMissing: true, failedRequired: [] });
  });

  it("is clean when the flat keys say so", () => {
    const s = summarize(returnRowV1({ damage_observed: "no", accessories_returned: "yes" }));
    expect(s).toMatchObject({ damage: false, accessoriesMissing: false });
  });

  it("treats an unrecognizable payload as clean rather than throwing", () => {
    expect(summarizeReturnChecklist(null)).toMatchObject({ shape: "v1", damage: false });
    expect(summarizeReturnChecklist({ schema_version: 2, template_snapshot: "nope" })).toMatchObject({ shape: "v1" });
  });
});

describe("V2 2026-07-1 (first shipped, no additional photos)", () => {
  it("reads damage details and orders the damage slot first", () => {
    const template = templateV2_20260701Initial();
    const s = summarize(
      returnRowV2({
        template,
        values: {
          ...cleanGeneratorValues(),
          damage_observed: "yes",
          damage_location: "left side panel",
          damage_severity: "severe",
          damage_description: "Dented and scraped.",
        },
        flags: { damage_observed: "yes", accessories_missing: false },
        photos: {
          overall_photo: [photo("Overall photo", "overall-1")],
          damage_photos: [photo("Damage photos", "damage-1"), photo("Damage photos", "damage-2")],
        },
      })
    );
    expect(s.shape).toBe("v2");
    expect(s.damage).toBe(true);
    expect(s.damageLocation).toBe("left side panel");
    expect(s.damageSeverityLabel).toBe("Severe");
    expect(s.damageDescription).toBe("Dented and scraped.");
    expect(s.slotCounts).toEqual([
      { label: "Damage photos", count: 2 },
      { label: "Overall photo", count: 1 },
    ]);
    expect(s.slotPaths[0]).toContain("damage-1");
    // No photo-gap keys existed yet: absent means not reported, never inferred.
    expect(s).toMatchObject({ damagePhotosMissing: false, conditionPhotosMissing: false, missingRecommendedPhotos: false });
  });
});

describe("V2 2026-07-1 with the additional-photos section", () => {
  it("counts additional photos in template order", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260701WithAdditional(),
        values: cleanGeneratorValues(),
        flags: CLEAN_FLAGS,
        photos: {
          additional_photos: [photo("Additional photos", "extra-1")],
          overall_photo: [photo("Overall photo", "overall-1")],
        },
      })
    );
    expect(s.slotCounts.map((slot) => slot.label)).toEqual(["Overall photo", "Additional photos"]);
  });
});

describe("V2 2026-07-2", () => {
  it("before the hotfix: reads damage_photos_missing", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260702(),
        values: { ...cleanGeneratorValues(), damage_observed: "yes", damage_location: "x", damage_severity: "minor", damage_description: "y" },
        flags: { damage_observed: "yes", accessories_missing: false, damage_photos_missing: true },
        extra: { damage_photo_omission_acknowledged: true },
      })
    );
    expect(s.damagePhotosMissing).toBe(true);
    expect(s.conditionPhotosMissing).toBe(false);
  });

  it("after the hotfix: reads condition photos and missing recommended slots", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260702(),
        values: cleanGeneratorValues(),
        flags: { ...CLEAN_FLAGS, damage_photos_missing: false, condition_photos_missing: false },
        photos: { additional_photos: [photo("Additional photos", "extra-1")] },
        extra: { missing_recommended_photo_slots: ["overall_photo"], photo_omission_acknowledged: true },
      })
    );
    expect(s.missingRecommendedPhotos).toBe(true);
    expect(s.missingRecommendedSlotLabels).toEqual(["Overall photo"]);
  });

  it("collects failed required checks, operating answers and missing accessory names", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260702(),
        values: {
          ...cleanGeneratorValues(),
          oil_level: "fail",
          starts_operates: "no",
          accessories: { cords: "missing", wheel_kit: "returned", manual: "na" },
        },
        flags: { damage_observed: "no", accessories_missing: true },
      })
    );
    expect(s.failedRequired).toEqual(["Oil level"]);
    expect(s.failedOptional).toEqual([]);
    expect(s.notOperating).toEqual(["Starts / operates?"]);
    expect(s.accessoriesMissing).toBe(true);
    expect(s.missingAccessoryLabels).toEqual(["Cords"]);
  });

  it("reads powers_on on electrical test equipment", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260702("electrical_test_equipment"),
        values: { powers_on: "no", leads_probes: "pass", case_screen: "pass", battery_charge: "pass", calibration_sticker: "yes", damage_observed: "no" },
        flags: CLEAN_FLAGS,
      })
    );
    expect(s.notOperating).toEqual(["Powers on?"]);
  });

  it("ignores stored damage details when damage was not reported", () => {
    const s = summarize(
      returnRowV2({
        template: templateV2_20260702(),
        values: { ...cleanGeneratorValues(), damage_location: "stale hidden value", damage_severity: "severe" },
        flags: CLEAN_FLAGS,
      })
    );
    expect(s.damageLocation).toBeNull();
    expect(s.damageSeverityLabel).toBeNull();
  });
});

describe("custom organization templates", () => {
  const cleanCustom = {
    hitch_pin: "pass",
    cab_clean: "pass",
    had_damage: "no",
    gear_list: { straps: "returned", cones: "returned" },
    attestation: "yes",
  };

  it("separates an optional failed check from a required one", () => {
    const s = summarize(
      returnRowV2({
        template: customTemplate(),
        values: { ...cleanCustom, hitch_pin: "fail", cab_clean: "fail" },
        flags: CLEAN_FLAGS,
      })
    );
    expect(s.failedRequired).toEqual(["Hitch pin"]);
    expect(s.failedOptional).toEqual(["Cleaned inside cab?"]);
  });

  it("ignores a failed answer stored in a section hidden by visible_when", () => {
    const s = summarize(
      returnRowV2({
        template: customTemplate(),
        values: { ...cleanCustom, frame_check: "fail" },
        flags: CLEAN_FLAGS,
      })
    );
    expect(s.failedRequired).toEqual([]);
  });

  it("reads the same check once its section is visible", () => {
    const s = summarize(
      returnRowV2({
        template: customTemplate(),
        values: { ...cleanCustom, had_damage: "yes", frame_check: "fail" },
        flags: { damage_observed: "yes", accessories_missing: false },
      })
    );
    expect(s.failedRequired).toEqual(["Frame check"]);
  });

  it("names missing items from an org-defined accessory list", () => {
    const s = summarize(
      returnRowV2({
        template: customTemplate(),
        values: { ...cleanCustom, gear_list: { straps: "missing", cones: "returned" } },
        flags: { damage_observed: "no", accessories_missing: true },
      })
    );
    expect(s.missingAccessoryLabels).toEqual(["Ratchet straps"]);
  });
});
