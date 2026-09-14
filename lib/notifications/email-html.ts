/**
 * Engineering Phase D5.1 — email-safe HTML primitives. Pure, no product knowledge, no I/O.
 *
 * Every building block returns BOTH parts from the same input (`EmailBlock`), so the plain-text body can never drift
 * from the HTML one. The HTML is deliberately conservative so it renders the same in Gmail, Outlook (including the
 * Word-based desktop client) and Apple Mail:
 *
 *   - presentation tables for structure (`role="presentation"`), `bgcolor` plus inline `background-color` for fills;
 *   - inline styles only: no `<style>` block, no classes, no flex or grid, no hidden content;
 *   - columns are inline-block cells wrapped in an Outlook-only ghost table, so they sit side by side on desktop and
 *     stack on narrow screens without media queries;
 *   - system fonts only, no remote images, no tracking, no JavaScript;
 *   - colour always accompanies a text label — it never carries meaning on its own.
 */
import type { EmailAttachment, EmailContent } from "@/lib/notifications/email";
import { EMAIL_LOGO } from "@/lib/notifications/email-logo";

/** The brand lockup (lib/notifications/email-logo.ts), attached inline to every email and shown by the header. */
export const LOGO_ATTACHMENT: EmailAttachment = {
  filename: EMAIL_LOGO.filename,
  contentType: EMAIL_LOGO.contentType,
  contentId: EMAIL_LOGO.contentId,
  content: Buffer.from(EMAIL_LOGO.base64, "base64"),
};

export const EMAIL_TOKENS = {
  ink: "#1A1917",
  muted: "#57534B",
  border: "#E4E1DB",
  canvas: "#FAF9F6",
  card: "#FFFFFF",
  quote: "#F6F5F1",
  brass: "#A87B22",
  red: "#B42318",
  redBg: "#FDF0EF",
  amber: "#B07B10",
  amberText: "#854F0B",
  amberBg: "#FAEEDA",
  green: "#3D7A44",
  greenBg: "#EDF5EE",
} as const;

export const FONT = "Arial,Helvetica,sans-serif";
export const MONO = "Consolas,'Courier New',monospace";

/** The content width inside the 600 px card (600 − 2 × 24 padding − 2 × 1 border). */
export const CONTENT_WIDTH = 550;

export type Tone = "immediate" | "follow_up" | "routine" | "record" | "resolved" | "neutral";

export const TONES: Record<Tone, { background: string; border: string; label: string }> = {
  immediate: { background: EMAIL_TOKENS.redBg, border: EMAIL_TOKENS.red, label: EMAIL_TOKENS.red },
  follow_up: { background: EMAIL_TOKENS.amberBg, border: EMAIL_TOKENS.amber, label: EMAIL_TOKENS.amberText },
  routine: { background: EMAIL_TOKENS.canvas, border: EMAIL_TOKENS.muted, label: EMAIL_TOKENS.ink },
  record: { background: EMAIL_TOKENS.card, border: EMAIL_TOKENS.border, label: EMAIL_TOKENS.muted },
  resolved: { background: EMAIL_TOKENS.greenBg, border: EMAIL_TOKENS.green, label: EMAIL_TOKENS.green },
  neutral: { background: EMAIL_TOKENS.canvas, border: EMAIL_TOKENS.border, label: EMAIL_TOKENS.muted },
};

/** Both parts of one piece of an email. An empty `text` marks an HTML-only decoration. */
export type EmailBlock = { html: string; text: string };

export type Inline = { text: string; strong?: boolean; mono?: boolean; href?: string; showHrefInText?: boolean };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text with line breaks as `<br>`. */
export function escapeLines(value: string): string {
  return value.split("\n").map(escapeHtml).join("<br>");
}

/** Inline text style: explicit family, size, line height and colour on every text element (Outlook does not inherit). */
export function textStyle(size: number, lineHeight: number, color: string = EMAIL_TOKENS.ink, extra = ""): string {
  return `font-family:${FONT};font-size:${size}px;line-height:${lineHeight}px;color:${color};${extra}`;
}

export const TABLE_ATTRS = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

export function table(inner: string, attrs = 'width="100%"', style = ""): string {
  return `<table ${TABLE_ATTRS} ${attrs}${style ? ` style="${style}"` : ""}>${inner}</table>`;
}

export function spacer(height: number): string {
  return `<div style="height:${height}px;line-height:${height}px;font-size:0">&nbsp;</div>`;
}

export function inlineHtml(parts: Inline[]): string {
  return parts
    .map((part) => {
      let inner = escapeHtml(part.text);
      if (part.mono) inner = `<span style="font-family:${MONO}">${inner}</span>`;
      if (part.strong) inner = `<strong>${inner}</strong>`;
      return part.href
        ? `<a href="${escapeHtml(part.href)}" style="color:${EMAIL_TOKENS.ink};text-decoration:underline">${inner}</a>`
        : inner;
    })
    .join("");
}

