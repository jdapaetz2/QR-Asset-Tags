import { hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { DATASET_FILE, MEDIA_FILE, SCENARIO_FILE, SHOWCASE_DIR, serializeDataset } from "../../lib/showcase-dataset.mjs";
import { buildShowcaseDataset, type Dataset, type MediaMap, type Scenario } from "./build-dataset";

/**
 * Engineering Phase E2B — writes docs/phase-e/showcase/dataset.json (run by `npm run phase-e:showcase:build`, which uses
 * vitest only so the app's TypeScript modules load). SHOWCASE_ANCHOR=YYYY-MM-DD rebuilds for another anchor date (an
 * explicit refresh, docs/phase-e/DEMO_REFRESH_POLICY.md); SHOWCASE_OUT writes somewhere else instead of the tracked file.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

it("builds the showcase dataset", () => {
  const scenarioText = readFileSync(path.join(REPO, SCENARIO_FILE), "utf8");
  const scenario = JSON.parse(scenarioText) as Scenario;
  const media = JSON.parse(readFileSync(path.join(REPO, MEDIA_FILE), "utf8")) as MediaMap;
  for (const item of media.items) {
    const bytes = readFileSync(path.join(REPO, SHOWCASE_DIR, "media", item.file));
    expect(hash("sha256", bytes), `${item.file} no longer matches media.json`).toBe(item.sha256);
  }
  const target = path.join(REPO, DATASET_FILE);
  const previous = existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as Dataset) : null;
  const anchorDate = process.env.SHOWCASE_ANCHOR || undefined;
  if (anchorDate && !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) throw new Error("SHOWCASE_ANCHOR must be YYYY-MM-DD");
  const dataset = buildShowcaseDataset({ scenario, scenarioSha256: hash("sha256", scenarioText), media, previous, anchorDate });
  const out = process.env.SHOWCASE_OUT ? path.resolve(process.env.SHOWCASE_OUT) : target;
  writeFileSync(out, serializeDataset(dataset));
  console.log(`wrote ${path.relative(REPO, out)}: ${JSON.stringify(dataset.summary.sessions)}, ${dataset.rows.form_submissions.length} submissions, ${dataset.rows.scan_events.length} scans, ${dataset.objects.length} objects`);
});
