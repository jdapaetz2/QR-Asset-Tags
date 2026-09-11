import { describe, expect, it } from "vitest";

import { CLEAN_FLAGS, cleanGeneratorValues, returnRowV2, templateV2_20260702 } from "./__fixtures__/rows";
import {
  digestOrigins,
  isDigestMode,
  projectDigestItem,
  sortDigestItems,
  type DigestItem,
  type DigestReturnRow,
} from "./digest";
import { DIGEST_MAX_ITEMS, buildReturnDigestEmail, returnDigestSubject } from "./email";
import { submissionReference } from "@/lib/submissions/inbox";

const ORG = "c0000000-0000-4000-8000-0000000000a1";
const SITE = "https://mulemark.io";

let seq = 0;
function row(data: unknown, overrides: Partial<DigestReturnRow> = {}): DigestReturnRow {
  seq++;
  return {
    // The first 6 hex characters form the SUB- reference, so they must differ per row.
    id: `${String(seq).padStart(6, "0")}00-0000-4000-8000-000000000000`,
    organization_id: ORG,
    created_at: `2026-07-14T${String(10 + (seq % 10)).padStart(2, "0")}:00:00.000Z`,
    status: "new",
    submission_origin: "public",
    asset_id: "a0000000-0000-4000-8000-0000000000b1",
    submission_data_json: data,
    media_urls: [],
    ...overrides,
  };
}

const ASSET = { id: "a0000000-0000-4000-8000-0000000000b1", asset_code: "GEN-003", asset_name: "Portable Generator" };

const V1_DAMAGE = { damage_observed: "yes", accessories_returned: "yes" };
const V1_MISSING_ACCESSORY = { damage_observed: "no", accessories_returned: "no" };
const V1_CLEAN = { damage_observed: "no", accessories_returned: "yes" };
const failedCheck = () =>
  returnRowV2({ template: templateV2_20260702(), values: { ...cleanGeneratorValues(), oil_level: "fail" }, flags: CLEAN_FLAGS })
    .submission_data_json;
const photoGapOnly = () =>
  returnRowV2({
    template: templateV2_20260702(),
    values: cleanGeneratorValues(),
    flags: { ...CLEAN_FLAGS, condition_photos_missing: true },
  }).submission_data_json;

describe("scope", () => {
  it("instant_renter summarizes staff returns only; daily_exceptions summarizes renter and staff", () => {
    expect(digestOrigins("instant_renter")).toEqual(["staff"]);
    expect(digestOrigins("daily_exceptions")).toEqual(["public", "staff"]);
    expect(isDigestMode("off")).toBe(false);
  });
});

describe("projectDigestItem — only return exceptions are listed", () => {
  it("lists damage, failed required checks and missing accessories", () => {
    expect(projectDigestItem(row(V1_DAMAGE), ASSET, SITE)?.exceptions).toEqual(["Damage"]);
    expect(projectDigestItem(row(failedCheck()), ASSET, SITE)?.exceptions).toEqual(["Failed check: Oil level"]);
    expect(projectDigestItem(row(V1_MISSING_ACCESSORY), ASSET, SITE)?.exceptions).toEqual(["Missing accessories"]);
  });

  it("excludes clean returns and photo-gap-only returns", () => {
    expect(projectDigestItem(row(V1_CLEAN), ASSET, SITE)).toBeNull();
    expect(projectDigestItem(row(photoGapOnly()), ASSET, SITE)).toBeNull();
  });

  it("carries the current status, source, reference, photo count and record link — never a storage path", () => {
    const r = row(V1_DAMAGE, {
      status: "resolved",
      submission_origin: "staff",
      media_urls: [`org/${ORG}/asset/x/submission/y/photo-1.jpg`, `org/${ORG}/asset/x/submission/y/photo-2.jpg`],
    });
    const item = projectDigestItem(r, ASSET, SITE);
    expect(item).toMatchObject({
      statusLabel: "Resolved",
      open: false,
      source: "staff",
      sourceLabel: "Staff",
      assetCode: "GEN-003",
      reference: submissionReference(r.id, r.created_at),
      photoCount: 2,
      recordUrl: `${SITE}/dashboard/submissions/${r.id}`,
      group: 1,
    });
    expect(JSON.stringify(item)).not.toContain("org/");
  });

  it("New and Reviewed are open", () => {
    expect(projectDigestItem(row(V1_DAMAGE, { status: "new" }), ASSET, SITE)?.open).toBe(true);
    expect(projectDigestItem(row(V1_DAMAGE, { status: "reviewed" }), ASSET, SITE)?.open).toBe(true);
    expect(projectDigestItem(row(V1_DAMAGE, { status: "archived" }), ASSET, SITE)?.open).toBe(false);
  });

  it("one-lines and caps free text from asset records", () => {
    const item = projectDigestItem(row(V1_DAMAGE), { ...ASSET, asset_name: `Lift\nwith\tbreaks ${"x".repeat(200)}` }, SITE);
    expect(item?.assetName).not.toMatch(/[\n\t]/);
    expect((item?.assetName ?? "").length).toBeLessThanOrEqual(121);
  });
});

