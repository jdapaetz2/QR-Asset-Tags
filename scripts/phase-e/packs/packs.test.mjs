/**
 * Engineering Phase E2A — integrity checks for the showcase content packs under docs/phase-e/packs.
 *
 * Schema validity, source coverage, status rules, file hashes, PDF structure, image sizes, payload budgets, SVG
 * safety and accessibility, the picture-first text rules (no words in drawings, every drawn number traced to its
 * source, short titles and sign labels, alt text built from frames, word caps for the gallery and guides) and the E2C
 * import manifests. Checks against the private source vault run only when the vault exists on this machine (it is
 * never in Git).
 */
import { hash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ajv 6 is already installed (an ESLint dependency); draft-07 needs nothing else.
import Ajv from "ajv";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  BUDGETS,
  ITEM_LISTS,
  citedSourceIds,
  composeAlt,
  embedSources,
  isPolicyRef,
  itemId,
  missingPolicies,
  readinessProblems,
  signAlt,
} from "../../lib/content-pack.mjs";
import { guideHtml } from "./guide-layout.mjs";
import { buildImportManifest, stableStringify } from "./import-manifests.mjs";
import { MIN_LABEL } from "./pictogram-kit.mjs";
import { PANELS } from "./pictogram-panels.mjs";
import { SIGNS, accessorySvgs } from "./pictogram-signs.mjs";
import { SIGN_LABEL_MAX_CHARS, SIGN_LABEL_MAX_WORDS, isAllowedArtText, numbersIn, numbersStated, titleProblems, visibleWords, wordCount } from "./text-policy.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
const SCHEMA = JSON.parse(readFileSync(path.join(REPO, "docs", "phase-e", "schema", "equipment-content.schema.json"), "utf8"));
const REGISTER = JSON.parse(readFileSync(path.join(PACKS, "SOURCES_REGISTER.json"), "utf8"));
const VAULT = path.join(os.homedir(), "Mulemark-Sources", "e2a");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const sha = (file) => hash("sha256", readFileSync(file));

/** Word caps for what a reader sees without opening anything (measured 2026-10-17: 52-77 per machine, 266 in all, 62-79 per guide). */
const WORD_CAPS = { gallerySection: 90, gallery: 320, guide: 100 };

