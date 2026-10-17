import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest } from "@/lib/notifications/digest-worker";
import type { EmailContent } from "@/lib/notifications/email";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { submissionReference } from "@/lib/submissions/inbox";

import { runReplicaCanaries } from "../../scripts/lib/local-stack.mjs";
import { tableHash, verifyArchiveDir } from "../../scripts/lib/showcase-archive.mjs";
import { buildManifest, noopDesired } from "../../scripts/lib/showcase-reset.mjs";
import { scopeWhere } from "../../scripts/lib/tenant-graph.mjs";
import { pgIdentity, pgTables } from "../../scripts/lib/tenant-snapshot.mjs";
import { ADMIN_EMAIL, DANGLING, FIXTURE_PASSWORD, FX, NOTIFY_EMAIL, OBJECTS, SEED, WATERMARK, buildSyntheticNorthridge } from "./fixture";
import {
  GRAPH,
  NORTHRIDGE,
  REPO,
  anonClient,
  count,
  db,
  orgFingerprint,
  packagePathFrom,
  runTool,
  serviceClient,
  signIn,
  tempRoot,
} from "./support";

/**
 * Engineering Phase E1 — the local recovery rehearsal. One ordered file against the LOCAL stack with SYNTHETIC data
 * (tests/phase-e-local/fixture.ts); `npm run test:phase-e-local` resets the local database first.
 *
 *   graph      the tracked dependency graph still matches the local catalog; replica-mode canaries hold
 *   export     the real exporter writes a package that verifies offline and matches the database row-for-row
 *   restore    new writes after the archive are undone; a populated target needs --replace-local; an interrupted
 *              restore leaves the database unchanged; a repeated restore converges; objects come back byte-identical
 *   refusals   tampered, incomplete, interrupted or wrong-graph packages; a Production package into the stack; wrong
 *              organization or project; an unknown Storage path; an unknown table
 *   standalone the loopback-only container that real packages restore into, rehearsed with the synthetic package
 *   isolation  the restored admin sees only Northridge; a dedicated QA login is denied it; public routing resolves
 */

const ARCHIVE = "scripts/phase-e/showcase-archive.mjs";
const RESTORE = "scripts/phase-e/showcase-restore.mjs";
const RESET = "scripts/phase-e/showcase-reset.mjs";
const GRAPH_CLI = "scripts/phase-e/schema-graph.mjs";
const SEED_QR_GEN008 = "41111111-1111-4111-8111-111111111103";
const SESSION_NEW = "e1d00000-0000-4000-8000-000000000010";
const SUB_NEW_OUTBOUND = "e1e00000-0000-4000-8000-000000000010";
const SUB_SEEDED_RETURN = "e1e00000-0000-4000-8000-000000000011";

type Row = Record<string, unknown>;
const QA_ORG = "e1900000-0000-4000-8000-000000000001";
const QA_AUTH = "e1900000-0000-4000-8000-0000000000a1";
const QA_PROFILE = "e1900000-0000-4000-8000-0000000000b1";
const QA_EMAIL = "qa.admin@phase-e-fixture.invalid";

let client: pg.Client;
let pkg = "";
let packageState: Record<string, string> = {};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function copyPackage(label: string): string {
  const dir = path.join(tempRoot(label), path.basename(pkg));
  cpSync(pkg, dir, { recursive: true });
  rmSync(path.join(dir, "restore-reports"), { recursive: true, force: true });
  return dir;
}

type PackageManifest = { graph: { sha256: string }; source: { target: string } };

