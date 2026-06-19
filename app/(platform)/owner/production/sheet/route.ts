import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildQrSvg, normalizeErrorCorrection } from "@/lib/qr/svg";
import {
  assetReadiness,
  isProductionBaseUrl,
  QR_STYLE_PRESET,
} from "@/lib/qr/production";
import { getProductionAssets } from "@/lib/qr/production-data";
import type { ProductionAssetRow } from "@/lib/qr/production-csv";

// Per-request, auth-scoped HTML — never cache.
export const dynamic = "force-dynamic";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readiness(row: ProductionAssetRow) {
  return assetReadiness({
    public_status: row.asset_public_status,
    qrStatus: row.qr_status === "missing" ? null : row.qr_status,
    pageStatus: row.equipment_page_published ? "published" : "missing",
  });
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 14px/1.5 system-ui, sans-serif; color: #111; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 16px; }
  .warn { border: 1px solid #d97706; background: #fffbeb; color: #92400e; padding: 10px 12px; border-radius: 8px; margin: 0 0 16px; font-size: 13px; }
  .toolbar { margin: 0 0 20px; }
  button { font: inherit; padding: 6px 14px; border: 1px solid #999; border-radius: 6px; background: #f3f4f6; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; display: flex; gap: 14px; break-inside: avoid; }
  .qr { width: 140px; height: 140px; flex: 0 0 auto; }
  .qr svg { width: 100%; height: 100%; }
  .meta { font-size: 12px; min-width: 0; }
  .meta .code { font-size: 15px; font-weight: 600; }
  .meta .name { color: #374151; margin-bottom: 6px; }
  .url { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; color: #1f2937; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0 0; }
  dt { color: #6b7280; }
  dd { margin: 0; }
  .ready { color: #166534; font-weight: 600; }
  .issues { color: #b91c1c; }
  .noqr { color: #b91c1c; font-weight: 600; }
  @media print {
    body { padding: 0; }
    .toolbar { display: none; }
    .grid { gap: 10px; }
  }
`;

// Printable production sheet (standalone HTML). AssetTag QR platform admin only.
export async function GET(request: NextRequest) {
  await requireRole(ROLES.PLATFORM_OWNER);

  const sp = request.nextUrl.searchParams;
  const orgId = sp.get("org") ?? "";
  const selectIds = sp.getAll("select");
  if (!orgId) return new Response("Missing org", { status: 400 });
  if (selectIds.length === 0) {
    return new Response("Select at least one asset", { status: 400 });
  }

  const ec = normalizeErrorCorrection(sp.get("ec"));
  const size = sp.get("size") ?? "2.0";
  const tagSize = sp.get("tag_size") ?? "";
  const material = sp.get("material") ?? "";
  const mounting = sp.get("mounting_method") ?? "";
  const notes = sp.get("production_notes") ?? "";

  const baseIsProd = isProductionBaseUrl(publicEnv.siteUrl);

  const supabase = await createClient();
  const { orgName, rows } = await getProductionAssets(supabase, orgId, selectIds);

  const cards = await Promise.all(
    rows.map(async (row) => {
      const rdy = readiness(row);
      const qr = row.short_url
        ? `<div class="qr">${await buildQrSvg(row.short_url, { ec, size })}</div>`
        : `<div class="qr"></div>`;
      const urlLine = row.short_url
        ? `<div class="url">${esc(row.short_url)}</div>`
        : `<div class="noqr">No QR link — not ready</div>`;
      const readyLine = rdy.ready
        ? `<dd class="ready">Ready</dd>`
        : `<dd class="issues">${esc(rdy.issues.join(", "))}</dd>`;
      return `
        <div class="card">
          ${qr}
          <div class="meta">
            <div class="code">${esc(row.asset_code)}</div>
            <div class="name">${esc(row.asset_name)}</div>
            ${urlLine}
            <dl>
              <dt>QR preset</dt><dd>${esc(QR_STYLE_PRESET)}</dd>
              <dt>Error correction</dt><dd>${esc(ec)}</dd>
              <dt>Tag size</dt><dd>${esc(tagSize || "—")}</dd>
              <dt>Material</dt><dd>${esc(material || "—")}</dd>
              <dt>Mounting</dt><dd>${esc(mounting || "—")}</dd>
              <dt>Readiness</dt>${readyLine}
            </dl>
            ${notes ? `<p style="margin:8px 0 0;color:#374151">Notes: ${esc(notes)}</p>` : ""}
          </div>
        </div>`;
    })
  );

  const warning = baseIsProd
    ? ""
    : `<p class="warn">This base URL is not suitable for physical production tags unless intentional.</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Production sheet — ${esc(orgName)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <h1>Production sheet — ${esc(orgName)}</h1>
  <p class="sub">${rows.length} asset${rows.length === 1 ? "" : "s"} · base URL ${esc(publicEnv.siteUrl)}</p>
  ${warning}
  <div class="toolbar"><button onclick="window.print()">Print</button></div>
  <div class="grid">${cards.join("")}</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
