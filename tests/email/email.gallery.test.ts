import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "@playwright/test";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SITE_URL } from "@/lib/notifications/__fixtures__/rows";
import type { EmailContent } from "@/lib/notifications/email";
import { transformPreview } from "@/lib/notifications/preview-image";
import { EMAIL_BUDGETS, EMAIL_FIXTURES, type EmailFixture, type PreviewFactory } from "./fixtures";

/**
 * Engineering Phase D5.1 — the local fixture gallery (`npm run email:gallery`). For each fixture it writes, under the
 * gitignored qa-artifacts/email-gallery/<id>/:
 *
 *   email.html        the HTML part exactly as sent (images by `cid:`)
 *   view.html         gallery-only copy with each `cid:` swapped for its attachment as a data: URI
 *   blocked.html      images blocked (the alt text shows instead)
 *   text.txt          the plain-text part
 *   meta.json         subject, first line, sizes (UTF-8 and an estimated quoted-printable size), attachments, links
 *   desktop.png       640 px wide; mobile.png 375 px at 2× (and blocked-mobile.png when there are previews)
 *
 * plus qa-artifacts/email-gallery/index.html. Previews are text-free generated images run through the real preview
 * transform, so sizes match production. Nothing is sent and no environment file is read.
 */

const OUT = join("qa-artifacts", "email-gallery");
/** Gmail clips a message body larger than about 102 KB. */
const GMAIL_CLIP_BYTES = 102_000;

type Rendered = { fixture: EmailFixture; email: EmailContent; hasPreviews: boolean; htmlBytes: number; qpBytes: number };

const rendered: Rendered[] = [];
const previewImages: { jpeg: Buffer; width: number; height: number }[] = [];
let browser: Browser;

/** Estimated quoted-printable size: non-printable bytes and "=" take three bytes, plus a soft break every 76. */
function quotedPrintableBytes(value: string): number {
  let size = 0;
  for (const byte of Buffer.from(value, "utf8")) size += byte >= 32 && byte <= 126 && byte !== 61 ? 1 : 3;
  return size + Math.ceil(size / 73) * 3;
}

