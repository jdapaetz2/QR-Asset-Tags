/**
 * Engineering Phase E2A — pure helpers for the showcase content packs (docs/phase-e/packs/<model_key>/pack.json).
 *
 * No file or network access: scripts/phase-e/packs/pack-review.mjs reads and writes, these functions decide. They
 * collect the sources a pack cites, embed the register entries, count item states, map page locators to PDF pages and
 * render the Markdown review copies. Everything is deterministic so regenerated files only change when content does.
 */

export const ITEM_STATUSES = ["READY", "REVIEW_REQUIRED", "BLOCKED"];

/** Payload budgets for pack files (bytes): page hero photos, each panel file, each guide PDF. */
export const BUDGETS = { heroBytes: 300_000, panelBytes: 120_000, guideBytes: 1_500_000 };

/** Item lists on a model that carry a status, in display order. */
const ITEM_LISTS = ["specs", "quick_guide", "warnings", "support_notes", "pictograms"];

/** Customer policies are cited as source_refs with a "pol-" id; they live in organization.policies, not the register. */
export const isPolicyRef = (id) => typeof id === "string" && id.startsWith("pol-");

/** Every policy a pack cites that its organization does not define. */
export function missingPolicies(pack) {
  const defined = new Set((pack.organization?.policies ?? []).map((p) => p.policy_id));
  const cited = new Set();
  for (const model of pack.models ?? []) {
    for (const list of ITEM_LISTS) {
      for (const item of model[list] ?? []) for (const ref of item.source_refs ?? []) if (isPolicyRef(ref.source_id)) cited.add(ref.source_id);
    }
  }
  for (const asset of pack.assets ?? []) {
    for (const f of Object.values(asset.page ?? {})) for (const id of f.derived_from ?? []) if (isPolicyRef(id)) cited.add(id);
  }
  return [...cited].filter((id) => !defined.has(id)).sort();
}

/** Every register source_id a pack cites: the manual and supplements, every source_ref, the photo and documents. */
export function citedSourceIds(pack) {
  const ids = new Set();
  for (const model of pack.models ?? []) {
    if (model.manual?.source_id) ids.add(model.manual.source_id);
    for (const id of model.manual?.supplements ?? []) ids.add(id);
    for (const list of ITEM_LISTS) {
      for (const item of model[list] ?? []) for (const ref of item.source_refs ?? []) ids.add(ref.source_id);
    }
    if (model.photo?.source_id) ids.add(model.photo.source_id);
  }
  for (const asset of pack.assets ?? []) {
    if (asset.photo?.source_id) ids.add(asset.photo.source_id);
    for (const item of asset.exceptions ?? []) for (const ref of item.source_refs ?? []) ids.add(ref.source_id);
    for (const doc of asset.documents ?? []) if (doc.source_id) ids.add(doc.source_id);
  }
  return new Set([...ids].filter((id) => !isPolicyRef(id)));
}

/** The register entries a pack cites, in register order. Throws on a citation the register lacks. */
export function embedSources(pack, register) {
  const cited = citedSourceIds(pack);
  const known = new Set(register.sources.map((s) => s.source_id));
  const missing = [...cited].filter((id) => !known.has(id)).sort();
  if (missing.length > 0) throw new Error(`${pack.manifest_id} cites sources missing from the register: ${missing.join(", ")}.`);
  return register.sources.filter((s) => cited.has(s.source_id)).map((s) => structuredClone(s));
}

/** Counts of READY / REVIEW_REQUIRED / BLOCKED over every status-bearing item of a model (and its photo). */
export function statusCounts(model) {
  const counts = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0]));
  for (const list of ITEM_LISTS) for (const item of model[list] ?? []) counts[item.status] = (counts[item.status] ?? 0) + 1;
  if (model.photo?.status) counts[model.photo.status] += 1;
  return counts;
}

