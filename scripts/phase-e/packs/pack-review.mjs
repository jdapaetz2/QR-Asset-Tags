/**
 * Engineering Phase E2A — sync the showcase content packs and render their review copies.
 *
 *   npm.cmd run phase-e:packs:review [-- --vault=<dir>] [--no-private]
 *
 * Source of truth: docs/phase-e/packs/<model_key>/pack.json (hand-authored) and docs/phase-e/packs/SOURCES_REGISTER.json.
 * Deterministically, this script:
 *   1. embeds in each pack the register entries it cites (pack.sources) and its photo's files from media/media.json;
 *   2. writes review.md and storyboard.md beside each pack, and SOURCES.md beside the register;
 *   3. writes REVIEW_GALLERY.html (public-safe: derivative photos and original artwork only);
 *   4. unless --no-private, writes REVIEW_GALLERY_PRIVATE.html into the source vault (outside Git, default
 *      <home>/Mulemark-Sources/e2a/review) with the cited manual pages and the before/after retouch crops. Those images
 *      are OEM pages and unretouched originals, so that file must never be committed or published.
 * The gallery is picture-first: photos, panels, signs, accessories and documents with short labels and one status
 * mark each; every record (frames, sources, reasons, checklists, page text, manual pages) sits in collapsed sections.
 * Manual page images come from <vault>/renders (render-pdf-pages.ps1). Missing pages are listed with the command that
 * makes them; they are not fatal.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  buildModelPackIndex,
  embedSources,
  locatorPdfPages,
  missingPolicies,
  renderModelPackIndexMarkdown,
  readinessProblems,
  renderReviewMarkdown,
  renderSourcesMarkdown,
  renderStoryboardMarkdown,
  statusCounts,
} from "../../lib/content-pack.mjs";
import { C, book, camera } from "./pictogram-kit.mjs";
import { accessorySvgs } from "./pictogram-signs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
const GENERATOR = "scripts/phase-e/packs/pack-review.mjs";

/** How each source's locators map to PDF pages (PDF page = printed page + offset). */
export const PAGE_RULES = {
  "src-bigtex-owners-2020": { offset: 1 },
  "src-bigtex-owners-2020-dump": { offset: 1 },
  "src-bigtex-hoist": { offset: 2 },
  "src-bigtex-wiring": { singleSheet: true },
  "src-bigtex-plug-contacts": { singleSheet: true },
  "src-bobcat-b1699": { offset: 0 },
  "src-bobcat-e19-e20-schedule": { offset: 0 },
  "src-cat-301-5-brochure": { offset: 0 },
  // Its locators cite the full manual's contents; the preview's contents page is what can be shown.
  "src-cat-301-5-omm-preview": { fixed: [3] },
};

function parseArgs(argv) {
  const args = { vault: path.join(os.homedir(), "Mulemark-Sources", "e2a"), privateGallery: true };
  for (const arg of argv) {
    if (arg.startsWith("--vault=")) args.vault = arg.slice("--vault=".length);
    else if (arg === "--no-private") args.privateGallery = false;
    else throw new Error(`Unknown option ${arg}.`);
  }
  return args;
}

const esc = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function loadPacks() {
  const packs = [];
  for (const entry of (await readdir(PACKS, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(PACKS, entry.name, "pack.json");
    if (entry.isDirectory() && existsSync(file)) {
      const mediaFile = path.join(PACKS, entry.name, "media", "media.json");
      packs.push({
        dirName: entry.name,
        dir: path.join(PACKS, entry.name),
        file,
        pack: await readJson(file),
        media: existsSync(mediaFile) ? await readJson(mediaFile) : { items: [] },
      });
    }
  }
  // Asset-code order (EXCAVATOR-017, EXCAVATOR-3015, TRAILER-014, TRAILER-2041) matches the E0 fleet document.
  return packs.sort((a, b) => a.pack.assets[0].asset_code.localeCompare(b.pack.assets[0].asset_code));
}

/** Pages each pack cites, per source, for the private gallery. */
function citedPages(refs, sourcesById) {
  const out = [];
  for (const ref of refs ?? []) {
    const source = sourcesById.get(ref.source_id);
    const rule = PAGE_RULES[ref.source_id];
    if (!source || !rule || source.availability !== "in-hand" || !source.vault_path?.endsWith(".pdf")) continue;
    const pages = rule.fixed ?? locatorPdfPages(ref.locator, rule);
    for (const page of pages) out.push({ source, page });
  }
  return out;
}

function renderPath(vault, source, page) {
  const base = path.posix.basename(source.vault_path, ".pdf");
  return path.join(vault, "renders", `${base}-p${String(page).padStart(3, "0")}.png`);
}

async function dataUri(file, width, cache) {
  if (cache.has(file)) return cache.get(file);
  const buffer = await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 62 }).toBuffer();
  const uri = `data:image/webp;base64,${buffer.toString("base64")}`;
  cache.set(file, uri);
  return uri;
}

