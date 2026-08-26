# Operations Runbook — Mulemark

Operational incident handling for the pilot. Deployment steps live in
[`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md); production smoke steps in
[`PRODUCTION_SMOKE_TEST.md`](PRODUCTION_SMOKE_TEST.md). Staging/preview deployments follow the production runbook plus
the staging-specific record and safeguards in
[`STAGING_DEPLOYMENT_RUNBOOK.md`](STAGING_DEPLOYMENT_RUNBOOK.md) (added in Phase A6.3).

## Guiding guarantee

**Email is always best-effort and never blocks a submission.** A public form, a submission, or a status
update succeeds regardless of the notification outcome. Notification code is wrapped so it can never throw
into the request path.

## Notifications — how to read the logs

Every notification attempt emits one structured `[notifications]` JSON line. Filter Vercel logs for the
`notifications` tag. Fields: `event`, `outcome`, `organizationId`, `reference`, `recipientDomain`,
`recipientRedacted`, `providerId`, `providerStatus`, `attempts`, `failureClass`, `reason`,
`deploymentContext`. Sensitive values are never logged (no full recipient, message body, media URL, API
key, or raw IP). See the outcome glossary in
[`EMAIL_DELIVERABILITY_RUNBOOK.md`](EMAIL_DELIVERABILITY_RUNBOOK.md).

### Dry-run incidents

- **Preview/staging is ALWAYS dry-run** — `reason":"preview_environment"`. This is enforced in code
  before any credential is read, so it holds even if a key were added to the Vercel Preview environment.
  Live mail from staging is not a failure mode that needs an incident response; it is prevented.
- **Production dry-run** shows `reason":"unconfigured"` — the Production variables are not set. Healthy
  before B4's operator step, a **misconfiguration afterwards**: check that `RESEND_API_KEY` and
  `NOTIFICATION_FROM_EMAIL` are on Production and that the project was **redeployed** (they are read at
  build time, so setting them without redeploying changes nothing).
- **"A customer didn't get an email"** while dry-run: expected. Confirm the submission itself was
  recorded (it will be) and point the operator at `EMAIL_CONFIGURATION_CHECKLIST.md`.
- **`skipped_no_recipient` / `skipped_disabled`:** the org has no notification address, or that event
  type's toggle is off. Not a system fault — an org-settings choice.

### Live-email mode incidents (after the checklist is complete)

- **"They got the same email twice."** This should be impossible: every send carries a deterministic
  `Idempotency-Key` and Resend dedupes on it for 24 hours. If it happens, check whether the two messages
  have **different** `providerId` values and whether more than 24 hours separated them — and whether the
  org's `notification_email` changed between the two (a new recipient is deliberately a new key). A true
  duplicate with one provider id is a provider issue; two ids inside the window is a bug worth reporting.
- **`budget_exhausted`** (a `failed_transient` sub-class): the provider was slow enough that the send hit
  its 15 s wall-clock budget and stopped retrying. The submission still succeeded — that is the point of
  the budget. Investigate provider latency, not the app.
- **Mail is landing in junk:** first confirm `spf=pass`, `dkim=pass`, `dmarc=pass` in a delivered
  message's headers. If they pass, this is placement, not a fault — see the Outlook section of the
  deliverability runbook and send the customer
  [`EMAIL_ALLOWLIST_GUIDE.md`](EMAIL_ALLOWLIST_GUIDE.md). If any fails, it is DNS: **do not touch the
  Google Workspace MX/SPF/DKIM records** while investigating.

- **`failed_configuration`:** a key is set but `NOTIFICATION_FROM_EMAIL` is malformed. Fix the env var to
  a verified sender and redeploy. No send is attempted until it is valid.
- **`failed_permanent` (400/401/403/422):** the provider rejected the request and a retry cannot help.
  Usual causes: revoked/invalid API key (401/403), unverified sender, or a malformed request. Check the
  Resend dashboard and the key/sender; re-verify the domain if needed.
- **`failed_transient` (429/5xx/network/timeout):** transient provider/network trouble. The sender already
  retried a bounded number of times (`attempts` shows how many) honoring `Retry-After`. If widespread,
  check the Resend status page. Individual misses are acceptable for the pilot (best-effort); there is no
  durable retry queue yet (deferred — see the deliverability runbook).
- **Sudden spike in failures:** confirm `deploymentContext`, check the Resend dashboard for an outage or a
  suspended domain/key, and verify SPF/DKIM/DMARC still resolve.

### What NOT to do

- Do not treat `dry_run` as a delivery failure — in Preview it is the enforced mode, permanently.
- Do not claim email is delivering until an actual send has been verified against multiple providers,
  and never claim guaranteed inbox placement in any provider.
- Do not put secrets, full recipient addresses, or message bodies into logs or tickets when escalating.
  **The Resend API key must never be pasted anywhere** — not into a ticket, a command, or a chat.
- Do not add live-email variables to the Preview environment to "test" them. Preview is refused in code;
  add them to Production and test there against demo data.
- Do not tighten DMARC to `quarantine`/`reject` during an incident. It cannot fix a placement problem and
  can silently destroy Google Workspace mail.

## Rate limiting / abuse (Phase A4)

Public-intake abuse controls emit `[rate-limit]` logs; the limiter fails open on infra error so it never
blocks a real renter. Orphaned-media cleanup is [`ORPHAN_MEDIA_CLEANUP.md`](ORPHAN_MEDIA_CLEANUP.md).

## Security boundaries

RLS/role/storage boundaries and the executed test suite are documented in
[`SECURITY_MODEL.md`](SECURITY_MODEL.md) and [`SECURITY_TESTING.md`](SECURITY_TESTING.md).
