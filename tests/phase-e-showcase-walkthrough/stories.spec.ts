import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { LOCAL_ADMIN, LOCAL_OWNER, LOCAL_PASSWORD } from "../../scripts/lib/showcase-local-login.mjs";
import { answerConditionStage } from "../e2e/support/actions";
import { REPO, db } from "./support";

/**
 * Engineering Phase E2B — the four showcase stories in the real app (local stack, synthetic dataset). Each story walks
 * the public scan page (identity, guide, manual, support / damage / return) and the admin side (queue, submissions,
 * rental evidence), takes screenshots into qa-artifacts/phase-e-showcase/ and records the routes it visited in
 * walkthrough-routes.json for the rehearsal report. Staff outbound and return run on a disposable seed asset, so the
 * curated history of the four showcase assets is not changed by them.
 */
test.describe.configure({ mode: "serial" });

type Dataset = {
  assets: { asset_code: string; asset_id: string; short_code: string; active_rental_session_id: string | null }[];
  stories: Record<string, { sessions: { key: string; reference: string; status: string; records: { key: string; reference: string; status: string }[] }[]; incidents: { key: string; record: { reference: string; status: string } | null }[] }>;
  rows: { asset_rental_sessions: { id: string; asset_id: string }[]; form_submissions: { id: string; asset_id: string; form_type: string; status: string; created_at: string }[] };
  pinned_ids: { key: string; id: string }[];
};
const DATASET = JSON.parse(readFileSync(path.join(REPO, "docs/phase-e/showcase/dataset.json"), "utf8")) as Dataset;
const OUT = path.join(REPO, "qa-artifacts", "phase-e-showcase");
const visited: { story: string; route: string; note: string }[] = [];
const asset = (code: string) => DATASET.assets.find((a) => a.asset_code === code) as Dataset["assets"][number];
const pinned = (key: string) => DATASET.pinned_ids.find((p) => p.key === key)?.id as string;
const sessionId = (code: string, key: string) => pinned(`session:${code}:final:${key}`);

async function shot(page: Page, story: string, name: string, note: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${story}-${name}.png`), fullPage: true });
  visited.push({ story, route: new URL(page.url()).pathname + new URL(page.url()).search, note });
}

/** Open a collapsed section (a details group) by its summary text. */
async function open(page: Page, section: string) {
  const group = page.getByRole("group").filter({ hasText: section }).first();
  if ((await group.getAttribute("open")) === null) await group.locator("summary").first().click();
}

/** The record shows this text somewhere (sections may be collapsed). */
const shows = (page: Page, text: string | RegExp) => expect(page.locator("body")).toContainText(text);

async function login(page: Page, email: string, landing: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${landing}`);
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "walkthrough-routes.json"), `${JSON.stringify(visited, null, 2)}\n`);
});

test("story 1 — EXCAVATOR-017: pictographic handoff, the manual, live acknowledgement and support", async ({ browser }) => {
  const ex017 = asset("EXCAVATOR-017");
  const renter = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await renter.goto(`/t/${ex017.short_code}`);
  await expect(renter.getByText("EXCAVATOR-017")).toBeVisible();
  await expect(renter.getByText("Bobcat E20", { exact: false }).first()).toBeVisible();
  await expect(renter.getByRole("link", { name: "Start-Up Guide" })).toBeVisible();
  await expect(renter.getByRole("link", { name: "Manual" })).toBeVisible();
  const prompt = renter.getByRole("dialog", { name: "Before you use this equipment" });
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await shot(renter, "017", "1-scan-acknowledgement-prompt", "public scan page: identity, Start-Up Guide, Manual, the active-rental acknowledgement prompt");
  await prompt.getByLabel("Your name").fill("Walkthrough renter (local)");
  await prompt.getByRole("checkbox").check();
  await prompt.getByRole("button", { name: "Acknowledge" }).click();
  await expect(prompt).toHaveCount(0);
  await renter.goto(`/forms/${ex017.short_code}/support`);
  await renter.getByLabel("Your name").fill("Walkthrough renter (local)");
  await renter.getByRole("textbox", { name: "Email" }).fill("walkthrough@phase-e-showcase.invalid");
  await renter.getByLabel("Describe the problem").fill("Where is the start-up guide on the phone page?");
  await renter.getByRole("button", { name: "Send support request" }).click();
  await renter.waitForURL(/\/support\/thanks/);
  await expect(renter.getByText(/^SUB-\d{4}-[0-9A-F]{6}$/)).toBeVisible();
  await shot(renter, "017", "2-support-sent", "support request sent: the renter sees the SUB reference");
  await renter.close();

  const page = await browser.newPage();
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  await expect(page.getByText("Unresolved damage on an available asset")).toBeVisible();
  await shot(page, "017", "3-dashboard-queue", "admin dashboard: the attention queue at the anchor");
  await page.goto(`/dashboard/rentals/${ex017.active_rental_session_id}`);
  await expect(page.getByRole("heading", { name: "Rental session condition" })).toBeVisible();
  await shows(page, "Harlow Excavating");
  await shows(page, "2 acknowledgements recorded");
  await open(page, "Photos by source");
  await expect(page.locator("details[open] img").first()).toBeVisible();
  await shot(page, "017", "4-active-rental-evidence", "rental evidence of the active rental: outbound photos, the renter's acknowledgement");
  await page.goto(`/dashboard/submissions?asset_id=${ex017.asset_id}&status=unresolved`);
  await shot(page, "017", "5-open-submissions", "the open items on 017: the reviewed operating question and the live support request");
  await page.close();
});

