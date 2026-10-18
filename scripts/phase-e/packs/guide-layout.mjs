/**
 * Engineering Phase E2A — the picture-first Start-Up Guide layout: two Letter pages, built as HTML for Chromium.
 *
 *   page 1: header with the review-draft badge, panels 1-4, then the safety signs
 *   page 2: panels 5-8, the accessories to bring back, a one-line source footer
 *
 * Titles only under the art; no captions. A BLOCKED panel shows a "manual needed" card in its slot. Pure (no file or
 * browser access) so the tests can count the guide's visible words without rendering it. Elements marked
 * data-required (the draft badge, the source footer) are notices rather than instructions and are not counted.
 */
import { C, book, esc } from "./pictogram-kit.mjs";

const CONTENT_WIDTH_IN = 8.5 - 2 * 0.45;

/** Sign band geometry: up to 6 a row; two rows shrink so the band still fits under four panels on page 1. */
export function signBand(count, { compact = false } = {}) {
  const perRow = count <= 6 ? Math.max(count, 1) : Math.ceil(count / 2);
  const rows = Math.ceil(count / perRow);
  const gap = 0.12;
  const fit = (CONTENT_WIDTH_IN - (perRow - 1) * gap) / perRow;
  const cap = rows > 1 ? (compact ? 1.05 : 1.16) : 1.45;
  return { perRow, rows, tileIn: Math.round(Math.min(fit, cap) * 100) / 100, gapIn: gap };
}

const manualCard = `<div class="art gap"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${book(32, 32, 1, C.steel)}</svg><p>Manual needed</p></div>`;

/**
 * pack: a content pack; panelSvgs and signSvgs: Map id -> complete SVG; accessorySvgs: Map accessory name -> SVG.
 * Returns the guide's HTML.
 */