const PAGE_FIELDS = [
  ["headline", "Headline"],
  ["quick_start_text", "Quick start"],
  ["safety_notes", "Safety"],
  ["fuel_power_notes", "Fuel / power"],
  ["troubleshooting_notes", "Troubleshooting"],
  ["return_notes", "Return"],
  ["emergency_notes", "Emergency"],
];

const STYLE = `
:root{color-scheme:light;--ink:#1c1b19;--muted:#5f5b53;--line:#e3e0d8;--bg:#faf9f6;--card:#fff;--ready:#2f6b3a;--review:#8a5a00;--blocked:#9b2c2c}
*{box-sizing:border-box}html,body{overflow-x:hidden}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1180px;margin:0 auto;padding:20px 16px 64px}h1{font-size:24px;margin:0}h2{font-size:21px;margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
h3{font-size:15px;margin:18px 0 6px}a{color:#6b4a12}img{max-width:100%}
.top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;margin-bottom:8px}.legend,.nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:0;color:var(--muted)}
.legend span,.nav a{display:inline-flex;align-items:center;gap:5px}.mark{width:18px;height:18px;flex:none;vertical-align:middle}
.code{font:600 13px/1 ui-monospace,Consolas,monospace;background:#efebe3;border-radius:6px;padding:5px 8px}
.asset{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:20px 0}
.hero{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
.photo img,.pending{width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:8px;object-fit:cover;display:block}
.pending{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f6f4ef;color:var(--muted);font-weight:600}
.photo .credit{display:block;font-size:12px;font-weight:400;color:var(--muted);margin:4px 0 0}.credit .mark{width:14px;height:14px}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}.chips li{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 12px 4px 6px;font-weight:600;font-variant-numeric:tabular-nums}
.chips svg{width:26px;height:26px}
.panels{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:14px;margin-top:16px}
.signs{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
figure{margin:0}.art{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:8px;background:#fff}
.sign .art{border:0}.manual{aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f6f4ef;color:var(--muted);font-weight:600;border:1px dashed #cfc8b8;border-radius:8px}
.manual svg,.pending svg{width:56px;height:56px}
figcaption{display:flex;align-items:center;gap:6px;margin-top:6px;font-weight:650}.n{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:50%;background:var(--ink);color:#fff;font-size:12px}
.sign figcaption{justify-content:center;font-size:13px;text-align:center}
.row{display:flex;flex-wrap:wrap;gap:12px 32px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.icons{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:flex-end}.icon{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;font-weight:600;text-align:center;max-width:110px}
.icon svg.glyph{width:48px;height:48px}.icon a{color:inherit;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:4px}
.icon .lbl{display:inline-flex;align-items:center;gap:4px}
details{margin-top:6px}details>summary{cursor:pointer;color:var(--muted);list-style:none;display:inline-flex;align-items:center;gap:6px}details>summary::-webkit-details-marker{display:none}
details.rec>summary{width:28px;height:28px;justify-content:center;border-radius:6px}details.rec>summary:hover{background:#f1eee7}
details[open].rec{background:#faf9f6;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.panels figcaption{padding-right:34px}.panels details.rec{margin-top:-29px;text-align:right}.panels details.rec[open]{margin-top:6px;text-align:left}
.machine{margin-top:16px;border-top:1px solid var(--line);padding-top:10px}.machine>summary{font-weight:600}
.small{font-size:13px;color:var(--muted)}ol,ul{margin:4px 0;padding-left:20px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-top:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
.phone{max-width:360px;border:10px solid #2b2925;border-radius:28px;padding:14px;background:#fff;margin:8px 0}.phone h4{margin:0 0 8px;font-size:17px}.phone .pf{border-top:1px solid var(--line);padding:8px 0}
.phone .f{display:flex;align-items:center;gap:6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}.phone p{margin:4px 0;font-size:14px;white-space:pre-line}
.pages img,.retouch img{width:100%;border:1px solid var(--line);border-radius:6px}.retouch{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.notice{border-left:4px solid var(--review);background:#fff8ea;padding:10px 14px;border-radius:4px}
@media (max-width:720px){.hero{grid-template-columns:1fr}}`;

