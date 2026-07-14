import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server module → asserted structurally (Phase 3C.6). Guards the soft-photo evidence + session-attach wiring.
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "outbound-submit.ts"),
  "utf8"
);

describe("outbound-submit — soft photo evidence", () => {
  it("no longer hard-requires photos (removes the min-count rejection)", () => {
    // The user-facing "Add at least N photo…" rejection is gone; only the max cap remains.
    expect(src).not.toContain("Add at least");
    expect(src).toContain("count > max");
  });

  it("uses the shared soft-evidence resolver + omission ack (like the return core)", () => {
    expect(src).toContain("resolvePhotoEvidence");
    expect(src).toContain("readOmissionAck(formData)");
    expect(src).toContain("condition_photos_missing");
    expect(src).toContain("damage_photos_missing");
  });
});

describe("outbound-submit — session create/attach", () => {
  it("drops the pre-guard that rejected an active rental session", () => {
    // The old hard block returned this before doing any work.
    expect(src).not.toMatch(/if \(asset\.active_rental_session_id\) \{\s*return \{ error:/);
  });

  it("maps the RPC result via the shared create/attach helpers", () => {
    expect(src).toContain("outboundSuccessFlag");
    expect(src).toContain("outboundResultError");
    // Redirects with the ?started= / ?attached= flag from the helper.
    expect(src).toContain("?${flag}=");
  });
});
