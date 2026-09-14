# Phase D — Actionable Notification Readiness (Engineering Phase D closeout)

**Branch `pilot-credibility`.** Application code as deployed: `3fb3364`, Production deployment `6417386658` →
`mulemark.io` (`git diff --stat 3fb3364 HEAD -- lib app components public supabase` is empty). D5 added QA tooling
only — `c5b3f24`, `71e20e3` — and this closeout. Live QA 2026-09-13 (UTC); operator checks and closeout 2026-09-14.

> **This is Engineering Phase D (actionable notifications).** It is *not* the business roadmap's
> "Phase D - Controlled pilots" in `roadmap.md`, which is untouched by this work.

Design, locked decisions and the row-by-row live record: [`ACTIONABLE_NOTIFICATION_DESIGN.md`](ACTIONABLE_NOTIFICATION_DESIGN.md)
(§15.7, §15.8).

---

## 1. Verdicts

**Actionable notifications are ready for a limited pilot, with conditions.** On Production, every approved rule
produced the expected priority, route and outcome. The daily summary ran on its first real schedule and sent the
returns it should. Photo previews stayed private. A direct Outlook delivery rendered correctly.

Three things keep this below an unconditional GO:

- a usability gap the operator found: the escalation reason (D5.1);
- a noisy but design-conformant return classification;
- delivery checks that cannot be run safely (live replay, live provider failure), and first-contact placement for a
  never-allowlisted mailbox, which is unmeasured.

| # | Verdict | Result | Condition / reason |
|---|---|---|---|
| 1 | Notification content usefulness | **CONDITIONAL GO** | Every saved QA row renders the approved brief (automated content check), and the operator confirmed a complete, readable direct Outlook email. **D5.1:** an Immediate-attention email can show a lower reported response need without saying why it was escalated. |
| 2 | Deterministic triage | **GO** | All 28 live submissions (18 reports and 10 renter returns) matched their expected priority and headline from the saved rows, including severity-never-raises and omitted answers. The two clean returns match the as-built rule in §12. |
| 3 | Urgent routing | **GO** | Five live route decisions were correct: main only, urgent only, general-off routine skip, one send for the same address, and two routes for different addresses (the support-inbox copy of `SUB-2026-0D7A41` arrived; the sandbox copy is in the provider log). The database and the settings form both refused an urgent switch without an address. Partial-failure isolation is unit-tested only (verdict 7). |
| 4 | Return notification and noise | **CONDITIONAL GO** | All three modes behave as locked, and staff returns never send individually. A clean renter return without the optional Additional photos is **Routine review**, not Record only — conforms to design §5.3, needs an operator decision (§12). |
| 5 | Daily summary reliability | **GO** | First real windows 2026-09-12 (quiet), 2026-09-13 (`sent`, 7 items), 2026-09-14 (quiet); one ledger row per organization per window; cron auth 3/3. DST, catch-up, failure and ordering are proven on staging. The operator checked the delivered summary in Gmail (§6). |
| 6 | Photo-preview privacy | **GO** | Previews were attached 2 of 2 on three reports, each under 250 KB, and none of the content showed a storage path or signed URL. Stripping is unit-tested on real Sharp output. Stored originals keep their metadata; that is a recorded limitation, not a preview issue. |
| 7 | Delivery and client rendering | **CONDITIONAL GO** | The operator verified direct Outlook delivery and the Gmail review of the support inbox (SPF, DKIM and DMARC pass; Inbox) on 2026-09-14. Still missing: live replay, live provider failure, and first-contact placement for a never-allowlisted mailbox. A forwarded Gmail copy lost its inline image. |
| 8 | Limited-pilot readiness (notifications) | **CONDITIONAL GO** | Conditions: D5.1; the clean-return decision; the first-contact placement decision (§14). Standing: `after()` is best-effort, not a queue, and Supabase has no backups (Phase C §13). |

---

## 2. Repository and deployment facts

