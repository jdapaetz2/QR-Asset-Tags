import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  CLEAN_FLAGS,
  ORG_ID,
  OTHER_ORG_ID,
  SUBMISSION_ID,
  cleanGeneratorValues,
  damageRow,
  mediaPath,
  photo,
  returnRowV2,
  templateV2_20260702,
} from "./__fixtures__/rows";

// The notifier is submission-safety-critical: it must classify skip reasons, build the email from the COMMITTED
// row (Phase D1), refuse anything that does not match what was scheduled, route each recipient separately (Phase
// D3A), attach bounded previews built once (Phase D4), pass through the send outcome, and NEVER throw — a
// notification failure can't break the submission that triggered it.

type SentAttachment = { filename: string; contentType: string; contentId: string; content: Buffer };

type SendArgs = [
  to: string,
  content: { subject: string; text: string; html: string; attachments?: SentAttachment[] },
  deps: Record<string, unknown>,
  options: { idempotencyKey?: string; replyTo?: string },
];

type SendResult = { outcome: string; attempts: number; providerId?: string; reason?: string; failureClass?: string };

type TransformResult =
  | { ok: true; jpeg: Buffer; width: number; height: number; bytes: number }
  | { ok: false; failureClass: string };

const { state, sendMock, logMock, timeMock, transformMock } = vi.hoisted(() => ({
  state: {
    orgRow: null as Record<string, unknown> | null,
    submissionRow: null as Record<string, unknown> | null,
    submissionError: null as unknown,
    assetRow: null as Record<string, unknown> | null,
    tagRow: null as Record<string, unknown> | null,
    tagError: null as unknown,
    queries: [] as { table: string; column: string; value: unknown }[],
    storageMode: "ok" as "ok" | "missing" | "error",
    storageReads: [] as string[],
    sendResult: { outcome: "dry_run", attempts: 0 } as SendResult,
    resultByCall: {} as Record<number, SendResult>,
    sendCalls: 0,
    sendThrows: false,
    throwOnCall: null as number | null,
  },
  sendMock: vi.fn(async (..._args: SendArgs) => {
    const call = state.sendCalls++;
    if (state.sendThrows || state.throwOnCall === call) throw new Error("boom");
    return state.resultByCall[call] ?? state.sendResult;
  }),
  logMock: vi.fn(),
  timeMock: vi.fn(async (_route: string, _phase: string, work: () => Promise<unknown>) => work()),
  transformMock: vi.fn(
    async (_bytes: Uint8Array): Promise<TransformResult> => ({
      ok: true,
      jpeg: Buffer.from("generated-preview"),
      width: 640,
      height: 480,
      bytes: 17,
    })
  ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.queries.push({ table, column, value });
          return builder;
        },
        maybeSingle: async () => {
          if (table === "organizations") return { data: state.orgRow, error: null };
          if (table === "form_submissions") return { data: state.submissionRow, error: state.submissionError };
          if (table === "tag_requests") return { data: state.tagRow, error: state.tagError };
          return { data: state.assetRow, error: null };
        },
      };
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        info: async (path: string) => {
          state.storageReads.push(`info:${bucket}:${path}`);
          if (state.storageMode === "missing") return { data: null, error: { statusCode: "404", message: "Object not found" } };
          if (state.storageMode === "error") return { data: null, error: { statusCode: "500", message: "upstream" } };
          return { data: { size: 2048 }, error: null };
        },
        download: async (path: string) => {
          state.storageReads.push(`download:${bucket}:${path}`);
          return { data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]), error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/notifications/send", () => ({ sendNotificationEmail: sendMock }));
vi.mock("@/lib/notifications/log", () => ({ logNotificationEvent: logMock }));
vi.mock("@/lib/diagnostics/server-timing", () => ({ time: timeMock }));
vi.mock("@/lib/notifications/preview-image", () => ({ transformPreview: transformMock }));

import { notifySubmission, notifyTagRequestStatus } from "@/lib/notifications/notify";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";

function orgWith(overrides: Record<string, unknown>) {
  return {
    name: "Northridge Rentals",
    notification_email: "owner@yard.test",
    notify_damage_reports: true,
    notify_support_requests: true,
    notify_tag_request_updates: true,
    notify_urgent_reports: false,
    urgent_notification_email: null,
    return_notification_mode: "instant_renter",
    notify_include_photo_previews: true,
    ...overrides,
  };
}

const URGENT_ON = { notify_urgent_reports: true, urgent_notification_email: "oncall@yard.test" };

/** An Immediate-attention damage report (reported unsafe to operate). */
function immediateDamageRow() {
  return damageRow(
    { triage_version: 1, reported_equipment_state: "unsafe_to_operate", description: "Tipped on the slope." },
    { submitted_by_name: "Saved Name", media_urls: [mediaPath("damage-1")] }
  );
}

const baseInput = {
  organizationId: ORG_ID,
  assetId: ASSET_ID,
  submissionId: SUBMISSION_ID,
  reference: "SUB-2026-7C0A55",
  formType: "damage_report" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.orgRow = orgWith({});
  state.submissionRow = damageRow(
    { urgency: "high", description: "Hydraulic hose is weeping at the boom coupling." },
    { submitted_by_name: "Saved Name", media_urls: [mediaPath("damage-1")] }
  );
  state.submissionError = null;
  state.assetRow = { asset_code: "EXC-001", asset_name: "Mini Excavator", category: "Excavators" };
  state.tagRow = { id: "tr-9", organization_id: ORG_ID, status: "in_production" };
  state.tagError = null;
  state.queries = [];
  state.storageMode = "ok";
  state.storageReads = [];
  state.sendThrows = false;
  state.throwOnCall = null;
  state.sendCalls = 0;
  state.resultByCall = {};
  state.sendResult = { outcome: "dry_run", attempts: 0 };
  // notify.ts builds links from publicEnv.siteUrl; give it the canonical production host.
  process.env.NEXT_PUBLIC_SITE_URL = "https://mulemark.io";
  process.env.NOTIFICATION_REPLY_TO_EMAIL = "support@mulemark.io";
});

afterEach(() => {
  delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
});

/** The 4th argument of sendNotificationEmail: { idempotencyKey, replyTo }. */
function sendOptions(call = 0) {
  return sendMock.mock.calls[call][3];
}

function sentContent(call = 0) {
  return sendMock.mock.calls[call][1];
}

function recipients() {
  return sendMock.mock.calls.map((call) => call[0]);
}

function loggedLines() {
  return logMock.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

function loggedFailure() {
  return loggedLines().find((fields) => fields.outcome === "failed_transient");
}

function loadedTable(table: string) {
  return state.queries.some((query) => query.table === table);
}

function phases() {
  return timeMock.mock.calls.map((call) => call[1]);
}

describe("notifySubmission skip classification", () => {
  it("logs skipped_no_recipient, does NOT send, and does not load the submission", async () => {
    state.orgRow = orgWith({ notification_email: null });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
    expect(loadedTable("form_submissions")).toBe(false);
  });

  it("logs skipped_disabled and does NOT send when the form-type flag is off", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
    expect(loadedTable("form_submissions")).toBe(false);
  });
});

describe("the email is built from the committed row (D1)", () => {
  it("uses the saved submitter and description, not anything carried in the scheduled payload", async () => {
    const untrusted = {
      ...baseInput,
      submittedBy: { name: "Browser Name", email: "browser@evil.test", phone: null },
      summary: "Browser summary",
    };
    await notifySubmission(untrusted as unknown as typeof baseInput);
    const { text, html } = sentContent();
    expect(text).toContain("Saved Name");
    expect(text).toContain("Hydraulic hose is weeping at the boom coupling.");
    for (const part of [text, html]) {
      expect(part).not.toContain("Browser Name");
      expect(part).not.toContain("browser@evil.test");
      expect(part).not.toContain("Browser summary");
    }
  });

  it("applies the deterministic priority to the subject", async () => {
    await notifySubmission(baseInput);
    expect(sentContent().subject).toBe("Follow up: EXC-001 — reported urgency: high");
  });

  it("loads the asset scoped to the scheduling organization", async () => {
    await notifySubmission(baseInput);
    expect(state.queries).toContainEqual({ table: "assets", column: "organization_id", value: ORG_ID });
    expect(state.queries).toContainEqual({ table: "form_submissions", column: "id", value: SUBMISSION_ID });
  });

  it("renders a renter return checklist from its saved answers", async () => {
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: { ...cleanGeneratorValues(), oil_level: "fail" },
      flags: CLEAN_FLAGS,
    });
    await notifySubmission({ ...baseInput, formType: "return_checklist" });
    expect(sentContent().subject).toBe("Follow up: EXC-001 — renter return checklist, 1 exception");
    expect(sentContent().text).toContain("- Failed check: Oil level");
  });

  it("times load, projection, media and send as separate phases", async () => {
    await notifySubmission(baseInput);
    expect(phases()).toEqual(["notify.load", "notify.project", "notify.media", "notify.send"]);
  });

  it("skips the media phase when there is nothing to preview", async () => {
    state.submissionRow = { ...state.submissionRow, media_urls: [] };
    await notifySubmission(baseInput);
    expect(phases()).toEqual(["notify.load", "notify.project", "notify.send"]);
  });
});

