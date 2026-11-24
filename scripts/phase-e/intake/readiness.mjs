/**
 * Engineering Phase E3 — readiness of an intake, under the content contract's §3 rules
 * (docs/phase-e/ONBOARDING_DATA_CONTRACT.md): row- and field-specific reasons, each with who acts.
 *
 * A reason is a blocker (who = "customer" or "mulemark") or a warning (who = null). Status, worst first:
 *   CUSTOMER_INPUT_REQUIRED  any customer blocker (a fact or file only the customer has)
 *   MULEMARK_REVIEW          otherwise any Mulemark blocker (authoring, bounded research, rights, review)
 *   READY_WITH_WARNINGS      otherwise any warning (accepted by the approver later)
 *   READY                    nothing at all
 * Assets inherit their model's reasons (and the company's support blocker when they have no support contact of their
 * own), so an asset is never better than its model. No count or percentage ever clears a blocker.
 *
 * Draft import (the "start" tier) needs only a unique code that is confirmed text, and a name.
 */
import { TABS, allFields } from "./field-mapping.mjs";
import {
  DOCUMENT_EXTENSIONS,
  DOCUMENT_MAX_BYTES,
  KIT,
  LISTS,
  LOGO_EXTENSIONS,
  PHOTO_EXTENSIONS,
  PHOTO_MAX_BYTES,
  isEmail,
  isHexColor,
  returnTemplateForCategory,
  telHref,
  yearProblem,
} from "./kit-config.mjs";
import { isUnknown } from "./read.mjs";

export const STATUSES = ["READY", "READY_WITH_WARNINGS", "CUSTOMER_INPUT_REQUIRED", "MULEMARK_REVIEW"];

const LABEL = new Map(allFields().map((f) => [f.key, f.label]));
const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const isUrl = (s) => typeof s === "string" && /^https?:\/\/\S+$/i.test(s);
const extOf = (s) => (String(s).match(/\.([a-z0-9]{2,5})$/i)?.[0] ?? "").toLowerCase();
const looksLikeFile = (s) => typeof s === "string" && !isUrl(s) && extOf(s) !== "" && !/\s{2,}/.test(s);
const baseName = (p) => String(p).split(/[\\/]/).pop();

export function statusOf(reasons) {
  if (reasons.some((r) => r.severity === "blocker" && r.who === "customer")) return "CUSTOMER_INPUT_REQUIRED";
  if (reasons.some((r) => r.severity === "blocker")) return "MULEMARK_REVIEW";
  if (reasons.some((r) => r.severity === "warning")) return "READY_WITH_WARNINGS";
  return "READY";
}

function reason({ level, ref, tab, row = null, cell = null, key = null, who = null, severity, code, message }) {
  return { level, ref, tab, row, cell, field: key ? (LABEL.get(key) ?? key) : null, key, who: severity === "warning" ? null : who, severity, code, message };
}

/** Index an upload listing [{ path, bytes }] by folder convention and by file name. */
export function indexUpload(upload) {
  if (!upload) return null;
  const byAsset = new Map();
  const byModel = new Map();
  const company = [];
  const byName = new Map();
  for (const item of upload) {
    const parts = String(item.path).normalize("NFC").split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1];
    const key = norm(name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
    if (parts.length >= 3 && norm(parts[0]) === "photos") {
      const k = norm(parts[1]);
      if (!byAsset.has(k)) byAsset.set(k, { folder: parts[1], items: [] });
      byAsset.get(k).items.push(item);
    } else if (parts.length >= 3 && norm(parts[0]) === "model documents") {
      const k = norm(parts[1]);
      if (!byModel.has(k)) byModel.set(k, { folder: parts[1], items: [] });
      byModel.get(k).items.push(item);
    } else if (parts.length >= 2 && norm(parts[0]) === "company") {
      company.push(item);
    }
  }
  return { items: upload, byAsset, byModel, company, has: (fileName) => byName.has(norm(baseName(fileName))) };
}

/**
 * Assess an intake (read.mjs). options.upload: [{ path, bytes }] or null (file presence is then not checked).
 * options.prepared: [{ model_name, model_key, content_version?, manual_cleared? }] for models with an approved reusable
 * pack; manual_cleared means the pack's manual and its rights were reviewed, so the manual answer needs no check.
 */
