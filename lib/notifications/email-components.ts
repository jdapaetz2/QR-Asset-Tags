/**
 * Engineering Phase D5.1 — reusable email components. Pure, no I/O.
 *
 * Each component returns an `EmailBlock`: the HTML and the plain-text rendering of the same facts, so the builders in
 * `email.ts` assemble both parts from one list and they cannot disagree. HTML-only decoration (the product name, the
 * "Photo evidence" heading, preview captions, issue badges, secondary call/email buttons) carries no fact that the text
 * part lacks. Every value is escaped here; callers pass plain strings.
 */
import type { PreviewFigure } from "@/lib/notifications/email";
import { DIGEST_ISSUE_LABELS, type DigestAssetGroup, type DigestIssueKind, type DigestItem } from "@/lib/notifications/digest";
import { formatPacific } from "@/lib/notifications/digest-window";
import {
  CONTENT_WIDTH,
  EMAIL_TOKENS as T,
  MONO,
  TONES,
  buttonHtml,
  columns,
  escapeHtml,
  escapeLines,
  pillHtml,
  spacer,
  table,
  textStyle,
  type EmailBlock,
  type Tone,
} from "@/lib/notifications/email-html";

const html = (value: string): EmailBlock => ({ html: value, text: "" });

/**
 * The only visible HTML strings without a plain-text counterpart: decoration that repeats or labels a fact the text part
 * already states (plus preview captions, "<label> (N of M)"). Enforced by email-parity.test.ts.
 */
export const HTML_ONLY_LABELS: readonly string[] = [
  "Mulemark",
  "Photo evidence",
  "Call reporter",
  "Email reporter",
  "Current status",
  ...Object.values(DIGEST_ISSUE_LABELS),
];

/** The first visible line — what an inbox shows as the preview. Not hidden. */
export function previewLineBlock(line: string): EmailBlock {
  return { html: `<div style="${textStyle(13, 18, T.muted, "margin:0 0 14px 0")}">${escapeHtml(line)}</div>`, text: line };
}

/** The platform identity as plain body text over a brass rule — never an imitation of the wordmark artwork. */
export function headerBlock(): EmailBlock {
  return html(
    table(
      `<tr><td style="padding:0 0 10px 0;border-bottom:2px solid ${T.brass};${textStyle(14, 18, T.ink, "font-weight:bold")}">Mulemark</td></tr>`
    ) + spacer(16)
  );
}

export function priorityBanner(input: { tone: Tone; label: string; event: string; reason?: string | null }): EmailBlock {
  const palette = TONES[input.tone];
  const reason = input.reason
    ? `<div style="${textStyle(14, 20, T.ink, "padding-top:4px")}">Priority reason: ${escapeHtml(input.reason)}</div>`
    : "";
  return {
    html:
      table(
        `<tr><td bgcolor="${palette.background}" style="background-color:${palette.background};border-left:4px solid ${palette.border};padding:12px 16px">` +
          `<div style="${textStyle(15, 22)}"><strong style="color:${palette.label}">${escapeHtml(input.label)}</strong> — ${escapeHtml(input.event)}</div>` +
          `${reason}</td></tr>`
      ) + spacer(16),
    text: `${input.label} — ${input.event}${input.reason ? `\nPriority reason: ${input.reason}` : ""}`,
  };
}

export function assetIdentity(input: {
  code: string | null;
  name: string | null;
  category: string | null;
  note?: string | null;
}): EmailBlock {
  const identity = [input.code, input.name].filter(Boolean).join(" — ") || "Unidentified asset";
  const code = input.code ? `<span style="font-family:${MONO}">${escapeHtml(input.code)}</span>` : "";
  const name = input.name ? escapeHtml(input.name) : "";
  const identityHtml = code && name ? `${code} — ${name}` : code || name || "Unidentified asset";
  const category = input.category
    ? ` <span style="${textStyle(14, 20, T.muted, "font-weight:normal")}">(${escapeHtml(input.category)})</span>`
    : "";
  const note = input.note ? `<div style="${textStyle(13, 18, T.muted, "padding-top:2px")}">${escapeHtml(input.note)}</div>` : "";
  return {
    html:
      `<div style="${textStyle(17, 24, T.ink, "font-weight:bold")}"><span style="${textStyle(12, 16, T.muted, "font-weight:normal")}">Asset:</span> ` +
      `${identityHtml}${category}</div>${note}${spacer(14)}`,
    text: `Asset: ${input.category ? `${identity} (${input.category})` : identity}${input.note ? `\n${input.note}` : ""}`,
  };
}

