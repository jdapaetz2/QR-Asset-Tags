import { describe, expect, it } from "vitest";

import { groupDigestItems, projectDigestItem } from "./digest";
import {
  assetIdentity,
  contactBlock,
  counterBlock,
  descriptionBlock,
  digestAssetCard,
  evidenceStrip,
  factGrid,
  footerBlock,
  headerBlock,
  listBlock,
  previewLineBlock,
  primaryButton,
  priorityBanner,
  sectionHeading,
} from "./email-components";
import { LOGO_ATTACHMENT, buttonHtml, columns, escapeHtml, renderDocument } from "./email-html";
import { EMAIL_LOGO } from "./email-logo";

const HOSTILE = `<script>alert("x")</script> & 'q'`;

function expectEscaped(block: { html: string; text: string }) {
  expect(block.html).not.toMatch(/<script/i);
  expect(block.html).toContain("&lt;script&gt;");
  expect(block.text).toContain(HOSTILE);
}

describe("escaping", () => {
  it("escapes every free-text input in HTML and keeps it verbatim in text", () => {
    expectEscaped(priorityBanner({ tone: "immediate", label: "IMMEDIATE ATTENTION", event: HOSTILE, reason: HOSTILE }));
    expectEscaped(assetIdentity({ code: HOSTILE, name: HOSTILE, category: HOSTILE }));
    expectEscaped(factGrid([{ label: "Reported", value: HOSTILE }], [HOSTILE]));
    expectEscaped(descriptionBlock({ text: HOSTILE, truncated: false }));
    expectEscaped(listBlock({ heading: "Exceptions", items: [HOSTILE], tone: "follow_up", note: HOSTILE }));
    expectEscaped(contactBlock({ name: HOSTILE, preferredMethod: null, phone: null, phoneHref: null, email: null, emailHref: null })!);
    expectEscaped(footerBlock({ reference: { label: "Reference", value: HOSTILE }, reason: HOSTILE }));
    expectEscaped(sectionHeading("Damage", HOSTILE));
    expectEscaped(previewLineBlock(HOSTILE));
  });

  it("escapes attribute values", () => {
    expect(buttonHtml({ label: "Open", href: `https://x.test/"onmouseover="a` })).toContain("&quot;onmouseover=&quot;");
    const strip = evidenceStrip({
      countLine: "Photo previews included: 1 of 1 photo, reduced in size.",
      pointer: null,
      figures: [{ contentId: `x"><img src=y>`, label: HOSTILE, width: 640, height: 480 }],
    });
    expect(strip.html.match(/<img /g)).toHaveLength(1);
    expect(strip.html).toContain(`alt="${escapeHtml(`${HOSTILE} — preview 1 of 1`)}"`);
  });
});

describe("brand logo (D5.1)", () => {
  it("is a generated PNG of the recorded size, three times its display size and above the lockup minimum", () => {
    const png = Buffer.from(EMAIL_LOGO.base64, "base64");
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(EMAIL_LOGO.pixelWidth);
    expect(png.readUInt32BE(20)).toBe(EMAIL_LOGO.pixelHeight);
    expect(EMAIL_LOGO.pixelWidth).toBe(EMAIL_LOGO.width * 3);
    expect(EMAIL_LOGO.height).toBe(Math.round(EMAIL_LOGO.pixelHeight / 3));
    expect(EMAIL_LOGO.height).toBeGreaterThanOrEqual(16);
    expect(png.byteLength).toBeLessThan(10_000);
  });

  it("the header shows the lockup by cid with the product name as alt text, and adds nothing to the text part", () => {
    const header = headerBlock();
    expect(header.text).toBe("");
    expect(header.html).toContain(
      `<img src="cid:mm-logo@mulemark" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="Mulemark"`
    );
    expect(header.html).not.toMatch(/<svg|https?:/i);
  });

  it("every document carries the logo as its first attachment, before any previews", () => {
    expect(renderDocument({ subject: "s", blocks: [headerBlock()] }).attachments).toEqual([LOGO_ATTACHMENT]);
    const preview = { filename: "incident-photo-1.jpg", contentType: "image/jpeg" as const, contentId: "mm-preview-1@mulemark", content: Buffer.alloc(4) };
    expect(renderDocument({ subject: "s", blocks: [], attachments: [preview] }).attachments).toEqual([LOGO_ATTACHMENT, preview]);
    expect(LOGO_ATTACHMENT).toMatchObject({ filename: "mulemark-logo.png", contentType: "image/png", contentId: "mm-logo@mulemark" });
  });
});

