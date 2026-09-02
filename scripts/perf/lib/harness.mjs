/**
 * Phase C0 performance harness — shared measurement plumbing.
 *
 * DESIGN RULES, and why each exists:
 *
 * SKIP IS NOT PASS, AND A MISSING CREDENTIAL IS A FAILURE. `qa/staging-vitals.mjs` reported
 * "skipped: no QA credentials supplied" as an ordinary table row, so the authenticated routes — the
 * ones most likely to be slow — silently went unmeasured and the run still looked complete. Here an
 * authenticated route with no credentials FAILS the run, and any skip marks coverage incomplete.
 *
 * WARM-UP IS SEPARATE FROM MEASUREMENT. Two discarded navigations precede the measured samples, so a
 * first-hit compile/connection cost is never folded into a "warm" median.
 *
 * COLD IS A CANDIDATE, NOT A CLAIM. A serverless cold start cannot be proven from the client. A first
 * request after a recorded idle period is labelled `cold_candidate` with the idle duration attached.
 *
 * NO SECRETS, NO PII. Recorded: timings, counts, bytes, status, region. Never: cookies, auth headers,
 * signed URLs, submitter data, or any credential. Request URLs are reduced to a path + a coarse kind.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARTIFACT_DIR = join("qa-artifacts", "performance");

/** Two discarded navigations before any measured sample. */
export const WARMUP_NAVIGATIONS = 2;
/** Measured warm samples per route. Ten supports a median and a usable p75; NOT a p95. */
export const WARM_SAMPLES = 10;

export const median = (xs) => {
  const v = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Nearest-rank p75. With ten samples this is the 8th value — a real order statistic, unlike a p95,
 * which ten samples cannot support and which this harness therefore never reports.
 */
export const p75 = (xs) => {
  const v = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.ceil(0.75 * v.length) - 1)];
};

export const range = (xs) => {
  const v = xs.filter((n) => typeof n === "number" && Number.isFinite(n));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};

export const ms = (n) => (n == null ? "—" : `${Math.round(n)} ms`);

/**
 * In-page metric collection. Must be an IIFE: `page.evaluate` treats a string as an EXPRESSION, so a
 * bare arrow function would evaluate to the function itself rather than running it.
 */
export const COLLECT = `(() => new Promise((resolve) => {
  const out = { ttfb: null, docStream: null, domContentLoaded: null, loadEvent: null, fcp: null, lcp: null, cls: 0 };
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) {
    out.ttfb = nav.responseStart;
    // THE server-side number that matters for a streaming RSC response. responseStart is when the
    // SHELL flushes — it is ~30 ms on every route and says nothing about data work. responseEnd is
    // when the stream CLOSES, i.e. when the server finished every await in the page. The gap between
    // them is the server data duration, measured without instrumenting the app.
    out.docStream = nav.responseEnd != null && nav.requestStart != null
      ? nav.responseEnd - nav.requestStart
      : null;
    out.domContentLoaded = nav.domContentLoadedEventEnd;
    out.loadEvent = nav.loadEventEnd || null;
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') out.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      const es = l.getEntries();
      if (es.length) out.lcp = es[es.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* partial metrics report as null rather than as zero */ }
  setTimeout(() => resolve(out), 2000);
}))()`;

/**
 * Count requests and bytes for one navigation, and capture the Vercel serving region from the document
 * response. `x-vercel-id` is `<edge>::<function>::<id>` — real platform evidence for where the request
 * was served, which a browser timing alone cannot tell you.
 */
export function attachRequestMeter(page) {
  const meter = { requests: 0, bytes: 0, status: null, vercelId: null, cache: null };
  const onRequestFinished = async (request) => {
    meter.requests++;
    try {
      const sizes = await request.sizes();
      meter.bytes += (sizes?.responseBodySize ?? 0) + (sizes?.responseHeadersSize ?? 0);
    } catch {
      // A request that never completed contributes no bytes; it is still counted.
    }
  };
  page.on("requestfinished", onRequestFinished);
  return {
    meter,
    /** Record the top-level document response only — never a signed media URL. */
    noteDocument(response) {
      if (!response) return;
      meter.status = response.status();
      const h = response.headers();
      // Region only. The id segment is an opaque request id, kept because it correlates with the
      // Vercel function log for the same request.
      meter.vercelId = h["x-vercel-id"] ?? null;
      meter.cache = h["x-vercel-cache"] ?? null;
    },
    reset() {
      meter.requests = 0;
      meter.bytes = 0;
      meter.status = null;
      meter.vercelId = null;
      meter.cache = null;
    },
    detach() {
      page.off("requestfinished", onRequestFinished);
    },
  };
}

/**
 * `pdx1::pdx1::abc` → `pdx1` (the function region).
 *
 * A response served without invoking a function (a prerendered/static route, or an edge cache hit)
 * carries an id with no `::` separator. That is not a region, so it must not be reported as one —
 * returning the raw value would put an opaque request id in the region column and, worse, imply the
 * route ran somewhere it did not. Those cases report `static/edge`.
 */
export function regionOf(vercelId) {
  if (!vercelId) return null;
  const parts = String(vercelId).split("::");
  if (parts.length < 2) return "static/edge";
  return parts[1];
}

