# Email Deliverability Runbook — Mulemark

**Status (B4 operator closeout, 2026-08-31): LIVE on Production, partially verified.** Production is
wired and has sent real, authenticated email through the application. Two of the four notification
events are proven end-to-end; **the other two have never sent a live message.** Staging remains
dry-run. Inbox placement is not guaranteed for any provider.

### What was actually verified live

| Check | Result |
|---|---|
| Support request → live email | **PASS** |
| Damage report → live email | **PASS** |
| Exactly one email per event | **PASS** |
| Provider message IDs captured | **PASS** |
| Links use `mulemark.io` | **PASS** |
| Reply-To reaches `support@mulemark.io` | **PASS** |
| Gmail SPF / DKIM / DMARC | **PASS** |
| Outlook SPF / DKIM / DMARC | **PASS** |
| Outlook placement | Inbox — **in an allowlisted mailbox** (see below) |
| Staging submission created, no email sent | **PASS** |

The working Reply-To is also proof that the deployed build carries the B4 code: `reply_to` did not
exist before it.

### What is NOT verified — do not report these as working

| Gap | Why it matters |
|---|---|
| **Return-checklist** notification never sent live | different call site (`lib/inspections/submit.ts`) from the forms that passed |
| **Tag-request status** notification never sent live | different orchestrator, different subject builder, and the only idempotency key carrying a status (`<id>:<status>`) |
| **Replay** never tested in production | "one email per event" is not the same measurement; duplicate protection is unit-tested only |
| **Provider-failure path** never exercised live | unit-tested only |
| **Cold-mailbox placement** unmeasured | see Outlook, below |

A further subtlety worth keeping straight: the staging observation logged
`outcome":"skipped_no_recipient"`, which proves isolation but does **not** exercise the preview
hard-stop — the no-recipient check in `notify.ts` returns *before* `sendNotificationEmail` is called, so
the environment rule was never reached. To see `reason":"preview_environment"` first-hand, staging needs
an org with a `notification_email` set.

## The sender

| | |
|---|---|
| From | `Mulemark <notifications@notify.mulemark.io>` |
| Reply-To | `support@mulemark.io` (Google Workspace, human-monitored) |
| Sending domain | `notify.mulemark.io` — transactional only |
| API key | sending-only, restricted to `notify.mulemark.io`. **The value appears nowhere outside Vercel Production and the Resend dashboard.** |
| Provider | Resend REST API (`POST https://api.resend.com/emails`), no SDK |
| Tracking | open/click tracking should be **off** — a provider-side setting the app cannot assert. **Not yet confirmed by the operator at closeout.** |

## Behaviour by environment

| Environment | Behaviour | Why |
|---|---|---|
| **Production** | **LIVE** since the B4 operator closeout | the only environment permitted to send |
| **Preview / staging** | **Always `dry_run`**, `reason="preview_environment"` | enforced in `lib/notifications/send.ts` **before** any credential is read — a key added to Preview by mistake cannot send |
| **Local / test** | `dry_run` unless a developer deliberately configures a key | `reason="unconfigured"` |

In every dry-run case the notifier **sends nothing, makes no network request, and never blocks** the form
or status update that triggered it.

### Outcome glossary (the `outcome` field)

| Outcome | Meaning | Stream |
|---|---|---|
| `sent` | Live provider accepted the message (2xx); `providerId` captured. | info |
| `dry_run` | Nothing sent. Read `reason`: `preview_environment` (the rule) or `unconfigured` (no credentials). | info |
| `skipped_no_recipient` | Org has no `notification_email`. | info |
| `skipped_disabled` | This event type's flag is off for the org. | info |
| `skipped_not_configured` | Reserved for a future global off-switch. | info |
| `failed_configuration` | A key is set but `NOTIFICATION_FROM_EMAIL` is malformed — **fix config**, not a provider issue. | error |
| `failed_permanent` | Provider rejected (400/401/403/422); a retry won't help — check the API key/sender. | error |
| `failed_transient` | Provider/network/timeout (429/5xx), or `budget_exhausted`; retried within bounds. | error |

**`dry_run` is never reported as `sent`.** The log line always shows a redacted recipient
(`r***@domain`) and the recipient domain — never the full address, the message body, a media URL, the API
key, or a raw IP.

## Duplicate protection

Every notification carries a deterministic `Idempotency-Key` derived from the event, the canonical record
and a hash of the recipient (`lib/notifications/idempotency.ts`). Resend deduplicates on that key for
**24 hours**, returning the original response without sending again.

This is what makes the retry loop safe. The dangerous case is a **timeout**: the provider may have
accepted the message we stopped waiting for, and the old code would then send it a second time to a real
customer. The same key goes out on every attempt, so it cannot.

- A **submission** notifies exactly once, ever — the key is its submission id.
- A **tag request** notifies on every status *change* — the key includes the status, so
  `requested → delivered` sends and a replay of `delivered` does not.
- Changing an org's notification address changes the key, so a legitimate new recipient is never silently
  swallowed by the dedupe window.

## Retry and the request-path budget

Transient failures (429, 5xx, network, timeout) are retried up to 3 attempts with capped exponential
backoff, honouring a capped `Retry-After`.

Notifications are awaited **inside** the renter's submission request, so attempt-level timeouts alone are
not enough — three slow attempts plus backoff could hold that request long enough to hit the platform's
function limit and turn a best-effort email into a failed submission. `NOTIFICATION_TOTAL_BUDGET_MS`
(15 s) bounds the whole call: an attempt is never started if it cannot finish inside the budget, and the
result is reported as `failed_transient` with `failureClass="budget_exhausted"`.

## Authentication

