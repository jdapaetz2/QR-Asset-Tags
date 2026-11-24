/**
 * Engineering Phase E3 — everything the check tool writes from an assessed intake:
 *
 *  - the interchange CSVs (one per tab, the workbook's own labels; machine quoting, UTF-8 BOM, CRLF);
 *  - the current-import CSV for lib/onboarding/import.ts (draft-importable assets only; publish and QR flags off; no
 *    template key, so no category text is ever seeded as page content);
 *  - the content-contract manifest (schema 1.3.0, kind customer-onboarding) for E4: one model per MODELS row, assets
 *    pointing at it, sources with conservative rights, never shareable across organizations, no real names;
 *  - the readiness report (Markdown and a formula-guarded XLSX) and the one consolidated missing-information email.
 */
import { hash } from "node:crypto";
import { createRequire } from "node:module";

import { toCsv } from "./csv.mjs";
import { ASSET_COLUMNS, COMPANY_SECTIONS, FILE_COLUMNS, MODEL_COLUMNS, NOTE_COLUMNS, PEOPLE_COLUMNS } from "./field-mapping.mjs";
import { BRAND, KIT, OFFICE_FONT, RETURN_MODE_BY_LABEL, isEmail, returnTemplateForCategory, yearProblem } from "./kit-config.mjs";
import { isUnknown } from "./read.mjs";
import { STATUSES, allReasons, statusOf } from "./readiness.mjs";
import { normalizeOoxml } from "./zip.mjs";

const require = createRequire(import.meta.url);

/** lib/onboarding/import.ts IMPORT_COLUMNS (the parity test compares the two). */
export const IMPORT_COLUMNS = [
  "asset_code",
  "asset_name",
  "category",
  "make",
  "model",
  "serial_number",
  "year",
  "support_phone_override",
  "support_email_override",
  "cover_image_url",
  "template_key",
  "create_qr_link",
  "publish_asset",
  "publish_equipment_page",
  "return_inspection_template_key",
];

export function slug(text, max = 40) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

