import { hash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DATASET_FILE, MEDIA_FILE, SCENARIO_FILE, SHOWCASE_DIR, expandDataset, ownedIds, serializeDataset } from "../../lib/showcase-dataset.mjs";
import { buildShowcaseDataset } from "./build-dataset.ts";

/**
 * Engineering Phase E2B — the tracked synthetic showcase dataset is exactly what the builder produces from the tracked
 * scenario and media, and it holds the scenario's invariants (the builder refuses to emit anything else).
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(REPO, file), "utf8");
const scenarioText = read(SCENARIO_FILE);
const scenario = JSON.parse(scenarioText);
const media = JSON.parse(read(MEDIA_FILE));
const trackedText = read(DATASET_FILE);
const tracked = JSON.parse(trackedText);
const build = (overrides = {}) =>
  buildShowcaseDataset({ scenario, scenarioSha256: hash("sha256", scenarioText), media, previous: tracked, ...overrides });

describe("showcase dataset", () => {
  it("is up to date with the scenario, the media map and the app's templates (else: npm run phase-e:showcase:build)", () => {
    expect(serializeDataset(build())).toBe(trackedText);
  });

  it("uses the tracked evidence images byte for byte", () => {
    for (const item of media.items) {
      const bytes = readFileSync(path.join(REPO, SHOWCASE_DIR, "media", item.file));
      expect(hash("sha256", bytes), item.file).toBe(item.sha256);
      expect(bytes.length, item.file).toBe(item.bytes);
    }
  });

  it("stores each photo under its own submission, shows the right asset, and uses each damage image once", () => {
    const expanded = expandDataset(tracked);
    const subs = new Map(expanded.rows.form_submissions.map((r) => [r.id, r]));
    const assets = new Map(tracked.assets.map((a) => [a.asset_code, a.asset_id]));
    const items = new Map(media.items.map((i) => [i.key, i]));
    const damageUse = new Map();
    const referenced = new Set();
    for (const row of expanded.rows.form_submissions) for (const p of row.media_urls) referenced.add(p);
    expect(new Set(tracked.objects.map((o) => o.path))).toEqual(referenced);
    for (const object of tracked.objects) {
      const subId = object.path.split("/")[5];
      const row = subs.get(subId);
      expect(row, object.path).toBeTruthy();
      expect(object.path.startsWith(`org/${row.organization_id}/asset/${row.asset_id}/submission/${row.id}/`)).toBe(true);
      expect(object.path).toMatch(/\/[0-9a-f-]{36}\.webp$/);
      const item = items.get(object.media);
      expect(assets.get(item.asset_code)).toBe(row.asset_id);
      expect(object.sha256).toBe(item.sha256);
      if (item.used_for.includes("damage_photos")) damageUse.set(item.key, (damageUse.get(item.key) ?? 0) + 1);
    }
    for (const [key, uses] of damageUse) expect(uses, key).toBe(1);
  });

  it("expands every frozen template snapshot", () => {
    const expanded = expandDataset(tracked);
    for (const row of expanded.rows.form_submissions) {
      if (!row.inspection_template_key) continue;
      const snapshot = row.submission_data_json.template_snapshot;
      expect(snapshot.key).toBe(row.inspection_template_key);
      expect(snapshot.version).toBe(row.inspection_template_version);
      expect(snapshot.sections.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(tracked.rows)).not.toContain('"sections"');
  });

  it("refuses a template that changed without a version bump", () => {
    const ref = Object.keys(tracked.templates)[0];
    const edited = JSON.parse(JSON.stringify(tracked.templates));
    edited[ref].sections[0].title = "Edited";
    expect(() => build({ previous: { ...tracked, templates: edited } })).toThrow(/changed without a version bump/);
  });

  it("rebuilds for another anchor with the same ids for the same rentals and records", () => {
    const moved = build({ anchorDate: "2026-11-24" });
    expect(moved.anchor.utc).not.toBe(tracked.anchor.utc);
    const before = ownedIds(tracked);
    const after = ownedIds(moved);
    for (const table of ["asset_rental_sessions", "asset_acknowledgements"]) expect(after[table], table).toEqual(before[table]);
    const shared = after.form_submissions.filter((id) => before.form_submissions.includes(id)).length;
    expect(shared / before.form_submissions.length).toBeGreaterThan(0.9);
    for (const a of moved.assets) expect(a.active_rental_session_id).toBe(tracked.assets.find((t) => t.asset_code === a.asset_code).active_rental_session_id);
  });

  it("carries only fictional people and reserved contact data", () => {
    const text = JSON.stringify(tracked.rows);
    for (const email of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) ?? []) expect(email).toMatch(/\.example$/);
    for (const phone of text.match(/\b\d{3}-\d{3}-\d{4}\b/g) ?? []) expect(phone).toMatch(/^\d{3}-555-01\d{2}$/);
    expect(tracked.rows.asset_rental_sessions.every((s) => String(s.rental_reference).startsWith("DEMO-"))).toBe(true);
    expect(text).not.toMatch(/"(created_by|returned_by|submitted_by)_profile_id":"/);
  });
});
