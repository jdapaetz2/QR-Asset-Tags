import { describe, expect, it, vi } from "vitest";

import { COVER_OBJECT_RE } from "../../lib/assets/cover.ts";
import { DOCUMENT_OBJECT_RE } from "../../lib/documents/upload.ts";
import { logoPathPrefix, managedLogoObjectPath } from "../../lib/org/logo.ts";
import { SUBMISSION_OBJECT_RE } from "../../lib/ratelimit/orphan.ts";
import {
  DEFAULT_MAX_DELETE,
  MAX_DELETE_CAP,
  MIN_AGE_HOURS,
  classifyObject,
  declaredTargetProblem,
  deletionRefusal,
  formatBytes,
  parseCleanupArgs,
  planCleanup,
  publicObjectPath,
  runDeletion,
  selectForDeletion,
} from "./orphan-media.mjs";

// The abandoned-upload tool's decisions (scripts/lib/orphan-media.mjs, D4.1 Parts I–J).

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

const SUBMISSION = `org/${ORG}/asset/${ASSET}/submission/${ID}/${OTHER}.jpg`;
const DOCUMENT = `org/${ORG}/asset/${ASSET}/documents/${ID}/${ID}.pdf`;
const COVER = `org/${ORG}/asset/${ASSET}/cover/${ID}.jpg`;
const LOGO = `org/${ORG}/logo/${ID}.png`;
const PUBLIC_BASE = "https://proj.supabase.co/storage/v1/object/public/public-assets/";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const hoursAgo = (hours) => new Date(NOW - hours * 3_600_000).toISOString();

describe("parseCleanupArgs", () => {
  it("requires a target and defaults to a report", () => {
    expect(parseCleanupArgs([])).toEqual({ ok: false, error: expect.stringContaining("--target is required") });
    expect(parseCleanupArgs(["--target=staging"])).toEqual({
      ok: true,
      args: {
        target: "staging",
        olderThanHours: MIN_AGE_HOURS,
        maxDelete: DEFAULT_MAX_DELETE,
        delete: false,
        confirm: null,
        acknowledgeProduction: false,
        verbose: false,
      },
    });
  });

  it.each([
    ["an unknown flag", ["--target=staging", "--yes"]],
    ["a positional argument", ["--target=staging", "delete"]],
    ["a repeated flag", ["--target=staging", "--target=production"]],
    ["an unknown target", ["--target=prod"]],
    ["a non-numeric age", ["--target=staging", "--older-than-hours=abc"]],
    ["an age with a unit", ["--target=staging", "--older-than-hours=72h"]],
    ["an empty age", ["--target=staging", "--older-than-hours="]],
    ["a negative age", ["--target=staging", "--older-than-hours=-1"]],
    ["an exponent", ["--target=staging", "--older-than-hours=1e3"]],
    ["a fractional cap", ["--target=staging", "--max-delete=2.5"]],
    ["a zero cap", ["--target=staging", "--max-delete=0"]],
    ["a cap over the hard limit", ["--target=staging", `--max-delete=${MAX_DELETE_CAP + 1}`]],
    ["a value on a bare flag", ["--target=staging", "--delete=true"]],
    ["a confirmation without --delete", ["--target=staging", "--confirm=staging:1"]],
    ["an acknowledgement without --delete", ["--target=production", "--acknowledge-production-deletion"]],
  ])("refuses %s instead of falling back to a default", (_name, argv) => {
    expect(parseCleanupArgs(argv).ok).toBe(false);
  });

  it("keeps the 48-hour floor on hosted targets but lets a local stack go lower", () => {
    expect(parseCleanupArgs(["--target=staging", "--older-than-hours=47"]).ok).toBe(false);
    expect(parseCleanupArgs(["--target=production", "--older-than-hours=1"]).ok).toBe(false);
    expect(parseCleanupArgs(["--target=production", "--older-than-hours=72"])).toMatchObject({ ok: true, args: { olderThanHours: 72 } });
    expect(parseCleanupArgs(["--target=local", "--older-than-hours=0"])).toMatchObject({ ok: true, args: { olderThanHours: 0 } });
  });

  it("never echoes an argument's value", () => {
    const result = parseCleanupArgs(["--target=staging", "--sb_secret_leaked=abc123"]);
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("abc123");
  });
});