export function assessIntake(intake, { upload = null, prepared = [] } = {}) {
  const up = indexUpload(upload);
  const preparedBy = new Map(prepared.map((p) => [norm(p.model_name), p]));
  const companyReasons = [];
  const general = [];
  const cv = intake.company.values;
  const cRef = (key) => ({ level: "company", ref: "Company", tab: TABS.company, cell: intake.company.cells[key] ?? null, key });

  // ---------------------------------------------------------------- company and people
  const add = (list, r) => list.push(reason(r));
  if (!cv["company.name"]) add(companyReasons, { ...cRef("company.name"), who: "customer", severity: "blocker", code: "company-name", message: "Add your company name as renters should see it." });
  const phone = cv["company.support_phone"];
  const email = cv["company.support_email"];
  const phoneGiven = phone && !isUnknown(phone);
  const emailValid = email && !isUnknown(email) && isEmail(email);
  const supportMissing = !phoneGiven && !emailValid;
  if (supportMissing) add(companyReasons, { ...cRef("company.support_phone"), who: "customer", severity: "blocker", code: "support-missing", message: "Add a support phone or email. Renters need a way to reach you." });
  if (email && !isUnknown(email) && !isEmail(email)) add(companyReasons, { ...cRef("company.support_email"), who: "customer", severity: "blocker", code: "support-email-invalid", message: `The support email "${email}" doesn't look like an email address.` });
  if (phoneGiven && !telHref(phone)) add(companyReasons, { ...cRef("company.support_phone"), severity: "warning", code: "support-phone-not-dialable", message: `The support phone "${phone}" isn't a plain phone number, so pages won't show a Call button.` });
  const approverMissing = ["approver.name", "approver.title", "approver.email"].filter((k) => !cv[k] || isUnknown(cv[k]));
  if (approverMissing.length) add(companyReasons, { ...cRef(approverMissing[0]), who: "customer", severity: "blocker", code: "approver-missing", message: `Tell us who approves your pages: ${approverMissing.map((k) => LABEL.get(k).replace("Approver's ", "")).join(", ")}.` });
  if (cv["approver.email"] && !isUnknown(cv["approver.email"]) && !isEmail(cv["approver.email"])) add(companyReasons, { ...cRef("approver.email"), who: "customer", severity: "blocker", code: "approver-email-invalid", message: `The approver's email "${cv["approver.email"]}" doesn't look like an email address.` });
  const notif = cv["alerts.notification_email"];
  if (!notif || isUnknown(notif)) add(companyReasons, { ...cRef("alerts.notification_email"), who: "customer", severity: "blocker", code: "notification-email", message: "Add one email address for renter reports and daily summaries." });
  else if (!isEmail(notif)) add(companyReasons, { ...cRef("alerts.notification_email"), who: "customer", severity: "blocker", code: "notification-email-invalid", message: `The notification email "${notif}" doesn't look like an email address.` });
  const urgent = cv["alerts.urgent_email"];
  if (urgent && !isUnknown(urgent) && !isEmail(urgent)) add(companyReasons, { ...cRef("alerts.urgent_email"), who: "customer", severity: "blocker", code: "urgent-email-invalid", message: `The urgent email "${urgent}" doesn't look like one email address.` });
  const returnMode = cv["alerts.return_mode"];
  if (returnMode && !LISTS.returnEmails.includes(returnMode)) add(companyReasons, { ...cRef("alerts.return_mode"), who: "customer", severity: "blocker", code: "return-mode", message: `Return emails: pick one of ${LISTS.returnEmails.join(" / ")}.` });
  const color = cv["company.brand_color"];
  if (color === "Match our logo") add(companyReasons, { ...cRef("company.brand_color"), who: "mulemark", severity: "blocker", code: "brand-color-from-logo", message: "Pick the brand color from the logo." });
  else if (color && !isUnknown(color) && !isHexColor(color)) add(companyReasons, { ...cRef("company.brand_color"), who: "customer", severity: "blocker", code: "brand-color", message: `Brand color "${color}": use a color like #1D4ED8, or pick Match our logo.` });
  const logo = cv["company.logo_file"];
  if (logo && !isUnknown(logo)) {
    if (up && !up.has(logo)) add(companyReasons, { ...cRef("company.logo_file"), who: "customer", severity: "blocker", code: "logo-missing", message: `We couldn't find the logo "${logo}" in your upload.` });
    if ([".svg", ".pdf", ".ai", ".eps"].includes(extOf(logo))) add(companyReasons, { ...cRef("company.logo_file"), who: "mulemark", severity: "blocker", code: "logo-convert", message: `Convert the vector logo "${logo}" to PNG for the app.` });
    else if (!LOGO_EXTENSIONS.includes(extOf(logo))) add(companyReasons, { ...cRef("company.logo_file"), who: "customer", severity: "blocker", code: "logo-type", message: `The logo "${logo}" isn't an image we can use. Send a PNG or JPG.` });
  }
  const people = intake.people;
  const seenEmails = new Map();
  for (const p of people) {
    const pv = p.values;
    const ref = pv["people.name"] ?? pv["people.email"] ?? `row ${p.row}`;
    const base = { level: "company", ref, tab: TABS.company, row: p.row };
    if (!pv["people.email"]) add(companyReasons, { ...base, cell: p.cells["people.email"], key: "people.email", who: "customer", severity: "blocker", code: "person-email", message: `${ref}: add their email (each person signs in with their own).` });
    else if (!isEmail(pv["people.email"])) add(companyReasons, { ...base, cell: p.cells["people.email"], key: "people.email", who: "customer", severity: "blocker", code: "person-email-invalid", message: `${ref}: "${pv["people.email"]}" doesn't look like an email address.` });
    else {
      const k = norm(pv["people.email"]);
      if (seenEmails.has(k)) add(companyReasons, { ...base, cell: p.cells["people.email"], key: "people.email", who: "customer", severity: "blocker", code: "person-email-duplicate", message: `${ref}: the email ${pv["people.email"]} is listed twice (rows ${seenEmails.get(k)} and ${p.row}).` });
      else seenEmails.set(k, p.row);
    }
    if (!LISTS.role.includes(pv["people.role"])) add(companyReasons, { ...base, cell: p.cells["people.role"], key: "people.role", who: "customer", severity: "blocker", code: "person-role", message: `${ref}: pick Administrator or Staff.` });
  }
  if (!people.some((p) => p.values["people.role"] === "Administrator")) add(companyReasons, { level: "company", ref: "Company", tab: TABS.company, key: "people.role", who: "customer", severity: "blocker", code: "no-admin", message: "Name at least one Administrator in the people list." });

  // ---------------------------------------------------------------- models
  const models = new Map();
  const modelDupes = new Map();
  for (const m of intake.models) {
    const name = m.values["model.name"];
    if (!name) continue;
    const k = norm(name);
    modelDupes.set(k, [...(modelDupes.get(k) ?? []), m.row]);
    if (!models.has(k)) models.set(k, { record: m, name, reasons: [], assets: [], prepared: preparedBy.get(k) ?? null });
  }
  const assetCodes = new Set(intake.assets.map((a) => norm(a.values["asset.code"])).filter(Boolean));
  for (const [k, model] of models) {
    const m = model.record;
    const v = m.values;
    const name = model.name;
    const mr = (key, who, severity, code, message) => model.reasons.push(reason({ level: "model", ref: name, tab: TABS.models, row: m.row, cell: m.cells[key] ?? null, key, who, severity, code, message }));
    if (modelDupes.get(k).length > 1) mr("model.name", "customer", "blocker", "model-name-duplicate", `"${name}" is on more than one MODELS row (rows ${modelDupes.get(k).join(", ")}). Keep one row per model.`);
    if (!v["model.make"] || !v["model.model"] || isUnknown(v["model.make"]) || isUnknown(v["model.model"])) mr("model.make", "customer", "blocker", "model-identity", `${name}: add its make and model.`);
    const manual = v["model.manual"];
    const share = v["model.manual_share"];
    // An approved reusable pack whose manual and its rights were already reviewed settles the manual question.
    if (model.prepared?.manual_cleared) {
      // nothing to check
    } else if (!manual) mr("model.manual", "customer", "blocker", "manual-missing", `${name}: send the manual (a file or a link), or answer Not available.`);
    else if (manual === "Not sure") mr("model.manual", "customer", "blocker", "manual-not-sure", `${name}: is there a manual? Send a file or a link, or answer Not available.`);
    else if (manual === "Not available" || manual === "Please review") mr("model.manual", "mulemark", "blocker", "manual-search", `${name}: look for the maker's official manual (up to ${KIT.researchMinutesPerModel} minutes, no purchases); anything unresolved goes back in the one request.`);
    else if (isUrl(manual)) {
      if (share === "Show our copy") mr("model.manual_share", "mulemark", "blocker", "manual-host-rights", `${name}: confirm we may host the maker's manual before renters see a copy.`);
      else if (share === "Staff only") mr("model.manual_share", null, "warning", "manual-staff-only", `${name}: the manual won't be shown to renters.`);
      else mr("model.manual", null, "warning", "manual-link-only", `${name}: manual by link only.`);
    } else if (looksLikeFile(manual)) {
      if (up && !up.has(manual)) mr("model.manual", "customer", "blocker", "manual-file-missing", `${name}: we couldn't find "${manual}" in your upload.`);
      if (!share || share === "Not sure") mr("model.manual_share", "customer", "blocker", "manual-share", `${name}: may renters see the manual file you sent? Pick Link to the maker's copy, Show our copy or Staff only.`);
      else if (share === "Show our copy") mr("model.manual_share", "mulemark", "blocker", "manual-host-rights", `${name}: confirm we may host the maker's manual before renters see it.`);
      else if (share === "Link to the maker's copy") mr("model.manual", "mulemark", "blocker", "manual-find-link", `${name}: find the maker's official link (the file you sent stays private).`);
      else if (share === "Staff only") mr("model.manual_share", null, "warning", "manual-staff-only", `${name}: the manual won't be shown to renters.`);
    } else mr("model.manual", "customer", "blocker", "manual-unclear", `${name}: the manual "${manual}" isn't a file name or a web link.`);
    if (v["model.manual_depends"] === "Not sure") mr("model.manual_depends", "mulemark", "blocker", "applicability", `${name}: check whether the manual changes by year or serial.`);
    const photo = v["model.photo"];
    if (photo === "Please review") mr("model.photo", "mulemark", "blocker", "model-photo-search", `${name}: look for a permitted photo of this exact model (bounded; no photo work is included).`);
    else if (photo && !isUnknown(photo) && photo !== "Use asset photos") {
      if (up && !up.has(photo)) mr("model.photo", "customer", "blocker", "model-photo-missing", `${name}: we couldn't find the photo "${photo}" in your upload.`);
      const perm = v["model.photo_permission"];
      if (!perm || perm === "Not sure") mr("model.photo_permission", "customer", "blocker", "photo-permission", `${name}: who took the model photo, or who allowed its use? (It's shown on your pages only.)`);
      else if (perm === "Maker's photo, permitted") mr("model.photo_permission", "mulemark", "blocker", "photo-permission-record", `${name}: keep the maker's permission for the photo on record before it's shown.`);
    }
    const instructions = v["model.instructions"];
    if (instructions && !isUnknown(instructions) && norm(instructions) !== "none" && looksLikeFile(instructions) && up && !up.has(instructions)) mr("model.instructions", "customer", "blocker", "instructions-missing", `${name}: we couldn't find "${instructions}" in your upload.`);
    if (v["model.fuel"] === "Not sure") mr("model.fuel", "mulemark", "blocker", "fuel", `${name}: confirm fuel or power from the manual.`);
    if (!v["model.accessories"] || isUnknown(v["model.accessories"])) mr("model.accessories", null, "warning", "accessories-unknown", `${name}: accessories sent out aren't listed.`);
    // The return checklist comes from the category (model first, else its first asset's), as the app resolves it.
    const own = v["model.category"] && !isUnknown(v["model.category"]) ? v["model.category"] : null;
    const fromAsset = intake.assets.find((a) => norm(a.values["asset.model"]) === k && a.values["asset.category"] && !isUnknown(a.values["asset.category"]))?.values["asset.category"] ?? null;
    model.category = own ?? fromAsset;
    if (!returnTemplateForCategory(model.category)) mr("model.category", null, "warning", "generic-return", `${name}: no specific return checklist for "${model.category ?? "no category"}"; the generic one applies.`);
    if (!model.prepared) mr(null, "mulemark", "blocker", "content-to-prepare", `${name}: prepare the equipment page from the manual and your rules, then review it.`);
  }

  // ---------------------------------------------------------------- assets
  const codeRows = new Map();
  for (const a of intake.assets) {
    const code = a.values["asset.code"];
    if (code) codeRows.set(norm(code), [...(codeRows.get(norm(code)) ?? []), a.row]);
  }
  const assets = [];
  for (const a of intake.assets) {
    const v = a.values;
    const code = v["asset.code"];
    const ref = code ?? `ASSETS row ${a.row}`;
    const own = [];
    const ar = (key, who, severity, rc, message) => own.push(reason({ level: "asset", ref, tab: TABS.assets, row: a.row, cell: a.cells[key] ?? null, key, who, severity, code: rc, message }));
    if (!code) ar("asset.code", "customer", "blocker", "code-missing", `ASSETS row ${a.row}: add the asset code.`);
    const dupRows = code ? codeRows.get(norm(code)) : [];
    if (code && dupRows.length > 1) ar("asset.code", "customer", "blocker", "duplicate-code", `${code}: the same code is on rows ${dupRows.join(", ")}. Each asset needs its own code.`);
    if (code && code.length > 64) ar("asset.code", "customer", "blocker", "code-too-long", `${code}: asset codes can be up to 64 characters.`);
    if (code && a.numeric["asset.code"]) ar("asset.code", "customer", "blocker", "code-number", `${code}: stored as a number. Confirm the exact code (leading zeros?) before its tag is made.`);
    if (!v["asset.name"]) ar("asset.name", "customer", "blocker", "name-missing", `${ref}: add its name as renters should see it.`);

    const modelValue = v["asset.model"];
    let model = null;
    if (!modelValue) ar("asset.model", "customer", "blocker", "model-missing", `${ref}: pick its model, or add the model on MODELS.`);
    else if (modelValue === "Not sure" || modelValue === "Not available") ar("asset.model", "customer", "blocker", "model-unknown", `${ref}: which model is it? A photo of the model plate is enough.`);
    else if (modelValue === "Please review") ar("asset.model", "mulemark", "blocker", "model-identify", `${ref}: identify the model from the photos.`);
    else if (!models.has(norm(modelValue))) ar("asset.model", "customer", "blocker", "model-unmatched", `${ref}: "${modelValue}" isn't on MODELS. Add a row for it, or pick an existing model.`);
    else {
      model = models.get(norm(modelValue));
      model.assets.push(ref);
    }

    const year = v["asset.year"];
    const serial = v["asset.serial"];
    if (year && !isUnknown(year) && yearProblem(year)) ar("asset.year", "customer", "blocker", "year-invalid", `${ref}: "${year}" isn't a year. ${yearProblem(year)}`);
    const hasSerialOrYear = (serial && !isUnknown(serial)) || (year && !isUnknown(year) && !yearProblem(year));
    if (model && model.record.values["model.manual_depends"] === "Yes" && !hasSerialOrYear) {
      if (serial === "Please review" || year === "Please review") ar("asset.serial", "mulemark", "blocker", "serial-read", `${ref}: read the serial from the model plate photo.`);
      else ar("asset.serial", "customer", "blocker", "serial-needed", `${ref}: the ${model.name} manual changes by year or serial. Add its serial number or year.`);
    } else if (!hasSerialOrYear) ar("asset.serial", null, "warning", "no-serial-year", `${ref}: no serial number or year.`);

    const photo = v["asset.photo"];
    if (!photo || photo === "No photo yet" || isUnknown(photo)) ar("asset.photo", null, "warning", "no-photo", `${ref}: no photo yet.`);
    else if (photo === "In Photos folder") {
      if (up && code && !up.byAsset.has(norm(code))) ar("asset.photo", "customer", "blocker", "photo-folder-empty", `${ref}: no photos found in Photos/${code}/.`);
    } else if (photo === "Use model photo") {
      const mp = model?.record.values["model.photo"];
      if (model && (!mp || isUnknown(mp) || mp === "Use asset photos")) ar("asset.photo", null, "warning", "no-model-photo", `${ref}: uses the model photo, but ${model.name} has none yet.`);
    } else if (up && !up.has(photo)) ar("asset.photo", "customer", "blocker", "photo-missing", `${ref}: we couldn't find the photo "${photo}" in your upload.`);

    const tag = v["asset.tag"];
    if (!tag) ar("asset.tag", "customer", "blocker", "tag-missing", `${ref}: does it need a new tag, does it already have a Mulemark tag, or no tag for now?`);
    else if (tag === "Already has a Mulemark tag") ar("asset.tag", "mulemark", "blocker", "tag-existing", `${ref}: match it to its existing Mulemark tag record.`);
    else if (!LISTS.tag.includes(tag)) ar("asset.tag", "customer", "blocker", "tag-unclear", `${ref}: for the tag, pick New tag, Already has a Mulemark tag or No tag for now.`);

    const unit = v["asset.unit_support"];
    let unitContact = false;
    if (unit && !isUnknown(unit)) {
      if (isEmail(unit)) unitContact = true;
      else if (/^\+?[\d\s().-]+(?:\s*(?:ext\.?|extension|x|#)\s*\d{1,6})?$/i.test(unit)) {
        unitContact = true;
        if (!telHref(unit)) ar("asset.unit_support", null, "warning", "unit-phone-not-dialable", `${ref}: "${unit}" isn't a plain phone number, so no Call button.`);
      } else ar("asset.unit_support", "customer", "blocker", "unit-support-invalid", `${ref}: the support contact "${unit}" isn't a phone number or an email address.`);
    }
    const differences = v["asset.differences"];
    if (differences) ar("asset.differences", "mulemark", "blocker", "difference-review", `${ref}: review "${differences}" before it's used on the page.`);

    const inherited = [];
    if (supportMissing && !unitContact) inherited.push({ ...companyReasons.find((r) => r.code === "support-missing"), inherited: true });
    if (model) for (const r of model.reasons) inherited.push({ ...r, inherited: true });
    const all = [...own, ...inherited];
    const draftImport = Boolean(code) && dupRows.length === 1 && Boolean(v["asset.name"]) && code.length <= 64 && !a.numeric["asset.code"];
    assets.push({ code: code ?? null, row: a.row, values: v, modelName: model?.name ?? null, modelKey: null, reasons: all, own, status: statusOf(all), draftImport });
  }
  for (const [, model] of models) if (model.assets.length === 0) model.reasons.push(reason({ level: "model", ref: model.name, tab: TABS.models, row: model.record.row, key: "model.name", severity: "warning", code: "model-unused", message: `${model.name}: no asset uses this model yet.` }));

  // ---------------------------------------------------------------- files tab and upload
  const fileReasons = [];
  for (const f of intake.files) {
    const v = f.values;
    const name = v["file.name"] ?? `FILES row ${f.row}`;
    const fr = (key, who, severity, code, message) => fileReasons.push(reason({ level: "file", ref: name, tab: TABS.files, row: f.row, cell: f.cells[key] ?? null, key, who, severity, code, message }));
    if (!v["file.name"]) fr("file.name", "customer", "blocker", "file-name-missing", `FILES row ${f.row}: add the file or folder name.`);
    if (!v["file.kind"]) fr("file.kind", "customer", "blocker", "file-kind", `"${name}": what is it? Photo, Manual, Your instructions, Logo or Other.`);
    const target = v["file.for"];
    if (!target) fr("file.for", "customer", "blocker", "file-for", `"${name}": which asset code, model or Company is it for?`);
    else if (norm(target) !== "company" && !assetCodes.has(norm(target)) && !models.has(norm(target))) fr("file.for", "customer", "blocker", "file-for-unknown", `"${name}": "${target}" isn't an asset code, a model name or Company.`);
    // Two separate questions: who may see it (only ever on the customer's own pages), and where it is from.
    const audience = v["file.audience"];
    const source = v["file.source"];
    const audienceKnown = LISTS.fileAudience.includes(audience) && audience !== "Not sure";
    if (!audienceKnown && v["file.kind"] !== "Other") fr("file.audience", "customer", "blocker", "file-audience", `"${name}": who may see it? Renters on your pages, or staff only. Until then it stays staff-only.`);
    else if (audience === "Renters, on our pages") {
      if (!LISTS.fileSource.includes(source) || source === "Not sure") fr("file.source", "customer", "blocker", "file-source", `"${name}": where is it from? Renters see only files you made or took, or the maker's.`);
      else if (source === "From the maker") fr("file.source", "mulemark", "blocker", "file-rights-record", `"${name}": the maker's file. Link to the maker's own copy, or keep their permission on record, before renters see it.`);
    }
    if (up && v["file.name"] && !up.has(v["file.name"]) && !up.byAsset.has(norm(v["file.name"])) && !up.byModel.has(norm(v["file.name"]))) fr("file.name", "customer", "blocker", "file-not-uploaded", `"${name}" isn't in your upload.`);
  }
  const uploadReasons = [];
  if (up) {
    for (const item of up.items) {
      const ext = extOf(item.path);
      const isPhoto = PHOTO_EXTENSIONS.includes(ext);
      const isDoc = DOCUMENT_EXTENSIONS.includes(ext);
      const ur = (code, message) => uploadReasons.push(reason({ level: "file", ref: item.path, tab: "Upload", who: "customer", severity: "blocker", code, message }));
      if (!isPhoto && !isDoc && !LOGO_EXTENSIONS.includes(ext)) ur("file-type", `"${item.path}": this file type can't be used. Send photos as JPG, PNG or HEIC and documents as PDF.`);
      else if (isPhoto && item.bytes > PHOTO_MAX_BYTES) ur("file-too-large", `"${item.path}" is over 100 MB.`);
      else if (!isPhoto && isDoc && item.bytes > DOCUMENT_MAX_BYTES) ur("file-too-large", `"${item.path}" is over 50 MB.`);
    }
    for (const [k, folder] of up.byAsset) if (!assetCodes.has(k)) uploadReasons.push(reason({ level: "file", ref: `Photos/${folder.folder}/`, tab: "Upload", who: "customer", severity: "blocker", code: "photo-folder-unknown", message: `"Photos/${folder.folder}/" doesn't match an asset code on ASSETS.` }));
    for (const [k, folder] of up.byModel) if (!models.has(k)) uploadReasons.push(reason({ level: "file", ref: `Model documents/${folder.folder}/`, tab: "Upload", who: "customer", severity: "blocker", code: "model-folder-unknown", message: `"Model documents/${folder.folder}/" doesn't match a model name on MODELS.` }));
  }

  // ---------------------------------------------------------------- reader issues
  for (const issue of intake.issues) {
    const where = [issue.tab, issue.cell].filter(Boolean).join(" ");
    const r = { level: "general", ref: where || "Workbook", tab: issue.tab ?? null, row: issue.row ?? null, cell: issue.cell ?? null, key: issue.key ?? null };
    if (issue.kind === "formula") general.push(reason({ ...r, who: "customer", severity: "blocker", code: "formula-in-input", message: `${where}: a formula was in an input cell; it wasn't run. Type the value instead.` }));
    else if (issue.kind === "held-back") general.push(reason({ ...r, who: "customer", severity: "blocker", code: "formula-like-value", message: `${where}: the value starts with = + - or @, so it was held back. Type it without that first character.` }));
    else if (issue.kind === "error") general.push(reason({ ...r, who: "customer", severity: "blocker", code: "cell-error", message: `${where}: the cell shows an error. Type the value instead.` }));
    else if (issue.kind === "card-number" || issue.kind === "password") general.push(reason({ ...r, who: "mulemark", severity: "blocker", code: "sensitive-data", message: `${where}: ${issue.kind === "card-number" ? "looks like a card number" : "looks like a password"}. It was not copied; delete the received file and ask for it to be removed.` }));
    else if (issue.kind === "missing-tab" || issue.kind === "missing-table") general.push(reason({ ...r, who: "customer", severity: "blocker", code: issue.kind, message: issue.detail }));
    else general.push(reason({ ...r, severity: "warning", code: issue.kind, message: `${where ? `${where}: ` : ""}${issue.detail}` }));
  }

  const modelList = [...models.values()].map((m) => ({ name: m.name, row: m.record.row, values: m.record.values, assets: m.assets, prepared: m.prepared, category: m.category, reasons: m.reasons, status: statusOf(m.reasons) }));
  const count = (list) => Object.fromEntries(STATUSES.map((s) => [s, list.filter((x) => x.status === s).length]));
  return {
    company: { reasons: companyReasons, status: statusOf(companyReasons) },
    models: modelList,
    assets,
    files: fileReasons,
    upload: { checked: Boolean(up), count: up?.items.length ?? 0, reasons: uploadReasons },
    general,
    summary: { assets: count(assets), models: count(modelList), draftImportable: assets.filter((a) => a.draftImport).length, total: assets.length },
  };
}

/** Every reason someone must act on, without inherited duplicates. */
export function allReasons(result) {
  return [
    ...result.general,
    ...result.company.reasons,
    ...result.models.flatMap((m) => m.reasons),
    ...result.assets.flatMap((a) => a.own),
    ...result.files,
    ...result.upload.reasons,
  ];
}

/** Return template for a model or asset category (mirror of the app's exact aliases), or "generic". */
export function returnTemplate(category) {
  return returnTemplateForCategory(category) ?? "generic";
}
