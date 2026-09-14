/**
 * Pure email content builders for notification messages. No I/O and no secrets — just `{ subject, text, html }`, plus
 * (Engineering Phase D4) up to three small inline preview attachments on individual incident emails.
 *
 * Engineering Phase D1: submission emails are rendered from a `NotificationBrief` (lib/notifications/projection.ts),
 * which is projected from the committed record. This module never sees `submission_data_json`.
 *
 * Engineering Phase D5.1: a clear visual hierarchy built from shared components (lib/notifications/email-components.ts,
 * email-html.ts). Every component renders the HTML and the plain-text part from the same input. The rules that are
 * deliverability decisions are unchanged:
 *
 *  - Subjects lead with the asset code; priority prefixes ("Immediate attention:", "Follow up:") are fixed words chosen
 *    by deterministic rules — never free text, never "urgent", never "!". Subjects and first lines are unchanged by D5.1.
 *  - A real plain-text part carries the same facts as the HTML. The first visible line is the inbox preview; there is
 *    no hidden preheader.
 *  - The authenticated Mulemark record link is the first link and the primary button. Contact actions are `tel:` /
 *    `mailto:` only, and only when the saved value survives strict normalization (lib/contact/links.ts). No link changes
 *    workflow state.
 *  - No remote image, tracking pixel, link shortener, signed media URL or storage path. The only images are D4 previews,
 *    embedded by `cid:` reference to their own attachment. The daily summary never carries images.
 *  - An explicit reason the recipient is receiving the message, plus where to turn it off.
 */
import type { NotificationBrief } from "@/lib/notifications/projection";
import {
  DIGEST_SECTION_TITLES,
  digestCounters,
  groupDigestItems,
  limitDigestSections,
  type DigestItem,
} from "@/lib/notifications/digest";
import { DIGEST_MAX_LOOKBACK_DAYS, formatPacific } from "@/lib/notifications/digest-window";
import {
  assetIdentity,
  contactBlock,
  counterBlock,
  descriptionBlock,
  digestAssetCard,
  evidenceStrip,
  factGrid,
  footerBlock,
  headerBlock,
  listBlock,
  noticeBlock,
  previewLineBlock,
  primaryButton,
  priorityBanner,
  sectionHeading,
  statusPillBlock,
  type Counter,
  type Fact,
} from "@/lib/notifications/email-components";
import { renderDocument, type EmailBlock, type Tone } from "@/lib/notifications/email-html";
import { PRIORITY_LABELS, SUBJECT_PREFIXES, shouldShowPriorityReason } from "@/lib/notifications/priority";
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

export const SELECTIONS_NOTE = "These are the submitter's selections, not a verified inspection.";

export const PREVIEW_POINTER = "Open the record in Mulemark for the original photos and full evidence.";

// ---------------------------------------------------------------------------
// Subjects (unchanged by D5.1)
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
// First visible lines (unchanged by D5.1)
// ---------------------------------------------------------------------------

function photosPhrase(count: number): string {
  if (count === 0) return "no photos";
  return count === 1 ? "1 photo" : `${count} photos`;
}

function contactWho(contact: NotificationBrief["contact"]): string | null {
  if (!contact.name) return null;
  return contact.preferredMethod ? `${contact.name} (prefers ${contact.preferredMethod})` : contact.name;
}

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

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const CTA_LABELS: Record<NotificationBrief["event"], string> = {
  damage_report: "Open damage report",
  support_request: "Open support request",
  renter_return: "Open return checklist",
};

const REASON_TOPICS: Record<NotificationBrief["event"], string> = {
  damage_report: "damage reports",
  support_request: "support requests",
  renter_return: "return checklists",
};

function reasonText(orgName: string, topic: string, settingsUrl: string | null | undefined): string {
  const base = `You are receiving this because ${orgName} has email notifications enabled for ${topic}.`;
  return settingsUrl ? `${base} Change this under Settings → Notifications: ${settingsUrl}` : base;
}

function capList(items: string[]): string[] {
  if (items.length <= MAX_LIST_ITEMS) return items;
  return [...items.slice(0, MAX_LIST_ITEMS), `and ${items.length - MAX_LIST_ITEMS} more in Mulemark`];
}