describe("declaredTargetProblem", () => {
  it("requires MULEMARK_TARGET to be set and to match --target", () => {
    expect(declaredTargetProblem("staging", undefined)).toMatch(/not set/);
    expect(declaredTargetProblem("staging", "production")).toMatch(/production but --target is staging/);
    expect(declaredTargetProblem("staging", "whatever")).toMatch(/unrecognised value/);
    expect(declaredTargetProblem("production", "production")).toBeNull();
  });
});

describe("classifyObject", () => {
  it("recognises each managed grammar in its own bucket only", () => {
    expect(classifyObject("submissions", SUBMISSION)).toEqual({ kind: "submission", org: ORG, submissionId: ID });
    expect(classifyObject("documents", DOCUMENT)).toEqual({ kind: "document", org: ORG, documentId: ID });
    expect(classifyObject("public-assets", COVER)).toEqual({ kind: "cover", org: ORG });
    expect(classifyObject("public-assets", LOGO)).toEqual({ kind: "logo", org: ORG });
    expect(classifyObject("documents", COVER).kind).toBe("unmanaged");
    expect(classifyObject("public-assets", DOCUMENT).kind).toBe("unmanaged");
  });

  it.each([
    ["a document not named after its folder", "documents", `org/${ORG}/asset/${ASSET}/documents/${ID}/${OTHER}.pdf`],
    ["a legacy or foreign document path", "documents", `org/${ORG}/asset/${ASSET}/documents/${ID}.pdf`],
    ["a cover with an unexpected extension", "public-assets", `org/${ORG}/asset/${ASSET}/cover/${ID}.svg`],
    ["demo artwork", "public-assets", "demo-assets/excavator-017.svg"],
    ["a folder placeholder", "submissions", `org/${ORG}/.emptyFolderPlaceholder`],
    ["a traversal", "submissions", `org/${ORG}/asset/${ASSET}/submission/${ID}/../x.jpg`],
  ])("treats %s as unmanaged", (_name, bucket, path) => {
    expect(classifyObject(bucket, path).kind).toBe("unmanaged");
  });

  // The mirror must agree with the application's own path rules; if one changes, this fails until both do.
  it.each([
    SUBMISSION,
    SUBMISSION.toUpperCase().replace("ORG/", "org/").replace("/ASSET/", "/asset/").replace("/SUBMISSION/", "/submission/"),
    `org/${ORG}/asset/${ASSET}/submission/${ID}`,
    `org/${ORG}/asset/${ASSET}/submission/${ID}/a/b.jpg`,
  ])("matches lib/ratelimit/orphan.ts for submission path %s", (path) => {
    expect(classifyObject("submissions", path).kind === "submission").toBe(SUBMISSION_OBJECT_RE.test(path));
  });

  it.each([
    DOCUMENT,
    DOCUMENT.replace(".pdf", ".mov"),
    DOCUMENT.replace(".pdf", ".heic"),
    DOCUMENT.replace(".pdf", ".PDF"),
    DOCUMENT.toUpperCase(),
    `org/${ORG}/asset/${ASSET}/documents/${ID}/${ID}.pdf.exe`,
  ])("matches lib/documents/upload.ts for document path %s", (path) => {
    expect(classifyObject("documents", path).kind === "document").toBe(DOCUMENT_OBJECT_RE.test(path));
  });

  it.each([COVER, COVER.replace(".jpg", ".webp"), COVER.replace(".jpg", ".gif"), COVER.toUpperCase(), `${COVER}x`])(
    "matches lib/assets/cover.ts for cover path %s",
    (path) => {
      expect(classifyObject("public-assets", path).kind === "cover").toBe(COVER_OBJECT_RE.test(path));
    }
  );

  it("builds logo paths under the prefix lib/org/logo.ts manages", () => {
    expect(LOGO.startsWith(`${logoPathPrefix(ORG)}/`)).toBe(true);
    expect(managedLogoObjectPath(`${PUBLIC_BASE}${LOGO}`, ORG)).toBe(LOGO);
    expect(publicObjectPath(`${PUBLIC_BASE}${LOGO}`)).toBe(LOGO);
  });
});

