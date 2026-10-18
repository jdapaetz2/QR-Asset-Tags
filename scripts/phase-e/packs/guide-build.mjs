/**
 * Engineering Phase E2A — draw the pictogram panels and build each model's Start-Up Guide PDF.
 *
 *   npm.cmd run phase-e:packs:guides
 *
 * For every pack in docs/phase-e/packs/<model_key>/:
 *   guide/<panel_id>.svg            editable original artwork (system fonts, no scripts or remote content)
 *   guide/web/<panel_id>.{png,webp} 960 x 720 renders for web use
 *   guide/<model_key>-start-up-guide.pdf   the Start-Up Guide document (two Letter pages)
 * and records the files, sizes and SHA-256 in pack.json (panel.files and the asset's startup_guide document).
 *
 * Only panels drawn in pictogram-panels.mjs get files; BLOCKED panels appear in the guide as labelled gaps. While any
 * item is not READY the guide carries a "Review draft" banner. Run phase-e:packs:review afterwards to refresh the
 * review copies. Chromium renders the PDF; its dates and IDs are normalised so unchanged content gives the same bytes.
 */
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { BUDGETS } from "../../lib/content-pack.mjs";
import { esc, svgDocument } from "./pictogram-kit.mjs";
import { PANELS } from "./pictogram-panels.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
const PANEL_BUDGET_BYTES = BUDGETS.panelBytes;
const GUIDE_BUDGET_BYTES = BUDGETS.guideBytes;

const fileRecord = (file, buffer, extra = {}) => ({ file, ...extra, bytes: buffer.length, sha256: hash("sha256", buffer) });

/** Panel SVG with its accessible name (title) and description (the drafted alt text). */
export function panelSvg(panel) {
  const draw = PANELS[panel.panel_id];
  if (!draw) return null;
  return svgDocument({ id: panel.panel_id, title: panel.title, desc: panel.alt ?? panel.caption, body: draw() });
}

/**
 * Make a Chromium PDF reproducible: same-length rewrites of the creation and modification dates, XMP timestamps and
 * document IDs, so byte offsets (and the xref table) stay valid.
 */