| Mechanism | Where | Alignment |
|---|---|---|
| DKIM | `resend._domainkey.notify.mulemark.io` | `d=notify.mulemark.io` — strict alignment with the From domain |
| SPF | `send.notify.mulemark.io` (return path) | relaxed alignment under the `mulemark.io` org domain |
| DMARC | `_dmarc.mulemark.io` → `v=DMARC1; p=none;` | inherited by `notify.mulemark.io`, which has no policy of its own |

Google Workspace keeps the apex: MX `smtp.google.com`, SPF `v=spf1 include:_spf.google.com ~all`. The two
senders never share a hostname, which is why both SPF records are valid.

**Verify from real headers, not from this table.** `Authentication-Results` in a delivered message must
show `spf=pass`, `dkim=pass`, `dmarc=pass`.

## Live application test plan

Run against **demo/QA data only**, after the Production variables are set and the project redeployed.

| # | Event | Expected | Status |
|---|---|---|---|
| 1 | Support request | one email, `outcome":"sent"` + `providerId` | ✅ **PASS** |
| 2 | Damage report | one email | ✅ **PASS** |
| 3 | Return checklist (org flag on) | one email | ⬜ **not run** |
| 4 | Tag-request status update | one email, subject names the organization | ⬜ **not run** |
| 5 | Notification type disabled | `skipped_disabled`, no send | ⬜ not run |
| 6 | Org with no `notification_email` | `skipped_no_recipient`, no send | ✅ observed on staging |
| 7 | Provider failure | submission still succeeds; `failed_*` logged | ⬜ **not run** |
| 8 | Replay of the same event | **no second email** (idempotency) | ⬜ **not run** |

Rows 3, 4, 7 and 8 are the outstanding work. Do not treat 3 and 4 as covered by 1 and 2 — they run
through different code (a different submit path, and a different orchestrator with the only
status-bearing idempotency key).

For every live message confirm: the database row exists; **exactly one** email arrives; From and Reply-To
are correct; the canonical reference (`SUB-…` or the tag-request id) is present; links are on
`https://mulemark.io`; no private media or signed URL appears; the `providerId` is captured; the Vercel
log line is redacted; and a **reply reaches `support@mulemark.io`**.

Then submit the same event on staging and confirm the record is created, the outcome is `dry_run` with
`reason="preview_environment"`, and no email is sent.

## Monitoring

Watch, in this order of usefulness:

1. **Resend Deliverability Insights** — bounces, complaints, and per-provider delivery.
2. **Bounce rate.** Anything sustained above ~2 % means bad recipient data, not a filter problem.
3. **Complaint rate.** Should be effectively zero for transactional mail; anything else means the
   messages are not being recognised as expected.
4. **Vercel logs** filtered on the `notifications` tag — `failed_permanent` in particular points at the
   key or the sender, not at the recipient.
5. **Placement**, spot-checked in Gmail and Outlook after any template change.

At pilot volume, stay on Resend's **shared IP**. A dedicated IP needs consistent volume to warm up and
would make deliverability *worse* here. Do not use third-party "warm-up" services — they send artificial
mail that no filter is fooled by.

## Outlook placement

The first direct provider test landed in Outlook's **Junk**. That is an ordinary first-contact result for
a brand-new sending domain with no history, not evidence of a broken application — the message was
delivered, and authentication was in place.

**The follow-up test reached the Inbox — but that mailbox had since been allowlisted** (marked "not
junk", plus a rule). So the current evidence is *"delivers to the Inbox of a recipient who has
allowlisted the sender"*, which is consistent with correct authentication and worth having, but is
**not** a measurement of cold-start placement for a brand-new customer. That is the case that matters at
pilot, and it is still unmeasured. Either test in a clean, never-allowlisted Outlook mailbox, or accept
that pilot customers receive [`EMAIL_ALLOWLIST_GUIDE.md`](EMAIL_ALLOWLIST_GUIDE.md) at onboarding and
that allowlisting is part of the workflow. Both are defensible; pretending the question is closed is not.

Response, in order:

1. Confirm SPF/DKIM/DMARC pass in the delivered headers. If any fails, it is a DNS problem — fix that
   first and ignore everything below.
2. Retest with the **real Mulemark template** after B3, and confirm links point at `mulemark.io` rather
   than a Vercel URL. Provider-level test mail and application mail are different messages.
3. In the test mailbox, mark the message **Not junk** and add the sender to Safe Senders. This is the
   signal the filter learns from.
4. Send subsequent tests **gradually**, not in a burst.
5. Test at least **two unrelated mailbox providers** so a single provider's behaviour is not mistaken for
   a general problem.
6. If a specific customer still filters it, send them
   [`EMAIL_ALLOWLIST_GUIDE.md`](EMAIL_ALLOWLIST_GUIDE.md) — a fallback, not the strategy.

**Inbox placement is never guaranteed, by anyone.** Report what was observed, per provider, with a date.

## DMARC policy

Current: `v=DMARC1; p=none;` — monitoring only. **B4 does not tighten it.** Moving to `quarantine` or
`reject` without aggregate-report evidence risks silently destroying legitimate Google Workspace mail as
well as notifications.

Optional next step, available once the alias exists: add `rua=mailto:dmarc@mulemark.io` to collect
aggregate reports. If that is enabled, someone must own reading them — the reports are XML, arrive daily
from each participating receiver, and are only useful if a person actually looks for unaligned sources.
Reassess enforcement only after Google Workspace **and** Resend have both shown consistent alignment over
a meaningful period.

## Durable failure record — decision

For the first pilot, **structured Vercel logs + the Resend dashboard are sufficient**; no database table
is added for notification history. Revisit only if the pilot shows a real need for queryable,
long-retention delivery history.
