import { describe, expect, it } from "vitest";

import { formatCentsAsCadInput, parseCadInputToCents } from "./money";

describe("parseCadInputToCents", () => {
  it("parses whole and comma/dollar-formatted amounts", () => {
    expect(parseCadInputToCents("4500")).toBe(450000);
    expect(parseCadInputToCents("4,500")).toBe(450000);
    expect(parseCadInputToCents("$4,500")).toBe(450000);
    expect(parseCadInputToCents(" 4500 ")).toBe(450000);
    expect(parseCadInputToCents("750")).toBe(75000);
    expect(parseCadInputToCents("0")).toBe(0);
  });

  it("parses decimal cents without float drift", () => {
    expect(parseCadInputToCents("4500.00")).toBe(450000);
    expect(parseCadInputToCents("750.50")).toBe(75050);
    expect(parseCadInputToCents("0.05")).toBe(5);
    expect(parseCadInputToCents("12.5")).toBe(1250);
  });

  it("blank (incl. bare symbols) / undefined → null", () => {
    expect(parseCadInputToCents("")).toBeNull();
    expect(parseCadInputToCents("   ")).toBeNull();
    expect(parseCadInputToCents(undefined)).toBeNull();
    // A stray currency symbol / comma with no digits collapses to empty → cleared.
    expect(parseCadInputToCents("$")).toBeNull();
  });

  it("invalid input → undefined", () => {
    expect(parseCadInputToCents("abc")).toBeUndefined();
    expect(parseCadInputToCents("-5")).toBeUndefined();
    expect(parseCadInputToCents("4.999")).toBeUndefined();
    expect(parseCadInputToCents("1.2.3")).toBeUndefined();
    expect(parseCadInputToCents("12abc")).toBeUndefined();
  });
});

describe("formatCentsAsCadInput", () => {
  it("formats cents as a plain dollar input string", () => {
    expect(formatCentsAsCadInput(450000)).toBe("4500");
    expect(formatCentsAsCadInput(75000)).toBe("750");
    expect(formatCentsAsCadInput(0)).toBe("0");
    expect(formatCentsAsCadInput(75050)).toBe("750.50");
    expect(formatCentsAsCadInput(null)).toBe("");
    expect(formatCentsAsCadInput(undefined)).toBe("");
  });

  it("round-trips with the parser", () => {
    expect(parseCadInputToCents(formatCentsAsCadInput(650000))).toBe(650000);
    expect(parseCadInputToCents(formatCentsAsCadInput(75050))).toBe(75050);
  });
});
