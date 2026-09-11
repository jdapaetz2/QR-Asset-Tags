import { describe, expect, it } from "vitest";

import type { NotificationPriority } from "./priority";
import {
  MAX_PREVIEWS_PER_EMAIL,
  previewRequestCount,
  resolveSubmissionRecipients,
  resolveTagStatusRecipients,
} from "./routing";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings, type SubmissionFormType } from "./settings";

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, notification_email: "ops@yard.test", ...overrides };
}

function route(formType: SubmissionFormType, priority: NotificationPriority, s: NotificationSettings) {
  return resolveSubmissionRecipients({ formType, priority, settings: s });
}

const URGENT_ON = { notify_urgent_reports: true, urgent_notification_email: "oncall@yard.test" } as const;

describe("damage and support — the main route", () => {
  it.each(["damage_report", "support_request"] as const)("%s: main only when its general switch is on", (formType) => {
    expect(route(formType, "follow_up", settings())).toEqual({
      sends: [{ route: "main", recipient: "ops@yard.test" }],
      skip: null,
    });
  });

  it("each report type follows its own switch", () => {
    const s = settings({ notify_damage_reports: false, notify_support_requests: true });
    expect(route("damage_report", "routine", s).sends).toEqual([]);
    expect(route("support_request", "routine", s).sends).toHaveLength(1);
  });

  it("a stored address is re-validated before it is used", () => {
    expect(route("damage_report", "routine", settings({ notification_email: "not-an-address" }))).toEqual({
      sends: [],
      skip: "skipped_no_recipient",
    });
    expect(route("damage_report", "routine", settings({ notification_email: "  ops@yard.test " })).sends).toEqual([
      { route: "main", recipient: "ops@yard.test" },
    ]);
  });
});

describe("the urgent route — independent of the general switches", () => {
  it("immediate report, general switch OFF → urgent only", () => {
    const s = settings({ notify_damage_reports: false, notify_support_requests: false, ...URGENT_ON });
    for (const formType of ["damage_report", "support_request"] as const) {
      expect(route(formType, "immediate", s)).toEqual({
        sends: [{ route: "urgent", recipient: "oncall@yard.test" }],
        skip: null,
      });
    }
  });

  it("immediate report, both on, different addresses → two separate sends, main first", () => {
    expect(route("damage_report", "immediate", settings(URGENT_ON)).sends).toEqual([
      { route: "main", recipient: "ops@yard.test" },
      { route: "urgent", recipient: "oncall@yard.test" },
    ]);
  });

  it("the same address (case and spacing aside) sends once, classified main_and_urgent", () => {
    const s = settings({ notify_urgent_reports: true, urgent_notification_email: "  OPS@Yard.test " });
    expect(route("support_request", "immediate", s).sends).toEqual([
      { route: "main_and_urgent", recipient: "ops@yard.test" },
    ]);
  });

  it.each(["follow_up", "routine", "record"] as const)("a %s report never reaches the urgent route", (priority) => {
    expect(route("damage_report", priority, settings(URGENT_ON)).sends).toEqual([
      { route: "main", recipient: "ops@yard.test" },
    ]);
    expect(route("damage_report", priority, settings({ notify_damage_reports: false, ...URGENT_ON }))).toEqual({
      sends: [],
      skip: "skipped_disabled",
    });
  });

  it("urgent switch on without a usable address sends nothing on that route", () => {
    const off = settings({ notify_damage_reports: false });
    expect(route("damage_report", "immediate", { ...off, notify_urgent_reports: true, urgent_notification_email: null })).toEqual({
      sends: [],
      skip: "skipped_no_recipient",
    });
    expect(
      route("damage_report", "immediate", { ...off, notify_urgent_reports: true, urgent_notification_email: "bad@" })
    ).toEqual({ sends: [], skip: "skipped_no_recipient" });
    // With the general route still available, the report goes there.
    expect(
      route("damage_report", "immediate", settings({ notify_urgent_reports: true, urgent_notification_email: null })).sends
    ).toEqual([{ route: "main", recipient: "ops@yard.test" }]);
  });

  it("the urgent route does not need the default address", () => {
    const s = settings({ notification_email: null, notify_damage_reports: false, ...URGENT_ON });
    expect(route("damage_report", "immediate", s).sends).toEqual([{ route: "urgent", recipient: "oncall@yard.test" }]);
  });

  it("an address kept while the urgent switch is off is not used", () => {
    const s = settings({ notify_damage_reports: false, notify_urgent_reports: false, urgent_notification_email: "oncall@yard.test" });
    expect(route("damage_report", "immediate", s)).toEqual({ sends: [], skip: "skipped_disabled" });
  });
});

