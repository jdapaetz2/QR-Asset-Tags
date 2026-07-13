import { describe, expect, it } from "vitest";

import {
  deriveFlags,
  evaluateInspection,
  firstInspectionError,
  parseAnswerValues,
  resolvePhotoEvidence,
  visiblePhotoSlotCounts,
  visiblePhotoSlots,
  type AnswerReader,
} from "./validate";
import { RETURN_TEMPLATES } from "./templates";
import type { InspectionTemplate } from "./types";

const utility = RETURN_TEMPLATES.utility_trailer;
const generic = RETURN_TEMPLATES.generic;

/** A reader backed by a plain map (mirrors FormData.get on the server). */
function readerFrom(map: Record<string, string>): AnswerReader {
  return (key) => (key in map ? map[key] : null);
}

/** Parse + evaluate a utility-trailer submission from a raw answer map. */
function evalUtility(map: Record<string, string>): string | null {
  const values = parseAnswerValues(utility, readerFrom(map));
  return evaluateInspection(utility, values);
}

const VALID_UTILITY: Record<string, string> = {
  "answer:tires_wheels": "pass",
  "answer:lights_wiring": "pass",
  "answer:ramps_gate": "yes",
  "answer:coupler": "pass",
  "answer:safety_chains": "pass",
  "answer:jack": "pass",
  "answer:body_fenders": "pass",
  "answer:damage_observed": "no",
  "answer:attestation": "on",
};

describe("parseAnswerValues", () => {
  it("reads only known fields and ignores unknown answer keys", () => {
    const values = parseAnswerValues(
      utility,
      readerFrom({ "answer:tires_wheels": "pass", "answer:bogus_field": "x" })
    );
    expect(values.tires_wheels).toBe("pass");
    expect(values).not.toHaveProperty("bogus_field");
  });

  it("reads accessory checklist items into a nested map", () => {
    const values = parseAnswerValues(
      utility,
      readerFrom({
        "answer:accessories:straps": "returned",
        "answer:accessories:chains": "missing",
      })
    );
    expect(values.accessories).toEqual({ straps: "returned", chains: "missing" });
  });

  it("coerces a checked acknowledgement to yes and parses numeric meters", () => {
    const values = parseAnswerValues(
      RETURN_TEMPLATES.mini_excavator_skid_steer,
      readerFrom({ "answer:engine_hours": "125" })
    );
    expect(values.engine_hours).toBe(125);
    const ack = parseAnswerValues(utility, readerFrom({ "answer:attestation": "on" }));
    expect(ack.attestation).toBe("yes");
  });
});

