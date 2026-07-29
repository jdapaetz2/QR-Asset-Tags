# Operations Runbook — Mulemark

Operational incident handling for the pilot. Deployment steps live in
[`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md); production smoke steps in
[`PRODUCTION_SMOKE_TEST.md`](PRODUCTION_SMOKE_TEST.md). (There is no separate staging runbook — preview
deployments follow the production runbook with placeholder/QA env values.)

## Guiding guarantee

**Email is always best-effort and never blocks a submission.** A public form, a submission, or a status
update succeeds regardless of the notification outcome. Notification code is wrapped so it can never throw
into the request path.

## Notifications — how to read the logs

Every notification attempt emits one structured `[notifications]` JSON line. Filter Vercel logs for the
`notifications` tag. Fields: `event`, `outcome`, `organizationId`, `reference`, `recipientDomain`,
`recipientRedacted`, `providerId`, `providerStatus`, `attempts`, `failureClass`, `deploymentContext`.
Sensitive values are never logged (no full recipient, message body, media URL, API key, or raw IP). See
the outcome glossary in [`EMAIL_DELIVERABILITY_RUNBOOK.md`](EMAIL_DELIVERABILITY_RUNBOOK.md).

### Dry-run mode incidents (current default — no Resend configured)

- **Expected steady state:** `"outcome":"dry_run"` on every notification. This is healthy, not an
  incident. Nothing is sent; nothing is broken.
- **"A customer didn't get an email":** in dry-run this is expected — email is not live yet. Confirm the
  submission itself was recorded (it will be), and point the operator to
  `EMAIL_CONFIGURATION_CHECKLIST.md` to enable live email.
- **`skipped_no_recipient` / `skipped_disabled`:** the org has no notification address, or that event
  type's toggle is off. Not a system fault — an org-settings choice.

### Live-email mode incidents (after the checklist is complete)

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

- Do not treat `dry_run` as a delivery failure — it is the intended mode until live email is configured.
- Do not claim email is delivering until an actual send has been verified against multiple providers
  (checklist §4).
- Do not put secrets, full recipient addresses, or message bodies into logs or tickets when escalating.

## Rate limiting / abuse (Phase A4)

Public-intake abuse controls emit `[rate-limit]` logs; the limiter fails open on infra error so it never
blocks a real renter. Orphaned-media cleanup is [`ORPHAN_MEDIA_CLEANUP.md`](ORPHAN_MEDIA_CLEANUP.md).

## Security boundaries

RLS/role/storage boundaries and the executed test suite are documented in
[`SECURITY_MODEL.md`](SECURITY_MODEL.md) and [`SECURITY_TESTING.md`](SECURITY_TESTING.md).
