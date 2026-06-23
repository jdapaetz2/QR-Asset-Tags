import { describe, expect, it } from "vitest";

import { parseCsv } from "./parse";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const csv = 'name,note\n"Loader, big","line1\nline2"\n"He said ""hi""",x';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Loader, big", "line1\nline2"],
      ['He said "hi"', "x"],
    ]);
  });

  it("preserves empty trailing cells and empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
    expect(parseCsv("a,b,")).toEqual([["a", "b", ""]]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