function photosFact(brief: NotificationBrief): Fact {
  if (brief.photos.count === 0) return { label: "Photos", value: "none" };
  const slots =
    brief.photos.slotCounts.length > 0
      ? ` — ${brief.photos.slotCounts.map((slot) => `${slot.label} (${slot.count})`).join(", ")}`
      : "";
  return { label: "Photos", value: `${brief.photos.count} on the record${slots}` };
}

// ---------------------------------------------------------------------------
// Damage reports and support requests
// ---------------------------------------------------------------------------

function reportFacts(brief: NotificationBrief): { facts: Fact[]; notes: string[] } {
  const reported = brief.reported;
  const damage = brief.event === "damage_report";
  const facts: Fact[] = [{ label: "Notification priority", value: PRIORITY_LABELS[brief.priority] }];
  const notes: string[] = [];
  if (reported.triageRecorded) {
    if (!damage) {
      facts.push({
        label: "Reported issue type",
        value: reported.issueType ? ISSUE_TYPE_LABELS[reported.issueType] : "Not reported",
      });
    } else {
      facts.push({
        label: "Reported equipment state",
        value: reported.equipmentState ? EQUIPMENT_STATE_LABELS[reported.equipmentState] : "Not reported",
      });
    }
    facts.push({
      label: "Reported response need",
      value: reported.responseNeed ? RESPONSE_NEED_LABELS[reported.responseNeed] : "Not reported",
    });
    if (damage && reported.damageSeverity) {
      facts.push({ label: "Reported damage severity", value: DAMAGE_SEVERITY_LABELS[reported.damageSeverity] });
    }
    notes.push(SELECTIONS_NOTE);
  } else {
    if (damage && reported.legacyUrgency) {
      facts.push({ label: "Reported urgency", value: LEGACY_URGENCY_LABELS[reported.legacyUrgency] });
      if (reported.legacyUrgency === "medium") {
        notes.push("Medium was the form's default, so it may not reflect a deliberate choice.");
      }
    }
    notes.push(
      damage
        ? "Equipment state and response need were not asked on this report."
        : "Issue type and response need were not asked on this report."
    );
    if (damage && reported.legacyUrgency) notes.push(SELECTIONS_NOTE);
  }
  facts.push(photosFact(brief));
  return { facts, notes };
}

// ---------------------------------------------------------------------------
// Renter return checklists
// ---------------------------------------------------------------------------

