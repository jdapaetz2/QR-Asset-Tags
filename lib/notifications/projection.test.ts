import { describe, expect, it } from "vitest";

import { checkSavedSubmission, excerpt, projectSubmissionBrief, type BriefAsset, type SavedSubmissionRow } from "./projection";
import {
  ASSET_ID,
  CLEAN_FLAGS,
  ORG_ID,
  OTHER_ORG_ID,
  SITE_URL,
  SUBMISSION_ID,
  cleanGeneratorValues,
  customTemplate,
  damageRow,
  mediaPath,
  photo,
  returnRowV1,
  returnRowV2,
  savedRow,
  supportRow,
  templateV2_20260702,
} from "./__fixtures__/rows";

const ASSET: BriefAsset = { code: "GEN-003", name: "Portable Generator", category: "Generators" };

function project(row: SavedSubmissionRow, asset: BriefAsset = ASSET) {
  return projectSubmissionBrief({ organizationName: "Northridge Rentals", row, asset, siteUrl: SITE_URL });
}

function mustProject(row: SavedSubmissionRow) {
  const brief = project(row);
  if (!brief) throw new Error("expected a brief");
  return brief;
}

describe("checkSavedSubmission — fail closed", () => {
  const expected = { organizationId: ORG_ID, assetId: ASSET_ID, formType: "damage_report" as const };

  it("accepts the row the committing action scheduled", () => {
    expect(checkSavedSubmission(expected, savedRow(), ASSET)).toBeNull();
  });

  it.each([
    ["record_missing", null, ASSET],
    ["organization_mismatch", savedRow({ organization_id: OTHER_ORG_ID }), ASSET],
    ["asset_mismatch", savedRow({ asset_id: "a0000000-0000-4000-8000-0000000000ff" }), ASSET],
    ["form_type_mismatch", savedRow({ form_type: "support_request" }), ASSET],
    ["origin_mismatch", savedRow({ submission_origin: "staff" }), ASSET],
    ["asset_missing", savedRow(), null],
  ] as const)("%s", (failure, row, asset) => {
    expect(checkSavedSubmission(expected, row, asset)).toBe(failure);
  });

  it("treats a pre-origin row (null) as public", () => {
    expect(checkSavedSubmission(expected, savedRow({ submission_origin: null }), ASSET)).toBeNull();
  });
});

describe("damage reports", () => {
  it("projects the saved description, contact and legacy urgency", () => {
    const brief = mustProject(
      damageRow({ urgency: "medium", description: "Generator shuts off after ten minutes." })
    );
    expect(brief.event).toBe("damage_report");
    expect(brief.eventLabel).toBe("Damage report");
    expect(brief.source).toBe("public");
    expect(brief.reference).toBe("SUB-2026-7C0A55");
    expect(brief.description).toEqual({ text: "Generator shuts off after ten minutes.", truncated: false });
    expect(brief.contact).toMatchObject({
      name: "Jamie Rivera",
      phoneHref: "tel:+16045550100",
      emailHref: "mailto:jamie@site.test",
      preferredMethod: null,
    });
    expect(brief.reported).toMatchObject({ triageRecorded: false, legacyUrgency: "medium" });
    expect(brief.priority).toBe("routine");
    expect(brief.links).toEqual({
      record: `${SITE_URL}/dashboard/submissions/${SUBMISSION_ID}`,
      settings: `${SITE_URL}/dashboard/settings`,
    });
  });

  it.each([
    ["low", "routine"],
    ["medium", "routine"],
    ["high", "follow_up"],
  ] as const)("legacy urgency %s → %s", (urgency, priority) => {
    expect(mustProject(damageRow({ urgency, description: "x" })).priority).toBe(priority);
  });

  it("missing urgency is routine", () => {
    expect(mustProject(damageRow({ urgency: null, description: "x" })).priority).toBe("routine");
  });

  it("reads explicit triage and carries only the damage form's questions", () => {
    const brief = mustProject(
      damageRow({
        triage_version: 1,
        reported_equipment_state: "unsafe_to_operate",
        reported_response_need: "immediate",
        reported_damage_severity: "major",
        reported_issue_type: "rollover_safety",
        urgency: "low",
        description: "Tipped over.",
      })
    );
    expect(brief.reported).toEqual({
      triageRecorded: true,
      issueType: null,
      equipmentState: "unsafe_to_operate",
      responseNeed: "immediate",
      damageSeverity: "major",
      legacyUrgency: null,
    });
    expect(brief.priority).toBe("immediate");
  });

  it("never reads the description for priority", () => {
    const brief = mustProject(damageRow({ urgency: "low", description: "URGENT rollover, unsafe, help now!!!" }));
    expect(brief.priority).toBe("routine");
  });
});