/** A model may only be READY when none of its items is REVIEW_REQUIRED or BLOCKED and it has no blockers. */
export function readinessProblems(model) {
  const problems = [];
  const counts = statusCounts(model);
  if (model.review?.status === "READY" || model.review?.status === "READY_WITH_WARNINGS") {
    if (counts.REVIEW_REQUIRED > 0 || counts.BLOCKED > 0) {
      problems.push(`${model.model_key} is ${model.review.status} with ${counts.REVIEW_REQUIRED} REVIEW_REQUIRED and ${counts.BLOCKED} BLOCKED items.`);
    }
  }
  // REVIEW_REQUIRED speaks for itself (the knowledgeable review is outstanding); BLOCKED must say what is missing.
  for (const list of ITEM_LISTS) {
    for (const item of model[list] ?? []) {
      if (item.status === "BLOCKED" && !item.status_reason) {
        problems.push(`${model.model_key} ${item.step_id ?? item.spec_id ?? item.panel_id}: BLOCKED needs a status_reason.`);
      }
    }
  }
  return problems;
}

/**
 * PDF pages a locator points at. Printed page numbers ("p. 38", "pp. 36-37") get the source's offset; "PDF p. 2" is
 * taken literally. Single-sheet sources always map to page 1.
 */
export function locatorPdfPages(locator, { offset = 0, singleSheet = false } = {}) {
  if (singleSheet) return [1];
  const pages = new Set();
  const re = /(PDF\s+)?\bpp?\.\s*(\d+)(?:\s*-\s*(\d+))?/g;
  for (const m of String(locator ?? "").matchAll(re)) {
    const literal = Boolean(m[1]);
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    for (let p = from; p <= to && p - from < 20; p++) pages.add(literal ? p : p + offset);
  }
  return [...pages].sort((a, b) => a - b);
}

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function refText(ref, sourcesById) {
  if (isPolicyRef(ref.source_id)) return `Northridge policy \`${ref.source_id}\``;
  const source = sourcesById.get(ref.source_id);
  const title = source ? source.title : ref.source_id;
  return ref.locator ? `${title}, ${ref.locator}` : title;
}

const PAGE_LABELS = [
  ["headline", "Headline"],
  ["quick_start_text", "Quick start"],
  ["safety_notes", "Safety"],
  ["fuel_power_notes", "Fuel / power"],
  ["troubleshooting_notes", "Troubleshooting"],
  ["return_notes", "Return"],
  ["emergency_notes", "Emergency"],
];

/** Counts of field states on the asset's public page. */
export function pageStatusCounts(asset) {
  const counts = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0]));
  for (const [key] of PAGE_LABELS) if (asset.page?.[key]) counts[asset.page[key].status] += 1;
  return counts;
}

function refsText(refs, sourcesById) {
  return (refs ?? []).map((ref) => refText(ref, sourcesById)).join("; ");
}

function countsLine(model) {
  const c = statusCounts(model);
  return `${c.READY} READY · ${c.REVIEW_REQUIRED} REVIEW_REQUIRED · ${c.BLOCKED} BLOCKED`;
}

function bulletList(items, empty = "None.") {
  return items && items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;
}

