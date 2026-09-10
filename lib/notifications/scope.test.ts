import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Engineering Phase D1 — scope guards asserted from source. Comments are stripped because the doc comments
 * deliberately discuss what each file must not do.
 */
function codeOf(url: string): string {
  return readFileSync(fileURLToPath(new URL(url, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("staff and outbound notification behaviour is unchanged", () => {
  it.each(["../inspections/staff-return-submit.ts", "../inspections/outbound-submit.ts"])(
    "%s imports no notifier or scheduler",
    (file) => {
      const source = codeOf(file);
      expect(source).not.toContain("@/lib/notifications");
      expect(source).not.toMatch(/scheduleSubmissionNotification|notifySubmission/);
    }
  );
});

describe("the renderer never reads raw submission JSON", () => {
  it("email.ts does not touch submission_data_json", () => {
    expect(codeOf("./email.ts")).not.toContain("submission_data_json");
  });
});

describe("the scheduled payload carries identifiers only", () => {
  it("schedule.ts carries no submitter or summary field", () => {
    const source = codeOf("./schedule.ts");
    expect(source).not.toMatch(/submittedBy|summary/);
  });
});