describe("components", () => {
  it("the first line is visible, never a hidden preheader", () => {
    const line = previewLineBlock("Reported: Unsafe to operate · 2 photos");
    expect(line.html).not.toMatch(/display:\s*none|font-size:0|max-height:0|opacity:0/);
    expect(line.text).toBe("Reported: Unsafe to operate · 2 photos");
  });

  it("the banner states a reason only when given one", () => {
    expect(priorityBanner({ tone: "follow_up", label: "FOLLOW UP", event: "Damage report" }).text).toBe("FOLLOW UP — Damage report");
    expect(
      priorityBanner({ tone: "immediate", label: "IMMEDIATE ATTENTION", event: "Damage report", reason: "Reported unable to move" }).text
    ).toBe("IMMEDIATE ATTENTION — Damage report\nPriority reason: Reported unable to move");
  });

  it("the fact grid writes Label: value lines and notes", () => {
    expect(factGrid([{ label: "Photos", value: "none" }, { label: "Status", value: "New" }], ["Note."]).text).toBe(
      "Photos: none\nStatus: New\nNote."
    );
  });

  it("list items keep their own continuation lines", () => {
    expect(listBlock({ heading: "Exceptions", items: ["Damage reported\n“Dented.”", "Failed check: Oil"], tone: "follow_up" }).text).toBe(
      "Exceptions\n- Damage reported\n  “Dented.”\n- Failed check: Oil"
    );
  });

  it("the evidence strip sizes previews for one, two and three, and needs no image to be understood", () => {
    const figure = (i: number) => ({ contentId: `mm-preview-${i}@mulemark`, label: "Damage photos", width: 640, height: 480 });
    const countLine = "Photo previews included: 1 of 2 photos, reduced in size.";
    expect(evidenceStrip({ countLine, pointer: "Pointer.", figures: [figure(1)] }).html).toContain('width="300" height="225"');
    expect(evidenceStrip({ countLine, pointer: "Pointer.", figures: [figure(1), figure(2)] }).html).toContain('width="263"');
    expect(evidenceStrip({ countLine, pointer: "Pointer.", figures: [figure(1), figure(2), figure(3)] }).html).toContain('width="171"');
    const none = evidenceStrip({ countLine: "Photo previews: none included.", pointer: null, figures: [] });
    expect(none.html).not.toContain("<img");
    expect(none.text).toBe("Photo previews: none included.");
  });

  it("the primary button is a real link with the URL spelled out in text", () => {
    const button = primaryButton({ label: "Open damage report", href: "https://mulemark.io/dashboard/submissions/1" });
    expect(button.text).toBe("Open damage report: https://mulemark.io/dashboard/submissions/1");
    expect(button.html).toContain('<a href="https://mulemark.io/dashboard/submissions/1"');
    expect(button.html).toContain("mso-padding-alt");
  });

  it("contact actions appear only for normalized links", () => {
    expect(contactBlock({ name: null, preferredMethod: null, phone: null, phoneHref: null, email: null, emailHref: null })).toBeNull();
    const text = contactBlock({ name: "Sam", preferredMethod: "text", phone: "call the office", phoneHref: null, email: "sam@x.test", emailHref: "mailto:sam@x.test" })!;
    expect(text.html).not.toContain("Call reporter");
    expect(text.html).toContain('href="mailto:sam@x.test"');
    expect(text.text).toBe("Contact\nSam — prefers text\nPhone: call the office\nEmail: sam@x.test");
  });

  it("the footer can omit the reference", () => {
    expect(footerBlock({ reason: "Why." }).text).toBe("Why.");
    expect(footerBlock({ reference: { label: "Support ID", value: "abc" }, reason: "Why." }).text).toBe("Support ID: abc\n\nWhy.");
  });

  it("an empty counter row renders nothing", () => {
    expect(counterBlock([])).toBeNull();
    expect(counterBlock([{ label: "Still open", value: 3, detail: "(2 new, 1 reviewed)" }])?.text).toBe("Still open: 3 (2 new, 1 reviewed)");
  });

  it("columns carry an Outlook ghost table", () => {
    const html = columns(["<p>a</p>", "<p>b</p>"], 275);
    expect(html.match(/<!--\[if mso\]>/g)).toHaveLength(3);
    expect(html).toContain('width="550"');
  });
});

describe("digest asset card", () => {
  const asset = { id: "a0000000-0000-4000-8000-000000000001", asset_code: "GEN-003", asset_name: "Portable Generator" };
  const item = (n: number, session: string | null) =>
    projectDigestItem(
      {
        id: `00000${n}00-0000-4000-8000-000000000000`,
        organization_id: "c0000000-0000-4000-8000-0000000000a1",
        created_at: `2026-07-14T0${n}:00:00.000Z`,
        status: "new",
        submission_origin: "public",
        asset_id: asset.id,
        rental_session_id: session,
        submission_data_json: { damage_observed: "yes", accessories_returned: "yes" },
        media_urls: [],
      },
      asset,
      "https://mulemark.io"
    )!;
  const group = () => groupDigestItems([item(1, "s"), item(2, "s")])[0].groups[0];

  it("lists every return with its own link and notes returns left out", () => {
    const full = group();
    const card = digestAssetCard({ ...full, hiddenItems: 3 });
    expect(card.text).toContain("GEN-003 — Portable Generator · 5 returns · 2 open · 2 exceptions");
    expect(card.text).toContain(`Same rental session as ${full.items[0].reference}`);
    expect(card.text).toContain("3 more returns for this asset are in Submissions.");
    expect(card.html.match(/>Open return checklist</g)).toHaveLength(2);
    expect(card.html).not.toMatch(/<img/);
  });

  it("renders returns after `fullCount` on one line, still linked and still labelled", () => {
    const full = group();
    const card = digestAssetCard({ ...full, fullCount: 1 });
    const second = full.items[1];
    expect(card.html.match(/>Open return checklist</g)).toHaveLength(1);
    expect(card.html).toContain(`href="${second.recordUrl}"`);
    expect(card.text).toMatch(
      new RegExp(`^${second.reference} · New · Renter return · Damage · .+ · ${second.recordUrl.replace(/[.?]/g, "\\$&")}$`, "m")
    );
    expect(card.text).not.toContain(`Same rental session as ${full.items[0].reference}`);
  });
});
