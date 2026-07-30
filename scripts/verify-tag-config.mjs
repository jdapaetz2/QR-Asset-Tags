#!/usr/bin/env node
/**
 * Permanent-tag configuration gate (Phase A7).
 *
 * A physical QR tag is PERMANENT. It encodes `NEXT_PUBLIC_SITE_URL + /t/<short_code>` at the moment it is
 * etched, and that origin must keep resolving for the life of the equipment. This gate answers exactly
 * one question: **is the configured base URL safe to burn into metal?**
 *
 * It is deliberately STRICTER than `verify:production-config`, which only rejects non-https and
 * localhost/placeholder hosts. A Vercel preview host is a perfectly good QA target and passes that check
 * — but it is a disposable deployment, so tags made from it die when the deployment does.
 *
 * EXIT CODE IS THE POINT: while the base URL is not tag-safe this exits 1, so "tags are not cleared" is
 * machine-checkable and can never be mistaken for a passing state. A non-zero exit here is an EXPECTED
 * DEFERRED OPERATOR GATE (the domain has not been purchased yet), **not** a code defect and not a
 * regression. See docs/PRODUCTION_DOMAIN_CHECKLIST.md.
 *
 * Safe by construction: reads one PUBLIC env var (`NEXT_PUBLIC_SITE_URL` is public by definition —
 * it ships in the client bundle), prints no secret, touches no network, mutates nothing.
 *
 * Run: npm run verify:tag-config
 */

/**
 * Mirror of `productionBaseUrlIssue` in lib/qr/production.ts — kept in sync by hand because this is a
 * plain-JS script and cannot import the TypeScript module. The authoritative rule lives there and is
 * unit-tested (lib/qr/production.test.ts), including the `*.vercel.app` case. Same mirroring pattern as
 * scripts/cleanup-orphan-media.mjs. If the rule changes there, change it here.
 */
const PLACEHOLDER_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "placeholder"];

function tagBaseUrlIssue(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "is not a valid URL";
  }
  if (parsed.protocol !== "https:") return "must use https";
  const host = parsed.hostname.toLowerCase();
  if (
    PLACEHOLDER_HOSTS.some((h) => host === h) ||
    host.startsWith("placeholder.") ||
    host.endsWith(".localhost")
  ) {
    return "is a localhost/placeholder host";
  }
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    return "is a Vercel preview/deploy host (disposable — tags made from it would break)";
  }
  return null;
}

const site = process.env.NEXT_PUBLIC_SITE_URL;

console.log("Permanent-tag configuration gate\n");

if (!site) {
  console.log("  BLOCKED  NEXT_PUBLIC_SITE_URL is not set in this shell.");
  console.log("\n  Permanent tag production: NOT CLEARED.");
  console.log("  This is an expected DEFERRED OPERATOR GATE, not a code defect.");
  console.log("  Next step: docs/PRODUCTION_DOMAIN_CHECKLIST.md\n");
  process.exit(1);
}

const issue = tagBaseUrlIssue(site);

if (issue) {
  // The base URL is public, not a secret — safe to print, and printing it is the whole point.
  console.log(`  BLOCKED  NEXT_PUBLIC_SITE_URL (${site}) ${issue}.`);
  console.log("\n  Permanent tag production: NOT CLEARED.");
  console.log("  This is an expected DEFERRED OPERATOR GATE, not a code defect —");
  console.log("  the final domain has not been configured yet. Development, staging,");
  console.log("  demos and E2E testing are unaffected and may continue.");
  console.log("\n  To lift this gate, complete docs/PRODUCTION_DOMAIN_CHECKLIST.md:");
  console.log("    1. a stable production domain exists and is owned by the operator");
  console.log("    2. NEXT_PUBLIC_SITE_URL is set to that https origin");
  console.log("    3. the path-preserving /t/* redirect obligation is documented");
  console.log("    4. a printed sample scans correctly on real phones\n");
  process.exit(1);
}

console.log(`  PASS  NEXT_PUBLIC_SITE_URL (${site}) is a tag-safe production origin.`);
console.log("\n  Configuration gate cleared.");
console.log("  NOTE: this checks CONFIGURATION only. Before producing tags you must also");
console.log("  confirm the redirect obligation and pass physical scan QA — see");
console.log("  docs/PRODUCTION_DOMAIN_CHECKLIST.md and docs/TAG_PRODUCTION_READINESS.md.\n");
