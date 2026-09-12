import { describe, expect, it } from "vitest";

import { parseDocumentClaim } from "./upload";
import { isCoverClaim } from "@/lib/assets/cover";

// Claimed paths for admin direct uploads: exactly this organization and asset, server-shaped names only.

const ORG = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const HEX = "abcdef12-3456-4789-8abc-def012345678";

describe("parseDocumentClaim", () => {
  it("returns the document id of a hosted-file path for this organization and asset", () => {
    const path = `org/${ORG}/asset/${ASSET}/documents/${DOC}/${DOC}.pdf`;
    expect(parseDocumentClaim(path, ORG, ASSET)).toEqual({ documentId: DOC, path });
    expect(parseDocumentClaim(`org/${ORG}/asset/${ASSET}/documents/${DOC}/${DOC}.mov`, ORG, ASSET)).not.toBeNull();
    // Phone and camera image originals (D4.1, migration 0039).
    for (const ext of ["heic", "heif", "avif"]) {
      expect(parseDocumentClaim(`org/${ORG}/asset/${ASSET}/documents/${DOC}/${DOC}.${ext}`, ORG, ASSET)).not.toBeNull();
    }
  });

  it.each([
    ["another organization", `org/${OTHER}/asset/${ASSET}/documents/${DOC}/${DOC}.pdf`],
    ["another asset", `org/${ORG}/asset/${OTHER}/documents/${DOC}/${DOC}.pdf`],
    ["a name that is not its document id", `org/${ORG}/asset/${ASSET}/documents/${DOC}/${OTHER}.pdf`],
    ["an unsupported extension", `org/${ORG}/asset/${ASSET}/documents/${DOC}/${DOC}.html`],
    ["a nested path", `org/${ORG}/asset/${ASSET}/documents/${DOC}/x/${DOC}.pdf`],
    ["upper-case ids", `org/${ORG}/asset/${ASSET}/documents/${HEX.toUpperCase()}/${HEX.toUpperCase()}.pdf`],
    ["a cover path", `org/${ORG}/asset/${ASSET}/cover/${DOC}.jpg`],
  ])("refuses %s", (_name, path) => {
    expect(parseDocumentClaim(path, ORG, ASSET)).toBeNull();
  });

  it("refuses a non-string claim", () => {
    expect(parseDocumentClaim(null, ORG, ASSET)).toBeNull();
  });
});

describe("isCoverClaim", () => {
  it("accepts one image under this asset's cover folder", () => {
    expect(isCoverClaim(`org/${ORG}/asset/${ASSET}/cover/${DOC}.jpg`, ORG, ASSET)).toBe(true);
    expect(isCoverClaim(`org/${ORG}/asset/${ASSET}/cover/${DOC}.webp`, ORG, ASSET)).toBe(true);
  });

  it.each([
    ["another organization", `org/${OTHER}/asset/${ASSET}/cover/${DOC}.jpg`],
    ["another asset", `org/${ORG}/asset/${OTHER}/cover/${DOC}.jpg`],
    ["a logo path", `org/${ORG}/logo/${DOC}.png`],
    ["a non-image", `org/${ORG}/asset/${ASSET}/cover/${DOC}.pdf`],
    ["a non-uuid name", `org/${ORG}/asset/${ASSET}/cover/cover.jpg`],
  ])("refuses %s", (_name, path) => {
    expect(isCoverClaim(path, ORG, ASSET)).toBe(false);
  });
});
