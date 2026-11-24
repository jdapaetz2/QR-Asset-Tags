/**
 * Engineering Phase E3 — Word (.docx) versions of the kit documents, from the same blocks as the PDFs, so the editable
 * copy carries the same text and drawings. Letter pages, Arial (present everywhere), the brand palette, drawings as
 * PNG renders with alt text, the wordmark as artwork. No hyperlinks (docx gives them random relationship ids, which
 * would break reproducible output); web and email addresses are plain text.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { ART, artPng, lockupPng } from "./art.mjs";
import { TIER_LABEL } from "./field-mapping.mjs";
import { BRAND, KIT, OFFICE_FONT, PATHS } from "./kit-config.mjs";
import { normalizeOoxml } from "./zip.mjs";

const require = createRequire(import.meta.url);
const D = require("docx");

/** Content width: Letter with 0.75 in side margins = 7 in = 10080 DXA = 672 px. */
const W = 10080;
const PX_PER_DXA = 672 / 10080;
const LINE = { style: D.BorderStyle.SINGLE, size: 4, color: BRAND.iron200 };
const NONE = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };

export function runs(text, opts = {}) {
  return String(text)
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((p) => (p.startsWith("**") && p.endsWith("**") ? new D.TextRun({ text: p.slice(2, -2), bold: true, ...opts }) : new D.TextRun({ text: p, ...opts })));
}

const para = (text, opts = {}, runOpts = {}) => new D.Paragraph({ children: runs(text, runOpts), ...opts });

function cell(children, width, { fill, borders = "bottom", align } = {}) {
  return new D.TableCell({
    width: { size: width, type: D.WidthType.DXA },
    ...(fill ? { shading: { type: D.ShadingType.CLEAR, color: "auto", fill } } : {}),
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: align ?? D.VerticalAlign.TOP,
    borders: borders === "none" ? { top: NONE, bottom: NONE, left: NONE, right: NONE } : { top: NONE, left: NONE, right: NONE, bottom: LINE },
    children,
  });
}

function table(rows, widths) {
  return new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: widths, layout: D.TableLayoutType.FIXED, rows });
}

const splitWidths = (percents) => {
  const widths = percents.map((p) => Math.round((W * p) / 100));
  widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
  return widths;
};

async function image(art, widthPx) {
  const a = ART[art];
  const data = await artPng(art, 2);
  return new D.ImageRun({ type: "png", data, transformation: { width: widthPx, height: Math.round((widthPx * a.height) / a.width) }, altText: { name: art, title: a.title, description: a.desc } });
}

