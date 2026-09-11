import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Engineering Phase D4 — image work happens only inside the deferred notification (after the response is sent),
// never on a public or staff submission response path, and never in the daily summary.

const PREVIEW_IMPORT =
  /from\s+["'][^"']*\/(previews|preview-image)["']|from\s+["']sharp["']|import\(\s*["']sharp["']\s*\)/;

const MUST_NOT_IMPORT = [
  "lib/forms/submit.ts",
  "lib/forms/actions.ts",
  "lib/inspections/submit.ts",
  "lib/inspections/staff-return-submit.ts",
  "lib/inspections/outbound-submit.ts",
  "lib/notifications/schedule.ts",
  "lib/notifications/digest.ts",
  "lib/notifications/digest-worker.ts",
  "lib/notifications/digest-store.ts",
  "app/api/cron/return-digest/route.ts",
];

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("preview work stays off the response path and out of the daily summary", () => {
  it.each(MUST_NOT_IMPORT)("%s does not import the preview builder or Sharp", (file) => {
    expect(source(file)).not.toMatch(PREVIEW_IMPORT);
  });

  it("the submission notifier is reached only through after()", () => {
    expect(source("lib/notifications/schedule.ts")).toMatch(/after\(\s*\(\)\s*=>\s*notifySubmission\(/);
  });

  it("only the preview transformer loads Sharp, and lazily", () => {
    expect(source("lib/notifications/notify.ts")).not.toMatch(/["']sharp["']/);
    expect(source("lib/notifications/previews.ts")).not.toMatch(/["']sharp["']/);
    const transformer = source("lib/notifications/preview-image.ts");
    expect(transformer).toMatch(/import\(\s*["']sharp["']\s*\)/);
    expect(transformer).not.toMatch(/^import .*["']sharp["'];?$/m);
    expect(transformer).not.toMatch(/\.(withMetadata|keepExif|keepIccProfile|keepMetadata)\(/);
  });
});
