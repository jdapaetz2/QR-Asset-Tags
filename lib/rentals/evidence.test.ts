import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { rentalEvidenceHref } from "./evidence";

const here = dirname(fileURLToPath(import.meta.url));

describe("rentalEvidenceHref", () => {
  it("builds the canonical session-evidence path for a real session id", () => {
    expect(rentalEvidenceHref("sess-123")).toBe("/dashboard/rentals/sess-123");
  });

  it("guards a falsy id so it never mints /dashboard/rentals/undefined", () => {
    expect(rentalEvidenceHref(null)).toBe("/dashboard/rentals");
    expect(rentalEvidenceHref(undefined)).toBe("/dashboard/rentals");
    expect(rentalEvidenceHref("")).toBe("/dashboard/rentals");
  });

  it("the canonical rentals route page exists (guards against a missing route)", () => {
    // lib/rentals → repo root → the (admin) session-evidence route.
    const routeFile = resolve(
      here,
      "../../app/(admin)/dashboard/rentals/[sessionId]/page.tsx"
    );
    expect(existsSync(routeFile)).toBe(true);
  });
});
