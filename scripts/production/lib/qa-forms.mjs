/**
 * Shared pieces of the Production notification QA tools (Engineering Phases D4 and D5): the fixed QA fixtures, the
 * target guard, the recipient allowlist, settings snapshot/restore, generated photos, and browser drivers for the
 * public damage, support and return forms and the staff outbound/return workflows.
 *
 * Every write these helpers make is confined to the Production QA organization, asset and tag
 * (docs/PHASE_C_BASELINE.md §15). Nothing here accepts an organization, asset, short code or recipient from the
 * command line, and nothing prints a key, a non-allowlisted address, a storage path or a signed URL.
 *
 * Form selectors mirror tests/e2e/support/actions.ts and tests/e2e/public/triage.spec.ts.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { assertTarget } from "../../lib/env-target.mjs";

export const QA_ORG_ID = "c0000000-0000-4000-8000-00000000c0a1";
export const QA_ASSET_ID = "c0000000-0000-4000-8000-00000000c0a2";
export const QA_SHORT_CODE = "prod-qa-perf-probe";
export const BASE = "https://mulemark.io";

/** Passed to assertTarget so the staging project is recognised and refused by name. Public, not a secret. */
const KNOWN_STAGING_REF = "kwserenxwjxozztyigmw";

export const SUPPORT_RECIPIENT = "support@mulemark.io";
export const SANDBOX_RECIPIENT = "delivered@resend.dev";

/**
 * Engineering Phase D5.1 — an optional operator mailbox for direct email-client checks (for example Outlook), read from
 * QA_OPERATOR_RECIPIENT in the gitignored .env.production-perf.local. It joins the allowlist under the alias
 * "operator" and is never printed or written to an artifact. A value that is not a plain address, or that is a
 * mulemark.io address (support@ has its own route), is refused.
 */
function readOperatorRecipient() {
  const raw = (process.env.QA_OPERATOR_RECIPIENT ?? "").trim().toLowerCase();
  if (!raw) return { address: null, problem: "QA_OPERATOR_RECIPIENT is not set in .env.production-perf.local." };
  if (raw.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(raw)) {
    return { address: null, problem: "QA_OPERATOR_RECIPIENT is not a plain email address (value not shown)." };
  }
  if (raw.endsWith("@mulemark.io")) {
    return { address: null, problem: "QA_OPERATOR_RECIPIENT must be outside mulemark.io; support@ already has its own route." };
  }
  return { address: raw, problem: null };
}

export const OPERATOR = readOperatorRecipient();

export const ALLOWED_RECIPIENTS = new Set([
  SUPPORT_RECIPIENT,
  SANDBOX_RECIPIENT,
  ...(OPERATOR.address ? [OPERATOR.address] : []),
]);

/** Aliases used in QA artifacts so reports name a route, not an address. */
export function recipientAlias(address) {
  if (address === null || address === undefined) return null;
  if (address === SUPPORT_RECIPIENT) return "support";
  if (address === SANDBOX_RECIPIENT) return "sandbox";
  if (OPERATOR.address && address === OPERATOR.address) return "operator";
  return "other";
}

/** The operator mailbox must not already receive any other organization's notifications (read-only check). */
export async function assertOperatorRecipientUnused(db) {
  if (!OPERATOR.address) throw new Error(OPERATOR.problem);
  const pattern = OPERATOR.address.replace(/[\\%_]/g, "\\$&");
  for (const column of ["notification_email", "urgent_notification_email"]) {
    const { data, error } = await db.from("organizations").select("id").neq("id", QA_ORG_ID).ilike(column, pattern).limit(1);
    if (error) throw new Error(`could not check the operator mailbox against organizations: ${error.message}`);
    if ((data ?? []).length > 0) {
      throw new Error("QA_OPERATOR_RECIPIENT is another organization's notification address; refusing to use it.");
    }
  }
}