| Fact | Value | How known |
|---|---|---|
| HEAD at D5 start | `f31f5d3` | `git rev-parse` |
| D5 commits | `c5b3f24` (QA matrix, config report, content check, staging summary suite), `71e20e3` (hydration-safe drivers) | `git log` |
| D1–D4.1 commits | D1 `bed70f0`; D2 `0df70fa`, `2207b01`; D3A `4c01411`; D3B `089f707`, `b771f0c`; D4 `4cd69d2`, `241d90a`; D4.1 `cc35dbe`…`3fb3364` | `git log` |
| Production deployment | `6417386658` — `3fb3364` "test(media): cover on-device refusal and staging photo formats", current | Vercel Deployments (Production filter), read-only |
| Node | Vercel **22.x**; `.nvmrc` 22, `engines` 22.x; local shell v24.16.0 (outside the baseline, recorded) | dashboard, repository |
| Migrations | staging `migration list` 0001–0039 local = remote (2026-09-13); Production 0001–0039 matched at the 0039 apply (2026-09-13). **D5 added none.** | CLI (linked to staging only; no relink) |
| Email variables | `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, `NOTIFICATION_REPLY_TO_EMAIL`, `CRON_SECRET`: **Production only**, none on Preview | Vercel Environment Variables, names and scopes only |
| Cron | Cron Jobs enabled; `/api/cron/return-digest` `0 13 * * *` and `0 14 * * *` UTC (Hobby: flexible within the hour) | Vercel Cron Jobs page |
| Preview hard stop | `lib/notifications/send.ts` returns `dry_run` / `preview_environment` before credentials; unit-tested; **observed live** 2026-09-13 (`SUB-2026-CEE146`, `SUB-2026-675C7A`, attempts 0) | code, `send.test.ts`, Vercel log |
| Secret scan | CI `secret-scan` (gitleaks, full history) **success** on `f31f5d3`, `c5b3f24`, `71e20e3`; `.gitleaksignore` holds two exact fingerprints (a synthetic key in `a71dcf4`); gitleaks is not installed locally | GitHub public check-runs API |

**Production notification configuration after closeout** (`npm run production:notification-config`, read-only):

- **Organizations:** three, all active.
  - Northridge demo: `instant_renter`, main address set, tag updates on.
  - A second customer organization: `off`, no address.
  - QA organization: `off`, tag updates off. The QA tooling restored its pre-D5 notification values at 16:48 UTC and
    verified them (no address). Shortly afterwards its main address was set back to `support@mulemark.io` outside the
    tooling (observed 17:23 UTC), so QA damage and support reports now email the support inbox.
- **Daily summary:** considers one organization.

---

## 3. Gates

| Gate | Result |
|---|---|
| `lint` · `typecheck` | pass |
| `test` | **2077 passed / 190 files** |
| `build` · `check:scan-bundle` | pass · ok (photo-adapter chunks load only on the damage form, not the scan page or its no-JS copy) |
| `test:security` | **125 passed / 10 files** (fresh local reset 0001–0039) |
| `test:e2e` | **113 passed**, 0 failed (production build, public sample photo fixtures) |
| `smoke:staging` | 27 pass, 0 fail, 1 documented skip (dry-run line — confirmed in the log instead) |
| `smoke:production` | 13 pass, 0 fail, 1 documented skip (test-only scan code unset) |
| `verify:staging-target` · `verify:production-target` · `verify:production-config` | 6 pass · 4 pass, 1 warn (local `.env.local` site URL) · 5 pass, 3 warn (local shell) |
| `check-linked-project --expect=kwserenxwjxozztyigmw` | pass (staging) |
| `digest:staging-check` | **8/8** (extended D5 suite) |
| `cron:verify-production` | **3/3** — 401, 401, 200 `outside_window` (2026-09-13 04:52 UTC) |
| `production:qa-notification-content` | 25/27 (run 1; the two failures are the §12 classification), 3/3, 2/2 |
| Secret scan | CI success on both D5 tooling commits; the closeout commit is scanned on push |

The gates ran on the D5 tooling commits; the closeout commit changes documentation only.

---

## 4. Live matrix (Production QA organization, 2026-09-13)

Scope: the Production QA organization and the `prod-qa-perf-probe` tag only. Recipients were allowlisted to
`support@mulemark.io` (main) and `delivered@resend.dev` (the separate urgent address). Every changed setting was
snapshotted and restored. The runs (UTC) were:

- 04:51:51–05:07:23 — all scenarios;
- 05:12:54–05:15:18 and 05:16:58–05:17:25 — re-runs of three browser steps after automation fixes:
  - a click that landed before hydration was lost;
  - the accessories question sits on the second stage.

No application change was made. Row-by-row results are in design §15.7.

| Group | Run | Result |
|---|---|---|
| **Damage (8)** | omitted triage; routine answers; severity Major only; not operating + prompt; cannot be moved; unsafe (unusable phone); previews on; previews off | all expected priority and headline; `sent` main; previews 2/2 (720 ms) and switched off → requested 0 |
| **Support (5)** | operating question; breakdown + prompt; stuck/recovery; rollover; help now (no phone) | routine / follow up / follow up / immediate / immediate; `sent` main |
| **Routing (7)** | main only; urgent only (damage off); general off + routine; two addresses; same address; invalid urgent settings; partial route failure | `main`; `urgent`; `skipped_disabled`; both copies delivered (support inbox, operator; sandbox, provider log); one `main_and_urgent`; database `23514` + settings-form error, nothing saved; **not run live** (unit-tested) |
| **Returns (12)** | staff outbound (opened a rental); renter: clean instant, all photos instant, failed check, clean daily, damage daily, exception with mode off, photo gap only, missing accessory, does not operate (generator template), damage with photos; staff return with a failed check (closed the rental) | instant exceptions Follow up `sent` main; daily and off `skipped_disabled`; clean with all photos Record only; clean without Additional photos and photo-gap Routine; previews 2/2 (822 and 659 ms), damage slot first; staff return no individual line |
| **Preview** | staging smoke damage and support | `dry_run`, `preview_environment` |

Every provider acceptance was first-attempt, `providerStatus` 200. No `[notifications]` line contained a full
address, a storage path or report content.

---

## 5. Confirmation page (Part D)

Captured automatically on every public damage, support and return confirmation:

- **Truthful wording.** "Sent to {company}" and "{Company} has your report." on all 18 damage/support pages. Never
  "notified", never 911 or emergency wording.
- **Call-now block only on Immediate.** Shown on the five Immediate reports with a fictional 555 number on the QA asset:
  - full-width button (width ratio 1.0);
  - normalized `tel:+16045550100`;
  - label `Call +1 604 555 0100`;
  - block and button in the organization colour.
- **Fallbacks.**
  - Unusable stored phone: contact copy and a `Phone: …` text line, no button.
  - No phone: contact copy, no phone line.
  - Non-immediate reports: "Need help now?".
- **Displayed reference.** Equals the canonical reference of the saved row.
- **Not exercised:** a real tenant brand colour (the QA organization has none; the default colour was verified).

---

## 6. Daily return-exceptions summary (Part E)

**Live (ledger read, `npm run production:notification-config`):**

| Window end (UTC) | QA organization | Northridge demo | Notes |
|---|---|---|---|
| 2026-09-12 13:00 | — (mode `off`) | `skipped_quiet` | first scheduled run |
| **2026-09-13 13:00** | **`sent`, 7 items, provider id recorded, completed 13:07:04 UTC (6:07 AM PDT)** | `skipped_quiet` | QA organization left in `daily_exceptions` by the matrix |
| 2026-09-14 13:00 | `skipped_quiet` (completed 13:07:04 UTC) | `skipped_quiet` | quiet morning, no email |

**What the seven items were.** The matrix expected the same seven, in this order:

- Group 1 (damage / does not operate): `SUB-2026-914E29`, `318F7F`, `04421D`.
- Group 2 (failed checks / accessories): `SUB-2026-95D443`, `847999`, `49E7A7`, and the **Staff** return `3D75E6`.

No window has more than one row per organization across the two UTC deliveries. Vercel's runtime-log view had
already dropped the 13:00 run lines by closeout, so the ledger is the evidence.

**Staging (`digest:staging-check`, fake sender, fixed 2001 timeline):**

- exactly one of the two UTC slots proceeds on a PDT date and on a PST date;
- renter + staff items in `daily_exceptions`, damage / does-not-operate first, then oldest first;
- current status, open count, photo counts, authenticated links, no `<img>` / `cid:` / attachments, stored paths never rendered;
- boundaries: the window start is exclusive, the cutoff inclusive;
- duplicate invocation sends nothing;
- quiet day → `skipped_quiet`;
- `instant_renter` → staff only;
- `off` → excluded, then caught up;
- a failed send is recorded `failed` without advancing the window, and the missed and failed days are caught up;
- 27 returns → 25 listed plus "Showing 25 of 27";
- another organization's return never appears.

**Operator check (Gmail, 2026-09-14).** The delivered summary matched:

- subject `Return exceptions summary - 7 returns with exceptions`;
- first line "7 returns with exceptions since Sat, Sep 12, 6:00 AM Pacific; 6 still open.";
- the organization and the covered period (Pacific);
- the seven items in exactly the expected order, each with its current status: five New, `SUB-2026-49E7A7`
  Reviewed, and the **Staff** return `SUB-2026-3D75E6` Resolved;
- photo counts, one record link per item, the inbox link and the reason line;
- no images.

---

## 7. Email content and clients (Part F)

- **Automated content check**
  (`production:qa-notification-content`) renders each saved QA row with the real projection, routing and builders,
  and asserts:
  - the subject prefix per priority, the asset code, ≤ 78 characters, never "urgent" or "!";
  - the first visible line, priority label, Reported lines, description, return exceptions, and normalized contact links;
  - the record link first, on `https://mulemark.io`;
  - the reference and photo count;
  - the preview structure (one `cid:` per requested preview);
  - text/plain parity and the reason / settings line;
  - no storage path, bucket or signed marker;
  - HTML ≤ 20 KB.
  It passed for every saved row. The only failures were the two clean returns in §12.