/** One status mark: tick (READY), eye (REVIEW_REQUIRED) or padlock (BLOCKED); named for screen readers. */
const MARK_NAMES = { READY: "Ready", REVIEW_REQUIRED: "Needs your review", BLOCKED: "Blocked" };
function mark(status) {
  const name = MARK_NAMES[status] ?? status;
  const shapes = {
    READY: `<circle cx="10" cy="10" r="9" fill="#2f6b3a"/><path d="M5.5 10.3 8.6 13.2 14.6 7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    REVIEW_REQUIRED: `<circle cx="10" cy="10" r="9" fill="#8a5a00"/><path d="M3.8 10Q10 4 16.2 10Q10 16 3.8 10Z" fill="#fff"/><circle cx="10" cy="10" r="2.4" fill="#8a5a00"/>`,
    BLOCKED: `<circle cx="10" cy="10" r="9" fill="#9b2c2c"/><path d="M7 9V7.5a3 3 0 0 1 6 0V9" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="5.8" y="9" width="8.4" height="6" rx="1.2" fill="#fff"/>`,
  };
  return `<svg class="mark" viewBox="0 0 20 20" role="img" aria-label="${esc(name)}"><title>${esc(name)}</title>${shapes[status] ?? ""}</svg>`;
}

const RETURN_ICON = `<svg viewBox="0 0 48 48" width="40" height="40" role="img" aria-label="Bring these back" style="align-self:center"><title>Bring these back</title><path d="M14 18 H32 A10 10 0 0 1 32 38 H18" fill="none" stroke="#1F63A8" stroke-width="5" stroke-linecap="round"/><polygon points="6,18 16,9 16,27" fill="#1F63A8"/></svg>`;
const RECORD_ICON =`<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#5f5b53" stroke-width="1.6"/><rect x="9.1" y="8.6" width="1.8" height="6" rx=".9" fill="#5f5b53"/><circle cx="10" cy="5.8" r="1.1" fill="#5f5b53"/></svg>`;
const record = (label, body) => `<details class="rec"><summary aria-label="${esc(label)}">${RECORD_ICON}</summary>${body}</details>`;

/** Small glyphs for the identity chips and document icons (original drawings, no words). */
const GLYPHS = {
  length: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 13h20M3 13l4-4M3 13l4 4M23 13l-4-4M23 13l-4 4" fill="none" stroke="#1F63A8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ball: `<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="10" r="6" fill="#A9A397" stroke="#1F1D1A" stroke-width="2"/><path d="M11 16h4v5h-4zM4 19h12v4H4z" fill="#A9A397" stroke="#1F1D1A" stroke-width="1.6"/></svg>`,
  plug: `<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="7" y="7" width="12" height="12" rx="3" fill="#D8D2C5" stroke="#1F1D1A" stroke-width="2"/><path d="M2 13h5M19 13h5" stroke="#1F1D1A" stroke-width="2.6"/></svg>`,
  axle: `<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9" fill="#4A463F" stroke="#1F1D1A" stroke-width="2"/><circle cx="13" cy="13" r="4" fill="#D8D2C5"/></svg>`,
  weight: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M9 9a4 4 0 1 1 8 0" fill="none" stroke="#1F1D1A" stroke-width="2.2"/><path d="M6 10h14l3 12H3z" fill="#4A463F" stroke="#1F1D1A" stroke-width="1.6"/></svg>`,
  depth: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 6h20" stroke="#1F1D1A" stroke-width="2.4"/><path d="M13 7v14M13 21l-4-4M13 21l4-4" fill="none" stroke="#1F63A8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fuel: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M5 7h9l4 4v12H5z" fill="#E53935" stroke="#1F1D1A" stroke-width="1.8"/><path d="M8 13l6 6M14 13l-6 6" stroke="#1F1D1A" stroke-width="1.6"/></svg>`,
  speed: `<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 18a10 10 0 0 1 20 0" fill="none" stroke="#1F1D1A" stroke-width="2.4"/><path d="M13 18l5-6" stroke="#C62828" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  pdf: `<svg class="glyph" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 4h20l10 10v30H10z" fill="#fff" stroke="#1F1D1A" stroke-width="2.6" stroke-linejoin="round"/><path d="M30 4v10h10" fill="none" stroke="#1F1D1A" stroke-width="2.6"/><rect x="15" y="20" width="9" height="7" fill="#1F63A8"/><rect x="26" y="20" width="9" height="7" fill="#1F63A8"/><rect x="15" y="30" width="9" height="7" fill="#1F63A8"/><rect x="26" y="30" width="9" height="7" fill="#1F63A8"/></svg>`,
  manual: `<svg class="glyph" viewBox="0 0 64 64" aria-hidden="true">${book(32, 32, 1.1, C.action)}</svg>`,
  sheet: `<svg class="glyph" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 4h28v40H10z" fill="#fff" stroke="#1F1D1A" stroke-width="2.6"/><path d="M24 12l9 16H15z" fill="#F2C200" stroke="#1F1D1A" stroke-width="2"/><path d="M15 34h18M15 39h12" stroke="#1F1D1A" stroke-width="2.4"/></svg>`,
};

const firstMatch = (text, re) => String(text ?? "").match(re)?.[0] ?? null;

/** Identity chips, numbers only, each taken from a sourced spec or the configuration. */
export function identityChips(model) {
  const spec = (id) => (model.specs ?? []).find((s) => s.spec_id === id && s.status !== "BLOCKED")?.value;
  const chips = [];
  const push = (icon, text, label) => text && chips.push({ icon, text, label });
  push("length", firstMatch(spec("bed"), /\d+ ft/), "Bed length");
  push("ball", firstMatch(spec("coupler"), /^[\d-/]+ in/), "Ball size");
  push("weight", spec("gvwr"), "Gross weight rating");
  push("plug", firstMatch(model.configuration?.trailer_plug, /^\d+-way/), "Trailer plug");
  const axles = spec("gawr");
  if (axles) push("axle", /2 x/.test(axles) ? "2" : "1", "Axles");
  push("weight", firstMatch(spec("operating-weight"), /[\d,]+-[\d,]+ lb/), "Operating weight");
  push("depth", firstMatch(spec("dig-depth"), /[\d.]+ in/), "Dig depth");
  push("fuel", firstMatch(spec("fuel-tank"), /[\d.]+ gal/), "Fuel tank");
  push("speed", firstMatch(spec("travel-speed"), /[\d.]+ mph/), "Top travel speed");
  return chips;
}

const DOC_ICONS = { startup_guide: ["pdf", "Start-Up Guide"], manual: ["manual", "Manual"], safety_sheet: ["sheet", "Safety sheet"] };

function refsHtml(refs, sourcesById) {
  return (refs ?? [])
    .map((ref) => {
      const source = sourcesById.get(ref.source_id);
      return `${esc(source ? source.title : ref.source_id)}${ref.locator ? `, ${esc(ref.locator)}` : ""}`;
    })
    .join("; ");
}

const FRAME_WORDS = { do: "Do", dont: "Don't", check: "Check", detail: "Close-up" };

async function artSrc(dirName, file, privateMode) {
  if (!privateMode) return `${dirName}/${file}`;
  const buffer = await readFile(path.join(PACKS, dirName, ...file.split("/")));
  const type = file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "image/webp";
  return `data:${type};base64,${buffer.toString("base64")}`;
}

async function sourcePagesHtml(refs, sourcesById, { vault, cache, missing }) {
  const pages = citedPages(refs, sourcesById);
  if (pages.length === 0) return "";
  const parts = [`<details><summary>Source pages (${pages.length})</summary><div class="pages">`];
  for (const { source, page } of pages) {
    const file = renderPath(vault, source, page);
    if (existsSync(file)) {
      parts.push(`<img src="${await dataUri(file, 760, cache)}" alt="${esc(source.title)}, PDF page ${page}" loading="lazy"><p class="small">${esc(source.title)}, PDF page ${page}</p>`);
    } else {
      missing.add(`${source.vault_path}|${page}`);
      parts.push(`<p class="small">Missing render: ${esc(source.title)}, PDF page ${page}</p>`);
    }
  }
  parts.push("</div></details>");
  return parts.join("");
}

function phonePreview(asset) {
  const parts = [`<div class="phone"><h4>${esc(asset.page.headline.text ?? asset.asset_name)}</h4>`];
  for (const [key, title] of PAGE_FIELDS.slice(1)) {
    const f = asset.page[key];
    parts.push(`<div class="pf"><div class="f">${mark(f.status)}${esc(title)}</div>${f.text ? `<p>${esc(f.text)}</p>` : `<p class="small">(empty)</p>`}${f.status_reason ? `<p class="small">${esc(f.status_reason)}</p>` : ""}</div>`);
  }
  parts.push("</div>");
  return parts.join("");
}

async function machineSection(entry, { privateMode, vault, cache, missing }) {
  const { pack, media, dirName } = entry;
  const model = pack.models[0];
  const asset = pack.assets[0];
  const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
  const ctx = { vault, cache, missing };
  const parts = [];
  parts.push(`<section class="asset" id="${esc(dirName)}">`);
  parts.push(`<h2><span class="code">${esc(asset.asset_code)}</span>${esc(model.manufacturer)} ${esc(model.model)}${mark(model.review.status === "READY" ? "READY" : "REVIEW_REQUIRED")}</h2>`);

  // Photo (or the pending card) and the identity chips.
  const chosen = media.items.find((i) => i.source_id === model.photo?.source_id);
  const hero = chosen?.outputs.find((o) => o.file.endsWith(".webp"));
  parts.push('<div class="hero"><figure class="photo">');
  if (hero) {
    parts.push(`<img src="${esc(await artSrc(dirName, `media/${hero.file}`, privateMode))}" alt="${esc(model.photo.alt ?? chosen.alt)}" loading="lazy">`);
    parts.push(`<figcaption class="credit" data-required>${mark(model.photo.status)} Photo: ${esc(chosen.credit.author)}, ${esc(chosen.credit.license)}${chosen.credit.modified ? ", modified" : ""} (<a href="${esc(chosen.credit.source_url)}">source</a>)</figcaption>`);
  } else {
    parts.push(`<div class="pending" role="img" aria-label="Photo pending"><svg class="glyph" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${camera(32, 34, 1.1, C.steel)}</svg><span>Photo pending</span>${mark("BLOCKED")}</div>`);
  }
  parts.push("</figure>");
  const chips = identityChips(model);
  parts.push(chips.length ? `<ul class="chips">${chips.map((c) => `<li title="${esc(c.label)}">${GLYPHS[c.icon]}<span>${esc(c.text)}</span></li>`).join("")}</ul>` : "<div></div>");
  parts.push("</div>");

  // Panels, large, titles only.
  parts.push('<div class="panels">');
  for (const [i, panel] of (model.pictograms ?? []).entries()) {
    const svg = (panel.files ?? []).find((f) => f.file.endsWith(".svg"));
    parts.push("<figure>");
    // Drawn panels carry their number in the art; a "manual needed" card gets it in the caption.
    parts.push(svg ? `<img class="art" src="${esc(await artSrc(dirName, svg.file, privateMode))}" alt="${esc(panel.alt ?? panel.title)}" loading="lazy">` : `<div class="manual" role="img" aria-label="Not drawn yet">${GLYPHS.manual}<span>Manual needed</span></div>`);
    parts.push(`<figcaption>${svg ? "" : `<span class="n">${i + 1}</span>`}${esc(panel.title)}${mark(panel.status)}</figcaption>`);
    const body = [];
    if ((panel.frames ?? []).length > 0) body.push(`<ol>${panel.frames.map((f) => `<li><strong>${FRAME_WORDS[f.kind]}:</strong> ${esc(f.shows)} <span class="small">(${f.derived_from.map(esc).join(", ")})</span></li>`).join("")}</ol>`);
    body.push(`<p class="small">${esc(panel.caption)}</p>`);
    if (panel.control_orientation) body.push(`<p class="small">Shown: ${esc(panel.control_orientation)}</p>`);
    body.push(`<p class="small">Source: ${refsHtml(panel.source_refs, sourcesById)}</p>`);
    if (panel.status_reason) body.push(`<p class="small">${esc(panel.status_reason)}</p>`);
    if ((panel.reviewer_checklist ?? []).length > 0) body.push(`<ul>${panel.reviewer_checklist.map((c) => `<li class="small">${esc(c)}</li>`).join("")}</ul>`);
    if (privateMode) body.push(await sourcePagesHtml(panel.source_refs, sourcesById, ctx));
    parts.push(record(`Record for ${panel.title}`, body.join("")));
    parts.push("</figure>");
  }
  parts.push("</div>");

  // Safety signs.
  if ((model.signs ?? []).length > 0) {
    parts.push('<div class="signs">');
    for (const sign of model.signs) {
      const svg = (sign.files ?? []).find((f) => f.file.endsWith(".svg"));
      parts.push('<figure class="sign">');
      if (svg) parts.push(`<img class="art" src="${esc(await artSrc(dirName, svg.file, privateMode))}" alt="${esc(sign.alt ?? sign.label)}" loading="lazy">`);
      parts.push(`<figcaption>${esc(sign.label)}${mark(sign.status)}</figcaption>`);
      const body = [
        `<p class="small"><strong>${esc(sign.kind)}:</strong> ${esc(sign.shows)}</p>`,
        `<p class="small">From ${sign.derived_from.map(esc).join(", ")}. Source: ${refsHtml(sign.source_refs, sourcesById)}</p>`,
        sign.status_reason ? `<p class="small">${esc(sign.status_reason)}</p>` : "",
        (sign.reviewer_checklist ?? []).length ? `<ul>${sign.reviewer_checklist.map((c) => `<li class="small">${esc(c)}</li>`).join("")}</ul>` : "",
        privateMode ? await sourcePagesHtml(sign.source_refs, sourcesById, ctx) : "",
      ];
      parts.push(record(`Record for ${sign.label}`, body.join("")));
      parts.push("</figure>");
    }
    parts.push("</div>");
  }

  // Accessories to bring back, and the documents on the page.
  const accSvgs = accessorySvgs(model);
  parts.push(`<div class="row"><div class="icons">${(model.accessory_icons ?? []).length ? RETURN_ICON : ""}`);
  for (const a of model.accessory_icons ?? []) {
    parts.push(`<div class="icon">${accSvgs.get(a.name).replace("<svg ", '<svg class="glyph" ')}<span class="lbl">${esc(a.name)}${mark(a.status)}</span></div>`);
  }
  parts.push('</div><div class="icons">');
  for (const d of asset.documents ?? []) {
    const [glyph, label] = DOC_ICONS[d.document_type] ?? ["sheet", d.document_type];
    const href = d.delivery === "hosted" ? `${dirName}/${d.file.file}` : d.url;
    parts.push(`<div class="icon"><a href="${esc(href)}" title="${esc(d.title)}">${GLYPHS[glyph]}<span class="lbl">${esc(label)}${mark(d.status)}</span></a></div>`);
  }
  parts.push("</div></div>");

  // Everything else, collapsed.
  const c = statusCounts(model);
  const rec = [];
  rec.push(`<p class="small"><code>${esc(model.model_key)}</code> · route <code>${esc(asset.qr?.existing_short_code ?? "")}</code> (protected, unchanged) · serial <code>${esc(asset.serial_number)}</code> · ${c.READY} READY, ${c.REVIEW_REQUIRED} REVIEW_REQUIRED, ${c.BLOCKED} BLOCKED</p>`);
  rec.push(`<h3>Blockers</h3><ul>${(model.review.blockers ?? []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
  rec.push("<h3>Page text (phone preview)</h3>");
  rec.push(phonePreview(asset));
  rec.push("<h3>Documents</h3><ul>");
  for (const d of asset.documents ?? []) {
    const target = d.delivery === "hosted" ? `${d.file.file} (${d.file.pages ?? "?"} pages, ${Math.round(d.file.bytes / 1024)} KB)` : d.url;
    rec.push(`<li>${mark(d.status)} ${esc(d.title)} · ${esc(d.document_type)} · ${esc(d.delivery)} · <span class="small">${esc(target)}</span>${d.status_reason ? `<br><span class="small">${esc(d.status_reason)}</span>` : ""}</li>`);
  }
  rec.push("</ul>");
  rec.push("<h3>Configuration</h3><table>");
  for (const [key, value] of Object.entries(model.configuration ?? {})) rec.push(`<tr><th>${esc(key.replace(/_/g, " "))}</th><td>${esc(value)}</td></tr>`);
  rec.push("</table>");
  rec.push("<h3>Manual and supplements</h3><ul>");
  for (const id of [model.manual.source_id, ...(model.manual.supplements ?? [])]) {
    const s = sourcesById.get(id);
    if (s) rec.push(`<li><a href="${esc(s.url)}">${esc(s.title)}</a>${s.edition ? ` (${esc(s.edition)})` : ""} · ${esc(s.availability ?? "")} · ${esc(s.rights.redistribution)}</li>`);
  }
  rec.push("</ul>");
  if (privateMode) {
    const covers = [model.manual.source_id, ...(model.manual.supplements ?? [])].map((id) => sourcesById.get(id)).filter((s) => s?.availability === "in-hand" && s.vault_path?.endsWith(".pdf"));
    if (covers.length > 0) {
      rec.push('<details><summary>Manual covers</summary><div class="pages">');
      for (const s of covers) {
        const file = renderPath(vault, s, 1);
        if (existsSync(file)) rec.push(`<figure><img src="${await dataUri(file, 600, cache)}" alt="${esc(s.title)} cover"><figcaption class="small">${esc(s.title)}</figcaption></figure>`);
        else missing.add(`${s.vault_path}|1`);
      }
      rec.push("</div></details>");
    }
  }
  rec.push("<h3>Photo</h3>");
  if (media.items.length === 0) rec.push(`<p class="small">No licensed exact-model photo exists yet. ${esc(model.review.blockers?.find((b) => /photo/i.test(b)) ?? "")}</p>`);
  for (const item of media.items) {
    rec.push(`<p><strong>${esc(item.id)}</strong> ${item.source_id === model.photo?.source_id ? "(used)" : "(alternative)"} · ${esc(item.credit.author)}, ${esc(item.credit.license)}${item.credit.modified ? ", modified" : ""}. <a href="${esc(item.credit.source_url)}">Source</a></p>`);
    if (item.source_id !== model.photo?.source_id) {
      const webp = item.outputs.find((o) => o.file.endsWith(".webp"));
      if (webp) rec.push(`<img src="${esc(await artSrc(dirName, `media/${webp.file}`, privateMode))}" alt="${esc(item.alt)}" loading="lazy" style="max-width:420px">`);
    }
    rec.push(`<ul>${item.modifications.map((m) => `<li class="small">${esc(m)}</li>`).join("")}</ul>`);
    rec.push(`<p class="small">${item.outputs.map((o) => `${esc(o.file)}: ${o.bytes} bytes`).join(" · ")}</p>`);
    if (privateMode) {
      for (const [n, step] of item.retouch.entries()) {
        const before = path.join(vault, "inspect", "retouch", `${item.id}-${n + 1}-before.png`);
        const after = path.join(vault, "inspect", "retouch", `${item.id}-${n + 1}-after.png`);
        if (existsSync(before) && existsSync(after)) {
          rec.push(`<p class="small">Removed: ${esc(step.what)} (before, after)</p><div class="retouch"><img src="${await dataUri(before, 520, cache)}" alt="Before"><img src="${await dataUri(after, 520, cache)}" alt="After"></div>`);
        }
      }
    }
  }
  if (asset.showcase) rec.push(`<h3>Showcase story: ${esc(asset.showcase.story)}</h3><p>${esc(asset.showcase.narrative)}</p><p class="small"><strong>What it does not show:</strong> ${esc(asset.showcase.limitation)}</p>`);
  rec.push(`<h3>Checklist</h3><p class="small">Return and outbound template <code>${esc(model.templates?.return ?? "none")}</code>. Accessories: ${esc((model.common_accessories ?? []).join(", ") || "none")}. Full review copy: <code>docs/phase-e/packs/${esc(dirName)}/review.md</code>; storyboard: <code>storyboard.md</code>.</p>`);
  parts.push(`<details class="machine"><summary>Machine record</summary>${rec.join("")}</details>`);
  parts.push("</section>");
  return parts.join("\n");
}

async function galleryHtml(entries, register, { privateMode, vault, cache, missing }) {
  const parts = [];
  parts.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
  parts.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
  parts.push(`<title>${privateMode ? "E2A review gallery (private)" : "E2A review gallery"}</title><style>${STYLE}</style></head><body><main>`);
  parts.push('<header class="top">');
  parts.push(`<h1>Showcase packs${privateMode ? " (private)" : ""}</h1>`);
  parts.push(`<p class="legend"><span>${mark("READY")}Ready</span><span>${mark("REVIEW_REQUIRED")}Needs your review</span><span>${mark("BLOCKED")}Blocked</span></p>`);
  parts.push(`<p class="nav">${entries.map((e) => `<a href="#${esc(e.dirName)}" class="code">${esc(e.pack.assets[0].asset_code)}</a>`).join("")}</p>`);
  parts.push("</header>");
  if (privateMode) {
    parts.push('<p class="notice" data-required>Private copy: it shows OEM manual pages and the unretouched photo areas. Keep it in the source vault; never commit, share or publish it. The tracked copy, docs/phase-e/packs/REVIEW_GALLERY.html, has derivative photos and original artwork only.</p>');
  }
  for (const entry of entries) parts.push(await machineSection(entry, { privateMode, vault, cache, missing }));

  parts.push('<details class="machine"><summary>Sources</summary><table><tr><th>Source</th><th>Rights</th><th>Use</th><th>Availability</th></tr>');
  for (const s of register.sources) {
    parts.push(`<tr><td><a href="${esc(s.url)}">${esc(s.title)}</a><br><code>${esc(s.source_id)}</code></td><td>${esc(s.rights.status)}</td><td>${esc(s.rights.redistribution)}</td><td>${esc(s.availability ?? "")}</td></tr>`);
  }
  parts.push("</table></details>");
  parts.push(`<p class="small" data-required>Review draft: nothing here is published. Generated by <code>${GENERATOR}</code> from the four pack.json files and SOURCES_REGISTER.json.</p>`);
  parts.push("</main></body></html>\n");
  return parts.join("\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error("Usage: npm.cmd run phase-e:packs:review [-- --vault=<dir>] [--no-private]");
    process.exitCode = 2;
    return;
  }

  const register = await readJson(path.join(PACKS, "SOURCES_REGISTER.json"));
  const entries = await loadPacks();
  const citedBy = new Map();
  const problems = [];

  for (const entry of entries) {
    const { pack, media } = entry;
    pack.sources = embedSources(pack, register);
    const model = pack.models[0];
    if (model.photo) {
      const item = media.items.find((i) => i.source_id === model.photo.source_id);
      model.photo.files = item
        ? item.outputs.map((o) => ({ file: `media/${o.file}`, width: o.width, height: o.height, bytes: o.bytes, sha256: o.sha256 }))
        : [];
    }
    for (const s of pack.sources) citedBy.set(s.source_id, [...(citedBy.get(s.source_id) ?? []), pack.assets[0].asset_code]);
    problems.push(...readinessProblems(model));
    problems.push(...missingPolicies(pack).map((id) => `${pack.manifest_id} cites ${id}, which its organization does not define.`));
    for (const [key, f] of Object.entries(pack.assets[0].page ?? {})) {
      if (f.status === "BLOCKED" && !f.status_reason) problems.push(`${pack.manifest_id} page.${key}: BLOCKED needs a status_reason.`);
    }

    await writeFile(entry.file, `${JSON.stringify(pack, null, 2)}\n`);
    const packDir = `docs/phase-e/packs/${entry.dirName}/`;
    await writeFile(path.join(entry.dir, "review.md"), renderReviewMarkdown(pack, { packDir, generator: GENERATOR }));
    await writeFile(path.join(entry.dir, "storyboard.md"), renderStoryboardMarkdown(pack, { generator: GENERATOR }));
    const c = statusCounts(model);
    console.log(`${pack.assets[0].asset_code}  ${model.model_key}  ${pack.sources.length} sources  ${c.READY} READY  ${c.REVIEW_REQUIRED} REVIEW_REQUIRED  ${c.BLOCKED} BLOCKED`);
  }

  await writeFile(path.join(PACKS, "SOURCES.md"), renderSourcesMarkdown(register, { generator: GENERATOR, citedBy }));
  const index = buildModelPackIndex(entries, { generator: GENERATOR });
  await writeFile(path.join(PACKS, "MODEL_PACK_INDEX.json"), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(PACKS, "MODEL_PACK_INDEX.md"), renderModelPackIndexMarkdown(index));
  const missing = new Set();
  const cache = new Map();
  await writeFile(path.join(PACKS, "REVIEW_GALLERY.html"), await galleryHtml(entries, register, { privateMode: false, vault: args.vault, cache, missing }));
  console.log("wrote docs/phase-e/packs/REVIEW_GALLERY.html (public-safe)");

  if (args.privateGallery) {
    const reviewDir = path.join(args.vault, "review");
    await mkdir(reviewDir, { recursive: true });
    const html = await galleryHtml(entries, register, { privateMode: true, vault: args.vault, cache, missing });
    await writeFile(path.join(reviewDir, "REVIEW_GALLERY_PRIVATE.html"), html);
    console.log(`wrote ${path.join(reviewDir, "REVIEW_GALLERY_PRIVATE.html")} (private; ${Math.round(html.length / 1024)} KB)`);
  }

  if (missing.size > 0) {
    const byPdf = new Map();
    for (const key of missing) {
      const [vaultPath, page] = key.split("|");
      byPdf.set(vaultPath, [...(byPdf.get(vaultPath) ?? []), Number(page)]);
    }
    console.log("Missing page renders (private gallery only). Make them with:");
    for (const [vaultPath, pages] of byPdf) {
      const list = [...new Set(pages)].sort((a, b) => a - b).join(",");
      console.log(`  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\phase-e\\packs\\render-pdf-pages.ps1 -Pdf "${path.join(args.vault, vaultPath)}" -OutDir "${path.join(args.vault, "renders")}" -PageList "${list}"`);
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`problem: ${p}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
