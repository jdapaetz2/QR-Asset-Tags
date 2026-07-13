import { describe, expect, it } from "vitest";

import { reconcileRenterStatus } from "./reconcile";

describe("reconcileRenterStatus", () => {
  it("auto-resolves a clean renter report when the staff return is clean", () => {
    expect(
      reconcileRenterStatus({ staffClean: true, renterClean: true, current: "new" })
    ).toBe("resolved");
    expect(
      reconcileRenterStatus({ staffClean: true, renterClean: true, current: "reviewed" })
    ).toBe("resolved");
  });

  it("marks a renter report with damage/missing reviewed (never resolved), keeping attention", () => {
    // Renter reported damage.
    expect(
      reconcileRenterStatus({ staffClean: true, renterClean: false, current: "new" })
    ).toBe("reviewed");
    // Staff found damage (renter clean) — still not auto-resolved.
    expect(
      reconcileRenterStatus({ staffClean: false, renterClean: true, current: "new" })
    ).toBe("reviewed");
    // Discrepancy: renter reported, staff did not confirm — stays reviewed for a manager.
    expect(
      reconcileRenterStatus({ staffClean: false, renterClean: false, current: "reviewed" })
    ).toBe("reviewed");
  });

  it("never touches a resolved or archived report (no accidental reopen/resolve)", () => {
    expect(
      reconcileRenterStatus({ staffClean: true, renterClean: true, current: "resolved" })
    ).toBe("resolved");
    expect(
      reconcileRenterStatus({ staffClean: true, renterClean: true, current: "archived" })
    ).toBe("archived");
  });
});
