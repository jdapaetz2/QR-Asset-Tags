import { describe, expect, it } from "vitest";

import { EXPECTED_TRIGGERS, STAGING_DB_ENV, STAGING_REF, assertStagingDatabase, catalogVerdict, stagingDbConfig } from "./showcase-target.mjs";

// Engineering Phase E2B: the staging database guard. Every URL below is a made-up example with a fake password.

const env = (url) => ({ [STAGING_DB_ENV]: url });
const POOLER = `postgresql://postgres.${STAGING_REF}:fake-password@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;

describe("stagingDbConfig", () => {
  it("accepts the staging session pooler and the direct staging host", () => {
    const pooled = stagingDbConfig(env(POOLER));
    expect(pooled).toMatchObject({ host: "aws-0-ca-central-1.pooler.supabase.com", port: 5432, user: `postgres.${STAGING_REF}`, database: "postgres" });
    expect(pooled.ssl.rejectUnauthorized).toBe(true);
    const direct = stagingDbConfig(env(`postgresql://postgres:fake-password@db.${STAGING_REF}.supabase.co:5432/postgres`));
    expect(direct.describe).toContain("direct");
  });

  it("refuses the transaction pooler, other projects, other hosts and plaintext", () => {
    expect(() => stagingDbConfig(env(POOLER.replace(":5432/", ":6543/")))).toThrow(/transaction pooler/);
    expect(() => stagingDbConfig(env(POOLER.replace(STAGING_REF, "apeiswnkheiwrpvumder")))).toThrow(/Production/);
    expect(() => stagingDbConfig(env(POOLER.replace(STAGING_REF, "someotherproject")))).toThrow(/staging project/);
    expect(() => stagingDbConfig(env("postgresql://postgres:x@db.otherproj.supabase.co:5432/postgres"))).toThrow(/neither/);
    expect(() => stagingDbConfig(env("postgresql://postgres:x@127.0.0.1:5432/postgres"))).toThrow(/neither/);
    expect(() => stagingDbConfig(env(`${POOLER}?sslmode=disable`))).toThrow(/TLS/);
    expect(() => stagingDbConfig(env("https://example.com"))).toThrow(/postgresql/);
    expect(() => stagingDbConfig({})).toThrow(/not set/);
  });

  it("never puts the URL or the password in an error", () => {
    for (const bad of [POOLER.replace(":5432/", ":6543/"), POOLER.replace(STAGING_REF, "apeiswnkheiwrpvumder"), "postgresql://postgres:fake-password@db.nope.supabase.co:5432/postgres"]) {
      try {
        stagingDbConfig(env(bad));
      } catch (err) {
        expect(err.message).not.toContain("fake-password");
        expect(err.message).not.toContain("postgresql://");
      }
    }
  });
});

describe("staging database proof", () => {
  it("passes the reviewed catalog and refuses anything else", () => {
    expect(catalogVerdict({ public_triggers: EXPECTED_TRIGGERS.length, unexpected_triggers: "none", scheduled_jobs: "pg_cron not installed" }).ok).toBe(true);
    expect(catalogVerdict({ public_triggers: EXPECTED_TRIGGERS.length, unexpected_triggers: "none", scheduled_jobs: "0 job(s)" }).ok).toBe(true);
    expect(catalogVerdict({ public_triggers: 22, unexpected_triggers: "form_submissions.webhook", scheduled_jobs: "1 job(s)" }).problems).toHaveLength(3);
  });

  it("requires the staging-only probe row before anything else", async () => {
    const client = (n) => ({ query: async (sql) => (sql.includes("qr_links") ? { rows: [{ n }] } : { rows: [{ public_triggers: 21, unexpected_triggers: "none", scheduled_jobs: "pg_cron not installed" }] }) });
    await expect(assertStagingDatabase(client(0))).rejects.toThrow(/not staging/);
    await expect(assertStagingDatabase(client(1))).resolves.toMatchObject({ probe: expect.any(String) });
  });
});
