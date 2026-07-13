import { describe, expect, it } from "vitest";

import {
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
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
  it("adds the damage photo slot only when damage is observed", () => {
    const noDamage = parseAnswerValues(utility, readerFrom(VALID_UTILITY));
    const withDamage = parseAnswerValues(
      utility,
      readerFrom({ ...VALID_UTILITY, "answer:damage_observed": "yes" })
    );
    const ids = (t: InspectionTemplate, v: ReturnType<typeof parseAnswerValues>) =>
      visiblePhotoSlots(t, v).map((f) => f.id);
    expect(ids(utility, noDamage)).not.toContain("damage_photos");
    expect(ids(utility, withDamage)).toContain("damage_photos");
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
