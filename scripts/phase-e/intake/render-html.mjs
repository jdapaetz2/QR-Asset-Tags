/**
 * Engineering Phase E3 — HTML for the kit's PDFs (printed by Chromium in build.mjs). Letter pages, the brand palette
 * (iron, bone, one brass accent), the guides' system font stack, drawings inline as SVG, the wordmark as its SVG
 * artwork. No scripts, no remote content.
 */
import { readFileSync } from "node:fs";

import { artSvg, ART } from "./art.mjs";
import { TIER_LABEL } from "./field-mapping.mjs";
import { PATHS, PDF_FONT_STACK } from "./kit-config.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

const CSS = `
@page { size: Letter; margin: 0.55in 0.65in 0.7in; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ${PDF_FONT_STACK}; color: #1A1917; font-size: 10.5pt; line-height: 1.4; background: #FFFFFF; }
.cover { border-bottom: 2px solid #A87B22; padding-bottom: 12px; margin-bottom: 14px; }
.cover .lockup svg { height: 24px; width: auto; display: block; }
.cover .title { font-size: 22pt; font-weight: 700; margin: 14px 0 2px; letter-spacing: -0.01em; }
.cover .subtitle { color: #57534B; font-size: 12pt; }
h1 { font-size: 18pt; margin: 0 0 10px; }
h2 { font-size: 12.5pt; margin: 14px 0 6px; }
p { margin: 6px 0 8px; }
ul, ol { margin: 4px 0 8px 20px; padding: 0; }
li { margin: 2px 0; }
.steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 8px 0 12px; }
.step { border: 1px solid #E4E1DB; border-radius: 10px; padding: 8px 8px 10px; background: #FAF9F6; text-align: center; }
.step svg { width: 100%; height: auto; display: block; }
.step .title { font-weight: 700; margin-top: 4px; }
.step .n { display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #1A1917; color: #FFFFFF; font-size: 9pt; line-height: 18px; margin-right: 4px; }
.step .text { font-size: 9pt; margin-top: 3px; }
.step .who { font-size: 7.5pt; color: #57534B; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
figure { margin: 6px 0 10px; text-align: center; }
figure svg { height: auto; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 10px; }
th, td { border-bottom: 1px solid #E4E1DB; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #FAF9F6; }
td.lead { font-weight: 700; white-space: nowrap; }
.legend { display: grid; grid-template-columns: 130px 1fr; gap: 5px 10px; margin: 8px 0 10px; align-items: center; }
.chip { font-size: 8pt; font-weight: 700; text-align: center; padding: 3px 6px; border-radius: 4px; letter-spacing: 0.04em; }
.chip.start { background: #A87B22; color: #FFFFFF; }
.chip.golive { background: #57534B; color: #FFFFFF; }
.chip.optional { background: #E4E1DB; color: #1A1917; }
.frames { display: grid; gap: 10px 12px; margin: 8px 0 10px; }
.frame { text-align: center; font-size: 9pt; }
.frame svg { width: 100%; height: auto; border: 1px solid #E4E1DB; border-radius: 8px; display: block; margin-bottom: 4px; }
.frames.small .frame svg { border: none; }
.folder { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; background: #FAF9F6; border: 1px solid #E4E1DB; border-radius: 8px; padding: 8px 12px; margin: 6px 0 10px; }
.folder .row { display: grid; grid-template-columns: 210px 1fr; }
.folder .row span:first-child { white-space: pre; }
.folder .note { font-family: ${PDF_FONT_STACK}; color: #57534B; font-size: 9pt; }
.draft { display: inline-block; font-size: 7.5pt; font-weight: 700; color: #854F0B; background: #FAEEDA; border-radius: 4px; padding: 2px 6px; margin: 2px 0; letter-spacing: 0.04em; }
.callout { background: #FAEEDA; color: #854F0B; font-weight: 700; padding: 8px 12px; border-radius: 6px; margin: 8px 0 10px; }
.quote { border-left: 3px solid #A87B22; padding: 4px 12px; background: #FAF9F6; margin: 8px 0; }
.quote p { margin: 5px 0; }
.pb { break-before: page; height: 0; }
.icons { display: grid; gap: 8px 18px; margin: 4px 0 8px; }
.icon { display: flex; align-items: center; gap: 10px; font-size: 9.5pt; }
.icon svg { width: 72px; height: auto; flex: none; }
body.compact { font-size: 10pt; line-height: 1.32; }
body.compact .cover { padding-bottom: 8px; margin-bottom: 10px; }
body.compact .cover .title { font-size: 19pt; margin: 8px 0 0; }
body.compact .cover .subtitle { font-size: 11pt; }
body.compact h2 { font-size: 11.5pt; margin: 10px 0 4px; }
body.compact p { margin: 3px 0 5px; }
body.compact ul { margin: 2px 0 4px 18px; }
body.compact .steps { margin: 4px 0 6px; gap: 6px; }
body.compact .step { padding: 6px 6px 7px; }
body.compact .step svg { height: 90px; width: auto; margin: 0 auto; }
body.compact .frames { margin: 4px 0 6px; gap: 6px 10px; }
body.compact .frames.small .frame svg { width: 76px; margin: 0 auto 2px; }
`;