export function createRun({ environment, host, deploymentCommit }) {
  const startedAt = new Date().toISOString();
  const samples = [];
  const actions = [];
  const notes = [];
  let failures = 0;
  let skips = 0;

  return {
    startedAt,
    addSample(row) {
      samples.push(row);
    },
    addAction(row) {
      actions.push(row);
    },
    note(text) {
      notes.push(text);
      process.stderr.write(`  ${text}\n`);
    },
    fail(text) {
      failures++;
      notes.push(`FAIL: ${text}`);
      process.stderr.write(`  [FAIL] ${text}\n`);
    },
    skip(text) {
      skips++;
      notes.push(`SKIP: ${text}`);
      process.stderr.write(`  [SKIP] ${text}\n`);
    },
    get failures() {
      return failures;
    },
    get skips() {
      return skips;
    },

    /** Group measured samples by route + device class + phase, and summarise. */
    summarise() {
      const groups = new Map();
      for (const s of samples) {
        const key = `${s.deviceClass}|${s.route}|${s.phase}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      return [...groups.entries()].map(([key, rows]) => {
        const [deviceClass, route, phase] = key.split("|");
        const pick = (f) => rows.map(f);
        return {
          deviceClass,
          route,
          phase,
          n: rows.length,
          role: rows[0].role,
          region: rows[0].region,
          status: rows[0].status,
          ttfb: { median: median(pick((r) => r.ttfb)), p75: p75(pick((r) => r.ttfb)), range: range(pick((r) => r.ttfb)) },
          docStream: {
            median: median(pick((r) => r.docStream)),
            p75: p75(pick((r) => r.docStream)),
            range: range(pick((r) => r.docStream)),
          },
          lcp: { median: median(pick((r) => r.lcp)), p75: p75(pick((r) => r.lcp)), range: range(pick((r) => r.lcp)) },
          fcp: { median: median(pick((r) => r.fcp)) },
          navTotal: {
            median: median(pick((r) => r.navTotal)),
            p75: p75(pick((r) => r.navTotal)),
            range: range(pick((r) => r.navTotal)),
          },
          cls: median(pick((r) => r.cls)),
          requests: median(pick((r) => r.requests)),
          bytes: median(pick((r) => r.bytes)),
          idleMs: rows[0].idleMs ?? null,
        };
      });
    },

    /** Raw JSON + a human-readable Markdown summary. Both gitignored. */
    write(summary) {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      const stamp = startedAt.replace(/[:.]/g, "-");
      const base = join(ARTIFACT_DIR, `${environment}-${stamp}`);
      const payload = {
        environment,
        host,
        deploymentCommit,
        startedAt,
        method: {
          warmupNavigations: WARMUP_NAVIGATIONS,
          warmSamples: WARM_SAMPLES,
          statistics: "median, p75 (nearest-rank), min-max range. p95 NOT reported — 10 samples cannot support it.",
        },
        summary,
        samples,
        actions,
        notes,
        failures,
        skips,
      };
      writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2), "utf8");
      writeFileSync(`${base}.md`, renderMarkdown(payload), "utf8");
      return { json: `${base}.json`, md: `${base}.md` };
    },
  };
}

function renderMarkdown(p) {
  const L = [];
  L.push(`# Performance baseline — ${p.environment.toUpperCase()}`);
  L.push("");
  L.push(`- host: \`${p.host}\``);
  L.push(`- deployment commit: \`${p.deploymentCommit ?? "unknown"}\``);
  L.push(`- started: ${p.startedAt}`);
  L.push(`- method: ${p.method.warmupNavigations} warm-ups discarded, ${p.method.warmSamples} measured warm samples`);
  L.push(`- statistics: ${p.method.statistics}`);
  L.push("");
  L.push(`## Routes`);
  L.push("");
  L.push(`| Device | Route | Role | n | Region | TTFB med (shell) | Server stream med | Server stream p75 | LCP med | LCP p75 | LCP range | Nav med | Reqs | KB | CLS |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const s of p.summary) {
    const r = s.lcp.range ? `${Math.round(s.lcp.range[0])}–${Math.round(s.lcp.range[1])} ms` : "—";
    L.push(
      `| ${s.deviceClass} | ${s.route} | ${s.role} | ${s.n} | ${s.region ?? "—"} | ${ms(s.ttfb.median)} | ${ms(s.docStream.median)} | ${ms(s.docStream.p75)} | ${ms(s.lcp.median)} | ${ms(s.lcp.p75)} | ${r} | ${ms(s.navTotal.median)} | ${s.requests ?? "—"} | ${s.bytes ? Math.round(s.bytes / 1024) : "—"} | ${s.cls == null ? "—" : s.cls.toFixed(3)} |`
    );
  }
  L.push("");
  L.push(`> **TTFB is the SHELL flush, not server work.** These pages stream, so \`responseStart\` is early and`);
  L.push(`> nearly constant across routes. **Server stream** (\`responseEnd - requestStart\`) is when the stream`);
  L.push(`> closed — the server finished every await — and is the server-side number to compare.`);
  if (p.actions.length) {
    L.push("");
    L.push(`## Actions`);
    L.push("");
    L.push(`| Action | Pending visible | Response/redirect | Final content | Total | Status |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const a of p.actions) {
      L.push(
        `| ${a.action} | ${ms(a.pendingMs)} | ${ms(a.responseMs)} | ${ms(a.contentMs)} | ${ms(a.totalMs)} | ${a.ok ? "PASS" : "FAIL"} |`
      );
    }
  }
  L.push("");
  L.push(`## Run notes`);
  L.push("");
  for (const n of p.notes) L.push(`- ${n}`);
  L.push("");
  L.push(`**${p.failures} failure(s), ${p.skips} skip(s).** A skip means the check did not run and coverage is incomplete; it is never a pass.`);
  L.push("");
  return L.join("\n");
}