describe("publicObjectPath", () => {
  it("reads the object from a stored public URL and ignores anything else", () => {
    expect(publicObjectPath(`${PUBLIC_BASE}${COVER}?v=2`)).toBe(COVER);
    expect(publicObjectPath("https://cdn.example.com/cover.jpg")).toBeNull();
    expect(publicObjectPath("/demo-assets/excavator-017.svg")).toBeNull();
    expect(publicObjectPath(null)).toBeNull();
  });
});

function refs(overrides = {}) {
  return {
    submissionMedia: new Map(),
    documentPaths: new Set(),
    publicAssetPaths: new Set(),
    ...overrides,
  };
}

const object = (bucket, path, createdAt = hoursAgo(72), size = 1000) => ({ bucket, path, size, createdAt });

describe("planCleanup", () => {
  it("makes old, unreferenced managed objects candidates — oldest first, with counts by kind and organization", () => {
    const { candidates, summary } = planCleanup({
      objects: [
        object("documents", DOCUMENT, hoursAgo(60), 2048),
        object("public-assets", COVER, hoursAgo(100), 512),
        object("public-assets", LOGO, hoursAgo(80), 256),
      ],
      refs: refs(),
      now: NOW,
      olderThanHours: 48,
    });
    expect(candidates.map((c) => c.path)).toEqual([COVER, LOGO, DOCUMENT]);
    expect(summary.total).toEqual({ objects: 3, bytes: 2816 });
    expect(summary.byKind.document).toEqual({ objects: 1, bytes: 2048 });
    expect(summary.byOrg[ORG]).toEqual({ objects: 3, bytes: 2816 });
  });

  it("never makes a referenced, recent, undated or unmanaged object a candidate", () => {
    const { candidates, report } = planCleanup({
      objects: [
        object("documents", DOCUMENT),
        object("public-assets", COVER, hoursAgo(10)),
        object("public-assets", LOGO, null),
        object("public-assets", "demo-assets/x.svg", hoursAgo(1000)),
      ],
      refs: refs({ documentPaths: new Set([DOCUMENT]) }),
      now: NOW,
      olderThanHours: 48,
    });
    expect(candidates).toEqual([]);
    expect(report).toMatchObject({ scanned: 4, referenced: 1, tooNew: 2, unmanaged: 1 });
  });

  it("protects a public-assets object named by any stored URL, not only its own asset's", () => {
    const { candidates } = planCleanup({
      objects: [object("public-assets", COVER)],
      refs: refs({ publicAssetPaths: new Set([COVER]) }),
      now: NOW,
      olderThanHours: 48,
    });
    expect(candidates).toEqual([]);
  });

  it("never touches a recorded submission and reports objects its row does not list", () => {
    const extra = SUBMISSION.replace(`${OTHER}.jpg`, `${ASSET}.png`);
    const { candidates, report } = planCleanup({
      objects: [object("submissions", SUBMISSION), object("submissions", extra)],
      refs: refs({ submissionMedia: new Map([[ID, new Set([SUBMISSION])]]) }),
      now: NOW,
      olderThanHours: 48,
    });
    expect(candidates).toEqual([]);
    expect(report).toMatchObject({ referenced: 2, extraUnderRecordedSubmission: 1 });
  });

  it("judges an unrecorded submission as a whole: one recent object keeps every object in it", () => {
    const second = SUBMISSION.replace(`${OTHER}.jpg`, `${ASSET}.png`);
    const young = planCleanup({
      objects: [object("submissions", SUBMISSION, hoursAgo(90)), object("submissions", second, hoursAgo(2))],
      refs: refs(),
      now: NOW,
      olderThanHours: 48,
    });
    expect(young.candidates).toEqual([]);
    expect(young.report.tooNew).toBe(2);

    const old = planCleanup({
      objects: [object("submissions", SUBMISSION, hoursAgo(90)), object("submissions", second, hoursAgo(50))],
      refs: refs(),
      now: NOW,
      olderThanHours: 48,
    });
    expect(old.candidates.map((c) => [c.kind, c.submissionId])).toEqual([
      ["submission", ID],
      ["submission", ID],
    ]);
  });

  it("reports document rows whose stored file is missing", () => {
    const { report } = planCleanup({
      objects: [],
      refs: refs({ documentPaths: new Set([DOCUMENT]) }),
      now: NOW,
      olderThanHours: 48,
    });
    expect(report.documentRowsMissingObject).toBe(1);
  });
});