- **Direct Outlook/Hotmail delivery (operator, 2026-09-14)**:
  - delivered;
  - the CID preview rendered inline, not as a detached attachment;
  - text and image readable in dark mode;
  - the canonical record link and the complete text were present;
  - no storage path or signed URL.
- **Forwarding limitation.** A Gmail-forwarded copy lost its inline image; direct delivery rendered it. Recorded as a
  forwarding-client limitation, not a delivery failure.
- **Gmail (operator, 2026-09-14).** The support inbox (Google Workspace) received the summary, the tag-request
  emails and the support-inbox copy of `SUB-2026-0D7A41`, all in the Inbox. A delivered message's headers
  (`SUB-2026-657935`, 16:53:45 UTC) show:
  - `spf=pass`, `dkim=pass` for `d=notify.mulemark.io` (aligned with the From domain), `dmarc=pass` (`p=NONE`);
  - TLS 1.3, From `Mulemark <notifications@notify.mulemark.io>`, Reply-To `support@mulemark.io`;
  - in the raw body, the record link unwrapped on `https://mulemark.io` and no tracking image.

  The support inbox sits on the sending organization's own domain, so this is not a first-contact placement result.
- **Not claimed:** universal inbox placement; cold-mailbox placement (no never-allowlisted mailbox was tested).

