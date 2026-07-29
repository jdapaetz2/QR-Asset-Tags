import { describe, expect, it } from "vitest";

import {
  isOrphanCandidate,
  parseSubmissionObjectPath,
  parseSubmissionPrefix,
} from "@/lib/ratelimit/orphan";

const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ASSET = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SUB = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("parseSubmissionObjectPath", () => {
  it("parses a conforming object path", () => {
    const ref = parseSubmissionObjectPath(`org/${ORG}/asset/${ASSET}/submission/${SUB}/photo.jpg`);
    expect(ref).toEqual({ organizationId: ORG, assetId: ASSET, submissionId: SUB });
  });

  it("rejects non-conforming / traversal paths", () => {
    expect(parseSubmissionObjectPath(`org/${ORG}/cover.png`)).toBeNull();
    expect(parseSubmissionObjectPath(`documents/${ORG}/x.pdf`)).toBeNull();
    expect(parseSubmissionObjectPath(`org/${ORG}/asset/${ASSET}/submission/not-a-uuid/x.jpg`)).toBeNull();
    expect(parseSubmissionObjectPath(`org/${ORG}/asset/${ASSET}/submission/${SUB}/sub/x.jpg`)).toBeNull();
  });
});

describe("parseSubmissionPrefix", () => {
  it("parses a prefix without a filename", () => {
    expect(parseSubmissionPrefix(`org/${ORG}/asset/${ASSET}/submission/${SUB}`)).toEqual({
      organizationId: ORG,
      assetId: ASSET,
      submissionId: SUB,
    });
  });

  it("rejects a full object path (has a trailing file)", () => {
    expect(parseSubmissionPrefix(`org/${ORG}/asset/${ASSET}/submission/${SUB}/x.jpg`)).toBeNull();
  });
});

describe("isOrphanCandidate", () => {
  const thresholdMs = 48 * 3600 * 1000;

  it("is FALSE when a submission row exists (never delete recorded evidence)", () => {
    expect(
      isOrphanCandidate({ hasSubmissionRow: true, newestObjectAgeMs: thresholdMs * 10, thresholdMs })
    ).toBe(false);
  });

  it("is FALSE when the age is unknown (avoid racing an in-flight upload)", () => {
    expect(isOrphanCandidate({ hasSubmissionRow: false, newestObjectAgeMs: null, thresholdMs })).toBe(false);
  });

  it("is FALSE when the newest object is younger than the threshold", () => {
    expect(
      isOrphanCandidate({ hasSubmissionRow: false, newestObjectAgeMs: thresholdMs - 1, thresholdMs })
    ).toBe(false);
  });

  it("is TRUE only when there is no row AND the objects are old enough", () => {
    expect(
      isOrphanCandidate({ hasSubmissionRow: false, newestObjectAgeMs: thresholdMs, thresholdMs })
    ).toBe(true);
  });
});
