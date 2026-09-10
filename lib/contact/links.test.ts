import { describe, expect, it } from "vitest";

import { mailtoHref, telHref } from "./links";

describe("telHref", () => {
  it.each([
    ["+1 604 555 0100", "tel:+16045550100"],
    ["(604) 555-0100", "tel:6045550100"],
    ["604.555.0100", "tel:6045550100"],
    ["+1-555-0142", "tel:+15550142"],
    ["604-555-0100 ext 12", "tel:6045550100"],
    ["604-555-0100 x12", "tel:6045550100"],
    ["604 555 0100 #4", "tel:6045550100"],
  ])("normalizes %s", (raw, expected) => {
    expect(telHref(raw)).toBe(expected);
  });

  it.each([
    ["call the office"],
    ["555-01"],
    ["1234567890123456"],
    ["604 555 0100; DROP"],
    ["javascript:alert(1)"],
    ["+1 604 555 0100?body=x"],
    ["1+604 555 0100"],
    [""],
    ["   "],
  ])("refuses %s", (raw) => {
    expect(telHref(raw)).toBeNull();
  });

  it("refuses non-strings", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("links a plain address, trimmed", () => {
    expect(mailtoHref("jamie@site.test")).toBe("mailto:jamie@site.test");
    expect(mailtoHref("  Pat.Morgan+yard@Example.co  ")).toBe("mailto:Pat.Morgan+yard@Example.co");
  });

  it.each([
    ["jamie@site.test?cc=boss@site.test"],
    ["jamie@site.test&bcc=x@y.zz"],
    ["a b@site.test"],
    ["a%20b@site.test"],
    ['"quoted"@site.test'],
    ["<jamie@site.test>"],
    ["jamie@localhost"],
    ["jamie@site.t"],
    ["no-at-sign"],
  ])("refuses %s", (raw) => {
    expect(mailtoHref(raw)).toBeNull();
  });

  it("refuses an over-long address and non-strings", () => {
    expect(mailtoHref(`${"a".repeat(250)}@site.test`)).toBeNull();
    expect(mailtoHref(null)).toBeNull();
  });
});