export function inlineText(parts: Inline[]): string {
  return parts.map((part) => (part.href && part.showHrefInText ? `${part.text}: ${part.href}` : part.text)).join("");
}

/**
 * Cells side by side on desktop, stacked on narrow screens: inline-block cells capped at `cellWidth`, plus an
 * Outlook-only ghost table (Outlook ignores inline-block). Each cell's content must set its own font size.
 */
export function columns(cells: string[], cellWidth: number): string {
  if (cells.length === 0) return "";
  const cellDiv = (content: string) =>
    `<div style="display:inline-block;width:100%;max-width:${cellWidth}px;vertical-align:top">${content}</div>`;
  const total = cellWidth * cells.length;
  const parts = [`<!--[if mso]><table ${TABLE_ATTRS} width="${total}"><tr><td width="${cellWidth}" valign="top"><![endif]-->`];
  cells.forEach((cell, index) => {
    if (index > 0) parts.push(`<!--[if mso]></td><td width="${cellWidth}" valign="top"><![endif]-->`);
    parts.push(cellDiv(cell));
  });
  parts.push("<!--[if mso]></td></tr></table><![endif]-->");
  return `<div style="font-size:0;line-height:0">${parts.join("")}</div>`;
}

/** A bulletproof button: the table cell carries the fill (Outlook), the link carries the padding (everyone else). */
export function buttonHtml(input: { label: string; href: string; variant?: "primary" | "secondary" }): string {
  const primary = (input.variant ?? "primary") === "primary";
  const fill = primary ? EMAIL_TOKENS.ink : EMAIL_TOKENS.card;
  const color = primary ? EMAIL_TOKENS.card : EMAIL_TOKENS.ink;
  const padding = primary ? "12px 22px" : "8px 14px";
  const size = primary ? 16 : 14;
  const border = primary ? "" : `border:1px solid ${EMAIL_TOKENS.border};`;
  return (
    `<table ${TABLE_ATTRS} style="display:inline-table"><tr>` +
    `<td align="center" bgcolor="${fill}" style="background-color:${fill};${border}border-radius:6px;mso-padding-alt:${padding}">` +
    `<a href="${escapeHtml(input.href)}" style="display:inline-block;padding:${padding};${textStyle(size, 20, color, "font-weight:bold;text-decoration:none;border-radius:6px")}">` +
    `${escapeHtml(input.label)}</a></td></tr></table>`
  );
}

/** A small rounded label. Outlook desktop drops the padding and radius but keeps the text and fill. */
export function pillHtml(label: string, tone: Tone, size = 12): string {
  const palette = TONES[tone];
  return (
    `<span style="display:inline-block;padding:2px 8px;border:1px solid ${palette.border};border-radius:10px;` +
    `background-color:${palette.background};${textStyle(size, size + 4, palette.label, "font-weight:bold;white-space:nowrap")}">` +
    `${escapeHtml(label)}</span>`
  );
}

/**
 * Wrap the blocks in the document frame: a 600 px white card on a warm-white canvas. Every email carries the logo as
 * its first inline attachment (the header shows it); any preview attachments follow.
 */
export function renderDocument(input: {
  subject: string;
  blocks: (EmailBlock | null | undefined)[];
  attachments?: EmailAttachment[];
}): EmailContent {
  const blocks = input.blocks.filter((block): block is EmailBlock => Boolean(block));
  const text = blocks
    .map((block) => block.text)
    .filter((part) => part.length > 0)
    .join("\n\n");
  const body = blocks.map((block) => block.html).join("");
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(input.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${EMAIL_TOKENS.canvas}">` +
    table(
      `<tr><td align="center" style="padding:16px 8px">` +
        `<!--[if mso]><table ${TABLE_ATTRS} width="600"><tr><td><![endif]-->` +
        `<div style="max-width:600px;margin:0 auto">` +
        table(
          `<tr><td style="padding:24px;${textStyle(15, 22)}">${body}</td></tr>`,
          `width="100%" bgcolor="${EMAIL_TOKENS.card}"`,
          `background-color:${EMAIL_TOKENS.card};border:1px solid ${EMAIL_TOKENS.border};border-radius:8px`
        ) +
        `</div><!--[if mso]></td></tr></table><![endif]-->` +
        `</td></tr>`,
      `width="100%" bgcolor="${EMAIL_TOKENS.canvas}"`,
      `background-color:${EMAIL_TOKENS.canvas}`
    ) +
    `</body></html>`;
  return { subject: input.subject, text, html, attachments: [LOGO_ATTACHMENT, ...(input.attachments ?? [])] };
}
