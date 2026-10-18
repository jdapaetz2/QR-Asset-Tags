/**
 * Engineering Phase E2A — write the field-level E2C import manifest for each showcase asset.
 *
 *   npm.cmd run phase-e:packs:import [-- --audit=<showcase-audit-production-northridge-*.json>]
 *
 * Output: docs/phase-e/packs/<model_key>/import-manifest.json. Nothing is applied here: E2C reviews and executes the
 * manifests after the operator's approval. Every operation names its target (table and row, or bucket and object
 * path, following the app's own path rules), the value it sets, the current value when known, and a status
 * (READY / REVIEW_REQUIRED / BLOCKED) inherited from the pack. apply.allowed is true only when every operation is
 * READY. New row and object ids are random v4 values generated once and kept on later runs, so the manifest stays
 * stable. Current values come from the read-only E1 audit artifact (gitignored, never re-fetched here); E2C re-audits.
 */
import { hash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
const ARTIFACTS = path.join(REPO, "qa-artifacts", "phase-e");
const STATUS_ORDER = ["READY", "REVIEW_REQUIRED", "BLOCKED"];
const worst = (statuses) => statuses.reduce((a, b) => (STATUS_ORDER.indexOf(b) > STATUS_ORDER.indexOf(a) ? b : a), "READY");

/** Stable JSON (sorted keys) for content hashing. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function latestAudit() {
  if (!existsSync(ARTIFACTS)) return null;
  const files = readdirSync(ARTIFACTS).filter((f) => /^showcase-audit-production-northridge-.*\.json$/.test(f)).sort();
  return files.length ? path.join(ARTIFACTS, files[files.length - 1]) : null;
}

/** Keep previously issued ids; issue a new random one otherwise. */
function idKeeper(previous) {
  const known = new Map((previous?.pinned_ids ?? []).map((p) => [p.key, p.id]));
  const used = [];
  return {
    get(key) {
      const id = known.get(key) ?? randomUUID();
      used.push({ key, id });
      return id;
    },
    list: () => used,
  };
}

const field = (to, current, status, extra = {}) => ({ to, ...(current !== undefined ? { current } : {}), status, ...extra });

export function buildImportManifest({ pack, packDir, media, audit, auditInfo, previous }) {
  const model = pack.models[0];
  const asset = pack.assets[0];
  const org = pack.organization.organization_id;
  const assetId = asset.existing_ids.asset_id;
  const ids = idKeeper(previous);
  const cur = audit?.assets?.find((a) => a.assetCode === asset.asset_code) ?? null;
  const rel = (file) => `docs/phase-e/packs/${packDir}/${file}`;
  const operations = [];

  // Cover photo: upload to public-assets under the app's cover path, then point cover_image_url at it.
  const photoItem = model.photo ? media.items.find((i) => i.source_id === model.photo.source_id) : null;
  const webp = photoItem?.outputs.find((o) => o.file.endsWith(".webp"));
  const coverStatus = model.photo && webp ? model.photo.status : "BLOCKED";
  const coverReason = model.photo && webp ? model.photo.status_reason : (model.review.blockers.find((b) => /photo/i.test(b)) ?? "No licensed exact-model photo.");
  let coverPath = null;
  if (webp) {
    coverPath = `org/${org}/asset/${assetId}/cover/${ids.get("cover")}.webp`;
    operations.push({
      op: "upload",
      key: "cover",
      bucket: "public-assets",
      path: coverPath,
      from: rel(`media/${webp.file}`),
      content_type: "image/webp",
      bytes: webp.bytes,
      sha256: webp.sha256,
      status: coverStatus,
      status_reason: coverReason,
    });
  }

  operations.push({
    op: "update",
    table: "assets",
    match: { id: assetId },
    fields: {
      asset_name: field(asset.asset_name, cur?.assetName, "READY"),
      category: field(asset.category, cur?.category, "READY"),
      make: field(model.manufacturer, cur?.make, "READY"),
      model: field(model.model, cur?.model, "READY"),
      serial_number: field(asset.serial_number, cur?.serialNumber, "READY", { note: "Fictional DEMO- serial." }),
      year: field(asset.year, cur?.year, "READY", { note: "Left empty: the units are fictional." }),
      cover_image_url: coverPath
        ? field({ public_url_of: coverPath }, cur?.cover ?? undefined, coverStatus, { status_reason: coverReason })
        : field(null, cur?.cover ?? undefined, "BLOCKED", { status_reason: `${coverReason} The current cover (rights unknown) is cleared, never kept.` }),
      return_inspection_template_key: field(model.templates.return, cur?.returnTemplateKey ?? null, "READY"),
    },
  });

  const page = asset.page;
  const pageFields = Object.fromEntries(
    Object.entries(page).map(([key, f]) => [key, field(f.text, cur?.page?.filledFields?.[key] !== undefined ? `${cur.page.filledFields[key]} characters` : undefined, f.status, { derived_from: f.derived_from, ...(f.status_reason ? { status_reason: f.status_reason } : {}) })])
  );
  const pageStatus = worst(Object.values(page).map((f) => f.status));
  pageFields.is_published = field(true, cur?.page?.isPublished, pageStatus, { status_reason: "Published only when every field above is READY and the operator approves." });
  operations.push({ op: "upsert", table: "equipment_pages", match: { asset_id: assetId }, fields: pageFields });

  for (const doc of asset.documents ?? []) {
    const docId = ids.get(`document:${doc.document_type}:${doc.title}`);
    if (doc.delivery === "hosted") {
      const storagePath = `org/${org}/asset/${assetId}/documents/${docId}/${docId}.pdf`;
      operations.push({
        op: "upload",
        key: `document:${doc.document_type}`,
        bucket: "documents",
        path: storagePath,
        from: rel(doc.file.file),
        content_type: "application/pdf",
        bytes: doc.file.bytes,
        sha256: doc.file.sha256,
        status: doc.status,
        ...(doc.status_reason ? { status_reason: doc.status_reason } : {}),
      });
      operations.push({
        op: "insert",
        table: "documents",
        row: { id: docId, organization_id: org, asset_id: assetId, title: doc.title, document_type: doc.document_type, url: null, storage_path: storagePath, visibility: doc.visibility, link_status: "unknown" },
        status: doc.status,
        ...(doc.status_reason ? { status_reason: doc.status_reason } : {}),
      });
    } else {
      operations.push({
        op: "insert",
        table: "documents",
        row: { id: docId, organization_id: org, asset_id: assetId, title: doc.title, document_type: doc.document_type, url: doc.url, storage_path: null, visibility: doc.visibility, link_status: "unknown" },
        source_id: doc.source_id,
        status: doc.status,
        ...(doc.status_reason ? { status_reason: doc.status_reason } : {}),
      });
    }
  }

  // Existing documents on the asset: unknown provenance and rights (E0 boundary), so they leave the public page.
  for (const existing of cur?.documents ?? []) {
    operations.push({
      op: "update",
      table: "documents",
      match: { id: existing.id },
      set: { visibility: "private" },
      current: { title: existing.title, document_type: existing.documentType, visibility: existing.visibility, hosted: existing.hosted },
      status: "READY",
      status_reason: "E0 archive boundary (approved 2026-10-16): documents of unknown provenance go non-public at cutover; the showcase uses official links and its own guide.",
    });
  }

  operations.push({
    op: "none",
    table: "qr_links",
    match: { id: asset.existing_ids.qr_link_id },
    status: "READY",
    status_reason: `Protected route ${asset.qr.existing_short_code}: no change of any kind.`,
  });

  const statuses = [];
  for (const op of operations) {
    if (op.fields) for (const f of Object.values(op.fields)) statuses.push(f.status);
    else statuses.push(op.status);
  }
  const summary = Object.fromEntries(STATUS_ORDER.map((s) => [s, statuses.filter((x) => x === s).length]));
  const blockedBy = [...new Set(operations.flatMap((op) => (op.fields ? Object.values(op.fields) : [op])).filter((f) => f.status !== "READY").map((f) => f.status_reason).filter(Boolean))];

  const content = stableStringify({ model, asset });
  return {
    manifest: "e2c-showcase-import",
    format: 1,
    generated_by: "scripts/phase-e/packs/import-manifests.mjs",
    pack: `docs/phase-e/packs/${packDir}/pack.json`,
    content_version: `e2a-${hash("sha256", content).slice(0, 12)}`,
    target: {
      environment: "production",
      organization_id: org,
      asset_id: assetId,
      asset_code: asset.asset_code,
      qr_link_id: asset.existing_ids.qr_link_id,
      short_code: asset.qr.existing_short_code,
    },
    apply: { allowed: summary.REVIEW_REQUIRED === 0 && summary.BLOCKED === 0, blocked_by: blockedBy },
    current_from: auditInfo,
    summary,
    operations,
    pinned_ids: ids.list(),
  };
}

async function main() {
  const auditArg = process.argv.slice(2).find((a) => a.startsWith("--audit="));
  const auditFile = auditArg ? auditArg.slice("--audit=".length) : latestAudit();
  let audit = null;
  let auditInfo = { artifact: null, note: "No audit artifact found; current values omitted. E2C re-audits before applying." };
  if (auditFile && existsSync(auditFile)) {
    const bytes = await readFile(auditFile);
    audit = JSON.parse(bytes.toString("utf8"));
    auditInfo = {
      artifact: path.basename(auditFile),
      sha256: hash("sha256", bytes),
      generated_at: audit.generatedAt,
      note: "Read-only E1 audit of Production (gitignored artifact). Current values are informational; E2C re-audits before applying.",
    };
  }
  for (const entry of readdirSync(PACKS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const packFile = path.join(PACKS, entry, "pack.json");
    if (!existsSync(packFile)) continue;
    const pack = JSON.parse(await readFile(packFile, "utf8"));
    const mediaFile = path.join(PACKS, entry, "media", "media.json");
    const media = existsSync(mediaFile) ? JSON.parse(await readFile(mediaFile, "utf8")) : { items: [] };
    const out = path.join(PACKS, entry, "import-manifest.json");
    const previous = existsSync(out) ? JSON.parse(await readFile(out, "utf8")) : null;
    const manifest = buildImportManifest({ pack, packDir: entry, media, audit, auditInfo, previous });
    await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
    const s = manifest.summary;
    console.log(`${manifest.target.asset_code}: ${manifest.operations.length} operations · ${s.READY} READY · ${s.REVIEW_REQUIRED} REVIEW_REQUIRED · ${s.BLOCKED} BLOCKED · apply ${manifest.apply.allowed ? "allowed" : "not yet"}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
