# Email Configuration Checklist — Mulemark

Status as of the **B4 final evidence sync (2026-08-31)**: **live email is ON in Production and all four
notification events are verified end-to-end.** Staging is confirmed dry-run by direct observation.
Nothing below is automated by the app.

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

## 3. Scoped API key — ✅ key confirmed · ⬜ tracking status unrecorded

- [x] The key is set in Vercel Production only, stored as a **Secret** (hidden).
- [x] **Operator-confirmed**: the key is **Sending access**, restricted to `notify.mulemark.io`. No
      rotation needed.
- [ ] **Record the actual open/click tracking status for the domain in the Resend dashboard.** It is
      deliberately left blank here rather than guessed at in either direction — an unverified "off" in a
      runbook is worse than an admitted unknown, because it stops anyone from looking. The app itself
      sends no pixel and no wrapped link, but it cannot prevent a provider-side rewrite, so only the
      dashboard can answer this.

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

## 5. Live application test — ✅ all four events verified

**Verified live:** support request, damage report, return checklist and tag-request status update each
sent exactly one correctly-addressed email, with a provider message ID, `mulemark.io` links, a working
Reply-To to `support@mulemark.io`, and `spf=pass`/`dkim=pass`/`dmarc=pass` at both Gmail and Outlook.

**Verified on staging:** a submission against an org **with a recipient set** logged `dry_run` with
`reason":"preview_environment"`, `attempts: 0` and `providerId: null` — the send layer was entered and
the environment rule refused it. No email left staging.

**Still outstanding:**

- [ ] **Replay** an event within 24 h and confirm no second email. This is the only check that proves
      Resend honours our `Idempotency-Key`; today that rests on their docs plus mocked unit tests.
- [ ] A **provider-failure** path (submission still succeeds, `failed_*` logged).
- [ ] A **disabled-notification** path (`skipped_disabled`, no send).
- [ ] Placement in a **clean, never-allowlisted** mailbox — or a recorded decision that allowlisting is
      part of onboarding.

For each live message check headers for `spf=pass`, `dkim=pass`, `dmarc=pass`, confirm the links point at
`https://mulemark.io`, and record the `providerId` from the log.

Send these **gradually**, not as a burst — a brand-new sending domain earns reputation by behaving like
a normal correspondent.

## 6. Recording the result

- [x] `PILOT_LIMITATIONS.md` and `PHASE_A_PILOT_READINESS.md` updated with the date, providers tested,
      and observed placement (B4 final evidence sync, 2026-08-31). Verdict 5 remains **CONDITIONAL GO**
      with materially narrowed conditions.
- Say only what was measured: all four notification types deliver, with authentication passing at Gmail
  and Outlook, and staging is provably silent. **Do not** describe duplicate protection as proven in
  production, do not describe open/click tracking as off until someone has looked, and **never claim
  guaranteed inbox placement** in any provider.

## Rollback

Live email is best-effort and non-blocking: to revert to dry-run, remove `RESEND_API_KEY` (or
`NOTIFICATION_FROM_EMAIL`) from Vercel Production and redeploy. Submissions and status updates are
unaffected either way.