/** Every notification column of `organizations` (0012, 0034). */
export const NOTIFICATION_COLUMNS =
  "notification_email, notify_damage_reports, notify_support_requests, notify_tag_request_updates, notify_urgent_reports, urgent_notification_email, return_notification_mode, notify_include_photo_previews";

/** Public media intake is 3/min and 15/hour per (action, ip, short code). 25 s keeps every burst inside a minute. */
export const INTERVAL_MS = 25_000;
export const REFERENCE_RE = /SUB-\d{4}-[0-9A-F]{6}/;
export const RATE_LIMITED_TEXT = "Too many attempts right now";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function refuse(tag, message) {
  console.error(`\n[${tag}] REFUSING TO RUN\n\n  ${message}\n`);
  process.exit(1);
}

/** First line of an error, bounded — never a response body. */
export function errorLine(err) {
  return String(err?.message ?? err).split("\n")[0].slice(0, 160);
}

// ---------------------------------------------------------------------------
// Target and settings
// ---------------------------------------------------------------------------

/** The Production service-role client, after proving the credentials are the Production project. */
export function connectProduction(tag) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl) refuse(tag, "NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) refuse(tag, "SUPABASE_SERVICE_ROLE_KEY is not set (never printed).");
  let target;
  try {
    target = assertTarget("production", { supabaseUrl, expectedStagingRef: KNOWN_STAGING_REF });
  } catch (err) {
    refuse(tag, err.message);
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { db, host: target.host };
}

/** Refuse any recipient column that is set to an address outside the allowlist. */
export function assertAllowlisted(settings, what) {
  for (const column of ["notification_email", "urgent_notification_email"]) {
    const value = settings[column];
    if (value && !ALLOWED_RECIPIENTS.has(value)) {
      throw new Error(`${what}: ${column} holds an address this tool did not set; refusing to touch it`);
    }
  }
}

export async function readQaSettings(db) {
  const { data, error } = await db.from("organizations").select(NOTIFICATION_COLUMNS).eq("id", QA_ORG_ID).maybeSingle();
  if (error) throw new Error(`could not read the QA organization: ${error.message}`);
  if (!data) throw new Error(`the QA organization ${QA_ORG_ID} does not exist on this project`);
  return data;
}

export async function applySettings(db, patch) {
  assertAllowlisted(patch, "settings patch");
  const { error } = await db.from("organizations").update(patch).eq("id", QA_ORG_ID);
  if (error) throw new Error(`settings update failed: ${error.message}`);
}

/** Write `original` back and prove every column reads back equal. */
export async function restoreSettings(db, original) {
  const { error } = await db.from("organizations").update(original).eq("id", QA_ORG_ID);
  if (error) return false;
  const after = await readQaSettings(db).catch(() => null);
  return Boolean(after) && Object.keys(original).every((key) => after[key] === original[key]);
}

/** The newest QA-organization submission of a type created at or after `since`, with its canonical reference. */
export async function findSubmission(db, { formType, origin = null, since, reference = null }) {
  let query = db
    .from("form_submissions")
    .select("id, created_at, form_type, submission_origin")
    .eq("organization_id", QA_ORG_ID)
    .eq("form_type", formType)
    .gte("created_at", new Date(since - 120_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (origin) query = query.eq("submission_origin", origin);
  const { data, error } = await query;
  if (error || !data) return null;
  const withRef = data.map((row) => ({ ...row, reference: submissionReference(row.id, row.created_at) }));
  return (reference ? withRef.find((row) => row.reference === reference) : withRef[0]) ?? null;
}

/** Mirrors lib/submissions/inbox.ts#submissionReference. */
export function submissionReference(id, createdAt) {
  const d = new Date(createdAt);
  const year = Number.isNaN(d.getTime()) ? "0000" : String(d.getUTCFullYear()).padStart(4, "0");
  const suffix = String(id ?? "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase().padEnd(6, "0");
  return `SUB-${year}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Generated photos — labelled so a human can match each preview to its scenario.
// ---------------------------------------------------------------------------

function labelSvg(width, height, lines) {
  const size = Math.round(height / 9);
  const text = lines
    .map((line, i) => `<text x="50%" y="${35 + i * 18}%" font-size="${size}" text-anchor="middle" font-family="Arial, sans-serif" fill="#ffffff" stroke="#000000" stroke-width="${Math.max(2, size / 18)}">${line}</text>`)
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${text}</svg>`);
}

/** A gradient with mild noise, so the JPEG is photo-sized rather than trivially compressible. */
function photoPixels(width, height, hue) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = hue * 7919 + 13;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const jitter = (seed & 0x3f) - 32;
      const i = (y * width + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, ((x / width) * 200 + hue) % 256 + jitter));
      pixels[i + 1] = Math.max(0, Math.min(255, (y / height) * 180 + jitter));
      pixels[i + 2] = Math.max(0, Math.min(255, 120 + jitter));
    }
  }
  return pixels;
}

