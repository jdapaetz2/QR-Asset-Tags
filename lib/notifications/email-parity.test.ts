import { describe, expect, it } from "vitest";

import { EMAIL_BUDGETS, EMAIL_FIXTURES, placeholderPreviews } from "@/tests/email/fixtures";
import { SITE_URL } from "./__fixtures__/rows";
import { normalizeFact, visibleHtmlLines } from "./__fixtures__/visible-html";
import { HTML_ONLY_LABELS } from "./email-components";

/**
 * Engineering Phase D5.1 — the plain-text part and the HTML part carry the same facts, for every fixture layout. Also
 * the email-safe structure rules and the size budgets. The fixture gallery (`npm run email:gallery`) renders the same
 * set for visual review.
 */

const LINK_LINE = /^(.*?): ((?:https?:\/\/|tel:|mailto:)\S+)$/;
const CAPTION = /^.+ \(\d+ of \d+\)$/;
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;");

describe.each(EMAIL_FIXTURES.map((fixture) => [fixture.id, fixture] as const))("%s", (_id, fixture) => {
  const email = fixture.build(placeholderPreviews);
  const lines = visibleHtmlLines(email.html);
  const visible = lines.join(" ");
  const text = normalizeFact(email.text);

  it("every plain-text line is visible in the HTML part", () => {
    for (const raw of email.text.split("\n").map((line) => line.trim())) {
      if (!raw) continue;
      const link = LINK_LINE.exec(raw);
      if (link) {
        expect(visible, raw).toContain(normalizeFact(link[1]));
        expect(email.html.includes(`href="${escapeAttr(link[2])}"`) || visible.includes(link[2]), raw).toBe(true);
        continue;
      }
      expect(visible, raw).toContain(normalizeFact(raw));
    }
  });

  it("the HTML part shows nothing the text part lacks, apart from labelled decoration", () => {
    for (const line of lines) {
      if (CAPTION.test(line)) continue;
      let rest = line;
      for (const label of HTML_ONLY_LABELS) rest = rest.split(normalizeFact(label)).join(" ");
      if (rest.replace(/[\s·—-]+/g, "") === "") continue;
      expect(text, line).toContain(line);
    }
  });

  it("uses email-safe structure", () => {
    const html = email.html;
    const tables = html.match(/<table\b[^>]*>/g) ?? [];
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(table).toContain('role="presentation"');
    expect(tables.length).toBe((html.match(/<\/table>/g) ?? []).length);
    expect((html.match(/<!--\[if mso\]>/g) ?? []).length).toBe((html.match(/<!\[endif\]-->/g) ?? []).length);
    expect(html).not.toMatch(/<style|<script|<iframe|<form|<link|\bclass=|display:\s*(?:flex|grid|none)|position:|@import|url\(/i);
    expect(html).not.toMatch(/<svg|javascript:/i);

    const images = html.match(/<img\b[^>]*>/g) ?? [];
    const cids = images.map((img) => /src="cid:([^"]+)"/.exec(img)?.[1]);
    for (const img of images) expect(img).toMatch(/ width="\d+" height="\d+" alt="[^"]+"/);
    expect(cids).toEqual((email.attachments ?? []).map((attachment) => attachment.contentId));
    if (fixture.kind !== "incident") expect(email.attachments).toBeUndefined();

    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      expect(href.startsWith(`${SITE_URL}/`) || href.startsWith("tel:") || href.startsWith("mailto:"), href).toBe(true);
    }
  });

  it("stays within its size budget", () => {
    expect(Buffer.byteLength(email.html, "utf8")).toBeLessThanOrEqual(EMAIL_BUDGETS[fixture.kind].html);
    expect(Buffer.byteLength(email.text, "utf8")).toBeLessThanOrEqual(EMAIL_BUDGETS[fixture.kind].text);
  });
});

describe("canonical plain-text parts", () => {
  it.each(["02-immediate-escalated-by-state", "05-return-exceptions", "08-digest-mixed", "12-tag-in-review"])(
    "%s",
    (id) => {
      const fixture = EMAIL_FIXTURES.find((candidate) => candidate.id === id)!;
      expect(fixture.build(placeholderPreviews).text).toMatchSnapshot();
    }
  );
});
