import { describe, expect, it } from "vitest";

import { planTagRequestUpdate } from "./status-transition";

const NOW = new Date("2026-09-11T17:30:00.000Z");

describe("planTagRequestUpdate", () => {
  it("a real status change is a transition and writes status + notes", () => {
    expect(
      planTagRequestUpdate({ currentStatus: "in_review", submittedStatus: "ready", productionNotes: "Batch 4", now: NOW })
    ).toEqual({ update: { status: "ready", production_notes: "Batch 4" }, statusChanged: true });
  });

  it("a same-status save is not a transition", () => {
    expect(
      planTagRequestUpdate({ currentStatus: "ready", submittedStatus: "ready", productionNotes: null, now: NOW }).statusChanged
    ).toBe(false);
  });

  it("a notes-only save is not a transition and still saves the notes", () => {
    expect(
      planTagRequestUpdate({ currentStatus: "in_production", submittedStatus: "in_production", productionNotes: "Reprint 2", now: NOW })
    ).toEqual({ update: { status: "in_production", production_notes: "Reprint 2" }, statusChanged: false });
  });

  it("stamps delivered_at only on a change into delivered", () => {
    expect(
      planTagRequestUpdate({ currentStatus: "ready", submittedStatus: "delivered", productionNotes: null, now: NOW }).update
    ).toEqual({ status: "delivered", production_notes: null, delivered_at: "2026-09-11T17:30:00.000Z" });
  });

  it("never restamps delivered_at on a later notes-only save while delivered", () => {
    const plan = planTagRequestUpdate({
      currentStatus: "delivered",
      submittedStatus: "delivered",
      productionNotes: "Customer confirmed receipt",
      now: NOW,
    });
    expect(plan.statusChanged).toBe(false);
    expect(plan.update).not.toHaveProperty("delivered_at");
  });

  it("leaving delivered keeps the existing delivered_at (the save never writes it)", () => {
    const plan = planTagRequestUpdate({ currentStatus: "delivered", submittedStatus: "ready", productionNotes: null, now: NOW });
    expect(plan.statusChanged).toBe(true);
    expect(plan.update).not.toHaveProperty("delivered_at");
  });

  it("a genuine re-delivery stamps the new delivery moment", () => {
    expect(
      planTagRequestUpdate({ currentStatus: "cancelled", submittedStatus: "delivered", productionNotes: null, now: NOW }).update
        .delivered_at
    ).toBe("2026-09-11T17:30:00.000Z");
  });
});
