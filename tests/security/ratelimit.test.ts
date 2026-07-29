import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { anonClient, serviceClient, signInAs } from "./setup/fixtures";

// Executed rate-limiter tests (Phase A4). The counter table + rate_limit_touch RPC are reachable ONLY by
// service_role (trusted server code); anon/authenticated are denied at the grant level. Behavior is proven
// against real Postgres: normal allowed, burst denial, key isolation, opaque keys (no raw IP), gc.

let service: SupabaseClient;
let anon: SupabaseClient;
let staff: SupabaseClient;

const RULES = [
  { max: 2, window: 60 },
  { max: 5, window: 3600 },
];

beforeAll(async () => {
  service = serviceClient();
  anon = anonClient();
  staff = await signInAs("staff_a");
});

describe("grant boundary", () => {
  it("anon CANNOT execute rate_limit_touch", async () => {
    const { error } = await anon.rpc("rate_limit_touch", { p_key: "rl:test:anon", p_rules: RULES });
    expect(error, "anon should be denied execute").toBeTruthy();
  });

  it("authenticated (a signed-in customer) CANNOT execute rate_limit_touch", async () => {
    const { error } = await staff.rpc("rate_limit_touch", { p_key: "rl:test:authed", p_rules: RULES });
    expect(error, "authenticated should be denied execute").toBeTruthy();
  });

  it("anon CANNOT read the counter table", async () => {
    const { data, error } = await anon.from("rate_limit_counters").select("bucket_key").limit(1);
    // Either an error or zero rows — never a leak of counter state.
    expect(!!error || (data ?? []).length === 0).toBe(true);
  });
});

describe("service-role behavior", () => {
  it("allows requests up to the burst limit, then denies with a retry_after", async () => {
    const key = "rl:test:burst";
    const first = await service.rpc("rate_limit_touch", { p_key: key, p_rules: RULES });
    expect(first.error?.message ?? null).toBeNull();
    expect((first.data as { allowed: boolean }).allowed).toBe(true);

    const second = await service.rpc("rate_limit_touch", { p_key: key, p_rules: RULES });
    expect((second.data as { allowed: boolean }).allowed).toBe(true);

    const third = await service.rpc("rate_limit_touch", { p_key: key, p_rules: RULES });
    const t = third.data as { allowed: boolean; retry_after: number };
    expect(t.allowed).toBe(false);
    expect(t.retry_after).toBeGreaterThan(0);
  });

  it("isolates distinct keys (per-asset / per-user independence)", async () => {
    const a = await service.rpc("rate_limit_touch", { p_key: "rl:test:isoA", p_rules: RULES });
    const b = await service.rpc("rate_limit_touch", { p_key: "rl:test:isoB", p_rules: RULES });
    expect((a.data as { allowed: boolean }).allowed).toBe(true);
    expect((b.data as { allowed: boolean }).allowed).toBe(true);
    // Hammer A to its limit; B must stay unaffected.
    await service.rpc("rate_limit_touch", { p_key: "rl:test:isoA", p_rules: RULES });
    const aDenied = await service.rpc("rate_limit_touch", { p_key: "rl:test:isoA", p_rules: RULES });
    const bStill = await service.rpc("rate_limit_touch", { p_key: "rl:test:isoB", p_rules: RULES });
    expect((aDenied.data as { allowed: boolean }).allowed).toBe(false);
    expect((bStill.data as { allowed: boolean }).allowed).toBe(true);
  });

  it("stores only the opaque key it was given — never a raw IP", async () => {
    const key = "rl:test:opaque";
    await service.rpc("rate_limit_touch", { p_key: key, p_rules: [{ max: 5, window: 60 }] });
    const { data } = await service.from("rate_limit_counters").select("bucket_key").eq("bucket_key", key);
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      // The stored key is exactly what we passed; there is no separate IP column to leak.
      expect((row as { bucket_key: string }).bucket_key).toBe(key);
    }
  });

  it("rate_limit_gc runs for service_role and returns a count", async () => {
    const { data, error } = await service.rpc("rate_limit_gc");
    expect(error?.message ?? null).toBeNull();
    expect(typeof data).toBe("number");
  });
});
