import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  outboundResultError,
  outboundSessionMode,
  outboundSuccessFlag,
} from "./outbound-session";

describe("outboundSessionMode", () => {
  it("no active session → create", () => {
    expect(outboundSessionMode({ activeSessionId: null, hasBaseline: false })).toBe("create");
    expect(outboundSessionMode({ activeSessionId: undefined, hasBaseline: false })).toBe("create");
  });
  it("active session, no baseline → attach", () => {
    expect(outboundSessionMode({ activeSessionId: "s1", hasBaseline: false })).toBe("attach");
  });
  it("active session with baseline → blocked", () => {
    expect(outboundSessionMode({ activeSessionId: "s1", hasBaseline: true })).toBe("blocked");
  });
});

describe("outboundSuccessFlag", () => {
  it("maps success codes to the redirect flag; non-success → null", () => {
    expect(outboundSuccessFlag("session_created")).toBe("started");
    expect(outboundSuccessFlag("attached_to_existing_session")).toBe("attached");
    expect(outboundSuccessFlag("baseline_already_exists")).toBeNull();
    expect(outboundSuccessFlag("not_found")).toBeNull();
  });
});

describe("outboundResultError", () => {
  it("maps non-success codes to clear messages", () => {
    expect(outboundResultError("baseline_already_exists")).toContain("already recorded");
    expect(outboundResultError("session_conflict")).toContain("rental changed");
    expect(outboundResultError("not_found")).toBe("Asset not found.");
  });
});

// The migration guarantees one baseline per session + the create/attach result codes.
describe("migration 0030 shape", () => {
  const sql = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../supabase/migrations/0030_outbound_attach_session.sql"
    ),
    "utf8"
  );
  it("adds the one-outbound-per-session unique index", () => {
    expect(sql).toContain("form_submissions_one_outbound_per_session_idx");
    expect(sql).toContain("where form_type = 'pre_use_inspection' and rental_session_id is not null");
  });
  it("returns all three primary result codes", () => {
    expect(sql).toContain("'session_created'");
    expect(sql).toContain("'attached_to_existing_session'");
    expect(sql).toContain("'baseline_already_exists'");
  });
  it("fills only-blank rental details with coalesce (never overwrites non-empty)", () => {
    expect(sql).toContain("coalesce(s.renter_label, p_renter_label)");
    expect(sql).toContain("coalesce(s.rental_reference, p_reference)");
  });
});
