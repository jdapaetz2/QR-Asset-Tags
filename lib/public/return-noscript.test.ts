import { describe, expect, it } from "vitest";

import {
  RETURN_NOSCRIPT_HEADLINE,
  RETURN_NOSCRIPT_INSTRUCTION,
  escapeHtml,
  returnChecklistNoScriptHtml,
} from "./return-noscript";

// The no-JavaScript return notice (lib/public/return-noscript.ts, D4.1 Part H).

const base = {
  shortCode: "demo-tr014",
  orgName: "Northridge Rentals",
  brandColor: "#1d4ed8",
  contact: { phone: "(604) 555-0100", email: "support@northridge.example" },
};

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("returnChecklistNoScriptHtml", () => {
  it("states the requirement and how to fix it", () => {
    const html = returnChecklistNoScriptHtml(base);
    expect(html).toContain(RETURN_NOSCRIPT_HEADLINE);
    expect(html).toContain(RETURN_NOSCRIPT_INSTRUCTION);
    expect(RETURN_NOSCRIPT_HEADLINE).toBe("The return checklist needs JavaScript.");
    expect(RETURN_NOSCRIPT_INSTRUCTION).toBe("Turn on JavaScript and reload this page to complete it.");
  });

  it("offers the equipment page, a call and an email — and never another form", () => {
    const html = returnChecklistNoScriptHtml(base);
    expect(hrefs(html)).toEqual(["/t/demo-tr014", "tel:6045550100", "mailto:support@northridge.example"]);
    expect(html).not.toMatch(/\/forms\//);
    expect(html).not.toMatch(/damage/i);
    expect(html).toContain("Call Northridge Rentals");
    expect(html).not.toMatch(/http-equiv|<script/i);
  });

  it("omits a call or email action when the stored value would make a broken or smuggled link", () => {
    const html = returnChecklistNoScriptHtml({
      ...base,
      contact: { phone: "call us anytime", email: "help@example.com?cc=attacker@example.com" },
    });
    expect(hrefs(html)).toEqual(["/t/demo-tr014"]);
    expect(html).not.toContain('data-noscript-action="call"');
    expect(html).not.toContain('data-noscript-action="email"');
  });

  it("escapes the organization name and encodes the short code", () => {
    const html = returnChecklistNoScriptHtml({ ...base, orgName: `<img src=x onerror="alert(1)">&Co`, shortCode: "a b" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Call &lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;Co");
    expect(hrefs(html)[0]).toBe("/t/a%20b");
  });

  it("uses a safe tenant color, falling back when the stored color is not strict hex", () => {
    expect(returnChecklistNoScriptHtml(base)).toContain("background-color:#1d4ed8");
    const junk = returnChecklistNoScriptHtml({ ...base, brandColor: "red;background:url(x)" });
    expect(junk).not.toContain("url(");
    expect(junk).toContain("background-color:#0f172a");
  });

  it("names the rental company generically when the organization has no name", () => {
    expect(returnChecklistNoScriptHtml({ ...base, orgName: "  " })).toContain("Call the rental company");
  });
});

describe("escapeHtml", () => {
  it("escapes every markup-significant character", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});