export function guideHtml(pack, { panelSvgs, signSvgs, accessorySvgs = new Map(), compact = false }) {
  const model = pack.models[0];
  const asset = pack.assets[0];
  const sourcesById = new Map(pack.sources.map((s) => [s.source_id, s]));
  const panels = model.pictograms ?? [];
  const signs = (model.signs ?? []).filter((s) => signSvgs.has(s.sign_id));
  const draft = [...panels, ...signs].some((item) => item.status !== "READY");

  // Drawn panels carry their number in the art; a "manual needed" card gets it under the card instead.
  const panelCell = (panel, i) => {
    const svg = panelSvgs.get(panel.panel_id);
    if (svg) return `<figure class="cell"><div class="art">${svg}</div><figcaption>${esc(panel.title)}</figcaption></figure>`;
    return `<figure class="cell">${manualCard}<figcaption><span class="n">${i + 1}</span>${esc(panel.title)}</figcaption></figure>`;
  };
  const grid = (list, offset) => `<section class="grid">${list.map((p, i) => panelCell(p, i + offset)).join("")}</section>`;

  const band = signBand(signs.length, { compact });
  const signsHtml = signs.length
    ? `<section class="signs" style="grid-template-columns: repeat(${band.perRow}, ${band.tileIn}in); gap: 0.08in ${band.gapIn}in;">${signs
        .map((s) => `<figure class="sign">${signSvgs.get(s.sign_id)}<figcaption>${esc(s.label)}</figcaption></figure>`)
        .join("")}</section>`
    : "";

  const accessories = (model.accessory_icons ?? []).filter((a) => accessorySvgs.has(a.name));
  const returnIcon = `<svg viewBox="0 0 48 48" width="40" height="40" role="img" aria-label="Bring these back"><path d="M14 18 H32 A10 10 0 0 1 32 38 H18" fill="none" stroke="${C.action}" stroke-width="5" stroke-linecap="round"/><polygon points="6,18 16,9 16,27" fill="${C.action}"/></svg>`;
  const accessoriesHtml = accessories.length
    ? `<section class="accessories">${returnIcon}${accessories.map((a) => `<figure class="acc">${accessorySvgs.get(a.name)}<figcaption>${esc(a.name)}</figcaption></figure>`).join("")}</section>`
    : "";

  // Credit only the documents behind what is actually drawn.
  const drawnRefs = [...panels.filter((p) => panelSvgs.has(p.panel_id)), ...signs].flatMap((item) => item.source_refs.map((r) => r.source_id));
  const sourceTitles = [...new Set(drawnRefs)].map((id) => sourcesById.get(id)).filter(Boolean).map((s) => esc(s.title));
  const manual = sourcesById.get(model.manual.source_id);
  const footer = `<footer data-required>From: ${sourceTitles.join("; ")}. Does not replace ${esc(manual?.title ?? "the manufacturer's manual")}${manual?.availability === "to-purchase" ? " (sold by the manufacturer)" : ""}. Original artwork: Mulemark.</footer>`;

  const header = `<header>
    <div><p class="eyebrow">Start-Up Guide</p><h1>${esc(model.manufacturer)} ${esc(model.model)}</h1>
    <p class="sub">${esc(asset.asset_code)} · ${esc(pack.organization.name)}${pack.organization.fictional ? " (demo)" : ""}</p></div>
    ${draft ? `<div class="draft" data-required>Review draft<br><span>Not yet approved for use</span></div>` : ""}
  </header>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(model.manufacturer)} ${esc(model.model)} Start-Up Guide</title><style>
    @page { size: Letter; margin: 0.4in 0.45in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: ${C.ink}; font-size: 11pt; line-height: 1.25; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${C.ink}; padding-bottom: 6px; margin-bottom: 10px; }
    .eyebrow { margin: 0; font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.dark}; font-weight: 600; }
    h1 { margin: 1px 0 0; font-size: 20pt; }
    .sub { margin: 1px 0 0; color: ${C.dark}; font-size: 9.5pt; }
    .draft { border: 2px solid #8A5A00; color: #8A5A00; background: #FFF8EA; padding: 5px 10px; font-weight: 700; text-align: center; border-radius: 6px; font-size: 11pt; }
    .draft span { font-weight: 400; font-size: 9pt; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
    .cell { margin: 0; break-inside: avoid; }
    .art { border: 1px solid ${C.body2}; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3; }
    .art svg { display: block; width: 100%; height: auto; }
    .gap { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; background: #F6F4EF; color: ${C.dark}; font-weight: 600; border-style: dashed; }
    .art.gap svg { width: 0.8in; height: 0.8in; }
    .gap p { margin: 0; }
    figcaption { margin-top: 4px; font-weight: 700; font-size: 12pt; display: flex; align-items: center; gap: 6px; }
    .n { display: inline-block; min-width: 1.45em; height: 1.45em; line-height: 1.45em; border-radius: 50%; background: ${C.ink}; color: #fff; text-align: center; font-size: 9.5pt; }
    .signs { display: grid; justify-content: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid ${C.body2}; }
    .sign { margin: 0; text-align: center; break-inside: avoid; }
    .sign svg { display: block; width: 100%; height: auto; }
    .sign figcaption { justify-content: center; font-size: 9.5pt; margin-top: 2px; }
    .page2 { break-before: page; }
    .accessories { display: flex; align-items: center; gap: 18px; margin-top: 12px; padding-top: 8px; border-top: 1px solid ${C.body2}; }
    .acc { margin: 0; display: flex; flex-direction: column; align-items: center; }
    .acc svg { width: 0.6in; height: 0.6in; }
    .acc figcaption { font-size: 9pt; margin-top: 2px; }
    footer { margin-top: 10px; font-size: 7.5pt; color: ${C.dark}; border-top: 1px solid ${C.body2}; padding-top: 5px; }
    /* Compact fallback when the full layout runs past two pages: slightly smaller panels. */
    body.compact .grid { gap: 6px 14px; }
    body.compact .art { width: 92%; margin: 0 auto; }
  </style></head><body class="${compact ? "compact" : ""}">
    ${header}
    ${grid(panels.slice(0, 4), 0)}
    ${signsHtml}
    <div class="page2">
      ${grid(panels.slice(4, 8), 4)}
      ${accessoriesHtml}
      ${footer}
    </div>
  </body></html>`;
}
