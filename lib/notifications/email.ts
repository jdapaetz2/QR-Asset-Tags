/**
 * Pure email content builders for notification messages. No I/O and no secrets —
 * just `{ subject, text, html }`. Deliberately plain: a short summary plus a link
 * to the relevant admin page. NEVER include signed/expiring media URLs or any
 * private submission media here.
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

export type SubmissionEmailInput = {
  orgName: string;
  formTypeLabel: string;
  asset: { code: string | null; name: string | null; category: string | null };
  submittedBy: SubmittedBy;
  summary: string;
  adminUrl: string;
};

export function buildSubmissionEmail(input: SubmissionEmailInput): EmailContent {
  const assetLabel =
    [input.asset.code, input.asset.name].filter(Boolean).join(" — ") ||
    "an asset";
  const subject = `New ${input.formTypeLabel.toLowerCase()} — ${assetLabel}`;

  const lines = [
    `${input.orgName} received a new ${input.formTypeLabel.toLowerCase()}.`,
    "",
    `Asset: ${assetLabel}`,
    input.asset.category ? `Category: ${input.asset.category}` : null,
    `Submitted by: ${submitterLine(input.submittedBy)}`,
    "",
    input.summary ? `Summary: ${input.summary}` : null,
    "",
    `View it in your dashboard: ${input.adminUrl}`,
  ].filter((l): l is string => l !== null);

  const text = lines.join("\n");
  const html = `<div>${lines
    .map((l) => (l === "" ? "<br>" : `<p>${escapeHtml(l)}</p>`))
    .join("")}<p><a href="${escapeHtml(input.adminUrl)}">Open submission</a></p></div>`;

  return { subject, text, html };
}

export type TagStatusEmailInput = {
  orgName: string;
  statusLabel: string;
  manageUrl: string;
};

export function buildTagStatusEmail(input: TagStatusEmailInput): EmailContent {
  const subject = `Tag request update — ${input.statusLabel}`;
  const lines = [
    `${input.orgName}: a physical tag request was updated to "${input.statusLabel}".`,
    "",
    `Track your tag requests: ${input.manageUrl}`,
  ];
  const text = lines.join("\n");
  const html = `<div>${lines
    .map((l) => (l === "" ? "<br>" : `<p>${escapeHtml(l)}</p>`))
    .join("")}<p><a href="${escapeHtml(input.manageUrl)}">View tag requests</a></p></div>`;
  return { subject, text, html };
}