const ENTRIES = readdirSync(PACKS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(path.join(PACKS, e.name, "pack.json")))
  .map((e) => {
    const dir = path.join(PACKS, e.name);
    const read = (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    return {
      dirName: e.name,
      dir,
      pack: read("pack.json"),
      media: existsSync(path.join(dir, "media", "media.json")) ? read("media/media.json") : { items: [] },
      manifest: read("import-manifest.json"),
    };
  });

const ajv = new Ajv({ allErrors: true });
const validatePack = ajv.compile(SCHEMA);
const validateSource = ajv.compile({ definitions: SCHEMA.definitions, $ref: "#/definitions/source" });
const allItems = (model) => ITEM_LISTS.flatMap((list) => (model[list] ?? []).map((item) => ({ list, item })));

/** What an id a frame, sign or page field derives from says: step text, spec value, policy text or configuration. */
function derivedText(pack, id) {
  const model = pack.models[0];
  const item = allItems(model).find(({ item: i }) => itemId(i) === id)?.item;
  if (item) return item.text ?? `${item.label ?? ""} ${item.value ?? ""}`;
  const policy = (pack.organization.policies ?? []).find((p) => p.policy_id === id);
  if (policy) return policy.text;
  if (id in model.configuration) return String(model.configuration[id]);
  return null;
}

const svgTexts = (svg) => [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(([, attrs, text]) => ({ seq: /class="seq"/.test(attrs), text: text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") }));

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("E2A packs: structure", () => {
  it("finds the four showcase packs", () => {
    expect(ENTRIES.map((e) => e.pack.assets[0].asset_code).sort()).toEqual(["EXCAVATOR-017", "EXCAVATOR-3015", "TRAILER-014", "TRAILER-2041"]);
  });

  it("every pack, register entry and the E0 example validate against the schema", () => {
    for (const { dirName, pack } of ENTRIES) expect(validatePack(pack) ? [] : validatePack.errors, dirName).toEqual([]);
    for (const source of REGISTER.sources) expect(validateSource(source) ? [] : validateSource.errors, source.source_id).toEqual([]);
    const example = JSON.parse(readFileSync(path.join(REPO, "docs", "phase-e", "schema", "equipment-content.example.json"), "utf8"));
    expect(validatePack(example) ? [] : validatePack.errors).toEqual([]);
  });

  it("each pack lives in a folder named after its model key, shared by its media and manifest", () => {
    for (const { dirName, pack, media, manifest } of ENTRIES) {
      expect(pack.models[0].model_key).toBe(dirName);
      expect(pack.assets[0].model_key).toBe(dirName);
      for (const item of media.items) expect(item.model_key, item.id).toBe(dirName);
      expect(manifest.pack).toBe(`docs/phase-e/packs/${dirName}/pack.json`);
      expect(manifest.target.asset_id).toBe(pack.assets[0].existing_ids.asset_id);
    }
  });
});

describe("E2A packs: sources", () => {
  it("embeds exactly the register entries it cites, unchanged, and defines every policy it cites", () => {
    for (const { dirName, pack } of ENTRIES) {
      expect(pack.sources, dirName).toEqual(embedSources(pack, REGISTER));
      expect(missingPolicies(pack), dirName).toEqual([]);
      expect([...citedSourceIds(pack)].sort()).toEqual(pack.sources.map((s) => s.source_id).sort());
    }
  });

  it("gives every spec, step, warning, note, panel and sign a source, with a page for documents in hand", () => {
    for (const { dirName, pack } of ENTRIES) {
      const sources = new Map(pack.sources.map((s) => [s.source_id, s]));
      for (const { list, item } of allItems(pack.models[0])) {
        const id = itemId(item);
        expect(item.source_refs?.length ?? 0, `${dirName} ${list} ${id}`).toBeGreaterThan(0);
        for (const ref of item.source_refs) {
          if (isPolicyRef(ref.source_id)) continue;
          const source = sources.get(ref.source_id);
          expect(source, `${dirName} ${id} cites ${ref.source_id}`).toBeTruthy();
          const pageless = source.kind === "oem-web" || source.kind === "photo" || source.availability !== "in-hand" || /single sheet/i.test(source.locator_convention ?? "");
          if (!pageless) expect(ref.locator ?? "", `${dirName} ${id} → ${ref.source_id}`).toMatch(/\bp{1,2}\.\s*\d/);
        }
      }
    }
  });

  it("traces every public page field to steps, specs, policies, a template or the standard wording", () => {
    for (const { dirName, pack } of ENTRIES) {
      const model = pack.models[0];
      const known = new Set([
        ...allItems(model).map(({ item }) => itemId(item)),
        ...(pack.organization.policies ?? []).map((p) => p.policy_id),
        ...Object.keys(model.configuration),
        "model",
        "mulemark-standard-emergency",
        `template:${model.templates.return}`,
      ]);
      for (const [key, f] of Object.entries(pack.assets[0].page)) {
        if (f.text) expect(f.derived_from?.length ?? 0, `${dirName} page.${key}`).toBeGreaterThan(0);
        for (const id of f.derived_from ?? []) expect(known.has(id), `${dirName} page.${key} → ${id}`).toBe(true);
      }
    }
  });

  it("contains no placeholder or example links", () => {
    const texts = [
      readFileSync(path.join(PACKS, "SOURCES_REGISTER.json"), "utf8"),
      ...ENTRIES.flatMap(({ dir }) => [readFileSync(path.join(dir, "pack.json"), "utf8"), readFileSync(path.join(dir, "import-manifest.json"), "utf8")]),
    ];
    for (const text of texts) expect(text).not.toMatch(/example\.(com|org|net)|localhost|lorem ipsum|\bTODO\b|\bTBD\b/i);
  });
});

describe("E2A packs: status rules", () => {
  it("never marks a model READY while any item is REVIEW_REQUIRED or BLOCKED, and explains every BLOCKED item", () => {
    for (const { dirName, pack } of ENTRIES) {
      expect(readinessProblems(pack.models[0]), dirName).toEqual([]);
      for (const [key, f] of Object.entries(pack.assets[0].page)) {
        if (f.status === "BLOCKED") expect(f.status_reason, `${dirName} page.${key}`).toBeTruthy();
      }
      for (const doc of pack.assets[0].documents ?? []) if (doc.status !== "READY") expect(doc.status_reason, doc.title).toBeTruthy();
    }
  });

  it("draws exactly the panels that are not BLOCKED and have art, with alt text built from their frames", () => {
    const drawnInPacks = [];
    for (const { dirName, pack } of ENTRIES) {
      for (const panel of pack.models[0].pictograms) {
        const hasFiles = (panel.files ?? []).length > 0;
        expect(hasFiles, `${dirName} ${panel.panel_id}`).toBe(Boolean(PANELS[panel.panel_id]));
        if (panel.status === "BLOCKED") expect(hasFiles, `${dirName} ${panel.panel_id} is BLOCKED`).toBe(false);
        expect(panel.text_alternative, panel.panel_id).toBe(`${panel.title}. ${panel.caption}`);
        if (hasFiles) {
          drawnInPacks.push(panel.panel_id);
          expect(panel.frames?.length ?? 0, panel.panel_id).toBeGreaterThan(0);
          expect(panel.frames.map((f) => f.frame_id), panel.panel_id).toEqual(panel.frames.map((_, i) => `${panel.panel_id}-f${i + 1}`));
          expect(panel.alt, panel.panel_id).toBe(composeAlt(panel.frames));
        }
      }
    }
    expect(drawnInPacks.sort()).toEqual(Object.keys(PANELS).sort());
  });

  it("draws exactly the registered signs, in their frame kind, with alt text built from what they show", () => {
    const drawnInPacks = [];
    for (const { dirName, pack } of ENTRIES) {
      for (const sign of pack.models[0].signs ?? []) {
        const hasFiles = (sign.files ?? []).length > 0;
        expect(hasFiles, `${dirName} ${sign.sign_id}`).toBe(Boolean(SIGNS[sign.sign_id]));
        if (!hasFiles) continue;
        drawnInPacks.push(sign.sign_id);
        expect(sign.status, sign.sign_id).not.toBe("BLOCKED");
        expect(sign.kind, sign.sign_id).toBe(SIGNS[sign.sign_id].kind);
        expect(sign.alt, sign.sign_id).toBe(signAlt(sign));
        expect(sign.text_alternative, sign.sign_id).toMatch(new RegExp(`^${sign.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\. \\S`));
      }
    }
    expect(drawnInPacks.sort()).toEqual(Object.keys(SIGNS).sort());
  });

  it("derives every frame and sign from known, unblocked steps, specs, policies or configuration", () => {
    for (const { dirName, pack } of ENTRIES) {
      const model = pack.models[0];
      const blocked = new Set(allItems(model).filter(({ item }) => item.status === "BLOCKED").map(({ item }) => itemId(item)));
      const owners = [...model.pictograms.flatMap((p) => (p.frames ?? []).map((f) => [f.frame_id, f.derived_from])), ...(model.signs ?? []).map((s) => [s.sign_id, s.derived_from])];
      for (const [owner, ids] of owners) {
        for (const id of ids) {
          expect(derivedText(pack, id), `${dirName} ${owner} → ${id}`).not.toBeNull();
          expect(blocked.has(id), `${dirName} ${owner} is drawn from BLOCKED ${id}`).toBe(false);
        }
      }
    }
  });

  it("gives every common accessory one icon, traced to the policy or return template that issues it", () => {
    for (const { dirName, pack } of ENTRIES) {
      const model = pack.models[0];
      const icons = model.accessory_icons ?? [];
      expect(icons.map((a) => a.name).sort(), dirName).toEqual([...(model.common_accessories ?? [])].sort());
      const policies = new Set((pack.organization.policies ?? []).map((p) => p.policy_id));
      for (const icon of icons) for (const id of icon.derived_from) expect(policies.has(id) || id === `template:${model.templates.return}`, `${dirName} ${icon.name} → ${id}`).toBe(true);
    }
  });
});

describe("E2A packs: picture-first text", () => {
  const artFiles = () =>
    ENTRIES.flatMap(({ dirName, dir, pack }) => {
      const model = pack.models[0];
      return [
        ...model.pictograms.filter((p) => p.files).map((p) => ({ dirName, pack, id: p.panel_id, derived: p.frames.flatMap((f) => f.derived_from), svg: readFileSync(path.join(dir, "guide", `${p.panel_id}.svg`), "utf8") })),
        ...(model.signs ?? []).filter((s) => s.files).map((s) => ({ dirName, pack, id: s.sign_id, derived: s.derived_from, svg: readFileSync(path.join(dir, "guide", `${s.sign_id}.svg`), "utf8") })),
      ];
    });

  it("drawings carry no words: only numbers, fractions, units and symbols", () => {
    for (const { id, svg } of artFiles()) for (const { text } of svgTexts(svg)) expect(isAllowedArtText(text), `${id}: "${text}"`).toBe(true);
  });

  it("every number drawn appears in the step, spec, warning or policy the drawing comes from", () => {
    for (const { dirName, pack, id, derived, svg } of artFiles()) {
      const stated = numbersStated(derived.map((d) => derivedText(pack, d)).join(" "));
      for (const { seq, text } of svgTexts(svg)) {
        if (seq) continue;
        for (const n of numbersIn(text)) expect(stated.has(n), `${dirName} ${id}: ${n} in "${text}" is not in ${derived.join(", ")}`).toBe(true);
      }
    }
  });

  it("keeps panel titles to 4 words and sign labels to 3", () => {
    for (const { pack } of ENTRIES) {
      const model = pack.models[0];
      for (const p of model.pictograms) expect(titleProblems(p.title), p.panel_id).toEqual([]);
      for (const s of model.signs ?? []) expect(titleProblems(s.label, { maxWords: SIGN_LABEL_MAX_WORDS, maxChars: SIGN_LABEL_MAX_CHARS }), s.sign_id).toEqual([]);
    }
  });

  it("keeps the public page text short: quick-start lines of 10 words or fewer, at most 4 lines of fuel, troubleshooting or return text", () => {
    for (const { dirName, pack } of ENTRIES) {
      const page = pack.assets[0].page;
      const numbered = (page.quick_start_text.text ?? "").split("\n").filter((l) => /^\d+\. /.test(l));
      expect(numbered.length, dirName).toBeLessThanOrEqual(8);
      for (const l of numbered) expect(wordCount(l), `${dirName}: ${l}`).toBeLessThanOrEqual(10);
      for (const key of ["fuel_power_notes", "troubleshooting_notes", "return_notes"]) expect((page[key].text ?? "").split("\n").filter(Boolean).length, `${dirName} ${key}`).toBeLessThanOrEqual(4);
    }
  });

  it("the gallery stays picture-first: capped visible words per machine and in all", () => {
    const html = readFileSync(path.join(PACKS, "REVIEW_GALLERY.html"), "utf8");
    expect(visibleWords(html)).toBeLessThanOrEqual(WORD_CAPS.gallery);
    const sections = html.split('<section class="asset"').slice(1);
    expect(sections).toHaveLength(ENTRIES.length);
    for (const section of sections) expect(visibleWords(`<section${section}`), section.match(/id="([^"]+)"/)?.[1]).toBeLessThanOrEqual(WORD_CAPS.gallerySection);
  });

  it("each Start-Up Guide stays picture-first: titles and sign labels only, within the word cap", () => {
    for (const { dirName, dir, pack } of ENTRIES) {
      const model = pack.models[0];
      const read = (id) => readFileSync(path.join(dir, "guide", `${id}.svg`), "utf8");
      const panelSvgs = new Map(model.pictograms.filter((p) => p.files).map((p) => [p.panel_id, read(p.panel_id)]));
      if (panelSvgs.size === 0) continue;
      const signSvgs = new Map((model.signs ?? []).filter((s) => s.files).map((s) => [s.sign_id, read(s.sign_id)]));
      const html = guideHtml(pack, { panelSvgs, signSvgs, accessorySvgs: accessorySvgs(model) });
      expect(visibleWords(html), dirName).toBeLessThanOrEqual(WORD_CAPS.guide);
      for (const p of model.pictograms) expect(html, `${dirName} ${p.panel_id}`).not.toContain(p.caption);
    }
  });
});

describe("E2A packs: files", () => {
  const records = () =>
    ENTRIES.flatMap(({ dirName, dir, pack, media }) => {
      const model = pack.models[0];
      const art = [...model.pictograms, ...(model.signs ?? [])].flatMap((item) => (item.files ?? []).map((f) => ({ dirName, dir, f, kind: f.file.endsWith(".svg") ? "svg" : "panel" })));
      return [
        ...(model.photo?.files ?? []).map((f) => ({ dirName, dir, f, kind: "hero" })),
        ...art,
        ...(pack.assets[0].documents ?? []).filter((d) => d.file).map((d) => ({ dirName, dir, f: d.file, kind: "pdf" })),
        ...media.items.flatMap((i) => [...i.outputs, ...(i.extras ?? [])].map((o) => ({ dirName, dir, f: { ...o, file: `media/${o.file}` }, kind: "media" }))),
      ];
    });

  it("every referenced file exists and matches its recorded SHA-256 and size", () => {
    for (const { dirName, dir, f } of records()) {
      const file = path.join(dir, ...f.file.split("/"));
      expect(existsSync(file), `${dirName}/${f.file}`).toBe(true);
      expect(sha(file), `${dirName}/${f.file}`).toBe(f.sha256);
      if (f.bytes !== undefined) expect(readFileSync(file).length, `${dirName}/${f.file}`).toBe(f.bytes);
    }
  });

  it("keeps heroes, panels, signs and guides within their budgets", () => {
    for (const { dirName, f, kind } of records()) {
      if (kind === "hero") expect(f.bytes, `${dirName}/${f.file}`).toBeLessThanOrEqual(BUDGETS.heroBytes);
      if (kind === "panel" || kind === "svg") expect(f.bytes, `${dirName}/${f.file}`).toBeLessThanOrEqual(BUDGETS.panelBytes);
      if (kind === "pdf") expect(f.bytes, `${dirName}/${f.file}`).toBeLessThanOrEqual(BUDGETS.guideBytes);
    }
  });

  it("guide PDFs are well-formed, tagged and no longer than two pages", () => {
    for (const { dirName, dir, f, kind } of records()) {
      if (kind !== "pdf") continue;
      const bytes = readFileSync(path.join(dir, ...f.file.split("/")));
      const text = bytes.toString("latin1");
      expect(text.startsWith("%PDF-"), f.file).toBe(true);
      expect(text.slice(-1024)).toContain("%%EOF");
      expect(text, `${dirName}/${f.file} is not tagged`).toMatch(/\/StructTreeRoot/);
      const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages, `${dirName}/${f.file}`).toBe(f.pages);
      expect(pages).toBeLessThanOrEqual(2);
    }
  });

  it("raster files decode at their recorded sizes", async () => {
    for (const { dirName, dir, f, kind } of records()) {
      if (kind === "pdf" || kind === "svg" || f.width === undefined) continue;
      const meta = await sharp(path.join(dir, ...f.file.split("/"))).metadata();
      expect([meta.width, meta.height], `${dirName}/${f.file}`).toEqual([f.width, f.height]);
    }
  });
});

describe("E2A packs: panel and sign artwork", () => {
  const svgFiles = () =>
    ENTRIES.flatMap(({ dir }) => (existsSync(path.join(dir, "guide")) ? readdirSync(path.join(dir, "guide")).filter((f) => f.endsWith(".svg")).map((f) => path.join(dir, "guide", f)) : []));

  it("SVGs contain no scripts, handlers, external references, embedded documents or webfonts", () => {
    const files = svgFiles();
    expect(files.length).toBe(Object.keys(PANELS).length + Object.keys(SIGNS).length);
    for (const file of files) {
      const svg = readFileSync(file, "utf8");
      expect(svg, file).not.toMatch(/<script|\son[a-z]+\s*=|<foreignObject|<!ENTITY|<!DOCTYPE|xlink:href|<image|@import|@font-face|url\(/i);
      const hrefs = [...svg.matchAll(/(?:href|src)\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs, file).toEqual([]);
      const urls = [...svg.matchAll(/https?:\/\/[^\s"']+/g)].map((m) => m[0]).filter((u) => u !== "http://www.w3.org/2000/svg");
      expect(urls, file).toEqual([]);
    }
  });

  it("SVGs are labelled images with system fonts and labels legible at review size", () => {
    for (const file of svgFiles()) {
      const svg = readFileSync(file, "utf8");
      const isSign = Boolean(SIGNS[path.basename(file, ".svg")]);
      expect(svg, file).toMatch(/^<svg [^>]*role="img"[^>]*aria-labelledby="([a-z0-9-]+-title) ([a-z0-9-]+-desc)"/);
      expect(svg).toMatch(/<title id="[a-z0-9-]+-title">[^<]+<\/title>/);
      expect(svg).toMatch(/<desc id="[a-z0-9-]+-desc">[^<]+<\/desc>/);
      expect(svg, file).toMatch(isSign ? /viewBox="0 0 240 240"/ : /viewBox="0 0 480 360"/);
      for (const [, family] of svg.matchAll(/font-family="([^"]+)"/g)) expect(family).toBe("Segoe UI, Arial, Helvetica, sans-serif");
      // 20 units in a 480-unit-wide panel shown at 360 px is 15 px; sign labels are larger still.
      for (const [, size] of svg.matchAll(/font-size="([\d.]+)"/g)) expect(Number(size), file).toBeGreaterThanOrEqual(MIN_LABEL);
    }
  });

  it("text colours meet WCAG AA contrast (4.5:1) against white, and white text sits on dark fills", () => {
    const dark = ["#1F1D1A", "#1F63A8", "#2E7D32"];
    for (const file of svgFiles()) {
      const svg = readFileSync(file, "utf8");
      for (const [, fill] of svg.matchAll(/<text [^>]*fill="(#[0-9A-Fa-f]{6})"/g)) {
        if (fill.toUpperCase() === "#FFFFFF") continue;
        expect(contrast(fill, "#FFFFFF"), `${path.basename(file)} ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const background of dark) expect(contrast("#FFFFFF", background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("E2A packs: E2C import manifests", () => {
  it("are current with their packs and only allow applying when every operation is READY", () => {
    for (const { dirName, pack, media, manifest } of ENTRIES) {
      expect(manifest.content_version, dirName).toBe(`e2a-${hash("sha256", stableStringify({ model: pack.models[0], asset: pack.assets[0] })).slice(0, 12)}`);
      const rebuilt = buildImportManifest({ pack, packDir: dirName, media, audit: null, auditInfo: manifest.current_from, previous: manifest });
      expect(rebuilt.pinned_ids, dirName).toEqual(manifest.pinned_ids);
      expect(manifest.apply.allowed, dirName).toBe(manifest.summary.REVIEW_REQUIRED === 0 && manifest.summary.BLOCKED === 0);
      expect(manifest.apply.allowed, `${dirName}: nothing is approved yet`).toBe(false);
    }
  });

  it("follow the app's storage path rules, pin v4 ids and never touch the QR row", () => {
    for (const { dirName, dir, manifest } of ENTRIES) {
      const { organization_id: org, asset_id: asset } = manifest.target;
      for (const { id } of manifest.pinned_ids) expect(id, dirName).toMatch(new RegExp(`^${UUID}$`));
      for (const op of manifest.operations.filter((o) => o.op === "upload")) {
        const pattern =
          op.bucket === "public-assets"
            ? new RegExp(`^org/${org}/asset/${asset}/cover/${UUID}\\.webp$`)
            : new RegExp(`^org/${org}/asset/${asset}/documents/(${UUID})/\\1\\.pdf$`);
        expect(op.path, `${dirName} ${op.key}`).toMatch(pattern);
        const from = path.join(REPO, ...op.from.split("/"));
        expect(from.startsWith(dir), op.from).toBe(true);
        expect(sha(from), op.from).toBe(op.sha256);
      }
      const qr = manifest.operations.filter((o) => o.table === "qr_links");
      expect(qr.map((o) => o.op), dirName).toEqual(["none"]);
    }
  });
});

describe.skipIf(!existsSync(VAULT))("E2A packs: private source vault (local only)", () => {
  it("holds every in-hand source with the recorded hash", () => {
    for (const source of REGISTER.sources.filter((s) => s.availability === "in-hand" && s.vault_path)) {
      const file = path.join(VAULT, ...source.vault_path.split("/"));
      expect(existsSync(file), source.source_id).toBe(true);
      expect(sha(file), source.source_id).toBe(source.sha256);
    }
  });
});