async function blockToDocx(b, ctx) {
  switch (b.t) {
    case "cover": {
      const lockup = await lockupPng(await readFile(PATHS.lockupSvg, "utf8"), 480);
      return [
        new D.Paragraph({ children: [new D.ImageRun({ type: "png", data: lockup, transformation: { width: 226, height: 24 }, altText: { name: "lockup", title: "Mulemark", description: "Mulemark wordmark" } })] }),
        new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: runs(b.title) }),
        new D.Paragraph({ children: runs(b.subtitle, { color: BRAND.iron600, size: 24 }), spacing: { after: 240 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: BRAND.brass, space: 8 } } }),
      ];
    }
    case "h1":
      return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: runs(b.text) })];
    case "h2":
      return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: runs(b.text) })];
    case "p":
      return [para(b.text)];
    case "draft":
      return [para(b.text, { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: BRAND.amberChipBg }, spacing: { before: 60, after: 60 } }, { bold: true, size: 16, color: BRAND.amberChipText })];
    case "callout":
      return [para(b.text, { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: BRAND.amberChipBg }, spacing: { before: 120, after: 160 } }, { bold: true, color: BRAND.amberChipText })];
    case "pagebreak":
      return [new D.Paragraph({ children: [new D.PageBreak()] })];
    case "bullets":
      return b.items.map((i) => new D.Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(i), spacing: { after: 40 } }));
    case "numbered":
      return b.items.map((i) => new D.Paragraph({ numbering: { reference: "numbers", level: 0 }, children: runs(i), spacing: { after: 40 } }));
    case "steps": {
      const widths = splitWidths(b.items.map(() => 100 / b.items.length));
      const cells = [];
      for (const [i, s] of b.items.entries()) {
        cells.push(
          cell(
            [
              new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [await image(s.art, Math.floor(widths[i] * PX_PER_DXA) - 16)] }),
              new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: runs(`${s.n}  ${s.title}`, { bold: true }), spacing: { after: 40 } }),
              new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: runs(s.text, { size: 18 }), spacing: { after: 40 } }),
              new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: runs(s.who.toUpperCase(), { size: 15, color: BRAND.iron600 }) }),
            ],
            widths[i],
            { fill: BRAND.bone, borders: "none" },
          ),
        );
      }
      return [table([new D.TableRow({ children: cells })], widths), new D.Paragraph({ children: [] })];
    }
    case "figure":
      return [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [await image(b.art, b.width)], spacing: { after: 120 } })];
    case "frames": {
      const columns = b.columns ?? b.items.length;
      const widths = splitWidths(Array.from({ length: columns }, () => 100 / columns));
      const rows = [];
      for (let start = 0; start < b.items.length; start += columns) {
        const cells = [];
        for (let i = 0; i < columns; i++) {
          const f = b.items[start + i];
          if (!f) {
            cells.push(cell([new D.Paragraph({ children: [] })], widths[i], { borders: "none" }));
            continue;
          }
          const px = Math.floor(widths[i] * PX_PER_DXA) - (b.small ? 40 : 14);
          cells.push(cell([new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [await image(f.art, px)] }), new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: runs(f.caption, { size: 17 }) })], widths[i], { borders: "none" }));
        }
        rows.push(new D.TableRow({ cantSplit: true, children: cells }));
      }
      return [table(rows, widths), new D.Paragraph({ children: [] })];
    }
    case "folder":
      return b.lines.map(
        ([p, note]) =>
          new D.Paragraph({
            shading: { type: D.ShadingType.CLEAR, color: "auto", fill: BRAND.bone },
            spacing: { after: 0 },
            tabStops: [{ type: D.TabStopType.LEFT, position: 3200 }],
            children: [new D.TextRun({ text: p, font: "Consolas", size: 19 }), ...(note ? [new D.TextRun({ text: `\t${note}`, size: 18, color: BRAND.iron600 })] : [])],
          }),
      ).concat([new D.Paragraph({ children: [] })]);
    case "legend": {
      const widths = [2200, W - 2200];
      const rows = [
        ["start", BRAND.brass, BRAND.white, "Needed to set up your equipment as private drafts."],
        ["golive", BRAND.iron600, BRAND.white, "Needed before your pages go live."],
        ["optional", BRAND.iron200, BRAND.iron, "Helps, but blank is fine."],
      ].map(([tier, fill, color, text]) => new D.TableRow({ children: [cell([new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: runs(TIER_LABEL[tier], { bold: true, size: 16, color }) })], widths[0], { fill, borders: "none", align: D.VerticalAlign.CENTER }), cell([para(text)], widths[1], { borders: "none", align: D.VerticalAlign.CENTER })] }));
      return [table(rows, widths), new D.Paragraph({ children: [] })];
    }
    case "table": {
      const widths = splitWidths(b.widths);
      const rows = [];
      if (b.head) rows.push(new D.TableRow({ tableHeader: true, children: b.head.map((h, i) => cell([para(h, {}, { bold: true })], widths[i], { fill: BRAND.bone })) }));
      for (const r of b.rows) rows.push(new D.TableRow({ children: r.map((c, i) => cell([para(c, {}, !b.head && i === 0 ? { bold: true } : {})], widths[i])) }));
      return [table(rows, widths), new D.Paragraph({ children: [] })];
    }
    case "quote":
      return b.lines.map((l) => para(l, { border: { left: { style: D.BorderStyle.SINGLE, size: 18, color: BRAND.brass, space: 10 } }, shading: { type: D.ShadingType.CLEAR, color: "auto", fill: BRAND.bone }, indent: { left: 200 }, spacing: { after: 80 } }));
    default:
      throw new Error(`Unknown block ${b.t} (${ctx})`);
  }
}

