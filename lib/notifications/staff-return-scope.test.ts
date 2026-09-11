import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Engineering Phase D3B (locked decision #12): staff returns never send an individual email in Phase D — staff return
 * exceptions reach only the daily summary. The staff workflows must not schedule or send a notification at all, and
 * the notifier refuses staff-origin rows (lib/notifications/notify.test.ts "refuses a staff return").
 */
function codeOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("staff workflows never email individually", () => {
  it.each(["../inspections/staff-return-submit.ts", "../inspections/outbound-submit.ts"])(
    "%s schedules and sends no notification",
    (file) => {
      const source = codeOf(file);
      expect(source).not.toContain("scheduleSubmissionNotification");
      expect(source).not.toContain("notifySubmission");
      expect(source).not.toContain("sendNotificationEmail");
    }
  );
});
