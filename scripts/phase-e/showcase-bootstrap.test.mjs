import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LOCAL_ADMIN, PRODUCTION_ROWS, bootstrapChanges } from "./showcase-bootstrap.mjs";

// Engineering Phase E2B: what the rehearsal bootstrap adds or aligns, on rows shaped like the local seed.

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const DATASET = read("../../docs/phase-e/showcase/dataset.json");
const SCENARIO = read("../../docs/phase-e/showcase/scenario.json");
const PROTECTED = read("../../docs/phase-e/manifests/protected-demo-routes.json");

const seedLike = () => ({
  assets: [
    { id: PRODUCTION_ROWS[0].asset_id, asset_code: "EXCAVATOR-017", created_at: "2026-10-20 09:00:00+00" },
    { id: PRODUCTION_ROWS[2].asset_id, asset_code: "TRAILER-014", created_at: "2026-10-20 09:00:00+00" },
  ],
  qrLinks: [
    { id: PRODUCTION_ROWS[0].qr_link_id, asset_id: PRODUCTION_ROWS[0].asset_id, short_code: "demo-ex017", created_at: "2026-10-20 09:00:00+00" },
    { id: PRODUCTION_ROWS[2].qr_link_id, asset_id: PRODUCTION_ROWS[2].asset_id, short_code: "demo-tr014", created_at: "2026-10-20 09:00:00+00" },
  ],
  pages: [{ id: "p1", asset_id: PRODUCTION_ROWS[0].asset_id }, { id: "p2", asset_id: PRODUCTION_ROWS[2].asset_id }],
  scans: [
    { id: "s-seed", asset_id: PRODUCTION_ROWS[0].asset_id },
    { id: DATASET.rows.scan_events[0].id, asset_id: DATASET.rows.scan_events[0].asset_id },
    { id: "s-other-asset", asset_id: "21111111-1111-4111-8111-111111111103" },
  ],
  ownedScanIds: DATASET.rows.scan_events.map((s) => s.id),
});

describe("showcase bootstrap", () => {
  it("matches the dataset, the scenario and the protected routes exactly", () => {
    for (const p of PRODUCTION_ROWS) {
      const a = DATASET.assets.find((x) => x.asset_code === p.asset_code);
      expect(a).toMatchObject({ asset_id: p.asset_id, qr_link_id: p.qr_link_id, short_code: p.short_code });
      const s = SCENARIO.assets.find((x) => x.asset_code === p.asset_code);
      expect(Date.parse(s.not_before)).toBe(Math.max(Date.parse(p.asset_created_at), Date.parse(p.qr_created_at)));
      expect(PROTECTED.routes.find((r) => r.short_code === p.short_code)).toMatchObject({ asset_id: p.asset_id, qr_link_id: p.qr_link_id });
    }
  });

  it("adds the missing assets, QR rows and pages, aligns creation times, and never deletes a dataset scan", () => {
    const c = bootstrapChanges(seedLike());
    expect(c.problems).toEqual([]);
    expect(c.insertAssets.map((p) => p.asset_code)).toEqual(["EXCAVATOR-3015", "TRAILER-2041"]);
    expect(c.alignAssets.map((p) => p.asset_code)).toEqual(["EXCAVATOR-017", "TRAILER-014"]);
    expect(c.insertQr.map((p) => p.short_code)).toEqual(["ezzs9ueg", "67uqc3q7"]);
    expect(c.insertPages.map((p) => p.asset_code)).toEqual(["EXCAVATOR-3015", "TRAILER-2041"]);
    expect(c.deleteScans).toEqual(["s-seed"]);
  });

  it("changes nothing the second time", () => {
    const done = seedLike();
    done.assets = PRODUCTION_ROWS.map((p) => ({ id: p.asset_id, asset_code: p.asset_code, created_at: p.asset_created_at }));
    done.qrLinks = PRODUCTION_ROWS.map((p) => ({ id: p.qr_link_id, asset_id: p.asset_id, short_code: p.short_code, created_at: p.qr_created_at }));
    done.pages = PRODUCTION_ROWS.map((p, i) => ({ id: `p${i}`, asset_id: p.asset_id }));
    done.scans = done.scans.filter((s) => s.id !== "s-seed");
    const c = bootstrapChanges(done);
    expect([c.insertAssets, c.alignAssets, c.insertQr, c.alignQr, c.insertPages, c.deleteScans, c.problems].every((l) => l.length === 0)).toBe(true);
  });

  it("refuses a target where the codes belong to other rows", () => {
    const clash = seedLike();
    clash.qrLinks.push({ id: "q-other", asset_id: "21111111-1111-4111-8111-111111111103", short_code: "ezzs9ueg", created_at: "2026-10-20 09:00:00+00" });
    expect(bootstrapChanges(clash).problems.join(" ")).toMatch(/ezzs9ueg/);
  });

  it("uses only a reserved local login", () => {
    expect(LOCAL_ADMIN.email).toMatch(/\.invalid$/);
  });
});