/** Human-readable review copy of one pack. */
export function renderReviewMarkdown(pack, { packDir, generator }) {
  const model = pack.models[0];
  const asset = pack.assets[0];
  const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
  const lines = [];
  lines.push(`# ${model.manufacturer} ${model.model}: content pack review copy`);
  lines.push("");
  lines.push(`Generated from [pack.json](pack.json) by \`${generator}\`. Do not edit by hand. E2A draft; nothing here is published.`);
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| Asset | \`${asset.asset_code}\` · ${cell(asset.asset_name)} · serial \`${asset.serial_number}\` |`);
  lines.push(`| Protected route | \`${asset.qr?.existing_short_code ?? "none"}\` (unchanged) |`);
  lines.push(`| Model key | \`${model.model_key}\` · ${cell(model.category)} |`);
  lines.push(`| Review status | **${model.review.status}** |`);
  lines.push(`| Items | ${countsLine(model)} |`);
  lines.push(`| Storyboard | [storyboard.md](storyboard.md) (${(model.pictograms ?? []).length} panels) |`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  lines.push(bulletList(model.review.blockers));
  lines.push("");
  lines.push("## Warnings and missing facts");
  lines.push("");
  lines.push(bulletList([...(model.review.warnings ?? []), ...(model.review.missing_facts ?? []).map((f) => `Missing: ${f}`)]));
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("|---|---|");
  for (const [key, value] of Object.entries(model.configuration ?? {})) lines.push(`| ${cell(key.replace(/_/g, " "))} | ${cell(value)} |`);
  if (model.applicability?.notes) {
    lines.push("");
    lines.push(`Applicability: ${model.applicability.serial_from ? `serial from \`${model.applicability.serial_from}\`. ` : ""}${model.applicability.notes}`);
  }
  lines.push("");
  lines.push("## Manual and supplements");
  lines.push("");
  lines.push("| Role | Source | Availability | Delivery |");
  lines.push("|---|---|---|---|");
  const manualRows = [
    ["Manual", model.manual.source_id, model.manual.delivery],
    ...(model.manual.supplements ?? []).map((id) => ["Supplement", id, "link"]),
  ];
  for (const [role, id, delivery] of manualRows) {
    const s = sourcesById.get(id);
    const label = s?.url ? `[${cell(s.title)}](${s.url})` : cell(s?.title ?? id);
    lines.push(`| ${role} | ${label}${s?.edition ? ` (${cell(s.edition)})` : ""} | ${s?.availability ?? "?"} | ${delivery} |`);
  }
  lines.push("");
  lines.push("## Photo");
  lines.push("");
  if (model.photo) {
    const p = model.photo;
    lines.push(`**${p.status ?? "?"}**: ${cell(p.status_reason ?? "")}`);
    lines.push("");
    if (p.credit) {
      lines.push(`Credit: ${p.credit.author}, ${p.credit.license}${p.credit.modified ? " (modified)" : ""}, [source](${p.credit.source_url}).`);
      lines.push("");
      lines.push(bulletList(p.credit.modifications));
      lines.push("");
    }
    if ((p.files ?? []).length > 0) {
      lines.push("| File | Size | Bytes | SHA-256 |");
      lines.push("|---|---|---|---|");
      for (const f of p.files) lines.push(`| [${f.file}](${f.file}) | ${f.width}x${f.height} | ${f.bytes} | \`${f.sha256.slice(0, 16)}…\` |`);
    }
  } else {
    lines.push("**BLOCKED**: no licensed exact-model photo. No stand-in is used.");
  }
  lines.push("");
  lines.push("## Specifications");
  lines.push("");
  lines.push("| Spec | Value | Source | Status |");
  lines.push("|---|---|---|---|");
  for (const s of model.specs ?? []) {
    const flag = s.public === false ? " (staff only)" : "";
    lines.push(`| ${cell(s.label)}${flag} | ${cell(s.value)} | ${cell(refsText(s.source_refs, sourcesById))} | ${s.status}${s.status_reason ? `: ${cell(s.status_reason)}` : ""} |`);
  }
  const stepSection = (title, list) => {
    lines.push("");
    lines.push(`## ${title}`);
    lines.push("");
    if (!list || list.length === 0) {
      lines.push("None.");
      return;
    }
    list.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.text}${step.safety_critical ? " *(safety-critical)*" : ""}`);
      lines.push(`   - Source: ${refsText(step.source_refs, sourcesById)}`);
      lines.push(`   - Status: **${step.status ?? "?"}**${step.status_reason ? `: ${step.status_reason}` : ""}`);
    });
  };
  stepSection("Quick guide (renter)", model.quick_guide);
  stepSection("Warnings (renter)", model.warnings);
  stepSection("Support notes (staff only, never public)", model.support_notes);
  if (asset.page) {
    const pc = pageStatusCounts(asset);
    lines.push("");
    lines.push("## Public page text");
    lines.push("");
    lines.push(`The seven equipment-page fields in display order (${pc.READY} READY · ${pc.REVIEW_REQUIRED} REVIEW_REQUIRED · ${pc.BLOCKED} BLOCKED). Citations stay here; the page shows plain text only.`);
    for (const [key, title] of PAGE_LABELS) {
      const f = asset.page[key];
      lines.push("");
      lines.push(`### ${title} · ${f.status}`);
      lines.push("");
      lines.push(f.text ? f.text.split("\n").map((l) => `> ${l}`).join("\n") : "*(empty)*");
      lines.push("");
      lines.push(`From: ${(f.derived_from ?? []).map((id) => `\`${id}\``).join(", ") || "none"}${f.status_reason ? `. ${f.status_reason}` : ""}`);
    }
  }
  if ((asset.documents ?? []).length > 0) {
    lines.push("");
    lines.push("## Documents on the page");
    lines.push("");
    lines.push("| Title | Type | Delivery | Target | Status |");
    lines.push("|---|---|---|---|---|");
    for (const d of asset.documents) {
      const target = d.delivery === "hosted" ? `[${d.file.file}](${d.file.file}) (${d.file.bytes} bytes${d.file.pages ? `, ${d.file.pages} pages` : ""})` : `[link](${d.url})`;
      lines.push(`| ${cell(d.title)} | ${d.document_type} | ${d.delivery} | ${target} | ${d.status}${d.status_reason ? `: ${cell(d.status_reason)}` : ""} |`);
    }
  }
  if (asset.showcase) {
    lines.push("");
    lines.push(`## Showcase story: ${asset.showcase.story}`);
    lines.push("");
    lines.push(asset.showcase.narrative);
    lines.push("");
    lines.push(`**What it does not show:** ${asset.showcase.limitation}`);
  }
  lines.push("");
  lines.push("## Checklists");
  lines.push("");
  lines.push(`Return and outbound template: \`${model.templates?.return ?? "none"}\`. Accessories: ${(model.common_accessories ?? []).join(", ") || "none"}.`);
  const policies = pack.organization?.policies ?? [];
  if (policies.length > 0) {
    lines.push("");
    lines.push(bulletList(policies.map((p) => `Northridge policy \`${p.policy_id}\`: ${p.text}`)));
  }
  lines.push("");
  lines.push(`Files: \`${packDir}\`.`);
  lines.push("");
  return lines.join("\n");
}

