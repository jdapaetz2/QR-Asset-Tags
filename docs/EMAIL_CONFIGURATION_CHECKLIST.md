# Email Configuration Checklist — Mulemark (deferred manual steps)

These are the **operator** steps to move notifications from dry-run to live email. They are **deferred**
until Mulemark has a chosen production domain. Nothing here is automated by the app, and none of it is a
prerequisite for development or preview QA (see
[`EMAIL_DELIVERABILITY_RUNBOOK.md`](EMAIL_DELIVERABILITY_RUNBOOK.md)).

> Do not create a Resend account, configure DNS, or send live email as part of routine development.

## 1. Domain + sending subdomain

- [ ] Choose the production domain (blocked on trademark/name clearance — see `PILOT_LIMITATIONS.md`
      "Commercial dependencies").
- [ ] Choose a **sending subdomain** (e.g. `mail.` or `notifications.`) so the root domain's reputation
      stays independent of transactional mail.

## 2. Verify the Resend sending domain

- [ ] Create the domain in Resend and add the DNS records it generates.
- [ ] **SPF** — publish the Resend-provided TXT record on the sending subdomain.
- [ ] **DKIM** — publish the Resend-provided CNAME/TXT key record(s).
- [ ] **DMARC** — publish a record starting in **monitoring mode**:
      `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` (collect reports first; tighten to `quarantine`/`reject`
      only after SPF+DKIM align cleanly for a while).
- [ ] Wait for Resend to show the domain **Verified**.

## 3. Scoped API key + sender

- [ ] Create a **scoped** Resend API key (sending permission only), not a full-access key.
- [ ] Set `RESEND_API_KEY` in Vercel (production, and preview if you want live preview email).
- [ ] Set `NOTIFICATION_FROM_EMAIL` to a verified sender on the sending subdomain, e.g.
      `Mulemark Alerts <alerts@mail.<domain>>`. The app rejects a malformed value as
      `failed_configuration` (it will not attempt a send).
- [ ] Redeploy so the new environment variables take effect.

## 4. Deliverability test (multiple providers)

- [ ] Trigger a real notification (e.g. submit a public damage report against a test asset whose org has a
      `notification_email`).
- [ ] Send to **multiple mailbox providers**: Gmail, Outlook/Hotmail, and a corporate/custom domain.
- [ ] **Inspect headers** in each: `Authentication-Results` should show `spf=pass`, `dkim=pass`,
      `dmarc=pass`.
- [ ] Check **spam/junk** placement in each provider; adjust content/warm-up if filtered.
- [ ] Confirm the app logs `"outcome":"sent"` and **record the provider message IDs** from the log
      (`providerId`) and/or the Resend dashboard.

## 5. Only then

- [ ] Update `PILOT_LIMITATIONS.md` to mark live email delivery as tested (with the date + providers
      checked). Until an actual send is verified, do **not** describe email as delivering.

## Rollback

Live email is best-effort and non-blocking: to revert to dry-run, unset `RESEND_API_KEY` (or
`NOTIFICATION_FROM_EMAIL`) in Vercel and redeploy. Submissions and status updates are unaffected either
way.
