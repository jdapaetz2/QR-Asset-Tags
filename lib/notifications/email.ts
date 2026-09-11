/**
 * Pure email content builders for notification messages. No I/O and no secrets — just `{ subject, text, html }`, plus
 * (Engineering Phase D4) up to three small inline preview attachments on individual incident emails.
 *
 * Engineering Phase D1: submission emails are rendered from a `NotificationBrief` (lib/notifications/projection.ts),
 * which is projected from the committed record. This module never sees `submission_data_json`.
 *
 * These are TRANSACTIONAL messages and are written to look like it. The rules are deliverability decisions:
 *
 *  - A specific operational subject that leads with the asset code. Priority prefixes ("Immediate attention:",
 *    "Follow up:") are fixed words chosen by deterministic rules — never free text, never "urgent", never "!".
 *  - A real plain-text part carrying the same content as the HTML. The first visible line is the preview; there is
 *    no hidden preheader.
 *  - Restrained HTML: inline font and spacing only, no <style>, no colours carrying meaning, no remote images, no
 *    tracking pixel, no link shortener, no signed media URL, no timestamp. The only images are D4 previews: small
 *    server-generated JPEGs without metadata, embedded by `cid:` reference to their own attachment — never a URL.
 *  - The authenticated Mulemark record link is the first and primary link. Contact links are `tel:` / `mailto:`
 *    only, and only when the saved value survives strict normalization (lib/contact/links.ts). No link changes
 *    workflow state.
 *  - An explicit reason the recipient is receiving the message, plus where to turn it off.
 *
 * NEVER include signed/expiring media URLs, storage paths, original filenames or original photos here. The daily
 * summary never carries images.
 */
import type { NotificationBrief } from "@/lib/notifications/projection";
import type { DigestItem } from "@/lib/notifications/digest";
import { DIGEST_MAX_LOOKBACK_DAYS, formatPacific } from "@/lib/notifications/digest-window";
import { PRIORITY_LABELS, SUBJECT_PREFIXES } from "@/lib/notifications/priority";
import {
  DAMAGE_SEVERITY_LABELS,
  EQUIPMENT_STATE_LABELS,
  ISSUE_TYPE_LABELS,
  LEGACY_URGENCY_LABELS,
  RESPONSE_NEED_LABELS,
} from "@/lib/submissions/triage";

/** A generated inline preview (D4). Generic filename and content id — never the original's name or path. */
export type EmailAttachment = { filename: string; contentType: "image/jpeg"; contentId: string; content: Buffer };

export type EmailContent = { subject: string; text: string; html: string; attachments?: EmailAttachment[] };

/** How one attached preview is shown: its content id, display label and the generated image's dimensions. */
export type PreviewFigure = { contentId: string; label: string; width: number; height: number };

/** The preview set for one incident email. `requested` > 0 means the organization's switch asked for previews. */
export type IncidentPreviews = { requested: number; figures: PreviewFigure[]; attachments: EmailAttachment[] };

export const SUBJECT_MAX_LENGTH = 78;
const MAX_LIST_ITEMS = 10;
/** Display width of an inline preview; the generated image is at most 640 px, so it stays sharp on high-DPI. */
const PREVIEW_DISPLAY_WIDTH = 320;

export const SELECTIONS_NOTE = "These are the submitter's selections, not a verified inspection.";

// ---------------------------------------------------------------------------
// One block model renders both parts, so the text and HTML can never drift apart.
// ---------------------------------------------------------------------------

type Inline = { text: string; strong?: boolean; href?: string; showHrefInText?: boolean };
type Line = Inline[];
type Paragraph = Line[];

/** Inline preview images shown in the HTML part directly after one paragraph. */
type Figures = { after: Paragraph; items: PreviewFigure[] };

const plain = (text: string): Inline => ({ text });
const bold = (text: string): Inline => ({ text, strong: true });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderText(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) =>
      paragraph
        .map((line) =>
          line.map((part) => (part.href && part.showHrefInText ? `${part.text}: ${part.href}` : part.text)).join("")
        )
        .join("\n")
    )
    .join("\n\n");
}