describe("sortDigestItems", () => {
  it("damage first, then failed checks / missing accessories; oldest first within each group", () => {
    const newerDamage = projectDigestItem(row(V1_DAMAGE, { created_at: "2026-07-14T20:00:00.000Z" }), ASSET, SITE)!;
    const olderDamage = projectDigestItem(row(V1_DAMAGE, { created_at: "2026-07-14T08:00:00.000Z" }), ASSET, SITE)!;
    const oldestAccessory = projectDigestItem(row(V1_MISSING_ACCESSORY, { created_at: "2026-07-14T01:00:00.000Z" }), ASSET, SITE)!;
    const check = projectDigestItem(row(failedCheck(), { created_at: "2026-07-14T05:00:00.000Z" }), ASSET, SITE)!;
    expect(sortDigestItems([check, newerDamage, oldestAccessory, olderDamage]).map((i) => i.id)).toEqual([
      olderDamage.id,
      newerDamage.id,
      oldestAccessory.id,
      check.id,
    ]);
  });
});

describe("buildReturnDigestEmail", () => {
  function items(count: number, overrides: Partial<DigestReturnRow> = {}): DigestItem[] {
    return sortDigestItems(
      Array.from({ length: count }, () => projectDigestItem(row(V1_DAMAGE, overrides), ASSET, SITE)!)
    );
  }
  const base = {
    orgName: "Northridge Rentals",
    windowStart: new Date("2026-07-14T13:00:00.000Z"),
    windowEnd: new Date("2026-07-15T13:00:00.000Z"),
    clamped: false,
    scanIncomplete: false,
    inboxUrl: `${SITE}/dashboard/submissions?form_type=return_checklist&status=unresolved`,
    settingsUrl: `${SITE}/dashboard/settings`,
  };

  it("subject counts returns with exceptions; the first line states the open count", () => {
    const list = [...items(3), ...items(1, { status: "resolved" })];
    const email = buildReturnDigestEmail({ ...base, items: list });
    expect(email.subject).toBe("Return exceptions summary - 4 returns with exceptions");
    expect(returnDigestSubject(1)).toBe("Return exceptions summary - 1 return with exceptions");
    expect(email.text.split("\n")[0]).toMatch(/^4 returns with exceptions since .* Pacific; 3 still open\.$/);
  });

  it("lists each item with source, status, reference, photos, exceptions and its link, plus the inbox link", () => {
    const list = items(2, { submission_origin: "staff", status: "reviewed" });
    const email = buildReturnDigestEmail({ ...base, items: list });
    for (const item of list) {
      expect(email.text).toContain(`Reference: ${item.reference}`);
      expect(email.text).toContain(`Open return checklist: ${item.recordUrl}`);
    }
    expect(email.text).toContain("GEN-003 — Portable Generator — Staff return · Reviewed");
    expect(email.text).toContain("- Damage");
    expect(email.text).toContain("Photos: none");
    expect(email.text).toContain(`Open return checklists: ${base.inboxUrl}`);
    expect(email.text).toContain("current status");
  });

  it(`shows at most ${DIGEST_MAX_ITEMS} items and says how many more exist`, () => {
    const email = buildReturnDigestEmail({ ...base, items: items(31) });
    expect(email.subject).toBe("Return exceptions summary - 31 returns with exceptions");
    expect(email.text.match(/Reference: /g)).toHaveLength(DIGEST_MAX_ITEMS);
    expect(email.text).toContain(`Showing ${DIGEST_MAX_ITEMS} of 31. The other 6 are in Submissions: ${base.inboxUrl}`);
  });

  it("states a shortened period and an incomplete scan", () => {
    const email = buildReturnDigestEmail({ ...base, items: items(1), clamped: true, scanIncomplete: true });
    expect(email.text).toContain("Only the last 14 days are listed");
    expect(email.text).toContain("complete list is in Submissions");
  });

  it("carries no images, escapes free text, and keeps the text part complete", () => {
    const hostile = sortDigestItems([
      projectDigestItem(row(V1_DAMAGE), { ...ASSET, asset_name: '<img src=x onerror="alert(1)">' }, SITE)!,
    ]);
    const email = buildReturnDigestEmail({ ...base, items: hostile });
    expect(email.html).not.toMatch(/<img/i);
    expect(email.html).toContain("&lt;img");
    expect(email.text).toContain('<img src=x onerror="alert(1)">');
    for (const banned of ["storage/v1", "signedurl", "token=", "cid:"]) {
      expect(email.html.toLowerCase()).not.toContain(banned);
      expect(email.text.toLowerCase()).not.toContain(banned);
    }
  });
});
