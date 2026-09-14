import { describe, expect, it } from "vitest";

import { CLEAN_FLAGS, cleanGeneratorValues, returnRowV2, templateV2_20260702 } from "./__fixtures__/rows";
import {
  digestCounters,
  digestOrigins,
  groupDigestItems,
  isDigestMode,
  limitDigestSections,
  projectDigestItem,
  sortDigestItems,
  type DigestAsset,
  type DigestItem,
  type DigestReturnRow,
} from "./digest";
import { DIGEST_MAX_ASSET_GROUPS, DIGEST_MAX_ITEMS, buildReturnDigestEmail, returnDigestSubject } from "./email";
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
const v2 = (values: Record<string, unknown>) =>
  returnRowV2({ template: templateV2_20260702(), values: { ...cleanGeneratorValues(), ...values }, flags: CLEAN_FLAGS })
    .submission_data_json;
const failedCheck = () => v2({ oil_level: "fail" });
const notOperating = () => v2({ starts_operates: "no" });
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
      status: "resolved",
      open: false,
      source: "staff",
      sourceLabel: "Staff",
      assetId: ASSET.id,
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

  it("classifies each return by its most serious issue and states which operating check was answered No", () => {
    const stopped = projectDigestItem(row(notOperating()), ASSET, SITE)!;
    expect(stopped.exceptions).toEqual(["Answered No: Starts / operates?"]);
    expect(stopped).toMatchObject({ kinds: ["not_operating"], issueClass: 1, exceptionCount: 1 });
    expect(projectDigestItem(row(failedCheck()), ASSET, SITE)).toMatchObject({ kinds: ["failed_check"], issueClass: 2 });
    expect(projectDigestItem(row(V1_MISSING_ACCESSORY), ASSET, SITE)).toMatchObject({
      kinds: ["missing_accessory"],
      issueClass: 3,
    });
    expect(projectDigestItem(row({ damage_observed: "yes", accessories_returned: "no" }), ASSET, SITE)).toMatchObject({
      kinds: ["damage", "missing_accessory"],
      issueClass: 1,
      exceptionCount: 2,
    });
  });

  it("carries the rental session only as an id for grouping", () => {
    const item = projectDigestItem(row(V1_DAMAGE, { rental_session_id: "s0000000-0000-4000-8000-000000000001" }), ASSET, SITE);
    expect(item?.rentalSessionId).toBe("s0000000-0000-4000-8000-000000000001");
    expect(projectDigestItem(row(V1_DAMAGE), ASSET, SITE)?.rentalSessionId).toBeNull();
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

// ---------------------------------------------------------------------------
// D5.1 grouping, counters and the display cap
// ---------------------------------------------------------------------------

const assetN = (n: number, code = `GEN-${String(n).padStart(3, "0")}`): DigestAsset => ({
  id: `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  asset_code: code,
  asset_name: `Generator ${n}`,
});
const at = (minutes: number) => new Date(Date.UTC(2026, 6, 14, 0, minutes)).toISOString();

function itemFor(
  data: unknown,
  asset: DigestAsset | null,
  overrides: Partial<DigestReturnRow> = {}
): DigestItem {
  return projectDigestItem(row(data, { asset_id: asset?.id ?? null, ...overrides }), asset, SITE)!;
}

describe("groupDigestItems", () => {
  it("one card per asset, in the section of its most serious open return; all-handled assets last", () => {
    const [a1, a2, a3, a4] = [assetN(1), assetN(2), assetN(3), assetN(4)];
    const handledDamage = itemFor(V1_DAMAGE, a1, { status: "resolved", created_at: at(1) });
    const openAccessory = itemFor(V1_MISSING_ACCESSORY, a1, { created_at: at(2) });
    const reviewedCheck = itemFor(failedCheck(), a2, { status: "reviewed", created_at: at(3) });
    const archivedDamage = itemFor(V1_DAMAGE, a3, { status: "archived", created_at: at(4) });
    const damage = itemFor(V1_DAMAGE, a4, { created_at: at(5) });
    const check = itemFor(failedCheck(), a4, { created_at: at(6) });

    const sections = groupDigestItems(
      sortDigestItems([handledDamage, openAccessory, reviewedCheck, archivedDamage, damage, check])
    );
    expect(sections.map((section) => section.key)).toEqual([
      "damage_or_not_operating",
      "failed_checks",
      "missing_accessories",
      "handled",
    ]);
    const codes = sections.map((section) => section.groups.map((group) => group.assetCode));
    expect(codes).toEqual([["GEN-004"], ["GEN-002"], ["GEN-001"], ["GEN-003"]]);
    // The resolved damage stays on its asset's card, after the open return.
    expect(sections[2].groups[0].items.map((item) => item.id)).toEqual([openAccessory.id, handledDamage.id]);
    expect(sections[2].groups[0]).toMatchObject({ openCount: 1, exceptionCount: 2, leadClass: 3 });
    expect(sections.flatMap((section) => section.groups).length).toBe(4);
    expect(sections.reduce((sum, section) => sum + section.itemCount, 0)).toBe(6);
  });

  it("never merges returns that have no asset", () => {
    const sections = groupDigestItems([itemFor(V1_DAMAGE, null), itemFor(V1_DAMAGE, null)]);
    expect(sections[0].groups).toHaveLength(2);
    expect(sections[0].groups[0].assetCode).toBeNull();
  });

  it("orders items inside a card by status, then issue, then oldest", () => {
    const asset = assetN(1);
    const resolved = itemFor(V1_DAMAGE, asset, { status: "resolved", created_at: at(1) });
    const reviewed = itemFor(V1_DAMAGE, asset, { status: "reviewed", created_at: at(2) });
    const newAccessory = itemFor(V1_MISSING_ACCESSORY, asset, { created_at: at(3) });
    const newDamageLater = itemFor(V1_DAMAGE, asset, { created_at: at(5) });
    const newDamage = itemFor(V1_DAMAGE, asset, { created_at: at(4) });
    const [card] = groupDigestItems([resolved, reviewed, newAccessory, newDamageLater, newDamage])[0].groups;
    expect(card.items.map((item) => item.id)).toEqual([
      newDamage.id,
      newDamageLater.id,
      newAccessory.id,
      reviewed.id,
      resolved.id,
    ]);
  });

  it("orders cards by a New lead return, then the oldest lead return, then asset code", () => {
    const reviewedOldest = itemFor(V1_DAMAGE, assetN(1, "GEN-100"), { status: "reviewed", created_at: at(1) });
    const newLatest = itemFor(V1_DAMAGE, assetN(2, "GEN-200"), { created_at: at(9) });
    const newTieB = itemFor(V1_DAMAGE, assetN(3, "GEN-300"), { created_at: at(5) });
    const newTieA = itemFor(V1_DAMAGE, assetN(4, "GEN-050"), { created_at: at(5) });
    const [section] = groupDigestItems([reviewedOldest, newLatest, newTieB, newTieA]);
    expect(section.groups.map((group) => group.assetCode)).toEqual(["GEN-050", "GEN-300", "GEN-200", "GEN-100"]);
  });

  it("marks later returns from the same rental session without merging them", () => {
    const asset = assetN(1);
    const first = itemFor(V1_DAMAGE, asset, { created_at: at(1), rental_session_id: "s1" });
    const second = itemFor(V1_MISSING_ACCESSORY, asset, { created_at: at(2), rental_session_id: "s1" });
    const other = itemFor(V1_DAMAGE, asset, { created_at: at(3), rental_session_id: "s2" });
    const [card] = groupDigestItems([first, second, other])[0].groups;
    expect(card.items).toHaveLength(3);
    expect(card.sameSession).toEqual({ [second.id]: first.reference });
  });
});

describe("digestCounters", () => {
  it("counts every return once, under its most serious issue", () => {
    const items = [
      itemFor({ damage_observed: "yes", accessories_returned: "no" }, assetN(1)),
      itemFor(notOperating(), assetN(2), { status: "reviewed" }),
      itemFor(failedCheck(), assetN(3), { status: "resolved" }),
      itemFor(V1_MISSING_ACCESSORY, assetN(4), { status: "archived" }),
      itemFor(V1_MISSING_ACCESSORY, assetN(5)),
    ];
    const counters = digestCounters(items);
    expect(counters).toEqual({
      total: 5,
      open: 3,
      newCount: 2,
      reviewed: 1,
      handled: 2,
      damageOrNotOperating: 2,
      failedChecks: 1,
      missingAccessories: 2,
    });
    expect(counters.damageOrNotOperating + counters.failedChecks + counters.missingAccessories).toBe(counters.total);
  });
});

describe("limitDigestSections", () => {
  it("stops at the first card that does not fit, so the order keeps its meaning", () => {
    const big = Array.from({ length: 10 }, (_, i) => itemFor(V1_DAMAGE, assetN(1), { created_at: at(i) }));
    const overflow = Array.from({ length: 6 }, (_, i) => itemFor(V1_DAMAGE, assetN(2), { created_at: at(20 + i) }));
    const small = [itemFor(V1_MISSING_ACCESSORY, assetN(3), { created_at: at(40) })];
    const limited = limitDigestSections(groupDigestItems([...big, ...overflow, ...small]), { maxRows: 15, maxGroups: 10 });
    expect(limited).toMatchObject({ shownRows: 10, shownGroups: 1, totalRows: 17, totalGroups: 3 });
    expect(limited.sections.flatMap((section) => section.groups.map((group) => group.assetCode))).toEqual(["GEN-001"]);
  });

  it(`shows at most ${DIGEST_MAX_ASSET_GROUPS} asset cards`, () => {
    const items = Array.from({ length: 12 }, (_, i) => itemFor(V1_DAMAGE, assetN(i + 1), { created_at: at(i) }));
    const limited = limitDigestSections(groupDigestItems(items), { maxRows: 15, maxGroups: DIGEST_MAX_ASSET_GROUPS });
    expect(limited).toMatchObject({ shownRows: 10, shownGroups: 10, totalRows: 12, totalGroups: 12 });
  });

  it("shows part of a first card that alone exceeds the row cap", () => {
    const items = Array.from({ length: 20 }, (_, i) => itemFor(V1_DAMAGE, assetN(1), { created_at: at(i) }));
    const limited = limitDigestSections(groupDigestItems(items), { maxRows: 15, maxGroups: 10 });
    expect(limited.shownRows).toBe(15);
    expect(limited.sections[0].groups[0]).toMatchObject({ hiddenItems: 5 });
    expect(limited.sections[0].groups[0].items).toHaveLength(15);
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

  it("lists each item with source, status, submitted time, reference, photos, exceptions and its link", () => {
    const list = items(2, { submission_origin: "staff", status: "reviewed" });
    const email = buildReturnDigestEmail({ ...base, items: list });
    for (const item of list) {
      expect(email.text).toContain(`Reference: ${item.reference}`);
      expect(email.text).toContain(`Open return checklist: ${item.recordUrl}`);
    }
    expect(email.text).toContain("GEN-003 — Portable Generator · 2 returns · 2 open · 2 exceptions");
    expect(email.text).toMatch(/Staff return · Reviewed · Submitted \w{3}, \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M Pacific/);
    expect(email.text).toContain("- Damage");
    expect(email.text).toContain("Photos: none");
    expect(email.text).toContain("current status");
    expect(email.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it("leads with counters and the inbox button, groups by section and asset, and repeats the button at the end", () => {
    const [a1, a2, a3] = [assetN(1), assetN(2), assetN(3)];
    const list = sortDigestItems([
      itemFor(V1_DAMAGE, a1, { created_at: at(1) }),
      itemFor(V1_MISSING_ACCESSORY, a1, { status: "reviewed", created_at: at(2) }),
      itemFor(failedCheck(), a2, { created_at: at(3) }),
      itemFor(V1_DAMAGE, a3, { status: "resolved", submission_origin: "staff", created_at: at(4) }),
    ]);
    const { text } = buildReturnDigestEmail({ ...base, items: list });
    const order = [
      "Returns with exceptions: 4",
      "Still open: 3 (2 new, 1 reviewed)",
      "Resolved or archived: 1",
      "Damage or does not operate: 2",
      "Failed condition checks: 1",
      "Missing accessories: 1",
      "Each return is counted once, under its most serious issue.",
      `View open return checklists: ${base.inboxUrl}`,
      "DAMAGE OR DOES NOT OPERATE — 1 asset · 2 returns",
      "GEN-001 — Generator 1 · 2 returns · 2 open · 2 exceptions",
      "FAILED CONDITION CHECKS — 1 asset · 1 return",
      "RESOLVED OR ARCHIVED — 1 asset · 1 return",
      "Staff return · Resolved",
      "You are receiving this",
    ].map((token) => text.indexOf(token));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(text.split(`View open return checklists: ${base.inboxUrl}`)).toHaveLength(3);
    expect(text).not.toContain("MISSING ACCESSORIES —");
    expect(text).not.toContain("Showing ");
  });

  it("omits a class counter with no returns", () => {
    const { text } = buildReturnDigestEmail({ ...base, items: items(2) });
    expect(text).toContain("Damage or does not operate: 2");
    expect(text).not.toMatch(/Failed condition checks: |Missing accessories: /);
  });

  it("marks a return from the same rental session as an earlier one", () => {
    const first = itemFor(V1_DAMAGE, assetN(1), { created_at: at(1), rental_session_id: "s1" });
    const second = itemFor(V1_DAMAGE, assetN(1), { created_at: at(2), rental_session_id: "s1" });
    const { text } = buildReturnDigestEmail({ ...base, items: [first, second] });
    expect(text).toContain(`Same rental session as ${first.reference}`);
    expect(text).not.toContain("s1");
  });

  it(`shows at most ${DIGEST_MAX_ITEMS} returns and says how many more exist`, () => {
    const email = buildReturnDigestEmail({ ...base, items: items(31) });
    expect(email.subject).toBe("Return exceptions summary - 31 returns with exceptions");
    expect(email.text.match(/Reference: /g)).toHaveLength(DIGEST_MAX_ITEMS);
    expect(email.text).toContain("16 more returns for this asset are in Submissions.");
    expect(email.text).toContain(
      `Showing ${DIGEST_MAX_ITEMS} of 31 returns from 1 of 1 asset. The rest are in Submissions: ${base.inboxUrl}`
    );
  });

  it("stays within the size budget at the cap", () => {
    const data = [V1_DAMAGE, failedCheck(), V1_MISSING_ACCESSORY, notOperating(), { damage_observed: "yes", accessories_returned: "no" }];
    const statuses = ["new", "reviewed", "new", "resolved", "new", "archived"];
    const list = sortDigestItems(
      Array.from({ length: 40 }, (_, i) =>
        itemFor(data[i % data.length], { ...assetN((i % 15) + 1), asset_name: `Generator ${"x".repeat(100)}` }, {
          status: statuses[i % statuses.length],
          created_at: at(i),
        })
      )
    );
    const email = buildReturnDigestEmail({ ...base, items: list });
    expect(Buffer.byteLength(email.html, "utf8")).toBeLessThanOrEqual(75_000);
    expect(Buffer.byteLength(email.text, "utf8")).toBeLessThanOrEqual(30_000);
    expect(email.text).toMatch(/Showing \d+ of 40 returns from \d+ of 15 assets\./);
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
