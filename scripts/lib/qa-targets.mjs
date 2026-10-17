/**
 * Engineering Phase E1 — the QA runner target guard. Pure: no network, no printing. The protected set is read once,
 * at import, from the tracked E0 manifest (docs/phase-e/manifests/protected-demo-routes.json), so the guard can never
 * drift from the route registry it protects.
 *
 * WHY: Northridge is the curated showcase, not a QA sandbox (docs/phase-e/CANONICAL_SHOWCASE_FLEET.md). Its printed
 * codes resolve on Production, and four of them also on staging (migrations 0003/0004) — where a branch alias can start
 * serving Production after a promotion (docs/OPERATIONS_RUNBOOK.md, 2026-09-14). So a runner that scans or writes must
 * prove its short code and organization are QA fixtures of the target it is aimed at, and must never touch a Northridge
 * code, organization or asset on ANY target.
 *
 * FAIL CLOSED: on a hosted target, a code or organization that is not on that target's QA allowlist is refused even if
 * it is not known to be protected — an unknown code may well be a customer's. Loopback targets are disposable, so there
 * only the protected set is refused.
 */
import { readFileSync } from "node:fs";

const MANIFEST = JSON.parse(
  readFileSync(new URL("../../docs/phase-e/manifests/protected-demo-routes.json", import.meta.url), "utf8")
);

export const QA_TARGETS = /** @type {const} */ (["local", "staging", "production"]);

/**
 * Short codes created by supabase/seed.sql that exist only on local stacks. They are Northridge codes too, and a
 * hosted database could acquire them if seed.sql were ever run there (docs/DEMO_SCRIPT.md hazard banner).
 */
const SEED_ONLY_NORTHRIDGE_CODES = ["demo-sl021", "demo-lt006", "demo-ac012", "demo-ts004", "demo-ss009", "demo-cm005"];

function buildProtected(manifest) {
  const routes = manifest.routes ?? [];
  const others = manifest.other_northridge_qr_rows ?? [];
  const conditional = (manifest.conditional_routes ?? []).flatMap((c) => c.symbols ?? []);
  return Object.freeze({
    organizationIds: new Set([manifest.organization_id]),
    assetIds: new Set([...routes.map((r) => r.asset_id), ...conditional.map((s) => s.asset_id)].filter(Boolean)),
    qrLinkIds: new Set([...routes.map((r) => r.qr_link_id), ...others.map((r) => r.qr_link_id)].filter(Boolean)),
    shortCodes: new Set(
      [...routes.map((r) => r.short_code), ...others.map((r) => r.short_code), ...SEED_ONLY_NORTHRIDGE_CODES].map((c) =>
        c.toLowerCase()
      )
    ),
  });
}

/** Everything a QA runner must never touch, on any target. */
export const PROTECTED = buildProtected(MANIFEST);

/**
 * The QA fixtures each hosted target owns. Sources: scripts/staging/seed-staging-qa.mjs (orgs A/B and the stg-qa-*
 * codes), scripts/qa/staging-qa-data.mjs (the A6.3 org and qa-a63-test) and scripts/production/lib/qa-forms.mjs (the
 * Production QA org and prod-qa-perf-probe; docs/PHASE_C_BASELINE.md §15).
 */
export const QA_FIXTURES = Object.freeze({
  staging: Object.freeze({
    organizationIds: new Set([
      "5ac00000-0000-4000-8000-00000057a610",
      "5ac00000-0000-4000-8000-00000057a620",
      "a6300000-0000-4000-8000-0000000a63a0",
    ]),
    shortCodes: new Set(["stg-qa-public", "stg-qa-rented", "stg-qa-disabled", "stg-qa-orgb", "stg-only-isolation-probe", "qa-a63-test"]),
  }),
  production: Object.freeze({
    organizationIds: new Set(["c0000000-0000-4000-8000-00000000c0a1"]),
    shortCodes: new Set(["prod-qa-perf-probe"]),
  }),
});

/** True for any Northridge code: the registry's twelve, the seed-only ones, and anything with the seed's `demo-` prefix. */
export function isProtectedShortCode(code) {
  const value = String(code ?? "").trim().toLowerCase();
  return value !== "" && (PROTECTED.shortCodes.has(value) || value.startsWith("demo-"));
}

/**
 * Why a QA runner may not scan or write against this target, or null when it may. Pass every identifier the runner
 * will touch; omitted ones are not checked.
 *
 * @param {{ target: string, shortCode?: string|null, organizationId?: string|null, assetId?: string|null }} input
 */
export function qaRunnerRefusal({ target, shortCode = null, organizationId = null, assetId = null }) {
  if (!QA_TARGETS.includes(target)) return `unknown QA target "${String(target).slice(0, 20)}"`;
  const code = shortCode === null || shortCode === undefined ? null : String(shortCode).trim().toLowerCase();
  const org = organizationId ? String(organizationId).toLowerCase() : null;
  const asset = assetId ? String(assetId).toLowerCase() : null;

  if (code !== null && code === "") return "no short code supplied";
  if (code !== null && isProtectedShortCode(code)) {
    return `short code "${code}" belongs to the Northridge showcase; QA runners never scan or write it, on any target`;
  }
  if (org && PROTECTED.organizationIds.has(org)) {
    return "organization is the Northridge showcase; QA runners never write to it, on any target";
  }
  if (asset && PROTECTED.assetIds.has(asset)) return "asset is a protected Northridge showcase asset";

  const fixtures = QA_FIXTURES[target];
  if (fixtures) {
    if (code !== null && !fixtures.shortCodes.has(code)) {
      return `short code "${code}" is not a ${target} QA fixture. Allowed: ${[...fixtures.shortCodes].join(", ")}`;
    }
    if (org && !fixtures.organizationIds.has(org)) return `organization is not a ${target} QA fixture`;
  }
  return null;
}

/** Throwing form, for runners: call before the first request. */
export function assertQaRunnerTarget(input) {
  const refusal = qaRunnerRefusal(input);
  if (refusal) throw new Error(`refusing to run against ${String(input.target).toUpperCase()}: ${refusal}.`);
}