function block(b, lockupSvg) {
  switch (b.t) {
    case "cover":
      return `<header class="cover"><div class="lockup">${lockupSvg}</div><div class="title">${esc(b.title)}</div><div class="subtitle">${esc(b.subtitle)}</div></header>`;
    case "h1":
      return `<h1>${esc(b.text)}</h1>`;
    case "h2":
      return `<h2>${esc(b.text)}</h2>`;
    case "p":
      return `<p>${inline(b.text)}</p>`;
    case "draft":
      return `<div class="draft">${esc(b.text)}</div>`;
    case "callout":
      return `<div class="callout">${inline(b.text)}</div>`;
    case "pagebreak":
      return `<div class="pb"></div>`;
    case "bullets":
      return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
    case "steps":
      return `<div class="steps">${b.items
        .map((s) => `<div class="step">${artSvg(s.art)}<div class="title"><span class="n">${s.n}</span>${esc(s.title)}</div><div class="text">${esc(s.text)}</div><div class="who">${esc(s.who)}</div></div>`)
        .join("")}</div>`;
    case "figure":
      return `<figure>${artSvg(b.art).replace("<svg ", `<svg style="width:${b.width}px" `)}</figure>`;
    case "frames":
      return `<div class="frames${b.small ? " small" : ""}" style="grid-template-columns:repeat(${b.columns ?? b.items.length},1fr)">${b.items.map((f) => `<div class="frame">${artSvg(f.art)}${esc(f.caption)}</div>`).join("")}</div>`;
    case "icons":
      return `<div class="icons" style="grid-template-columns:repeat(${b.columns ?? b.items.length},1fr)">${b.items.map((f) => `<div class="icon">${artSvg(f.art)}<span>${inline(f.caption)}</span></div>`).join("")}</div>`;
    case "folder":
      return `<div class="folder">${b.lines.map(([p, note]) => `<div class="row"><span>${esc(p)}</span><span class="note">${esc(note)}</span></div>`).join("")}</div>`;
    case "legend":
      return `<div class="legend">${[
        ["start", "Needed to set up your equipment as private drafts."],
        ["golive", "Needed before your pages go live."],
        ["optional", "Helps, but blank is fine."],
      ]
        .map(([tier, text]) => `<div class="chip ${tier}">${TIER_LABEL[tier]}</div><div>${esc(text)}</div>`)
        .join("")}</div>`;
    case "table": {
      const head = b.head ? `<tr>${b.head.map((h, i) => `<th style="width:${b.widths[i]}%">${esc(h)}</th>`).join("")}</tr>` : "";
      const rows = b.rows.map((r) => `<tr>${r.map((c, i) => `<td${!b.head && i === 0 ? ' class="lead"' : ""} style="width:${b.widths[i]}%">${inline(c)}</td>`).join("")}</tr>`).join("");
      return `<table>${head}${rows}</table>`;
    }
    case "quote":
      return `<div class="quote">${b.lines.map((l) => `<p>${inline(l)}</p>`).join("")}</div>`;
    default:
      throw new Error(`Unknown block ${b.t}`);
  }
}

/** A complete HTML document for one kit document (WHAT_TO_EXPECT, SCOPE). */
export function documentHtml(doc) {
  const lockup = readFileSync(PATHS.lockupSvg, "utf8").replace(/<\?xml[^>]*>/, "").trim();
  for (const b of doc.blocks) for (const item of [b, ...(b.items ?? [])]) if (item.art && !ART[item.art]) throw new Error(`Unknown drawing ${item.art}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${CSS}</style></head><body${doc.compact ? ' class="compact"' : ""}>${doc.blocks.map((b) => block(b, lockup)).join("\n")}</body></html>`;
}

/** Chromium footer: the document's name and page numbers. */
export function footerTemplate(doc) {
  return `<div style="width:100%;font-family:${esc(PDF_FONT_STACK)};font-size:7.5pt;color:#57534B;padding:0 0.65in;display:flex;justify-content:space-between"><span>${esc(doc.footer)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}
