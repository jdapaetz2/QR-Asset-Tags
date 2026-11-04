import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { LOCAL_ADMIN, LOCAL_OWNER, LOCAL_PASSWORD } from "../../scripts/lib/showcase-local-login.mjs";
import { answerConditionStage } from "../e2e/support/actions";
import { NORTHRIDGE, REPO, db } from "./support";

/**
 * Engineering Phase E2B / E2C — the four showcase stories in the real app (local stack, synthetic dataset). Each story
 * walks the public scan page (identity, manual, demo notice, support / damage / return) and the admin side (queue,
 * submissions, rental evidence), takes screenshots into qa-artifacts/phase-e-showcase/ and records the routes it visited
 * in walkthrough-routes.json for the rehearsal report. Staff outbound and return run on a disposable seed asset, so the
 * curated history of the four showcase assets is not changed by them. E2C adds the operator's Demo-plan step in the owner
 * UI, the check that no page offers the parked Start-Up Guides, and an axe accessibility scan of the public pages.
 */
test.describe.configure({ mode: "serial" });

const AXE = path.join(REPO, "node_modules", "axe-core", "axe.min.js");
const accessibility: { route: string; violations: { id: string; impact: string; nodes: number }[] }[] = [];

/** axe-core on the current page (WCAG 2.1 A/AA rules); serious or critical findings fail the walkthrough. */
async function axeCheck(page: Page) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    const run = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } }).axe.run;
    const r = await run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact ?? "minor", nodes: v.nodes.length }));
  });
  accessibility.push({ route: new URL(page.url()).pathname, violations: result });
  const blocking = result.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking, `${new URL(page.url()).pathname}: ${JSON.stringify(blocking)}`).toEqual([]);
}

type Box = { x: number; y: number; width: number; height: number };
const keyboard: { route: string; controls: number; stops: string[]; skipped: string[]; out_of_order: string[]; no_visible_focus: string[]; small_targets: string[] }[] = [];

/**
 * What axe cannot see (E2C Gate A): Tab reaches every control in DOM order, and each focused control visibly changes on
 * screen (compared pixel for pixel with the unfocused page). Both are asserted. Touch targets are measured against the
 * 44 x 44 px design rule (a checkbox, radio or file input by its label, which is what a finger presses; inline text
 * links exempt) and recorded in keyboard-targets.json, not asserted: the shared public components have known targets
 * under 44 px that predate Phase E (E2C Gate A finding, recorded in docs/phase-e/E2C_APPROVAL_PACKET.md).
 */
async function keyboardAndTargets(page: Page) {
  const route = new URL(page.url()).pathname;
  await page.mouse.move(0, 0);
  const controls = await page.evaluate(() => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !(el as HTMLButtonElement).disabled && !el.closest("[inert]");
      })
      .map((el, index) => {
        el.dataset.kbd = String(index);
        const toggle = el.matches('input[type="checkbox"], input[type="radio"], input[type="file"]');
        const label = toggle ? (el.closest("label") ?? (el.id ? document.querySelector<HTMLElement>(`label[for="${el.id}"]`) : null)) : null;
        const r = (label ?? el).getBoundingClientRect();
        const text = (el.getAttribute("aria-label") || el.innerText || label?.innerText || el.getAttribute("name") || "").trim().replace(/\s+/g, " ");
        return {
          index,
          name: `${el.tagName.toLowerCase()}${el.getAttribute("type") ? `[${el.getAttribute("type")}]` : ""} "${text.slice(0, 48)}"`,
          radioGroup: el.matches('input[type="radio"]') ? (el as HTMLInputElement).name : null,
          inline: el.tagName === "A" && getComputedStyle(el).display === "inline",
          box: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
        };
      });
  });
  const clip = (b: Box) => ({ x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), width: b.width + 12, height: b.height + 12 });
  const shotOf = (b: Box) => page.screenshot({ fullPage: true, clip: clip(b), animations: "disabled", caret: "hide" });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before = new Map<number, Buffer>();
  for (const c of controls) before.set(c.index, await shotOf(c.box));
  // Start sequential navigation at the top of the document.
  await page.evaluate(() => {
    const start = document.createElement("span");
    start.tabIndex = -1;
    start.id = "kbd-start";
    document.body.prepend(start);
    start.focus();
  });
  const stops: number[] = [];
  const noFocus: string[] = [];
  for (let i = 0; i < controls.length + 3; i += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kbd ?? null);
    if (at === null) break; // focus left the page's controls (end of the document)
    const index = Number(at);
    if (stops.includes(index)) break;
    stops.push(index);
    const control = controls[index];
    if ((await shotOf(control.box)).equals(before.get(index) as Buffer)) noFocus.push(control.name);
  }
  await page.evaluate(() => document.getElementById("kbd-start")?.remove());
  const reachedGroups = new Set(stops.map((s) => controls[s].radioGroup).filter(Boolean));
  const skipped = controls.filter((c) => !stops.includes(c.index) && !(c.radioGroup && reachedGroups.has(c.radioGroup))).map((c) => c.name);
  const outOfOrder = stops.filter((s, i) => i > 0 && s < stops[i - 1]).map((s) => controls[s].name);
  const small = controls
    .filter((c) => !c.inline && (c.box.width < 44 || c.box.height < 44))
    .map((c) => `${c.name} ${Math.round(c.box.width)}x${Math.round(c.box.height)}`);
  keyboard.push({ route, controls: controls.length, stops: stops.map((s) => controls[s].name), skipped, out_of_order: outOfOrder, no_visible_focus: noFocus, small_targets: small });
  expect.soft(skipped, `${route}: controls Tab never reaches`).toEqual([]);
  expect.soft(outOfOrder, `${route}: Tab order differs from the page order`).toEqual([]);
  expect.soft(noFocus, `${route}: focused controls with no visible change`).toEqual([]);
}

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
  writeFileSync(path.join(OUT, "accessibility.json"), `${JSON.stringify(accessibility, null, 2)}\n`);
  writeFileSync(path.join(OUT, "keyboard-targets.json"), `${JSON.stringify(keyboard, null, 2)}\n`);
});

