# Abandoned-Upload Cleanup — Runbook (Phase A4; hardened in D4.1)

Browsers upload straight to storage **before** the row that references the object exists: public and staff
submission photos (migration 0037), hosted documents and asset cover images (0038). In-request failures clean up after
themselves — objects that fail verification are deleted, unclaimed objects under a submission are removed after the
row commits, a refused document or cover save removes its upload, and deleting a document or asset removes its file
after the row is gone. `scripts/cleanup-orphan-media.mjs` is the **operator backstop** for what still slips through:
a form abandoned after uploading, a process killed between upload and save, or a best-effort removal that failed
(logged as `document_object_orphaned` / `asset_cover_orphaned`, without the path).

**Invariant:** it deletes only *bytes with no record*. Anything a row references is never touched
(see [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md)).

## What it covers

| Bucket | Managed path | Referenced by | Deletion candidate (≥ 48 h old) | Reported for review only |
|---|---|---|---|---|
| `submissions` | `org/{org}/asset/{asset}/submission/{id}/{file}` | a `form_submissions` row with that id | every object under an id with **no row**, when all of them are old enough | objects under a recorded submission that its `media_urls` do not list |
| `documents` | `org/{org}/asset/{asset}/documents/{id}/{id}.{ext}` | any `documents.storage_path` | an object no row points at | document rows whose file is missing |
| `public-assets` | `org/{org}/asset/{asset}/cover/{uuid}.{ext}` | any `assets.cover_image_url` or `organizations.logo_url` naming it | an object no stored URL names (including covers of deleted assets) | — |
| `public-assets` | `org/{org}/logo/{uuid}.{ext}` | as above | as above | — |
| any | anything else (legacy paths, demo artwork, placeholders) | — | **never** | counted as "outside the managed paths" |

## Safety

- **Report by default.** Nothing is deleted without `--delete` **and** `--confirm=<target>:<count>`, where the count
  is the candidate count the same run finds. If anything changed since the report, the count differs and the run
  refuses. Production also needs `--acknowledge-production-deletion`.
- **Target stated twice.** `--target` (fixed in the npm script) must equal `MULEMARK_TARGET` (from the env file),
  and the Supabase URL must resolve to that target: the staging ref from `STAGING_SUPABASE_REF`, the known production
  ref, or a loopback URL for local. Anything unrecognised is treated as production and refused.
- **Strict arguments.** Unknown or repeated flags, and numbers that are not plain whole numbers, stop the run —
  no silent defaults. The age floor is 48 hours on staging and production (signed upload URLs last 2 hours and saves
  refuse objects older than 24 hours); only `local` may go lower.
- **Bounded.** At most `--max-delete` objects per run (default 50, hard cap 200), oldest first.
- **Re-checked.** Immediately before each removal the tool asks the database again whether anything references the
  object; one that became referenced is skipped, and a re-check that errors stops the run. Objects are removed one at
  a time through the Storage API with a per-object result.
- **Quiet output.** Counts and bytes by kind and organization. Object paths appear only with `--verbose`. Keys and
  signed URLs are never printed.
- **Never scheduled.** It is a manual operator tool; there is no cron or automatic deletion.

## Who runs it

The **platform operator** only. It needs the service-role key and is a CLI script, not a route — customer roles cannot
reach it.

## How to run

Staging (`.env.staging.local` carries the URL, key, `STAGING_SUPABASE_REF` and `MULEMARK_TARGET=staging`):

```bash
npm run cleanup:orphans:staging
npm run cleanup:orphans:staging -- --verbose
npm run cleanup:orphans:staging -- --delete --confirm=staging:12
```

Production (`.env.local` carries the URL and key; the untracked `.env.production-ops.local` holds only
`MULEMARK_TARGET=production`):

```bash
npm run cleanup:orphans:production
```

Deleting on production is a separate, explicitly approved step: review the report, then re-run with
`--delete --confirm=production:<count> --acknowledge-production-deletion`. D4.1 ran reports only.

Flags: `--older-than-hours=N` (≥ 48 hosted), `--max-delete=N` (1–200), `--verbose`, `--delete`,
`--confirm=<target>:<count>`, `--acknowledge-production-deletion`. Exit codes: 0 done, 1 stopped or a removal failed,
2 refused (arguments, target or confirmation).

## Reading the report

- **candidates** — what a deleting run would consider, by kind (`submission`, `document`, `cover`, `logo`) and by
  organization.
- **kept** — referenced objects, objects newer than the threshold (or with no known age), and objects outside the
  managed paths.
- **for review** — never deleted. Extra objects under a recorded submission, or document rows whose file is missing,
  point at a failed in-request cleanup or a manual storage change; look at them with `--verbose` before acting.

## Local smoke test

Against the local stack (`npx supabase start`), with the local URL and service-role key exported and
`MULEMARK_TARGET=local`:

1. Upload an object with the service role to an unreferenced managed path, e.g.
   `org/<uuid>/asset/<uuid>/documents/<id>/<id>.pdf` in `documents`.
2. `node scripts/cleanup-orphan-media.mjs --target=local --older-than-hours=0 --verbose` → it is a candidate.
3. Insert a `documents` row with that `storage_path` → re-run → it is kept (record wins).
4. Delete the row, then re-run with `--delete --confirm=local:<count>` → the object is removed.

Unit tests: `scripts/lib/orphan-media.test.mjs` (arguments, target, grammars checked against the application's path
rules, planning, confirmation, re-check and stop rules).
