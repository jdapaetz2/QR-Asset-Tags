import { notFound, redirect } from "next/navigation";
import { describe, expect, it } from "vitest";

import { withActionErrorRecovery } from "./action-recovery";
import { SEND_FAILED_MESSAGE } from "./upload-contract";

// A form whose server action cannot be delivered (Vercel 413, network drop) keeps its inputs; Next's own
// control-flow errors still pass through.

type State = { error?: string };

describe("withActionErrorRecovery", () => {
  it("passes the action's own result through", async () => {
    const wrapped = withActionErrorRecovery<State>(async () => ({ error: "Provide an email or a phone number." }));
    expect(await wrapped({}, new FormData())).toEqual({ error: "Provide an email or a phone number." });
  });

  it("turns an undeliverable request into a form error", async () => {
    const wrapped = withActionErrorRecovery<State>(async () => {
      throw new Error("An unexpected response was received from the server.");
    });
    expect(await wrapped({}, new FormData())).toEqual({ error: SEND_FAILED_MESSAGE });
  });

  it("lets a successful submit's redirect navigate", async () => {
    const wrapped = withActionErrorRecovery<State>(async () => redirect("/forms/tag/damage/thanks"));
    await expect(wrapped({}, new FormData())).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("lets notFound through", async () => {
    const wrapped = withActionErrorRecovery<State>(async () => notFound());
    await expect(wrapped({}, new FormData())).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });

  it("accepts a custom message", async () => {
    const wrapped = withActionErrorRecovery<State>(async () => {
      throw new Error("x");
    }, "Try again.");
    expect(await wrapped({}, new FormData())).toEqual({ error: "Try again." });
  });
});
