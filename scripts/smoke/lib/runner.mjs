/**
 * Shared smoke-run plumbing (Phase B5): result recording, failure artifacts, and the Vercel
 * protection-bypass header.
 *
 * DESIGN NOTES
 *
 * No retries. Playwright's E2E config retries, which is right for a suite that reseeds its fixtures —
 * but a smoke run submits real forms, and retrying a step that already wrote a row produces a duplicate
 * submission. A smoke check either passes on the first attempt or it is a finding.
 *
 * No polling loops. Every wait here is a bounded `waitFor`; nothing spins.
 *
 * SKIP is a first-class outcome, distinct from PASS. A check that could not run because its input was
 * not configured must never be reported as passing — that is the "false-positive smoke result" failure
 * mode, and it is worse than a red run because nobody investigates a green one.
 *
 * The bypass secret is read from the environment and used only as a request header. It is never printed,
 * never written to an artifact filename, never included in a result note, and never placed on a command
 * line.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARTIFACT_DIR = "smoke-artifacts";

/** Header map for a Vercel deployment-protected preview, or {} when no secret is configured. */
export function bypassHeaders(env = process.env) {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

/** True when a bypass secret is present — reports PRESENCE only, never the value. */
export function hasBypass(env = process.env) {
  return Boolean(env.VERCEL_AUTOMATION_BYPASS_SECRET);
}

/** Strip anything credential-shaped from a note before it is printed or written to disk. */
function scrub(text) {
  if (!text) return "";
  return String(text)
    .replace(/(bypass|token|secret|key|password)=[^\s&]+/gi, "$1=<redacted>")
    .slice(0, 300);
}

export function createRun({ label, target, host }) {
  const rows = [];
  let artifactsWritten = 0;

  const emit = (status, area, check, note) => {
    rows.push({ status, area, check, note: scrub(note) });
    process.stderr.write(
      `  [${status.padEnd(4)}] ${area} — ${check}${note ? ` — ${scrub(note)}` : ""}\n`
    );
  };

  return {
    pass: (area, check, note = "") => emit("PASS", area, check, note),
    fail: (area, check, note = "") => emit("FAIL", area, check, note),
    /** Not run, and deliberately NOT counted as a pass. */
    skip: (area, check, why) => emit("SKIP", area, check, why),
    /** Record a boolean check in one call. */
    check: (area, check, ok, note = "") => emit(ok ? "PASS" : "FAIL", area, check, note),

    /**
     * Capture a screenshot + HTML on failure only. Artifacts are named after the check, never after
     * any input value, so a secret cannot reach a filename.
     */
    async capture(page, name) {
      try {
        mkdirSync(ARTIFACT_DIR, { recursive: true });
        const safe = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
        const base = join(ARTIFACT_DIR, `${label}-${safe}`);
        await page.screenshot({ path: `${base}.png`, fullPage: true });
        writeFileSync(`${base}.html`, await page.content(), "utf8");
        artifactsWritten++;
      } catch {
        // An artifact failure must never mask the check failure that triggered it.
      }
    },

    report() {
      console.log(`\n| Area | Check | Result | Note |`);
      console.log(`|---|---|---|---|`);
      for (const r of rows) console.log(`| ${r.area} | ${r.check} | ${r.status} | ${r.note} |`);
      const failed = rows.filter((r) => r.status === "FAIL").length;
      const skipped = rows.filter((r) => r.status === "SKIP").length;
      const passed = rows.length - failed - skipped;
      console.log(
        `\n${label} smoke against ${target} (${host}): ` +
          `${rows.length} checks — ${passed} pass, ${failed} fail, ${skipped} skipped.`
      );
      if (skipped) {
        console.log(`  ${skipped} check(s) SKIPPED — not run, and not counted as passing. See notes above.`);
      }
      if (artifactsWritten) console.log(`  ${artifactsWritten} failure artifact(s) in ./${ARTIFACT_DIR}/`);
      console.log("");
      return failed === 0;
    },
  };
}

/** Bounded visibility wait. Returns a boolean rather than throwing, so one miss cannot abort the run. */
export async function visible(locator, ms = 10_000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout: ms });
    return true;
  } catch {
    return false;
  }
}