export type Fact = { label: string; value: string };

const FACT_CELL = Math.floor(CONTENT_WIDTH / 2);

function factCell(fact: Fact): string {
  return table(
    `<tr><td style="padding:0 12px 12px 0"><div style="${textStyle(12, 16, T.muted)}">${escapeHtml(fact.label)}</div>` +
      `<div style="${textStyle(15, 21, T.ink, "font-weight:bold")}">${escapeLines(fact.value)}</div></td></tr>`
  );
}

/** Label/value pairs: two columns on desktop, one on narrow screens. Notes follow in small muted text. */
export function factGrid(facts: Fact[], notes: string[] = []): EmailBlock {
  const rows: string[] = [];
  for (let i = 0; i < facts.length; i += 2) rows.push(columns(facts.slice(i, i + 2).map(factCell), FACT_CELL));
  const noteHtml = notes
    .map((note) => `<div style="${textStyle(13, 18, T.muted, "padding:0 0 4px 0")}">${escapeLines(note)}</div>`)
    .join("");
  return {
    html: rows.join("") + noteHtml + spacer(12),
    text: [...facts.map((fact) => `${fact.label}: ${fact.value}`), ...notes].join("\n"),
  };
}

/** The submitter's own words, visually separate from the metadata. */
export function descriptionBlock(description: { text: string; truncated: boolean }): EmailBlock {
  const shortened = "Shortened here. The full text is in Mulemark.";
  return {
    html:
      `<div style="${textStyle(13, 18, T.ink, "font-weight:bold;padding-bottom:6px")}">What was reported</div>` +
      table(
        `<tr><td bgcolor="${T.quote}" style="background-color:${T.quote};border-left:3px solid ${T.border};padding:12px 14px;${textStyle(15, 22)}">` +
          `“${escapeLines(description.text)}”</td></tr>`
      ) +
      (description.truncated ? `<div style="${textStyle(13, 18, T.muted, "padding-top:6px")}">${shortened}</div>` : "") +
      spacer(16),
    text: `What was reported\n“${description.text}”${description.truncated ? `\n${shortened}` : ""}`,
  };
}

/** A headed bullet list (return exceptions, routine notes). Multi-line items keep their lines. */
export function listBlock(input: { heading: string; items: string[]; tone: Tone; note?: string | null }): EmailBlock {
  const palette = TONES[input.tone];
  const rows = input.items
    .map(
      (item) =>
        `<tr><td valign="top" width="16" style="${textStyle(15, 22, T.muted)}">•</td><td style="${textStyle(15, 22)}">${escapeLines(item)}</td></tr>`
    )
    .join("");
  const note = input.note ? `<div style="${textStyle(13, 18, T.muted, "padding-top:6px")}">${escapeHtml(input.note)}</div>` : "";
  const text = [
    input.heading,
    ...input.items.map((item) => `- ${item.split("\n").join("\n  ")}`),
    ...(input.note ? [input.note] : []),
  ].join("\n");
  return {
    html:
      table(
        `<tr><td style="border-left:3px solid ${palette.border};padding:2px 0 2px 12px">` +
          `<div style="${textStyle(13, 18, T.ink, "font-weight:bold;padding-bottom:4px")}">${escapeHtml(input.heading)}</div>` +
          table(rows) +
          `${note}</td></tr>`
      ) + spacer(16),
    text,
  };
}

