/**
 * Engineering Phase E2B — read, write and expand the tracked synthetic showcase dataset (docs/phase-e/showcase/
 * dataset.json, built by scripts/phase-e/showcase/build-dataset.ts). Pure apart from the two file helpers.
 *
 * The tracked file stores every row exactly as the database will hold it, except that an inspection's frozen
 * `template_snapshot` is written once under `templates` and referenced as {"$template": "<kind>:<key>:<version>"};
 * `expandDataset` puts the full snapshot back, so the planner always compares and writes complete rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const SHOWCASE_DIR = path.join("docs", "phase-e", "showcase");
export const DATASET_FILE = path.join(SHOWCASE_DIR, "dataset.json");
export const SCENARIO_FILE = path.join(SHOWCASE_DIR, "scenario.json");
export const MEDIA_FILE = path.join(SHOWCASE_DIR, "media.json");
export const DATASET_TABLES = Object.freeze(["asset_rental_sessions", "asset_acknowledgements", "form_submissions", "scan_events"]);

/** Stable, line-per-row JSON so a rebuild diffs row by row. */
export function serializeDataset(dataset) {
  const lines = ["{"];
  const keys = Object.keys(dataset);
  keys.forEach((key, i) => {
    const comma = i < keys.length - 1 ? "," : "";
    const value = dataset[key];
    if (key === "rows") {
      lines.push(`  "rows": {`);
      const tables = Object.keys(value);
      tables.forEach((table, t) => {
        const rows = value[table];
        lines.push(`    ${JSON.stringify(table)}: [`);
        rows.forEach((row, r) => lines.push(`      ${JSON.stringify(row)}${r < rows.length - 1 ? "," : ""}`));
        lines.push(`    ]${t < tables.length - 1 ? "," : ""}`);
      });
      lines.push(`  }${comma}`);
    } else if (key === "objects" || key === "pinned_ids" || key === "retired_ids") {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, r) => lines.push(`    ${JSON.stringify(item)}${r < value.length - 1 ? "," : ""}`));
      lines.push(`  ]${comma}`);
    } else if (key === "templates") {
      lines.push(`  "templates": {`);
      const refs = Object.keys(value);
      refs.forEach((ref, r) => lines.push(`    ${JSON.stringify(ref)}: ${JSON.stringify(value[ref])}${r < refs.length - 1 ? "," : ""}`));
      lines.push(`  }${comma}`);
    } else {
      const text = JSON.stringify(value, null, 2).split("\n").join("\n  ");
      lines.push(`  ${JSON.stringify(key)}: ${text}${comma}`);
    }
  });
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function readJson(repo, file) {
  return JSON.parse(readFileSync(path.join(repo, file), "utf8"));
}

/** A copy with every template reference replaced by its frozen snapshot; refuses an unknown reference. */
export function expandDataset(dataset) {
  const templates = dataset.templates ?? {};
  const expandRow = (row) => {
    const data = row.submission_data_json;
    const ref = data && typeof data === "object" ? data.template_snapshot?.$template : undefined;
    if (ref === undefined) return { ...row };
    if (!(ref in templates)) throw new Error(`dataset row ${row.id} refers to an unknown template ${ref}`);
    return { ...row, submission_data_json: { ...data, template_snapshot: JSON.parse(JSON.stringify(templates[ref])) } };
  };
  const rows = {};
  for (const table of DATASET_TABLES) rows[table] = (dataset.rows?.[table] ?? []).map(expandRow);
  return { ...dataset, rows };
}

/** id lists per table: what the dataset owns. */
export function ownedIds(dataset) {
  const out = {};
  for (const table of DATASET_TABLES) out[table] = (dataset.rows?.[table] ?? []).map((r) => r.id).sort();
  return out;
}

/** The asset pointers the dataset sets, by asset id. */
export function datasetPointers(dataset) {
  return Object.fromEntries((dataset.assets ?? []).map((a) => [a.asset_id, a.active_rental_session_id ?? null]));
}

/** Ids earlier dataset versions owned and this one no longer carries, by table (a refresh deletes the ones still live). */
export function retiredIds(dataset) {
  const out = Object.fromEntries(DATASET_TABLES.map((t) => [t, []]));
  for (const p of dataset.retired_ids ?? []) if (out[p.table]) out[p.table].push(p.id);
  for (const t of DATASET_TABLES) out[t].sort();
  return out;
}