describe("support requests", () => {
  it("projects a validated preferred contact method", () => {
    expect(mustProject(supportRow({ preferred_contact_method: "text", description: "x" })).contact.preferredMethod).toBe(
      "text"
    );
    expect(mustProject(supportRow({ preferred_contact_method: "fax", description: "x" })).contact.preferredMethod).toBeNull();
  });

  it("ignores an equipment state a support form never asks", () => {
    const brief = mustProject(supportRow({ triage_version: 1, reported_equipment_state: "unsafe_to_operate", description: "x" }));
    expect(brief.reported.equipmentState).toBeNull();
    expect(brief.priority).toBe("routine");
  });

  it("support issue type drives priority", () => {
    expect(mustProject(supportRow({ triage_version: 1, reported_issue_type: "stuck_recovery", description: "x" })).priority).toBe(
      "follow_up"
    );
  });
});

describe("renter return checklists", () => {
  it("projects exceptions, notes, slot counts and a linked rental", () => {
    const brief = mustProject(
      returnRowV2({
        template: templateV2_20260702(),
        values: {
          ...cleanGeneratorValues(),
          oil_level: "fail",
          damage_observed: "yes",
          damage_location: "left side",
          damage_severity: "severe",
          damage_description: "Dented.",
        },
        flags: { damage_observed: "yes", accessories_missing: false, damage_photos_missing: true },
        photos: { overall_photo: [photo("Overall photo", "overall-1")] },
        overrides: { rental_session_id: "5e551011-1111-4111-8111-111111111111" },
      })
    );
    expect(brief.event).toBe("renter_return");
    expect(brief.eventLabel).toBe("Renter return checklist");
    expect(brief.priority).toBe("follow_up");
    expect(brief.rentalSessionLinked).toBe(true);
    expect(brief.returnDetail).toMatchObject({
      exceptionCount: 2,
      damage: true,
      damageSeverityLabel: "Severe",
      failedRequired: ["Oil level"],
      notes: ["Damage reported without photos"],
    });
    expect(brief.photos.slotCounts).toEqual([{ label: "Overall photo", count: 1 }]);
  });

  it("a V1 flat row still projects", () => {
    expect(mustProject(returnRowV1({ damage_observed: "yes", accessories_returned: "yes" })).priority).toBe("follow_up");
  });

  it("a custom template's failed optional check is routine with a note", () => {
    const brief = mustProject(
      returnRowV2({
        template: customTemplate(),
        values: { hitch_pin: "pass", cab_clean: "fail", had_damage: "no", gear_list: { straps: "returned", cones: "returned" } },
        flags: CLEAN_FLAGS,
      })
    );
    expect(brief.priority).toBe("routine");
    expect(brief.returnDetail?.notes).toEqual(["Failed optional check: Cleaned inside cab?"]);
  });

  it("refuses staff returns and outbound inspections — they are not individually notified", () => {
    expect(project(savedRow({ form_type: "return_checklist", submission_origin: "staff" }))).toBeNull();
    expect(project(savedRow({ form_type: "pre_use_inspection", submission_origin: "staff" }))).toBeNull();
  });
});

