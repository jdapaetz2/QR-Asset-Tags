import { describe, expect, it } from "vitest";

import { buildIncidentEmail, buildTagStatusEmail, incidentSubject, SUBJECT_MAX_LENGTH } from "./email";
import { projectSubmissionBrief, type BriefAsset, type NotificationBrief, type SavedSubmissionRow } from "./projection";
import {
  CLEAN_FLAGS,
  CREATED_AT,
  SITE_URL,
  SUBMISSION_ID,
  cleanGeneratorValues,
  customTemplate,
  damageRow,
  mediaPath,
  photo,
  returnRowV2,
  supportRow,
  templateV2_20260702,
} from "./__fixtures__/rows";

const GEN: BriefAsset = { code: "GEN-003", name: "Portable Generator", category: "Generators" };
const EXC: BriefAsset = { code: "EXC-001", name: "Mini Excavator", category: "Excavators" };
const RECORD_URL = `${SITE_URL}/dashboard/submissions/${SUBMISSION_ID}`;

function brief(row: SavedSubmissionRow, asset: BriefAsset = GEN): NotificationBrief {
  const projected = projectSubmissionBrief({ organizationName: "Northridge Rentals", row, asset, siteUrl: SITE_URL });
  if (!projected) throw new Error("expected a brief");
  return projected;
}

function emailFor(row: SavedSubmissionRow, asset: BriefAsset = GEN) {
  return buildIncidentEmail(brief(row, asset));
}

