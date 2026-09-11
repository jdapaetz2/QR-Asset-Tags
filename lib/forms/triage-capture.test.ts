import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { captureDamageReport, captureSupportRequest, hasTriageMarker } from "./triage-capture";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

/** Source with comments stripped — doc comments legitimately mention what the code must not do. */
function codeOf(url: string): string {
  return readFileSync(fileURLToPath(new URL(url, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("hasTriageMarker", () => {
  it("is true only for the exact D2 marker", () => {
    expect(hasTriageMarker(form({ triage_version: "1" }))).toBe(true);
    expect(hasTriageMarker(form({ triage_version: "2" }))).toBe(false);
    expect(hasTriageMarker(form({}))).toBe(false);
  });
});

describe("damage report capture", () => {
  it("stores every answer when the D2 marker is present", () => {
    const capture = captureDamageReport(
      form({
        triage_version: "1",
        reported_equipment_state: "not_operating",
        reported_response_need: "prompt",
        reported_damage_severity: "moderate",
      }),
      "Bent arm"
    );
    expect(capture.dataJson).toEqual({
      triage_version: 1,
      reported_equipment_state: "not_operating",
      reported_response_need: "prompt",
      reported_damage_severity: "moderate",
      description: "Bent arm",
    });
    expect(capture.legacyUrgency).toBeNull();
    expect(capture.callNow).toBe(false);
  });

  it("stores null for every omitted answer", () => {
    expect(captureDamageReport(form({ triage_version: "1" }), "x").dataJson).toEqual({
      triage_version: 1,
      reported_equipment_state: null,
      reported_response_need: null,
      reported_damage_severity: null,
      description: "x",
    });
  });

  it("keeps not_sure as an answer", () => {
    const { dataJson } = captureDamageReport(
      form({ triage_version: "1", reported_equipment_state: "not_sure", reported_damage_severity: "not_sure" }),
      "x"
    );
    expect(dataJson).toMatchObject({ reported_equipment_state: "not_sure", reported_damage_severity: "not_sure" });
  });

  it("ignores unexpected values and any urgency field once the form asks the D2 questions", () => {
    const capture = captureDamageReport(
      form({
        triage_version: "1",
        reported_equipment_state: "on fire",
        reported_response_need: "URGENT",
        reported_damage_severity: "<script>",
        urgency: "high",
      }),
      "x"
    );
    expect(capture.dataJson).toEqual({
      triage_version: 1,
      reported_equipment_state: null,
      reported_response_need: null,
      reported_damage_severity: null,
      description: "x",
    });
    expect(capture.dataJson).not.toHaveProperty("urgency");
    expect(capture.legacyUrgency).toBeNull();
  });

  it("stores a post from a page rendered before D2 in its legacy shape", () => {
    const capture = captureDamageReport(form({ urgency: "medium" }), "Scuffed decal");
    expect(capture.dataJson).toEqual({ urgency: "medium", description: "Scuffed decal" });
    expect(capture.legacyUrgency).toBe("medium");
    expect(capture.callNow).toBe(false);
    expect(captureDamageReport(form({}), "x").dataJson).toEqual({ urgency: null, description: "x" });
  });

  it.each([
    [{ reported_equipment_state: "unsafe_to_operate" }, true],
    [{ reported_equipment_state: "cannot_be_moved" }, true],
    [{ reported_response_need: "immediate" }, true],
    [{ reported_equipment_state: "not_operating", reported_response_need: "prompt" }, false],
    [{ reported_equipment_state: "operating", reported_response_need: "routine", reported_damage_severity: "minor" }, false],
    [{ reported_damage_severity: "major" }, false],
    [{ reported_equipment_state: "not_sure", reported_response_need: "not_sure", reported_damage_severity: "not_sure" }, false],
    [{}, false],
  ])("answers %j → call-now %s", (answers, expected) => {
    expect(captureDamageReport(form({ triage_version: "1", ...answers }), "x").callNow).toBe(expected);
  });

  it("a legacy high urgency is a follow-up, never a call-now", () => {
    expect(captureDamageReport(form({ urgency: "high" }), "x").callNow).toBe(false);
  });
});

describe("support request capture", () => {
  it("stores issue type, response need and preferred contact", () => {
    const capture = captureSupportRequest(
      form({ triage_version: "1", reported_issue_type: "breakdown_no_start", reported_response_need: "routine" }),
      { preferredContactMethod: "text", description: "Won't start" }
    );
    expect(capture.dataJson).toEqual({
      triage_version: 1,
      reported_issue_type: "breakdown_no_start",
      reported_response_need: "routine",
      preferred_contact_method: "text",
      description: "Won't start",
    });
  });

  it.each([
    ["rollover_safety", true],
    ["breakdown_no_start", false],
    ["stuck_recovery", false],
    ["operating_question", false],
    ["other", false],
    ["not_sure", false],
  ])("issue type %s → call-now %s", (issue, expected) => {
    expect(
      captureSupportRequest(form({ triage_version: "1", reported_issue_type: issue }), {
        preferredContactMethod: null,
        description: "x",
      }).callNow
    ).toBe(expected);
  });

  it("an immediate response need shows call-now", () => {
    expect(
      captureSupportRequest(form({ triage_version: "1", reported_response_need: "immediate" }), {
        preferredContactMethod: null,
        description: "x",
      }).callNow
    ).toBe(true);
  });

  it("never stores an equipment state a support form does not ask", () => {
    const capture = captureSupportRequest(form({ triage_version: "1", reported_equipment_state: "unsafe_to_operate" }), {
      preferredContactMethod: null,
      description: "x",
    });
    expect(capture.dataJson).not.toHaveProperty("reported_equipment_state");
    expect(capture.callNow).toBe(false);
  });

  it("stores a legacy post in its original shape", () => {
    expect(captureSupportRequest(form({}), { preferredContactMethod: "phone", description: "x" }).dataJson).toEqual({
      preferred_contact_method: "phone",
      description: "x",
    });
  });
});

describe("public form intake never changes asset or rental state", () => {
  it.each(["./actions.ts", "./submit.ts", "./triage-capture.ts"])("%s writes no assets or rental sessions", (file) => {
    const source = codeOf(file);
    expect(source).not.toMatch(/from\(\s*["']assets["']\s*\)/);
    expect(source).not.toContain("asset_rental_sessions");
    expect(source).not.toMatch(/\.update\(/);
  });
});