/** Storyboard for approval before artwork. */
export function renderStoryboardMarkdown(pack, { generator }) {
  const model = pack.models[0];
  const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
  const panels = model.pictograms ?? [];
  const counts = Object.fromEntries(ITEM_STATUSES.map((s) => [s, panels.filter((p) => p.status === s).length]));
  const lines = [];
  lines.push(`# ${model.manufacturer} ${model.model}: pictogram storyboard`);
  lines.push("");
  lines.push(`Generated from [pack.json](pack.json) by \`${generator}\`. Do not edit by hand.`);
  lines.push("");
  lines.push(
    `${panels.length} panels: ${counts.READY} READY, ${counts.REVIEW_REQUIRED} REVIEW_REQUIRED, ${counts.BLOCKED} BLOCKED. ` +
      "This is the storyboard and source mapping for grouped approval. **No final artwork is drawn until it is approved.** " +
      "Panels follow ISO 9244, ISO 3864, ISO 7010 and ANSI Z535 conventions without copying their symbols; controls are never mirrored or stylized, and anything the cited source does not show is left out."
  );
  panels.forEach((panel, i) => {
    lines.push("");
    lines.push(`## ${i + 1}. ${panel.title} \`${panel.panel_id}\` · ${panel.status}`);
    lines.push("");
    lines.push(`- **Task:** ${panel.task}`);
    lines.push(`- **Caption:** ${panel.caption}`);
    if (panel.alt) lines.push(`- **Alt text (draft):** ${panel.alt}`);
    if (panel.control_orientation) lines.push(`- **Control orientation:** ${panel.control_orientation}`);
    if ((panel.warnings ?? []).length > 0) lines.push(`- **Warnings:** ${panel.warnings.join(" ")}`);
    if ((panel.interlocks ?? []).length > 0) lines.push(`- **Interlocks:** ${panel.interlocks.join(" ")}`);
    lines.push(`- **Source:** ${refsText(panel.source_refs, sourcesById)}`);
    lines.push(`- **Status:** ${panel.status}${panel.status_reason ? `: ${panel.status_reason}` : ""}`);
    if ((panel.reviewer_checklist ?? []).length > 0) {
      lines.push("- **Reviewer checklist:**");
      for (const item of panel.reviewer_checklist) lines.push(`  - [ ] ${item}`);
    }
  });
  lines.push("");
  return lines.join("\n");
}