describe("renter return checklists — explicit modes", () => {
  it.each(["follow_up", "routine", "record"] as const)(
    "instant_renter emails every renter return individually (%s, exceptions or clean)",
    (priority) => {
      expect(route("return_checklist", priority, settings({ return_notification_mode: "instant_renter" }))).toEqual({
        sends: [{ route: "main", recipient: "ops@yard.test" }],
        skip: null,
      });
    }
  );

  it.each(["daily_exceptions", "off"] as const)("%s sends no individual email", (mode) => {
    for (const priority of ["follow_up", "routine", "record"] as const) {
      expect(route("return_checklist", priority, settings({ return_notification_mode: mode }))).toEqual({
        sends: [],
        skip: "skipped_disabled",
      });
    }
  });

  it("never uses the urgent route, even with urgent on and a different address", () => {
    const s = settings({ return_notification_mode: "instant_renter", ...URGENT_ON });
    expect(route("return_checklist", "immediate", s).sends).toEqual([{ route: "main", recipient: "ops@yard.test" }]);
    expect(route("return_checklist", "immediate", { ...s, return_notification_mode: "off" })).toEqual({
      sends: [],
      skip: "skipped_disabled",
    });
  });

  it("instant_renter without an address is a missing recipient, not a disabled route", () => {
    expect(
      route("return_checklist", "follow_up", settings({ return_notification_mode: "instant_renter", notification_email: null }))
    ).toEqual({ sends: [], skip: "skipped_no_recipient" });
  });

  it("ignores damage and support switches", () => {
    const s = settings({ notify_damage_reports: false, notify_support_requests: false, return_notification_mode: "instant_renter" });
    expect(route("return_checklist", "routine", s).sends).toHaveLength(1);
  });
});

describe("tag request status", () => {
  it("uses its own switch and the default address only", () => {
    expect(resolveTagStatusRecipients(settings({ notify_tag_request_updates: true }))).toEqual({
      sends: [{ route: "main", recipient: "ops@yard.test" }],
      skip: null,
    });
    expect(resolveTagStatusRecipients(settings({ notify_tag_request_updates: false, ...URGENT_ON }))).toEqual({
      sends: [],
      skip: "skipped_disabled",
    });
    expect(
      resolveTagStatusRecipients(settings({ notify_tag_request_updates: true, notification_email: null, ...URGENT_ON }))
    ).toEqual({ sends: [], skip: "skipped_no_recipient" });
  });
});

describe("determinism", () => {
  it("the same inputs always produce the same decision", () => {
    const s = settings(URGENT_ON);
    expect(route("damage_report", "immediate", s)).toEqual(route("damage_report", "immediate", s));
  });

  it("never plans more than two sends", () => {
    for (const formType of ["damage_report", "support_request", "return_checklist"] as const) {
      for (const priority of ["immediate", "follow_up", "routine", "record"] as const) {
        expect(
          route(formType, priority, settings({ ...URGENT_ON, return_notification_mode: "instant_renter" })).sends.length
        ).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("previewRequestCount", () => {
  it("requests none when the organization turned previews off", () => {
    expect(previewRequestCount(false, 5)).toBe(0);
  });

  it("requests up to the cap when on", () => {
    expect(previewRequestCount(true, 0)).toBe(0);
    expect(previewRequestCount(true, 2)).toBe(2);
    expect(previewRequestCount(true, 9)).toBe(MAX_PREVIEWS_PER_EMAIL);
    expect(previewRequestCount(true, Number.NaN)).toBe(0);
  });
});
