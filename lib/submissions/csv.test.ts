import { describe, expect, it } from "vitest";

import {
  buildSubmissionsCsv,
  csvField,
  SUBMISSION_CSV_HEADERS,
  type SubmissionExportRow,
} from "./csv";

describe("csvField", () => {
  it("quotes commas, quotes, and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField("plain")).toBe("plain");
  });

  it("guards against formula injection", () => {
    expect(csvField("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@cmd")).toBe("'@cmd");
    // A formula value that also needs quoting (contains a comma).
    expect(csvField("=1,2")).toBe('"\'=1,2"');
  });

  it("renders null/undefined as empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(0)).toBe("0");
  });
});

describe("buildSubmissionsCsv", () => {
  const rows: SubmissionExportRow[] = [
    {
      id: "s1",
      created_at: "2026-01-01T10:00:00Z",
      form_type: "damage_report",
      status: "new",
      submitted_by_name: "Sam",
      submitted_by_email: "sam@example.com",
      submitted_by_phone: null,
      submission_data_json: { urgency: "high", description: "Cracked, leaking" },
      media_urls: ["a.jpg", "b.jpg"],
      asset: { asset_code: "EXCAVATOR-017", asset_name: "Excavator 017" },
    },
    {
      id: "s2",
      created_at: "2026-01-02T10:00:00Z",
      form_type: "return_checklist",
      status: "reviewed",
      submitted_by_name: null,
      submitted_by_email: null,
      submitted_by_phone: null,
      submission_data_json: {
        condition_notes: "Fine",
        cleaned: "yes",
        accessories_returned: "no",
        damage_observed: "no",
        fuel_or_charge_level: "Full",
      },
      media_urls: [],
      asset: { asset_code: "TRAILER-014", asset_name: "Trailer 014" },
    },
  ];

  it("starts with the header row", () => {
    const csv = buildSubmissionsCsv(rows);
    expect(csv.split("\r\n")[0]).toBe(SUBMISSION_CSV_HEADERS.join(","));
  });

  it("includes media_count and quotes a comma value", () => {
    const csv = buildSubmissionsCsv(rows);
    const line1 = csv.split("\r\n")[1];
    expect(line1).toContain('"Cracked, leaking"');
    expect(line1.endsWith(",2,s1")).toBe(true);
  });

  it("falls back to condition_notes for description", () => {
    const csv = buildSubmissionsCsv(rows);
    const line2 = csv.split("\r\n")[2];
    expect(line2).toContain("Fine");
    expect(line2.endsWith(",0,s2")).toBe(true);
  });
});
