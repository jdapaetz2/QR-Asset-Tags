import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ARCHIVE_SCHEMA,
  archiveId,
  archiveRootProblems,
  bucketRuleViolations,
  buildSums,
  canonicalJson,
  coherenceProblems,
  columnSetProblems,
  digestWindowProblem,
  redactedSummary,
  referenceProblems,
  rowHash,
  scanStorageReferences,
  sha256,
  sortRows,
  tableHash,
  verifyArchiveDir,
  writeJson,
  writeObject,
} from "./showcase-archive.mjs";
import { redactionProblems } from "./showcase-inventory.mjs";

// The Phase E1 recovery-package format (scripts/lib/showcase-archive.mjs). Packages here are tiny synthetic ones in a
// temporary directory; nothing touches a database or the network.

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ASSET = "21111111-1111-4111-8111-111111111101";
const SUB = "61111111-1111-4111-8111-111111111101";
const abs = (...parts) => path.resolve(path.sep, ...parts);

describe("canonical hashing", () => {
  it("serializes equal rows identically whatever the key order, at every depth", () => {
    const a = { id: "1", data: { b: 2, a: [1, { y: 1, x: 2 }] }, n: null };
    const b = { n: null, data: { a: [1, { x: 2, y: 1 }], b: 2 }, id: "1" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(rowHash(a)).toBe(rowHash(b));
    expect(canonicalJson({ u: undefined })).toBe('{"u":null}');
  });

  it("hashes a table independently of row order, but not of row content", () => {
    const rows = [{ id: "b", v: 1 }, { id: "a", v: 2 }];
    expect(tableHash(rows)).toBe(tableHash([...rows].reverse()));
    expect(tableHash(rows)).not.toBe(tableHash([{ id: "b", v: 1 }, { id: "a", v: 3 }]));
    expect(sortRows(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("archiveRootProblems", () => {
  const repoRoot = abs("work", "repo");
  const env = { OneDrive: abs("Users", "op", "OneDrive - Employer") };
  const resolveReal = (p) => p;

  it("accepts an absolute folder outside the repository and OneDrive", () => {
    expect(archiveRootProblems(abs("Users", "op", "Mulemark-Ops-Archive"), { repoRoot, env, resolveReal })).toEqual([]);
  });

  it("refuses relative paths, the repository and OneDrive (directly or through a link)", () => {
    expect(archiveRootProblems("archive", { repoRoot, env, resolveReal })).toEqual(["the archive root must be an absolute path"]);
    expect(archiveRootProblems(path.join(repoRoot, "qa-artifacts"), { repoRoot, env, resolveReal })).toContain(
      "the archive root is inside the repository"
    );
    expect(archiveRootProblems(path.join(env.OneDrive, "Archive"), { repoRoot, env, resolveReal })).toContain(
      "the archive root is inside a OneDrive folder (OneDrive)"
    );
    const viaLink = archiveRootProblems(abs("Users", "op", "linked"), {
      repoRoot,
      env: {},
      resolveReal: () => abs("Users", "op", "OneDrive - Employer", "Documents"),
    });
    expect(viaLink).toContain("the archive root resolves into a OneDrive folder");
  });

  it.skipIf(process.platform !== "win32")("refuses a network share", () => {
    expect(archiveRootProblems("\\\\server\\share\\archive", { repoRoot, env, resolveReal })).toContain("the archive root is a network path");
  });
});

describe("export timing and naming", () => {
  it("names a package by fixture, target and UTC second", () => {
    expect(archiveId({ fixture: "northridge", target: "production", at: new Date("2026-10-16T21:05:09.123Z") })).toBe(
      "northridge-production-20261016T210509Z"
    );
  });

  it("refuses the 13:00-15:00 UTC digest slots only", () => {
    expect(digestWindowProblem(new Date("2026-10-16T12:59:59Z"))).toBeNull();
    expect(digestWindowProblem(new Date("2026-10-16T13:00:00Z"))).toMatch(/13:00 and 15:00 UTC/);
    expect(digestWindowProblem(new Date("2026-10-16T14:59:59Z"))).toMatch(/13:00 and 15:00 UTC/);
    expect(digestWindowProblem(new Date("2026-10-16T15:00:00Z"))).toBeNull();
  });
});

describe("Storage references", () => {
  const photoPath = `org/${ORG}/asset/${ASSET}/submission/${SUB}/front.jpg`;
  const rows = [
    {
      id: SUB,
      media_urls: [photoPath],
      submission_data_json: { version: 2, answers: { photos: { "front/left": [{ path: photoPath }] } }, note: "no path here" },
    },
  ];

  it("finds bare paths and URLs anywhere in a row, with a JSON pointer per hit", () => {
    const refs = scanStorageReferences("form_submissions", rows);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ column: "media_urls", pointer: "/media_urls/0", bucket: "submissions", kind: "path", path: photoPath });
    // A "/" inside a JSON key is escaped as ~1 (RFC 6901).
    expect(refs[1].pointer).toBe("/submission_data_json/answers/photos/front~1left/0/path");
    const urls = scanStorageReferences("assets", [
      { id: ASSET, cover_image_url: `https://abc.supabase.co/storage/v1/object/public/public-assets/org/${ORG}/asset/${ASSET}/cover/x%20y.jpg` },
    ]);
    expect(urls[0]).toMatchObject({ kind: "url", bucket: "public-assets", host: "abc.supabase.co", path: `org/${ORG}/asset/${ASSET}/cover/x y.jpg` });
  });

  it("blocks references into another organization, an unknown bucket column or another Supabase project", () => {
    const refs = [
      { table: "documents", column: "storage_path", kind: "path", bucket: "documents", path: `org/${OTHER}/asset/x/documents/d/d.pdf` },
      { table: "equipment_pages", column: "headline", kind: "path", bucket: null, path: `org/${ORG}/asset/x/cover/y.jpg` },
      { table: "assets", column: "cover_image_url", kind: "url", bucket: "public-assets", host: "other.supabase.co", path: `org/${ORG}/a.jpg` },
    ];
    const problems = referenceProblems(refs, { organizationId: ORG, projectHost: "abc.supabase.co" });
    expect(problems).toContain("documents.storage_path references another organization's Storage objects");
    expect(problems).toContain("equipment_pages.headline holds a Storage path in a column with no known bucket");
    expect(problems).toContain("assets.cover_image_url holds a Storage URL on another Supabase project");
    expect(referenceProblems(scanStorageReferences("form_submissions", rows), { organizationId: ORG, projectHost: "abc.supabase.co" })).toEqual([]);
  });
});

describe("coherenceProblems", () => {
  it("ignores growth in scan_events and reports any other change", () => {
    const start = { assets: [{ id: "a", v: 1 }], scan_events: [{ id: "s1" }] };
    expect(coherenceProblems(start, { assets: [{ id: "a", v: 1 }], scan_events: [{ id: "s1" }, { id: "s2" }] })).toEqual([]);
    expect(coherenceProblems(start, { assets: [{ id: "a", v: 2 }], scan_events: [{ id: "s1" }] })).toEqual(["assets changed during the export"]);
    expect(coherenceProblems(start, { assets: [{ id: "a", v: 1 }], scan_events: [], form_submissions: [{ id: "f" }] })).toEqual([
      "form_submissions changed during the export",
    ]);
  });
});

describe("package write and verify", () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function writePackage() {
    dir = mkdtempSync(path.join(tmpdir(), "phase-e-archive-test-"));
    const rows = { organizations: [{ id: ORG, name: "Northridge" }], assets: sortRows([{ id: "b" }, { id: "a" }]) };
    for (const [t, r] of Object.entries(rows)) writeJson(dir, `rows/${t}.json`, r);
    const hash = writeObject(dir, Buffer.from("photo-bytes"));
    expect(writeObject(dir, Buffer.from("photo-bytes"))).toBe(hash); // identical content is stored once
    writeJson(dir, "objects.json", [{ bucket: "submissions", path: "org/x/y.jpg", sha256: hash }]);
    const sums = buildSums(dir);
    writeFileSync(path.join(dir, "SHA256SUMS"), sums);
    const manifest = {
      schema: ARCHIVE_SCHEMA,
      status: "complete",
      tables: Object.fromEntries(Object.entries(rows).map(([t, r]) => [t, { rows: r.length, table_hash: tableHash(r) }])),
      data_files_sha256: sha256(sums),
    };
    writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest)}\n`);
    return { hash };
  }

  it("verifies a complete package and ignores restore reports", () => {
    writePackage();
    writeJson(dir, "restore-reports/20261016T000000Z-stack.json", { ok: true });
    expect(verifyArchiveDir(dir)).toMatchObject({ ok: true, problems: [] });
  });

  it("refuses an incomplete package (no manifest, or a partial status)", () => {
    writePackage();
    rmSync(path.join(dir, "manifest.json"));
    expect(verifyArchiveDir(dir).problems).toEqual(["manifest.json is missing — not a complete package"]);
    rmSync(dir, { recursive: true, force: true });
    writePackage();
    const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, status: "partial" }));
    expect(verifyArchiveDir(dir).problems).toContain("package status is partial, not complete");
  });

  it("detects a changed row file, a changed object and an unlisted file", () => {
    const { hash } = writePackage();
    writeJson(dir, "rows/assets.json", [{ id: "a" }, { id: "b", changed: true }]);
    writeFileSync(path.join(dir, "objects", hash), "tampered");
    writeFileSync(path.join(dir, "rows", "extra.json"), "[]");
    const { ok, problems } = verifyArchiveDir(dir);
    expect(ok).toBe(false);
    expect(problems).toContain("rows/assets.json does not match its SHA-256");
    expect(problems).toContain("rows/assets.json does not match the manifest's table hash");
    expect(problems).toContain(`objects/${hash} does not match its SHA-256`);
    expect(problems).toContain(`object ${hash.slice(0, 12)}… is not named by its own hash`);
    expect(problems).toContain("rows/extra.json is not listed in SHA256SUMS");
  });

  it("detects an edited SHA256SUMS and a missing object", () => {
    const { hash } = writePackage();
    writeFileSync(path.join(dir, "SHA256SUMS"), `${readFileSync(path.join(dir, "SHA256SUMS"), "utf8")}\n`);
    rmSync(path.join(dir, "objects", hash));
    const { problems } = verifyArchiveDir(dir);
    expect(problems).toContain("SHA256SUMS does not match the manifest");
    expect(problems).toContain(`objects/${hash} is listed but missing`);
    expect(problems).toContain("object bytes for one submissions object are missing");
  });
});

describe("restore preflight helpers", () => {
  it("requires the archived and target column sets to match exactly", () => {
    const rows = { assets: [{ id: "a", name: "x" }], documents: [] };
    expect(columnSetProblems(rows, { assets: ["id", "name"], documents: ["id"] })).toEqual([]);
    expect(columnSetProblems(rows, { assets: ["id", "name", "added"] })).toEqual([
      "assets.added is on the target but not in the archive",
      "target has no table documents",
    ]);
    expect(columnSetProblems({ assets: [{ id: "a", gone: 1 }] }, { assets: ["id"] })).toEqual(["assets.gone is in the archive but not on the target"]);
    expect(columnSetProblems({ assets: [{ id: "a" }, { id: "b", x: 1 }] }, { assets: ["id"] })).toContain("assets rows do not all carry the same columns");
  });

  it("lists objects the target bucket rules would refuse", () => {
    const buckets = { submissions: { file_size_limit: 10, allowed_mime_types: ["image/jpeg"] } };
    const objects = [
      { bucket: "submissions", size: 5, mimetype: "image/jpeg" },
      { bucket: "submissions", size: 50, mimetype: "image/gif" },
      { bucket: "nowhere", size: 1, mimetype: "image/jpeg" },
    ];
    expect(bucketRuleViolations(objects, buckets).map((v) => v.reason)).toEqual([
      "larger than the bucket limit",
      "MIME type not allowed by the bucket",
      "bucket does not exist",
    ]);
  });
});

describe("redactedSummary", () => {
  it("carries counts and checks but no paths, addresses or per-file hashes", () => {
    const manifest = {
      archive_id: "northridge-production-20261016T210509Z",
      created_at: "2026-10-16T21:05:09Z",
      source: { target: "production", supabase_ref: "apeiswnkheiwrpvumder", organization_id: ORG, fixture: "northridge", host: "x.supabase.co" },
      graph: { sha256: "f".repeat(64) },
      tables: { assets: { rows: 11, table_hash: "a".repeat(64) } },
      objects: { count: 2, bytes: 10, by_bucket: { submissions: { objects: 2, bytes: 10 } } },
      references: { total: 3, present: 2, missing: 1 },
      missing_references: [{ path: `org/${ORG}/asset/${ASSET}/submission/${SUB}/gone.jpg` }],
      identity: { profiles_in_tenant: 1, external_profiles: 1 },
      protected: { routes: 4, qr_link_ids: ["q1", "q2", "q3", "q4"], asset_ids: ["a1", "a2", "a3", "a4"] },
      checks: { coherent: true },
      window: { t0: "t0", t1: "t1", scans_after_t0_excluded: true },
      custody: { owner: "operator" },
    };
    const summary = redactedSummary(manifest, "m".repeat(64));
    const text = JSON.stringify(summary);
    expect(redactionProblems(text)).toEqual([]);
    expect(text).not.toContain("gone.jpg");
    expect(text).not.toContain("a".repeat(64));
    expect(summary.tables).toEqual({ assets: 11 });
    expect(summary.protected).toEqual({ routes: 4, qr_links: 4, assets: 4 });
  });
});
