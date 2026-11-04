import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFooter } from "@/components/public/public-footer";
import { DEMO_PUBLIC_NOTICE } from "@/lib/constants";
import { isDemoOrganization } from "@/lib/public/demo";

// Engineering Phase E2C — the demo notice on a demo organization's public pages.

const repo = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(repo, file), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";

function rpcClient(result: () => Promise<{ data: unknown; error: unknown }>) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result();
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("isDemoOrganization", () => {
  it("asks the yes/no function for exactly one organization", async () => {
    const { client, calls } = rpcClient(async () => ({ data: true, error: null }));
    expect(await isDemoOrganization(client, ORG)).toBe(true);
    expect(calls).toEqual([{ fn: "is_demo_organization", args: { p_organization_id: ORG } }]);
  });

  it("shows no notice on false, an error, odd data or a thrown failure — never a broken page", async () => {
    expect(await isDemoOrganization(rpcClient(async () => ({ data: false, error: null })).client, ORG)).toBe(false);
    expect(await isDemoOrganization(rpcClient(async () => ({ data: null, error: { message: "missing function" } })).client, ORG)).toBe(false);
    expect(await isDemoOrganization(rpcClient(async () => ({ data: "true", error: null })).client, ORG)).toBe(false);
    expect(await isDemoOrganization(rpcClient(async () => Promise.reject(new Error("network"))).client, ORG)).toBe(false);
  });
});

describe("the public footer's demo notice", () => {
  it("appears only when asked, under the platform line and above the disclaimer", () => {
    // The markup escapes the apostrophe in "Don't", so the check uses the notice's opening words.
    const opening = DEMO_PUBLIC_NOTICE.split(".")[0];
    const plain = renderToStaticMarkup(PublicFooter());
    expect(plain).not.toContain(opening);
    const demo = renderToStaticMarkup(PublicFooter({ demoNotice: true }));
    expect(demo.indexOf(opening)).toBeGreaterThan(demo.indexOf("Powered by"));
    expect(demo.indexOf(opening)).toBeLessThan(demo.indexOf("Information is provided by the rental company"));
  });

  it("says the company, equipment and history are fictional and the page is not instructions for a machine", () => {
    expect(DEMO_PUBLIC_NOTICE).toMatch(/real equipment models/);
    expect(DEMO_PUBLIC_NOTICE).toMatch(/fictional/);
    expect(DEMO_PUBLIC_NOTICE).toMatch(/physical machine/);
  });

  it("is decided by data, never by a hard-coded organization in a public component", () => {
    for (const file of ["components/public/public-scan-route.tsx", "components/public/public-footer.tsx", "components/public/public-form-layout.tsx", "lib/public/demo.ts"]) {
      expect(read(file), file).not.toContain(ORG);
    }
  });
});

describe("migration 0041 (is_demo_organization)", () => {
  const sql = read("supabase/migrations/0041_demo_organization_flag.sql");

  it("answers yes or no for one active organization on the Demo plan, as a security-definer function", () => {
    expect(sql).toMatch(/create or replace function public\.is_demo_organization\(p_organization_id uuid\)\s+returns boolean/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/plan_key = 'demo'/);
    expect(sql).toMatch(/status = 'active'/);
  });

  it("is executable by anon and signed-in users only after revoking the default grant, and changes no table", () => {
    expect(sql).toMatch(/revoke execute on function public\.is_demo_organization\(uuid\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.is_demo_organization\(uuid\) to anon, authenticated;/);
    expect(sql).not.toMatch(/alter table|create table|create trigger|grant select/i);
  });
});