test("story 2 — EXCAVATOR-3015: connected condition evidence, a minor and a consequential issue", async ({ browser }) => {
  const ex3015 = asset("EXCAVATOR-3015");
  const page = await browser.newPage();
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  await page.goto(`/dashboard/rentals/${sessionId("EXCAVATOR-3015", "leak")}`);
  await open(page, "Differences");
  await shows(page, "Difference recorded");
  await open(page, "Staff return checklist");
  await shows(page, /Boom cylinder hose fitting/);
  await shot(page, "3015", "1-leak-rental-comparison", "the leak rental: outbound baseline vs staff return (hydraulics pass to fail), the weeping-fitting illustration");
  await page.goto(`/dashboard/rentals/${sessionId("EXCAVATOR-3015", "connected-clean")}`);
  await shot(page, "3015", "2-connected-clean-rental", "the connected clean rental: outbound, the renter's own return and the staff return");
  const staffReturn = pinned("staff_return:session:EXCAVATOR-3015:final:leak");
  await page.goto(`/dashboard/submissions/${staffReturn}`);
  await shows(page, /Boom cylinder hose fitting/);
  await shot(page, "3015", "3-staff-return-detail", "the consequential issue: the staff return with damage observed, status New");
  const tooth = pinned("damage_report:3015-worn-tooth");
  await page.goto(`/dashboard/submissions/${tooth}`);
  await shot(page, "3015", "4-worn-tooth-resolved", "the minor issue: a worn bucket tooth reported with a photo, resolved");
  await page.goto(`/dashboard/submissions?asset_id=${ex3015.asset_id}&status=unresolved`);
  await shot(page, "3015", "5-open-submissions", "the two open items on 3015: the renter's oil-drip report (reviewed) and the staff return (new)");
  await page.close();
});

test("story 3 — TRAILER-014: accessory accountability, lights, coupler and gate checks", async ({ browser }) => {
  const tr014 = asset("TRAILER-014");
  const renter = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await renter.goto(`/t/${tr014.short_code}`);
  await expect(renter.getByText("TRAILER-014")).toBeVisible();
  await shot(renter, "014", "1-scan-page", "public scan page: 35SA-12 identity, the Start-Up Guide and the owner's manual");
  await renter.close();
  const page = await browser.newPage();
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  await page.goto(`/dashboard/rentals/${sessionId("TRAILER-014", "pins-missing")}`);
  await open(page, "Differences");
  await shows(page, /Missing/);
  await shot(page, "014", "2-pins-missing-rental", "the current actionable item: safety-chain pins issued at outbound, missing at return");
  await page.goto(`/dashboard/rentals/${sessionId("TRAILER-014", "clean-previous")}`);
  await shot(page, "014", "3-clean-rental", "the current clean result: every accessory issued and returned, lights, coupler and gate checked");
  const straps = DATASET.stories["TRAILER-014"].incidents.find((i) => i.key === "014-straps-missing")?.record;
  expect(straps?.status).toBe("resolved");
  await page.goto(`/dashboard/submissions?asset_id=${tr014.asset_id}`);
  await shot(page, "014", "4-submissions", "the 014 history, including the resolved missing-straps return");
  await page.close();
});