export async function labelledPhoto({
  label,
  hue,
  banner = "MULEMARK QA",
  width = 2400,
  height = 1600,
  format = "jpeg",
  exif = null,
  orientation = null,
}) {
  let image = sharp(photoPixels(width, height, hue), { raw: { width, height, channels: 3 } }).composite([
    { input: labelSvg(width, height, [banner, label]), top: 0, left: 0 },
  ]);
  if (exif) image = image.withExif(exif);
  if (orientation) image = image.withMetadata({ orientation });
  const buffer =
    format === "png"
      ? await image.png().toBuffer()
      : format === "webp"
        ? await image.webp({ quality: 85 }).toBuffer()
        : await image.jpeg({ quality: 88 }).toBuffer();
  const ext = format === "jpeg" ? "jpg" : format;
  return { name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${ext}`, mimeType: `image/${format}`, buffer };
}

/**
 * A JPEG whose headers are valid (so the page keeps it and the server stores it — D4.1 reads the frame size) but which
 * ends before any image data, so decoding it for a preview fails.
 */
export async function corruptJpeg(name) {
  const real = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .jpeg()
    .toBuffer();
  let offset = 2;
  while (offset + 4 <= real.length && !(real[offset] === 0xff && real[offset + 1] === 0xda)) {
    offset += 2 + real.readUInt16BE(offset + 2);
  }
  return { name, mimeType: "image/jpeg", buffer: Buffer.concat([real.subarray(0, offset), Buffer.from([0xff, 0xd9])]) };
}

export const GPS_EXIF = {
  IFD0: { Make: "MulemarkQA", Model: "D4 GPS fixture", Copyright: "Mulemark QA test data" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "49/1 15/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "123/1 6/1 0/1" },
};

// ---------------------------------------------------------------------------
// Public form drivers
// ---------------------------------------------------------------------------

const STATE_GROUP = /Can the equipment be used\?/;
const NEED_GROUP = /How soon do you need help\?/;
const SEVERITY_GROUP = /How serious does the damage look\?/;
const ISSUE_GROUP = /What do you need help with\?/;

async function choose(page, group, label) {
  if (!label) return;
  await page.getByRole("group", { name: group }).getByText(label, { exact: true }).click();
}

/**
 * Fill and submit the public damage form. `triage` holds the renter-facing option labels to click (any may be omitted,
 * leaving the question unanswered). Returns the click time.
 */
export async function submitDamage(page, { description, name, email, phone = null, triage = {}, files = [] }) {
  await page.goto(`${BASE}/forms/${QA_SHORT_CODE}/damage`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill(name);
  if (email) await page.getByRole("textbox", { name: "Email" }).fill(email);
  if (phone) await page.getByRole("textbox", { name: "Phone" }).fill(phone);
  await choose(page, STATE_GROUP, triage.state);
  await choose(page, NEED_GROUP, triage.need);
  await choose(page, SEVERITY_GROUP, triage.severity);
  await page.getByLabel("What's damaged?").fill(description);
  if (files.length > 0) await page.locator('input[name="media"]').setInputFiles(files);
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Submit damage report" }).click();
  return clickedAt;
}

/** Fill and submit the public support form. `triage` holds `issue` and `need` option labels. */
export async function submitSupport(page, { description, name, email, phone = null, triage = {}, files = [] }) {
  await page.goto(`${BASE}/forms/${QA_SHORT_CODE}/support`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill(name);
  if (email) await page.getByRole("textbox", { name: "Email" }).fill(email);
  if (phone) await page.getByRole("textbox", { name: "Phone" }).fill(phone);
  await choose(page, ISSUE_GROUP, triage.issue);
  await choose(page, NEED_GROUP, triage.need);
  await page.getByLabel(/Describe the problem/).fill(description);
  if (files.length > 0) await page.locator('input[name="media"]').setInputFiles(files);
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Send support request" }).click();
  return clickedAt;
}

/**
 * Answer the guided inspection's Condition stage: every visible choice group gets its first option (Pass / Yes /
 * Returned), the damage question is set explicitly, then `answers` override individual fields by id
 * (`{ tires_wheels: "Fail" }`). Accessory items are marked separately by `applyAccessories`, on whichever stage
 * shows them.
 */
export async function answerConditionStage(page, { damage, answers = {} }) {
  const groups = page.locator('fieldset[id^="field-"]:visible');
  await groups.first().waitFor({ state: "visible", timeout: 30_000 });
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const id = (await group.getAttribute("id")) ?? "";
    // A click that lands before hydration is lost silently; confirm a choice registered and retry.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (/damage/.test(id)) await group.getByText(damage ? "Yes" : "No", { exact: true }).click();
      else await group.locator("label").first().click();
      const radios = await group.locator('input[type="radio"]').count();
      if (radios === 0 || (await group.locator('input[type="radio"]:checked').count()) > 0) break;
      await sleep(1_000);
    }
  }
  for (const [fieldId, label] of Object.entries(answers)) {
    await page.locator(`#field-${fieldId}`).getByText(label, { exact: true }).click();
  }
}

