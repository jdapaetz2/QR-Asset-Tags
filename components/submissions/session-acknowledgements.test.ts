import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server component → asserted structurally (Phase 3C.7, Part F): the three ack summary states + contact scoping.
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "session-acknowledgements.tsx"),
  "utf8"
);

describe("session-acknowledgements (Phase 3C.7, Part F)", () => {
  it("renders the three states with neutral empty copy", () => {
    expect(src).toContain("No renter acknowledgement recorded");
    expect(src).toContain("Acknowledged by");
    expect(src).toContain("acknowledgements recorded"); // "{count} acknowledgements recorded"
  });

  it("shows contact fields only inside the expandable per-record list", () => {
    // email/phone must appear AFTER the <details> list opens, never in the collapsed one-line summary.
    const detailsAt = src.indexOf("<details");
    const contactAt = src.indexOf("a.email");
    expect(detailsAt).toBeGreaterThan(-1);
    expect(contactAt).toBeGreaterThan(detailsAt);
    expect(src).toContain("a.phone");
  });

  it("prints the full list (participates in the evidence print-expand)", () => {
    expect(src).toContain("data-evidence-section");
  });

  it("is a lightweight record, never framed as an e-signature", () => {
    expect(src.toLowerCase()).not.toContain("signature");
    expect(src).toContain("statement"); // shows the stored statement verbatim
  });
});