function renderInline(part: Inline): string {
  let inner = escapeHtml(part.text);
  if (part.strong) inner = `<strong>${inner}</strong>`;
  return part.href ? `<a href="${escapeHtml(part.href)}">${inner}</a>` : inner;
}

function figuresHtml(items: PreviewFigure[]): string {
  return items
    .map((figure, index) => {
      const caption = `${figure.label} — preview ${index + 1} of ${items.length}`;
      const width = Math.max(1, Math.min(PREVIEW_DISPLAY_WIDTH, Math.trunc(figure.width) || PREVIEW_DISPLAY_WIDTH));
      const height =
        figure.width > 0 && figure.height > 0 ? Math.max(1, Math.round((figure.height * width) / figure.width)) : width;
      return (
        `<p style="margin:0 0 14px 0"><img src="cid:${escapeHtml(figure.contentId)}" alt="${escapeHtml(caption)}" ` +
        `width="${width}" height="${height}" style="display:block;max-width:100%;height:auto;border:0">` +
        `${escapeHtml(caption)}</p>`
      );
    })
    .join("");
}

function renderHtml(paragraphs: Paragraph[], figures?: Figures): string {
  const body = paragraphs
    .map((paragraph) => {
      const html = `<p style="margin:0 0 14px 0">${paragraph
        .map((line) => line.map(renderInline).join(""))
        .join("<br>")}</p>`;
      return figures && paragraph === figures.after && figures.items.length > 0 ? html + figuresHtml(figures.items) : html;
    })
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">${body}</div>`;
}

function render(subject: string, paragraphs: Paragraph[], figures?: Figures): EmailContent {
  return { subject, text: renderText(paragraphs), html: renderHtml(paragraphs, figures) };
}

function listLines(items: string[]): Line[] {
  const shown = items.slice(0, MAX_LIST_ITEMS).map((item) => [plain(`- ${item}`)]);
  if (items.length > MAX_LIST_ITEMS) shown.push([plain(`- and ${items.length - MAX_LIST_ITEMS} more in Mulemark`)]);
  return shown;
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

function subjectSafe(value: string | null): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/!/g, "").replace(/\s{2,}/g, " ").trim();
}

function subjectAsset(asset: NotificationBrief["asset"]): string {
  return subjectSafe(asset.code) || subjectSafe(asset.name) || "unidentified asset";
}

/** Keep the head (prefix + asset code) intact and trim the tail so a phone notification shows the code. */
function fitSubject(head: string, tail: string): string {
  const full = `${head}${tail}`;
  if (full.length <= SUBJECT_MAX_LENGTH) return full;
  const room = SUBJECT_MAX_LENGTH - head.length - 1;
  if (room < 8) return `${full.slice(0, SUBJECT_MAX_LENGTH - 1).trimEnd()}…`;
  return `${head}${tail.slice(0, room).trimEnd()}…`;
}

