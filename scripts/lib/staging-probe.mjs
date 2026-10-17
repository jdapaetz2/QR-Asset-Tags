/**
 * Engineering Phase E1 — prove a staging URL is backed by the STAGING database before a runner writes to it.
 *
 * WHY: a branch alias that served staging yesterday can serve Production after a promotion; on 2026-09-14 the staging
 * smoke reached Production that way (docs/OPERATIONS_RUNBOOK.md). The host check in smoke-target.mjs cannot see that,
 * but the database can: the isolation probe code exists only in staging (scripts/staging/seed-staging-qa.mjs), so a
 * deployment that resolves it is reading staging.
 *
 * The probe uses the scan-free `/nojs/t/` render (app/nojs/t/[shortCode]/page.tsx, recordScan={false}), so checking it
 * never writes a scan row anywhere. The response body is inspected in memory and never printed or saved (a resolved page
 * can carry signed document URLs).
 */
import { ISOLATION_PROBE_SHORT_CODE, normalizeOrigin } from "./smoke-target.mjs";

export const STAGING_PROBE_PATH = `/nojs/t/${ISOLATION_PROBE_SHORT_CODE}`;

/** The soft-200 notice components/public/unavailable-notice.tsx renders for a code that does not resolve. */
const UNAVAILABLE = /This page isn(?:&#x27;|&#39;|&apos;|’|')t available/i;
/** The seeded probe points at the public staging QA asset (STG-QA-PUB, "Staging QA Trailer"). */
const PROBE_ASSET = /STG-QA-PUB|Staging QA Trailer/;

/**
 * Pure verdict on a scan-free `/nojs/t/<code>` response for a public route that must resolve to an asset (its code
 * visible on the page) or, with expectResolves=false, must show the unavailable notice. Used by the read-only showcase
 * health check (scripts/phase-e/showcase-health.mjs).
 */
export function publicRouteVerdict({ status, body, assetCode = null, expectResolves = true }) {
  if (status !== 200) return { ok: false, resolved: null, reason: `HTTP ${status}` };
  const unavailable = UNAVAILABLE.test(body ?? "");
  if (!expectResolves) return unavailable ? { ok: true, resolved: false, reason: "unavailable, as required" } : { ok: false, resolved: true, reason: "resolves, but must not" };
  if (unavailable) return { ok: false, resolved: false, reason: "shows the unavailable notice" };
  if (assetCode && !String(body ?? "").includes(assetCode)) return { ok: false, resolved: true, reason: `does not show ${assetCode}` };
  return { ok: true, resolved: true, reason: assetCode ? `resolves to ${assetCode}` : "resolves" };
}

/** Pure verdict on a probe response. */
export function stagingProbeVerdict({ status, body }) {
  if (status !== 200) return { ok: false, reason: `probe returned HTTP ${status}` };
  if (UNAVAILABLE.test(body ?? "")) {
    return { ok: false, reason: "the staging-only probe does not resolve here — this deployment is not reading staging" };
  }
  if (!PROBE_ASSET.test(body ?? "")) return { ok: false, reason: "probe page did not show the staging QA asset" };
  return { ok: true, reason: "staging-only probe resolved" };
}

/**
 * Throw unless `baseUrl` serves the staging database. `headers` carries the Vercel protection bypass when configured.
 * Errors name the host only.
 */
export async function assertStagingBackend({ baseUrl, headers = {}, fetchImpl = fetch }) {
  const origin = normalizeOrigin(baseUrl);
  if (!origin) throw new Error("staging probe: the base URL is not a valid URL");
  const host = new URL(origin).hostname;
  let status = 0;
  let body = "";
  try {
    const res = await fetchImpl(`${origin}${STAGING_PROBE_PATH}`, { headers, redirect: "manual" });
    status = res.status;
    body = await res.text();
  } catch (err) {
    throw new Error(`staging probe could not reach ${host} (${String(err?.message ?? err).split("\n")[0].slice(0, 120)})`);
  }
  const verdict = stagingProbeVerdict({ status, body });
  if (!verdict.ok) throw new Error(`staging probe failed on ${host}: ${verdict.reason}. No write was made.`);
  return { host, reason: verdict.reason };
}
