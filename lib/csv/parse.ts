/**
 * Minimal RFC-4180 CSV parser. Pure, no dependencies. Handles quoted fields,
 * escaped quotes (""), commas and newlines inside quotes, and CRLF/LF line
 * endings. Returns an array of rows, each an array of cell strings. A trailing
 * newline does not produce an empty final row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      // Swallow CR; the following LF (if any) ends the row.
      if (text[i + 1] === "\n") {
        endRow();
        i += 2;
      } else {
        endRow();
        i += 1;
      }
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  // Flush the final field/row unless the input ended exactly on a row break.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}
