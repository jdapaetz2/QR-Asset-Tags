/**
 * Engineering Phase E3 — the kit's documents and packaging: placeholders, DRAFT marks, no signature lines, the guide's
 * word budget, Word text equal to the PDF source text, MANIFEST.json hashes, no secrets, the ZIP utilities and the
 * private-storage guard.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { visibleWords } from "../packs/text-policy.mjs";
import { assertPrivateOut } from "./check.mjs";
import { APPROVAL_FORM, DRAFT_COMMERCIAL, EMAILS, GUIDE, PLACEHOLDERS, REVIEWED, SCOPE } from "./documents.mjs";
import { KIT, PATHS, REPO } from "./kit-config.mjs";
import { documentHtml } from "./render-html.mjs";
import { emailMarkdown } from "./render-docx.mjs";
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

describe("email templates and the approval wording", () => {
  it("use only documented placeholders", () => {
    for (const e of EMAILS) for (const k of used(emailMarkdown(e))) expect(placeholderKeys.has(k), `${e.file}: {{${k}}}`).toBe(true);
    for (const k of used(JSON.stringify(APPROVAL_FORM))) expect(placeholderKeys.has(k), `approval form: {{${k}}}`).toBe(true);
  });

  it("keep the upload link a placeholder: no invented links", () => {
    expect(used(emailMarkdown(EMAILS[0]))).toContain("upload_link");
    for (const e of EMAILS) expect(/https?:\/\//.test(emailMarkdown(e)), e.file).toBe(false);
  });
});

describe("customer packet", () => {
  const customerFiles = walk(PATHS.customer);

  it("contains no placeholders anywhere", () => {
    for (const f of customerFiles.filter((x) => /\.(csv|txt)$/.test(x))) expect(used(readFileSync(f, "utf8")), f).toEqual([]);
    expect(used(documentHtml(GUIDE))).toEqual([]);
    expect(used(documentHtml(SCOPE))).toEqual([]);
    for (const f of customerFiles.filter((x) => x.endsWith(".docx"))) expect(used(docxText(f)), f).toEqual([]);
  });

  it("keeps the guide picture-first: at most 600 visible words", () => {
    expect(visibleWords(documentHtml(GUIDE))).toBeLessThanOrEqual(600);
  });

  it("marks commercial and legal wording as DRAFT until reviewed", () => {
    if (!REVIEWED.commercial) expect(JSON.stringify(GUIDE)).toContain(DRAFT_COMMERCIAL);
    if (!(REVIEWED.commercial && REVIEWED.legal)) {
      expect(JSON.stringify(SCOPE)).toMatch(/DRAFT for commercial and legal review/);
      expect(existsSync(path.join(PATHS.customer, "mulemark-scope-and-assumptions-DRAFT.pdf"))).toBe(true);
    }
    if (!REVIEWED.legal) expect(JSON.stringify(APPROVAL_FORM)).toMatch(/DRAFT for legal review/);
  });

  it("has no signature lines, in any document", () => {
    const all = [GUIDE, SCOPE, APPROVAL_FORM].map((d) => JSON.stringify(d)).join(" ") + EMAILS.map(emailMarkdown).join(" ");
    expect(/sign here|signature:|_{5,}/i.test(all)).toBe(false);
  });

  it("gives the Word copies the same text as the PDFs", () => {
    for (const [doc, file] of [
      [GUIDE, path.join(PATHS.customer, `${GUIDE.file}.docx`)],
      [SCOPE, path.join(PATHS.customer, readdirSync(PATHS.customer).find((n) => n.startsWith(SCOPE.file) && n.endsWith(".docx")))],
      [APPROVAL_FORM, path.join(PATHS.internal, `${APPROVAL_FORM.file}.docx`)],
    ]) {
      const text = squash(docxText(file));
      for (const t of blockTexts(doc)) expect(text.includes(squash(t)), `${doc.id}: "${t}"`).toBe(true);
    }
  });
});

describe("kit integrity", () => {
  it("matches MANIFEST.json: every generated file present with its recorded SHA-256", () => {
    expect(manifest.workbook_version).toBe(KIT.workbookVersion);
    expect(manifest.files.length).toBeGreaterThan(40);
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
