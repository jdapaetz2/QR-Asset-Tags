# Email Allowlist Guide — Mulemark

**This is a fallback, not the deliverability strategy.** Mulemark's mail is authenticated
(SPF + DKIM + DMARC on a dedicated sending subdomain) and written as plain transactional mail, which is
what actually keeps it out of junk folders. Allowlisting is what you do for the one mailbox that filters
it anyway — usually a strict Microsoft 365 tenant, or a brand-new sending domain that a filter has no
history for. Reach for it after the mail is confirmed *delivered*, never as a substitute for fixing a
genuine authentication problem.

Send this page to a customer whose notifications are landing in junk.

---

## What Mulemark sends from

| | |
|---|---|
| **Sender address** | `notifications@notify.mulemark.io` |
| **Display name** | Mulemark |
| **Sending domain** | `notify.mulemark.io` |
| **Reply-To** | `support@mulemark.io` — a monitored human mailbox |

Replies go to `support@mulemark.io`, not to the sending address. Mulemark never sends marketing or bulk
mail from `notify.mulemark.io`; it carries transactional notifications only — a damage report, a support
request, a return checklist, or a tag-request update.

---

## Outlook / Outlook.com / Hotmail (personal mailbox)

1. Open the message in the **Junk Email** folder.
2. Choose **Not junk** (or **Report → Not junk**). Outlook moves it to the Inbox and asks whether to
   trust future messages from the sender — say yes.
3. Add the sender explicitly: **Settings → Mail → Junk email → Safe senders and domains → Add**, then
   enter **`notify.mulemark.io`**. Adding the domain, not just the one address, covers every
   notification type.
4. Optionally add `notifications@notify.mulemark.io` to **Contacts** — Outlook treats known contacts
   more favourably.

Do this once. It applies to that mailbox only.

## Microsoft 365 / Exchange Online (work mailbox)

The steps above still work for the individual user, but a tenant with strict anti-spam policies can
override a user's safe-sender list. **If notifications keep going to junk or quarantine after a user
marks them "Not junk", your email administrator has to allow the sender at the tenant level** — the user
cannot fix it alone.

For that administrator, in the Microsoft 365 Defender portal:

- **Email & collaboration → Policies & rules → Threat policies → Anti-spam** → the inbound policy →
  **Allowed senders and domains** → add `notify.mulemark.io`.
- Check **Quarantine** for held Mulemark messages and release them; releasing teaches the filter.
- Prefer the anti-spam allow list over a mail-flow (transport) rule — a blanket "skip filtering" rule is
  broader than needed and is discouraged by Microsoft.

## Gmail / Google Workspace

Gmail rarely needs this. If it is required:

1. Open the message → **⋮ → Filter messages like these** → **Create filter** → tick **Never send it to
   Spam**.
2. Or add `notifications@notify.mulemark.io` to Contacts.
3. Workspace administrators can add `notify.mulemark.io` to the domain allowlist under
   **Apps → Google Workspace → Gmail → Spam, phishing and malware**.

## Other providers

The pattern is the same everywhere: mark the message as *not spam* first (that is the signal the filter
actually learns from), then add `notify.mulemark.io` to whatever the provider calls its safe-sender,
allowed-sender, or trusted-domain list.

---

## If allowlisting does not fix it

Stop and treat it as a deliverability incident rather than adding more allowlist entries — see
[`EMAIL_DELIVERABILITY_RUNBOOK.md`](EMAIL_DELIVERABILITY_RUNBOOK.md). In particular, check the message
headers for `spf=pass`, `dkim=pass`, `dmarc=pass`; if any of those fails, the DNS is the problem and no
amount of mailbox configuration will hold.

**Notifications are best-effort by design.** Every submission is recorded in the dashboard whether or not
its email arrives, so a filtered notification is never lost work — the admin still sees it in the inbox.
