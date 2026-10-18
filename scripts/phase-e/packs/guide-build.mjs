/**
 * Engineering Phase E2A — draw the pictogram panels and sign tiles and build each model's Start-Up Guide PDF.
 *
 *   npm.cmd run phase-e:packs:guides
 *
 * For every pack in docs/phase-e/packs/<model_key>/:
 *   guide/<panel_id>.svg, guide/<sign_id>.svg   editable original artwork (system fonts, no scripts or remote content)
 *   guide/web/<id>.{png,webp}                    2x renders for web use (panels 960 x 720, signs 480 x 480)
 *   guide/<model_key>-start-up-guide.pdf         the Start-Up Guide document (two Letter pages, tagged)
 * and records the files, sizes and SHA-256 in pack.json (panel.files, sign.files and the asset's startup_guide
 * document). Alt text is rebuilt on every run from each panel's frames and each sign's kind and content, so it always
 * describes the drawing.
 *
 * Only panels drawn in pictogram-panels.mjs get files; BLOCKED panels appear in the guide as "manual needed" cards.
 * While any item is not READY the guide carries a "Review draft" badge. Run phase-e:packs:review afterwards to refresh
 * the review copies. Chromium renders the PDF; its dates and IDs are normalised so unchanged content gives the same
 * bytes.
 */
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

import { BUDGETS, composeAlt, isPolicyRef, signAlt } from "../../lib/content-pack.mjs";
import { guideHtml } from "./guide-layout.mjs";
import { svgDocument } from "./pictogram-kit.mjs";
import { PANELS } from "./pictogram-panels.mjs";
import { accessorySvgs, signSvg } from "./pictogram-signs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
const PANEL_BUDGET_BYTES = BUDGETS.panelBytes;
const GUIDE_BUDGET_BYTES = BUDGETS.guideBytes;

const fileRecord = (file, buffer, extra = {}) => ({ file, ...extra, bytes: buffer.length, sha256: hash("sha256", buffer) });

/** Sign keys in schema order, so regenerated packs keep a stable, readable layout. */
const SIGN_KEYS = ["sign_id", "kind", "label", "shows", "derived_from", "source_refs", "alt", "text_alternative", "reviewer_checklist", "files", "status", "status_reason"];

/** Panel SVG with its accessible name (title) and description (the alt text composed from its frames). */
export function panelSvg(panel) {
  const draw = PANELS[panel.panel_id];
  if (!draw) return null;
  return svgDocument({ id: panel.panel_id, title: panel.title, desc: panel.alt ?? panel.caption, body: draw() });
}

/** Plain-language alternative for a sign: its label, then the sourced warning or policy it shows. */
export function signTextAlternative(sign, pack) {
  const model = pack.models[0];
  const items = new Map([...(model.quick_guide ?? []), ...(model.warnings ?? [])].map((i) => [i.step_id, i]));
  const policies = new Map((pack.organization.policies ?? []).map((p) => [p.policy_id, p]));
  const texts = sign.derived_from.map((id) => (isPolicyRef(id) ? policies.get(id)?.text.replace(/\s*\(Fictional demo policy\.\)$/, "") : items.get(id)?.text)).filter(Boolean);
  return `${sign.label}. ${texts.join(" ")}`;
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

async function packDirs() {
  const dirs = [];
  for (const entry of await readdir(PACKS, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(PACKS, entry.name, "pack.json"))) dirs.push(entry.name);
  }
  return dirs.sort();
}