/** The visible text of the HTML part, entities decoded — to compare facts with the text part. */
function visibleHtml(html: string): string {
  return html
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function expectInBoth(email: { text: string; html: string }, facts: string[]) {
  const html = visibleHtml(email.html);
  for (const fact of facts) {
    expect(email.text).toContain(fact);
    expect(html).toContain(fact);
  }
}

function webHrefs(html: string): string[] {
  return [...html.matchAll(/href="(https?:[^"]+)"/g)].map((match) => match[1]);
}

const exceptionReturn = () =>
  returnRowV2({
    template: templateV2_20260702(),
    values: {
      ...cleanGeneratorValues(),
      oil_level: "fail",
      starts_operates: "no",
      damage_observed: "yes",
      damage_location: "left side panel",
      damage_severity: "severe",
      damage_description: "Dented and scraped.",
      accessories: { cords: "missing", wheel_kit: "returned", manual: "na" },
    },
    flags: { damage_observed: "yes", accessories_missing: true },
    photos: {
      overall_photo: [photo("Overall photo", "overall-1")],
      damage_photos: [photo("Damage photos", "damage-1"), photo("Damage photos", "damage-2")],
    },
    overrides: { submitted_by_name: "Alex Chen", submitted_by_email: "alex@site.test" },
  });

describe("damage report — legacy rows (no triage yet)", () => {
  it("renders the saved description and treats medium as the old default", () => {
    const email = emailFor(damageRow({ urgency: "medium", description: "Small dent on the side panel." }));
    expect(email.subject).toBe("New damage report — GEN-003");
    expect(email.text.split("\n")[0]).toBe("Reported: urgency Medium · no photos · Jamie Rivera");
    expectInBoth(email, [
      "ROUTINE REVIEW — Damage report",
      "Asset: GEN-003 — Portable Generator (Generators)",
      "“Small dent on the side panel.”",
      "Reported urgency: Medium",
      "Medium was the form's default, so it may not reflect a deliberate choice.",
      "Equipment state and response need were not asked on this report.",
      "Reference: SUB-2026-7C0A55",
    ]);
    expect(email.text).toContain(`Open damage report: ${RECORD_URL}`);
  });

  it("legacy high is a follow up", () => {
    const email = emailFor(damageRow({ urgency: "high", description: "Hose weeping." }));
    expect(email.subject).toBe("Follow up: GEN-003 — reported urgency: high");
    expect(email.text).toContain("FOLLOW UP — Damage report");
  });

  it("legacy low carries no default note", () => {
    expect(emailFor(damageRow({ urgency: "low", description: "x" })).text).not.toContain("form's default");
  });
});

describe("damage report — explicit triage (D2 contract)", () => {
  it("renders reported fields, severity and the not-verified line", () => {
    const email = emailFor(
      damageRow({ triage_version: 1, equipment_state: "unsafe", damage_severity: "major", description: "Tipped over." }),
      EXC
    );
    expect(email.subject).toBe("Immediate attention: EXC-001 — reported unsafe to operate");
    expectInBoth(email, [
      "IMMEDIATE ATTENTION — Damage report",
      "Reported equipment state: Unsafe to operate",
      "Reported response need: Not reported",
      "Reported damage severity: Major",
      "These are the submitter's selections, not a verified inspection.",
    ]);
  });

  it("omits the severity line when not reported", () => {
    const email = emailFor(damageRow({ triage_version: 1, equipment_state: "operating", description: "x" }));
    expect(email.text).not.toContain("Reported damage severity");
  });
});

describe("support request", () => {
  it("renders the preferred contact and the support CTA", () => {
    const email = emailFor(
      supportRow(
        { preferred_contact_method: "text", description: "Which bulb size fits the running lights?" },
        { submitted_by_name: "Sam Lee", submitted_by_email: null, submitted_by_phone: "604-555-0199" }
      )
    );
    expect(email.subject).toBe("Support request — GEN-003");
    expectInBoth(email, [
      "Sam Lee — prefers text",
      "“Which bulb size fits the running lights?”",
      "Issue type and response need were not asked on this report.",
    ]);
    expect(email.text).toContain(`Open support request: ${RECORD_URL}`);
    expect(email.html).toContain('href="tel:6045550199"');
  });

  it("renders reported issue type when triage exists", () => {
    const email = emailFor(supportRow({ triage_version: 1, issue_type: "stuck_recovery", description: "Sunk in." }));
    expect(email.subject).toBe("Follow up: GEN-003 — reported stuck, recovery needed");
    expectInBoth(email, ["Reported issue type: Stuck or needs recovery", "Reported response need: Not reported"]);
  });
});

describe("renter return checklist", () => {
  it("lists every exception", () => {
    const email = emailFor(exceptionReturn());
    expect(email.subject).toBe("Follow up: GEN-003 — renter return checklist, 4 exceptions");
    expect(email.text.split("\n")[0]).toBe(
      "Exceptions: damage reported, 1 failed check, reported not starting or operating, accessories missing · 3 photos"
    );
    expectInBoth(email, [
      "FOLLOW UP — Renter return checklist",
      "- Damage reported: left side panel (reported damage severity: Severe)",
      "“Dented and scraped.”",
      "- Failed check: Oil level",
      "- Starts / operates? No",
      "- Accessories missing: Cords",
      "Photos: 3 on the record — Damage photos (2), Overall photo (1)",
      "Alex Chen",
    ]);
    expect(email.text).toContain(`Open return checklist: ${RECORD_URL}`);
  });

  it("a clean return is record only", () => {
    const email = emailFor(
      returnRowV2({
        template: templateV2_20260702(),
        values: cleanGeneratorValues(),
        flags: CLEAN_FLAGS,
        photos: { overall_photo: [photo("Overall photo", "o1")] },
      })
    );
    expect(email.subject).toBe("Renter return checklist — GEN-003, no exceptions");
    expectInBoth(email, ["RECORD ONLY — Renter return checklist", "No action required. No exceptions reported."]);
  });

  it("a photo-gap-only return is routine", () => {
    const email = emailFor(
      returnRowV2({
        template: templateV2_20260702(),
        values: cleanGeneratorValues(),
        flags: { ...CLEAN_FLAGS, condition_photos_missing: true },
      })
    );
    expect(email.subject).toBe("Renter return checklist — GEN-003, review when convenient");
    expectInBoth(email, ["ROUTINE REVIEW — Renter return checklist", "Also noted", "- No condition photos provided"]);
  });

  it("shows contact only when the renter gave it", () => {
    const email = emailFor(
      returnRowV2({
        template: templateV2_20260702(),
        values: cleanGeneratorValues(),
        flags: CLEAN_FLAGS,
        overrides: { submitted_by_name: null, submitted_by_email: null, submitted_by_phone: null },
      })
    );
    expect(email.text).not.toContain("Contact");
  });
});

describe("contact links", () => {
  it("links a valid phone and email, with the record CTA first", () => {
    const email = emailFor(damageRow({ urgency: "low", description: "x" }));
    expect(email.html).toContain('href="tel:+16045550100"');
    expect(email.html).toContain('href="mailto:jamie@site.test"');
    expect(email.html.indexOf("<a ")).toBe(email.html.indexOf(`<a href="${RECORD_URL}"`));
  });

  it("shows invalid values as text without a link", () => {
    const email = emailFor(
      damageRow(
        { urgency: "low", description: "x" },
        { submitted_by_phone: "call the office", submitted_by_email: "jamie@site.test?cc=x@y.zz" }
      )
    );
    expect(email.html).not.toContain("tel:");
    expect(email.html).not.toContain("mailto:");
    expect(email.text).toContain("Phone: call the office");
  });
});

describe("safety of the rendered message", () => {
  it("escapes HTML in every free-text field", () => {
    const email = emailFor(
      damageRow(
        { urgency: "low", description: `<script>alert("x")</script> & 'q'` },
        { submitted_by_name: "<b>Bold</b>" }
      ),
      { code: "GEN-003", name: "Gen <img src=x>", category: null }
    );
    expect(email.html).not.toMatch(/<script|<img|<b>Bold/i);
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain(`<script>alert("x")</script> & 'q'`);
  });

  it("carries no storage path, bucket, signed URL, tracking, image or style block", () => {
    const row = exceptionReturn();
    expect((row.media_urls as string[]).length).toBeGreaterThan(0);
    const email = emailFor(row);
    for (const part of [email.text, email.html, email.subject]) {
      const lower = part.toLowerCase();
      for (const banned of ["org/", "/submission/", ".jpg", "token=", "/storage/v1/", "signed", "supabase", "submissions/org"]) {
        expect(lower).not.toContain(banned);
      }
      expect(lower).not.toMatch(/bit\.ly|tinyurl|t\.co\/|click\?|utm_/);
    }
    expect(email.html).not.toMatch(/<img|<style|background-image|display:\s*none|<script|<iframe/i);
    expect(email.text).not.toContain(mediaPath("damage-1"));
  });

  it("puts every web link on the canonical host, one web link per submission email", () => {
    const email = emailFor(exceptionReturn());
    expect(webHrefs(email.html)).toEqual([RECORD_URL]);
    for (const url of email.text.match(/https?:\/\/\S+/g) ?? []) expect(url.startsWith(SITE_URL)).toBe(true);
  });

  it("contains no raw timestamp", () => {
    const email = emailFor(damageRow({ urgency: "low", description: "x" }));
    expect(email.text).not.toContain(CREATED_AT.slice(0, 10));
    expect(email.text).not.toMatch(/\bUTC\b|T\d{2}:\d{2}/);
  });

  it("stays under 20 KB of HTML with a long description and many failed checks", () => {
    const template = customTemplate();
    const checks = template.sections.find((section) => section.id === "checks")!;
    const values: Record<string, unknown> = { hitch_pin: "pass", cab_clean: "pass", had_damage: "no" };
    for (let i = 0; i < 40; i += 1) {
      checks.fields.push({ id: `extra_${i}`, type: "pass_fail_na", label: `Extra check ${i} ${"x".repeat(80)}`, required: true });
      values[`extra_${i}`] = "fail";
    }
    const returnEmail = emailFor(returnRowV2({ template, values, flags: CLEAN_FLAGS }));
    expect(returnEmail.html.length).toBeLessThan(20_000);
    expect(returnEmail.text).toContain("- and 30 more in Mulemark");

    const damageEmail = emailFor(damageRow({ urgency: "low", description: "word ".repeat(2000) }));
    expect(damageEmail.html.length).toBeLessThan(20_000);
    expect(damageEmail.text).toContain("Shortened here. The full text is in Mulemark.");
  });
});

describe("subjects", () => {
  it("never carry urgency hooks or exclamation marks", () => {
    const rows = [
      damageRow({ triage_version: 1, equipment_state: "unsafe", description: "x" }),
      damageRow({ urgency: "high", description: "x" }),
      supportRow({ description: "x" }),
      exceptionReturn(),
    ];
    for (const row of rows) {
      const subject = emailFor(row, { code: "EXC-001!", name: null, category: null }).subject;
      expect(subject).not.toMatch(/urgent|!|act now/i);
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    }
  });

  it("keeps the prefix and asset code when trimming a long headline", () => {
    const base = brief(damageRow({ triage_version: 1, equipment_state: "unsafe", description: "x" }), EXC);
    const subject = incidentSubject({ ...base, headline: "reported ".repeat(40) });
    expect(subject.length).toBe(SUBJECT_MAX_LENGTH);
    expect(subject.startsWith("Immediate attention: EXC-001 — reported")).toBe(true);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("falls back to the asset name, then a neutral phrase, and strips line breaks", () => {
    const row = damageRow({ urgency: "low", description: "x" });
    expect(emailFor(row, { code: null, name: "Mini Excavator", category: null }).subject).toBe(
      "New damage report — Mini Excavator"
    );
    expect(emailFor(row, { code: null, name: null, category: null }).subject).toBe(
      "New damage report — unidentified asset"
    );
    expect(emailFor(row, { code: "EXC\r\n-001", name: null, category: null }).subject).not.toMatch(/[\r\n]/);
  });
});

describe("reason line", () => {
  it("names the organization, the topic, and where to turn it off", () => {
    const email = emailFor(damageRow({ urgency: "low", description: "x" }));
    expect(email.text).toContain(
      `You are receiving this because Northridge Rentals has email notifications enabled for damage reports. Change this under Settings → Notifications: ${SITE_URL}/dashboard/settings`
    );
    expect(emailFor(exceptionReturn()).text).toContain("enabled for return checklists");
  });
});

describe("buildTagStatusEmail", () => {
  const tag = buildTagStatusEmail({
    orgName: "Northridge Rentals",
    statusLabel: "In production",
    reference: "tr-9",
    manageUrl: `${SITE_URL}/dashboard/tag-requests/tr-9`,
    settingsUrl: `${SITE_URL}/dashboard/settings`,
  });

  it("is record only, with the actual status, organization and reference", () => {
    expect(tag.subject).toBe("Tag request updated — Northridge Rentals");
    expect(tag.text.split("\n")[0]).toBe("Status: In production. No action required.");
    expectInBoth(tag, ["RECORD ONLY — Tag request", "Organization: Northridge Rentals", "Status: In production", "Reference: tr-9"]);
    expect(tag.text).toContain(`View tag request: ${SITE_URL}/dashboard/tag-requests/tr-9`);
  });

  it("explains why the recipient got it, and stays free of images and shorteners", () => {
    expect(tag.text).toContain("enabled for tag request updates");
    expect(tag.html).not.toMatch(/<img|<script|<iframe/i);
    expect(tag.text).not.toMatch(/bit\.ly|tinyurl/i);
  });

  it("keeps From/Reply-To out of the body — they are transport concerns, set once in the sender", () => {
    expect(tag.text).not.toContain("notifications@");
    expect(tag.text).not.toContain("support@mulemark.io");
  });
});
