/**
 * Pure email content builders for notification messages. No I/O and no secrets —
 * just `{ subject, text, html }`.
 *
 * These are TRANSACTIONAL messages and are written to look like it (Phase B4). The rules below are
 * deliverability decisions, not stylistic ones — a transactional message that reads like marketing is
 * the fastest way into a spam folder, and this domain has no sending reputation yet:
 *
 *  - A specific operational subject naming the asset code, never a teaser or an urgency hook.
 *  - A real plain-text part, not an afterthought — a text/plain sibling that matches the HTML is one of
 *    the cheapest positive signals available.
 *  - Restrained HTML: no images, no tracking pixel, no link shortener, no attachment, no signed media
 *    URL. Links are full `https://mulemark.io/...` URLs computed from the environment.
 *  - An explicit reason the recipient is receiving the message, plus where to turn it off.
 *
 * NEVER include signed/expiring media URLs or any private submission media here.
 */

export type EmailContent = { subject: string; text: string; html: string };

type SubmittedBy = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function submitterLine(by: SubmittedBy): string {
  const contact = [by.email, by.phone].filter(Boolean).join(" · ");
  const name = by.name ?? "Anonymous";
  return contact ? `${name} (${contact})` : name;
}

/**
 * Render the shared body shape once: a paragraph per line, a blank line as spacing, then a single
 * plain text link. Escaped throughout. Kept intentionally dull — see the module comment.
 */
function render(lines: (string | null)[], link: { href: string; label: string }): EmailContent {
  const kept = lines.filter((l): l is string => l !== null);
  const text = [...kept, "", `${link.label}: ${link.href}`].join("\n");
  const html = `<div>${kept
    .map((l) => (l === "" ? "<br>" : `<p>${escapeHtml(l)}</p>`))
    .join("")}<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p></div>`;
  return { subject: "", text, html };
}

/**
 * Operational subject per form type. The asset CODE alone — not "code — name" — keeps the subject
 * scannable in a phone notification and matches how the yard refers to the machine.
 */
const SUBMISSION_SUBJECT: Record<string, (asset: string) => string> = {
  damage_report: (asset) => `New damage report — ${asset}`,
  support_request: (asset) => `Support request — ${asset}`,
  return_checklist: (asset) => `Return checklist submitted — ${asset}`,
};

/** Why this event reached this inbox, and where the recipient can change it. */
const SUBMISSION_REASON: Record<string, string> = {
  damage_report: "damage reports",
  support_request: "support requests",
  return_checklist: "return checklists",
};

export type SubmissionEmailInput = {
  orgName: string;
  /** Internal form type — drives the subject and the reason line. */
  formType: string;
  formTypeLabel: string;
  asset: { code: string | null; name: string | null; category: string | null };
  submittedBy: SubmittedBy;
  /** Canonical display reference (SUB-YYYY-XXXXXX) — same as the inbox + renter. */
  reference?: string | null;
  summary: string;
  adminUrl: string;
  /** Settings page where the recipient can turn this off. */
  settingsUrl?: string | null;
};

export function buildSubmissionEmail(input: SubmissionEmailInput): EmailContent {
  const assetLabel =
    [input.asset.code, input.asset.name].filter(Boolean).join(" — ") || "an asset";
  const subjectAsset = input.asset.code ?? input.asset.name ?? "unidentified asset";
  const subject =
    SUBMISSION_SUBJECT[input.formType]?.(subjectAsset) ??
    `New ${input.formTypeLabel.toLowerCase()} — ${subjectAsset}`;

  const reasonTopic = SUBMISSION_REASON[input.formType] ?? input.formTypeLabel.toLowerCase();
  const reason = input.settingsUrl
    ? `You are receiving this because ${input.orgName} has email notifications enabled for ${reasonTopic}. Change this under Settings → Notifications: ${input.settingsUrl}`
    : `You are receiving this because ${input.orgName} has email notifications enabled for ${reasonTopic}.`;

  const body = render(
    [
      `${input.orgName} received a new ${input.formTypeLabel.toLowerCase()}.`,
      "",
      input.reference ? `Reference: ${input.reference}` : null,
      `Asset: ${assetLabel}`,
      input.asset.category ? `Category: ${input.asset.category}` : null,
      `Submitted by: ${submitterLine(input.submittedBy)}`,
      "",
      input.summary ? `Summary: ${input.summary}` : null,
      "",
      reason,
    ],
    { href: input.adminUrl, label: "Open submission" }
  );

  return { ...body, subject };
}

export type TagStatusEmailInput = {
  orgName: string;
  statusLabel: string;
  /** Canonical tag-request id — the reference the platform owner and the customer share. */
  reference?: string | null;
  manageUrl: string;
  settingsUrl?: string | null;
};

export function buildTagStatusEmail(input: TagStatusEmailInput): EmailContent {
  // Named for the ORGANIZATION rather than the status: a customer with several requests open sees who
  // it is about first, and the status is the first line of the body.
  const subject = `Tag request updated — ${input.orgName}`;

  const reason = input.settingsUrl
    ? `You are receiving this because ${input.orgName} has email notifications enabled for tag request updates. Change this under Settings → Notifications: ${input.settingsUrl}`
    : `You are receiving this because ${input.orgName} has email notifications enabled for tag request updates.`;

  const body = render(
    [
      `${input.orgName}: a physical tag request was updated to "${input.statusLabel}".`,
      "",
      input.reference ? `Reference: ${input.reference}` : null,
      "",
      reason,
    ],
    { href: input.manageUrl, label: "View tag requests" }
  );

  return { ...body, subject };
}