describe("fail closed on anything that does not match what was scheduled", () => {
  it.each([
    ["record_missing", () => (state.submissionRow = null)],
    ["organization_mismatch", () => (state.submissionRow = { ...state.submissionRow, organization_id: OTHER_ORG_ID })],
    ["asset_mismatch", () => (state.submissionRow = { ...state.submissionRow, asset_id: "a0000000-0000-4000-8000-0000000000ff" })],
    ["form_type_mismatch", () => (state.submissionRow = { ...state.submissionRow, form_type: "support_request" })],
    ["origin_mismatch", () => (state.submissionRow = { ...state.submissionRow, submission_origin: "staff" })],
    ["asset_missing", () => (state.assetRow = null)],
    ["load_error", () => (state.submissionError = { message: "connection reset" })],
  ])("%s → no send, one redacted failure line", async (failureClass, arrange) => {
    arrange();
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(state.storageReads).toEqual([]);
    const logged = loggedFailure();
    expect(logged).toMatchObject({ event: "submission", outcome: "failed_transient", failureClass });
    // Only coarse classes and redacted metadata — never a value from the row.
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain("Hydraulic");
    expect(serialized).not.toContain("Saved Name");
    expect(serialized).not.toContain("org/");
  });

  it("refuses a staff return scheduled as a renter return", async () => {
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: cleanGeneratorValues(),
      flags: CLEAN_FLAGS,
      overrides: { submission_origin: "staff" },
    });
    await notifySubmission({ ...baseInput, formType: "return_checklist" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedFailure()).toMatchObject({ failureClass: "origin_mismatch" });
  });
});

