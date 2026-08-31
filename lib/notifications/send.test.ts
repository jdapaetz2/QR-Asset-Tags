import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";
import {
  MAX_ATTEMPTS,
  NOTIFICATION_TOTAL_BUDGET_MS,
  parseRetryAfter,
  sendNotificationEmail,
} from "@/lib/notifications/send";

const CONTENT = { subject: "s", text: "t", html: "<p>h</p>" };
const noSleep = { sleep: async () => {} };

// A minimal Response-like for the mocked fetch.
function resp(status: number, opts: { id?: string; retryAfter?: string } = {}): Response {
  const headers = new Headers();
  if (opts.retryAfter) headers.set("retry-after", opts.retryAfter);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    json: async () => (opts.id ? { id: opts.id } : {}),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFICATION_FROM_EMAIL;
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFICATION_FROM_EMAIL;
  delete process.env.VERCEL_ENV;
});

function configure(from = "Mulemark Alerts <alerts@mulemark.test>") {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.NOTIFICATION_FROM_EMAIL = from;
}

describe("dry-run (no provider configured)", () => {
  it("returns dry_run and makes NO network request", async () => {
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("dry_run");
    expect(result.attempts).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("configuration", () => {
  it("returns failed_configuration for an invalid from, without a request", async () => {
    configure("not-an-email");
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_configuration");
    expect(result.failureClass).toBe("invalid_from");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("live send classification", () => {
  it("sent on 2xx and captures the provider message id", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "resend-123" }));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("sent");
    expect(result.providerId).toBe("resend-123");
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("failed_permanent on 422 with NO retry", async () => {
    configure();
    fetchMock.mockResolvedValue(resp(422));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_permanent");
    expect(result.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("failed_permanent on 401 (auth) with NO retry", async () => {
    configure();
    fetchMock.mockResolvedValue(resp(401));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_permanent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("failed_transient on repeated 500, bounded to MAX_ATTEMPTS", async () => {
    configure();
    fetchMock.mockResolvedValue(resp(500));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_transient");
    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("retries a 429 (honoring Retry-After) then succeeds", async () => {
    configure();
    const sleep = vi.fn(async (_ms: number) => {});
    fetchMock.mockResolvedValueOnce(resp(429, { retryAfter: "1" })).mockResolvedValueOnce(resp(200, { id: "ok" }));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, { sleep });
    expect(result.outcome).toBe("sent");
    expect(result.attempts).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(2000); // capped
  });

  it("failed_transient on a network error, bounded", async () => {
    configure();
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_transient");
    expect(result.failureClass).toBe("network");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("classifies an AbortError (timeout) as transient", async () => {
    configure();
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("failed_transient");
    expect(result.failureClass).toBe("timeout");
  });
});

describe("payload safety", () => {
  it("sends only from/to/subject/text/html — no media/token/URL fields", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(["from", "html", "subject", "text", "to"]);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const banned of ["media", "storage", "signedurl", "token", "http://", "https://"]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("never puts the API key anywhere but the Authorization header", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.stringify(init.body)).not.toContain("re_test_key");
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0")).toBe(0);
  });
  it("parses an HTTP-date relative to now", () => {
    const now = 1_000_000;
    expect(parseRetryAfter(new Date(now + 3000).toUTCString(), now)).toBeGreaterThanOrEqual(0);
  });
  it("returns null for a missing/garbage value", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase B4 — what a LIVE sender needs that a dry-run one did not.
// ---------------------------------------------------------------------------

function headersOf(call: number): Record<string, string> {
  return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

function bodyOf(call: number): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);
}

describe("preview never sends live mail (B4)", () => {
  /**
   * Before B4 the ONLY thing stopping staging from emailing real customers was the absence of
   * credentials — a configuration promise. This asserts the code-level rule instead: fully configured,
   * preview still sends nothing.
   */
  it("returns dry_run in preview EVEN WITH a key and sender configured", async () => {
    process.env.VERCEL_ENV = "preview";
    configure();
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("dry_run");
    expect(result.reason).toBe("preview_environment");
    expect(result.attempts).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes an unconfigured dry-run from the preview rule", async () => {
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("dry_run");
    expect(result.reason).toBe("unconfigured");
  });

  it("still sends in production with the same configuration", async () => {
    process.env.VERCEL_ENV = "production";
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "prod-1" }));
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(result.outcome).toBe("sent");
    expect(result.providerId).toBe("prod-1");
  });
});

describe("idempotency key (B4)", () => {
  /**
   * Built with the real generator rather than pasted in as a literal. Two reasons: it keeps this
   * send-layer test exercising the ACTUAL key format (so a change to the generator's shape is felt
   * here), and it avoids parking a random-looking string next to an `idempotencyKey:` assignment —
   * which a secret scanner is right to treat as suspicious, since that is exactly what a leaked
   * credential looks like.
   */
  const REPLAY_ID = notificationIdempotencyKey({
    event: "submission",
    reference: "sub-1",
    recipient: "owner@yard.test",
  });

  it("sends the caller's key as the Idempotency-Key header", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { idempotencyKey: REPLAY_ID });
    expect(headersOf(0)["Idempotency-Key"]).toBe(REPLAY_ID);
  });

  /**
   * The reason idempotency exists here. A timeout is the dangerous retry: the provider may have
   * accepted the message we stopped waiting for. Every attempt must carry the SAME key so the
   * provider drops the duplicate instead of mailing a real customer twice.
   */
  it("reuses ONE key across every retry of a timing-out send", async () => {
    configure();
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { idempotencyKey: REPLAY_ID });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(headersOf(i)["Idempotency-Key"]).toBe(REPLAY_ID);
    }
  });

  it("reuses the same key across a 500 retry too", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(500)).mockResolvedValueOnce(resp(200, { id: "ok" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { idempotencyKey: "k-1" });
    expect(headersOf(0)["Idempotency-Key"]).toBe("k-1");
    expect(headersOf(1)["Idempotency-Key"]).toBe("k-1");
  });

  it("omits the header entirely when no key is supplied", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect(headersOf(0)["Idempotency-Key"]).toBeUndefined();
  });
});

describe("reply-to (B4)", () => {
  it("sends reply_to when configured", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { replyTo: "support@mulemark.io" });
    expect(bodyOf(0).reply_to).toBe("support@mulemark.io");
  });

  it("omits reply_to entirely when unset or blank — never an empty string", async () => {
    configure();
    fetchMock.mockResolvedValue(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    expect("reply_to" in bodyOf(0)).toBe(false);
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { replyTo: "   " });
    expect("reply_to" in bodyOf(1)).toBe(false);
  });

  it("keeps the payload to the intended fields even with reply_to present", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep, { replyTo: "support@mulemark.io" });
    expect(Object.keys(bodyOf(0)).sort()).toEqual(["from", "html", "reply_to", "subject", "text", "to"]);
  });

  it("sends one recipient per message — never a bcc field", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(resp(200, { id: "x" }));
    await sendNotificationEmail("owner@yard.test", CONTENT, noSleep);
    const body = bodyOf(0);
    expect(body.to).toBe("owner@yard.test");
    expect("bcc" in body).toBe(false);
    expect("cc" in body).toBe(false);
  });
});

describe("total time budget (B4)", () => {
  /**
   * Notifications are awaited inside the renter's submission request. Per-attempt timeouts alone let
   * three slow attempts plus backoff hold that request for ~30 s and risk the platform function limit,
   * which would turn a best-effort email into a failed submission.
   */
  it("stops retrying once the wall-clock budget is spent, before MAX_ATTEMPTS", async () => {
    configure();
    let clock = 0;
    const now = () => clock;
    // Each attempt burns most of the budget.
    fetchMock.mockImplementation(async () => {
      clock += NOTIFICATION_TOTAL_BUDGET_MS - 100;
      return resp(500);
    });
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, { sleep: async () => {}, now });
    expect(result.outcome).toBe("failed_transient");
    expect(result.attempts).toBeLessThan(MAX_ATTEMPTS);
    expect(result.failureClass).toBe("budget_exhausted");
  });

  it("does not cut short a send that fits inside the budget", async () => {
    configure();
    let clock = 0;
    const now = () => clock;
    fetchMock.mockImplementation(async () => {
      clock += 10;
      return resp(500);
    });
    const result = await sendNotificationEmail("owner@yard.test", CONTENT, { sleep: async () => {}, now });
    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.failureClass).toBe("http_500");
  });
});
