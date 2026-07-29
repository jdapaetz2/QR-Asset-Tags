# Email Deliverability Runbook — Mulemark (Phase A5)

**Live email delivery has NOT been tested.** Mulemark has no production domain and no verified Resend
sending domain yet. Notifications run in **dry-run** until an operator completes
[`EMAIL_CONFIGURATION_CHECKLIST.md`](EMAIL_CONFIGURATION_CHECKLIST.md). This runbook separates what works
now from what is deferred.

## Available now — dry-run QA

With `RESEND_API_KEY` and/or `NOTIFICATION_FROM_EMAIL` unset (dev, preview, and current production),
the notifier:

- **sends nothing** and makes **no network request**;
- logs one structured `[notifications]` line per event with `"outcome":"dry_run"`;
- **never blocks** a form/submission/status update — email is always best-effort.

You can QA the full path (a public submission triggers a notification attempt) without any secret. Read
the logs to confirm the intended recipient domain, the event, and the outcome.

### Outcome glossary (the `outcome` field)

| Outcome | Meaning | Stream |
|---|---|---|
| `sent` | Live provider accepted the message (2xx); `providerId` captured. | info |
| `dry_run` | No provider configured — simulated, nothing sent (the QA default). | info |
| `skipped_no_recipient` | Org has no `notification_email`. | info |
| `skipped_disabled` | This event type's flag is off for the org. | info |
| `skipped_not_configured` | Reserved for a future global off-switch. | info |
| `failed_configuration` | A key is set but `NOTIFICATION_FROM_EMAIL` is malformed — **fix config**, not a provider issue. | error |
| `failed_permanent` | Provider rejected (400/401/403/422); a retry won't help — check the API key/sender. | error |
| `failed_transient` | Provider/network/timeout (429/5xx); retried a bounded number of times. | error |

**`dry_run` is never reported as `sent`.** The log line always shows a redacted recipient
(`r***@domain`) and the recipient domain — never the full address, the message body, a media URL, the API
key, or a raw IP.

## Deferred — live domain verification

Choosing a domain, verifying the Resend sending domain, and publishing SPF/DKIM/DMARC are **deferred**
until the production domain is selected. Steps are in
[`EMAIL_CONFIGURATION_CHECKLIST.md`](EMAIL_CONFIGURATION_CHECKLIST.md). Do not configure DNS or create a
Resend account as part of routine development.

## Required before a full live pilot

Before turning on live email for real customers:

1. Complete every step in `EMAIL_CONFIGURATION_CHECKLIST.md` (verified domain, SPF, DKIM, DMARC `p=none`,
   scoped API key, `NOTIFICATION_FROM_EMAIL`).
2. Send a real test to **multiple mailbox providers** (Gmail, Outlook, a corporate domain), inspect
   headers (SPF/DKIM/DMARC = pass), and check spam/junk placement.
3. Record the provider message IDs and confirm `"outcome":"sent"` appears in the logs.
4. Only then describe email as "delivering" — never before an actual send has been verified.

## Durable failure record — decision

For the first pilot, **structured Vercel logs + the Resend dashboard are sufficient**; no database table
is added for notification history. A table is not warranted merely because live Resend is currently
unconfigured. Revisit only if the pilot shows a real need for queryable, long-retention delivery history.
