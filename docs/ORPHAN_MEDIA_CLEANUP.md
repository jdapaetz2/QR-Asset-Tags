# Orphan Media Cleanup — Runbook (Phase A4)

Public submission photos are uploaded to the private `submissions` bucket **before** the
`form_submissions` row is written. Phase A4 cleans up in-request failures automatically
(`lib/forms/cleanup.ts` — the upload core deletes its own objects on any insert/upload failure). This
tool is the **operator backstop** for anything that still slips through (e.g. a process killed between
upload and insert): submission objects whose owning row never materialized.

**Invariant it honors:** it deletes only *bytes with no record*. A submission that has a
`form_submissions` row is never touched, so the timeline/record is never lost
(see [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md)).

## What it does

`scripts/cleanup-orphan-media.mjs` walks the `submissions` bucket, and for every path matching the exact
convention `org/{uuid}/asset/{uuid}/submission/{uuid}/…`:

1. Reads the submission id from the path.
2. Skips it if a `form_submissions` row with that id exists.
3. Skips it if the newest object is younger than the age threshold (avoids racing an in-flight upload).
4. Reports (dry-run) or deletes (with explicit flags) the remaining orphans, in bounded batches.

It **never** deletes a non-conforming path, never wipes a bucket broadly, and prints **raw storage paths
only — never signed URLs**.

## Who runs it

The **platform operator** only. It requires `SUPABASE_SERVICE_ROLE_KEY` and is a CLI script, not a route —
customer roles (admin/staff) cannot reach it.

## How to run

Requires env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the value is never printed).

```bash
# 1) Dry-run first (DEFAULT) — reports candidates, deletes nothing.
node scripts/cleanup-orphan-media.mjs

# 2) Widen/narrow the age threshold (default 48h).
node scripts/cleanup-orphan-media.mjs --older-than-hours=72

# 3) Review the printed ORPHAN paths. When satisfied, delete (bounded by --limit, default 500):
node scripts/cleanup-orphan-media.mjs --delete --yes

# 4) If the run reports "more remain", repeat until clean.
node scripts/cleanup-orphan-media.mjs --delete --yes --limit=500
```

Flags: `--delete` + `--yes` (both required to delete), `--older-than-hours=N`, `--limit=N`.

## Local smoke test

Against the local Supabase stack (`npx supabase start`):

1. Upload an object under a fake orphan prefix using the service role, with no matching `form_submissions`
   row, e.g. `org/<uuid>/asset/<uuid>/submission/<uuid>/x.png`.
2. `node scripts/cleanup-orphan-media.mjs --older-than-hours=0` → it lists the orphan path.
3. Insert a `form_submissions` row with that submission id → re-run → it is no longer listed (record wins).
4. Delete the row, then `--delete --yes --older-than-hours=0` → the object is removed.

## Scheduling

A **manual pilot-scale tool is intentional** — no scheduler. The in-request cleanup handles the common case;
this is for rare residue. The `rate_limit_gc()` housekeeping function (migration 0033) similarly needs no
scheduler because `rate_limit_touch` self-prunes per key.
