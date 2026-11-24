/**
 * Engineering Phase E3 — the kit's documents (2.0): placeholders, DRAFT marks, no signature lines, the one-pager's
 * word budget and single page, Word text equal to the PDF source text, the customer folder holding only what may be
 * sent, MANIFEST.json hashes, no secrets, the ZIP utilities and the private-storage guard.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { visibleWords } from "../packs/text-policy.mjs";
import { assertPrivateOut } from "./check.mjs";
import { APPROVAL_LINES, DRAFT_COMMERCIAL, DRAFT_LEGAL, EMAILS, PLACEHOLDERS, REVIEWED, SCOPE, WHAT_TO_EXPECT, emailReviewNote } from "./documents.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { documentHtml } from "./render-html.mjs";
import { emailDraftText, emailMarkdown } from "./render-docx.mjs";
import { inspectWorkbookZip, normalizeOoxml, readZip, writeZip } from "./zip.mjs";

const KIT_DIR = PATHS.kit;
vi.setConfig({ testTimeout: 30_000 });
const manifest = JSON.parse(readFileSync(path.join(KIT_DIR, "MANIFEST.json"), "utf8"));
const placeholderKeys = new Set(PLACEHOLDERS.map(([k]) => k));
const used = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const docxText = (file) =>
  readZip(readFileSync(file))
    .find((f) => f.name === "word/document.xml")
    .data.toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const blockTexts = (doc) =>
  doc.blocks.flatMap((b) => [b.title, b.subtitle, b.text, ...(b.items ?? []).flatMap((i) => (typeof i === "string" ? [i] : [i.title, i.text, i.caption])), ...(b.rows ?? []).flat(), ...(b.lines ?? []).flat(), ...(b.head ?? [])]).filter(Boolean).map((t) => t.replace(/\*\*/g, ""));