/**
 * Mark accessory items by item id and stored value (`{ straps: "missing" }`) when the accessories field is on screen.
 * Returns the ids still to mark, so callers can retry on the next stage.
 */
export async function applyAccessories(page, pending) {
  const remaining = { ...pending };
  if (Object.keys(remaining).length === 0) return remaining;
  if (!(await page.locator("#field-accessories").isVisible().catch(() => false))) return remaining;
  for (const [item, value] of Object.entries(remaining)) {
    await page.locator(`label:has(input[name="ui:answer:accessories:${item}"][value="${value}"])`).click();
    delete remaining[item];
  }
  return remaining;
}

/** The file inputs currently rendered for photo slots. */
async function slotNames(page) {
  return page.locator('input[type="file"][name^="photo:"]').evaluateAll((els) => els.map((el) => el.getAttribute("name")));
}

/**
 * Photo filling for the guided inspection. `photos.damage` goes to the damage slot (visible once damage = Yes);
 * `photos.other` to the first condition slot; `photos.eachCondition` (a factory) to every condition slot.
 */
function photoFiller(page, photos) {
  const state = {
    damageSet: (photos.damage ?? []).length === 0,
    otherSet: (photos.other ?? []).length === 0,
    additionalSet: (photos.additional ?? []).length === 0,
    filled: new Set(),
  };
  const fill = async () => {
    const names = (await slotNames(page)).filter(Boolean);
    if (!state.damageSet && names.includes("photo:damage_photos")) {
      await page.locator('input[name="photo:damage_photos"]').setInputFiles(photos.damage);
      state.damageSet = true;
    }
    if (!state.additionalSet && names.includes("photo:additional_photos")) {
      await page.locator('input[name="photo:additional_photos"]').setInputFiles(photos.additional);
      state.additionalSet = true;
    }
    const condition = names.filter((name) => name !== "photo:damage_photos" && name !== "photo:additional_photos");
    if (!state.otherSet && condition.length > 0) {
      await page.locator(`input[name="${condition[0]}"]`).setInputFiles(photos.other);
      state.filled.add(condition[0]);
      state.otherSet = true;
    }
    if (photos.eachCondition) {
      for (const [index, name] of condition.entries()) {
        if (state.filled.has(name)) continue;
        await page.locator(`input[name="${name}"]`).setInputFiles([await photos.eachCondition(index)]);
        state.filled.add(name);
      }
    }
  };
  return { fill, state };
}

