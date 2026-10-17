# Demo recovery runbook — Northridge archive, restore, reset and QA isolation

**Phase E1** (2026-10-16/17). This runbook covers:
- how the Northridge showcase is archived, verified, restored and reset safely;
- how QA is kept away from it;
- the exact E2C cutover and rollback checklists.

E1 **did not** reset, delete or rewrite anything in Production. It ran no migrations and sent no email.

| Section | |
|---|---|
| [1. Custody](#1-custody) | Where archives live, who owns them, retention, second copy |
| [2. Tools](#2-tools) | Commands |
| [3. Export and verify](#3-export-and-verify) | Producing a recovery package |
| [4. Restore](#4-restore-two-local-targets-split-by-data) | Two loopback targets, split by data |
| [5. Reset planner](#5-reset-planner) | Manifests, dry runs, the guarded transaction |
| [6. Seed-notification suppression](#6-seed-notification-suppression) | Why seeded rows cannot email anyone |
| [7. QA isolation](#7-qa-isolation) | Guards that keep QA off the curated demo |
| [8. E2C cutover checklist](#8-e2c-cutover-checklist) | Exact steps |
| [9. E2C rollback checklist](#9-e2c-rollback-checklist) | Exact steps |
| [10. E1 rehearsal record](#10-e1-rehearsal-record) | What was proven, with hashes |

## 1. Custody

| | |
|---|---|
| **Owner** | The operator |
| **Location** | `%USERPROFILE%\Mulemark-Ops-Archive\` on the operator's workstation (the exporter's default) — a local folder in the operator's Windows profile, outside the repository and outside every OneDrive folder. Documents and Desktop on this machine sync to an employer's OneDrive, so the exporter refuses any path under them, inside the repository, on a network share, or relative. |
| **Access** | The operator's Windows account only. Never in a web-accessible bucket, never in Git, never on a synced drive. |
| **Contents** | Full rows, including personal data such as renter names, phone numbers and visitor submissions. There is no data minimization: an exact restore needs the exact rows. |
| **Retention** | Until Phase E closes (E5C) **and** the operator makes an explicit retention decision. Never auto-deleted. The Storage objects under `org/11111111-…/` carry a **retention hold** (`docs/phase-e/manifests/northridge-archive-boundary.json#retention`): `cleanup-orphan-media` never selects them while the hold is on, and only the operator releases it. |
| **Second copy** | A verified copy on separate media is a **precondition of any E2C approval**: copy the package folder, then run `npm.cmd run phase-e:archive:verify -- --path=<copy>` on the copy. Not required for E1. |
| **What Git holds** | Only redacted summaries in `docs/phase-e/archives/`: counts, check results and the manifest SHA-256. No paths, names, addresses or per-file hashes. Restore rehearsals are appended to the same summary. |

**Purging a package** (after the retention decision): delete its folder from every copy. Nothing else references it except the summary in Git, which stays as the record.

## 2. Tools

| Command | Does | Writes to |
|---|---|---|
| `npm.cmd run phase-e:graph:local [-- --check]` | Derives the tenant dependency graph from the **local** catalog → `docs/phase-e/manifests/tenant-dependency-graph.json` | Repo (graph only) |
| `npm.cmd run phase-e:archive:{production,staging} -- --org=<fixture id> [--root=<abs>]` | Read-only export of one fixture organization | Archive folder + a tracked summary |
| `npm.cmd run phase-e:archive:verify -- --path=<abs package>` | Offline re-hash of a package | — |
| `npm.cmd run phase-e:restore -- stack --archive=<abs> [--replace-local] [--fail-after=<table>]` | Restores into the repo's local Supabase stack (synthetic and staging packages only) | Local stack |
| `npm.cmd run phase-e:restore -- standalone-up \| standalone … \| standalone-down` | The loopback-only, in-memory container for real packages | Container (tmpfs) |
| `npm.cmd run phase-e:reset:{production,staging,local,standalone} -- manifest\|plan\|apply …` | Guarded reset: manifests, dry runs, loopback-only apply | Archive folder (+ a tracked plan summary for hosted targets) |
| `npm.cmd run phase-e:health:production [-- --host=qr-asset-tags.vercel.app]` | Scan-free `/nojs/t/` checks of the protected routes | — |
| `npm.cmd run test:phase-e-local` | Resets the local database, then rehearses all of the above on **synthetic** data | Local stack |

**Read-only by construction.** The exporter and the reset planner read hosted projects through `scripts/lib/tenant-snapshot.mjs`. That wrapper exposes only `select`, Storage `list` and Storage `download`, and a unit test scans both files for any write call.

**Target checks before any read.** Each target is resolved by project ref (`scripts/lib/env-target.mjs`), and the organization must be an allowlisted fixture. The target's live PostgREST schema must match the tracked graph **both ways**: an unknown table or column stops the run.

## 3. Export and verify

**When:** never between 13:00 and 15:00 UTC. The daily digest writes ledger rows in those slots, and the exporter refuses to run then.

```
npm.cmd run phase-e:archive:production -- --org=11111111-1111-4111-8111-111111111111
npm.cmd run phase-e:archive:verify -- --path=%USERPROFILE%\Mulemark-Ops-Archive\<archive id>
```

**What a package holds** (`scripts/lib/showcase-archive.mjs` describes the layout):
- `rows/<table>.json`: every row of every tenant table, verbatim as PostgREST returns it;
- `identity.json`: profiles the rows reference from outside the tenant (the platform owner), as identity references only. `auth.users` is never copied.
- `objects/<sha256>`: the **original** Storage bytes, never recompressed, plus `objects.json` with bucket, path, MIME type, size, cache-control, eTag and timestamps;
- `references.json`: every Storage reference found by walking every string in every row, including nested `submission_data_json` photo paths and cover and logo URLs, each with present or missing status;
- `routes.json`: every QR row with its protected flag and row hash;
- `SHA256SUMS` and `manifest.json`.

**Checks during export:**
- `scan_events` are read up to the start instant T0.
- Every other table is read **again** at the end; any difference means a concurrent write, and the package is left `.partial` with an `INCOHERENT` marker.
- Each download's MD5 is checked against its Storage eTag.
- An object under the organization prefix whose path follows no managed grammar stops the run.
- So does a reference into another organization or another Supabase project.

**Atomic write:** the package is written as `<id>.partial` and renamed only after `SHA256SUMS` and `manifest.json` exist.

**Offline verify:** checks the manifest is complete, `SHA256SUMS` matches the manifest, every listed file matches its hash, there is no unlisted file, every object is named by its own hash, and every rows file matches its per-table hash.

**Dangling references:** the 7 known missing submission photos found in E0 are recorded in `missing_references`, never "repaired".

## 4. Restore: two local targets, split by data

Docker Desktop on this machine publishes the Supabase CLI's containers on **all interfaces**. It ignored both the daemon's `"ip": "127.0.0.1"` and a pre-created network's `host_binding_ipv4`, and that was verified with `docker port` and `Get-NetTCPConnection`. The operator therefore chose **split by data**:

| Target | Receives | Binding |
|---|---|---|
| **Stack** (`supabase start`) | Synthetic fixtures and staging-QA packages only. **A Production package is refused.** | All interfaces (Docker Desktop) |
| **Standalone** container `mulemark-phase-e-restore` (cached image `public.ecr.aws/supabase/postgres:17.6.1.155`) | The only place a real package is restored | Explicit `127.0.0.1:55432`, data on tmpfs, no volume, removed on stop |

**Standalone procedure:**
1. `npm.cmd run phase-e:restore -- standalone-up`. The tool:
   - starts the container;
   - refuses if Docker published anything but `127.0.0.1`;
   - checks Windows listeners on 55432 (every one must be loopback, at least one must exist);
   - loads the `public` schema from the local stack (structure only, synthetic database).
   Any failure stops the container.
2. Re-check independently:
   - `docker inspect mulemark-phase-e-restore --format "{{json .HostConfig.PortBindings}}"` must show `HostIp 127.0.0.1` only;
   - `Get-NetTCPConnection -State Listen -LocalPort 55432` must show a single `127.0.0.1` listener.
3. `npm.cmd run phase-e:restore -- standalone --archive=<abs package>`.
4. Read the report (`<package>\restore-reports\…json`, also appended to the tracked summary).
5. `npm.cmd run phase-e:restore -- standalone-down`. The tmpfs data is gone, and the tool reports 0 listeners left.

**One transaction:**
1. An existing local copy of the organization is deleted with triggers **on**, so cascades fire.
2. `SET LOCAL session_replication_role = replica`; this is the only way to reproduce QR lineage, staff origins and session bindings that triggers would otherwise rewrite.
3. Every table is inserted with `jsonb_populate_recordset` in graph order.

**Checks before COMMIT:**
- 80 integrity checks:
  - every foreign key resolves;
  - no reference into another tenant (shared rows such as the platform-owner profile are allowed);
  - no other tenant references these rows;
- active-pointer consistency equal to the source;
- every table's `to_jsonb` row hashes, in UTC, equal to the package.

**After commit:**
- every route's anonymous resolution is re-run as `anon` with exactly the columns `lib/public/resolve.ts` reads;
- objects are re-uploaded and re-hashed (stack), or hash-verified from the package (standalone);
- the 7 dangling references must still be missing.

**Restore safety switches:**
- `--replace-local` is needed when the target already holds the organization.
- `--fail-after=<table>` aborts mid-transaction to prove the rollback.
- A package taken under a different schema graph is refused: restore into a database reset to the package's migrations, then migrate forward.
- Local identities are recreated with the archived `auth_user_id`, `<profile id>@restore.invalid` addresses and a local throwaway password.
- Bucket rules are widened only for an object that today's rules would refuse, then reverted and compared with the migration values.

## 5. Reset planner

`scripts/lib/showcase-reset.mjs` (pure) and `scripts/phase-e/showcase-reset.mjs` (CLI).

**One organization:** Northridge, by exact id. There is no wildcard and no public endpoint.

**Manifests:** a named manifest holds:
- the rows it expects (id → row hash, from a snapshot);
- the rows it wants afterwards (full rows per table);
- the protected QR rows and assets;
- the digest watermark it saw.

Kinds:
- `noop`: wants the snapshot itself.
- `draft-e2c`: the approved boundary's relational shape without E2A/E2B content. It closes open sessions (`cancelled`, pointers cleared), removes the access-restricted submissions and acknowledgements, and makes hosted documents of unknown rights private.
- `restore`: an archive's rows plus every later row that the cutover did not insert.

Manifests contain row data, so they live in the archive folder.

**Dry run** (`plan`, any target): reports KEEP / UPDATE / INSERT / DELETE per table, or refuses. It writes the full plan and the reviewable SQL beside the manifest. For hosted targets it also writes a counts-only summary to `docs/phase-e/archives/<name>.plan.json`.

**Refusals:**

| Code | When |
|---|---|
| `drift-*` | A live row that is neither the row the manifest saw nor already the row it wants; a row it relies on is gone; the digest watermark moved backwards (ledger history missing) |
| `frozen` | Any write to `qr_links` (published destinations) or `profiles` |
| `append-only` | A manifest that lists `scan_events` or the digest ledger. Their new rows are legitimate; a reset never writes them. |
| `protected` | Deleting a protected asset or its page; changing its code, public status or archive state; unpublishing its page; a protected row missing on **Production** (rehearsal targets hold only the rows their data has) |
| `locked` | Organization status, plan, export or notification-routing columns (trigger-protected or seed-unsafe) |
| `integrity` / `cross-org` | A dangling or cross-tenant reference; a delete whose CASCADE / SET NULL / RESTRICT effect reaches a kept row; a new active-session or pointer inconsistency; a new duplicate staff return or outbound per session; an edit of a published inspection template |
| `watermark` | An inserted or changed return checklist dated after the digest watermark ([§6](#6-seed-notification-suppression)) |

**Apply** is loopback only in E1: the local stack or the standalone container. The tool refuses `apply` on staging or Production before connecting. Everything happens in one transaction with **triggers on and foreign keys enforced**:
1. Lock the organization row (`FOR UPDATE`). Every new row that references Northridge waits for the transaction; **no other tenant is affected**.
2. Lock the in-scope rows.
3. Plan on the locked rows; a refusal rolls back.
4. Run the emitted guards: id-set hashes per table, append-only rows still present, watermark not moved backwards.
5. Writes, in this order:
   - clear changing asset pointers;
   - close sessions that leave `active`;
   - delete children first;
   - insert parents first, inserting submissions *unbound* as public damage reports (the insert trigger, M0028, would otherwise rebind them to the asset's current session and rewrite origin and actor);
   - update, including the exact correction of those submissions; there is no UPDATE trigger on submissions;
   - set new pointers.
   Every statement checks its row count.
6. Post-checks:
   - the 80 integrity checks;
   - protected QR rows byte-equal to the start of the transaction;
   - protected asset fields and pages unchanged;
   - final counts;
   - no new pointer inconsistency.
7. Commit.

`updated_at` is the database's: it is never compared and never written by an update.

**Staged files:** objects are uploaded before the relational transaction, and only if missing. Staging never overwrites and never deletes; old blobs stay until the retention decision.

**Convergence:** after commit the tool re-plans from a fresh snapshot, and the result must be all KEEP. Rerunning an applied manifest is a no-op (0 statements). It never duplicates history or rotates codes.

`--fail-at=writes|postchecks` (loopback only) aborts before commit to prove the rollback.

## 6. Seed-notification suppression

**Immediate email** comes only from application code paths, never from the database:
- public damage, support and return forms (`lib/forms/submit.ts`);
- staff inspections (`lib/inspections/submit.ts`);
- the owner's tag-request status changes.
Each runs after its own insert, through `after()` (`lib/notifications/schedule.ts`). There are no database webhooks or triggers that send mail in the repository's migrations, there is no renter-copy email, and the app only ever mails organization addresses. A reset writes rows directly in one SQL transaction, so none of those paths runs.

**The daily digest** (`lib/notifications/digest-worker.ts`):
- runs in the 6 AM `America/Vancouver` hour;
- summarizes return checklists with exceptions created in (W, cutoff], where W is the latest sent or skipped `window_end` (clamped to 14 days);
- under `instant_renter` (Northridge's mode) covers staff returns only; under `daily_exceptions`, public and staff returns.

Turning the mode off or removing the provider only *delays* a backlog, so neither is a suppression.

**The rule the planner enforces:**
- Every inserted or changed return checklist, of any origin, must be dated **at or before** the start of the window that the next possible digest run will cover (`seedWatermark`, a mirror of `lib/notifications/digest-window.ts`, parity-tested).
- Window starts never move backwards while the ledger is untouched, and a reset never writes the ledger. So such a row is never summarized, neither by the next run nor by any later one.

What the reset does **not** do:
- disable cron;
- disable Production email;
- write fake `sent` ledger rows;
- delete ledger rows.

**Evidence** (`test:phase-e-local`, the real worker with a fake sender):
- a seeded staff return dated before W was **excluded**;
- a later staff control return was **included**;
- a public control return was **excluded** under `instant_renter`;
- the ledger window started exactly at W.

**Operator live checks before E2B and E2C** (not visible from the repository):
1. In the SQL editor, read-only:
   - `select extname from pg_extension`: look for `pg_net`/`http`;
   - `select tgrelid::regclass, tgname from pg_trigger where not tgisinternal`: look for anything beyond the migrations;
   - check for `supabase_functions` or `net` schemas.
2. In the dashboard: Database Webhooks, Auth Hooks, Edge Functions.
3. In Vercel: confirm the two digest crons are the only scheduled jobs.

**Live demo submissions after the cutover** are told apart by being absent from the cutover manifest and dated after the cutover. They notify the organization's own address (`support@mulemark.io`, owner-controlled). No invented renter address is ever emailed, because the app has no renter email path.

## 7. QA isolation

| Guard | Where |
|---|---|
| Per-target QA registries (staging QA orgs A and B and the A6.3 org; Production `prod-qa-perf-probe` and its org); every Northridge code, org and asset is refused on **every** target, and so is any `demo-` code | `scripts/lib/qa-targets.mjs` (`assertQaRunnerTarget`) |
| Staging writers first resolve the staging-only probe through the scan-free `/nojs/t/stg-only-isolation-probe`, and check it again at the end | `scripts/lib/staging-probe.mjs` (`assertStagingBackend`) |
| `qr-asset-tags.vercel.app` is classified as Production; it serves Production | `scripts/lib/smoke-target.mjs` |
| Every operator script that scans or writes imports a guard, or is on an explicit exemption list with its reason | `scripts/lib/qa-guard-coverage.test.mjs` |
| Orphan cleanup never selects Northridge objects while the retention hold is on | `scripts/lib/orphan-media.mjs` |
| E2E servers run with `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` and `CRON_SECRET` empty and loopback Supabase/site URLs (asserted before the build); a reused server must resolve a fixture-only code | `scripts/e2e/assert-safe-env.mjs`, `tests/e2e/global-setup.ts` |
| A dedicated QA login cannot read or change Northridge; the restored Northridge admin sees Northridge only | `tests/phase-e-local/rehearsal.local.test.ts` |

Staging Northridge is reserved for the E2B rehearsal. The read-only health check (`phase-e:health:production`) is separate from QA runners and permitted.

## 8. E2C cutover checklist

**Preconditions.** All must be true before asking for the Production approval:
- [ ] E2A content approved, E2B dataset rehearsed on staging, business-card evidence verified, printed-sheet answers received, owner-only QR-disable guard migrated ([PHASE_E_PLAN.md](PHASE_E_PLAN.md)).
- [ ] The E2C manifest builder exists, and its dry run against Production is **ACCEPTED**: `npm.cmd run phase-e:reset:production -- plan --manifest=<file>`. The counts are recorded and the emitted SQL has been reviewed.
- [ ] The execution mode is decided and approved: one SQL transaction in the SQL editor, or through the database URL. E1's `apply` refuses hosted targets, so E2C adds that path under its own approval.
- [ ] The operator live checks in [§6](#6-seed-notification-suppression) are done and recorded.
- [ ] A separate Production approval names the exact ids, taken from the plan file.
- [ ] The time is outside 13:00–15:00 UTC.

**Window.** Demo-only; no other tenant is touched.
1. Baseline: `npm.cmd run phase-e:health:production` must show 5/5.
2. In the owner UI, **suspend Northridge**. Its public pages and forms show the honest "This page isn't available" notice, and a visitor who submits gets that message: nothing is half-written and nothing is silently lost. Its users lose access. Nothing is deleted, and other tenants are unaffected. The reset never changes `status` (it is a locked column).
3. Take a **fresh archive**, because the schema may have changed since E1:
   - `npm.cmd run phase-e:archive:production -- --org=11111111-1111-4111-8111-111111111111`;
   - `npm.cmd run phase-e:archive:verify -- --path=<new package>`;
   - copy the package to separate media;
   - verify the copy.
4. **Final delta check:**
   - build the cutover manifest from the suspended snapshot;
   - run `plan`; it must be ACCEPTED, with counts identical to the approved plan;
   - on any difference, stop, reactivate and re-approve.
5. Stage the new content files before the relational commit. Never delete old blobs.
6. Apply in the approved mode: one transaction with triggers on, the emitted guards, writes and post-checks.
7. Verify:
   - build a fresh `noop` manifest and `plan` it: all KEEP;
   - the 12 QR rows are byte-equal to the fresh archive's `rows/qr_links.json`;
   - the protected asset fields are unchanged.
8. In the owner UI, **reactivate Northridge**.
9. Run `npm.cmd run phase-e:health:production` (5/5) and with `--host=qr-asset-tags.vercel.app`, then `npm.cmd run phase-e:audit:production -- --org=11111111-1111-4111-8111-111111111111`.
10. Record in `WORK_LOG.md`:
    - archive id and manifest SHA-256;
    - cutover manifest SHA-256;
    - plan summary;
    - apply report;
    - health output.

## 9. E2C rollback checklist

A rollback restores the archive's rows for everything the cutover changed and keeps later interactions: visitor reports, scans and the digest ledger. Admin edits made after the cutover to rows the rollback restores are reverted to the archive's values.

1. In the owner UI, **suspend Northridge**.
2. Build the rollback manifest:
   ```
   npm.cmd run phase-e:reset:production -- manifest --kind=restore --org=11111111-1111-4111-8111-111111111111 --archive=<pre-cutover package> --cutover=<cutover manifest> --out=<abs file>
   ```
   The organization's locked columns keep their live values, so the archive may predate the suspension.
3. `plan` must be ACCEPTED. A refusal means a kept post-cutover row depends on something the rollback would remove, and that is an operator decision.
4. Stage missing objects. The manifest lists every archived object; staging uploads only missing ones and never overwrites.
5. Apply in the approved mode.
6. Verify with a fresh `noop` plan (all KEEP) and QR byte-equality with the archive.
7. Reactivate Northridge, run the health check and the audit, and record.

## 10. E1 rehearsal record

**Local, synthetic.** `npm.cmd run test:phase-e-local` passes 34/34 against a fictional Northridge built on the local seed. The fixture includes:
- the asset↔session cycle;
- a disabled, superseded QR row;
- staff, public and pre-use rows bound to sessions;
- a v2 template snapshot with photo paths;
- a digest ledger;
- a platform-owner reference;
- 7 objects across 3 buckets, one of them outside today's MIME rules;
- 2 dangling references.

What it proves:
- the export matches the database row for row;
- an exact restore that undoes later writes, with the out-of-rules bucket widening reverted;
- `--fail-after` rollback, and a converging repeat restore;
- refusals of:
  - tampered, incomplete, interrupted and wrong-graph packages;
  - a Production package into the stack;
  - a wrong organization or project;
  - an unknown Storage path;
  - an unknown table;
- the standalone path;
- isolation: the restored admin and a QA login;
- public routing;
- the guarded reset:
  - no-op;
  - draft with `--fail-at`, apply and a no-op rerun;
  - a seeded cutover with a second active session and outbound, with nothing colliding;
  - refusals of a late return, a protected change, a QR change and drift;
- the digest proof;
- a rollback that re-stages a missing object and keeps a later visitor report.

**Staging** (2026-10-17):
- QA org A: 35 objects, 91 MB, 2 missing references.
- Staging Northridge: exported, verified and restored into the local stack.
- Planner dry runs ACCEPTED: the no-op is all KEEP, and the draft deletes the single submission.

**Production** (2026-10-17, reads only):

| Step | Result |
|---|---|
| Drift audit | Reconciled with the boundary manifest |
| Export | Verified package `northridge-production-20261017T003411Z`, manifest `b1c78168…0cff5` |
| Standalone restore | Verified |
| Draft E2C on the real data | 13 statements; converged |
| Rollback to the archive | 45 statements; converged |
| Production dry runs | Accepted |
| QR rows | Byte-equal |
| Health check | 5/5 |

Details and hashes are in [WORK_LOG.md](WORK_LOG.md#e1--recoverable-archive-qa-isolation-and-reset-rehearsal-2026-10-1617).
