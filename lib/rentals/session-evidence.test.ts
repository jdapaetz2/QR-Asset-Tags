import { describe, expect, it } from "vitest";

import {
  getRentalSessionEvidence,
  type AckRow,
  type AssetRow,
  type EvidenceQueryClient,
  type SessionRow,
  type SubRow,
} from "./session-evidence";

const SESSION: SessionRow = {
  id: "11111111-1111-1111-1111-111111111111",
  asset_id: "22222222-2222-2222-2222-222222222222",
  organization_id: "33333333-3333-3333-3333-333333333333",
  status: "active",
  rental_reference: "RNT-1",
  renter_label: "Acme",
  started_at: "2026-07-01T00:00:00.000Z",
  returned_at: null,
};
const ASSET: AssetRow = { asset_code: "AT-001", asset_name: "Trailer" };

const sub = (over: Partial<SubRow>): SubRow => ({
  id: "s1",
  created_at: "2026-07-02T00:00:00.000Z",
  form_type: "return_checklist",
  submission_origin: "public",
  status: "new",
  submitted_by_name: "R",
  submission_data_json: { schema_version: 2 },
  media_urls: [],
  ...over,
});

const outbound = sub({ id: "o", form_type: "pre_use_inspection", submission_origin: "staff" });
const renter = sub({ id: "r", form_type: "return_checklist", submission_origin: "public" });
const staff = sub({ id: "st", form_type: "return_checklist", submission_origin: "staff" });

const ack = (over: Partial<AckRow> = {}): AckRow => ({
  id: "ack1",
  name: "Renter",
  email: null,
  phone: null,
  statement: "I acknowledge…",
  acknowledged_at: "2026-07-01T12:00:00.000Z",
  ...over,
});

/** Build a fake injectable client; override any of the reads. */
function client(over: Partial<EvidenceQueryClient> = {}): EvidenceQueryClient {
  return {
    loadSession: async () => ({ data: SESSION, error: null }),
    loadAsset: async () => ({ data: ASSET, error: null }),
    loadSubmissions: async () => ({ data: [outbound, renter, staff], error: null }),
    loadAcknowledgements: async () => ({ data: [], error: null }),
    ...over,
  };
}

describe("getRentalSessionEvidence", () => {
  it("1. active session with full evidence loads", async () => {
    const r = await getRentalSessionEvidence(client(), SESSION.id);
    expect(r?.session.id).toBe(SESSION.id);
    expect(r?.asset).toEqual(ASSET);
    expect(r?.submissions).toHaveLength(3);
  });

  it("2. closed session with full evidence loads (no active filter)", async () => {
    const closed: SessionRow = { ...SESSION, status: "returned", returned_at: "2026-07-03T00:00:00.000Z" };
    const r = await getRentalSessionEvidence(
      client({ loadSession: async () => ({ data: closed, error: null }) }),
      closed.id
    );
    expect(r?.session.status).toBe("returned");
  });

  it("3. closed session with no outbound inspection loads (empty state, not 404)", async () => {
    const r = await getRentalSessionEvidence(
      client({ loadSubmissions: async () => ({ data: [renter, staff], error: null }) }),
      SESSION.id
    );
    expect(r).not.toBeNull();
    expect(r?.submissions.some((s) => s.form_type === "pre_use_inspection")).toBe(false);
  });

  it("4. closed session with no renter report loads", async () => {
    const r = await getRentalSessionEvidence(
      client({ loadSubmissions: async () => ({ data: [outbound, staff], error: null }) }),
      SESSION.id
    );
    expect(r).not.toBeNull();
  });

  it("5. closed session with only a staff return loads", async () => {
    const r = await getRentalSessionEvidence(
      client({ loadSubmissions: async () => ({ data: [staff], error: null }) }),
      SESSION.id
    );
    expect(r?.submissions).toHaveLength(1);
  });

  it("7. a missing session returns null (→ notFound in the page)", async () => {
    const r = await getRentalSessionEvidence(
      client({ loadSession: async () => ({ data: null, error: null }) }),
      SESSION.id
    );
    expect(r).toBeNull();
  });

  it("8. a cross-org session hidden by RLS returns null (never another org's data)", async () => {
    // RLS returns no row for a cross-org id — identical to missing.
    const r = await getRentalSessionEvidence(
      client({ loadSession: async () => ({ data: null, error: null }) }),
      "44444444-4444-4444-4444-444444444444"
    );
    expect(r).toBeNull();
  });

  it("9. a related-record query failure throws (never a silent 404)", async () => {
    await expect(
      getRentalSessionEvidence(
        client({ loadSubmissions: async () => ({ data: null, error: { message: "boom" } }) }),
        SESSION.id
      )
    ).rejects.toThrow(/submissions/);
  });

  it("a session-load DB error throws (never a silent 404)", async () => {
    await expect(
      getRentalSessionEvidence(
        client({ loadSession: async () => ({ data: null, error: { message: "PGRST201" } }) }),
        SESSION.id
      )
    ).rejects.toThrow(/session/);
  });

  it("10. evidence missing while the session exists → empty related data, not 404", async () => {
    const r = await getRentalSessionEvidence(
      client({ loadSubmissions: async () => ({ data: [], error: null }) }),
      SESSION.id
    );
    expect(r).not.toBeNull();
    expect(r?.submissions).toEqual([]);
  });

  it("loads this session's acknowledgements, scoped by session id (Phase 3C.7)", async () => {
    let scopedSessionId: string | null = null;
    let scopedAssetId: string | null | undefined;
    const r = await getRentalSessionEvidence(
      client({
        loadAcknowledgements: async (sessionId, assetId) => {
          scopedSessionId = sessionId;
          scopedAssetId = assetId;
          return { data: [ack({ id: "one" })], error: null };
        },
      }),
      SESSION.id
    );
    expect(scopedSessionId).toBe(SESSION.id); // never asset-only → sibling sessions excluded
    expect(scopedAssetId).toBe(SESSION.asset_id);
    expect(r?.acknowledgements).toHaveLength(1);
    expect(r?.acknowledgements[0].id).toBe("one");
  });

  it("a session with no acknowledgements loads with an empty ack list", async () => {
    const r = await getRentalSessionEvidence(client(), SESSION.id);
    expect(r?.acknowledgements).toEqual([]);
  });

  it("an acknowledgements query failure throws (never a silent 404)", async () => {
    await expect(
      getRentalSessionEvidence(
        client({ loadAcknowledgements: async () => ({ data: null, error: { message: "boom" } }) }),
        SESSION.id
      )
    ).rejects.toThrow(/acknowledgements/);
  });

  it("a session with no asset_id loads without an asset query", async () => {
    let assetQueried = false;
    const r = await getRentalSessionEvidence(
      client({
        loadSession: async () => ({ data: { ...SESSION, asset_id: null }, error: null }),
        loadAsset: async () => {
          assetQueried = true;
          return { data: ASSET, error: null };
        },
      }),
      SESSION.id
    );
    expect(assetQueried).toBe(false);
    expect(r?.asset).toBeNull();
  });
});