---

## 8. Tag-request status

- **Setup.** QA tag request `1943f10f-1243-4c4c-a5eb-081c2294ee8c`, with tag updates on during the operator window.
- **What happened.**
  - The request was saved to `delivered` at 2026-09-14 16:08:48 UTC.
  - `delivered_at` was stamped by that same save; `updated_at` is 45 ms later in the same write. Every update stamps
    `updated_at`, so the notes-only save came before it.
- **Operator check (2026-09-14):**
  - the saves to In review and to Delivered each produced one "Tag request updated — {organization}" email (record
    only, reference, view link, reason line);
  - saving notes without changing the status sent nothing.
- **Covered by unit tests:**
  - an email only on a real status change;
  - `delivered_at` stamped only on a real change into `delivered`;
  - the idempotency key per transition.

---

## 9. Reliability and security (Part G)

| Claim | Evidence |
|---|---|
| Saved row is authoritative | `notify.test.ts` (row over schedule); the content check builds from saved rows only |
| Browser cannot choose a recipient | no recipient input; server-side `routing.ts`; unit tests |
| Cross-organization ids fail | `notify.test.ts`; security suite; e2e cross-tenant |
| Staff cannot change routing | security suite; e2e `nav-denial`; D5 invalid-urgent refusal (database + form) |
| Preview never sends | code + unit + live log line (2026-09-13) |
| One logical send per route and recipient | live log line per reference; `main_and_urgent` single send; idempotent duplicate submit schedules nothing (`submit-cleanup.test.ts`) |
| Resend replay (B4 row 8) | **not run live** — needs a direct provider call carrying the API key |
| Email failure never fails a submission | unit and schedule tests; every live submission committed before `after()` |
| Preview failure falls back to text | D4 live (`SUB-2026-D56B0F`) + unit |
| Summary failure never marks success | staging suite + security `digest-runs` test |
| No automatic asset, rental or submission state change | no such writes in `lib/notifications`; staff return closed the rental through its own RPC only |
| No PII or media path in logs | `log.test.ts` + every D5 log line read |

