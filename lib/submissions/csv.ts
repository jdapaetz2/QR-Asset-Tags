/**
 * Pure CSV builder for submission export. No I/O. Values are RFC-4180 escaped and
 * guarded against spreadsheet formula injection. Used by the export route handler.
 */

export type SubmissionExportRow = {
  id: string;
  created_at: string;
  form_type: string;
  status: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  submission_data_json: unknown;
  media_urls: unknown;
  asset: { asset_code: string; asset_name: string } | null;
};

export const SUBMISSION_CSV_HEADERS = [
  "created_at",
  "form_type",
  "status",
  "asset_code",
  "asset_name",
  "submitted_by_name",
  "submitted_by_email",
  "submitted_by_phone",
  "urgency",
  "preferred_contact_method",
  "description",
  "fuel_or_charge_level",
  "cleaned",
  "accessories_returned",
  "damage_observed",
  "media_count",
  "submission_id",
] as const;

/**
 * Prefix values that start with a formula trigger so spreadsheet apps treat them
 * as text, not formulas. Then apply RFC-4180 quoting.
 */
export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/["\n\r,]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function pick(data: Record<string, unknown>, key: string): unknown {
  const v = data[key];
  return v === null || v === undefined ? "" : v;
}

export function buildSubmissionsCsv(rows: SubmissionExportRow[]): string {
  const lines: string[] = [
    SUBMISSION_CSV_HEADERS.map(csvField).join(","),
  ];

  for (const row of rows) {
    const data = asRecord(row.submission_data_json);
    const mediaCount = Array.isArray(row.media_urls) ? row.media_urls.length : 0;
    const description =
      pick(data, "description") || pick(data, "condition_notes") || "";

    const cols = [
      row.created_at,
      row.form_type,
      row.status,
      row.asset?.asset_code ?? "",
      row.asset?.asset_name ?? "",
      row.submitted_by_name ?? "",
      row.submitted_by_email ?? "",
      row.submitted_by_phone ?? "",
      pick(data, "urgency"),
      pick(data, "preferred_contact_method"),
      description,
      pick(data, "fuel_or_charge_level"),
      pick(data, "cleaned"),
      pick(data, "accessories_returned"),
      pick(data, "damage_observed"),
      mediaCount,
      row.id,
    ];

    lines.push(cols.map(csvField).join(","));
  }

  // RFC-4180 CRLF line endings, with a trailing newline.
  return lines.join("\r\n") + "\r\n";
}
