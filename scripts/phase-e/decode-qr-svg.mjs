/**
 * Engineering Phase E0 — decode the QR symbols in vector SVG artwork (scripts/lib/qr-decode.mjs).
 *
 *   npm.cmd run phase-e:decode-qr -- <file.svg> [more.svg ...] [--json] [--variants]
 *
 * Local files only; nothing is requested over the network. In particular a decoded /t/ URL is never opened: a GET of
 * a /t/ URL records a scan. A file's own <title> and aria-label are printed for comparison, never as proof of where
 * its symbol points. Files are reported by base name, size and SHA-256 — no local paths.
 *
 *   --json      machine-readable output (one object per file)
 *   --variants  add alternative matrix serializations, to compare with hashes recorded by other tools
 *
 * Exit code 0 only when every file holds at least one symbol and every symbol decodes; 1 otherwise; 2 on usage errors.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeSvg, declaredLabels, matrixHashVariants } from "../lib/qr-decode.mjs";

function parseArgs(argv) {
  const files = [];
  let json = false;
  let variants = false;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--variants") variants = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}.`);
    else files.push(arg);
  }
  if (files.length === 0) throw new Error("Name at least one .svg file.");
  return { files, json, variants };
}

async function inspect(file, { variants }) {
  const bytes = await readFile(file);
  const svg = bytes.toString("utf8");
  const symbols = decodeSvg(svg).map((symbol) => {
    const { result } = symbol;
    return {
      label: symbol.label,
      format: symbol.format,
      ok: result.ok,
      ...(result.ok
        ? {
            text: result.text,
            version: result.version,
            ecc: result.ecc,
            mask: result.mask,
            segments: result.segments.map((s) => s.mode),
            warnings: result.warnings,
          }
        : { reason: result.reason }),
      matrixSha256: symbol.matrixSha256,
      ...(variants ? { matrixHashVariants: matrixHashVariants(symbol.modules) } : {}),
    };
  });
  return {
    file: path.basename(file),
    bytes: bytes.length,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    declared: declaredLabels(svg),
    symbols,
  };
}

function printReport(report) {
  console.log(`${report.file}  ${report.bytes} bytes  sha256 ${report.fileSha256}`);
  const { title, ariaLabel } = report.declared;
  if (title || ariaLabel) {
    console.log(`  declared (not evidence): title ${JSON.stringify(title)} · aria-label ${JSON.stringify(ariaLabel)}`);
  }
  if (report.symbols.length === 0) console.log("  NO QR MODULE GRID FOUND — use a phone scan for this artwork");
  report.symbols.forEach((s, i) => {
    const label = s.label ? ` ${s.label}` : "";
    if (s.ok) {
      console.log(`  [${i + 1}]${label}  OK  ${s.text}`);
      console.log(`      V${s.version}-${s.ecc} mask ${s.mask} · ${s.format} · ${s.segments.join("+")} · matrix ${s.matrixSha256}`);
      for (const warning of s.warnings) console.log(`      warning: ${warning}`);
    } else {
      console.log(`  [${i + 1}]${label}  UNDECODABLE  ${s.reason}`);
      console.log(`      ${s.format} · matrix ${s.matrixSha256}`);
    }
    if (s.matrixHashVariants) {
      for (const [name, hash] of Object.entries(s.matrixHashVariants)) console.log(`      ${name.padEnd(30)} ${hash}`);
    }
  });
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error("Usage: npm.cmd run phase-e:decode-qr -- <file.svg> [more.svg ...] [--json] [--variants]");
    process.exitCode = 2;
    return;
  }

  const reports = [];
  for (const file of args.files) reports.push(await inspect(file, args));

  if (args.json) console.log(JSON.stringify(reports, null, 2));
  else reports.forEach(printReport);

  const allDecoded = reports.every((r) => r.symbols.length > 0 && r.symbols.every((s) => s.ok));
  process.exitCode = allDecoded ? 0 : 1;
}

await main();