export function incidentSubject(brief: NotificationBrief): string {
  const asset = subjectAsset(brief.asset);
  switch (brief.priority) {
    case "immediate":
    case "follow_up":
      return fitSubject(`${SUBJECT_PREFIXES[brief.priority]}${asset} — `, brief.headline);
    case "routine":
      if (brief.event === "damage_report") return fitSubject("New damage report — ", asset);
      if (brief.event === "support_request") return fitSubject("Support request — ", asset);
      return fitSubject(`${brief.eventLabel} — `, `${asset}, review when convenient`);
    case "record":
      return fitSubject(`${brief.eventLabel} — `, `${asset}, no exceptions`);
  }
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function photosPhrase(count: number): string {
  if (count === 0) return "no photos";
  return count === 1 ? "1 photo" : `${count} photos`;
}

function assetText(asset: NotificationBrief["asset"]): string {
  const identity = [asset.code, asset.name].filter(Boolean).join(" — ") || "Unidentified asset";
  return asset.category ? `${identity} (${asset.category})` : identity;
}

function headerParagraph(brief: NotificationBrief): Paragraph {
  const lines: Paragraph = [
    [bold(PRIORITY_LABELS[brief.priority].toUpperCase()), plain(` — ${brief.eventLabel}`)],
    [plain(`Asset: ${assetText(brief.asset)}`)],
  ];
  if (brief.event === "renter_return" && brief.rentalSessionLinked) lines.push([plain("Linked to a rental session.")]);
  return lines;
}

const CTA_LABELS: Record<NotificationBrief["event"], string> = {
  damage_report: "Open damage report",
  support_request: "Open support request",
  renter_return: "Open return checklist",
};

function ctaParagraph(brief: NotificationBrief): Paragraph {
  return [[{ text: CTA_LABELS[brief.event], href: brief.links.record, strong: true, showHrefInText: true }]];
}

function contactWho(contact: NotificationBrief["contact"]): string | null {
  if (!contact.name) return null;
  return contact.preferredMethod ? `${contact.name} (prefers ${contact.preferredMethod})` : contact.name;
}

function contactParagraph(brief: NotificationBrief): Paragraph | null {
  const contact = brief.contact;
  if (!contact.name && !contact.phone && !contact.email) return null;
  const lines: Paragraph = [[bold("Contact")]];
  const preferred = contact.preferredMethod ? ` — prefers ${contact.preferredMethod}` : "";
  lines.push([plain(`${contact.name ?? "Name not provided"}${preferred}`)]);
  if (contact.phone) {
    lines.push([
      plain("Phone: "),
      contact.phoneHref ? { text: contact.phone, href: contact.phoneHref } : plain(contact.phone),
    ]);
  }
  if (contact.email) {
    lines.push([
      plain("Email: "),
      contact.emailHref ? { text: contact.email, href: contact.emailHref } : plain(contact.email),
    ]);
  }
  return lines;
}

function recordParagraph(brief: NotificationBrief): Paragraph {
  const slots =
    brief.photos.slotCounts.length > 0
      ? ` — ${brief.photos.slotCounts.map((slot) => `${slot.label} (${slot.count})`).join(", ")}`
      : "";
  const photos = brief.photos.count === 0 ? "Photos: none" : `Photos: ${brief.photos.count} on the record${slots}`;
  return [[plain(photos)], [plain(`Reference: ${brief.reference}`)]];
}

export const PREVIEW_POINTER = "Open the record in Mulemark for the original photos and full evidence.";

/**
 * D4: how many previews this email carries, stated in BOTH parts so a text-only reader, a client that strips images
 * and a forwarded copy all know the originals live in Mulemark. Absent when previews were not requested.
 */
function previewParagraph(brief: NotificationBrief, previews: IncidentPreviews | null | undefined): Paragraph | null {
  if (!previews || previews.requested <= 0) return null;
  const attached = previews.figures.length;
  if (attached === 0) return [[plain(`Photo previews: none included. ${PREVIEW_POINTER}`)]];
  return [
    [plain(`Photo previews included: ${attached} of ${photosPhrase(brief.photos.count)}, reduced in size.`)],
    [plain(PREVIEW_POINTER)],
  ];
}

const REASON_TOPICS: Record<NotificationBrief["event"], string> = {
  damage_report: "damage reports",
  support_request: "support requests",
  renter_return: "return checklists",
};

function reasonParagraph(orgName: string, topic: string, settingsUrl: string | null): Paragraph {
  const base = `You are receiving this because ${orgName} has email notifications enabled for ${topic}.`;
  return [[plain(settingsUrl ? `${base} Change this under Settings → Notifications: ${settingsUrl}` : base)]];
}

// ---------------------------------------------------------------------------
// Damage reports and support requests
// ---------------------------------------------------------------------------

function reportPreview(brief: NotificationBrief): string {
  const reported = brief.reported;
  const parts: string[] = [];
  if (reported.triageRecorded) {
    // The preview line carries only real answers; "Not sure" appears in the body, not in the phone preview.
    if (reported.issueType && reported.issueType !== "not_sure") parts.push(ISSUE_TYPE_LABELS[reported.issueType]);
    if (reported.equipmentState && reported.equipmentState !== "not_sure") {
      parts.push(EQUIPMENT_STATE_LABELS[reported.equipmentState]);
    }
    if (reported.responseNeed && reported.responseNeed !== "not_sure") {
      parts.push(RESPONSE_NEED_LABELS[reported.responseNeed]);
    }
    if (reported.damageSeverity && reported.damageSeverity !== "not_sure") {
      parts.push(`severity ${DAMAGE_SEVERITY_LABELS[reported.damageSeverity]}`);
    }
  } else if (reported.legacyUrgency) {
    parts.push(`urgency ${LEGACY_URGENCY_LABELS[reported.legacyUrgency]}`);
  }
  const lead = parts.length > 0 ? `Reported: ${parts.join(" · ")}` : brief.eventLabel;
  const segments = [lead, photosPhrase(brief.photos.count)];
  const who = contactWho(brief.contact);
  if (who) segments.push(who);
  return segments.join(" · ");
}

function reportedParagraph(brief: NotificationBrief): Paragraph {
  const reported = brief.reported;
  const damage = brief.event === "damage_report";
  const lines: Paragraph = [];
  if (reported.triageRecorded) {
    if (!damage) {
      lines.push([
        plain(`Reported issue type: ${reported.issueType ? ISSUE_TYPE_LABELS[reported.issueType] : "Not reported"}`),
      ]);
    }
    if (damage) {
      lines.push([
        plain(
          `Reported equipment state: ${
            reported.equipmentState ? EQUIPMENT_STATE_LABELS[reported.equipmentState] : "Not reported"
          }`
        ),
      ]);
    }
    lines.push([
      plain(
        `Reported response need: ${reported.responseNeed ? RESPONSE_NEED_LABELS[reported.responseNeed] : "Not reported"}`
      ),
    ]);
    if (damage && reported.damageSeverity) {
      lines.push([plain(`Reported damage severity: ${DAMAGE_SEVERITY_LABELS[reported.damageSeverity]}`)]);
    }
    lines.push([plain(SELECTIONS_NOTE)]);
    return lines;
  }

  if (damage && reported.legacyUrgency) {
    lines.push([plain(`Reported urgency: ${LEGACY_URGENCY_LABELS[reported.legacyUrgency]}`)]);
    if (reported.legacyUrgency === "medium") {
      lines.push([plain("Medium was the form's default, so it may not reflect a deliberate choice.")]);
    }
  }
  lines.push([
    plain(
      damage
        ? "Equipment state and response need were not asked on this report."
        : "Issue type and response need were not asked on this report."
    ),
  ]);
  if (damage && reported.legacyUrgency) lines.push([plain(SELECTIONS_NOTE)]);
  return lines;
}

function descriptionParagraph(brief: NotificationBrief): Paragraph | null {
  const description = brief.description;
  if (!description) return null;
  const lines: Paragraph = [[bold("What was reported")], [plain(`“${description.text}”`)]];
  if (description.truncated) lines.push([plain("Shortened here. The full text is in Mulemark.")]);
  return lines;
}

function reportParagraphs(brief: NotificationBrief, preview: Paragraph | null): Paragraph[] {
  const paragraphs: (Paragraph | null)[] = [
    [[plain(reportPreview(brief))]],
    headerParagraph(brief),
    descriptionParagraph(brief),
    reportedParagraph(brief),
    ctaParagraph(brief),
    contactParagraph(brief),
    recordParagraph(brief),
    preview,
  ];
  return paragraphs.filter((paragraph): paragraph is Paragraph => paragraph !== null);
}

// ---------------------------------------------------------------------------
// Renter return checklists
// ---------------------------------------------------------------------------

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function returnPreview(brief: NotificationBrief): string {
  const detail = brief.returnDetail;
  const photos = photosPhrase(brief.photos.count);
  if (!detail) return photos;
  if (brief.priority === "follow_up") {
    const parts: string[] = [];
    if (detail.damage) parts.push("damage reported");
    if (detail.failedRequired.length > 0) {
      parts.push(`${detail.failedRequired.length} failed ${detail.failedRequired.length === 1 ? "check" : "checks"}`);
    }
    if (detail.notOperating.length > 0) parts.push("reported not starting or operating");
    if (detail.accessoriesMissing) parts.push("accessories missing");
    return `Exceptions: ${parts.join(", ")} · ${photos}`;
  }
  if (brief.priority === "routine") {
    return `Review when convenient: ${detail.notes.map(lowerFirst).join(", ")} · ${photos}`;
  }
  return `No action required. No exceptions reported · ${photos}`;
}

function exceptionsParagraph(brief: NotificationBrief): Paragraph | null {
  const detail = brief.returnDetail;
  if (!detail || detail.exceptionCount === 0) return null;
  const items: Line[] = [];
  if (detail.damage) {
    const location = detail.damageLocation ? `: ${detail.damageLocation.text}` : "";
    const severity = detail.damageSeverityLabel ? ` (reported damage severity: ${detail.damageSeverityLabel})` : "";
    items.push([plain(`- Damage reported${location}${severity}`)]);
    if (detail.damageDescription) items.push([plain(`  “${detail.damageDescription.text}”`)]);
  }
  items.push(
    ...listLines([
      ...detail.failedRequired.map((label) => `Failed check: ${label}`),
      ...detail.notOperating.map((label) => `${label} No`),
      ...(detail.accessoriesMissing
        ? [
            detail.missingAccessoryLabels.length > 0
              ? `Accessories missing: ${detail.missingAccessoryLabels.join(", ")}`
              : "Accessories missing",
          ]
        : []),
    ])
  );
  return [[bold("Exceptions")], ...items, [plain(SELECTIONS_NOTE)]];
}

function notesParagraph(brief: NotificationBrief): Paragraph | null {
  const detail = brief.returnDetail;
  if (!detail || detail.notes.length === 0) return null;
  return [[bold("Also noted")], ...listLines(detail.notes)];
}

function returnParagraphs(brief: NotificationBrief, preview: Paragraph | null): Paragraph[] {
  const paragraphs: (Paragraph | null)[] = [
    [[plain(returnPreview(brief))]],
    headerParagraph(brief),
    exceptionsParagraph(brief),
    notesParagraph(brief),
    brief.priority === "record" ? [[plain("No action required. No exceptions reported.")]] : null,
    ctaParagraph(brief),
    recordParagraph(brief),
    preview,
    contactParagraph(brief),
  ];
  return paragraphs.filter((paragraph): paragraph is Paragraph => paragraph !== null);
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

/**
 * `previews` is omitted (or `requested: 0`) for a text-only email. When present, the figures are shown after the
 * preview-count paragraph and the attachments ride along; the two are produced together by lib/notifications/previews.ts
 * so every `cid:` reference has its attachment.
 */
export function buildIncidentEmail(brief: NotificationBrief, previews?: IncidentPreviews | null): EmailContent {
  const preview = previewParagraph(brief, previews);
  const body = brief.event === "renter_return" ? returnParagraphs(brief, preview) : reportParagraphs(brief, preview);
  body.push(reasonParagraph(brief.organizationName, REASON_TOPICS[brief.event], brief.links.settings));
  const figures = preview && previews && previews.figures.length > 0 ? { after: preview, items: previews.figures } : undefined;
  const content = render(incidentSubject(brief), body, figures);
  return figures && previews && previews.attachments.length > 0 ? { ...content, attachments: previews.attachments } : content;
}

export type TagStatusEmailInput = {
  orgName: string;
  statusLabel: string;
  /** Canonical tag-request id — the reference the platform owner and the customer share. */
  reference?: string | null;
  /** The tag request's own page. */
  manageUrl: string;
  settingsUrl?: string | null;
};

/**
 * Tag-request status updates are always RECORD ONLY: no status in the existing tag workflow asks the customer to
 * act (Mulemark reviews, produces and ships). Named for the ORGANIZATION rather than the status, so a customer with
 * several requests open sees who it is about first.
 */
export function buildTagStatusEmail(input: TagStatusEmailInput): EmailContent {
  const orgName = subjectSafe(input.orgName) || "Your organization";
  const paragraphs: Paragraph[] = [
    [[plain(`Status: ${input.statusLabel}. No action required.`)]],
    [
      [bold("RECORD ONLY"), plain(" — Tag request")],
      [plain(`Organization: ${orgName}`)],
      [plain(`Status: ${input.statusLabel}`)],
      ...(input.reference ? [[plain(`Reference: ${input.reference}`)]] : []),
    ],
    [[{ text: "View tag request", href: input.manageUrl, strong: true, showHrefInText: true }]],
    reasonParagraph(orgName, "tag request updates", input.settingsUrl ?? null),
  ];
  return render(`Tag request updated — ${orgName}`, paragraphs);
}

// ---------------------------------------------------------------------------
// Daily return-exceptions summary (Engineering Phase D3B)
// ---------------------------------------------------------------------------

/** Items listed in one summary before pointing to Submissions for the rest. */
export const DIGEST_MAX_ITEMS = 25;

export type ReturnDigestEmailInput = {
  orgName: string;
  /** Already ordered (lib/notifications/digest.ts sortDigestItems). */
  items: DigestItem[];
  windowStart: Date;
  windowEnd: Date;
  /** The covered period was shortened to DIGEST_MAX_LOOKBACK_DAYS. */
  clamped: boolean;
  /** More returns existed than one summary scans. */
  scanIncomplete: boolean;
  inboxUrl: string;
  settingsUrl: string;
};

function digestCount(total: number): string {
  return total === 1 ? "1 return with exceptions" : `${total} returns with exceptions`;
}

export function returnDigestSubject(total: number): string {
  return fitSubject("Return exceptions summary - ", digestCount(total));
}

function digestItemParagraph(item: DigestItem): Paragraph {
  const identity = [item.assetCode, item.assetName].filter(Boolean).join(" — ") || "Unidentified asset";
  return [
    [bold(identity), plain(` — ${item.sourceLabel} return · ${item.statusLabel}`)],
    [plain(`Reference: ${item.reference} · Photos: ${item.photoCount === 0 ? "none" : item.photoCount}`)],
    ...item.exceptions.map((line): Line => [plain(`- ${line}`)]),
    [{ text: "Open return checklist", href: item.recordUrl, showHrefInText: true }],
  ];
}

/**
 * One summary per organization per Pacific day. Every return with an exception since the last summary, each with its
 * current status. Counts and text only — no images, no photo previews, no attachments, no storage paths. The covered
 * period is stated in Pacific time because the reader needs to know what "since the last summary" means.
 */
export function buildReturnDigestEmail(input: ReturnDigestEmailInput): EmailContent {
  const orgName = subjectSafe(input.orgName) || "Your organization";
  const total = input.items.length;
  const open = input.items.filter((item) => item.open).length;
  const shown = input.items.slice(0, DIGEST_MAX_ITEMS);
  const since = formatPacific(input.windowStart);

  const header: Paragraph = [
    [bold("DAILY SUMMARY"), plain(" — Return exceptions")],
    [plain(`Organization: ${orgName}`)],
    [plain(`Covers: ${since} to ${formatPacific(input.windowEnd)} (Pacific)`)],
    [plain("Each return is listed with its current status; some may already be handled.")],
  ];
  if (input.clamped) {
    header.push([plain(`Only the last ${DIGEST_MAX_LOOKBACK_DAYS} days are listed; older returns are in Submissions.`)]);
  }
  if (input.scanIncomplete) {
    header.push([plain("More returns were submitted than one summary checks; the complete list is in Submissions.")]);
  }

  const paragraphs: Paragraph[] = [
    [[plain(`${digestCount(total)} since ${since} Pacific; ${open} still open.`)]],
    header,
    [[{ text: "Open return checklists", href: input.inboxUrl, strong: true, showHrefInText: true }]],
    ...shown.map(digestItemParagraph),
  ];
  if (total > shown.length) {
    paragraphs.push([
      [
        plain(`Showing ${shown.length} of ${total}. The other ${total - shown.length} are in Submissions: `),
        { text: input.inboxUrl, href: input.inboxUrl },
      ],
    ]);
  }
  paragraphs.push(reasonParagraph(orgName, "daily return exception summaries", input.settingsUrl));
  return render(returnDigestSubject(total), paragraphs);
}
