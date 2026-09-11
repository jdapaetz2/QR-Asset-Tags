import { beforeEach, describe, expect, it, vi } from "vitest";

// Engineering Phase D3A (F5): the owner save notifies only on a real persisted status change, stamps delivered_at only
// on a change into delivered, guards against a concurrent change, and schedules the email after the response.

const { requireRole, scheduleTagStatusNotification, redirect, state } = vi.hoisted(() => ({
  requireRole: vi.fn(async () => undefined),
  scheduleTagStatusNotification: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  state: {
    current: null as { id: string; status: string } | null,
    readError: null as unknown,
    updated: null as Record<string, unknown> | null,
    updateError: null as unknown,
    updates: [] as Record<string, unknown>[],
    updateFilters: [] as [string, unknown][],
    reads: 0,
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireRole }));
vi.mock("@/lib/notifications/schedule", () => ({ scheduleTagStatusNotification }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.reads++;
            return { data: state.current, error: state.readError };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        state.updates.push(payload);
        const chain = {
          eq: (column: string, value: unknown) => {
            state.updateFilters.push([column, value]);
            return chain;
          },
          select: () => ({ maybeSingle: async () => ({ data: state.updated, error: state.updateError }) }),
        };
        return chain;
      },
    }),
  }),
}));

import { updateTagRequest } from "@/lib/tags/owner-actions";
import { ROLES } from "@/lib/auth/roles";

const ID = "5b1f0a3c-1111-4111-8111-111111111111";
const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SAVED_AT = "2026-09-11T17:30:00.123456+00:00";

function form(status: string, notes = ""): FormData {
  const fd = new FormData();
  fd.set("status", status);
  fd.set("production_notes", notes);
  return fd;
}

async function run(fd: FormData): Promise<{ result?: { error?: string }; redirectedTo?: string }> {
  try {
    return { result: await updateTagRequest(ID, {}, fd) };
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith("REDIRECT:")) return { redirectedTo: message.slice("REDIRECT:".length) };
    throw err;
  }
}

function saved(status: string) {
  state.updated = { id: ID, organization_id: ORG, status, updated_at: SAVED_AT };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.current = { id: ID, status: "in_review" };
  state.readError = null;
  state.updateError = null;
  state.updates = [];
  state.updateFilters = [];
  state.reads = 0;
  saved("ready");
});

describe("updateTagRequest", () => {
  it("is gated to the platform owner", async () => {
    await run(form("ready"));
    expect(requireRole).toHaveBeenCalledWith(ROLES.PLATFORM_OWNER);
  });

  it("a real status change saves, schedules one email from the SAVED transition, and redirects", async () => {
    const { redirectedTo } = await run(form("ready", "  Batch 4 "));
    expect(state.updates).toEqual([{ status: "ready", production_notes: "Batch 4" }]);
    expect(state.updateFilters).toEqual([
      ["id", ID],
      ["status", "in_review"],
    ]);
    expect(scheduleTagStatusNotification).toHaveBeenCalledTimes(1);
    expect(scheduleTagStatusNotification).toHaveBeenCalledWith({
      organizationId: ORG,
      tagRequestId: ID,
      fromStatus: "in_review",
      toStatus: "ready",
      changedAt: SAVED_AT,
    });
    expect(redirectedTo).toBe(`/owner/tag-requests/${ID}`);
  });

  it("a same-status save sends nothing", async () => {
    state.current = { id: ID, status: "ready" };
    const { redirectedTo } = await run(form("ready"));
    expect(state.updates).toHaveLength(1);
    expect(scheduleTagStatusNotification).not.toHaveBeenCalled();
    expect(redirectedTo).toBe(`/owner/tag-requests/${ID}`);
  });

  it("a notes-only save sends nothing and does not restamp delivered_at", async () => {
    state.current = { id: ID, status: "delivered" };
    saved("delivered");
    await run(form("delivered", "Customer confirmed receipt"));
    expect(state.updates).toEqual([{ status: "delivered", production_notes: "Customer confirmed receipt" }]);
    expect(scheduleTagStatusNotification).not.toHaveBeenCalled();
  });

  it("a change into delivered stamps delivered_at and schedules", async () => {
    state.current = { id: ID, status: "ready" };
    saved("delivered");
    await run(form("delivered"));
    expect(state.updates[0]).toMatchObject({ status: "delivered" });
    expect(typeof state.updates[0].delivered_at).toBe("string");
    expect(scheduleTagStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: "ready", toStatus: "delivered" })
    );
  });

  it("a concurrent change is reported, not turned into a transition that never happened", async () => {
    state.updated = null;
    const { result, redirectedTo } = await run(form("ready"));
    expect(result?.error).toBe("This tag request changed while you were editing. Reload and try again.");
    expect(redirectedTo).toBeUndefined();
    expect(scheduleTagStatusNotification).not.toHaveBeenCalled();
  });

  it("a failed update schedules nothing", async () => {
    state.updateError = { message: "boom" };
    const { result } = await run(form("ready"));
    expect(result?.error).toBe("Could not update the tag request.");
    expect(scheduleTagStatusNotification).not.toHaveBeenCalled();
  });

  it("a missing request is reported before any update", async () => {
    state.current = null;
    const { result } = await run(form("ready"));
    expect(result?.error).toBe("Tag request not found.");
    expect(state.updates).toHaveLength(0);
  });

  it("rejects an unknown status without touching the database", async () => {
    const { result } = await run(form("shipped"));
    expect(result?.error).toBe("Choose a valid status.");
    expect(state.reads).toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it("the email is scheduled, never awaited — a mail failure cannot fail the save", async () => {
    scheduleTagStatusNotification.mockImplementationOnce(() => undefined);
    const { redirectedTo } = await run(form("ready"));
    expect(redirectedTo).toBe(`/owner/tag-requests/${ID}`);
  });
});
