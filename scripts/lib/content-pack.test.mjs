import { describe, expect, it } from "vitest";

import {
  citedSourceIds,
  embedSources,
  locatorPdfPages,
  readinessProblems,
  renderReviewMarkdown,
  renderStoryboardMarkdown,
  statusCounts,
} from "./content-pack.mjs";

const register = {
  sources: [
    { source_id: "src-a", kind: "oem-manual", title: "Manual A", rights: { status: "unknown", redistribution: "link-only" }, verification: "read", availability: "in-hand" },
    { source_id: "src-b", kind: "oem-web", title: "Page B", rights: { status: "unknown", redistribution: "link-only" }, verification: "read" },
    { source_id: "src-c", kind: "photo", title: "Photo C", rights: { status: "cc0", redistribution: "public-host" }, verification: "read" },
    { source_id: "src-unused", kind: "oem-web", title: "Unused", rights: { status: "unknown", redistribution: "link-only" }, verification: "read" },
  ],
};

function pack(overrides = {}) {
  return {
    manifest_id: "test-pack",
    organization: { name: "Test", policies: [] },
    sources: [],
    models: [
      {
        model_key: "maker.model.cfg",
        manufacturer: "Maker",
        model: "M1",
        category: "Thing",
        configuration: { length_ft: 12 },
        manual: { source_id: "src-a", delivery: "link", supplements: [] },
        specs: [{ spec_id: "w", label: "Weight", value: "1 lb", source_refs: [{ source_id: "src-b", locator: "table" }], status: "READY" }],
        quick_guide: [{ step_id: "s1", text: "Do it.", source_refs: [{ source_id: "src-a", locator: "p. 3" }], safety_critical: true, status: "REVIEW_REQUIRED" }],
        warnings: [],
        support_notes: [],
        pictograms: [
          { panel_id: "p1", title: "Panel", task: "Task", caption: "Caption", source_refs: [{ source_id: "src-a", locator: "pp. 3-4" }], status: "BLOCKED", status_reason: "Needs the manual." },
        ],
        photo: { source_id: "src-c", status: "REVIEW_REQUIRED" },
        templates: { return: "utility_trailer" },
        common_accessories: ["Straps"],
        review: { status: "MULEMARK_REVIEW", blockers: ["Reviewer not named."] },
        ...overrides,
      },
    ],
    assets: [{ asset_code: "T-1", asset_name: "Thing 1", serial_number: "DEMO-1", qr: { existing_short_code: "abc" }, review: { status: "MULEMARK_REVIEW" } }],
  };
}

describe("source embedding", () => {
  it("collects the manual, every source_ref and the photo", () => {
    expect([...citedSourceIds(pack())].sort()).toEqual(["src-a", "src-b", "src-c"]);
  });

  it("embeds cited register entries in register order and refuses unknown citations", () => {
    expect(embedSources(pack(), register).map((s) => s.source_id)).toEqual(["src-a", "src-b", "src-c"]);
    const bad = pack({ manual: { source_id: "src-missing", delivery: "link" } });
    expect(() => embedSources(bad, register)).toThrow(/src-missing/);
  });
});

describe("status rules", () => {
  it("counts every status-bearing item, including the photo", () => {
    expect(statusCounts(pack().models[0])).toEqual({ READY: 1, REVIEW_REQUIRED: 2, BLOCKED: 1 });
  });

  it("refuses a READY model that still has REVIEW_REQUIRED or BLOCKED items", () => {
    const model = pack({ review: { status: "READY" } }).models[0];
    expect(readinessProblems(model)[0]).toMatch(/READY with 2 REVIEW_REQUIRED and 1 BLOCKED/);
    expect(readinessProblems(pack().models[0])).toEqual([]);
  });

  it("requires a reason on every BLOCKED item", () => {
    const model = pack({ specs: [{ spec_id: "x", label: "X", value: "?", source_refs: [{ source_id: "src-b" }], status: "BLOCKED" }] }).models[0];
    expect(readinessProblems(model)).toEqual(["maker.model.cfg x: BLOCKED needs a status_reason."]);
  });
});

describe("locatorPdfPages", () => {
  it("applies the printed-page offset and keeps literal PDF pages", () => {
    expect(locatorPdfPages("p. 6, 1.2.4 warning; pp. 36-37", { offset: 1 })).toEqual([7, 37, 38]);
    expect(locatorPdfPages("PDF p. 2, \"While Operating\"", { offset: 5 })).toEqual([2]);
    expect(locatorPdfPages("Features & Options, Coupler")).toEqual([]);
    expect(locatorPdfPages("anything", { singleSheet: true })).toEqual([1]);
  });
});

describe("review copies", () => {
  it("renders the review copy and storyboard from the pack alone", () => {
    const p = pack();
    p.sources = embedSources(p, register);
    const review = renderReviewMarkdown(p, { packDir: "docs/x/", generator: "gen.mjs" });
    expect(review).toContain("# Maker M1: content pack review copy");
    expect(review).toContain("| Items | 1 READY · 2 REVIEW_REQUIRED · 1 BLOCKED |");
    expect(review).toContain("Manual A, p. 3");
    const storyboard = renderStoryboardMarkdown(p, { generator: "gen.mjs" });
    expect(storyboard).toContain("## 1. Panel `p1` · BLOCKED");
    expect(storyboard).toContain("No final artwork is drawn until it is approved.");
  });
});