function footer(text) {
  return new D.Footer({
    children: [
      new D.Paragraph({
        tabStops: [{ type: D.TabStopType.RIGHT, position: W }],
        children: [new D.TextRun({ text, size: 15, color: BRAND.iron600 }), new D.TextRun({ text: "\t", size: 15 }), new D.TextRun({ children: [D.PageNumber.CURRENT, " / ", D.PageNumber.TOTAL_PAGES], size: 15, color: BRAND.iron600 })],
      }),
    ],
  });
}

function documentOf(title, footerText, children) {
  return new D.Document({
    creator: "Mulemark",
    lastModifiedBy: "Mulemark",
    title,
    description: `${KIT.name} ${KIT.workbookVersion}`,
    styles: {
      default: {
        document: { run: { font: OFFICE_FONT, size: 21, color: BRAND.iron }, paragraph: { spacing: { after: 100, line: 276 } } },
        title: { run: { font: OFFICE_FONT, size: 44, bold: true, color: BRAND.iron }, paragraph: { spacing: { before: 240, after: 40 }, keepNext: true } },
        heading1: { run: { font: OFFICE_FONT, size: 36, bold: true, color: BRAND.iron }, paragraph: { spacing: { before: 0, after: 160 }, keepNext: true } },
        heading2: { run: { font: OFFICE_FONT, size: 25, bold: true, color: BRAND.iron }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true } },
      },
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: D.LevelFormat.BULLET, text: "•", alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: "%1.", alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1008, right: 1080, bottom: 1080, left: 1080, footer: 500 } } },
        footers: { default: footer(footerText) },
        children,
      },
    ],
  });
}

/** A kit document (GUIDE, SCOPE, APPROVAL_FORM) as reproducible .docx bytes. */
export async function documentDocx(doc) {
  const children = [];
  for (const b of doc.blocks) children.push(...(await blockToDocx(b, doc.id)));
  return normalizeOoxml(await D.Packer.toBuffer(documentOf(doc.title, doc.footer, children)), { date: KIT.fixedDate });
}

function emailBody(email) {
  const out = [];
  for (const part of email.body) {
    if (typeof part === "string") out.push(...part.split("\n").map((l, i, all) => (i < all.length - 1 ? `${l}  ` : l)), "");
    else {
      if (part.lead) out.push(part.lead, "");
      out.push(...part.list.map((l, i) => (part.numbered ? `${i + 1}. ${l}` : `- ${l}`)), "");
    }
  }
  return out;
}

/** Email template as Markdown (the editable source of truth for copy-paste). */
export function emailMarkdown(email) {
  const out = [`# ${email.title}`, "", `**When:** ${email.when}`, "", `**Subject:** ${email.subject}`, "", "---", "", ...emailBody(email)];
  return `${out.join("\n").trim()}\n`;
}

/** A ready-to-send draft: subject and body only (the check tool fills it). */
export function emailDraftMarkdown(email) {
  return `${[`**Subject:** ${email.subject}`, "", ...emailBody(email)].join("\n").trim()}\n`;
}

/** Email template as .docx (same text). */
export async function emailDocx(email) {
  const children = [
    new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: runs(email.title) }),
    para(`**When:** ${email.when}`, {}, { color: BRAND.iron600 }),
    para(`**Subject:** ${email.subject}`, { border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: BRAND.iron200, space: 6 } }, spacing: { after: 200 } }),
  ];
  for (const part of email.body) {
    if (typeof part === "string") for (const line of part.split("\n")) children.push(para(line));
    else {
      if (part.lead) children.push(para(part.lead));
      for (const l of part.list) children.push(new D.Paragraph({ numbering: { reference: part.numbered ? "numbers" : "bullets", level: 0 }, children: runs(l), spacing: { after: 40 } }));
    }
  }
  return normalizeOoxml(await D.Packer.toBuffer(documentOf(email.title, `Mulemark email template · ${email.file}`, children)), { date: KIT.fixedDate });
}
