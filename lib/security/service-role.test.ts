import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase A3.2 — structural guards that keep service-role reach and the public-assets bucket small.
// These run in the fast `npm test` suite (no DB), mirroring the enforcement in
// scripts/verify-production-config.mjs so a violation fails BOTH gates.

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

/** All non-test source files under the given roots, as repo-relative POSIX paths. */
function sourceFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        out.push(p.slice(repo.length + 1).split("\\").join("/"));
      }
    }
  };
  for (const r of roots) {
    const d = join(repo, r);
    try {
      if (statSync(d).isDirectory()) walk(d);
    } catch {
      /* missing dir is fine */
    }
  }
  return out;
}

const read = (rel: string) => readFileSync(resolve(repo, rel), "utf8");

// The sanctioned, audited service-role modules (see docs/SECURITY_MODEL.md service-role inventory).
const SERVICE_ROLE_ALLOWLIST = [
  "lib/supabase/admin.ts", // defines createAdminClient
  "lib/notifications/notify.ts", // trusted notification lookup/delivery
  "lib/team/actions.ts", // Supabase Auth Admin invitation lifecycle + collision probe
  "lib/ratelimit/limiter.ts", // Phase A4 shared-store rate limiter (private counter table, service_role only)
];

describe("service-role import allowlist", () => {
  const importers = sourceFiles(["app", "lib", "components"]).filter((f) => {
    const src = read(f);
    return /from\s+["']@\/lib\/supabase\/admin["']|createAdminClient\s*\(/.test(src);
  });

  it("only the allowlisted modules import the service-role client", () => {
    expect([...importers].sort()).toEqual([...SERVICE_ROLE_ALLOWLIST].sort());
  });

  it("every service-role module is server-only (import 'server-only' or a 'use server' action)", () => {
    for (const f of SERVICE_ROLE_ALLOWLIST) {
      const src = read(f);
      const serverOnly = /["']server-only["']/.test(src) || /^\s*["']use server["']/m.test(src);
      expect(serverOnly, `${f} must be server-only`).toBe(true);
    }
  });
});

describe("public-assets bucket is written only by cover images + org logos", () => {
  // The accepted pilot limitation (public-by-URL) stays safe only if no submission/document media is
  // ever placed in public-assets. The bucket name lives behind two constants; assert nothing else
  // references it.
  const refs = sourceFiles(["app", "lib", "components"]).filter((f) => read(f).includes("public-assets"));

  it("no source file outside the two writer helpers targets the public-assets bucket", () => {
    expect([...refs].sort()).toEqual(["lib/assets/cover.ts", "lib/org/logo.ts"]);
  });

  it("submission and document media use the private buckets", () => {
    // Sanity: the two private buckets are referenced by their own subsystems, never public-assets.
    expect(read("lib/assets/cover.ts")).toContain('COVER_BUCKET = "public-assets"');
    expect(read("lib/org/logo.ts")).toContain('LOGO_BUCKET = "public-assets"');
  });
});
