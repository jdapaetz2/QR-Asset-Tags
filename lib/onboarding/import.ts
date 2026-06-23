/**
 * Pure CSV → import-row parsing and validation for bulk asset import. No I/O.
 * `organization_id` is never accepted from the CSV (ignored + warned); the server
 * action derives it from the signed-in profile. Per-row asset fields reuse
 * `normalizeAssetForm`. The duplicate-against-the-database check happens in the
 * action (on insert); this module flags in-file duplicates and field errors.
 */

import { parseCsv } from "@/lib/csv/parse";
import { normalizeAssetForm, type AssetInput } from "@/lib/assets/validate";
import { csvField } from "@/lib/submissions/csv";
import { isTemplateKey, type TemplateKey } from "@/lib/onboarding/templates";

export const IMPORT_COLUMNS = [
  "asset_code",
  "asset_name",
  "category",
  "make",
  "model",
  "serial_number",
  "year",
  "support_phone_override",
  "support_email_override",
  "cover_image_url",
  "template_key",
  "create_qr_link",
  "publish_asset",
  "publish_equipment_page",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export type ImportRowFlags = {
  templateKey: TemplateKey | null;
  createQrLink: boolean;
  publishAsset: boolean;
  publishEquipmentPage: boolean;
};

export type ImportRow = {
  /** 1-based data row number (excludes the header). */
  index: number;
  assetCode: string;
  asset?: AssetInput;
  flags?: ImportRowFlags;
  errors: string[];
  warnings: string[];
};

export type ParsedImport = {
  rows: ImportRow[];
  fileWarnings: string[];
  /** Header columns that were recognized (in file order). */
  headers: string[];
};

const TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", ""]);

/** Parse a CSV boolean cell. Empty → default false. Junk → error. */
export function parseImportBool(
  value: string | undefined,
  field: string
): { value: boolean } | { error: string } {
  const v = (value ?? "").trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return { value: true };
  if (FALSE_VALUES.has(v)) return { value: false };
  return { error: `Invalid ${field} value "${value}" (use true or false).` };
}

export function parseImportRows(text: string): ParsedImport {
  const table = parseCsv(text);
  const fileWarnings: string[] = [];

  if (table.length === 0) {
    return { rows: [], fileWarnings: ["The file is empty."], headers: [] };
  }

  const rawHeaders = table[0].map((h) => h.trim().toLowerCase());
  if (rawHeaders.includes("organization_id")) {
    fileWarnings.push(
      "The organization_id column is ignored — assets are always imported into your own organization."
    );
  }
  const known = new Set<string>(IMPORT_COLUMNS);
  const headers = rawHeaders.filter((h) => known.has(h));
  const colIndex = (col: ImportColumn) => rawHeaders.indexOf(col);

  if (colIndex("asset_code") === -1 || colIndex("asset_name") === -1) {
    fileWarnings.push(
      "Missing required columns: asset_code and asset_name are both required."
    );
  }

  const seenCodes = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    // Skip fully blank lines.
    if (cells.every((c) => c.trim() === "")) continue;

    const get = (col: ImportColumn): string | undefined => {
      const idx = colIndex(col);
      return idx === -1 ? undefined : cells[idx];
    };

    const errors: string[] = [];
    const warnings: string[] = [];
    const assetCode = (get("asset_code") ?? "").trim();

    // Asset fields reuse the existing normalizer (code/name required, year, email,
    // cover URL). organization_id is never part of this map.
    const assetResult = normalizeAssetForm({
      asset_code: get("asset_code"),
      asset_name: get("asset_name"),
      category: get("category"),
      make: get("make"),
      model: get("model"),
      serial_number: get("serial_number"),
      year: get("year"),
      support_phone_override: get("support_phone_override"),
      support_email_override: get("support_email_override"),
      cover_image_url: get("cover_image_url"),
    });
    if (!assetResult.value) errors.push(assetResult.error);

    // In-file duplicate asset_code.
    if (assetCode) {
      const prev = seenCodes.get(assetCode.toLowerCase());
      if (prev !== undefined) {
        errors.push(`Duplicate asset_code "${assetCode}" (also on row ${prev}).`);
      } else {
        seenCodes.set(assetCode.toLowerCase(), r);
      }
    }

    // Booleans (empty → false; junk → error).
    const readBool = (col: ImportColumn): boolean => {
      const parsed = parseImportBool(get(col), col);
      if ("error" in parsed) {
        errors.push(parsed.error);
        return false;
      }
      return parsed.value;
    };
    const flags: ImportRowFlags = {
      templateKey: null,
      createQrLink: readBool("create_qr_link"),
      publishAsset: readBool("publish_asset"),
      publishEquipmentPage: readBool("publish_equipment_page"),
    };

    // Template key (unknown → warn, allow import without a template).
    const tplRaw = (get("template_key") ?? "").trim();
    if (tplRaw) {
      if (isTemplateKey(tplRaw)) flags.templateKey = tplRaw;
      else
        warnings.push(
          `Unknown template_key "${tplRaw}" — importing without a template page.`
        );
    }

    rows.push({
      index: r,
      assetCode,
      asset: assetResult.value,
      flags: errors.length === 0 ? flags : undefined,
      errors,
      warnings,
    });
  }

  return { rows, fileWarnings, headers };
}

/** Downloadable template: header row + two example rows (RFC-4180 escaped). */
export function buildImportTemplateCsv(): string {
  const header = IMPORT_COLUMNS.map(csvField).join(",");
  const examples: string[][] = [
    [
      "EXCAVATOR-101",
      "Mini Excavator 101",
      "Mini Excavator",
      "Kubota",
      "U17",
      "",
      "2022",
      "",
      "",
      "",
      "mini_excavator",
      "false",
      "false",
      "false",
    ],
    [
      "METER-204",
      "Insulation Tester 204",
      "Electrical Test Equipment",
      "Fluke",
      "1587",
      "",
      "2023",
      "",
      "",
      "",
      "electrical_test_equipment",
      "false",
      "false",
      "false",
    ],
  ];
  const lines = [header, ...examples.map((row) => row.map(csvField).join(","))];
  return lines.join("\r\n") + "\r\n";
}