export function normalizePdf(buffer, seed) {
  let text = buffer.toString("latin1");
  const hex = (n) => hash("sha256", `${seed}:${n}`).repeat(4).slice(0, n);
  text = text.replace(/\/(CreationDate|ModDate)\s*\(D:(\d{14})/g, (m, key, digits) => m.replace(digits, "20260101000000"));
  text = text.replace(/<(xmp:CreateDate|xmp:ModifyDate|xmp:MetadataDate)>(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/g, (m, tag, stamp) => m.replace(stamp, "2026-01-01T00:00:00"));
  text = text.replace(/uuid:[0-9a-fA-F-]{36}/g, (m) => `uuid:${hex(32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5")}`.slice(0, m.length));
  text = text.replace(/\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\]/g, (m, a, b) => m.replace(a, hex(a.length).toUpperCase()).replace(b, hex(b.length).toUpperCase()));
  return Buffer.from(text, "latin1");
}

function guideHtml(pack, svgs, { compact = false } = {}) {
  const model = pack.models[0];
  const asset = pack.assets[0];
  const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
  const manual = sourcesById.get(model.manual.source_id);
  const panels = model.pictograms ?? [];
  const draft = panels.some((p) => p.status !== "READY");
  const cell = (panel, i) => {
    const svg = svgs.get(panel.panel_id);
    const waitingOnManual = panel.source_refs.some((r) => sourcesById.get(r.source_id)?.availability === "to-purchase");
    const reason = waitingOnManual ? "Waiting on the manufacturer's manual." : (panel.status_reason ?? "Waiting on a source.");
    const art = svg
      ? `<div class="art">${svg}</div>`
      : `<div class="art gap"><p><strong>Not drawn yet</strong></p><p>${esc(reason)}</p></div>`;
    return `<figure class="cell">${art}<figcaption><span class="n">${i + 1}</span> <strong>${esc(panel.title)}</strong><br>${esc(panel.caption)}</figcaption></figure>`;
  };
  const pageOf = (list, offset) => `<section class="grid">${list.map((p, i) => cell(p, i + offset)).join("")}</section>`;
  const never = (model.warnings ?? []).map((w) => `<li>${esc(w.text)}</li>`).join("");
  // Credit only the documents behind panels that are actually drawn.
  const sourcePages = [...new Set(panels.filter((p) => svgs.has(p.panel_id)).flatMap((p) => p.source_refs.map((r) => r.source_id)))]
    .map((id) => sourcesById.get(id))
    .filter(Boolean)
    .map((s) => esc(s.title))
    .join("; ");
  const header = `<header>
    <div><p class="eyebrow">Start-Up Guide</p><h1>${esc(model.manufacturer)} ${esc(model.model)} ${esc(model.category.toLowerCase())}</h1>
    <p class="sub">${esc(asset.asset_name)} · ${esc(asset.asset_code)} · ${esc(pack.organization.name)}${pack.organization.fictional ? " (demo)" : ""}</p></div>
    ${draft ? `<div class="draft">Review draft<br><span>Not yet approved for use</span></div>` : ""}
  </header>`;
  const footer = `<footer>
    <p><strong>Full manual:</strong> ${esc(manual?.publisher ?? model.manufacturer)}, ${esc(manual?.title ?? "")}${manual?.url ? ` (${esc(manual.url)})` : ""}${manual?.availability === "to-purchase" ? ", sold by the manufacturer" : ""}.</p>
    <p>This guide shows key steps from the manufacturer's documents (${sourcePages}). It does not replace them. Original artwork by Mulemark. Questions: use Request Support on the equipment page.</p>
  </footer>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(model.manufacturer)} ${esc(model.model)} Start-Up Guide</title><style>
    @page { size: Letter; margin: 0.45in 0.5in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #1F1D1A; font-size: 10.5pt; line-height: 1.35; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1F1D1A; padding-bottom: 8px; margin-bottom: 12px; }
    .eyebrow { margin: 0; font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: #4A463F; font-weight: 600; }
    h1 { margin: 2px 0 0; font-size: 18pt; }
    .sub { margin: 2px 0 0; color: #4A463F; }
    .draft { border: 2px solid #8A5A00; color: #8A5A00; background: #FFF8EA; padding: 6px 10px; font-weight: 700; text-align: center; border-radius: 6px; font-size: 11pt; }
    .draft span { font-weight: 400; font-size: 9pt; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
    .cell { margin: 0; break-inside: avoid; }
    .art { border: 1px solid #D8D2C5; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3; }
    .art svg { display: block; width: 100%; height: auto; }
    .gap { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 16px; background: #F6F4EF; color: #4A463F; }
    .gap p { margin: 2px 0; }
    figcaption { margin-top: 6px; }
    .n { display: inline-block; min-width: 1.5em; height: 1.5em; line-height: 1.5em; border-radius: 50%; background: #1F1D1A; color: #fff; text-align: center; font-weight: 700; font-size: 9pt; }
    .page2 { break-before: page; }
    .never { border: 2px solid #C62828; border-radius: 8px; padding: 8px 12px 8px 12px; margin-top: 14px; }
    .never h2 { margin: 0 0 4px; font-size: 11pt; color: #C62828; text-transform: uppercase; letter-spacing: 0.05em; }
    .never ul { margin: 0; padding-left: 18px; }
    footer { margin-top: 12px; font-size: 8.5pt; color: #4A463F; border-top: 1px solid #D8D2C5; padding-top: 6px; }
    footer p { margin: 2px 0; }
    /* Compact fallback when the full layout runs past two pages: slightly smaller art and text. */
    body.compact { font-size: 9.8pt; }
    body.compact .grid { gap: 8px 16px; }
    body.compact .art { width: 90%; margin: 0 auto; }
    body.compact figcaption { margin-top: 4px; }
    body.compact .never { margin-top: 10px; padding: 6px 10px; }
  </style></head><body class="${compact ? "compact" : ""}">
    ${header}
    ${pageOf(panels.slice(0, 4), 0)}
    <div class="page2">
      ${pageOf(panels.slice(4, 8), 4)}
      ${never ? `<section class="never"><h2>Never</h2><ul>${never}</ul></section>` : ""}
      ${footer}
    </div>
  </body></html>`;
}

async function packDirs() {
  const dirs = [];
  for (const entry of await readdir(PACKS, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(PACKS, entry.name, "pack.json"))) dirs.push(entry.name);
  }
  return dirs.sort();
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const dirName of await packDirs()) {
      const dir = path.join(PACKS, dirName);
      const file = path.join(dir, "pack.json");
      const pack = JSON.parse(await readFile(file, "utf8"));
      const model = pack.models[0];
      const asset = pack.assets[0];
      const svgs = new Map();
      let drawn = 0;
      for (const panel of model.pictograms ?? []) {
        const svg = panelSvg(panel);
        panel.text_alternative = `${panel.title}. ${panel.caption}`;
        if (!svg) {
          delete panel.files;
          continue;
        }
        if (panel.status === "BLOCKED") throw new Error(`${panel.panel_id} is BLOCKED but has artwork; resolve the storyboard first.`);
        await mkdir(path.join(dir, "guide", "web"), { recursive: true });
        const svgBuffer = Buffer.from(svg, "utf8");
        const png = await sharp(svgBuffer, { density: 144 }).png({ compressionLevel: 9, palette: true }).toBuffer();
        const webp = await sharp(svgBuffer, { density: 144 }).webp({ lossless: true }).toBuffer();
        await writeFile(path.join(dir, "guide", `${panel.panel_id}.svg`), svgBuffer);
        await writeFile(path.join(dir, "guide", "web", `${panel.panel_id}.png`), png);
        await writeFile(path.join(dir, "guide", "web", `${panel.panel_id}.webp`), webp);
        panel.files = [
          fileRecord(`guide/${panel.panel_id}.svg`, svgBuffer, { width: 480, height: 360 }),
          fileRecord(`guide/web/${panel.panel_id}.png`, png, { width: 960, height: 720 }),
          fileRecord(`guide/web/${panel.panel_id}.webp`, webp, { width: 960, height: 720 }),
        ];
        for (const f of panel.files) {
          if (f.bytes > PANEL_BUDGET_BYTES) throw new Error(`${f.file} is ${f.bytes} bytes; the panel budget is ${PANEL_BUDGET_BYTES}.`);
        }
        svgs.set(panel.panel_id, svg);
        drawn++;
      }

      const documents = (asset.documents ?? []).filter((d) => d.document_type !== "startup_guide");
      if (drawn > 0) {
        const countPages = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        const render = async (compact) => {
          const page = await browser.newPage();
          await page.setContent(guideHtml(pack, svgs, { compact }), { waitUntil: "load" });
          const out = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
          await page.close();
          return out;
        };
        let raw = await render(false);
        if (countPages(raw) > 2) raw = await render(true);
        const pdf = normalizePdf(raw, model.model_key);
        const pdfName = `guide/${model.model_key}-start-up-guide.pdf`;
        if (pdf.length > GUIDE_BUDGET_BYTES) throw new Error(`${pdfName} is ${pdf.length} bytes; the budget is ${GUIDE_BUDGET_BYTES}.`);
        const pages = countPages(pdf);
        if (pages > 2) throw new Error(`${pdfName} runs to ${pages} pages even in the compact layout; shorten its captions or warnings.`);
        await writeFile(path.join(dir, pdfName), pdf);
        const draft = (model.pictograms ?? []).some((p) => p.status !== "READY");
        documents.unshift({
          title: `${model.manufacturer} ${model.model} Start-Up Guide`,
          document_type: "startup_guide",
          delivery: "hosted",
          visibility: "public",
          file: fileRecord(pdfName, pdf, { pages }),
          status: draft ? "REVIEW_REQUIRED" : "READY",
          ...(draft ? { status_reason: "Carries the review-draft banner until every panel is approved." } : {}),
        });
        console.log(`${asset.asset_code}: ${drawn} panels drawn; ${pdfName} ${pdf.length} bytes, ${pages} pages`);
      } else {
        console.log(`${asset.asset_code}: no drawable panels; no Start-Up Guide`);
      }
      asset.documents = documents;
      await writeFile(file, `${JSON.stringify(pack, null, 2)}\n`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
