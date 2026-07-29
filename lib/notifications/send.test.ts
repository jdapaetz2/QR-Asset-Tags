import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_ATTEMPTS, parseRetryAfter, sendNotificationEmail } from "@/lib/notifications/send";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFICATION_FROM_EMAIL;
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
