/**
 * Generic CSV helpers for data exports. No I/O. Values are RFC-4180 escaped and
 * guarded against spreadsheet formula injection. Shared by every export builder.
 */

/**
 * Prefix values that start with a formula trigger so spreadsheet apps treat them as
 * text, not formulas; then apply RFC-4180 quoting. Mirrors lib/submissions/csv.ts.
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

/** Build a CSV string from headers + rows (RFC-4180 CRLF, trailing newline). */
export function toCsv(
  headers: readonly string[],
  rows: readonly unknown[][]
): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
