import { describe, expect, it } from "vitest";

import { buildAssetTimeline, type TimelineInput } from "./timeline";

const base: TimelineInput = {
  assetCreatedAt: "2026-01-01T00:00:00Z",
  archivedAt: null,
  submissions: [],
  acknowledgements: [],
  tagRequests: [],
  rentalSessions: [],
};

describe("buildAssetTimeline", () => {
  it("merges all record types newest-first", () => {
    const events = buildAssetTimeline({
      ...base,
      submissions: [
        {
          id: "s1",
          form_type: "damage_report",
          status: "new",
          created_at: "2026-03-01T00:00:00Z",
          submitted_by_name: "Jamie",
          attachmentCount: 2,
        },
      ],
      acknowledgements: [
        {
          id: "a1",
          name: "Pat",
          email: "pat@site.test",
          phone: null,
          statement: "I acknowledge the safety notes.",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      tagRequests: [{ id: "t1", status: "in_production", created_at: "2026-04-01T00:00:00Z" }],
    });

    expect(events.map((e) => e.kind)).toEqual([
      "tag_request", // Apr
      "submission", // Mar
      "acknowledgement", // Feb
      "created", // Jan
    ]);
  });

  it("emits an outbound baseline (pre_use_inspection) + rental-started as two distinct events", () => {
    const events = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      submissions: [
        {
          id: "ob1",
          form_type: "pre_use_inspection",
          status: "resolved",
          created_at: "2026-05-01T00:00:01Z",
          submitted_by_name: "Sam (staff)",
          attachmentCount: 3,
        },
      ],
      rentalSessions: [
        {
          id: "r1",
          status: "active",
          rental_reference: "PO-42",
          renter_label: "Acme",
          started_at: "2026-05-01T00:00:00Z",
          returned_at: null,
        },
      ],
    });
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("submission");
    expect(kinds).toContain("rental_started");
    // Active session with no return → no rental_ended.
    expect(kinds).not.toContain("rental_ended");
    const outbound = events.find((e) => e.kind === "submission");
    expect(outbound?.title).toBe("Outbound inspection");
    expect(outbound?.detail).toBe("Sam (staff)");
    expect(outbound?.attachmentCount).toBe(3);
  });

  it("titles a staff return distinctly from a renter return via origin", () => {
    const staff = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      submissions: [
        {
          id: "sr1",
          form_type: "return_checklist",
          status: "resolved",
          created_at: "2026-05-02T00:00:00Z",
          submitted_by_name: "Sam (staff)",
          attachmentCount: 1,
          origin: "staff",
        },
      ],
    });
    expect(staff[0].title).toBe("Staff return inspection");

    const renter = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      submissions: [
        {
          id: "rr1",
          form_type: "return_checklist",
          status: "new",
          created_at: "2026-05-02T00:00:00Z",
          submitted_by_name: "Pat",
          attachmentCount: 1,
          origin: "public",
        },
      ],
    });
    expect(renter[0].title).toBe("Renter return");
  });

  it("enriches a damaged return submission event with reference, origin, and the damage flag", () => {
    const [event] = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      submissions: [
        {
          id: "a1b2c3d4-0000-0000-0000-000000000000",
          form_type: "return_checklist",
          status: "new",
          created_at: "2026-05-01T00:00:00Z",
          submitted_by_name: "Sam (staff)",
          attachmentCount: 1,
          origin: "staff",
          damage: true,
          missing: false,
        },
      ],
    });
    expect(event.kind).toBe("submission");
    expect(event.title).toBe("Staff return inspection");
    expect(event.reference).toBe("SUB-2026-A1B2C3");
    expect(event.origin).toBe("staff");
    expect(event.status).toBe("new");
    expect(event.damage).toBe(true);
    expect(event.href).toBe("/dashboard/submissions/a1b2c3d4-0000-0000-0000-000000000000");
  });

  it("carries the acknowledgement name, contact, and statement as a record", () => {
    const [ack] = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      acknowledgements: [
        {
          id: "a1",
          name: "Pat",
          email: "pat@site.test",
          phone: "555-0100",
          statement: "I acknowledge the safety notes.",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
    });
    expect(ack.kind).toBe("acknowledgement");
    expect(ack.detail).toBe("Pat");
    expect(ack.contact).toBe("pat@site.test · 555-0100");
    expect(ack.statement).toBe("I acknowledge the safety notes.");
  });

  it("carries submission status, attachment count, and an admin link", () => {
    const [event] = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      submissions: [
        {
          id: "s9",
          form_type: "support_request",
          status: "reviewed",
          created_at: "2026-05-01T00:00:00Z",
          submitted_by_name: null,
          attachmentCount: 3,
        },
      ],
    });
    expect(event.title).toBe("Support request");
    expect(event.badge).toBe("reviewed");
    expect(event.attachmentCount).toBe(3);
    expect(event.href).toBe("/dashboard/submissions/s9");
  });

  it("emits rental started and ended events, newest-first", () => {
    const events = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      rentalSessions: [
        {
          id: "r1",
          status: "returned",
          rental_reference: "RA-1",
          renter_label: "Crew B",
          started_at: "2026-03-01T00:00:00Z",
          returned_at: "2026-03-10T00:00:00Z",
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual(["rental_ended", "rental_started"]);
    expect(events[0].title).toBe("Rental returned");
    expect(events[1].detail).toBe("Crew B · RA-1");
  });

  it("omits the ended event for a still-active session", () => {
    const events = buildAssetTimeline({
      ...base,
      assetCreatedAt: null,
      rentalSessions: [
        {
          id: "r2",
          status: "active",
          rental_reference: null,
          renter_label: null,
          started_at: "2026-04-01T00:00:00Z",
          returned_at: null,
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual(["rental_started"]);
  });

  it("includes an archived event only when archivedAt is set", () => {
    expect(
      buildAssetTimeline({ ...base, archivedAt: "2026-06-01T00:00:00Z" }).some(
        (e) => e.kind === "archived"
      )
    ).toBe(true);
    expect(buildAssetTimeline(base).some((e) => e.kind === "archived")).toBe(false);
  });

  it("only emits events from the passed (single-asset) arrays", () => {
    // No inputs beyond the created anchor → exactly one event.
    expect(buildAssetTimeline(base)).toHaveLength(1);
    expect(
      buildAssetTimeline({ ...base, assetCreatedAt: null })
    ).toHaveLength(0);
  });
});
