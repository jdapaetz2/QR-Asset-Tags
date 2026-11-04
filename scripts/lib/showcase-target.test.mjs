import { describe, expect, it } from "vitest";

import {
  EXPECTED_TRIGGERS,
  PRODUCTION_DB_ENV,
  PRODUCTION_REF,
  STAGING_DB_ENV,
  STAGING_REF,
  assertProductionDatabase,
  assertStagingDatabase,
  catalogVerdict,
  productionDbConfig,
  stagingDbConfig,
} from "./showcase-target.mjs";

// Engineering Phase E2B / E2C: the staging and Production database guards. Every URL below is a made-up example with
// a fake password.

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

const prodEnv = (url) => ({ [PRODUCTION_DB_ENV]: url });
const PROD_POOLER = `postgresql://postgres.${PRODUCTION_REF}:fake-password@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;

describe("productionDbConfig (E2C)", () => {
  it("accepts Production's session pooler and direct host", () => {
    expect(productionDbConfig(prodEnv(PROD_POOLER))).toMatchObject({ port: 5432, user: `postgres.${PRODUCTION_REF}` });
    expect(productionDbConfig(prodEnv(`postgresql://postgres:fake-password@db.${PRODUCTION_REF}.supabase.co:5432/postgres`)).describe).toContain("direct");
  });

  it("refuses staging, the transaction pooler, other hosts, plaintext and the staging variable", () => {
    expect(() => productionDbConfig(prodEnv(PROD_POOLER.replace(PRODUCTION_REF, STAGING_REF)))).toThrow(/staging project/);
    expect(() => productionDbConfig(prodEnv(PROD_POOLER.replace(":5432/", ":6543/")))).toThrow(/transaction pooler/);
    expect(() => productionDbConfig(prodEnv(PROD_POOLER.replace(PRODUCTION_REF, "someotherproject")))).toThrow(/Production project/);
    expect(() => productionDbConfig(prodEnv("postgresql://postgres:x@127.0.0.1:5432/postgres"))).toThrow(/neither/);
    expect(() => productionDbConfig(prodEnv(`${PROD_POOLER}?sslmode=prefer`))).toThrow(/TLS/);
    expect(() => productionDbConfig({ [STAGING_DB_ENV]: PROD_POOLER })).toThrow(/PHASE_E_PRODUCTION_DB_URL is not set/);
    try {
      productionDbConfig(prodEnv(PROD_POOLER.replace(PRODUCTION_REF, STAGING_REF)));
    } catch (err) {
      expect(err.message).not.toContain("fake-password");
    }
  });
});

describe("Production database proof (E2C)", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const ROUTES = [{ qr_link_id: "41111111-1111-4111-8111-111111111101", short_code: "demo-ex017", asset_id: "21111111-1111-4111-8111-111111111101" }];
  const qrRow = { id: ROUTES[0].qr_link_id, short_code: "demo-ex017", asset_id: ROUTES[0].asset_id, organization_id: ORG, status: "active", is_production_primary: true, supersedes_qr_link_id: null };
  const client = ({ probe = 0, qr = [qrRow], catalog = { public_triggers: 21, unexpected_triggers: "none", scheduled_jobs: "pg_cron not installed" }, status = "suspended" } = {}) => ({
    query: async (sql) => {
      if (sql.includes("count(*)::int as n")) return { rows: [{ n: probe }] };
      if (sql.includes("is_production_primary")) return { rows: qr };
      if (sql.includes("organizations")) return { rows: [{ status }] };
      return { rows: [catalog] };
    },
  });
  const check = (c, requireSuspended = true) => assertProductionDatabase(c, { routes: ROUTES, organizationId: ORG, requireSuspended });

  it("accepts Production with the protected rows exactly as tracked and the organization suspended", async () => {
    await expect(check(client())).resolves.toMatchObject({ organization: "suspended" });
    await expect(check(client({ status: "active" }), false)).resolves.toMatchObject({ probe: expect.any(String) });
  });

  it("refuses staging, a changed protected row, an unreviewed catalog and an active organization", async () => {
    await expect(check(client({ probe: 1 }))).rejects.toThrow(/not Production/);
    await expect(check(client({ qr: [] }))).rejects.toThrow(/demo-ex017/);
    await expect(check(client({ qr: [{ ...qrRow, status: "disabled" }] }))).rejects.toThrow(/demo-ex017/);
    await expect(check(client({ qr: [{ ...qrRow, is_production_primary: false }] }))).rejects.toThrow(/demo-ex017/);
    await expect(check(client({ catalog: { public_triggers: 22, unexpected_triggers: "qr_links.extra", scheduled_jobs: "pg_cron not installed" } }))).rejects.toThrow(/catalog/);
    await expect(check(client({ status: "active" }))).rejects.toThrow(/suspended/);
  });
});