/** A plain sentence, e.g. "No action required. No exceptions reported." */
export function noticeBlock(sentence: string): EmailBlock {
  return { html: `<div style="${textStyle(14, 20, T.muted)}">${escapeHtml(sentence)}</div>${spacer(16)}`, text: sentence };
}

/** Bounded CID previews as a compact strip; the counts stay readable when images are blocked. */
export function evidenceStrip(input: { countLine: string; pointer: string | null; figures: PreviewFigure[] }): EmailBlock {
  const n = input.figures.length;
  const countHtml =
    `<div style="${textStyle(13, 18, T.ink, "font-weight:bold;padding-bottom:4px")}">Photo evidence</div>` +
    `<div style="${textStyle(14, 20, T.muted)}">${escapeHtml(input.countLine)}${input.pointer ? `<br>${escapeHtml(input.pointer)}` : ""}</div>`;
  const text = input.pointer ? `${input.countLine}\n${input.pointer}` : input.countLine;
  if (n === 0) return { html: countHtml + spacer(16), text };

  const cellWidth = n === 1 ? CONTENT_WIDTH : Math.floor(CONTENT_WIDTH / n);
  const maxImage = n === 1 ? 300 : cellWidth - 12;
  const figureHtml = (figure: PreviewFigure, index: number) => {
    const width = Math.max(1, Math.min(maxImage, Math.trunc(figure.width) || maxImage));
    const height =
      figure.width > 0 && figure.height > 0 ? Math.max(1, Math.round((figure.height * width) / figure.width)) : width;
    const alt = `${figure.label} — preview ${index + 1} of ${n}`;
    const caption = `${figure.label} (${index + 1} of ${n})`;
    return table(
      `<tr><td style="padding:0 12px 12px 0">` +
        `<img src="cid:${escapeHtml(figure.contentId)}" width="${width}" height="${height}" alt="${escapeHtml(alt)}" ` +
        `style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none">` +
        `<div style="${textStyle(12, 16, T.muted, "padding-top:4px")}">${escapeHtml(caption)}</div></td></tr>`
    );
  };
  const figures = input.figures.map(figureHtml);
  return {
    html: countHtml + spacer(10) + (n === 1 ? figures[0] : columns(figures, cellWidth)) + spacer(6),
    text,
  };
}

export function primaryButton(input: { label: string; href: string }): EmailBlock {
  return { html: buttonHtml(input) + spacer(20), text: `${input.label}: ${input.href}` };
}

export function contactBlock(contact: {
  name: string | null;
  preferredMethod: string | null;
  phone: string | null;
  phoneHref: string | null;
  email: string | null;
  emailHref: string | null;
}): EmailBlock | null {
  if (!contact.name && !contact.phone && !contact.email) return null;
  const who = `${contact.name ?? "Name not provided"}${contact.preferredMethod ? ` — prefers ${contact.preferredMethod}` : ""}`;
  const lines = [who, ...(contact.phone ? [`Phone: ${contact.phone}`] : []), ...(contact.email ? [`Email: ${contact.email}`] : [])];
  const buttons = [
    ...(contact.phoneHref ? [buttonHtml({ label: "Call reporter", href: contact.phoneHref, variant: "secondary" })] : []),
    ...(contact.emailHref ? [buttonHtml({ label: "Email reporter", href: contact.emailHref, variant: "secondary" })] : []),
  ];
  const buttonRow =
    buttons.length > 0
      ? spacer(8) + table(`<tr>${buttons.map((button) => `<td style="padding:0 8px 0 0">${button}</td>`).join("")}</tr>`, "")
      : "";
  return {
    html:
      `<div style="${textStyle(13, 18, T.ink, "font-weight:bold;padding-bottom:4px")}">Contact</div>` +
      lines.map((line) => `<div style="${textStyle(15, 22)}">${escapeHtml(line)}</div>`).join("") +
      buttonRow +
      spacer(20),
    text: ["Contact", ...lines].join("\n"),
  };
}