describe("evaluateInspection", () => {
  it("passes a complete, in-domain submission", () => {
    expect(evalUtility(VALID_UTILITY)).toBeNull();
  });

  it("requires the attestation", () => {
    const { "answer:attestation": _omit, ...withoutAck } = VALID_UTILITY;
    expect(evalUtility(withoutAck)).toMatch(/attestation/i);
  });

  it("reports a missing required pass/fail field", () => {
    const { "answer:tires_wheels": _omit, ...missing } = VALID_UTILITY;
    expect(evalUtility(missing)).toMatch(/tires \/ wheels/i);
  });

  it("rejects an out-of-domain pass/fail value", () => {
    expect(evalUtility({ ...VALID_UTILITY, "answer:tires_wheels": "maybe" })).toMatch(
      /tires \/ wheels/i
    );
  });

  it("accepts valid accessory states but rejects unknown ones", () => {
    expect(
      evalUtility({ ...VALID_UTILITY, "answer:accessories:straps": "missing" })
    ).toBeNull();
    expect(
      evalUtility({ ...VALID_UTILITY, "answer:accessories:straps": "lost" })
    ).toMatch(/accessories/i);
  });

  it("enforces the damage-details section only when damage is observed", () => {
    // damage=no → the conditional section is not enforced.
    expect(evalUtility({ ...VALID_UTILITY, "answer:damage_observed": "no" })).toBeNull();
    // damage=yes but details omitted → the conditional fields become required.
    expect(evalUtility({ ...VALID_UTILITY, "answer:damage_observed": "yes" })).toMatch(
      /where is the damage/i
    );
    // damage=yes with details filled (photos validated separately) → passes.
    expect(
      evalUtility({
        ...VALID_UTILITY,
        "answer:damage_observed": "yes",
        "answer:damage_location": "left fender",
        "answer:damage_severity": "minor",
        "answer:damage_description": "scratch",
      })
    ).toBeNull();
  });

  it("enforces numeric meter min/max and requires a number", () => {
    const custom: InspectionTemplate = {
      key: "custom",
      version: "t",
      inspection_type: "return",
      name: "Custom",
      description: "",
      equipmentTypes: [],
      sections: [
        {
          id: "s",
          title: "S",
          fields: [{ id: "hours", type: "numeric_meter", label: "Hours", min: 0, max: 100 }],
        },
      ],
    };
    const run = (v: string) =>
      evaluateInspection(custom, parseAnswerValues(custom, readerFrom({ "answer:hours": v })));
    expect(run("50")).toBeNull();
    expect(run("150")).toMatch(/too high/i);
    expect(run("-1")).toMatch(/too low/i);
    expect(run("abc")).toMatch(/must be a number/i);
  });

  it("honors required_when", () => {
    const custom: InspectionTemplate = {
      key: "custom",
      version: "t",
      inspection_type: "return",
      name: "Custom",
      description: "",
      equipmentTypes: [],
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            { id: "trigger", type: "yes_no", label: "Trigger" },
            {
              id: "note",
              type: "short_text",
              label: "Note",
              required_when: { field: "trigger", equals: "yes" },
            },
          ],
        },
      ],
    };
    const run = (map: Record<string, string>) =>
      evaluateInspection(custom, parseAnswerValues(custom, readerFrom(map)));
    expect(run({ "answer:trigger": "yes" })).toMatch(/note/i);
    expect(run({ "answer:trigger": "no" })).toBeNull();
  });
});

describe("visiblePhotoSlots", () => {
  it("adds the damage photo slot only when damage is observed; additional photos always", () => {
    const noDamage = parseAnswerValues(utility, readerFrom(VALID_UTILITY));
    const withDamage = parseAnswerValues(
      utility,
      readerFrom({ ...VALID_UTILITY, "answer:damage_observed": "yes" })
    );
    const ids = (t: InspectionTemplate, v: ReturnType<typeof parseAnswerValues>) =>
      visiblePhotoSlots(t, v).map((f) => f.id);
    expect(ids(utility, noDamage)).not.toContain("damage_photos");
    expect(ids(utility, noDamage)).toContain("additional_photos");
    expect(ids(utility, withDamage)).toContain("damage_photos");
    expect(ids(utility, withDamage)).toContain("additional_photos");
  });
});

// Client-side gate for opening the Review stage (Phase 1A.1). Uses plain client `values` maps
// (attestation is "yes"/"" here, not "on"/parsed) and a fileCounts map keyed by photo-slot id.
describe("firstInspectionError", () => {
  const baseValues: Record<string, string> = {
    tires_wheels: "pass",
    lights_wiring: "pass",
    ramps_gate: "yes",
    coupler: "pass",
    safety_chains: "pass",
    jack: "pass",
    body_fenders: "pass",
    damage_observed: "no",
    attestation: "yes",
  };

  it("returns null for a complete submission with NO photos (Phase 3C.1.1 — photos never block)", () => {
    expect(firstInspectionError(utility, baseValues)).toBeNull();
  });

  it("a valid Pass for tires_wheels does not produce a required error (regression)", () => {
    expect(firstInspectionError(utility, baseValues)?.fieldId).not.toBe("tires_wheels");
    expect(firstInspectionError(utility, baseValues)).toBeNull();
  });

  it("flags a genuinely missing required non-photo field by id", () => {
    expect(firstInspectionError(utility, { ...baseValues, tires_wheels: "" })?.fieldId).toBe(
      "tires_wheels"
    );
  });

  it("never blocks on a missing photo slot (overview, damage, or additional)", () => {
    // No photo counts supplied at all → still valid.
    expect(firstInspectionError(utility, baseValues)).toBeNull();
    const withDamage = {
      ...baseValues,
      damage_observed: "yes",
      damage_location: "left fender",
      damage_severity: "minor",
      damage_description: "scratch",
    };
    // Damage details complete, zero damage photos → Review still reachable.
    expect(firstInspectionError(utility, withDamage)).toBeNull();
  });

  it("requires damage location/severity/description when damage=yes", () => {
    const dmg = { ...baseValues, damage_observed: "yes" };
    expect(firstInspectionError(utility, dmg)?.fieldId).toBe("damage_location");
    expect(firstInspectionError(utility, { ...dmg, damage_location: "x" })?.fieldId).toBe(
      "damage_severity"
    );
    expect(
      firstInspectionError(utility, { ...dmg, damage_location: "x", damage_severity: "minor" })?.fieldId
    ).toBe("damage_description");
  });

  it("sectionFilter scopes validation to a single stage's sections", () => {
    const err = firstInspectionError(
      utility,
      { ...baseValues, tires_wheels: "" },
      { sectionFilter: (s) => s.id === "photos" }
    );
    expect(err).toBeNull();
  });
});

