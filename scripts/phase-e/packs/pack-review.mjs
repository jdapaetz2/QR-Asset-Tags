/**
 * Engineering Phase E2A — sync the showcase content packs and render their review copies.
 *
 *   npm.cmd run phase-e:packs:review [-- --vault=<dir>] [--no-private]
 *
 * Source of truth: docs/phase-e/packs/<model_key>/pack.json (hand-authored) and docs/phase-e/packs/SOURCES_REGISTER.json.
 * Deterministically, this script:
 *   1. embeds in each pack the register entries it cites (pack.sources) and its photo's files from media/media.json;
 *   2. writes review.md and storyboard.md beside each pack, and SOURCES.md beside the register;
 *   3. writes REVIEW_GALLERY.html (public-safe: derivative photos and text only);
 *   4. unless --no-private, writes REVIEW_GALLERY_PRIVATE.html into the source vault (outside Git, default
 *      <home>/Mulemark-Sources/e2a/review) with the cited manual pages and the before/after retouch crops. Those images
 *      are OEM pages and unretouched originals, so that file must never be committed or published.
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
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:1120px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:21px;margin:0 0 6px}
h3{font-size:16px;margin:24px 0 8px}h4{font-size:15px;margin:0 0 6px}.meta{color:var(--muted)}a{color:#6b4a12}
.asset{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin:24px 0}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:0 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.READY{color:var(--ready)}.REVIEW_REQUIRED{color:var(--review)}.BLOCKED{color:var(--blocked)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.panel{border:1px solid var(--line);border-radius:8px;padding:12px;background:#fff}.panel p{margin:4px 0}
.photo img,.pages img,.retouch img,img.art{width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
.retouch{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
ul{margin:4px 0;padding-left:20px}details summary{cursor:pointer;color:var(--muted)}.nav a{margin-right:12px}
.notice{border-left:4px solid var(--review);background:#fff8ea;padding:10px 14px;border-radius:4px}
.small{font-size:13px;color:var(--muted)}code{font-size:13px}`;

function statusBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(status)}</span>`;
}

function refsHtml(refs, sourcesById) {
  return (refs ?? [])
    .map((ref) => {
      const source = sourcesById.get(ref.source_id);
      return `${esc(source ? source.title : ref.source_id)}${ref.locator ? `, ${esc(ref.locator)}` : ""}`;
    })
    .join("; ");
}

async function galleryHtml(entries, register, { privateMode, vault, cache, missing }) {
  const parts = [];
  parts.push("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
  parts.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
  parts.push(`<title>${privateMode ? "E2A review gallery (private)" : "E2A review gallery"}</title><style>${STYLE}</style></head><body><main>`);
  parts.push(`<h1>E2A showcase packs: review gallery${privateMode ? " (private copy)" : ""}</h1>`);
  parts.push(`<p class="meta">Generated by <code>${GENERATOR}</code> from the four pack.json files and SOURCES_REGISTER.json. Nothing here is published.</p>`);
  if (privateMode) {
    parts.push("<p class=\"notice\">Private copy: it shows OEM manual pages and the unretouched photo areas. Keep it in the source vault; never commit, share or publish it. The tracked copy, docs/phase-e/packs/REVIEW_GALLERY.html, has text and derivative photos only.</p>");
  }
  parts.push("<p>What this asks you to approve: the photo per machine, the storyboard of each guide (what every panel shows and which manual page it comes from) and the source and rights register. Final artwork is drawn only after approval.</p>");
  parts.push(`<p class="nav">${entries.map((e) => `<a href="#${esc(e.dirName)}">${esc(e.pack.assets[0].asset_code)}</a>`).join("")}</p>`);

  for (const entry of entries) {
    const { pack, media, dirName } = entry;
    const model = pack.models[0];
    const asset = pack.assets[0];
    const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
    const counts = statusCounts(model);
    parts.push(`<section class="asset" id="${esc(dirName)}">`);
    parts.push(`<h2>${esc(asset.asset_code)}: ${esc(model.manufacturer)} ${esc(model.model)}</h2>`);
    parts.push(
      `<p class="meta"><code>${esc(model.model_key)}</code> · route <code>${esc(asset.qr?.existing_short_code ?? "")}</code> (protected, unchanged) · serial <code>${esc(asset.serial_number)}</code> · review ${esc(model.review.status)} · ${counts.READY} READY, ${counts.REVIEW_REQUIRED} REVIEW_REQUIRED, ${counts.BLOCKED} BLOCKED</p>`
    );
    parts.push("<h3>Blockers</h3><ul>" + (model.review.blockers ?? []).map((b) => `<li>${esc(b)}</li>`).join("") + "</ul>");

    parts.push("<h3>Photo</h3>");
    if (media.items.length === 0) {
      parts.push(`<p>${statusBadge("BLOCKED")} No licensed exact-model photo exists. Waiting on Big Tex's permission; no stand-in is used.</p>`);
    } else {
      parts.push("<div class=\"grid\">");
      for (const item of media.items) {
        const webp = item.outputs.find((o) => o.file.endsWith(".webp"));
        const chosen = model.photo?.source_id === item.source_id;
        parts.push("<div class=\"panel photo\">");
        parts.push(`<h4>${esc(item.id)} ${chosen ? "(proposed)" : "(alternative)"}</h4>`);
        if (webp) {
          // The tracked copy links the derivative; the private copy embeds it so the one file opens anywhere.
          const src = privateMode
            ? `data:image/webp;base64,${(await readFile(path.join(PACKS, dirName, "media", webp.file))).toString("base64")}`
            : `${dirName}/media/${webp.file}`;
          parts.push(`<img src="${esc(src)}" alt="${esc(item.alt)}" loading="lazy">`);
        }
        parts.push(`<p class="small">${esc(item.credit.author)}, ${esc(item.credit.license)}${item.credit.modified ? ", modified" : ""}. <a href="${esc(item.credit.source_url)}">Source</a></p>`);
        parts.push("<ul>" + item.modifications.map((m) => `<li class="small">${esc(m)}</li>`).join("") + "</ul>");
        parts.push(`<p class="small">${item.outputs.map((o) => `${esc(o.file)}: ${o.bytes} bytes`).join(" · ")}</p>`);
        if (privateMode) {
          for (const [n, step] of item.retouch.entries()) {
            const before = path.join(vault, "inspect", "retouch", `${item.id}-${n + 1}-before.png`);
            const after = path.join(vault, "inspect", "retouch", `${item.id}-${n + 1}-after.png`);
            if (existsSync(before) && existsSync(after)) {
              parts.push(`<p class="small">Removed: ${esc(step.what)} (before, after)</p><div class="retouch">`);
              parts.push(`<img src="${await dataUri(before, 520, cache)}" alt="Before"><img src="${await dataUri(after, 520, cache)}" alt="After"></div>`);
            }
          }
        }
        parts.push("</div>");
      }
      parts.push("</div>");
    }

    parts.push("<h3>Configuration</h3><table>");
    for (const [key, value] of Object.entries(model.configuration ?? {})) {
      parts.push(`<tr><th>${esc(key.replace(/_/g, " "))}</th><td>${esc(value)}</td></tr>`);
    }
    parts.push("</table>");

    parts.push("<h3>Manual and supplements</h3><ul>");
    for (const id of [model.manual.source_id, ...(model.manual.supplements ?? [])]) {
      const s = sourcesById.get(id);
      if (!s) continue;
      parts.push(`<li><a href="${esc(s.url)}">${esc(s.title)}</a>${s.edition ? ` (${esc(s.edition)})` : ""} · ${esc(s.availability ?? "")} · ${esc(s.rights.redistribution)}</li>`);
    }
    parts.push("</ul>");
    if (privateMode) {
      const covers = [];
      for (const id of [model.manual.source_id, ...(model.manual.supplements ?? [])]) {
        const s = sourcesById.get(id);
        if (s?.availability === "in-hand" && s.vault_path?.endsWith(".pdf")) covers.push(s);
      }
      if (covers.length > 0) {
        parts.push("<details><summary>Manual covers</summary><div class=\"grid pages\">");
        for (const s of covers) {
          const file = renderPath(vault, s, 1);
          if (existsSync(file)) parts.push(`<figure><img src="${await dataUri(file, 600, cache)}" alt="${esc(s.title)} cover"><figcaption class="small">${esc(s.title)}</figcaption></figure>`);
          else missing.add(`${s.vault_path}|1`);
        }
        parts.push("</div></details>");
      }
    }

    const guide = (asset.documents ?? []).find((d) => d.document_type === "startup_guide");
    parts.push("<h3>Start-Up Guide</h3>");
    parts.push(
      guide
        ? `<p>${statusBadge(guide.status)} <a href="${esc(`${dirName}/${guide.file.file}`)}">${esc(guide.title)}</a> (PDF, ${guide.file.pages} pages, ${Math.round(guide.file.bytes / 1024)} KB)${privateMode ? " — open it from the repository folder" : ""}. ${esc(guide.status_reason ?? "")}</p>`
        : `<p>${statusBadge("BLOCKED")} No guide: no panel can be drawn yet. ${esc(model.review.blockers?.[0] ?? "")}</p>`
    );

    parts.push(`<h3>Panels (${(model.pictograms ?? []).length})</h3><div class="grid">`);
    for (const [i, panel] of (model.pictograms ?? []).entries()) {
      parts.push("<div class=\"panel\">");
      const png = (panel.files ?? []).find((f) => f.file.endsWith(".png"));
      if (png) {
        const src = privateMode
          ? `data:image/png;base64,${(await readFile(path.join(PACKS, dirName, png.file))).toString("base64")}`
          : `${dirName}/${png.file}`;
        parts.push(`<img class="art" src="${esc(src)}" alt="${esc(panel.alt ?? panel.title)}" loading="lazy">`);
      }
      parts.push(`<h4>${i + 1}. ${esc(panel.title)} ${statusBadge(panel.status)}</h4>`);
      parts.push(`<p><strong>${esc(panel.caption)}</strong></p>`);
      parts.push(`<p class="small">Task: ${esc(panel.task)}</p>`);
      if (panel.control_orientation) parts.push(`<p class="small">Shown: ${esc(panel.control_orientation)}</p>`);
      if ((panel.warnings ?? []).length > 0) parts.push(`<p class="small">Warnings: ${esc(panel.warnings.join(" "))}</p>`);
      if ((panel.interlocks ?? []).length > 0) parts.push(`<p class="small">Interlocks: ${esc(panel.interlocks.join(" "))}</p>`);
      parts.push(`<p class="small">Source: ${refsHtml(panel.source_refs, sourcesById)}</p>`);
      if (panel.status_reason) parts.push(`<p class="small">${esc(panel.status_reason)}</p>`);
      if ((panel.reviewer_checklist ?? []).length > 0) {
        parts.push("<ul>" + panel.reviewer_checklist.map((c) => `<li class="small">${esc(c)}</li>`).join("") + "</ul>");
      }
      if (privateMode) {
        const pages = citedPages(panel.source_refs, sourcesById);
        if (pages.length > 0) {
          parts.push(`<details><summary>Source pages (${pages.length})</summary><div class="pages">`);
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
        }
      }
      parts.push("</div>");
    }
    parts.push("</div>");

    if (asset.page) {
      parts.push("<h3>Public page text</h3><table>");
      for (const [key, title] of PAGE_FIELDS) {
        const f = asset.page[key];
        const text = f.text ? esc(f.text).replace(/\n/g, "<br>") : "<em>(empty)</em>";
        parts.push(`<tr><th>${esc(title)}<br>${statusBadge(f.status)}</th><td>${text}${f.status_reason ? `<p class="small">${esc(f.status_reason)}</p>` : ""}</td></tr>`);
      }
      parts.push("</table>");
    }
    if ((asset.documents ?? []).length > 0) {
      parts.push("<h3>Documents on the page</h3><ul>");
      for (const d of asset.documents) {
        const href = d.delivery === "hosted" ? `${dirName}/${d.file.file}` : d.url;
        parts.push(`<li>${statusBadge(d.status)} <a href="${esc(href)}">${esc(d.title)}</a> · ${esc(d.document_type)} · ${esc(d.delivery)}</li>`);
      }
      parts.push("</ul>");
    }
    if (asset.showcase) {
      parts.push(`<h3>Showcase story: ${esc(asset.showcase.story)}</h3><p>${esc(asset.showcase.narrative)}</p><p class="small"><strong>What it does not show:</strong> ${esc(asset.showcase.limitation)}</p>`);
    }

    parts.push("<h3>Checklist</h3>");
    parts.push(`<p>Return and outbound template <code>${esc(model.templates?.return ?? "none")}</code>. Accessories: ${esc((model.common_accessories ?? []).join(", "))}.</p>`);
    parts.push(`<p class="small">Full review copy: <code>docs/phase-e/packs/${esc(dirName)}/review.md</code>; storyboard: <code>storyboard.md</code>.</p>`);
    parts.push("</section>");
  }

  parts.push("<section class=\"asset\"><h2>Sources</h2><table><tr><th>Source</th><th>Rights</th><th>Use</th><th>Availability</th></tr>");
  for (const s of register.sources) {
    parts.push(`<tr><td><a href="${esc(s.url)}">${esc(s.title)}</a><br><code>${esc(s.source_id)}</code></td><td>${esc(s.rights.status)}</td><td>${esc(s.rights.redistribution)}</td><td>${esc(s.availability ?? "")}</td></tr>`);
  }
  parts.push("</table></section></main></body></html>\n");
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