export const PACK_TIERS = {
  "premium-showcase":
    "Everything in a standard pack, plus original pictographic panels and a Start-Up Guide PDF, retouched licensed photos, staff support notes and a showcase story. Planned for all four Northridge showcase assets (E2A); a pack whose panels are all blocked is listed as standard until they can be drawn.",
  "standard-onboarding":
    "Identity and configuration, sourced specs, the official manual link (or hosting where permitted), page text condensed from cited steps, the customer's own photo and the matching return template. No new artwork: a premium pack's panels are reused only for the same model and configuration, and only after the operator approves cross-organization reuse.",
};

/** The reusable index of model packs: what each covers, how complete it is and what limits its reuse. */
export function buildModelPackIndex(entries, { generator }) {
  const packs = entries.map(({ pack, dirName }) => {
    const model = pack.models[0];
    const asset = pack.assets[0];
    const panels = model.pictograms ?? [];
    const guide = (asset.documents ?? []).find((d) => d.document_type === "startup_guide");
    const sources = new Map(pack.sources.map((s) => [s.source_id, s]));
    const manual = sources.get(model.manual.source_id);
    const readyLists = ["specs", "quick_guide", "warnings", "pictograms"].filter((list) => (model[list] ?? []).length > 0 && (model[list] ?? []).every((i) => i.status !== "BLOCKED"));
    return {
      model_key: model.model_key,
      manufacturer: model.manufacturer,
      model: model.model,
      category: model.category,
      // A pack with no drawable panel delivers only the standard parts, whatever was planned for it.
      tier: panels.some((p) => (p.files ?? []).length > 0) ? "premium-showcase" : "standard-onboarding",
      pack: `docs/phase-e/packs/${dirName}/pack.json`,
      review_status: model.review.status,
      items: statusCounts(model),
      page_fields: pageStatusCounts(asset),
      panels: { total: panels.length, drawn: panels.filter((p) => (p.files ?? []).length > 0).length, blocked: panels.filter((p) => p.status === "BLOCKED").length },
      guide: guide ? `docs/phase-e/packs/${dirName}/${guide.file.file}` : null,
      photo: model.photo?.status ?? "BLOCKED",
      manual: { source_id: model.manual.source_id, delivery: model.manual.delivery, availability: manual?.availability ?? null },
      assets: pack.assets.map((a) => a.asset_code),
      reuse: {
        shareable_across_orgs: pack.sources.every((s) => s.rights.shareable_across_orgs === true),
        reusable_parts_without_blocks: readyLists,
        applies_to_configuration: model.configuration,
        blocked_by: model.review.blockers ?? [],
      },
    };
  });
  return { index: "model-packs", generated_by: generator, tiers: PACK_TIERS, packs };
}