const squash = (s) => s.replace(/\s+/g, " ").trim();
const pdfPages = (file) => (readFileSync(file).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("email templates and the approval wording", () => {
  it("use only documented placeholders, and every documented one is used", () => {
    const all = new Set();
    for (const e of EMAILS) for (const k of used(emailMarkdown(e))) {
      expect(placeholderKeys.has(k), `${e.file}: {{${k}}}`).toBe(true);
      all.add(k);
    }
    expect([...all].sort()).toEqual([...placeholderKeys].sort());
  });

  it("are four, and none asks for an upload link or invents a link", () => {
    expect(EMAILS.map((e) => e.file)).toEqual(["01-welcome", "02-questions", "03-preview-ready", "04-live"]);
    for (const e of EMAILS) {
      expect(/https?:\/\//.test(emailMarkdown(e)), e.file).toBe(false);
      // "Upload an image" is the app's own button (email 4); an upload link or folder is what's gone.
      expect(/upload (link|folder)|upload-only|\{\{upload_link\}\}/i.test(JSON.stringify(e.body)), e.file).toBe(false);
    }
  });

  it("carry the approval wording in the preview email, so the Approved reply is the record until E5A", () => {
    const preview = EMAILS.find((e) => e.file === "03-preview-ready");
    for (const line of APPROVAL_LINES) expect(preview.body).toContain(line);
    expect(emailMarkdown(preview)).toContain('reply "Approved"');
  });
});

describe("customer files", () => {
  const customerFiles = walk(PATHS.customer).map((f) => path.relative(PATHS.customer, f).split(path.sep).join("/")).sort();

  it("are exactly what may be sent: the one-pager and the list template", () => {
    expect(customerFiles).toEqual(["equipment-list-template.xlsx", "mulemark-what-to-expect.pdf"]);
  });

  it("contain no placeholders", () => {
    expect(used(documentHtml(WHAT_TO_EXPECT))).toEqual([]);
    expect(used(docxText(path.join(PATHS.internal, `${WHAT_TO_EXPECT.file}.docx`)))).toEqual([]);
  });

  it("keep the one-pager picture-first and on one page: at most 220 visible words", () => {
    expect(visibleWords(documentHtml(WHAT_TO_EXPECT))).toBeLessThanOrEqual(220);
    expect(pdfPages(path.join(PATHS.customer, `${WHAT_TO_EXPECT.file}.pdf`))).toBe(1);
    expect(WHAT_TO_EXPECT.blocks.filter((b) => b.t === "steps")[0].items).toHaveLength(5);
  });

  it("never mention an upload, a workbook or folders to the customer", () => {
    const words = JSON.stringify(WHAT_TO_EXPECT) + emailMarkdown(EMAILS[0]);
    for (const banned of [/upload/i, /workbook/i, /folder/i, /START HERE/, /Not sure|Please review/]) expect(banned.test(words), String(banned)).toBe(false);
  });
});

describe("drafts and signatures", () => {
  it("marks commercial and legal wording as DRAFT until reviewed", () => {
    if (!REVIEWED.commercial) expect(JSON.stringify(WHAT_TO_EXPECT)).toContain(DRAFT_COMMERCIAL);
    if (!(REVIEWED.commercial && REVIEWED.legal)) {
      expect(JSON.stringify(SCOPE)).toMatch(/DRAFT for commercial and legal review/);
      expect(readdirSync(PATHS.internal)).toContain("scope-and-assumptions-DRAFT.pdf");
    }
    const preview = EMAILS.find((e) => e.file === "03-preview-ready");
    if (!REVIEWED.legal) {
      expect(emailReviewNote(preview)).toMatch(new RegExp(`^${DRAFT_LEGAL}`));
      expect(emailDraftText(preview).startsWith(`[${DRAFT_LEGAL}`)).toBe(true);
    }
    expect(emailReviewNote(EMAILS[0])).toBeNull();
  });

  it("has no signature lines, in any document", () => {
    const all = [WHAT_TO_EXPECT, SCOPE].map((d) => JSON.stringify(d)).join(" ") + EMAILS.map(emailMarkdown).join(" ");
    expect(/sign here|signature:|_{5,}/i.test(all)).toBe(false);
  });

  it("gives the Word copies the same text as the PDFs", () => {
    for (const [doc, file] of [
      [WHAT_TO_EXPECT, path.join(PATHS.internal, `${WHAT_TO_EXPECT.file}.docx`)],
      [SCOPE, path.join(PATHS.internal, readdirSync(PATHS.internal).find((n) => n.startsWith(SCOPE.file) && n.endsWith(".docx")))],
    ]) {
      const text = squash(docxText(file));
      for (const t of blockTexts(doc)) expect(text.includes(squash(t)), `${doc.id}: "${t}"`).toBe(true);
    }
  });
});

describe("kit integrity", () => {
  it("matches MANIFEST.json: every generated file present with its recorded SHA-256", () => {
    expect(manifest.workbook_version).toBe(KIT.workbookVersion);
    expect(manifest.files.length).toBe(31);
    for (const f of manifest.files) {
      const data = readFileSync(path.join(KIT_DIR, f.file));
      expect(createHash("sha256").update(data).digest("hex"), f.file).toBe(f.sha256);
    }
  });

  it("contains no secrets or credentials", () => {
    const patterns = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /postgres(ql)?:\/\/[^\s"]+@/, /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/, /\bre_[A-Za-z0-9]{20,}/, /SUPABASE_SERVICE_ROLE/];
    for (const f of walk(KIT_DIR).filter((x) => /\.(md|json|csv|txt)$/.test(x))) {
      const text = readFileSync(f, "utf8");
      for (const p of patterns) expect(p.test(text), `${f} ${p}`).toBe(false);
    }
  });
});

describe("zip utilities and private storage", () => {
  const date = KIT.fixedDate;

  it("round-trips and writes the same bytes every time", () => {
    const files = [{ name: "a.txt", data: Buffer.from("hello") }, { name: "dir/b.bin", data: Buffer.alloc(1000, 7) }, { name: "café.txt", data: Buffer.from("é") }];
    const one = writeZip(files, { date });
    expect(Buffer.compare(one, writeZip(files, { date }))).toBe(0);
    expect(readZip(one).map((f) => [f.name, f.data.toString("hex")])).toEqual(files.map((f) => [f.name, f.data.toString("hex")]));
    expect(Buffer.compare(normalizeOoxml(one, { date }), normalizeOoxml(normalizeOoxml(one, { date }), { date }))).toBe(0);
  });

  it("refuses macros and non-workbooks, and notes links to other workbooks without opening them", () => {
    const wb = (extra) => writeZip([{ name: "xl/workbook.xml", data: Buffer.from("<workbook/>") }, ...extra], { date });
    expect(inspectWorkbookZip(wb([])).ok).toBe(true);
    expect(inspectWorkbookZip(wb([{ name: "xl/vbaProject.bin", data: Buffer.from("x") }])).ok).toBe(false);
    const linked = inspectWorkbookZip(wb([{ name: "xl/externalLinks/externalLink1.xml", data: Buffer.from("<x/>") }]));
    expect(linked.ok).toBe(true);
    expect(linked.notes.join(" ")).toMatch(/never opened/);
    expect(inspectWorkbookZip(writeZip([{ name: "word/document.xml", data: Buffer.from("x") }], { date })).ok).toBe(false);
    expect(inspectWorkbookZip(Buffer.from("not a zip")).ok).toBe(false);
  });

  it("never writes customer outputs inside the repository, except the example's own folder", () => {
    expect(() => assertPrivateOut(path.join(REPO, "docs"))).toThrow(/Refusing/);
    expect(() => assertPrivateOut(REPO)).toThrow(/Refusing/);
    expect(() => assertPrivateOut(PATHS.exampleRun)).toThrow(/Refusing/);
    expect(assertPrivateOut(PATHS.exampleRun, { allowInside: PATHS.exampleRun })).toBe(path.resolve(PATHS.exampleRun));
    expect(assertPrivateOut(path.join(os.tmpdir(), "intake-test"))).toBe(path.resolve(os.tmpdir(), "intake-test"));
  });
});
