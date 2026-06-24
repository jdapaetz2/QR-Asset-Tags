import { describe, expect, it } from "vitest";

import {
  normalizeNotificationSettings,
  shouldNotifySubmission,
  type NotificationSettings,
} from "./settings";

describe("normalizeNotificationSettings", () => {
  it("accepts a valid email and parses checkbox flags", () => {
    const result = normalizeNotificationSettings({
      notification_email: "  ops@acme.test ",
      notify_damage_reports: "on",
      notify_support_requests: "on",
      // return + tag omitted → false
    });
    expect(result.value).toEqual({
      notification_email: "ops@acme.test",
      notify_damage_reports: true,
      notify_support_requests: true,
      notify_return_checklists: false,
      notify_tag_request_updates: false,
    });
  });

  it("treats an empty email as null (allowed — just won't send)", () => {
    const result = normalizeNotificationSettings({ notification_email: "  " });
    expect(result.value?.notification_email).toBeNull();
  });

  it("rejects a malformed email", () => {
    const result = normalizeNotificationSettings({ notification_email: "not-an-email" });
    expect(result.error).toMatch(/valid email/i);
  });
});

const base: NotificationSettings = {
  notification_email: "ops@acme.test",
  notify_damage_reports: true,
  notify_support_requests: false,
  notify_return_checklists: false,
  notify_tag_request_updates: false,
};

describe("shouldNotifySubmission", () => {
  it("sends only when the matching flag is enabled", () => {
    expect(shouldNotifySubmission("damage_report", base)).toBe(true);
    expect(shouldNotifySubmission("support_request", base)).toBe(false);
  });

  it("never sends when no notification email is set", () => {
    expect(
      shouldNotifySubmission("damage_report", { ...base, notification_email: null })
    ).toBe(false);
  });

  it("respects the return-checklist flag independently", () => {
    expect(shouldNotifySubmission("return_checklist", base)).toBe(false);
    expect(
      shouldNotifySubmission("return_checklist", {
        ...base,
        notify_return_checklists: true,
      })
    ).toBe(true);
  });
});
