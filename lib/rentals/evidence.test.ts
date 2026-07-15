import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSessionEvidenceHref, isLikelyUuid, rentalEvidenceHref } from "./evidence";

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

describe("isLikelyUuid (Phase 3C.4 — reject malformed session ids before the DB)", () => {
  it("accepts a canonical UUID (any case)", () => {
    expect(isLikelyUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isLikelyUuid("A1B2C3D4-e5f6-7890-ABCD-ef1234567890")).toBe(true);
  });

  it("rejects non-UUID input", () => {
    expect(isLikelyUuid("not-a-uuid")).toBe(false);
    expect(isLikelyUuid("11111111-1111-1111-1111")).toBe(false);
    expect(isLikelyUuid("")).toBe(false);
    expect(isLikelyUuid(null)).toBe(false);
    expect(isLikelyUuid(undefined)).toBe(false);
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
      // Staff completion page (Wave 3N.3): routes to the mobile staff evidence wrapper, still keyed by the
      // submission's bound session id (falls back to the asset's latest session).
      file: "app/(staff)/staff/t/[shortCode]/return/complete/page.tsx",
      mustPass: "/evidence/${evidenceSessionId}",
    },
    {
      // Submission detail: the submission row's own rental_session_id.
      file: "app/(admin)/dashboard/submissions/[submissionId]/page.tsx",
      mustPass: "buildSessionEvidenceHref(submission.rental_session_id)",
    },
    {
      // Asset timeline (Phase 3C.8): the pure rental-session mapper builds the href from the session row id;
      // the timeline list renders it per rental event.
      file: "lib/timeline/timeline.ts",
      mustPass: "buildSessionEvidenceHref(r.id)",
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