describe("notifySubmission send passthrough", () => {
  it("passes the send outcome through to the log (dry_run)", async () => {
    await notifySubmission(baseInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "dry_run", recipientRoute: "main" }));
  });

  it("records a sent outcome with the provider id and the row-derived reference", async () => {
    state.sendResult = { outcome: "sent", attempts: 1, providerId: "resend-9" };
    await notifySubmission({ ...baseInput, reference: "SUB-0000-STALE0" });
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sent", providerId: "resend-9", reference: "SUB-2026-7C0A55" })
    );
  });

  it("records the dry-run reason so an operator can see WHY nothing was sent (Preview stays dry-run)", async () => {
    state.sendResult = { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
    await notifySubmission(baseInput);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "dry_run", reason: "preview_environment" })
    );
  });
});

describe("submission-safety", () => {
  it("never throws even if the sender throws, and logs a failure", async () => {
    state.sendThrows = true;
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed_transient", failureClass: "exception" })
    );
  });
});

describe("notifySubmission — provider options (B4, unchanged by D1)", () => {
  it("derives the idempotency key from the submission id and the recipient", async () => {
    await notifySubmission(baseInput);
    expect(sendOptions().idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: SUBMISSION_ID, recipient: "owner@yard.test" })
    );
    expect(sendOptions().idempotencyKey).toMatch(/^mm\.submission\.7c0a55e1-2222-4222-8222-222222222222\.[0-9a-f]{8}$/);
  });

  it("produces an identical key on a replay of the same submission", async () => {
    await notifySubmission(baseInput);
    await notifySubmission(baseInput);
    expect(sendOptions(0).idempotencyKey).toBe(sendOptions(1).idempotencyKey);
  });

  it("produces a different key for a different submission", async () => {
    await notifySubmission(baseInput);
    const otherId = "7c0a55e1-3333-4333-8333-333333333333";
    state.submissionRow = { ...state.submissionRow, id: otherId };
    await notifySubmission({ ...baseInput, submissionId: otherId });
    expect(sendOptions(0).idempotencyKey).not.toBe(sendOptions(1).idempotencyKey);
  });

  it("passes the configured Reply-To through to the sender", async () => {
    await notifySubmission(baseInput);
    expect(sendOptions().replyTo).toBe("support@mulemark.io");
  });

  it("passes an empty Reply-To when unset — the sender then omits the field", async () => {
    delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
    await notifySubmission(baseInput);
    expect(sendOptions().replyTo).toBe("");
  });

  it("builds every link on the canonical production host", async () => {
    await notifySubmission(baseInput);
    const { text } = sentContent();
    expect(text).toContain(`https://mulemark.io/dashboard/submissions/${SUBMISSION_ID}`);
    expect(text).toContain("https://mulemark.io/dashboard/settings");
    expect(text).not.toContain("vercel.app");
    expect(text).not.toContain("localhost");
  });

  it("carries no private media path or signed URL into the message", async () => {
    await notifySubmission(baseInput);
    const { text, html } = sentContent();
    for (const banned of ["/storage/v1/", "signedurl", "token=", "supabase.co", "org/", ".jpg"]) {
      expect(text.toLowerCase()).not.toContain(banned);
      expect(html.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("priority routing (D3A)", () => {
  beforeEach(() => {
    state.submissionRow = immediateDamageRow();
  });

  it("an immediate report with both routes on sends twice — separately, same message, distinct keys", async () => {
    state.orgRow = orgWith(URGENT_ON);
    await notifySubmission(baseInput);
    expect(recipients()).toEqual(["owner@yard.test", "oncall@yard.test"]);
    expect(sentContent(0)).toBe(sentContent(1));
    expect(sentContent(0).subject).toMatch(/^Immediate attention: /);
    expect(sendOptions(0).idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: SUBMISSION_ID, recipient: "owner@yard.test" })
    );
    expect(sendOptions(1).idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: SUBMISSION_ID, recipient: "oncall@yard.test" })
    );
    expect(sendOptions(0).idempotencyKey).not.toBe(sendOptions(1).idempotencyKey);
    // The same sender identity and Reply-To on both.
    expect(sendOptions(0).replyTo).toBe(sendOptions(1).replyTo);
    expect(loggedLines().map((line) => [line.outcome, line.recipientRoute])).toEqual([
      ["dry_run", "main"],
      ["dry_run", "urgent"],
    ]);
  });

  it("the same address on both routes sends once, logged main_and_urgent", async () => {
    state.orgRow = orgWith({ notify_urgent_reports: true, urgent_notification_email: " OWNER@Yard.test " });
    await notifySubmission(baseInput);
    expect(recipients()).toEqual(["owner@yard.test"]);
    expect(loggedLines()).toEqual([expect.objectContaining({ recipientRoute: "main_and_urgent" })]);
  });

  it("urgent route only when the damage switch is off", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false, ...URGENT_ON });
    await notifySubmission(baseInput);
    expect(recipients()).toEqual(["oncall@yard.test"]);
    expect(loggedLines()).toEqual([expect.objectContaining({ recipientRoute: "urgent" })]);
  });

  it("a follow-up report never reaches the urgent route — with the damage switch off nothing is sent", async () => {
    state.submissionRow = damageRow({ urgency: "high", description: "Weeping hose." });
    state.orgRow = orgWith({ notify_damage_reports: false, ...URGENT_ON });
    await notifySubmission(baseInput);
    // The saved record had to be read to learn its priority, then routed nowhere.
    expect(loadedTable("form_submissions")).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
  });

  it("urgent switch on without an address and the general switch off → skipped_no_recipient, record not loaded", async () => {
    state.orgRow = orgWith({ notify_damage_reports: false, notify_urgent_reports: true, urgent_notification_email: null });
    await notifySubmission(baseInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
    expect(loadedTable("form_submissions")).toBe(false);
  });

  it("one recipient's exception does not stop the other", async () => {
    state.orgRow = orgWith(URGENT_ON);
    state.throwOnCall = 0;
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(recipients()).toEqual(["owner@yard.test", "oncall@yard.test"]);
    expect(loggedLines().map((line) => [line.outcome, line.recipientRoute, line.failureClass])).toEqual([
      ["failed_transient", "main", "exception"],
      ["dry_run", "urgent", undefined],
    ]);
  });

  it("one recipient's provider rejection does not stop the other", async () => {
    state.orgRow = orgWith(URGENT_ON);
    state.resultByCall = { 0: { outcome: "failed_permanent", attempts: 1, failureClass: "http_422" } };
    state.sendResult = { outcome: "sent", attempts: 1, providerId: "resend-2" };
    await notifySubmission(baseInput);
    expect(loggedLines().map((line) => [line.outcome, line.recipientRoute])).toEqual([
      ["failed_permanent", "main"],
      ["sent", "urgent"],
    ]);
  });

  it("Preview stays dry-run on every route, each with its reason", async () => {
    state.orgRow = orgWith(URGENT_ON);
    state.sendResult = { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
    await notifySubmission(baseInput);
    expect(loggedLines()).toEqual([
      expect.objectContaining({ outcome: "dry_run", reason: "preview_environment", recipientRoute: "main" }),
      expect.objectContaining({ outcome: "dry_run", reason: "preview_environment", recipientRoute: "urgent" }),
    ]);
  });

  it("logs preview counts — requested per the organization switch, attached when built", async () => {
    await notifySubmission(baseInput);
    expect(loggedLines()[0]).toMatchObject({
      previewRequestedCount: 1,
      previewAttachedCount: 1,
      previewFailureClass: null,
      previewBytesBucket: "lt_250kb",
    });
    expect(typeof loggedLines()[0].previewTransformMs).toBe("number");

    vi.clearAllMocks();
    state.sendCalls = 0;
    state.storageReads = [];
    state.orgRow = orgWith({ notify_include_photo_previews: false });
    await notifySubmission(baseInput);
    expect(loggedLines()[0]).toMatchObject({
      previewRequestedCount: 0,
      previewAttachedCount: 0,
      previewFailureClass: null,
      previewTransformMs: null,
      previewBytesBucket: null,
    });
    expect(state.storageReads).toEqual([]);
  });

  it("log fields carry no report content, contact data, media path or preview file name", async () => {
    state.orgRow = orgWith(URGENT_ON);
    await notifySubmission(baseInput);
    const serialized = JSON.stringify(loggedLines());
    for (const banned of ["Tipped", "Saved Name", "org/", ".jpg", "damage-1", "incident-photo", "mm-preview"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("inline photo previews (D4)", () => {
  beforeEach(() => {
    state.submissionRow = immediateDamageRow();
  });

  it("builds the preview set once and sends the identical message, attachments included, to every route", async () => {
    state.orgRow = orgWith(URGENT_ON);
    await notifySubmission(baseInput);
    expect(transformMock).toHaveBeenCalledTimes(1);
    expect(recipients()).toEqual(["owner@yard.test", "oncall@yard.test"]);
    expect(sentContent(0)).toBe(sentContent(1));
    expect(sentContent(0).attachments).toEqual([
      expect.objectContaining({ filename: "incident-photo-1.jpg", contentType: "image/jpeg", contentId: "mm-preview-1@mulemark" }),
    ]);
    expect(sentContent(0).html).toContain('src="cid:mm-preview-1@mulemark"');
    expect(sentContent(0).text).toContain("Photo previews included: 1 of 1 photo, reduced in size.");
    expect(phases()).toEqual(["notify.load", "notify.project", "notify.media", "notify.send", "notify.send"]);
  });

  it("reads only this submission's own stored photo from the private bucket", async () => {
    await notifySubmission(baseInput);
    expect(state.storageReads).toEqual([
      `info:submissions:${mediaPath("damage-1")}`,
      `download:submissions:${mediaPath("damage-1")}`,
    ]);
  });

  it("keeps the recipient-specific idempotency key whether or not previews are attached", async () => {
    await notifySubmission(baseInput);
    state.orgRow = orgWith({ notify_include_photo_previews: false });
    await notifySubmission(baseInput);
    expect(sentContent(0).attachments).toHaveLength(1);
    expect(sentContent(1).attachments).toBeUndefined();
    expect(sendOptions(1).idempotencyKey).toBe(sendOptions(0).idempotencyKey);
    expect(sendOptions(0).idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "submission", reference: SUBMISSION_ID, recipient: "owner@yard.test" })
    );
  });

  it.each([
    ["missing", "missing_object"],
    ["error", "download_failed"],
  ] as const)("storage %s → the text-only email is still sent", async (mode, failureClass) => {
    state.storageMode = mode;
    await notifySubmission(baseInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentContent().attachments).toBeUndefined();
    expect(sentContent().html).not.toContain("<img");
    expect(sentContent().text).toContain("Photo previews: none included.");
    expect(loggedLines()[0]).toMatchObject({
      previewRequestedCount: 1,
      previewAttachedCount: 0,
      previewFailureClass: failureClass,
      previewBytesBucket: "none",
    });
  });

  it("a transform failure still sends the text-only email", async () => {
    transformMock.mockResolvedValueOnce({ ok: false, failureClass: "decode_failed" });
    await notifySubmission(baseInput);
    expect(sentContent().attachments).toBeUndefined();
    expect(loggedLines()[0]).toMatchObject({ outcome: "dry_run", previewAttachedCount: 0, previewFailureClass: "decode_failed" });
  });

  it("a crashing transformer still sends the text-only email", async () => {
    transformMock.mockRejectedValueOnce(new Error("native crash"));
    await expect(notifySubmission(baseInput)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentContent().attachments).toBeUndefined();
    expect(loggedLines()[0]).toMatchObject({ previewAttachedCount: 0, previewFailureClass: "exception" });
  });

  it("the organization switch off → no storage read, no media phase, no preview line", async () => {
    state.orgRow = orgWith({ notify_include_photo_previews: false });
    await notifySubmission(baseInput);
    expect(state.storageReads).toEqual([]);
    expect(transformMock).not.toHaveBeenCalled();
    expect(phases()).not.toContain("notify.media");
    expect(sentContent().attachments).toBeUndefined();
    expect(sentContent().text).not.toContain("Photo previews");
  });

  it("a clean renter return is sent with its photo count and no preview", async () => {
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: cleanGeneratorValues(),
      flags: CLEAN_FLAGS,
      photos: { overall_photo: [photo("Overall photo", "o1")] },
    });
    await notifySubmission({ ...baseInput, formType: "return_checklist" });
    expect(state.storageReads).toEqual([]);
    expect(sentContent().attachments).toBeUndefined();
    expect(sentContent().text).toContain("Photos: 1 on the record");
    expect(loggedLines()[0]).toMatchObject({ previewRequestedCount: 0, previewAttachedCount: 0 });
  });

  it("Preview deployments stay dry-run and still exercise the preview build", async () => {
    state.sendResult = { outcome: "dry_run", attempts: 0, reason: "preview_environment" };
    await notifySubmission(baseInput);
    expect(transformMock).toHaveBeenCalledTimes(1);
    expect(loggedLines()[0]).toMatchObject({ outcome: "dry_run", reason: "preview_environment", previewAttachedCount: 1 });
  });

  it("tag request emails never read storage or carry attachments", async () => {
    await notifyTagRequestStatus({
      organizationId: ORG_ID,
      tagRequestId: "tr-9",
      fromStatus: "in_review",
      toStatus: "in_production",
      changedAt: "2026-09-11T17:30:00.123Z",
    });
    expect(state.storageReads).toEqual([]);
    expect(sentContent().attachments).toBeUndefined();
    expect(loggedLines()[0]).toMatchObject({ previewRequestedCount: null, previewAttachedCount: null });
  });
});

describe("return modes (D3A)", () => {
  const returnInput = { ...baseInput, formType: "return_checklist" as const };

  function cleanReturn() {
    return returnRowV2({ template: templateV2_20260702(), values: cleanGeneratorValues(), flags: CLEAN_FLAGS });
  }

  it("instant_renter emails a clean renter return individually", async () => {
    state.submissionRow = cleanReturn();
    await notifySubmission(returnInput);
    expect(recipients()).toEqual(["owner@yard.test"]);
    expect(loggedLines()).toEqual([expect.objectContaining({ recipientRoute: "main" })]);
  });

  it.each(["daily_exceptions", "off"])("%s sends no individual return email and does not load it", async (mode) => {
    state.orgRow = orgWith({ return_notification_mode: mode });
    state.submissionRow = cleanReturn();
    await notifySubmission(returnInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled" }));
    expect(loadedTable("form_submissions")).toBe(false);
  });

  it("a return with exceptions never uses the urgent route", async () => {
    state.orgRow = orgWith(URGENT_ON);
    state.submissionRow = returnRowV2({
      template: templateV2_20260702(),
      values: { ...cleanGeneratorValues(), oil_level: "fail" },
      flags: CLEAN_FLAGS,
    });
    await notifySubmission(returnInput);
    expect(recipients()).toEqual(["owner@yard.test"]);
  });
});

describe("notifyTagRequestStatus (B4, D3A)", () => {
  const tagInput = {
    organizationId: ORG_ID,
    tagRequestId: "tr-9",
    fromStatus: "in_review",
    toStatus: "in_production",
    changedAt: "2026-09-11T17:30:00.123Z",
  };

  it("sends, and logs the tag request id as the canonical reference", async () => {
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tag_status", reference: "tr-9", recipientRoute: "main" })
    );
  });

  it("links to the tag request's own page and renders the saved status", async () => {
    await notifyTagRequestStatus(tagInput);
    const { text } = sentContent();
    expect(text).toContain("View tag request: https://mulemark.io/dashboard/tag-requests/tr-9");
    expect(text).toContain("Status: In production");
  });

  it("loads the saved request scoped to the organization", async () => {
    await notifyTagRequestStatus(tagInput);
    expect(state.queries).toContainEqual({ table: "tag_requests", column: "id", value: "tr-9" });
    expect(state.queries).toContainEqual({ table: "tag_requests", column: "organization_id", value: ORG_ID });
  });

  /** A replay of one saved transition must not send twice; a later genuine transition must send. */
  it("keys on the saved transition", async () => {
    await notifyTagRequestStatus(tagInput);
    await notifyTagRequestStatus(tagInput);
    await notifyTagRequestStatus({ ...tagInput, changedAt: "2026-09-12T08:00:00.000Z" });
    state.tagRow = { ...state.tagRow, status: "delivered" };
    await notifyTagRequestStatus({ ...tagInput, fromStatus: "in_production", toStatus: "delivered" });
    const keys = sendMock.mock.calls.map((_, i) => sendOptions(i).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    expect(keys[0]).toMatch(/^mm\.tag_status\.tr-9:in_review-in_production:\d+\.[0-9a-f]{8}$/);
  });

  it.each([
    ["stale_transition", () => (state.tagRow = { ...state.tagRow, status: "delivered" })],
    ["record_missing", () => (state.tagRow = null)],
    ["load_error", () => (state.tagError = { message: "connection reset" })],
  ])("%s → no send, one failure line", async (failureClass, arrange) => {
    arrange();
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(loggedFailure()).toMatchObject({ event: "tag_status", failureClass, reference: "tr-9" });
  });

  it("skips a disabled org without loading the request", async () => {
    state.orgRow = orgWith({ notify_tag_request_updates: false });
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_disabled", reference: "tr-9" }));
    expect(loadedTable("tag_requests")).toBe(false);
  });

  it("skips an org with no recipient", async () => {
    state.orgRow = orgWith({ notification_email: null, ...URGENT_ON });
    await notifyTagRequestStatus(tagInput);
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "skipped_no_recipient", reference: "tr-9" })
    );
  });

  it("never uses the urgent route", async () => {
    state.orgRow = orgWith(URGENT_ON);
    await notifyTagRequestStatus(tagInput);
    expect(recipients()).toEqual(["owner@yard.test"]);
  });

  it("never throws when the sender throws — a status update must survive a mail failure", async () => {
    state.sendThrows = true;
    await expect(notifyTagRequestStatus(tagInput)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tag_status", failureClass: "exception", reference: "tr-9" })
    );
  });
});