/** Reference (or support id) and the reason the recipient is receiving the email. */
export function footerBlock(input: { reference?: { label: string; value: string } | null; reason: string }): EmailBlock {
  const reference = input.reference
    ? `<div>${escapeHtml(input.reference.label)}: <span style="font-family:${MONO}">${escapeHtml(input.reference.value)}</span></div>`
    : "";
  return {
    html: table(
      `<tr><td style="border-top:1px solid ${T.border};padding-top:14px;${textStyle(12, 18, T.muted)}">` +
        `${reference}<div style="${input.reference ? "padding-top:8px;" : ""}">${escapeHtml(input.reason)}</div></td></tr>`
    ),
    text: [input.reference ? `${input.reference.label}: ${input.reference.value}` : null, input.reason]
      .filter((part): part is string => Boolean(part))
      .join("\n\n"),
  };
}

/** A prominent status pill with its own label above it. The status fact itself is stated in the fact grid. */
export function statusPillBlock(label: string, tone: Tone): EmailBlock {
  return html(
    `<div style="${textStyle(12, 16, T.muted)}">Current status</div>` +
      `<div style="padding:4px 0 14px 0">${pillHtml(label, tone, 14)}</div>`
  );
}

export type Counter = { label: string; value: number; detail?: string | null };

export function counterBlock(counters: Counter[], note?: string | null): EmailBlock | null {
  if (counters.length === 0) return null;
  // Three per row on desktop; two per row on a 375 px phone (about 309 px of content) instead of one tall column.
  const cellWidth = 150;
  const cell = (counter: Counter) =>
    table(
      `<tr><td style="padding:0 10px 10px 0">` +
        table(
          `<tr><td bgcolor="${T.canvas}" style="background-color:${T.canvas};border:1px solid ${T.border};border-radius:6px;padding:10px 12px">` +
            `<div style="${textStyle(12, 16, T.muted)}">${escapeHtml(counter.label)}</div>` +
            `<div style="${textStyle(22, 28, T.ink, "font-weight:bold")}">${counter.value}</div>` +
            (counter.detail ? `<div style="${textStyle(12, 16, T.muted)}">${escapeHtml(counter.detail)}</div>` : "") +
            `</td></tr>`
        ) +
        `</td></tr>`
    );
  const rows: string[] = [];
  for (let i = 0; i < counters.length; i += 3) rows.push(columns(counters.slice(i, i + 3).map(cell), cellWidth));
  return {
    html:
      rows.join("") +
      (note ? `<div style="${textStyle(12, 16, T.muted, "padding:0 0 4px 0")}">${escapeHtml(note)}</div>` : "") +
      spacer(10),
    text: [
      ...counters.map((counter) => `${counter.label}: ${counter.value}${counter.detail ? ` ${counter.detail}` : ""}`),
      ...(note ? [note] : []),
    ].join("\n"),
  };
}