test("the operator's step — the owner puts Northridge on the Demo plan, and every showcase page says so", async ({ browser }) => {
  const owner = await browser.newPage();
  await login(owner, LOCAL_OWNER.email, "/owner");
  await owner.goto(`/owner/organizations/${NORTHRIDGE}/settings`);
  await owner.getByLabel("Preset").selectOption("demo");
  await owner.getByRole("button", { name: "Save plan settings" }).click();
  await expect(owner.getByLabel("Preset")).toHaveValue("demo");
  await shot(owner, "e2c", "1-owner-demo-plan", "the owner sets Northridge's plan to Demo (not billed)");
  await owner.close();
  const renter = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const a of DATASET.assets) {
    await renter.goto(`/t/${a.short_code}`);
    await expect(renter.getByText(a.asset_code)).toBeVisible();
    await expect(renter.locator("[data-demo-notice]")).toContainText("fictional");
    // The Start-Up Guides are parked (operator, 2026-11-02): no page offers one.
    await expect(renter.getByRole("link", { name: "Start-Up Guide" })).toHaveCount(0);
    const prompt = renter.getByRole("dialog", { name: "Before you use this equipment" });
    if (await prompt.isVisible().catch(() => false)) await prompt.getByRole("button", { name: "Dismiss for now" }).click();
    await axeCheck(renter);
    await keyboardAndTargets(renter);
  }
  const ex017 = asset("EXCAVATOR-017");
  for (const form of ["support", "damage", "return"]) {
    await renter.goto(`/forms/${ex017.short_code}/${form}`);
    await expect(renter.locator("[data-demo-notice]")).toBeVisible();
    await axeCheck(renter);
    await keyboardAndTargets(renter);
  }
  await renter.close();
});

test("story 1 — EXCAVATOR-017: the handoff, the manual, live acknowledgement and support", async ({ browser }) => {
  const ex017 = asset("EXCAVATOR-017");
  const renter = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await renter.goto(`/t/${ex017.short_code}`);
  await expect(renter.getByText("EXCAVATOR-017")).toBeVisible();
  await expect(renter.getByText("Bobcat E20", { exact: false }).first()).toBeVisible();
  await expect(renter.locator("body")).toContainText("Northridge walks you through start-up and the controls at handover");
  // Without a guide, the Manual is both the page's action and the sticky bar's cell.
  await expect(renter.getByRole("link", { name: "Manual" }).first()).toBeVisible();
  const prompt = renter.getByRole("dialog", { name: "Before you use this equipment" });
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await shot(renter, "017", "1-scan-acknowledgement-prompt", "public scan page: identity, the handover wording, Manual, the active-rental acknowledgement prompt");
  await prompt.getByLabel("Your name").fill("Walkthrough renter (local)");
  await prompt.getByRole("checkbox").check();
  await prompt.getByRole("button", { name: "Acknowledge" }).click();
  await expect(prompt).toHaveCount(0);
  await renter.goto(`/forms/${ex017.short_code}/support`);
  await renter.getByLabel("Your name").fill("Walkthrough renter (local)");
  await renter.getByRole("textbox", { name: "Email" }).fill("walkthrough@phase-e-showcase.invalid");
  await renter.getByLabel("Describe the problem").fill("Can someone walk our second operator through start-up again at the yard?");
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
  await expect(renter.locator("img[alt='Trailer 014']")).toBeVisible();
  await shot(renter, "014", "1-scan-page", "public scan page: 35SA-12 identity, the Big Tex cover with its credit and the owner's manual");
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