async function fillDamageDetails(page, id) {
  await page.locator("#field-damage_location").fill("Left side panel (QA)");
  await page.locator("#field-damage_severity").getByText("Minor", { exact: true }).click();
  await page.locator("#field-damage_description").fill(`QA return damage (${id}). Automated test data.`);
}

/** Submit through the omission dialog when recommended photos were left empty — the submitter's own choice. */
async function confirmOmissionDialog(page) {
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialog.getByRole("button", { name: /Submit/ }).first().click();
  }
}

/** Public renter return checklist. Returns `{ clickedAt }` or `{ notRun }`. */
export async function submitReturn(page, { id, damage, answers = {}, accessories = {}, photos = {} }) {
  await page.goto(`${BASE}/forms/${QA_SHORT_CODE}/return`, { waitUntil: "domcontentloaded" });
  // `isVisible` does not wait; the wizard renders after hydration, so wait for it explicitly.
  const hasChecklist = await page
    .getByText(/Step 1 of 3/)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true, () => false);
  if (!hasChecklist) return { notRun: "the QA tag has no guided return checklist" };

  const filler = photoFiller(page, photos);
  await answerConditionStage(page, { damage, answers });
  let pendingAccessories = await applyAccessories(page, accessories);
  await filler.fill();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/Step 2 of 3/).first().waitFor({ timeout: 30_000 });

  if (damage) await fillDamageDetails(page, id);
  pendingAccessories = await applyAccessories(page, pendingAccessories);
  await filler.fill();
  if (Object.keys(pendingAccessories).length > 0) return { notRun: "the accessories question never appeared" };
  if (!filler.state.damageSet) return { notRun: "no damage photo slot appeared on the QA template" };
  if (!filler.state.otherSet) return { notRun: "no condition photo slot on the QA template" };
  if (!filler.state.additionalSet) return { notRun: "no additional photos slot on the QA template" };

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review return checklist" }).click();
  await page.getByText(/Step 3 of 3/).waitFor({ timeout: 30_000 });
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Submit return checklist" }).click();
  await confirmOmissionDialog(page);
  return { clickedAt };
}

/**
 * Wait for the confirmation page (or the rate-limit message). Returns `{ status, reference, confirmMs, note }` where
 * status is `submitted`, `rate limited` or `failed`.
 */
export async function awaitConfirmation(page, clickedAt) {
  await Promise.race([
    page.waitForURL(/\/thanks/, { timeout: 90_000 }),
    page.getByText(RATE_LIMITED_TEXT).first().waitFor({ state: "visible", timeout: 90_000 }),
  ]);
  if (await page.getByText(RATE_LIMITED_TEXT).first().isVisible().catch(() => false)) {
    return { status: "rate limited", reference: null, confirmMs: null, note: "" };
  }
  const text = (await page.getByText(REFERENCE_RE).first().textContent({ timeout: 30_000 })) ?? "";
  const match = text.match(REFERENCE_RE);
  const confirmMs = Date.now() - clickedAt;
  return match
    ? { status: "submitted", reference: match[0], confirmMs, note: "" }
    : { status: "failed", reference: null, confirmMs, note: "no reference on the confirmation page" };
}

/**
 * What the confirmation page shows (design §7.9 as built in components/public/form-thanks.tsx). Display facts only —
 * the tel: href is a QA phone number set on the QA asset by the caller.
 */
