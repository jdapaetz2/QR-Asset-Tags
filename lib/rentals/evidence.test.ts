import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSessionEvidenceHref, rentalEvidenceHref } from "./evidence";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("buildSessionEvidenceHref", () => {
  it("builds the canonical session-evidence path for a real session id", () => {
    expect(buildSessionEvidenceHref("sess-123")).toBe("/dashboard/rentals/sess-123");
  });

  it("guards a falsy id so it never mints /dashboard/rentals/undefined", () => {
    expect(buildSessionEvidenceHref(null)).toBe("/dashboard/rentals");
    expect(buildSessionEvidenceHref(undefined)).toBe("/dashboard/rentals");
    expect(buildSessionEvidenceHref("")).toBe("/dashboard/rentals");
  });

  it("keeps rentalEvidenceHref as a back-compat alias of the same helper", () => {
    expect(rentalEvidenceHref).toBe(buildSessionEvidenceHref);
    expect(rentalEvidenceHref("sess-123")).toBe("/dashboard/rentals/sess-123");
  });
});

describe("session-evidence routes", () => {
  it("the canonical [sessionId] route page exists (guards against a missing route)", () => {
    const routeFile = resolve(
      repoRoot,
      "app/(admin)/dashboard/rentals/[sessionId]/page.tsx"
    );
    expect(existsSync(routeFile)).toBe(true);
  });

  it("the bare /dashboard/rentals index page exists so a falsy-id href never 404s", () => {
    const indexFile = resolve(repoRoot, "app/(admin)/dashboard/rentals/page.tsx");
    expect(existsSync(indexFile)).toBe(true);
  });
});

describe("every link site passes a rental_session_id (never an asset/submission id)", () => {
  const callers: { file: string; mustPass: string }[] = [
    {
      // Staff completion page: the submission's bound session (falls back to the asset's latest session).
      file: "app/(staff)/staff/t/[shortCode]/return/complete/page.tsx",
      mustPass: "buildSessionEvidenceHref(evidenceSessionId)",
    },
    {
      // Submission detail: the submission row's own rental_session_id.
      file: "app/(admin)/dashboard/submissions/[submissionId]/page.tsx",
      mustPass: "buildSessionEvidenceHref(submission.rental_session_id)",
    },
    {
      // Asset timeline: the asset's most-recent rental session id.
      file: "app/(admin)/dashboard/assets/[assetId]/timeline/page.tsx",
      mustPass: "buildSessionEvidenceHref(latestSessionId)",
    },
    {
      // Asset detail: the rental session row's id.
      file: "app/(admin)/dashboard/assets/[assetId]/page.tsx",
      mustPass: "buildSessionEvidenceHref(rentalSession.id)",
    },
  ];

  for (const { file, mustPass } of callers) {
    it(`${file} builds the href from a session id`, () => {
      const src = readFileSync(resolve(repoRoot, file), "utf8");
      expect(src).toContain(mustPass);
      // Never build the evidence href straight from an asset or submission id.
      expect(src).not.toContain("buildSessionEvidenceHref(asset.id)");
      expect(src).not.toContain("buildSessionEvidenceHref(submission.id)");
      expect(src).not.toContain("buildSessionEvidenceHref(submission.asset_id)");
    });
  }
});