---

## 10. Performance (Part H)

| Measure | Result | Compared with |
|---|---|---|
| Matrix submit → confirmation, no media | 546–1,474 ms; typical 550–680 ms | — |
| Matrix submit → confirmation, with photos | 1,560–2,687 ms (includes the D4.1 direct upload before the form post) | — |
| `perf:action:production --samples=6` (2026-09-14) — no media | POST median **547 ms** (p75 652); click → confirmation median **804 ms** (max 845) | Phase C: POST 575 ms, confirmation 834–949 ms |
| Same — one small image | POST median 389 ms; click → confirmation median 1,605 ms (max 2,173), including the direct upload | Phase C single observation 949 ms predates direct upload — not comparable |
| Preview build (`previewTransformMs`) | 659, 720, 822 ms (2 previews each), `lt_250kb` | D4: 698–1,503 ms |
| Summary run | completed 13:07:04 UTC for one organization; within the 240 s budget and the 300 s `maxDuration` | — |

**Budgets.**

- Public form routes allow `maxDuration` 60 s. The worst case after the response is ≈ 1 s load + 6 s media + 2 × 15 s send ≈ 37 s.
- The cron route allows 300 s.
- The tag owner action uses the platform default.

**Not collected.** Per-phase `[timing]` lines (`notify.load` / `project` / `media` / `send`) are emitted on Production,
but Vercel's dashboard search does not surface them, and the Vercel CLI is not installed. The perf probe wrote 14
damage reports to the QA organization. Its main address had been set back to `support@mulemark.io` by then (§2), so
those reports were emailed to the support inbox. The POST and confirmation timings are unaffected, because sends run
after the response.

---

## 11. As built — enums, semantics, schedule, limits

**Priorities.** `immediate` "Immediate attention" · `follow_up` "Follow up" · `routine` "Routine review" ·
`record` "Record only". Subject prefixes only for the first two.

**Report rules** (first match wins; free text and reported severity never raise priority):

1. support `rollover_safety` → immediate
2. `unsafe_to_operate` → immediate
3. `cannot_be_moved` → immediate
4. need `immediate` → immediate
5. `not_operating` → follow up
6. support `breakdown_no_start` → follow up
7. support `stuck_recovery` → follow up
8. `operating_with_limitations` → follow up
9. need `prompt` → follow up
10. legacy urgency `high` (rows without triage) → follow up
11. otherwise → routine

