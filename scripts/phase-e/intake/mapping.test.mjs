/**
 * Engineering Phase E3 — the field mapping and the app mirrors.
 *
 * Every workbook field maps once, with real targets (an import column, a contract path or a stated reason), and every
 * rule the kit mirrors from the app (import columns, production CSV headers, tag options, the dialable-phone rule, the
 * category aliases, the CSV parser, the formula guard) still matches the app's own code.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCsv as appParseCsv } from "@/lib/csv/parse";
import { csvField } from "@/lib/export/csv";
import { telHref as appTelHref } from "@/lib/contact/links";
import { suggestTemplateKeyFromCategory } from "@/lib/inspections/resolve";
import { IMPORT_COLUMNS as APP_IMPORT_COLUMNS } from "@/lib/onboarding/import";
import { MATERIAL_OPTIONS, MOUNTING_OPTIONS, TAG_SIZE_OPTIONS } from "@/lib/qr/production";
import { PRODUCTION_CSV_HEADERS as APP_PRODUCTION_HEADERS } from "@/lib/qr/production-csv";

import { parseCsv, reportField } from "./csv.mjs";
import { FLEET_ALIASES, TIERS, allFields, mappingDocument, normalizeHeader } from "./field-mapping.mjs";
import { CATEGORY_RETURN_ALIASES, KIT, LISTS, PATHS, returnTemplateForCategory, telHref } from "./kit-config.mjs";
import { IMPORT_COLUMNS } from "./outputs.mjs";
import { PRODUCTION_CSV_HEADERS } from "./trackers.mjs";

const SCHEMA = JSON.parse(readFileSync(PATHS.schema, "utf8"));
const fields = allFields();

/** Resolve "assets[].asset_code" / "organization.support.phone" against the schema (first two levels). */
function schemaHas(target) {
  const clean = target.split(" ")[0];
  const [root, ...rest] = clean.replace(/\[\]/g, "").split(".");
  const defs = SCHEMA.definitions;
  const rootDef = { organization: defs.organization, assets: defs.asset, models: defs.model, sources: defs.source }[root];
  if (!rootDef) return false;
  if (rest.length === 0) return true;
  const first = rootDef.properties[rest[0].replace(/\+.*/, "")];
  if (!first) return false;
  if (rest.length === 1) return true;
  const ref = first.$ref ? defs[first.$ref.split("/").pop()] : first;
  return Boolean(ref.properties?.[rest[1]] || ref.additionalProperties);
}

describe("field mapping", () => {
  it("gives every field a unique stable key and a valid tier", () => {
    const keys = fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of fields) expect(TIERS).toContain(f.tier);
  });

  it("keeps labels unique within each tab", () => {
    const byTab = new Map();
    for (const f of fields) {
      const k = `${f.tab}|${f.section === "People" || f.section === "Notes" || f.section === "Files" ? f.section : "main"}|${normalizeHeader(f.label)}`;
      expect(byTab.has(k), `duplicate label ${f.label} on ${f.tab}`).toBe(false);
      byTab.set(k, f);
    }
  });

  it("names a real target for every field: an import column, a contract path, an app column or a stated reason", () => {
    for (const f of fields) {
      const t = f.targets;
      expect(t, f.key).toBeTruthy();
      expect(Boolean(t.current_import || t.contract || t.app || t.kit_only), f.key).toBe(true);
      if (t.current_import) expect(APP_IMPORT_COLUMNS.some((c) => t.current_import.includes(c)), `${f.key}: ${t.current_import}`).toBe(true);
      if (t.contract) expect(schemaHas(t.contract), `${f.key}: ${t.contract}`).toBe(true);
    }
  });

  it("only uses dropdown lists that exist", () => {
    for (const f of fields.filter((x) => x.list)) expect(f.list === "modelChoices" || Boolean(LISTS[f.list]), f.key).toBe(true);
  });

  it("maps fleet-export aliases to real keys, each alias to one key only", () => {
    const keys = new Set(fields.map((f) => f.key));
    const seen = new Map();
    for (const [key, aliases] of Object.entries(FLEET_ALIASES)) {
      expect(keys.has(key), key).toBe(true);
      for (const a of aliases) {
        const n = normalizeHeader(a);
        expect(seen.get(n) ?? key, `alias "${a}"`).toBe(key);
        seen.set(n, key);
      }
    }
  });

  it("matches the published field-mapping JSON", () => {
    const committed = JSON.parse(readFileSync(path.join(PATHS.internal, `field-mapping-${KIT.mappingVersion}.json`), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(mappingDocument())));
  });
});

describe("app mirrors", () => {
  it("import columns match lib/onboarding/import.ts", () => {
    expect(IMPORT_COLUMNS).toEqual([...APP_IMPORT_COLUMNS]);
  });

  it("production CSV headers match lib/qr/production-csv.ts", () => {
    expect(PRODUCTION_CSV_HEADERS).toEqual([...APP_PRODUCTION_HEADERS]);
  });

  it("tag options match lib/qr/production.ts (plus Not sure)", () => {
    const strip = (list) => list.filter((v) => v !== "Not sure").map((v) => v.toLowerCase());
    expect(strip(LISTS.tagSize)).toEqual([...TAG_SIZE_OPTIONS]);
    expect(strip(LISTS.tagMaterial)).toEqual([...MATERIAL_OPTIONS]);
    expect(strip(LISTS.tagMounting)).toEqual([...MOUNTING_OPTIONS]);
  });

  it("the dialable-phone rule matches lib/contact/links.ts", () => {
    for (const v of ["604-555-0142", "+1 (604) 555-0142", "604-555-0199 ext 2", "604.555.0142 x12", "555-01", "call 604 555 0142", "+16045550142", "1-800-RENTALS", "", "   "]) {
      expect(telHref(v), v).toBe(appTelHref(v));
    }
  });

  it("category aliases match lib/inspections/resolve.ts", () => {
    for (const c of [...Object.keys(CATEGORY_RETURN_ALIASES), ...LISTS.category, "  Utility   Trailer ", "Scissor lift", "Air compressor", "Boom lift", ""]) {
      expect(returnTemplateForCategory(c), c).toBe(suggestTemplateKeyFromCategory(c));
    }
  });

  it("the CSV parser matches lib/csv/parse.ts", () => {
    const inputs = [
      'a,b\r\n1,"two, three"\r\n',
      'code,name\n00412,"Dump trailer 7\' x 14\' ""HD"", 14LP"\n',
      "x\ry\r\n",
      'q,"line\nbreak",z',
      '12" trailer,next\r\nrow,2',
      ",,\n,",
      "",
    ];
    for (const t of inputs) expect(parseCsv(t), JSON.stringify(t)).toEqual(appParseCsv(t));
  });

  it("report cells use the same formula guard as lib/export/csv.ts", () => {
    for (const v of ["=HYPERLINK(\"http://x\",\"y\")", "+1 604 555 0100", "-5", "@SUM(1)", "\tx", "\rx", "plain", "a,b", 'say "hi"', "line\nbreak", null, 42]) {
      expect(reportField(v), String(v)).toBe(csvField(v));
    }
  });
});