test("story 4 — TRAILER-2041: support, troubleshooting and the return workflow", async ({ browser }) => {
  const tr2041 = asset("TRAILER-2041");
  const renter = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await renter.goto(`/t/${tr2041.short_code}`);
  await expect(renter.getByText("TRAILER-2041")).toBeVisible();
  await expect(renter.locator("body")).toContainText(/Hoist won.t lift/);
  await shot(renter, "2041", "1-scan-troubleshooting", "public scan page: the 14LP-14 troubleshooting steps the renter followed");
  const prompt = renter.getByRole("dialog", { name: "Before you use this equipment" });
  if (await prompt.isVisible().catch(() => false)) await prompt.getByRole("button", { name: "Dismiss for now" }).click();
  await renter.goto(`/forms/${tr2041.short_code}/return`);
  await answerConditionStage(renter, { damage: false });
  await renter.getByRole("button", { name: "Continue" }).click();
  await renter.getByRole("checkbox").check();
  await renter.getByRole("button", { name: "Review return checklist" }).click();
  await renter.getByRole("button", { name: "Submit return checklist" }).click();
  const dialog = renter.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Submit without photos" }).click();
  await renter.waitForURL(/\/return\/thanks/);
  await shot(renter, "2041", "2-renter-return-sent", "the renter's return checklist at drop-off");
  await renter.close();

  const page = await browser.newPage();
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  const item = page.getByText("Return checklist received while still rented");
  await expect(item).toBeVisible();
  await item.click();
  await shot(page, "2041", "3-queue-return-while-rented", "the queue now asks to mark 2041 returned (the support request stays open)");
  const client = await db();
  try {
    const latest = (await client.query(`select id from public.form_submissions where asset_id = $1 and form_type = 'return_checklist' and submission_origin = 'public' order by created_at desc limit 1`, [tr2041.asset_id])).rows[0].id as string;
    await page.goto(`/dashboard/submissions/${latest}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Mark returned & resolve" }).click();
    await expect(page.locator("body")).toContainText(/returned/i);
    await shot(page, "2041", "4-marked-returned", "the renter's return opened from the queue and marked returned & resolved: the rental closes");
    await page.goto(`/dashboard/submissions?asset_id=${tr2041.asset_id}&status=unresolved`);
    await shot(page, "2041", "5-open-support", "after the return: the hoist support request is still open for follow-up");
    await page.close();
    const row = (await client.query(`select active_rental_session_id from public.assets where id = $1`, [tr2041.asset_id])).rows[0];
    expect(row.active_rental_session_id).toBeNull();
  } finally {
    await client.end();
  }
});

test("staff outbound and return on a disposable seed asset leave the curated history untouched", async ({ browser }) => {
  const client = await db();
  const before = (await client.query(`select count(*)::int as n from public.form_submissions where id = any($1::uuid[])`, [DATASET.rows.form_submissions.map((r) => r.id)])).rows[0].n;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  await page.goto("/staff/t/demo-gen008/outbound");
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review outbound inspection" }).click();
  await page.getByRole("button", { name: "Complete inspection & mark rented" }).click();
  let dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Submit without photos" }).click();
  await page.waitForURL(/\/staff\/t\/demo-gen008(\?|$)/);
  await shot(page, "staff", "1-outbound-done", "staff outbound on the disposable GEN-008: rental started");
  await page.goto("/staff/t/demo-gen008/return");
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByRole("button", { name: "Complete return checklist" }).click();
  dialog = page.locator("dialog[open]");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Submit without photos" }).click();
  await page.waitForURL(/\/return\/complete/);
  await shot(page, "staff", "2-return-done", "staff return on GEN-008: rental closed, asset available");
  await page.close();
  try {
    const after = (await client.query(`select count(*)::int as n from public.form_submissions where id = any($1::uuid[])`, [DATASET.rows.form_submissions.map((r) => r.id)])).rows[0].n;
    expect(after).toBe(before);
  } finally {
    await client.end();
  }
});

test("analytics for the admin, and the owner report labels Northridge as demo data", async ({ browser }) => {
  const page = await browser.newPage();
  await login(page, LOCAL_ADMIN.email, "/dashboard");
  await page.goto("/dashboard/analytics?range=30");
  await expect(page.locator("body")).toContainText(/scan/i);
  await shot(page, "analytics", "1-dashboard-analytics-30d", "the admin analytics over 30 days (relative to today)");
  await page.close();
  const owner = await browser.newPage();
  await login(owner, LOCAL_OWNER.email, "/owner");
  await owner.goto("/owner/analytics");
  await expect(owner.getByText("Demo data · synthetic history")).toBeVisible();
  await shot(owner, "analytics", "2-owner-report-demo-label", "the platform owner report: Northridge labelled demo data, exact counts");
  await owner.close();
});