**Return rules:**

- Any exception → follow up: damage, a failed required check, "does not start / operate" (`starts_operates`, `powers_on`), missing accessories.
- Only photo gaps or failed optional checks → routine.
- Otherwise → record.
- Never immediate.

**Triage values.**

| Field | Values |
|---|---|
| Equipment state | `operating`, `operating_with_limitations`, `not_operating`, `cannot_be_moved`, `unsafe_to_operate`, `not_sure` |
| Response need | `routine`, `prompt`, `immediate`, `not_sure` |
| Damage severity | `minor`, `moderate`, `major`, `not_sure` |
| Issue type | `operating_question`, `breakdown_no_start`, `stuck_recovery`, `rollover_safety`, `other`, `not_sure` |

**Routes.**

- `main`: `notification_email` when that event's switch is on.
- `urgent`: `urgent_notification_email` for Immediate reports when `notify_urgent_reports` is on, independent of the general switch.
- `main_and_urgent`: one send when both addresses match (trimmed, case-insensitive).
- `digest`: the daily summary.

**Return modes.**

- `instant_renter`: every renter return is emailed individually; staff exceptions go to the summary.
- `daily_exceptions`: no individual return email; renter and staff exceptions go to the summary.
- `off`: neither.

Staff returns and outbound inspections never send individually. New organizations default to `off`; damage and
support switches default on, tag updates off, urgent off, previews on.

**Log outcomes.**

| Kind | Values |
|---|---|
| Send | `sent`; `dry_run` (`preview_environment` / `unconfigured`); `skipped_no_recipient`; `skipped_disabled`; `skipped_quiet`; `skipped_duplicate`; `failed_configuration` / `failed_permanent` / `failed_transient` |
| Refusal classes | `record_missing`, `organization_mismatch`, `asset_mismatch`, `form_type_mismatch`, `origin_mismatch`, `asset_missing`, `load_error`, `unsupported_record`, `stale_transition` |
| Summary run | `outside_window`, `completed`, `incomplete` |
| Ledger status | `processing`, `sent`, `skipped_quiet`, `failed` |

**Idempotency.** Every key carries a recipient hash:

- **Submission:** its id, so each recipient gets one email, ever.
- **Tag request:** `<id>:<from>-<to>:<saved-at ms>`.
- **Summary:** organization + window end.

**Schedule and DST.**

- Two Vercel cron entries, 13:00 and 14:00 UTC.
- Only the invocation whose `America/Vancouver` hour is 6 proceeds. DST changes at 2 AM local, so exactly one slot passes on every date.
- The window starts at the organization's last `sent` / `skipped_quiet` end (14-day floor) and ends at today's 6:00 AM Pacific cutoff.
- The window is claimed in the ledger before building; a unique window end turns a duplicate into `skipped_duplicate`.
- A failed or dry-run send records `failed` and leaves the cursor, so it is caught up the next morning.

**Summary limits.** 25 items, 6 exception lines per item, 240 s budget, route `maxDuration` 300 s, bare 401 on any
auth failure.

**`CRON_SECRET` handling:**

- a generated random value, ≥ 32 characters, kept in the password manager;
- set in Vercel for Production only, then redeployed;
- never in `.env.local`, source, a prompt, a ticket or a command argument, and never on Preview;
- verified with `cron:verify-production` outside the 6 AM hour.

Full procedure: `OPERATIONS_RUNBOOK.md`.

**Preview limits:**

- At most 3 per email.
- Inputs: 10 MB and 40 MP each.
- Outputs: ≤ 640 px JPEG (quality 72, retry 55), ≤ 400 KB each, ≤ 1.2 MB total, metadata stripped, never stored.
- Build: 6 s media budget, concurrency 2.
- Candidates are the submission's own `media_urls` under its own prefix, ranked damage first.
- The organization switch turns previews off; clean returns and the summary never carry images.

**Send:** 8 s per attempt, 3 attempts, 15 s total budget, after the response (`after()`).

