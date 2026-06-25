import { describe, expect, it } from "vitest";

import { csvField, toCsv } from "./csv";

describe("csvField", () => {
  it("quotes values containing commas, quotes, and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-1")).toBe("'-1");
    expect(csvField("@cmd")).toBe("'@cmd");
  });

  it("renders null/undefined as empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins headers + rows with CRLF and a trailing newline", () => {
    const out = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(out).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });
});