export function sectionHeading(title: string, detail: string): EmailBlock {
  return {
    html:
      `<div style="${textStyle(13, 18, T.ink, `font-weight:bold;letter-spacing:0.04em;border-bottom:1px solid ${T.border};padding:8px 0 6px 0`)}">` +
      `${escapeHtml(title.toUpperCase())} <span style="${textStyle(13, 18, T.muted, "font-weight:normal;letter-spacing:0")}">— ${escapeHtml(detail)}</span></div>` +
      spacer(10),
    text: `${title.toUpperCase()} — ${detail}`,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function statusTone(item: DigestItem): Tone {
  if (item.status === "new") return "routine";
  if (item.status === "resolved") return "resolved";
  return "neutral";
}

const KIND_TONE: Record<DigestIssueKind, Tone> = {
  damage: "follow_up",
  not_operating: "follow_up",
  failed_check: "neutral",
  missing_accessory: "neutral",
};

function itemBlock(item: DigestItem, sameSessionAs: string | null): EmailBlock {
  const submitted = `Submitted ${formatPacific(new Date(item.createdAt))} Pacific`;
  const source = `${item.sourceLabel} return`;
  const photos = item.photoCount === 0 ? "none" : String(item.photoCount);
  const badges = item.kinds.map((kind) => pillHtml(DIGEST_ISSUE_LABELS[kind], KIND_TONE[kind])).join(" ");
  const sessionLine = sameSessionAs ? `Same rental session as ${sameSessionAs}` : null;
  return {
    html:
      `<tr><td style="border-top:1px solid ${T.border};padding:10px 0">` +
      `<div style="${textStyle(14, 20)}">${escapeHtml(source)} · ${pillHtml(item.statusLabel, statusTone(item))} · ` +
      `<span style="color:${T.muted}">${escapeHtml(submitted)}</span></div>` +
      (badges ? `<div style="padding:6px 0 2px 0">${badges}</div>` : "") +
      item.exceptions.map((line) => `<div style="${textStyle(14, 20)}">- ${escapeHtml(line)}</div>`).join("") +
      (sessionLine ? `<div style="${textStyle(13, 18, T.muted)}">${escapeHtml(sessionLine)}</div>` : "") +
      `<div style="${textStyle(13, 18, T.muted, "padding-top:4px")}">Reference: <span style="font-family:${MONO}">${escapeHtml(item.reference)}</span>` +
      ` · Photos: ${escapeHtml(photos)}</div>` +
      `<div style="${textStyle(14, 20, T.ink, "padding-top:6px")}"><a href="${escapeHtml(item.recordUrl)}" style="color:${T.ink};font-weight:bold;text-decoration:underline">Open return checklist</a></div>` +
      `</td></tr>`,
    text: [
      `${source} · ${item.statusLabel} · ${submitted}`,
      ...item.exceptions.map((line) => `- ${line}`),
      ...(sessionLine ? [sessionLine] : []),
      `Reference: ${item.reference} · Photos: ${photos}`,
      `Open return checklist: ${item.recordUrl}`,
    ].join("\n"),
  };
}

/** One asset with every summarized return for it; each return keeps its own source, status, reference and link. */
export function digestAssetCard(group: DigestAssetGroup): EmailBlock {
  const identity = [group.assetCode, group.assetName].filter(Boolean).join(" — ") || "Unidentified asset";
  const code = group.assetCode ? `<span style="font-family:${MONO}">${escapeHtml(group.assetCode)}</span>` : "";
  const name = group.assetName ? escapeHtml(group.assetName) : "";
  const identityHtml = code && name ? `${code} — ${name}` : code || name || "Unidentified asset";
  const total = group.items.length + group.hiddenItems;
  const detail = `${plural(total, "return", "returns")} · ${group.openCount} open · ${plural(group.exceptionCount, "exception", "exceptions")}`;
  const items = group.items.map((item) => itemBlock(item, group.sameSession[item.id] ?? null));
  const hidden = group.hiddenItems > 0 ? `${plural(group.hiddenItems, "more return", "more returns")} for this asset are in Submissions.` : null;
  return {
    html:
      table(
        `<tr><td style="border:1px solid ${T.border};border-radius:6px;padding:12px 14px 4px 14px">` +
          `<div style="${textStyle(16, 22, T.ink, "font-weight:bold")}">${identityHtml} <span style="${textStyle(13, 18, T.muted, "font-weight:normal")}">· ${escapeHtml(detail)}</span></div>` +
          spacer(6) +
          table(items.map((item) => item.html).join("")) +
          (hidden ? `<div style="${textStyle(13, 18, T.muted, "padding:0 0 8px 0")}">${escapeHtml(hidden)}</div>` : "") +
          `</td></tr>`
      ) + spacer(12),
    text: [`${identity} · ${detail}`, ...items.map((item) => item.text), ...(hidden ? [hidden] : [])].join("\n\n"),
  };
}
