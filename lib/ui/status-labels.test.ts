import { describe, expect, it } from "vitest";

import {
  assetVisibilityLabel,
  exportStateLabel,
  orgStatusLabel,
  pageStateLabel,
  qrStateLabel,
  rentalStateLabel,
  submissionStatusLabel,
  tagRequestStatusLabel,
} from "./status-labels";

describe("submissionStatusLabel", () => {
  it("maps the canonical statuses and capitalizes unknowns", () => {
    expect(submissionStatusLabel("new")).toBe("New");
    expect(submissionStatusLabel("reviewed")).toBe("Reviewed");
    expect(submissionStatusLabel("resolved")).toBe("Resolved");
    expect(submissionStatusLabel("archived")).toBe("Archived");
    expect(submissionStatusLabel("mystery")).toBe("Mystery");
  });
});

describe("orgStatusLabel", () => {
  it("maps org states and handles null/unknown safely", () => {
    expect(orgStatusLabel("active")).toBe("Active");
    expect(orgStatusLabel("suspended")).toBe("Suspended");
    expect(orgStatusLabel(null)).toBe("—");
    expect(orgStatusLabel(undefined)).toBe("—");
    expect(orgStatusLabel("pending")).toBe("Pending");
  });
});

describe("boolean-derived state labels", () => {
  it("exports / visibility / rental", () => {
    expect(exportStateLabel(true)).toBe("Enabled");
    expect(exportStateLabel(false)).toBe("Disabled");
    expect(assetVisibilityLabel("public")).toBe("Public");
    expect(assetVisibilityLabel("private")).toBe("Private");
    expect(rentalStateLabel(true)).toBe("Rented");
    expect(rentalStateLabel(false)).toBe("Available");
  });

  it("page state", () => {
    expect(pageStateLabel("published")).toBe("Page live");
    expect(pageStateLabel("draft")).toBe("Page draft");
    expect(pageStateLabel("missing")).toBe("No page");
  });

  it("qr state", () => {
    expect(qrStateLabel(true, true)).toBe("QR ready");
    expect(qrStateLabel(true, false)).toBe("QR inactive");
    expect(qrStateLabel(false, false)).toBe("No QR");
  });
});

describe("tagRequestStatusLabel re-export", () => {
  it("still labels tag-request statuses", () => {
    expect(tagRequestStatusLabel("in_review")).toBe("In review");
    expect(tagRequestStatusLabel("in_production")).toBe("In production");
  });
});