export function renderModelPackIndexMarkdown(index) {
  const lines = [];
  lines.push("# Model-pack index");
  lines.push("");
  lines.push(`Generated by \`${index.generated_by}\` from the packs. Do not edit by hand. Machine-readable: [MODEL_PACK_INDEX.json](MODEL_PACK_INDEX.json).`);
  lines.push("");
  lines.push("## Tiers");
  lines.push("");
  for (const [tier, text] of Object.entries(index.tiers)) lines.push(`- **${tier}**: ${text}`);
  lines.push("");
  lines.push("## Packs");
  lines.push("");
  lines.push("| Model | Tier | Review | Items (ready / review / blocked) | Page fields | Panels drawn | Guide | Photo | Manual | Assets |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const p of index.packs) {
    lines.push(
      `| [\`${p.model_key}\`](${p.pack.replace("docs/phase-e/packs/", "")}) ${cell(p.manufacturer)} ${cell(p.model)} | ${p.tier} | ${p.review_status} | ${p.items.READY} / ${p.items.REVIEW_REQUIRED} / ${p.items.BLOCKED} | ${p.page_fields.READY} / ${p.page_fields.REVIEW_REQUIRED} / ${p.page_fields.BLOCKED} | ${p.panels.drawn} of ${p.panels.total} | ${p.guide ? "PDF" : "none"} | ${p.photo} | ${p.manual.delivery}, ${p.manual.availability ?? "?"} | ${p.assets.join(", ")} |`
    );
  }
  lines.push("");
  lines.push("## Reuse");
  lines.push("");
  lines.push("A pack is reused for another asset only when the model **and** the configuration match. Cross-organization reuse also needs every source marked `shareable_across_orgs` by the operator; none is yet.");
  for (const p of index.packs) {
    lines.push("");
    lines.push(`### \`${p.model_key}\``);
    lines.push("");
    lines.push(`- Configuration it applies to: ${Object.entries(p.reuse.applies_to_configuration).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ")}.`);
    lines.push(`- Parts with nothing blocked: ${p.reuse.reusable_parts_without_blocks.join(", ") || "none"}.`);
    lines.push(`- Shareable across organizations: ${p.reuse.shareable_across_orgs ? "yes" : "no (not approved)"}.`);
    if (p.reuse.blocked_by.length > 0) lines.push(`- Open blockers: ${p.reuse.blocked_by.join(" ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** SOURCES.md: the register as a readable table. */
export function renderSourcesMarkdown(register, { generator, citedBy }) {
  const lines = [];
  lines.push("# E2A source and rights register");
  lines.push("");
  lines.push(`Generated from [SOURCES_REGISTER.json](SOURCES_REGISTER.json) by \`${generator}\`. Do not edit by hand.`);
  lines.push("");
  for (const note of register.notes ?? []) lines.push(`- ${note}`);
  lines.push("");
  lines.push("| Source | Kind | Edition | Rights | Use | Availability | Verified | Used by |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const s of register.sources) {
    const title = s.url ? `[${cell(s.title)}](${s.url})` : cell(s.title);
    lines.push(
      `| \`${s.source_id}\`<br>${title} | ${s.kind} | ${cell(s.edition ?? "")} | ${s.rights.status} | ${s.rights.redistribution} | ${s.availability ?? ""} | ${s.verification} | ${cell((citedBy.get(s.source_id) ?? []).join(", "))} |`
    );
  }
  lines.push("");
  lines.push("## Applicability and integrity");
  lines.push("");
  for (const s of register.sources) {
    lines.push(`### \`${s.source_id}\``);
    lines.push("");
    if (s.applicability) lines.push(`- Applicability: ${s.applicability}`);
    if (s.locator_convention) lines.push(`- Locators: ${s.locator_convention}`);
    if (s.sha256) lines.push(`- ${s.bytes} bytes, SHA-256 \`${s.sha256}\`${s.last_modified ? `, Last-Modified ${s.last_modified}` : ""}, retrieved ${s.retrieved_at ?? "?"}`);
    if (s.rights.attribution) lines.push(`- Attribution: ${s.rights.attribution}`);
    if (s.rights.license_url) lines.push(`- Licence: ${s.rights.license_url}`);
    lines.push("");
  }
  return lines.join("\n");
}
