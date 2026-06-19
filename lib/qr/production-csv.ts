/**
 * Pure CSV builder for the platform-admin tag-production export. No I/O.
 *
 * One row per selected asset; the batch-level tag metadata (`ProductionMeta`) is
 * repeated on every row. `short_url` is always the computed scan URL — never the
 * stored `qr_links.public_url`. Reuses `csvField` (RFC-4180 quoting + spreadsheet
 * formula-injection guard) from the submissions exporter.
 */

import { csvField } from "@/lib/submissions/csv";

export const PRODUCTION_CSV_HEADERS = [
  "organization_name",
  "asset_code",
  "asset_name",
  "category",
  "make",
  "model",
  "short_code",
  "short_url",
  "qr_status",
  "asset_public_status",
  "equipment_page_published",
  "manual_available",
  "startup_guide_available",
  "tag_size",
  "material",
  "mounting_method",
  "qr_style_preset",
  "error_correction_level",
  "logo_enabled",
  "production_notes",
] as const;

/** Per-asset production data. `short_url` is precomputed by the caller. */
export type ProductionAssetRow = {
  organization_name: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  short_code: string | null;
  short_url: string | null;
  /** 'active' | 'disabled' | 'missing'. */
  qr_status: string;
  asset_public_status: string;
  equipment_page_published: boolean;
  manual_available: boolean;
  startup_guide_available: boolean;
};

/** Batch-level tag metadata — the same values apply to the whole selection. */
export type ProductionMeta = {
  tag_size: string;
  material: string;
  mounting_method: string;
  qr_style_preset: string;
  error_correction_level: string;
  logo_enabled: string;
  production_notes: string;
};

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function buildProductionCsv(
  rows: ProductionAssetRow[],
  meta: ProductionMeta
): string {
  const lines: string[] = [PRODUCTION_CSV_HEADERS.map(csvField).join(",")];

  for (const row of rows) {
    const cols = [
      row.organization_name,
      row.asset_code,
      row.asset_name,
      row.category ?? "",
      row.make ?? "",
      row.model ?? "",
      row.short_code ?? "",
      row.short_url ?? "",
      row.qr_status,
      row.asset_public_status,
      yesNo(row.equipment_page_published),
      yesNo(row.manual_available),
      yesNo(row.startup_guide_available),
      meta.tag_size,
      meta.material,
      meta.mounting_method,
      meta.qr_style_preset,
      meta.error_correction_level,
      meta.logo_enabled,
      meta.production_notes,
    ];
    lines.push(cols.map(csvField).join(","));
  }

  // RFC-4180 CRLF line endings, with a trailing newline.
  return lines.join("\r\n") + "\r\n";
}
