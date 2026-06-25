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