/** Write an SVG and its 2x PNG and WebP renders; returns the three file records. */
async function writeArt(dir, id, svg, width, height) {
  await mkdir(path.join(dir, "guide", "web"), { recursive: true });
  const svgBuffer = Buffer.from(svg, "utf8");
  const png = await sharp(svgBuffer, { density: 144 }).png({ compressionLevel: 9, palette: true }).toBuffer();
  const webp = await sharp(svgBuffer, { density: 144 }).webp({ lossless: true }).toBuffer();
  await writeFile(path.join(dir, "guide", `${id}.svg`), svgBuffer);
  await writeFile(path.join(dir, "guide", "web", `${id}.png`), png);
  await writeFile(path.join(dir, "guide", "web", `${id}.webp`), webp);
  const files = [
    fileRecord(`guide/${id}.svg`, svgBuffer, { width, height }),
    fileRecord(`guide/web/${id}.png`, png, { width: width * 2, height: height * 2 }),
    fileRecord(`guide/web/${id}.webp`, webp, { width: width * 2, height: height * 2 }),
  ];
  for (const f of files) if (f.bytes > PANEL_BUDGET_BYTES) throw new Error(`${f.file} is ${f.bytes} bytes; the budget is ${PANEL_BUDGET_BYTES}.`);
  return files;
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

      const panelSvgs = new Map();
      for (const panel of model.pictograms ?? []) {
        panel.text_alternative = `${panel.title}. ${panel.caption}`;
        if (panel.frames) panel.alt = composeAlt(panel.frames);
        const svg = panelSvg(panel);
        if (!svg) {
          delete panel.files;
          continue;
        }
        if (panel.status === "BLOCKED") throw new Error(`${panel.panel_id} is BLOCKED but has artwork; resolve the storyboard first.`);
        if (!panel.frames) throw new Error(`${panel.panel_id} has artwork but no frames; record what it shows first.`);
        panel.files = await writeArt(dir, panel.panel_id, svg, 480, 360);
        panelSvgs.set(panel.panel_id, svg);
      }

      const signSvgs = new Map();
      for (const sign of model.signs ?? []) {
        sign.alt = signAlt(sign);
        sign.text_alternative = signTextAlternative(sign, pack);
        const svg = signSvg(sign);
        if (!svg) {
          delete sign.files;
          continue;
        }
        if (sign.status === "BLOCKED") throw new Error(`${sign.sign_id} is BLOCKED but has artwork.`);
        sign.files = await writeArt(dir, sign.sign_id, svg, 240, 240);
        signSvgs.set(sign.sign_id, svg);
      }
      if (model.signs) model.signs = model.signs.map((s) => Object.fromEntries(SIGN_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));

      const documents = (asset.documents ?? []).filter((d) => d.document_type !== "startup_guide");
      if (panelSvgs.size > 0) {
        const countPages = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        const render = async (compact) => {
          const page = await browser.newPage();
          await page.setContent(guideHtml(pack, { panelSvgs, signSvgs, accessorySvgs: accessorySvgs(model), compact }), { waitUntil: "load" });
          const out = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true, tagged: true });
          await page.close();
          return out;
        };
        let raw = await render(false);
        if (countPages(raw) > 2) raw = await render(true);
        const pdf = normalizePdf(raw, model.model_key);
        const pdfName = `guide/${model.model_key}-start-up-guide.pdf`;
        if (pdf.length > GUIDE_BUDGET_BYTES) throw new Error(`${pdfName} is ${pdf.length} bytes; the budget is ${GUIDE_BUDGET_BYTES}.`);
        const pages = countPages(pdf);
        if (pages > 2) throw new Error(`${pdfName} runs to ${pages} pages even in the compact layout; drop a sign row or shrink the panels.`);
        await writeFile(path.join(dir, pdfName), pdf);
        const draft = [...(model.pictograms ?? []), ...(model.signs ?? [])].some((item) => item.status !== "READY");
        documents.unshift({
          title: `${model.manufacturer} ${model.model} Start-Up Guide`,
          document_type: "startup_guide",
          delivery: "hosted",
          visibility: "public",
          file: fileRecord(pdfName, pdf, { pages }),
          status: draft ? "REVIEW_REQUIRED" : "READY",
          ...(draft ? { status_reason: "Carries the review-draft badge until every panel and sign is approved." } : {}),
        });
        console.log(`${asset.asset_code}: ${panelSvgs.size} panels, ${signSvgs.size} signs; ${pdfName} ${pdf.length} bytes, ${pages} pages`);
      } else {
        console.log(`${asset.asset_code}: ${signSvgs.size} signs, no drawable panels; no Start-Up Guide`);
      }
      asset.documents = documents;
      await writeFile(file, `${JSON.stringify(pack, null, 2)}\n`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