describe("preview candidates — server-only metadata (D1, ranked in D4)", () => {
  const damageValues = {
    ...cleanGeneratorValues(),
    damage_observed: "yes",
    damage_location: "x",
    damage_severity: "minor",
    damage_description: "y",
  };
  const damageFlags = { damage_observed: "yes", accessories_missing: false };
  const paths = (row: SavedSubmissionRow) => mustProject(row).photos.previewCandidates.map((c) => c.path);

  it("keeps at most three image paths that belong to this submission, damage first", () => {
    const damage = [photo("Damage photos", "d1"), photo("Damage photos", "d2")];
    const row = returnRowV2({
      template: templateV2_20260702(),
      values: damageValues,
      flags: damageFlags,
      photos: {
        overall_photo: [photo("Overall photo", "o1"), photo("Overall photo", "o2")],
        damage_photos: damage,
      },
    });
    expect(paths(row)).toEqual([mediaPath("d1"), mediaPath("d2"), mediaPath("o1")]);
  });

  it("ranks damage, then issue-specific, then overall condition, then additional photos", () => {
    const row = returnRowV2({
      template: templateV2_20260702(),
      values: damageValues,
      flags: damageFlags,
      photos: {
        additional_photos: [photo("Additional photos", "a1")],
        overall_photo: [photo("Overall photo", "o1")],
        hose_closeup: [photo("Hose close-up", "h1")],
        damage_photos: [photo("Damage photos", "d1")],
      },
    });
    expect(mustProject(row).photos.previewCandidates).toEqual([
      { path: mediaPath("d1"), label: "Damage photos", rank: 1 },
      { path: mediaPath("h1"), label: "Photos", rank: 2 },
      { path: mediaPath("o1"), label: "Overall photo", rank: 3 },
    ]);
  });

  it("uses additional photos only when nothing ranks higher", () => {
    const row = returnRowV2({
      template: templateV2_20260702(),
      values: damageValues,
      flags: damageFlags,
      photos: { additional_photos: [photo("Additional photos", "a1")] },
    });
    expect(mustProject(row).photos.previewCandidates).toEqual([
      { path: mediaPath("a1"), label: "Additional photos", rank: 4 },
    ]);
  });

  it.each([
    ["a clean return", cleanGeneratorValues(), CLEAN_FLAGS],
    ["a photo-gap-only return", cleanGeneratorValues(), { ...CLEAN_FLAGS, condition_photos_missing: true }],
  ])("%s gets a photo count and no preview candidates", (_name, values, flags) => {
    const row = returnRowV2({
      template: templateV2_20260702(),
      values,
      flags,
      photos: { overall_photo: [photo("Overall photo", "o1"), photo("Overall photo", "o2")] },
    });
    const brief = mustProject(row);
    expect(brief.photos.count).toBe(2);
    expect(brief.photos.previewCandidates).toEqual([]);
  });

  it("a return whose only finding is a failed optional check gets no preview candidates", () => {
    const row = returnRowV2({
      template: customTemplate(),
      values: {
        hitch_pin: "pass",
        cab_clean: "fail",
        had_damage: "no",
        gear_list: { straps: "returned", cones: "returned" },
        attestation: "yes",
      },
      flags: CLEAN_FLAGS,
      photos: { yard_overview: [photo("Yard overview", "y1")] },
    });
    expect(mustProject(row).priority).toBe("routine");
    expect(mustProject(row).photos.previewCandidates).toEqual([]);
  });

  it("damage and support reports keep upload order, capped at three, with their own labels", () => {
    const media = ["p1", "p2", "p3", "p4"].map((name) => mediaPath(name));
    expect(mustProject(damageRow({ urgency: "low", description: "x" }, { media_urls: media })).photos.previewCandidates).toEqual(
      media.slice(0, 3).map((path) => ({ path, label: "Damage report photo", rank: 1 }))
    );
    expect(mustProject(supportRow({ description: "x" }, { media_urls: media })).photos.previewCandidates).toEqual(
      media.slice(0, 3).map((path) => ({ path, label: "Support request photo", rank: 2 }))
    );
  });

  it("drops foreign, traversal, mismatched-submission and non-image paths", () => {
    const row = damageRow(
      { urgency: "low", description: "x" },
      {
        media_urls: [
          mediaPath("foreign", "jpg", OTHER_ORG_ID),
          `org/${ORG_ID}/asset/${ASSET_ID}/submission/${SUBMISSION_ID}/../other/x.jpg`,
          `org/${ORG_ID}/asset/${ASSET_ID}/submission/7c0a55e1-9999-4999-8999-999999999999/x.jpg`,
          `org/${ORG_ID}/asset/${ASSET_ID}/submission/${SUBMISSION_ID}/nested/x.jpg`,
          mediaPath("clip", "bin"),
          mediaPath("ok"),
        ],
      }
    );
    expect(paths(row)).toEqual([mediaPath("ok")]);
    expect(mustProject(row).photos.count).toBe(6);
  });

  it("never offers a path that is not in the row's own media list", () => {
    const row = returnRowV2({
      template: templateV2_20260702(),
      values: damageValues,
      flags: damageFlags,
      photos: { damage_photos: [photo("Damage photos", "d1")] },
      overrides: { media_urls: [] },
    });
    expect(mustProject(row).photos.previewCandidates).toEqual([]);
  });
});

describe("excerpt", () => {
  it("collapses whitespace and control characters", () => {
    expect(excerpt("line one\r\n\tlinetwo three", 300)).toEqual({ text: "line one line two three", truncated: false });
  });

  it("truncates at a word boundary with a marker", () => {
    const result = excerpt(`${"word ".repeat(100)}end`, 300);
    expect(result?.truncated).toBe(true);
    expect(result?.text.endsWith("…")).toBe(true);
    expect(result!.text.length).toBeLessThanOrEqual(301);
  });

  it("returns null for empty or non-string values", () => {
    expect(excerpt("   ", 300)).toBeNull();
    expect(excerpt(42, 300)).toBeNull();
  });
});