const known = (v) => (v && !isUnknown(v) ? v : null);
const norm = (s) => String(s ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

// ------------------------------------------------------------------------------------------------ CSVs

const COMPANY_FIELDS = COMPANY_SECTIONS.flatMap((s) => s.fields);

/** The CSV set: blank templates when intake is null. */
export function interchangeCsvs(intake = null) {
  const table = (fields, records) => toCsv(fields.map((f) => f.label), (records ?? []).map((r) => fields.map((f) => r.values[f.key] ?? "")), { mode: "machine", bom: true });
  return {
    "company.csv": toCsv(["Field", "Answer"], COMPANY_FIELDS.map((f) => [f.label, intake?.company.values[f.key] ?? ""]), { mode: "machine", bom: true }),
    "people.csv": table(PEOPLE_COLUMNS, intake?.people),
    "assets.csv": table(ASSET_COLUMNS, intake?.assets),
    "models.csv": table(MODEL_COLUMNS, intake?.models),
    "files.csv": table(FILE_COLUMNS, intake?.files),
    "notes.csv": table(NOTE_COLUMNS, intake?.notes),
  };
}

function splitSupport(value) {
  const v = known(value);
  if (!v) return { phone: "", email: "" };
  if (isEmail(v)) return { phone: "", email: v.trim() };
  if (/^\+?[\d\s().-]+(?:\s*(?:ext\.?|extension|x|#)\s*\d{1,6})?$/i.test(v)) return { phone: v.trim(), email: "" };
  return { phone: "", email: "" };
}

/** CSV for today's importer: draft-importable assets only, everything private, no template text. */
export function currentImportCsv(result) {
  const models = new Map(result.models.map((m) => [norm(m.name), m]));
  const rows = result.assets
    .filter((a) => a.draftImport)
    .map((a) => {
      const v = a.values;
      const model = a.modelName ? models.get(norm(a.modelName)) : null;
      const year = known(v["asset.year"]);
      const support = splitSupport(v["asset.unit_support"]);
      return [
        v["asset.code"],
        v["asset.name"],
        known(v["asset.category"]) ?? model?.category ?? "",
        known(model?.values["model.make"]) ?? "",
        known(model?.values["model.model"]) ?? "",
        known(v["asset.serial"]) ?? "",
        year && !yearProblem(year) ? year : "",
        support.phone,
        support.email,
        "",
        "",
        "false",
        "false",
        "false",
        "",
      ];
    });
  return toCsv(IMPORT_COLUMNS, rows, { mode: "machine" });
}

// ------------------------------------------------------------------------------------------------ manifest

function review(reasons) {
  const uniq = (xs) => [...new Set(xs)];
  return {
    status: statusOf(reasons),
    blockers: uniq(reasons.filter((r) => r.severity === "blocker").map((r) => r.message)),
    warnings: uniq(reasons.filter((r) => r.severity === "warning").map((r) => r.message)),
    missing_facts: uniq(reasons.filter((r) => r.severity === "blocker" && r.who === "customer").map((r) => r.message)),
  };
}

const MANUAL_RIGHTS = {
  "Link to the maker's copy": { status: "unknown", redistribution: "link-only" },
  "Show our copy": { status: "customer-supplied", redistribution: "private-only" },
  "Staff only": { status: "customer-supplied", redistribution: "private-only" },
  "Not sure": { status: "unknown", redistribution: "private-only" },
};
const PHOTO_RIGHTS = {
  "We took it": { status: "customer-supplied", redistribution: "public-host" },
  "Maker's photo, permitted": { status: "oem-permission", redistribution: "private-only" },
  "Not sure": { status: "unknown", redistribution: "private-only" },
};
const OPENNESS = { blocked: 0, "private-only": 1, "link-only": 2, "public-host": 3 };

/**
 * Rights from a FILES & NOTES row's two answers. Only "we made it" and "renters" together allow hosting; a maker's
 * file for renters is link-only until Mulemark records the maker's permission; anything unsure stays private.
 */
export function fileRowRights(values) {
  const source = values["file.source"];
  const status = source === "We made it or took it" ? "customer-supplied" : "unknown";
  if (values["file.audience"] !== "Renters, on our pages") return { status, redistribution: "private-only" };
  if (source === "We made it or took it") return { status, redistribution: "public-host" };
  return { status, redistribution: source === "From the maker" ? "link-only" : "private-only" };
}

/**
 * The content-contract manifest for E4. Returns { manifest, excluded } or { manifest: null, reason } when the company
 * name (the one "start" fact at company level) is missing.
 */
export function buildManifest(intake, result, { batchId, fictional = false } = {}) {
  const cv = intake.company.values;
  if (!known(cv["company.name"])) return { manifest: null, reason: "The company name is missing, so no manifest was written." };
  // A FILES & NOTES row about a file can only narrow what its folder default allows (the stricter answer wins).
  const fileRows = new Map();
  for (const f of intake.files) {
    const name = known(f.values["file.name"]);
    if (name && !fileRows.has(norm(name))) fileRows.set(norm(name), f.values);
  }
  const listed = new Set();
  const sources = new Map();
  const addSource = (id, s) => {
    let sid = `src-${slug(id, 50) || "x"}`;
    for (let n = 2; sources.has(sid); n++) sid = `src-${slug(id, 46) || "x"}-${n}`;
    let rights = s.rights;
    const row = fileRows.get(norm(s.title));
    if (row) {
      listed.add(norm(s.title));
      const fromRow = fileRowRights(row);
      if (OPENNESS[fromRow.redistribution] < OPENNESS[rights.redistribution]) rights = fromRow;
    }
    sources.set(sid, { source_id: sid, ...s, rights: { ...rights, shareable_across_orgs: false } });
    return sid;
  };

  const policies = [];
  for (const f of COMPANY_SECTIONS.find((s) => s.title.startsWith("Your rental rules")).fields) {
    const text = known(cv[f.key]);
    if (text) policies.push({ policy_id: `pol-${slug(f.key.split(".")[1])}`, text, owner: "customer" });
  }
  const organization = {
    name: cv["company.name"],
    ...(fictional ? { fictional: true } : {}),
    support: {
      ...(known(cv["company.support_phone"]) ? { phone: cv["company.support_phone"] } : {}),
      ...(known(cv["company.support_email"]) && isEmail(cv["company.support_email"]) ? { email: cv["company.support_email"] } : {}),
      ...(known(cv["company.support_hours"]) ? { hours: cv["company.support_hours"] } : {}),
    },
    notifications: {
      ...(RETURN_MODE_BY_LABEL[cv["alerts.return_mode"]] ? { return_mode: RETURN_MODE_BY_LABEL[cv["alerts.return_mode"]] } : {}),
      address_role: "the notification email on COMPANY & PEOPLE",
    },
    policies,
    approver: { ...(known(cv["approver.title"]) ? { role: cv["approver.title"] } : {}), name_ref: "intake workbook, COMPANY & PEOPLE, Approver's name (private storage)" },
  };
  if (/^#[0-9A-Fa-f]{6}$/.test(cv["company.brand_color"] ?? "")) organization.primary_color = cv["company.brand_color"];
  if (known(cv["company.logo_file"])) organization.logo = { source_id: addSource(`logo-${cv["company.logo_file"]}`, { kind: "customer-file", title: cv["company.logo_file"], rights: { status: "customer-supplied", redistribution: "public-host" }, verification: "unverified" }) };

  const keys = new Set();
  const modelKeyByName = new Map();
  const models = result.models.map((m) => {
    const v = m.values;
    let key = m.prepared?.model_key ?? [slug(v["model.make"]) || "unknown", slug(v["model.model"]) || "unknown", slug(v["model.version"]) || "std"].join(".");
    for (let n = 2; keys.has(key); n++) key = `${key.replace(/-\d+$/, "")}-${n}`;
    keys.add(key);
    modelKeyByName.set(norm(m.name), key);
    const make = known(v["model.make"]) ?? "Unknown make";
    const model = known(v["model.model"]) ?? "Unknown model";
    const manual = v["model.manual"];
    let manualRef;
    if (manual && /^https?:\/\//i.test(manual)) {
      manualRef = { source_id: addSource(`${key}-manual`, { kind: "oem-manual", title: `${make} ${model} manual`, url: manual, rights: MANUAL_RIGHTS[v["model.manual_share"]] ?? { status: "unknown", redistribution: "link-only" }, verification: "unverified" }), delivery: "link" };
    } else if (manual && !isUnknown(manual)) {
      manualRef = { source_id: addSource(`${key}-manual`, { kind: "oem-manual", title: manual, rights: MANUAL_RIGHTS[v["model.manual_share"]] ?? { status: "unknown", redistribution: "private-only" }, verification: "unverified", availability: "in-hand" }), delivery: "hosted" };
    } else {
      manualRef = { source_id: addSource(`${key}-manual`, { kind: "oem-manual", title: `${make} ${model} manual (not established)`, rights: { status: "unknown", redistribution: "blocked" }, verification: "unverified", ...(manual === "Not available" ? { availability: "unavailable" } : {}) }), delivery: "link" };
    }
    // "Your instructions for renters": the customer's own file, for their own pages, unless a FILES row narrows it.
    const instructions = known(v["model.instructions"]);
    if (instructions && norm(instructions) !== "none") addSource(`${key}-instructions`, { kind: "customer-file", title: instructions, rights: { status: "customer-supplied", redistribution: "public-host" }, verification: "unverified" });
    const returnRules = known(v["model.return_rules"]);
    if (returnRules) policies.push({ policy_id: `pol-${slug(key, 50)}-return`, text: returnRules, owner: "customer" });
    const template = returnTemplateForCategory(m.category) ?? "generic";
    const photo = known(v["model.photo"]);
    const out = {
      model_key: key,
      manufacturer: make,
      model,
      category: m.category ?? "",
      configuration: { version: known(v["model.version"]), fuel_or_power: known(v["model.fuel"]) },
      ...(v["model.manual_depends"] ? { applicability: { notes: `Manual changes by year or serial: ${v["model.manual_depends"]} (customer).` } } : {}),
      manual: manualRef,
      templates: { return: template, outbound: template, equipment_page_seed: null },
      common_accessories: (known(v["model.accessories"]) ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      review: review(m.reasons),
    };
    if (photo && photo !== "Use asset photos") out.photo = { source_id: addSource(`${key}-photo`, { kind: "photo", title: photo, rights: PHOTO_RIGHTS[v["model.photo_permission"]] ?? PHOTO_RIGHTS["Not sure"], verification: "unverified" }) };
    return out;
  });

  const excluded = [];
  const assets = [];
  for (const a of result.assets) {
    if (!a.draftImport) {
      excluded.push({ code: a.code, row: a.row, status: a.status });
      continue;
    }
    const v = a.values;
    const key = a.modelName ? modelKeyByName.get(norm(a.modelName)) : null;
    const year = known(v["asset.year"]);
    const support = splitSupport(v["asset.unit_support"]);
    const out = {
      asset_code: v["asset.code"],
      asset_name: v["asset.name"],
      model_key: key ?? null,
      ...(known(v["asset.category"]) ? { category: v["asset.category"] } : {}),
      year: year && !yearProblem(year) ? Number(year) : null,
      serial_number: known(v["asset.serial"]),
      fitted_options: (known(v["asset.fitted"]) ?? "").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      qr: { create: v["asset.tag"] === "New tag" },
      publish_intent: false,
      review: review(a.reasons),
    };
    if (v["asset.photo"] === "In Photos folder") out.photo = { source_id: addSource(`photos-${v["asset.code"]}`, { kind: "photo", title: `Photos/${v["asset.code"]}/`, rights: { status: "customer-supplied", redistribution: "public-host" }, verification: "unverified" }) };
    else if (v["asset.photo"] === "Use model photo" && key && models.find((m) => m.model_key === key)?.photo) out.photo = { source_id: models.find((m) => m.model_key === key).photo.source_id };
    if (support.phone || support.email) out.support_overrides = { ...(support.phone ? { phone: support.phone } : {}), ...(support.email ? { email: support.email } : {}) };
    const diff = known(v["asset.differences"]);
    if (diff) {
      const sid = addSource(`${v["asset.code"]}-statement`, { kind: "customer-statement", title: `Customer statement, ASSETS row ${a.row}`, rights: { status: "customer-supplied", redistribution: "private-only" }, verification: "unverified" });
      out.exceptions = [{ step_id: "exception-1", text: diff, source_refs: [{ source_id: sid }], safety_critical: false, status: "REVIEW_REQUIRED", status_reason: "Customer statement; reviewed before any use." }];
    }
    assets.push(out);
  }

  // FILES & NOTES rows no other answer refers to become sources of their own, with the rights their two answers give.
  for (const f of intake.files) {
    const v = f.values;
    const name = known(v["file.name"]);
    if (!name || listed.has(norm(name))) continue;
    const maker = v["file.source"] === "From the maker";
    const kind = v["file.kind"] === "Photo" ? "photo" : maker ? (v["file.kind"] === "Manual" ? "oem-manual" : "oem-document") : "customer-file";
    addSource(`file-${name}`, { kind, title: name, ...(known(v["file.for"]) ? { applicability: `For ${v["file.for"]}` } : {}), rights: fileRowRights(v), verification: "unverified" });
  }

  const companySlug = slug(cv["company.name"], 28) || "company";
  const manifest = {
    schema_version: "1.3.0",
    manifest_id: `intake-${companySlug}-${slug(batchId, 28) || "batch"}`.slice(0, 64).replace(/-+$/, ""),
    kind: "customer-onboarding",
    batch: { batch_id: batchId, launch_scope: "all", research_minutes_per_model_cap: KIT.researchMinutesPerModel },
    organization,
    sources: [...sources.values()],
    models,
    assets,
    approval: { status: "not_requested" },
  };
  return { manifest, excluded };
}

/** Validate with ajv 6 (installed with ESLint, as the pack tests use it); draft-07 needs nothing else. */
export function validateManifest(manifest, schema) {
  const Ajv = require("ajv");
  const ajv = new Ajv({ allErrors: true });
  const ok = ajv.validate(schema, manifest);
  return { ok, errors: ok ? [] : ajv.errors.map((e) => `${e.dataPath} ${e.message}`) };
}

// ------------------------------------------------------------------------------------------------ report

const WHO = { customer: "Customer", mulemark: "Mulemark", null: "Warning" };
const where = (r) => [r.tab, r.cell ?? (r.row ? `row ${r.row}` : null), r.field].filter(Boolean).join(" · ");
const md = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");

export function reportMarkdown(intake, result, { batchId, checkedAt, sourceSha256 }) {
  const lines = [];
  const company = intake.company.values["company.name"] ?? "(company name missing)";
  lines.push(`# Readiness report: ${md(company)}`, "");
  lines.push(`Batch \`${batchId}\` · checked ${checkedAt} · intake workbook ${intake.meta.workbook_version ?? "unknown"} · field mapping ${KIT.mappingVersion}`);
  lines.push(`Source: \`${md(intake.meta.file)}\`${sourceSha256 ? ` (SHA-256 \`${sourceSha256.slice(0, 16)}…\`)` : ""} · upload ${result.upload.checked ? `${result.upload.count} files checked` : "not checked"}`, "");
  lines.push("## Summary", "", `| | ${STATUSES.join(" | ")} |`, `|---|${STATUSES.map(() => "---").join("|")}|`);
  lines.push(`| Assets | ${STATUSES.map((s) => result.summary.assets[s]).join(" | ")} |`);
  lines.push(`| Models | ${STATUSES.map((s) => result.summary.models[s]).join(" | ")} |`, "");
  const reasons = allReasons(result);
  const c = reasons.filter((r) => r.severity === "blocker" && r.who === "customer").length;
  const m = reasons.filter((r) => r.severity === "blocker" && r.who === "mulemark").length;
  const w = reasons.filter((r) => r.severity === "warning").length;
  lines.push(`- **Draft import:** ${result.summary.draftImportable} of ${result.summary.total} assets can be imported now as private drafts.`);
  lines.push(`- **Customer items:** ${c}, all in the one missing-information email. **Mulemark items:** ${c === 0 && m === 0 ? "none" : m}. **Warnings:** ${w}.`, "");
  const list = (rs) => rs.map((r) => `- **${WHO[r.severity === "warning" ? null : r.who]}** · ${md(where(r))}: ${md(r.message)}`);
  lines.push(`## Company and people: ${result.company.status}`, "", ...(result.company.reasons.length ? list(result.company.reasons) : ["- Nothing to do."]), "");
  if (result.general.length) lines.push("## Workbook", "", ...list(result.general), "");
  lines.push("## Models", "");
  for (const model of result.models) {
    lines.push(`### ${md(model.name)}: ${model.status}`, "", `${model.assets.length} asset${model.assets.length === 1 ? "" : "s"}${model.prepared ? ` · prepared pack \`${model.prepared.model_key}\`${model.prepared.content_version ? ` (${model.prepared.content_version})` : ""}` : ""}`, "");
    lines.push(...(model.reasons.length ? list(model.reasons) : ["- Nothing to do."]), "");
  }
  lines.push("## Assets", "", "Each asset also carries its model's items. Own items only below.", "", "| Code | Row | Model | Status | Draft import | Own items |", "|---|---|---|---|---|---|");
  for (const a of result.assets) {
    const items = a.own.map((r) => `${WHO[r.severity === "warning" ? null : r.who]}: ${r.message}`).join(" ") || "—";
    lines.push(`| ${md(a.code ?? "(none)")} | ${a.row} | ${md(a.modelName ?? a.values["asset.model"] ?? "")} | ${a.status} | ${a.draftImport ? "yes" : "no"} | ${md(items)} |`);
  }
  lines.push("");
  if (result.files.length || result.upload.reasons.length) lines.push("## Files and upload", "", ...list([...result.files, ...result.upload.reasons]), "");
  if (intake.notes.length) lines.push("## Notes from the customer", "", ...intake.notes.map((n) => `- **${md(n.values["note.about"] ?? "General")}:** ${md(n.values["note.text"] ?? "")}`), "");
  if (intake.meta.notes?.length) lines.push("## Reader notes", "", ...intake.meta.notes.map((n) => `- ${md(n)}`), "");
  return `${lines.join("\n")}\n`;
}

const guard = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Readiness workbook: SUMMARY, ITEMS and ASSETS tabs; every text cell guarded like lib/export/csv.ts. */
export async function reportWorkbook(intake, result, { batchId, checkedAt }) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mulemark";
  wb.created = KIT.fixedDate;
  wb.modified = KIT.fixedDate;
  const head = (ws, labels, widths) => {
    ws.addRow(labels.map(guard));
    ws.getRow(1).font = { name: OFFICE_FONT, bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND.bone}` } };
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const summary = wb.addWorksheet("SUMMARY");
  head(summary, ["Item", "Value"], [34, 60]);
  [
    ["Company", intake.company.values["company.name"] ?? ""],
    ["Batch", batchId],
    ["Checked", checkedAt],
    ["Field mapping", KIT.mappingVersion],
    ["Assets", result.summary.total],
    ["Draft-importable assets", result.summary.draftImportable],
    ...STATUSES.map((s) => [`Assets ${s}`, result.summary.assets[s]]),
    ...STATUSES.map((s) => [`Models ${s}`, result.summary.models[s]]),
  ].forEach((row) => summary.addRow(row.map((v) => (typeof v === "number" ? v : guard(v)))));
  const items = wb.addWorksheet("ITEMS");
  head(items, ["Level", "About", "Who", "Severity", "Tab", "Row", "Cell", "Field", "Message"], [10, 28, 11, 10, 18, 6, 10, 24, 90]);
  for (const r of allReasons(result)) items.addRow([r.level, r.ref, WHO[r.severity === "warning" ? null : r.who], r.severity, r.tab ?? "", r.row ?? "", r.cell ?? "", r.field ?? "", r.message].map((v) => (typeof v === "number" ? v : guard(v))));
  const assets = wb.addWorksheet("ASSETS");
  head(assets, ["Code", "Row", "Model", "Status", "Draft import", "Own items", "Items with model"], [14, 6, 28, 26, 12, 10, 16]);
  for (const a of result.assets) assets.addRow([guard(a.code ?? ""), a.row, guard(a.modelName ?? ""), a.status, a.draftImport ? "yes" : "no", a.own.length, a.reasons.length]);
  return normalizeOoxml(Buffer.from(await wb.xlsx.writeBuffer()), { date: KIT.fixedDate });
}

// ------------------------------------------------------------------------------------------------ the one request

/** The consolidated list: customer blockers only, numbered, grouped company → each model → its assets → files. */
export function missingItems(result) {
  const groups = [];
  const companyItems = [...result.general, ...result.company.reasons].filter((r) => r.severity === "blocker" && r.who === "customer");
  if (companyItems.length) groups.push({ title: "Company, people and the workbook", items: companyItems });
  for (const model of result.models) {
    const own = model.reasons.filter((r) => r.severity === "blocker" && r.who === "customer");
    const assetItems = result.assets.filter((a) => a.modelName === model.name).flatMap((a) => a.own.filter((r) => r.severity === "blocker" && r.who === "customer"));
    if (own.length || assetItems.length) groups.push({ title: `${model.name} (${model.assets.length} asset${model.assets.length === 1 ? "" : "s"})`, items: [...own, ...assetItems] });
  }
  const loose = result.assets.filter((a) => !a.modelName).flatMap((a) => a.own.filter((r) => r.severity === "blocker" && r.who === "customer"));
  if (loose.length) groups.push({ title: "Assets without a model yet", items: loose });
  const files = [...result.files, ...result.upload.reasons].filter((r) => r.severity === "blocker" && r.who === "customer");
  if (files.length) groups.push({ title: "Files", items: files });
  return groups;
}

export function missingItemsMarkdown(groups) {
  let n = 0;
  const out = [];
  for (const g of groups) {
    out.push(`**${g.title}**`, "");
    for (const r of g.items) out.push(`${++n}. ${r.message}${r.tab && r.tab !== "Upload" ? ` _(${[r.tab, r.cell ?? (r.row ? `row ${r.row}` : null)].filter(Boolean).join(", ")})_` : ""}`);
    out.push("");
  }
  return { text: out.join("\n").trim(), count: n };
}

/** Fill {{placeholders}}; unknown ones are left in place for the sender. */
export function fillTemplate(template, values) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (m, key) => (values[key] === undefined || values[key] === null ? m : String(values[key])));
}

export const sha256 = (buf) => hash("sha256", buf);
