import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const btn = readFileSync(resolve(here, "mark-rented-button.tsx"), "utf8");
const fields = readFileSync(resolve(here, "rental-details-fields.tsx"), "utf8");

describe("mark-rented dialog (Phase 3C.6)", () => {
  it("opens an accessible dialog and captures shared rental details", () => {
    expect(btn).toContain("<dialog");
    expect(btn).toContain("RentalDetailsFields");
    expect(btn).toContain("startRentalSession");
  });

  it("uses a roomy dialog instead of the cramped fixed-width popover (overflow fix)", () => {
    expect(btn).toContain("w-[min(92vw");
    expect(btn).not.toContain("flex w-56 flex-col");
  });

  it("wraps the unresolved-damage warning + actions responsively (no overflow)", () => {
    expect(btn).toContain("break-words");
    expect(btn).toContain("min-w-0");
    expect(btn).toContain("flex-wrap");
    expect(btn).toContain("View submissions");
  });
});

describe("shared rental-details fields", () => {
  it("defines the canonical optional field names once", () => {
    expect(fields).toContain('name="renter_label"');
    expect(fields).toContain('name="rental_reference"');
  });
});
