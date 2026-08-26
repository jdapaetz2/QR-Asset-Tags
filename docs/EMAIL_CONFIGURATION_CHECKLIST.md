# Email Configuration Checklist — Mulemark

Status as of **Phase B4**: the **provider and DNS half is complete and verified**. What remains is the
Vercel Production wiring and the live application test. Nothing below is automated by the app.

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

## 3. Scoped API key — ⬜ operator confirmation required

- [ ] Confirm in the Resend dashboard that the key used is **Sending access** (not full access) **and
      restricted to `notify.mulemark.io`**.
- [ ] If it is broader than that, **rotate it** and use the replacement. Do not copy the old or new value
      anywhere.
- [ ] Confirm **open tracking and click tracking are OFF** for the domain. Both are Resend
      *dashboard* settings — the app sends no pixel and no wrapped link, but it cannot turn off a
      provider-side rewrite, so this has to be checked by eye.

## 4. Vercel Production variables — ⬜ operator action

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

## 5. Live application test — ⬜ after step 4

Run the full matrix in `EMAIL_DELIVERABILITY_RUNBOOK.md` → "Live application test plan" against **demo/QA
data only**. In short: trigger each of the four notification events, plus a disabled notification, a
missing recipient, a provider failure, and a replay; then confirm the same event on staging still logs
`dry_run` and sends nothing.

For each live message check headers for `spf=pass`, `dkim=pass`, `dmarc=pass`, confirm the links point at
`https://mulemark.io`, and record the `providerId` from the log.

Send these **gradually**, not as a burst — a brand-new sending domain earns reputation by behaving like
a normal correspondent.

## 6. Only then

- [ ] Update `PILOT_LIMITATIONS.md` and `PHASE_A_PILOT_READINESS.md` with the date, the providers
      tested, and the observed placement. **Until an actual send through the application is verified, do
      not describe email as delivering** — and never claim guaranteed inbox placement in any provider.

## Rollback

Live email is best-effort and non-blocking: to revert to dry-run, remove `RESEND_API_KEY` (or
`NOTIFICATION_FROM_EMAIL`) from Vercel Production and redeploy. Submissions and status updates are
unaffected either way.