function returnIssueBlocks(brief: NotificationBrief): EmailBlock[] {
  const detail = brief.returnDetail;
  const blocks: EmailBlock[] = [];
  if (detail && detail.exceptionCount > 0) {
    const items: string[] = [];
    if (detail.damage) {
      const location = detail.damageLocation ? `: ${detail.damageLocation.text}` : "";
      const severity = detail.damageSeverityLabel ? ` (reported damage severity: ${detail.damageSeverityLabel})` : "";
      const description = detail.damageDescription ? `\n“${detail.damageDescription.text}”` : "";
      items.push(`Damage reported${location}${severity}${description}`);
    }
    items.push(
      ...capList([
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
    blocks.push(listBlock({ heading: "Exceptions", items, tone: "follow_up", note: SELECTIONS_NOTE }));
  }
  if (detail && detail.notes.length > 0) {
    blocks.push(listBlock({ heading: "Also noted", items: capList(detail.notes), tone: "neutral" }));
  }
  if (brief.priority === "record") blocks.push(noticeBlock("No action required. No exceptions reported."));
  return blocks;
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

/**
 * `previews` is omitted (or `requested: 0`) for a text-only email. When present, the evidence strip shows the preview
 * count line and the figures, and the attachments ride along; the two are produced together by
 * lib/notifications/previews.ts so every `cid:` reference has its attachment.
 */
export function buildIncidentEmail(brief: NotificationBrief, previews?: IncidentPreviews | null): EmailContent {
  const isReturn = brief.event === "renter_return";
  const reason = shouldShowPriorityReason({
    priority: brief.priority,
    basis: brief.priorityBasis,
    reason: brief.priorityReason,
  })
    ? brief.priorityReason
    : null;
  const { facts, notes } = isReturn
    ? { facts: [{ label: "Notification priority", value: PRIORITY_LABELS[brief.priority] }, photosFact(brief)], notes: [] }
    : reportFacts(brief);

  let evidence: EmailBlock | null = null;
  let attachments: EmailAttachment[] | undefined;
  if (previews && previews.requested > 0) {
    const attached = previews.figures.length;
    evidence =
      attached === 0
        ? evidenceStrip({ countLine: `Photo previews: none included. ${PREVIEW_POINTER}`, pointer: null, figures: [] })
        : evidenceStrip({
            countLine: `Photo previews included: ${attached} of ${photosPhrase(brief.photos.count)}, reduced in size.`,
            pointer: PREVIEW_POINTER,
            figures: previews.figures,
          });
    if (attached > 0 && previews.attachments.length > 0) attachments = previews.attachments;
  }

  return renderDocument({
    subject: incidentSubject(brief),
    blocks: [
      previewLineBlock(isReturn ? returnPreview(brief) : reportPreview(brief)),
      headerBlock(),
      priorityBanner({
        tone: brief.priority as Tone,
        label: PRIORITY_LABELS[brief.priority].toUpperCase(),
        event: brief.eventLabel,
        reason,
      }),
      assetIdentity({
        ...brief.asset,
        note: isReturn && brief.rentalSessionLinked ? "Linked to a rental session." : null,
      }),
      factGrid(facts, notes),
      ...(isReturn ? returnIssueBlocks(brief) : [brief.description ? descriptionBlock(brief.description) : null]),
      evidence,
      primaryButton({ label: CTA_LABELS[brief.event], href: brief.links.record }),
      contactBlock(brief.contact),
      footerBlock({
        reference: { label: "Reference", value: brief.reference },
        reason: reasonText(brief.organizationName, REASON_TOPICS[brief.event], brief.links.settings),
      }),
    ],
    attachments,
  });
}

/** What a tag-request status email can show about the request. Free-text notes are never rendered. */
export type TagRequestCard = {
  requestedAt: string | null;
  assetCount: number | null;
  material: string | null;
  tagSize: string | null;
  mountingMethod: string | null;
};

export type TagStatusEmailInput = {
  orgName: string;
  statusLabel: string;
  /** The stored status value, for the pill colour only. */
  status?: string | null;
  /** Canonical tag-request id — shown only as a support id. */
  reference?: string | null;
  /** The tag request's own page. */
  manageUrl: string;
  settingsUrl?: string | null;
  request?: TagRequestCard | null;
};

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Tag-request status updates are always RECORD ONLY: no status in the existing tag workflow asks the customer to
 * act (Mulemark reviews, produces and ships). Named for the ORGANIZATION rather than the status, so a customer with
 * several requests open sees who it is about first.
 */
export function buildTagStatusEmail(input: TagStatusEmailInput): EmailContent {
  const orgName = subjectSafe(input.orgName) || "Your organization";
  const request = input.request ?? null;
  const facts: Fact[] = [
    { label: "Organization", value: orgName },
    { label: "Status", value: input.statusLabel },
  ];
  const requested = isoDate(request?.requestedAt);
  if (requested) facts.push({ label: "Requested", value: requested });
  if (typeof request?.assetCount === "number") facts.push({ label: "Assets", value: String(request.assetCount) });
  if (request?.material) facts.push({ label: "Material", value: request.material });
  if (request?.tagSize) facts.push({ label: "Tag size", value: request.tagSize });
  if (request?.mountingMethod) facts.push({ label: "Mounting", value: request.mountingMethod });
  facts.push({ label: "Customer action", value: "None required" });

  return renderDocument({
    subject: `Tag request updated — ${orgName}`,
    blocks: [
      previewLineBlock(`Status: ${input.statusLabel}. No action required.`),
      headerBlock(),
      priorityBanner({ tone: "record", label: "RECORD ONLY", event: "Tag request" }),
      statusPillBlock(input.statusLabel, input.status === "delivered" ? "resolved" : "neutral"),
      factGrid(facts),
      primaryButton({ label: "View tag request", href: input.manageUrl }),
      footerBlock({
        reference: input.reference ? { label: "Support ID", value: input.reference } : null,
        reason: reasonText(orgName, "tag request updates", input.settingsUrl ?? null),
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Daily return-exceptions summary (Engineering Phase D3B; layout D5.1)
// ---------------------------------------------------------------------------

/** Return rows displayed in one summary before pointing to Submissions for the rest. */
export const DIGEST_MAX_ITEMS = 15;
/** Asset cards displayed in one summary. */
export const DIGEST_MAX_ASSET_GROUPS = 10;

export type ReturnDigestEmailInput = {
  orgName: string;
  /** Already ordered (lib/notifications/digest.ts sortDigestItems); the layout regroups them for display. */
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One summary per organization per Pacific day. Every return with an exception since the last summary, each with its
 * current status, grouped by asset under its most serious open issue. Counts and text only — no images, no previews,
 * no attachments, no storage paths.
 */
export function buildReturnDigestEmail(input: ReturnDigestEmailInput): EmailContent {
  const orgName = subjectSafe(input.orgName) || "Your organization";
  const total = input.items.length;
  const counters = digestCounters(input.items);
  const since = formatPacific(input.windowStart);

  const notes = ["Each return is listed with its current status; some may already be handled."];
  if (input.clamped) {
    notes.push(`Only the last ${DIGEST_MAX_LOOKBACK_DAYS} days are listed; older returns are in Submissions.`);
  }
  if (input.scanIncomplete) {
    notes.push("More returns were submitted than one summary checks; the complete list is in Submissions.");
  }

  const statusCounters: Counter[] = [
    { label: "Returns with exceptions", value: counters.total },
    { label: "Still open", value: counters.open, detail: `(${counters.newCount} new, ${counters.reviewed} reviewed)` },
    { label: "Resolved or archived", value: counters.handled },
  ];
  const classCounters: Counter[] = [
    { label: DIGEST_SECTION_TITLES.damage_or_not_operating, value: counters.damageOrNotOperating },
    { label: DIGEST_SECTION_TITLES.failed_checks, value: counters.failedChecks },
    { label: DIGEST_SECTION_TITLES.missing_accessories, value: counters.missingAccessories },
  ].filter((counter) => counter.value > 0);

  const sections = groupDigestItems(input.items);
  const limited = limitDigestSections(sections, { maxRows: DIGEST_MAX_ITEMS, maxGroups: DIGEST_MAX_ASSET_GROUPS });
  const fullCounts = new Map(sections.map((section) => [section.key, section]));
  const viewAll = { label: "View open return checklists", href: input.inboxUrl };

  const sectionBlocks = limited.sections.flatMap((section) => {
    const full = fullCounts.get(section.key) ?? section;
    return [
      sectionHeading(
        section.title,
        `${plural(full.groups.length, "asset", "assets")} · ${plural(full.itemCount, "return", "returns")}`
      ),
      ...section.groups.map(digestAssetCard),
    ];
  });

  return renderDocument({
    subject: returnDigestSubject(total),
    blocks: [
      previewLineBlock(`${digestCount(total)} since ${since} Pacific; ${counters.open} still open.`),
      headerBlock(),
      priorityBanner({ tone: "neutral", label: "DAILY SUMMARY", event: "Return exceptions" }),
      factGrid(
        [
          { label: "Organization", value: orgName },
          { label: "Covers", value: `${since} to ${formatPacific(input.windowEnd)} (Pacific)` },
        ],
        notes
      ),
      counterBlock(statusCounters),
      counterBlock(classCounters, "Each return is counted once, under its most serious issue."),
      primaryButton(viewAll),
      ...sectionBlocks,
      limited.shownRows < limited.totalRows
        ? noticeBlock(
            `Showing ${limited.shownRows} of ${limited.totalRows} returns from ${limited.shownGroups} of ` +
              `${plural(limited.totalGroups, "asset", "assets")}. The rest are in Submissions: ${input.inboxUrl}`
          )
        : null,
      primaryButton(viewAll),
      footerBlock({ reason: reasonText(orgName, "daily return exception summaries", input.settingsUrl) }),
    ],
  });
}