describe("deletion authorization", () => {
  const args = (overrides) => ({ ...parseCleanupArgs(["--target=staging"]).args, delete: true, ...overrides });

  it("needs the exact target and live candidate count", () => {
    expect(deletionRefusal(args({ confirm: null }), 3)).toMatch(/staging:3/);
    expect(deletionRefusal(args({ confirm: "staging:4" }), 3)).toMatch(/staging:3/);
    expect(deletionRefusal(args({ confirm: "production:3" }), 3)).toMatch(/staging:3/);
    expect(deletionRefusal(args({ confirm: "staging:3" }), 3)).toBeNull();
  });

  it("also needs the Production acknowledgement on production", () => {
    const production = { target: "production", confirm: "production:2" };
    expect(deletionRefusal(args(production), 2)).toMatch(/acknowledge-production-deletion/);
    expect(deletionRefusal(args({ ...production, acknowledgeProduction: true }), 2)).toBeNull();
  });

  it("refuses a run that was not asked to delete", () => {
    expect(deletionRefusal({ ...args({}), delete: false }, 0)).not.toBeNull();
  });

  it("caps a run at the requested maximum and never above the hard limit", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ path: String(i) }));
    expect(selectForDeletion(many, 5)).toHaveLength(5);
    expect(selectForDeletion(many, 10_000)).toHaveLength(MAX_DELETE_CAP);
  });
});

describe("runDeletion", () => {
  const candidates = [
    { path: "a", size: 10 },
    { path: "b", size: 20 },
    { path: "c", size: 30 },
  ];

  it("re-checks and removes one object at a time", async () => {
    const calls = [];
    const result = await runDeletion({
      selected: candidates,
      isReferencedNow: async (c) => (calls.push(`check:${c.path}`), false),
      removeObject: async (c) => (calls.push(`remove:${c.path}`), true),
    });
    expect(calls).toEqual(["check:a", "remove:a", "check:b", "remove:b", "check:c", "remove:c"]);
    expect(result).toEqual({ removed: 3, removedBytes: 60, skippedNowReferenced: 0, failed: 0, aborted: false });
  });

  it("skips an object that became referenced and counts a failed removal", async () => {
    const result = await runDeletion({
      selected: candidates,
      isReferencedNow: async (c) => c.path === "a",
      removeObject: async (c) => c.path !== "b",
    });
    expect(result).toMatchObject({ removed: 1, skippedNowReferenced: 1, failed: 1, aborted: false });
  });

  it("stops before removing anything further when a re-check cannot answer", async () => {
    const removeObject = vi.fn(async () => true);
    const result = await runDeletion({
      selected: candidates,
      isReferencedNow: async (c) => {
        if (c.path === "b") throw new Error("timeout");
        return false;
      },
      removeObject,
    });
    expect(removeObject).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ removed: 1, aborted: true });
  });
});

describe("formatBytes", () => {
  it("formats bytes for the report", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
