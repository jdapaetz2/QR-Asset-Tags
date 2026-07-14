import { describe, expect, it } from "vitest";

import { countNewSubmissions } from "./counts";

type Client = Parameters<typeof countNewSubmissions>[0];

/** Fake RLS client: records the status filter and returns a canned count. */
function fakeClient(count: number | null): { client: Client; seen: { col?: string; val?: string } } {
  const seen: { col?: string; val?: string } = {};
  const client = {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          seen.col = col;
          seen.val = val;
          return Promise.resolve({ count });
        },
      }),
    }),
  } as unknown as Client;
  return { client, seen };
}

describe("countNewSubmissions", () => {
  it("counts only status = 'new'", async () => {
    const { client, seen } = fakeClient(5);
    expect(await countNewSubmissions(client)).toBe(5);
    expect(seen).toEqual({ col: "status", val: "new" });
  });

  it("treats a null count as 0", async () => {
    const { client } = fakeClient(null);
    expect(await countNewSubmissions(client)).toBe(0);
  });
});
