import { describe, expect, it } from "vitest";

import { accessoryLabel, accessoryPresence } from "./accessories";

describe("accessoryPresence — vocabulary-agnostic", () => {
  it("returned + issued are present; missing + not_issued are absent; else na", () => {
    expect(accessoryPresence("returned")).toBe("present");
    expect(accessoryPresence("issued")).toBe("present");
    expect(accessoryPresence("missing")).toBe("absent");
    expect(accessoryPresence("not_issued")).toBe("absent");
    expect(accessoryPresence("na")).toBe("na");
    expect(accessoryPresence(undefined)).toBe("na");
  });
});

describe("accessoryLabel — context labels + legacy compatibility", () => {
  it("outbound reads Issued / Not issued (new values)", () => {
    expect(accessoryLabel("issued", "outbound")).toBe("Issued");
    expect(accessoryLabel("not_issued", "outbound")).toBe("Not issued");
  });

  it("legacy outbound values normalize: returned→Issued, missing→Not issued", () => {
    expect(accessoryLabel("returned", "outbound")).toBe("Issued");
    expect(accessoryLabel("missing", "outbound")).toBe("Not issued");
  });

  it("return reads Returned / Missing", () => {
    expect(accessoryLabel("returned", "return")).toBe("Returned");
    expect(accessoryLabel("missing", "return")).toBe("Missing");
  });

  it("na → N/A, unanswered → —", () => {
    expect(accessoryLabel("na", "outbound")).toBe("N/A");
    expect(accessoryLabel("na", "return")).toBe("N/A");
    expect(accessoryLabel(undefined, "outbound")).toBe("—");
    expect(accessoryLabel("", "return")).toBe("—");
  });

  it("equivalent legacy vs current outbound values render identically", () => {
    expect(accessoryLabel("returned", "outbound")).toBe(accessoryLabel("issued", "outbound"));
    expect(accessoryLabel("missing", "outbound")).toBe(accessoryLabel("not_issued", "outbound"));
  });
});
