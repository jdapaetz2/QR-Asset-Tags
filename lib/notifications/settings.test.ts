import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isReturnNotificationMode,
  normalizeNotificationSettings,
  readNotificationSettings,
  type RawNotificationForm,
} from "./settings";

const VALID: RawNotificationForm = {
  notification_email: "  ops@acme.test ",
  notify_damage_reports: "on",
  notify_support_requests: "on",
  notify_tag_request_updates: undefined,
  notify_urgent_reports: "on",
  urgent_notification_email: " oncall@acme.test ",
  return_notification_mode: "instant_renter",
  notify_include_photo_previews: "on",
};

function form(overrides: RawNotificationForm): RawNotificationForm {
  return { ...VALID, ...overrides };
}

describe("normalizeNotificationSettings", () => {
  it("parses a complete form, trimming both addresses", () => {
    expect(normalizeNotificationSettings(VALID)).toEqual({
      value: {
        notification_email: "ops@acme.test",
        notify_damage_reports: true,
        notify_support_requests: true,
        notify_tag_request_updates: false,
        notify_urgent_reports: true,
        urgent_notification_email: "oncall@acme.test",
        return_notification_mode: "instant_renter",
        notify_include_photo_previews: true,
        notify_return_checklists: true,
      },
    });
  });

  it("treats an empty default email as null when no return mode needs it", () => {
    const result = normalizeNotificationSettings(
      form({ notification_email: "  ", return_notification_mode: "off" })
    );
    expect(result.value?.notification_email).toBeNull();
  });

  it("rejects a malformed default email", () => {
    expect(normalizeNotificationSettings(form({ notification_email: "not-an-email" })).error).toMatch(
      /notification email must be a valid/i
    );
  });

  it("rejects an overlong address", () => {
    const long = `${"a".repeat(250)}@x.co`;
    expect(normalizeNotificationSettings(form({ notification_email: long })).error).toBeTruthy();
  });

  describe("urgent route", () => {
    it("cannot be switched on without an address", () => {
      expect(
        normalizeNotificationSettings(form({ urgent_notification_email: " " })).error
      ).toBe("Add an urgent notification email to turn on urgent notifications.");
    });

    it("rejects an invalid urgent address even while the switch is off", () => {
      expect(
        normalizeNotificationSettings(
          form({ notify_urgent_reports: undefined, urgent_notification_email: "oncall@" })
        ).error
      ).toMatch(/urgent notification email must be a valid/i);
    });

    it("keeps the address when the switch is turned off", () => {
      const result = normalizeNotificationSettings(form({ notify_urgent_reports: undefined }));
      expect(result.value).toMatchObject({ notify_urgent_reports: false, urgent_notification_email: "oncall@acme.test" });
    });

    it("may use the same address as the default", () => {
      const result = normalizeNotificationSettings(form({ urgent_notification_email: "ops@acme.test" }));
      expect(result.value).toMatchObject({ notification_email: "ops@acme.test", urgent_notification_email: "ops@acme.test" });
    });

    it("does not need the default address", () => {
      const result = normalizeNotificationSettings(
        form({ notification_email: "", return_notification_mode: "off" })
      );
      expect(result.value).toMatchObject({ notification_email: null, notify_urgent_reports: true });
    });
  });

  describe("return mode", () => {
    it.each([undefined, "", "weekly", "INSTANT_RENTER"])("rejects %j", (mode) => {
      expect(normalizeNotificationSettings(form({ return_notification_mode: mode })).error).toBe(
        "Choose how return checklists are handled."
      );
    });

    it.each(["instant_renter", "daily_exceptions"])("%s needs a valid default address", (mode) => {
      expect(
        normalizeNotificationSettings(form({ return_notification_mode: mode, notification_email: "" })).error
      ).toBe("Add a notification email to receive return checklist notifications.");
    });

    it("off needs no address", () => {
      expect(
        normalizeNotificationSettings(form({ return_notification_mode: "off", notification_email: "" })).value
      ).toBeTruthy();
    });

    it.each([
      ["instant_renter", true],
      ["daily_exceptions", false],
      ["off", false],
    ] as const)("mirrors the legacy boolean: %s → %s", (mode, legacy) => {
      expect(normalizeNotificationSettings(form({ return_notification_mode: mode })).value?.notify_return_checklists).toBe(
        legacy
      );
    });
  });

  it("parses the photo preview switch", () => {
    expect(
      normalizeNotificationSettings(form({ notify_include_photo_previews: undefined })).value?.notify_include_photo_previews
    ).toBe(false);
  });
});

describe("defaults", () => {
  it("match the migration: previews on, urgent off, returns off", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toMatchObject({
      notify_include_photo_previews: true,
      notify_urgent_reports: false,
      urgent_notification_email: null,
      return_notification_mode: "off",
    });
  });

  it("isReturnNotificationMode accepts exactly the three modes", () => {
    expect(["instant_renter", "daily_exceptions", "off"].every(isReturnNotificationMode)).toBe(true);
    expect(isReturnNotificationMode("digest")).toBe(false);
  });
});

describe("readNotificationSettings", () => {
  it("returns the column defaults for a missing row", () => {
    expect(readNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("keeps stored values and replaces malformed ones with defaults", () => {
    expect(
      readNotificationSettings({
        notification_email: "ops@acme.test",
        notify_damage_reports: false,
        notify_urgent_reports: "yes",
        urgent_notification_email: "  ",
        return_notification_mode: "weekly",
        notify_include_photo_previews: false,
      })
    ).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      notification_email: "ops@acme.test",
      notify_damage_reports: false,
      notify_include_photo_previews: false,
    });
  });

  it("never reads the legacy return boolean", () => {
    expect(readNotificationSettings({ notify_return_checklists: true }).return_notification_mode).toBe("off");
  });
});
