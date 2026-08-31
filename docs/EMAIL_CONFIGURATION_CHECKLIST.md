# Email Configuration Checklist — Mulemark

Status as of the **B4 operator closeout (2026-08-31)**: **live email is ON in Production** and has been
verified end-to-end for damage and support notifications. Return-checklist and tag-request notifications
have **not** been sent live. Nothing below is automated by the app.

> **Never paste the API key into chat, a command line, a log, a report, a source file, or this document.**
> It belongs in the Vercel Production environment and the Resend dashboard, nowhere else.

---

## 1. Domain + sending subdomain — ✅ done

- [x] Production domain: **`mulemark.io`** (decided in B3; see `PRODUCTION_DOMAIN_CHECKLIST.md`).
- [x] Sending subdomain: **`notify.mulemark.io`**, so transactional reputation stays separate from the
      root domain's Google Workspace mail.
- [x] Human mailbox: `support@mulemark.io` on Google Workspace — **unchanged by any of this**.

## 2. Resend sending domain — ✅ verified

Operator-confirmed in the Resend dashboard, and independently confirmed in DNS:

| Record | Host | Value | State |
|---|---|---|---|
| DKIM | `resend._domainkey.notify.mulemark.io` | `p=MIGfMA0…` | ✅ verified |
| SPF | `send.notify.mulemark.io` | `v=spf1 include:amazonses.com ~all` | ✅ verified |
| Return-path MX | `send.notify.mulemark.io` | `feedback-smtp.us-east-1.amazonses.com` | ✅ verified |
| DMARC | `_dmarc.mulemark.io` | `v=DMARC1; p=none;` | ✅ monitoring |

**Google Workspace is untouched and must stay that way:**

| Record | Host | Value |
|---|---|---|
| MX | `mulemark.io` | `smtp.google.com` |
| SPF | `mulemark.io` | `v=spf1 include:_spf.google.com ~all` |

⚠️ **Never publish a second SPF record at the same hostname.** The Resend SPF lives at
`send.notify.mulemark.io` and the Google SPF at the apex — two different hosts, which is why both are
valid. Adding an `include:amazonses.com` to the apex record, or a second TXT alongside either, breaks SPF
for that host.

⚠️ **`_dmarc.mulemark.io` holds exactly one record.** Verified: there is no stray Google
site-verification TXT there to clean up. If one ever appears, remove it **only** after Google Admin
confirms the domain is verified by another method, and never remove the DMARC record itself.

## 3. Scoped API key — 🟡 partially confirmed

- [x] The key is set in Vercel Production only, stored as a **Secret** (hidden).
- [ ] Confirm in the Resend dashboard that the key is **Sending access** (not full access) **and
      restricted to `notify.mulemark.io`**. **Still open at closeout.**
- [ ] If it is broader than that, **rotate it** and use the replacement. Do not copy the old or new value
      anywhere.
- [ ] Confirm **open tracking and click tracking are OFF** for the domain. **Still open at closeout.**
      Both are Resend *dashboard* settings — the app sends no pixel and no wrapped link, but it cannot
      turn off a provider-side rewrite, so this has to be checked by eye.

## 4. Vercel Production variables — ✅ done

Set on the **Production** environment only, then **redeploy** (Next.js reads these at build time):

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | the sending-only, domain-restricted key |
| `NOTIFICATION_FROM_EMAIL` | `Mulemark <notifications@notify.mulemark.io>` |
| `NOTIFICATION_REPLY_TO_EMAIL` | `support@mulemark.io` |

**Do not add any of these to Preview.** Preview is staging: it points at the staging Supabase project and
its own site URL, and live mail from it would reach real addresses in test data. Since B4 this is
enforced in code as well as by configuration — `lib/notifications/send.ts` returns `dry_run` with
`reason="preview_environment"` before reading a single credential, so a key added to Preview by mistake
is inert. The configuration rule still stands; the code is the backstop, not the permission.

A malformed `NOTIFICATION_FROM_EMAIL` is reported as `failed_configuration` and **no send is attempted**.
`NOTIFICATION_REPLY_TO_EMAIL` is optional — omit it and replies go to the no-reply sending address.

## 5. Live application test — 🟡 half done

**Verified live:** support request and damage report each sent exactly one correctly-addressed email,
with a provider message ID, `mulemark.io` links, a working Reply-To to `support@mulemark.io`, and
`spf=pass`/`dkim=pass`/`dmarc=pass` at both Gmail and Outlook. Staging created its record and sent
nothing.

**Still outstanding** — see the status column in `EMAIL_DELIVERABILITY_RUNBOOK.md` → "Live application
test plan":

- [ ] **Return checklist** notification (different submit path — not covered by the two that passed).
- [ ] **Tag-request status update** (different orchestrator, different subject, the only idempotency key
      that carries a status).
- [ ] **Replay** an event and confirm no second email. "One email per event" did not test this.
- [ ] A **provider-failure** path.
- [ ] Placement in a **clean, never-allowlisted** mailbox — the Outlook Inbox result was measured after
      that mailbox had been allowlisted.

For each live message check headers for `spf=pass`, `dkim=pass`, `dmarc=pass`, confirm the links point at
`https://mulemark.io`, and record the `providerId` from the log.

Send these **gradually**, not as a burst — a brand-new sending domain earns reputation by behaving like
a normal correspondent.

## 6. Recording the result

- [x] `PILOT_LIMITATIONS.md` and `PHASE_A_PILOT_READINESS.md` updated with the date, providers tested,
      and observed placement (B4 closeout, 2026-08-31). Verdict 5 is **CONDITIONAL GO**.
- Say only what was measured: damage and support notifications deliver with authentication passing at
  Gmail and Outlook. **Do not** describe the other two event types as working, do not describe duplicate
  protection as proven in production, and **never claim guaranteed inbox placement** in any provider.

## Rollback

Live email is best-effort and non-blocking: to revert to dry-run, remove `RESEND_API_KEY` (or
`NOTIFICATION_FROM_EMAIL`) from Vercel Production and redeploy. Submissions and status updates are
unaffected either way.