**Mailboxes.** No new Mulemark mailbox is required. `support@mulemark.io` is the Reply-To and may serve as both main
and urgent address (one send). Testing a distinct route needs only another existing, controlled mailbox or the
Resend sandbox.

---

## 12. Known limitations

- **Escalation reason (D5.1).** An Immediate email can show "Reported response need: Please follow up soon" beside
  "Immediate attention" (escalated by the reported equipment state) without saying which answer escalated it.
- **Summary wording for operating questions.** The line reads "Does not start or operate: Starts / operates?"
  because it repeats the template's question label.
- **Clean renter returns without Additional photos are Routine review.** The submit stores every empty visible photo
  slot — including the optional Additional photos — in `missing_recommended_photo_slots`, which §5.3 maps to Routine.
  Record only is reachable only when every slot has a photo (`SUB-2026-CFBA6D`).
- **`after()` is not a durable queue.** A lost invocation loses the email; the committed row and inbox remain the
  record.
- **Delivery gaps.** Live replay (idempotency) and live provider failure were not run. Cold-mailbox placement is
  unmeasured. DMARC is `p=none`. Resend open/click tracking status is unrecorded.
- **Forwarded copies** may drop inline preview images.
- **Original photos keep their metadata** (including GPS) unless converted on the device by D4.1; this stays so until a
  later media phase changes it. Previews are stripped.
- **Summary evidence.** The DST transition has not yet occurred live (next 2026-11-01). Vercel keeps runtime logs
  briefly, so the ledger is the durable record.
- **Not exercised live:** a custom template (failed optional check), a single return with two exceptions, a real tenant
  brand colour, and a 10 MB preview input.
- **QA harness note.** Clicks that land before a form hydrates are silently lost for automation. The drivers now
  retry; a real renter is unaffected, because the forms render server-side and the no-JavaScript copies exist.

---

## 13. Recurring cost

**None added.** No plan change, no new service, no stored derived images, no queue. The Resend plan is not recorded
in the docs.

---

## 14. Operator actions

**Completed:**

- D3A migration 0034 (2026-09-11).
- D3B `CRON_SECRET` and cron registration (2026-09-11).
- `3fb3364` promotion and 0039 (2026-09-13).
- Direct Outlook/Hotmail verification (2026-09-14).
- Tag-request saves and emails, including a notes-only save that sent nothing (2026-09-14).
- Gmail review with authentication headers, the 2026-09-13 summary email and the support-inbox copy of
  `SUB-2026-0D7A41` (2026-09-14).

**Pending:**

- A recorded decision on first-contact placement: measure a never-allowlisted mailbox, make allowlisting and a test
  report part of onboarding, or both.
- The Resend open/click tracking setting, read from the dashboard and recorded. A delivered raw message showed neither
  applied.
- Whether the QA organization should keep `support@mulemark.io` as its main address (§2).

**QA data left in Production** (test data on the QA organization, kept like every QA run):

- **Records:** 28 D5 matrix submissions (18 reports, 10 renter returns) plus 14 performance-probe damage reports.
- **Rental activity:** one staff outbound inspection and one staff return, which opened and closed a QA rental session.
- **Tag request:** QA tag request `1943f10f…` (delivered).
- **Summary ledger:** rows for 2026-09-13/14.

The QA organization's notification settings and the QA asset are restored.

---

## 15. Follow-ups and next workstream

1. **D5.1 — escalation reason (operator requirement).** Show why a report was escalated — the winning condition —
   clearly, and never state or imply that the submitter requested immediate help. No rule change implied.
   A wording candidate for the same slice: the summary's "Does not start or operate: Starts / operates?" line.
   **Not started.**
2. **Clean-return classification** — decide whether optional photo slots should stop producing routine notes.
3. **Operational hold / out-of-service workflow** — the next-phase candidate (`ROADMAP_DEFERRED.md` #3). **Not started;
   needs its own plan and approval.**

Pilot onboarding remains the recommended business workstream (`roadmap.md`).