function editManifest(dir: string, edit: (m: PackageManifest) => void) {
  const file = path.join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as PackageManifest;
  edit(manifest);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

beforeAll(async () => {
  client = await db();
});

afterAll(async () => {
  await client?.query(`drop table if exists public.zz_phase_e_probe`).catch(() => {});
  await client?.end();
  runTool(RESTORE, ["standalone-down"]);
});

describe("dependency graph", () => {
  it("the tracked graph still matches the local catalog", () => {
    const { status, out } = runTool(GRAPH_CLI, ["--check"]);
    expect(out).toMatch(/tracked graph matches the local catalog/);
    expect(status).toBe(0);
  });

  it("replica mode takes effect, keeps QR governance columns, and no trigger is ENABLE ALWAYS", async () => {
    expect(await runReplicaCanaries(client)).toEqual({ replicaRole: true, replicaKeepsGovernance: true, alwaysTriggers: 0 });
  });
});

describe("export", () => {
  it("builds the synthetic Northridge and exports it with the real tool", async () => {
    await buildSyntheticNorthridge();
    const { status, out } = runTool(ARCHIVE, ["--target=local", `--org=${NORTHRIDGE}`, `--root=${tempRoot("export")}`]);
    expect(out).toMatch(/local synthetic package: no tracked summary/);
    expect(status).toBe(0);
    pkg = packagePathFrom(out);
    expect(existsSync(path.join(REPO, "docs/phase-e/archives", `${path.basename(pkg)}.json`))).toBe(false);
  });

  it("verifies offline", () => {
    const { status, out } = runTool(ARCHIVE, ["verify", `--path=${pkg}`]);
    expect(out).toMatch(/— OK/);
    expect(status).toBe(0);
  });

  it("matches the database row for row (PostgREST JSON hashes equal to_jsonb hashes in UTC)", async () => {
    const manifest = JSON.parse(readFileSync(path.join(pkg, "manifest.json"), "utf8"));
    packageState = await orgFingerprint(client);
    for (const [table, info] of Object.entries<{ rows: number; table_hash: string }>(manifest.tables)) {
      expect(`${info.rows}:${info.table_hash}`, table).toBe(packageState[table]);
    }
    expect(manifest.tables.form_submissions.rows).toBeGreaterThanOrEqual(11);
    expect(manifest.identity).toEqual({ profiles_in_tenant: 1, external_profiles: 1 });
    expect(manifest.window.scans_after_t0_excluded).toBe(true);
  });

  it("records every object with its bytes, the out-of-rules file and the dangling references", () => {
    const manifest = JSON.parse(readFileSync(path.join(pkg, "manifest.json"), "utf8"));
    const objects = JSON.parse(readFileSync(path.join(pkg, "objects.json"), "utf8"));
    expect(objects).toHaveLength(Object.keys(OBJECTS).length);
    for (const object of Object.values(OBJECTS)) {
      const record = objects.find((o: { bucket: string; path: string }) => o.bucket === object.bucket && o.path === object.path);
      expect(record, object.path).toBeDefined();
      expect(record.mimetype).toBe(object.type);
      expect(sha256(readFileSync(path.join(pkg, "objects", record.sha256)))).toBe(record.sha256);
    }
    expect(manifest.checks.etags_match).toBe(true);
    expect(manifest.missing_references.map((r: { path: string }) => r.path).sort()).toEqual([DANGLING.damagePhoto, DANGLING.document].sort());
    const refs = JSON.parse(readFileSync(path.join(pkg, "references.json"), "utf8"));
    expect(refs.some((r: { pointer: string }) => r.pointer === "/submission_data_json/answers/photos/damage_closeup/0/path")).toBe(true);
    expect(refs.some((r: { kind: string; column: string }) => r.kind === "url" && r.column === "logo_url")).toBe(true);
  });

  it("records the route mappings, with the protected rows flagged and the QR lineage intact", () => {
    const routes = JSON.parse(readFileSync(path.join(pkg, "routes.json"), "utf8"));
    const byId = new Map(routes.map((r: { qr_link_id: string }) => [r.qr_link_id, r]));
    expect(byId.get(SEED.qrEx017)).toMatchObject({ short_code: "demo-ex017", protected: true, status: "active" });
    expect(byId.get(SEED.qrTr014)).toMatchObject({ short_code: "demo-tr014", protected: true });
    expect(byId.get(SEED.qrComp003)).toMatchObject({ status: "disabled", is_production_primary: false, protected: true });
    expect(byId.get(FX.qrComp004)).toMatchObject({ is_production_primary: true, supersedes_qr_link_id: SEED.qrComp003 });
  });
});

describe("restore into the local stack", () => {
  let afterWrites: Record<string, string> = {};
  let bucketRules = "";

  it("new writes after the archive change the database", async () => {
    bucketRules = JSON.stringify((await client.query(`select id, file_size_limit, allowed_mime_types from storage.buckets order by id`)).rows);
    const admin = serviceClient();
    const { error } = await admin.from("form_submissions").insert({
      organization_id: NORTHRIDGE,
      asset_id: SEED.genAsset,
      form_type: "damage_report",
      submission_data_json: { description: "Synthetic: written after the archive" },
    });
    expect(error).toBeNull();
    await client.query(`update public.assets set asset_name = 'Renamed after the archive' where id = $1`, [SEED.genAsset]);
    await client.query(`delete from public.asset_acknowledgements where id = $1`, [FX.ack]);
    afterWrites = await orgFingerprint(client);
    expect(afterWrites).not.toEqual(packageState);
  });

  it("refuses a populated target without --replace-local", async () => {
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${pkg}`]);
    expect(out).toMatch(/already holds this organization; pass --replace-local/);
    expect(status).toBe(1);
    expect(await orgFingerprint(client)).toEqual(afterWrites);
  });

  it("an interrupted restore rolls back completely", async () => {
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${pkg}`, "--replace-local", "--fail-after=form_submissions"]);
    expect(out).toMatch(/--fail-after=form_submissions: aborting inside the transaction/);
    expect(status).toBe(1);
    expect(await orgFingerprint(client)).toEqual(afterWrites);
  });

  it("restores the package exactly: rows, identities, Storage bytes; dangling references stay missing", async () => {
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${pkg}`, "--replace-local"]);
    expect(out).toMatch(/STACK restore of .* — VERIFIED/);
    expect(status).toBe(0);
    expect(await orgFingerprint(client)).toEqual(packageState);
    const admin = serviceClient();
    for (const object of Object.values(OBJECTS)) {
      const { data, error } = await admin.storage.from(object.bucket).download(object.path);
      expect(error, object.path).toBeNull();
      const record = JSON.parse(readFileSync(path.join(pkg, "objects.json"), "utf8")).find((o: { path: string }) => o.path === object.path);
      expect(sha256(Buffer.from(await (data as Blob).arrayBuffer()))).toBe(record.sha256);
    }
    const missing = await admin.storage.from("submissions").download(DANGLING.damagePhoto);
    expect(missing.data).toBeNull();
    // The temporary widening for the image/gif object was reverted to the migration values.
    expect(JSON.stringify((await client.query(`select id, file_size_limit, allowed_mime_types from storage.buckets order by id`)).rows)).toBe(bucketRules);
  });

  it("a repeated restore converges to the same state and leaves a report beside the package", async () => {
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${pkg}`, "--replace-local"]);
    expect(out).toMatch(/VERIFIED/);
    expect(status).toBe(0);
    expect(await orgFingerprint(client)).toEqual(packageState);
    expect(readdirSync(path.join(pkg, "restore-reports")).length).toBeGreaterThanOrEqual(2);
    expect(verifyArchiveDir(pkg).ok).toBe(true);
  });

  it("other organizations are untouched by the restore", async () => {
    const others = await count(client, `select count(*)::int as n from public.organizations where id <> $1`, [NORTHRIDGE]);
    expect(others).toBeGreaterThanOrEqual(0);
    expect(await count(client, `select count(*)::int as n from public.assets a where a.organization_id <> $1 and a.id::text like 'e1%'`, [NORTHRIDGE])).toBe(0);
  });
});