const realPreviews: PreviewFactory = (labels) => {
  const figures = labels.map((label, index) => ({
    contentId: `mm-preview-${index + 1}@mulemark`,
    label,
    width: previewImages[index].width,
    height: previewImages[index].height,
  }));
  return {
    requested: labels.length,
    figures,
    attachments: figures.map((figure, index) => ({
      filename: `incident-photo-${index + 1}.jpg`,
      contentType: "image/jpeg" as const,
      contentId: figure.contentId,
      content: previewImages[index].jpeg,
    })),
  };
};

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const sources: [string, number, number][] = [
    ["#8A6D3B", 1600, 1200],
    ["#4F6D7A", 1600, 1066],
    ["#6E5A7E", 1200, 1600],
  ];
  for (const [background, width, height] of sources) {
    const source = await sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 90 }).toBuffer();
    const result = await transformPreview(source);
    if (!result.ok) throw new Error(`preview transform failed: ${result.failureClass}`);
    previewImages.push({ jpeg: result.jpeg, width: result.width, height: result.height });
  }
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  const cards = rendered
    .map(
      ({ fixture, email, hasPreviews, htmlBytes, qpBytes }) => `
<section>
  <h2>${fixture.id} — ${escape(fixture.title)}</h2>
  <p><strong>Subject:</strong> ${escape(email.subject)}<br><strong>First line:</strong> ${escape(email.text.split("\n")[0])}<br>
  HTML ${(htmlBytes / 1024).toFixed(1)} KB (≈${(qpBytes / 1024).toFixed(1)} KB encoded) · text ${(Buffer.byteLength(email.text) / 1024).toFixed(1)} KB ·
  attachments ${email.attachments?.length ?? 0} ·
  <a href="${fixture.id}/view.html">view</a> · <a href="${fixture.id}/blocked.html">images blocked</a> · <a href="${fixture.id}/text.txt">text</a> · <a href="${fixture.id}/meta.json">meta</a></p>
  <div class="shots"><img src="${fixture.id}/desktop.png" alt="desktop"><img src="${fixture.id}/mobile.png" alt="mobile">${
    hasPreviews ? `<img src="${fixture.id}/blocked-mobile.png" alt="mobile, images blocked">` : ""
  }</div>
  <pre>${escape(email.text)}</pre>
</section>`
    )
    .join("\n");
  writeFileSync(
    join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Mulemark email gallery</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#f3f1ec;color:#1a1917}section{background:#fff;border:1px solid #e4e1db;border-radius:8px;padding:16px;margin:0 0 24px}
.shots{display:flex;gap:16px;align-items:flex-start;overflow-x:auto}.shots img{border:1px solid #e4e1db;max-width:none}.shots img[alt^=mobile]{width:375px}pre{white-space:pre-wrap;background:#faf9f6;padding:12px;border:1px solid #e4e1db}</style>
<h1>Mulemark operational email gallery (D5.1)</h1><p>Generated locally from tests/email/fixtures.ts. Never sent.</p>${cards}`
  );
});

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function screenshot(html: string, path: string, width: number, scale: number): Promise<number> {
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: scale });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path, fullPage: true });
    return await page.evaluate(() => document.documentElement.scrollWidth);
  } finally {
    await page.close();
  }
}

describe("operational email fixture gallery", () => {
  it.each(EMAIL_FIXTURES.map((fixture) => [fixture.id, fixture] as const))("%s", async (_id, fixture) => {
    const email = fixture.build(realPreviews);
    const dir = join(OUT, fixture.id);
    mkdirSync(dir, { recursive: true });

    const dataUris = new Map(
      (email.attachments ?? []).map((attachment) => [
        attachment.contentId,
        `data:image/jpeg;base64,${attachment.content.toString("base64")}`,
      ])
    );
    const cids = [...email.html.matchAll(/src="cid:([^"]+)"/g)].map((match) => match[1]);
    for (const cid of cids) expect(dataUris.has(cid), cid).toBe(true);
    expect(cids).toHaveLength(dataUris.size);

    const view = email.html.replace(/src="cid:([^"]+)"/g, (_match, cid: string) => `src="${dataUris.get(cid)}"`);
    const blocked = email.html.replace(/src="cid:[^"]+"/g, 'src="data:,"');
    const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
    const htmlBytes = Buffer.byteLength(email.html, "utf8");
    const qpBytes = quotedPrintableBytes(email.html);

    writeFileSync(join(dir, "email.html"), email.html);
    writeFileSync(join(dir, "view.html"), view);
    writeFileSync(join(dir, "blocked.html"), blocked);
    writeFileSync(join(dir, "text.txt"), email.text);
    writeFileSync(
      join(dir, "meta.json"),
      JSON.stringify(
        {
          id: fixture.id,
          title: fixture.title,
          subject: email.subject,
          firstLine: email.text.split("\n")[0],
          htmlBytes,
          estimatedEncodedHtmlBytes: qpBytes,
          textBytes: Buffer.byteLength(email.text, "utf8"),
          attachments: (email.attachments ?? []).map((attachment) => ({
            filename: attachment.filename,
            contentId: attachment.contentId,
            bytes: attachment.content.byteLength,
          })),
          links,
        },
        null,
        2
      )
    );

    expect(htmlBytes).toBeLessThanOrEqual(EMAIL_BUDGETS[fixture.kind].html);
    expect(Buffer.byteLength(email.text, "utf8")).toBeLessThanOrEqual(EMAIL_BUDGETS[fixture.kind].text);
    expect(qpBytes).toBeLessThan(GMAIL_CLIP_BYTES);
    for (const link of links) {
      expect(link.startsWith(`${SITE_URL}/`) || link.startsWith("tel:") || link.startsWith("mailto:"), link).toBe(true);
    }

    const desktopWidth = await screenshot(view, join(dir, "desktop.png"), 640, 1);
    const mobileWidth = await screenshot(view, join(dir, "mobile.png"), 375, 2);
    expect(desktopWidth).toBeLessThanOrEqual(640);
    expect(mobileWidth, "horizontal overflow at 375 px").toBeLessThanOrEqual(375);
    const hasPreviews = cids.length > 0;
    if (hasPreviews) {
      const blockedWidth = await screenshot(blocked, join(dir, "blocked-mobile.png"), 375, 2);
      expect(blockedWidth).toBeLessThanOrEqual(375);
    }

    rendered.push({ fixture, email, hasPreviews, htmlBytes, qpBytes });
  });
});
