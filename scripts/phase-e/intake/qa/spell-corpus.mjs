/**
 * Engineering Phase E3 QA: collect every customer-visible string in an intake workbook (labels, hints, START HERE,
 * lists, banners) into a plain-text file, so Word's spelling check (qa/word-checks.ps1) can read it.
 *
 *   node scripts/phase-e/intake/qa/spell-corpus.mjs <workbook.xlsx> <out.txt>
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const [file, out] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(await readFile(file));
const seen = new Set();
const lines = [];
wb.eachSheet((ws) => {
  lines.push(ws.name);
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      const v = typeof cell.value === "object" && cell.value?.richText ? cell.value.richText.map((p) => p.text).join("") : cell.value;
      if (typeof v === "string" && v.trim() && !seen.has(v)) {
        seen.add(v);
        lines.push(v);
      }
    }),
  );
});
await writeFile(out, `${lines.join("\r\n")}\r\n`, "utf8");
console.log(`${lines.length} strings -> ${out}`);