describe("resolvePhotoEvidence", () => {
  it("no photos + no damage → condition photos missing, needs acknowledgement", () => {
    const r = resolvePhotoEvidence({ damage: false, damagePhotoCount: 0, totalPhotoCount: 0, acknowledged: false });
    expect(r.conditionPhotosMissing).toBe(true);
    expect(r.damagePhotosMissing).toBe(false);
    expect(r.error).toBeTruthy();
    // Acknowledged → allowed.
    expect(
      resolvePhotoEvidence({ damage: false, damagePhotoCount: 0, totalPhotoCount: 0, acknowledged: true }).error
    ).toBeNull();
  });

  it("damage without a damage photo → damagePhotosMissing, needs acknowledgement", () => {
    const r = resolvePhotoEvidence({ damage: true, damagePhotoCount: 0, totalPhotoCount: 3, acknowledged: false });
    expect(r.damagePhotosMissing).toBe(true);
    expect(r.conditionPhotosMissing).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("photos present clears both flags and needs no acknowledgement", () => {
    expect(
      resolvePhotoEvidence({ damage: true, damagePhotoCount: 2, totalPhotoCount: 5, acknowledged: false })
    ).toEqual({ damagePhotosMissing: false, conditionPhotosMissing: false, error: null });
  });
});

describe("visiblePhotoSlotCounts", () => {
  it("reports counts per currently-visible photo slot", () => {
    const values = parseAnswerValues(utility, readerFrom(VALID_UTILITY));
    const counts = visiblePhotoSlotCounts(utility, values, {
      front_hitch_photo: 2,
      deck_photo: 1,
      additional_photos: 3,
    });
    const byId = Object.fromEntries(counts.map((c) => [c.id, c.count]));
    expect(byId.front_hitch_photo).toBe(2);
    expect(byId.deck_photo).toBe(1);
    expect(byId.additional_photos).toBe(3);
    // Damage slot is hidden here (damage=no) → not counted.
    expect(byId).not.toHaveProperty("damage_photos");
  });
});

describe("deriveFlags", () => {
  it("flags damage from the damage_observed field", () => {
    const yes = parseAnswerValues(
      utility,
      readerFrom({ ...VALID_UTILITY, "answer:damage_observed": "yes" })
    );
    expect(deriveFlags(utility, yes).damage_observed).toBe("yes");
    const no = parseAnswerValues(utility, readerFrom(VALID_UTILITY));
    expect(deriveFlags(utility, no).damage_observed).toBe("no");
  });

  it("flags missing accessories from a checklist 'missing' state", () => {
    const values = parseAnswerValues(
      utility,
      readerFrom({ ...VALID_UTILITY, "answer:accessories:chains": "missing" })
    );
    expect(deriveFlags(utility, values).accessories_missing).toBe(true);
  });

  it("flags missing accessories from accessories_returned = no (generic)", () => {
    const values = parseAnswerValues(
      generic,
      readerFrom({ "answer:accessories_returned": "no" })
    );
    expect(deriveFlags(generic, values).accessories_missing).toBe(true);
  });
});