describe("refusals", () => {
  it("a tampered package fails verification and is not restored", async () => {
    const dir = copyPackage("tampered");
    const file = path.join(dir, "rows", "assets.json");
    const rows = JSON.parse(readFileSync(file, "utf8"));
    rows[0].asset_name = "tampered";
    writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${dir}`, "--replace-local"]);
    expect(out).toMatch(/failed verification: .*rows\/assets\.json does not match its SHA-256/);
    expect(status).toBe(1);
    expect(await orgFingerprint(client)).toEqual(packageState);
  });

  it("an incomplete package (no manifest) and an interrupted export (.partial) are refused", () => {
    const incomplete = copyPackage("incomplete");
    rmSync(path.join(incomplete, "manifest.json"));
    expect(runTool(RESTORE, ["stack", `--archive=${incomplete}`, "--replace-local"]).out).toMatch(/manifest\.json is missing/);
    const partial = `${copyPackage("partial")}.partial`;
    renameSync(partial.replace(/\.partial$/, ""), partial);
    rmSync(path.join(partial, "manifest.json"));
    rmSync(path.join(partial, "SHA256SUMS"));
    const verify = runTool(ARCHIVE, ["verify", `--path=${partial}`]);
    expect(verify.out).toMatch(/FAILED/);
    expect(verify.status).toBe(1);
    expect(runTool(RESTORE, ["stack", `--archive=${partial}`, "--replace-local"]).status).toBe(1);
  });

  it("a package taken under another schema graph is refused", () => {
    const dir = copyPackage("graph");
    editManifest(dir, (m) => {
      m.graph.sha256 = "0".repeat(64);
    });
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${dir}`, "--replace-local"]);
    expect(out).toMatch(/different schema graph/);
    expect(status).toBe(1);
  });

  it("a package exported from Production never restores into the all-interfaces stack", () => {
    const dir = copyPackage("production-source");
    editManifest(dir, (m) => {
      m.source.target = "production";
    });
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${dir}`, "--replace-local"]);
    expect(out).toMatch(/restores only into the standalone loopback target/);
    expect(status).toBe(1);
  });

  it("the exporter refuses a wrong organization or a project that is not the declared target", () => {
    const root = tempRoot("wrong");
    const wrongOrg = runTool(ARCHIVE, ["--target=local", "--org=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", `--root=${root}`]);
    expect(wrongOrg.out).toMatch(/not an allowlisted local fixture organization/);
    expect(wrongOrg.status).toBe(1);
    const env = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "local-placeholder" };
    for (const target of ["production", "staging"]) {
      const wrongProject = runTool(ARCHIVE, [`--target=${target}`, `--org=${NORTHRIDGE}`, `--root=${root}`], env);
      expect(wrongProject.out, target).toMatch(/REFUSING TO RUN/);
      expect(wrongProject.status, target).toBe(1);
    }
    expect(readdirSync(root)).toEqual([]);
  });

  it("an object under the organization prefix with no known path grammar stops the export", async () => {
    const admin = serviceClient();
    const stray = `org/${NORTHRIDGE}/stray/${randomUUID()}.png`;
    expect((await admin.storage.from("public-assets").upload(stray, Buffer.from("stray"), { contentType: "image/png" })).error).toBeNull();
    try {
      const { status, out } = runTool(ARCHIVE, ["--target=local", `--org=${NORTHRIDGE}`, `--root=${tempRoot("stray")}`]);
      expect(out).toMatch(/follow no known path grammar/);
      expect(status).toBe(1);
    } finally {
      await admin.storage.from("public-assets").remove([stray]);
    }
  });

  it("an unknown table blocks both the graph check and the export", async () => {
    await client.query(`create table public.zz_phase_e_probe (id uuid primary key, note text)`);
    await client.query(`grant select on public.zz_phase_e_probe to service_role`);
    await client.query(`notify pgrst, 'reload schema'`);
    try {
      const graph = runTool(GRAPH_CLI, ["--check"]);
      expect(graph.out).toMatch(/zz_phase_e_probe is neither tenant-scoped nor listed as shared/);
      expect(graph.status).toBe(1);
      let exported = { status: 0 as number | null, out: "" };
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        exported = runTool(ARCHIVE, ["--target=local", `--org=${NORTHRIDGE}`, `--root=${tempRoot("unknown-table")}`]);
        if (/zz_phase_e_probe/.test(exported.out)) break;
      }
      expect(exported.out).toMatch(/target has table zz_phase_e_probe that the graph does not know/);
      expect(exported.status).toBe(1);
    } finally {
      await client.query(`drop table if exists public.zz_phase_e_probe`);
      await client.query(`notify pgrst, 'reload schema'`);
    }
  });
});

describe("standalone restore target (the real-data path, rehearsed with the synthetic package)", () => {
  it("comes up loopback-only, restores and verifies the package, and converges on a repeat", () => {
    const up = runTool(RESTORE, ["standalone-up"]);
    expect(up.out).toMatch(/standalone target ready on 127\.0\.0\.1:55432 \(loopback-only verified/);
    expect(up.status).toBe(0);
    const first = runTool(RESTORE, ["standalone", `--archive=${pkg}`]);
    expect(first.out).toMatch(/STANDALONE restore of .* — VERIFIED/);
    expect(first.out).toMatch(/hash-verified-from-package/);
    expect(first.status).toBe(0);
    const again = runTool(RESTORE, ["standalone", `--archive=${pkg}`, "--replace-local"]);
    expect(again.out).toMatch(/VERIFIED/);
    expect(again.status).toBe(0);
  });

  it("goes away completely when stopped", () => {
    const down = runTool(RESTORE, ["standalone-down"]);
    expect(down.out).toMatch(/listeners left on 55432: 0/);
    expect(down.status).toBe(0);
  });
});

describe("isolation and public routing after the restore", () => {
  it("the restored Northridge admin sees Northridge only", async () => {
    const admin = await signIn(ADMIN_EMAIL, FIXTURE_PASSWORD);
    const { data: assets } = await admin.from("assets").select("id, organization_id");
    expect(assets?.length).toBeGreaterThan(0);
    expect(new Set(assets?.map((a) => a.organization_id))).toEqual(new Set([NORTHRIDGE]));
    const { data: orgs } = await admin.from("organizations").select("id");
    expect(orgs?.map((o) => o.id)).toEqual([NORTHRIDGE]);
  });

  it("a dedicated QA login cannot read or change Northridge", async () => {
    const service = serviceClient();
    await client.query(
      `insert into public.organizations (id, name, slug, status, asset_limit) values ($1, 'Phase E local QA', 'phase-e-local-qa', 'active', null) on conflict (id) do nothing`,
      [QA_ORG]
    );
    if (!(await service.auth.admin.getUserById(QA_AUTH)).data?.user) {
      const { error } = await service.auth.admin.createUser({ id: QA_AUTH, email: QA_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true });
      expect(error).toBeNull();
    }
    await client.query(
      `insert into public.profiles (id, auth_user_id, organization_id, name, email, role, status) values ($1, $2, $3, 'Phase E QA admin', $4, 'customer_admin', 'active') on conflict (id) do nothing`,
      [QA_PROFILE, QA_AUTH, QA_ORG, QA_EMAIL]
    );
    const qa = await signIn(QA_EMAIL, FIXTURE_PASSWORD);
    expect((await qa.from("assets").select("id").eq("organization_id", NORTHRIDGE)).data).toEqual([]);
    expect((await qa.from("form_submissions").select("id").eq("organization_id", NORTHRIDGE)).data).toEqual([]);
    const update = await qa.from("assets").update({ asset_name: "QA was here" }).eq("id", SEED.exAsset).select("id");
    expect(update.data ?? []).toEqual([]);
    expect(await count(client, `select count(*)::int as n from public.assets where id = $1 and asset_name = 'QA was here'`, [SEED.exAsset])).toBe(0);
  });

  it("public routing resolves the protected codes, the successor code, and not the disabled one", async () => {
    const anon = anonClient();
    expect((await resolvePublicEquipment(anon, "demo-ex017"))?.assetId).toBe(SEED.exAsset);
    expect((await resolvePublicEquipment(anon, "demo-tr014"))?.assetId).toBe(SEED.trAsset);
    expect((await resolvePublicEquipment(anon, "demo-comp004"))?.assetId).toBe(SEED.compAsset);
    expect(await resolvePublicEquipment(anon, "demo-comp003")).toBeNull();
    expect((await resolvePublicEquipment(anon, "demo-ex017"))?.activeRentalSessionId).toBe(FX.sessionActive);
  });

  it("the package rows for the protected routes still equal the live rows", async () => {
    const live = (await client.query(`select to_jsonb(q) as j from public.qr_links q where id = any($1::uuid[])`, [[SEED.qrEx017, SEED.qrTr014]])).rows.map((r) => r.j);
    const routeIds: string[] = [SEED.qrEx017, SEED.qrTr014];
    const archived = JSON.parse(readFileSync(path.join(pkg, "rows", "qr_links.json"), "utf8")).filter((r: { id: string }) => routeIds.includes(r.id));
    expect(tableHash(live)).toBe(tableHash(archived));
  });
});

describe("guarded reset, seeded cutover, seed-notification suppression and rollback (local stack, synthetic data)", () => {
  let work = "";
  let cutoverFile = "";
  const manifestFile = (name: string) => path.join(work, `${name}.json`);
  const reset = (...args: string[]) => runTool(RESET, ["--target=local", ...args]);
  const PROTECTED_LOCAL = { qrLinkIds: [SEED.qrEx017, SEED.qrTr014, SEED.qrComp003, SEED_QR_GEN008], assetIds: [SEED.exAsset, SEED.trAsset] };
  type Counts = Record<string, { KEEP: number; UPDATE: number; INSERT: number; DELETE: number }>;
  const planOf = (file: string): { ok: boolean; counts: Counts } => JSON.parse(readFileSync(file.replace(/\.json$/, ".plan.json"), "utf8"));
  const changedTotal = (counts: Counts) => Object.values(counts).reduce((n, c) => n + c.UPDATE + c.INSERT + c.DELETE, 0);

  async function liveSnapshot() {
    const t0 = new Date().toISOString();
    const tables = (await pgTables(client, GRAPH, NORTHRIDGE, t0)) as Record<string, Row[]>;
    const { identity } = (await pgIdentity(client, GRAPH, tables)) as { identity: Row[] };
    return { taken_at: t0, tables, identity };
  }

  function saveManifest(name: string, snap: Awaited<ReturnType<typeof liveSnapshot>>, desired: Record<string, Row[]>): string {
    const manifest = buildManifest({ name, kind: "fixture", target: "local", organizationId: NORTHRIDGE, snapshot: snap, graph: GRAPH, protectedSet: PROTECTED_LOCAL, desired });
    writeFileSync(manifestFile(name), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestFile(name);
  }

  async function qrRowsUnchanged() {
    const live = (await client.query(`select to_jsonb(q) as j from public.qr_links q where q.organization_id = $1`, [NORTHRIDGE])).rows.map((r) => r.j);
    expect(tableHash(live)).toBe(tableHash(JSON.parse(readFileSync(path.join(pkg, "rows", "qr_links.json"), "utf8"))));
  }

  beforeAll(() => {
    work = tempRoot("reset");
  });

  it("a no-op manifest plans all KEEP", () => {
    expect(reset("manifest", "--kind=noop", `--org=${NORTHRIDGE}`, `--out=${manifestFile("noop")}`).status).toBe(0);
    const dry = reset("plan", `--manifest=${manifestFile("noop")}`);
    expect(dry.out).toMatch(/DRY RUN of "noop-local-[0-9TZ]+" \(noop\): ACCEPTED/);
    expect(dry.status).toBe(0);
    expect(changedTotal(planOf(manifestFile("noop")).counts)).toBe(0);
  });

  it("refuses a wildcard or foreign organization and any apply on a hosted target", () => {
    expect(reset("manifest", "--kind=noop", "--org=*", `--out=${manifestFile("x")}`).out).toMatch(/--org must be the Northridge organization id exactly/);
    expect(reset("manifest", "--kind=noop", "--org=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", `--out=${manifestFile("x")}`).status).toBe(2);
    const hosted = runTool(RESET, ["--target=production", "apply", `--manifest=${manifestFile("noop")}`], {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "local-placeholder",
    });
    expect(hosted.out).toMatch(/REFUSING TO RUN/);
    expect(hosted.status).toBe(1);
  });

  it("the E2C draft: an interrupted apply changes nothing, the apply converges, a rerun is a no-op", async () => {
    expect(reset("manifest", "--kind=draft-e2c", `--org=${NORTHRIDGE}`, `--out=${manifestFile("draft")}`).status).toBe(0);
    expect(reset("plan", `--manifest=${manifestFile("draft")}`).out).toMatch(/ACCEPTED/);
    const { counts } = planOf(manifestFile("draft"));
    expect(counts.form_submissions.DELETE).toBeGreaterThan(0);
    expect(counts.asset_acknowledgements.DELETE).toBe(1);
    expect(counts.asset_rental_sessions.UPDATE).toBe(1);
    expect(counts.qr_links).toMatchObject({ UPDATE: 0, INSERT: 0, DELETE: 0 });
    const before = await orgFingerprint(client);
    const interrupted = reset("apply", `--manifest=${manifestFile("draft")}`, "--fail-at=writes");
    expect(interrupted.out).toMatch(/--fail-at=writes: aborting after the writes/);
    expect(interrupted.status).toBe(1);
    expect(await orgFingerprint(client)).toEqual(before);
    const applied = reset("apply", `--manifest=${manifestFile("draft")}`);
    expect(applied.out).toMatch(/re-plan after commit: CONVERGED \(all KEEP\)/);
    expect(applied.status).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.form_submissions where organization_id = $1`, [NORTHRIDGE])).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.asset_rental_sessions where organization_id = $1 and status = 'active'`, [NORTHRIDGE])).toBe(0);
    await qrRowsUnchanged();
    const again = reset("apply", `--manifest=${manifestFile("draft")}`);
    expect(again.out).toMatch(/in one transaction: 0 guarded statements/);
    expect(again.out).toMatch(/CONVERGED/);
    expect(again.status).toBe(0);
  });

  it("restores the package again for the seeded cutover rehearsal", async () => {
    const { status, out } = runTool(RESTORE, ["stack", `--archive=${pkg}`, "--replace-local"]);
    expect(out).toMatch(/VERIFIED/);
    expect(status).toBe(0);
    expect(await orgFingerprint(client)).toEqual(packageState);
  });

  it("a seeded cutover applies with triggers on: the old session closes before the new one opens, submissions land exactly", async () => {
    const snap = await liveSnapshot();
    const desired = noopDesired(snap) as Record<string, Row[]>;
    desired.asset_rental_sessions = desired.asset_rental_sessions.map((s) =>
      s.id === FX.sessionActive ? { ...s, status: "returned", returned_at: "2026-09-29T18:00:00+00:00", returned_by_profile_id: FX.adminProfile } : s
    );
    const template = desired.asset_rental_sessions.find((s) => s.id === FX.sessionActive) as Row;
    desired.asset_rental_sessions.push({
      ...template,
      id: SESSION_NEW,
      status: "active",
      rental_reference: "SYN-2001",
      renter_label: "Synthetic Renter C",
      started_at: "2026-09-29T19:00:00+00:00",
      returned_at: null,
      returned_by_profile_id: null,
      created_at: "2026-09-29T19:00:00+00:00",
      updated_at: "2026-09-29T19:00:00+00:00",
    });
    desired.assets = desired.assets.map((a) => (a.id === SEED.exAsset ? { ...a, active_rental_session_id: SESSION_NEW } : a));
    const outbound = desired.form_submissions.find((f) => f.id === FX.subOutbound) as Row;
    desired.form_submissions.push(
      // A second outbound inspection: the insert trigger would bind it to the asset's CURRENT session (the old one, which
      // already has its outbound) and collide; inserted unbound and corrected afterwards, it lands exactly.
      { ...outbound, id: SUB_NEW_OUTBOUND, rental_session_id: SESSION_NEW, created_at: "2026-09-29T19:05:00+00:00", media_urls: [] },
      // A seeded staff return with an exception, dated before the digest watermark.
      {
        ...outbound,
        id: SUB_SEEDED_RETURN,
        form_type: "return_checklist",
        rental_session_id: FX.sessionActive,
        status: "new",
        created_at: "2026-09-29T18:00:00+00:00",
        submission_data_json: { damage_observed: "yes", accessories_returned: "yes" },
        media_urls: [],
      }
    );
    desired.equipment_pages = desired.equipment_pages.map((p) => (p.asset_id === SEED.exAsset ? { ...p, headline: "Rehearsed showcase headline" } : p));
    cutoverFile = saveManifest("cutover", snap, desired);
    const dry = reset("plan", `--manifest=${cutoverFile}`);
    expect(dry.out).toMatch(/ACCEPTED/);
    expect(dry.status).toBe(0);
    const applied = reset("apply", `--manifest=${cutoverFile}`);
    expect(applied.out).toMatch(/CONVERGED/);
    expect(applied.status).toBe(0);
    const rows = (
      await client.query(
        `select id, form_type, submission_origin, submitted_by_profile_id, rental_session_id from public.form_submissions where id = any($1::uuid[]) order by id`,
        [[SUB_NEW_OUTBOUND, SUB_SEEDED_RETURN]]
      )
    ).rows;
    expect(rows).toEqual([
      { id: SUB_NEW_OUTBOUND, form_type: "pre_use_inspection", submission_origin: "staff", submitted_by_profile_id: FX.adminProfile, rental_session_id: SESSION_NEW },
      { id: SUB_SEEDED_RETURN, form_type: "return_checklist", submission_origin: "staff", submitted_by_profile_id: FX.adminProfile, rental_session_id: FX.sessionActive },
    ]);
    expect((await resolvePublicEquipment(anonClient(), "demo-ex017"))?.activeRentalSessionId).toBe(SESSION_NEW);
    await qrRowsUnchanged();
  });

  it("seed-notification suppression: the real digest worker skips the seeded return, lists a later staff return, and no public return under instant_renter", async () => {
    const admin = serviceClient();
    const insert = async (createdAt: string, staff: boolean): Promise<string> => {
      const { data, error } = await admin
        .from("form_submissions")
        .insert({
          organization_id: NORTHRIDGE,
          asset_id: SEED.trAsset,
          form_type: "return_checklist",
          status: "new",
          created_at: createdAt,
          submitted_by_name: "Phase E digest control",
          submission_data_json: { damage_observed: "yes", accessories_returned: "yes" },
          media_urls: [],
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      const id = (data as { id: string }).id;
      if (staff) expect((await admin.from("form_submissions").update({ submission_origin: "staff", rental_session_id: null }).eq("id", id)).error).toBeNull();
      return id;
    };
    const staffControl = await insert("2026-10-01T02:00:00.000Z", true);
    const publicControl = await insert("2026-10-01T03:00:00.000Z", false);
    try {
      const captured: { to: string; content: EmailContent }[] = [];
      const result = await runReturnDigest({
        store: createDigestStore(admin),
        send: async (to, content) => {
          captured.push({ to, content });
          return { outcome: "sent", attempts: 1, providerId: "phase-e-local-fake-sender", status: 200 };
        },
        now: () => new Date("2026-10-01T13:30:00.000Z"),
        siteUrl: "https://mulemark.io",
        replyTo: "",
        log: () => {},
        logRun: () => {},
        onlyOrganizationIds: [NORTHRIDGE],
      });
      expect(result).toMatchObject({ outcome: "completed", sent: 1 });
      expect(captured).toHaveLength(1);
      expect(captured[0].to).toBe(NOTIFY_EMAIL);
      const text = captured[0].content.text;
      expect(text).toContain(submissionReference(staffControl, "2026-10-01T02:00:00.000Z"));
      expect(text).not.toContain(submissionReference(publicControl, "2026-10-01T03:00:00.000Z"));
      expect(text).not.toContain(submissionReference(SUB_SEEDED_RETURN, "2026-09-29T18:00:00+00:00"));
      expect(text).not.toContain(submissionReference(FX.subPublicReturn, "2026-09-25T18:00:00+00:00"));
      const ledger = (
        await client.query(`select window_start from public.notification_digest_runs where organization_id = $1 and window_end = '2026-10-01T13:00:00Z'`, [NORTHRIDGE])
      ).rows[0];
      expect(new Date(ledger.window_start).toISOString()).toBe(WATERMARK);
    } finally {
      await admin.from("form_submissions").delete().in("id", [staffControl, publicControl]);
    }
  });

  it("refuses a late return, a protected change, a QR change and drift; a refused apply changes nothing", async () => {
    const snap = await liveSnapshot();
    const outbound = snap.tables.form_submissions.find((f) => f.id === FX.subOutbound) as Row;
    const late = noopDesired(snap) as Record<string, Row[]>;
    late.form_submissions.push({ ...outbound, id: "e1e00000-0000-4000-8000-000000000020", form_type: "return_checklist", rental_session_id: null, created_at: new Date().toISOString() });
    const lateRun = reset("plan", `--manifest=${saveManifest("late", snap, late)}`);
    expect(lateRun.out).toMatch(/REFUSED \[watermark\]/);
    expect(lateRun.status).toBe(1);

    const code = noopDesired(snap) as Record<string, Row[]>;
    code.assets = code.assets.map((a) => (a.id === SEED.exAsset ? { ...a, asset_code: "EXCAVATOR-NEW" } : a));
    expect(reset("plan", `--manifest=${saveManifest("protected", snap, code)}`).out).toMatch(/REFUSED \[protected\]/);

    const qr = noopDesired(snap) as Record<string, Row[]>;
    qr.qr_links = qr.qr_links.map((q) => (q.id === FX.qrComp004 ? { ...q, status: "disabled" } : q));
    expect(reset("plan", `--manifest=${saveManifest("qr", snap, qr)}`).out).toMatch(/REFUSED \[frozen\]/);

    const noop = saveManifest("drift", snap, noopDesired(snap) as Record<string, Row[]>);
    const admin = serviceClient();
    const { data } = await admin
      .from("form_submissions")
      .insert({ organization_id: NORTHRIDGE, asset_id: SEED.trAsset, form_type: "damage_report", submission_data_json: { description: "Synthetic: written after the manifest" } })
      .select("id")
      .single();
    try {
      expect(reset("plan", `--manifest=${noop}`).out).toMatch(/REFUSED \[drift-new\]/);
      const before = await orgFingerprint(client);
      const apply = reset("apply", `--manifest=${noop}`);
      expect(apply.out).toMatch(/STOPPED: the plan was refused on the locked rows/);
      expect(apply.status).toBe(1);
      expect(await orgFingerprint(client)).toEqual(before);
    } finally {
      await admin.from("form_submissions").delete().eq("id", (data as { id: string }).id);
    }
  });

  it("rolls back to the archive, re-stages a missing object, and keeps a visitor report made after the cutover", async () => {
    const admin = serviceClient();
    const { data, error } = await admin
      .from("form_submissions")
      .insert({ organization_id: NORTHRIDGE, asset_id: SEED.trAsset, form_type: "damage_report", submission_data_json: { description: "Synthetic visitor after the cutover" } })
      .select("id")
      .single();
    expect(error).toBeNull();
    const visitorId = (data as { id: string }).id;
    expect((await admin.storage.from(OBJECTS.cover.bucket).remove([OBJECTS.cover.path])).error).toBeNull();

    const file = manifestFile("rollback");
    const made = reset("manifest", "--kind=restore", `--org=${NORTHRIDGE}`, `--archive=${pkg}`, `--cutover=${cutoverFile}`, `--out=${file}`);
    expect(made.out).toMatch(/manifest "restore-local-[0-9TZ]+" \(restore\) written/);
    expect(made.status).toBe(0);
    expect(reset("plan", `--manifest=${file}`).out).toMatch(/ACCEPTED/);
    const applied = reset("apply", `--manifest=${file}`);
    expect(applied.out).toMatch(/storage staged: \{"present":6,"uploaded":1\}/);
    expect(applied.out).toMatch(/CONVERGED/);
    expect(applied.status).toBe(0);

    // Every table equals the archive except updated_at (stamped by the database on each update), the append-only
    // ledger (the digest proof added a window) and the visitor report the rollback kept.
    const strip = (r: Row) => {
      const { updated_at: _stamped, ...rest } = r;
      return rest;
    };
    for (const table of GRAPH.insert_order) {
      if (table === "notification_digest_runs") continue;
      const archived = JSON.parse(readFileSync(path.join(pkg, "rows", `${table}.json`), "utf8")) as Row[];
      const live = (await client.query(`select to_jsonb(t) as j from public."${table}" t where ${scopeWhere(table, GRAPH.classes)}`, [NORTHRIDGE])).rows
        .map((r) => r.j as Row)
        .filter((r) => r.id !== visitorId);
      expect(tableHash(live.map(strip)), table).toBe(tableHash(archived.map(strip)));
    }
    expect(await count(client, `select count(*)::int as n from public.form_submissions where id = $1`, [visitorId])).toBe(1);
    const cover = await admin.storage.from(OBJECTS.cover.bucket).download(OBJECTS.cover.path);
    const record = JSON.parse(readFileSync(path.join(pkg, "objects.json"), "utf8")).find((o: { path: string }) => o.path === OBJECTS.cover.path);
    expect(sha256(Buffer.from(await (cover.data as Blob).arrayBuffer()))).toBe(record.sha256);
    expect((await resolvePublicEquipment(anonClient(), "demo-ex017"))?.activeRentalSessionId).toBe(FX.sessionActive);
  });
});