export async function captureConfirmation(page) {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const block = document.querySelector("[data-call-now]");
    const button = block ? block.querySelector('a[href^="tel:"]') : null;
    let widthRatio = null;
    if (button && block) {
      const style = getComputedStyle(block);
      const inner = block.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      widthRatio = inner > 0 ? Math.round((button.getBoundingClientRect().width / inner) * 100) / 100 : null;
    }
    return {
      url: location.pathname + location.search.replace(/ref=[^&]*/, "ref=…"),
      sentTo: /Sent to /.test(body),
      hasYourReport: /has your report\./.test(body),
      mentionsNotified: /notified/i.test(body),
      emergencyWording: /\b(911|emergency)\b/i.test(body),
      callNowFlag: /[?&]call=1\b/.test(location.search),
      callNowBlock: Boolean(block),
      callNowHeading: block ? (block.querySelector("h2")?.textContent ?? "").trim() : null,
      callButtonHref: button ? button.getAttribute("href") : null,
      callButtonLabel: button ? (button.textContent ?? "").trim() : null,
      callButtonWidthRatio: widthRatio,
      callButtonBackground: button ? getComputedStyle(button).backgroundColor : null,
      callBlockBorder: block ? getComputedStyle(block).borderTopColor : null,
      fallbackPhoneLine: block ? /Phone: /.test(block.textContent ?? "") : null,
      needHelpNow: /Need help now\?/.test(body),
    };
  });
}

// ---------------------------------------------------------------------------
// Staff drivers (authenticated QA admin session)
// ---------------------------------------------------------------------------

export async function login(page, { email, password, landing = "/dashboard" }) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${landing}**`, { timeout: 60_000 });
}

/**
 * Staff outbound inspection on the QA asset, opening a rental session when the asset is available. Returns
 * `{ mode }`: `created`, `attached`, or `blocked` (a session with a baseline already exists — nothing submitted).
 */
export async function submitStaffOutbound(page) {
  await page.goto(`${BASE}/staff/t/${QA_SHORT_CODE}/outbound`, { waitUntil: "domcontentloaded" });
  if (await page.getByText("An outbound inspection is already recorded for this rental session.").isVisible({ timeout: 10_000 }).catch(() => false)) {
    return { mode: "blocked" };
  }
  const gate = page.getByRole("button", { name: "Continue with this rental session" });
  const attach = await gate.isVisible({ timeout: 5_000 }).catch(() => false);
  if (attach) await gate.click();
  await answerConditionStage(page, { damage: false });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review outbound inspection" }).click();
  await page.getByRole("button", { name: attach ? "Complete outbound inspection" : "Complete inspection & mark rented" }).click();
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }
  await page.waitForURL(new RegExp(`/staff/t/${QA_SHORT_CODE}(\\?|$)`), { timeout: 60_000 });
  return { mode: attach ? "attached" : "created" };
}

/** Staff return checklist on the QA asset — completes the rental. Returns `{ clickedAt }` or `{ notRun }`. */
export async function submitStaffReturn(page, { id, damage, answers = {}, accessories = {} }) {
  await page.goto(`${BASE}/staff/t/${QA_SHORT_CODE}/return`, { waitUntil: "domcontentloaded" });
  const onForm = await page
    .getByRole("heading", { name: "Staff return checklist" })
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true, () => false);
  if (!onForm) return { notRun: "the QA asset has no active rental session to return" };
  await page.getByText(/Step 1 of 3/).first().waitFor({ state: "visible", timeout: 30_000 });
  await answerConditionStage(page, { damage, answers });
  let pendingAccessories = await applyAccessories(page, accessories);
  await page.getByRole("button", { name: "Continue" }).click();
  if (damage) await fillDamageDetails(page, id);
  pendingAccessories = await applyAccessories(page, pendingAccessories);
  if (Object.keys(pendingAccessories).length > 0) return { notRun: "the accessories question never appeared" };
  await page.getByRole("button", { name: "Review return checklist" }).click();
  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Complete return checklist" }).click();
  const dialog = page.locator("dialog[open]");
  if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialog.getByRole("button", { name: "Submit without photos" }).click();
  }
  await page.waitForURL(/\/return\/complete/, { timeout: 90_000 });
  return { clickedAt };
}
