import { beforeEach, describe, expect, it, vi } from "vitest";

// The notifier is submission-safety-critical: it must classify skip reasons, pass through the send
// outcome, and NEVER throw (a notification failure can't break the submission that triggered it).

const { state, sendMock, logMock } = vi.hoisted(() => ({
  state: {
    orgRow: null as Record<string, unknown> | null,
    sendResult: { outcome: "dry_run", attempts: 0 } as { outcome: string; attempts: number; providerId?: string },
    sendThrows: false,
  },
  sendMock: vi.fn(async () => {
    if (state.sendThrows) throw new Error("boom");
    return state.sendResult;
  }),
  logMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "organizations"
                ? state.orgRow
                : { asset_code: "A-1", asset_name: "Asset", category: "Excavator" },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/notifications/send", () => ({ sendNotificationEmail: sendMock }));
vi.mock("@/lib/notifications/log", () => ({ logNotificationEvent: logMock }));

import { notifySubmission } from "@/lib/notifications/notify";

function orgWith(overrides: Record<string, unknown>) {
  return {
    name: "Org",
    notification_email: "owner@yard.test",
    notify_damage_reports: true,
    notify_support_requests: true,
    notify_return_checklists: true,
    notify_tag_request_updates: true,
    ...overrides,
  };
}

const baseInput = {
  organizationId: "org-1",
  formType: "damage_report" as const,
  assetId: "asset-1",
  submittedBy: { name: "R", email: null, phone: null },
  submissionId: "sub-1",
  reference: "SUB-2026-000001",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.sendThrows = false;
  state.sendResult = { outcome: "dry_run", attempts: 0 };
  // notify.ts builds an admin URL from publicEnv.siteUrl; give it a value for the tests.
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
});

describe("notifySubmission skip classification", () => {
  it("logs skipped_no_recipient and does NOT send when no notification_email", async () => {
    state.orgRow = orgWith({ notification_email: null });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
  });

  it("logs skipped_disabled and does NOT send when the form-type flag is off", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
  });
});

describe("notifySubmission send passthrough", () => {
  it("passes the send outcome through to the log (dry_run)", async () => {
    state.orgRow = orgWith({});
    await notifySubmission(baseInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dry_run" }));
  });

  it("records a sent outcome with the provider id", async () => {
    state.orgRow = orgWith({});
    state.sendResult = { outcome: "sent", attempts: 1, providerId: "resend-9" };
    await notifySubmission(baseInput);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sent", providerId: "resend-9" })
    );
  });
});

describe("submission-safety", () => {
  it("never throws even if the sender throws, and logs a failure", async () => {
    state.orgRow = orgWith({});
    state.sendThrows = true;
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_transient", failureClass: "exception" })
    );
  });
});
