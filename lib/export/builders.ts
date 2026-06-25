/**
 * Pure CSV builders for the customer/owner data exports. No I/O. Every value goes
 * through `csvField` (RFC-4180 + formula-injection guard). QR URLs are always
 * computed from the configured base URL + the durable short_code — the stored
 * `qr_links.public_url` is never trusted (it can hold stale placeholder hosts).
 */

import { toCsv } from "@/lib/export/csv";
import { buildPublicQrUrl } from "@/lib/qr/url";

export type AssetExportRow = {
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  year: number | null;
  public_status: string;
  archived_at: string | null;
  active_rental_session_id: string | null;
};

export function buildAssetsCsv(rows: AssetExportRow[]): string {
  const headers = [
    "asset_code",
    "asset_name",
    "category",
    "make",
    "model",
    "serial_number",
    "year",
    "public_status",
    "lifecycle",
    "rental_status",
  ];
  return toCsv(
    headers,
    rows.map((r) => [
      r.asset_code,
      r.asset_name,
      r.category ?? "",
      r.make ?? "",
      r.model ?? "",
      r.serial_number ?? "",
      r.year ?? "",
      r.public_status,
      r.archived_at ? "archived" : "active",
      r.active_rental_session_id ? "rented" : "available",
    ])
  );
}

export type QrMappingExportRow = {
  short_code: string;
  status: string;
  asset: { asset_code: string; asset_name: string } | null;
};

export function buildQrMappingCsv(
  rows: QrMappingExportRow[],
  baseUrl: string
): string {
  const headers = ["asset_code", "asset_name", "short_code", "public_url", "qr_status"];
  return toCsv(
    headers,
    rows.map((r) => [
      r.asset?.asset_code ?? "",
      r.asset?.asset_name ?? "",
      r.short_code,
      buildPublicQrUrl(baseUrl, r.short_code),
      r.status,
    ])
  );
}

export type DocumentExportRow = {
  title: string;
  document_type: string;
  visibility: string;
  link_status: string | null;
  storage_path: string | null;
  external_url: string | null;
  asset: { asset_code: string } | null;
};

export function buildDocumentsCsv(rows: DocumentExportRow[]): string {
  const headers = [
    "asset_code",
    "title",
    "document_type",
    "visibility",
    "link_status",
    "source",
    "url_or_path",
  ];
  return toCsv(
    headers,
    rows.map((r) => {
      const hosted = Boolean(r.storage_path);
      return [
        r.asset?.asset_code ?? "",
        r.title,
        r.document_type,
        r.visibility,
        r.link_status ?? "",
        hosted ? "hosted file" : "external link",
        hosted ? r.storage_path : (r.external_url ?? ""),
      ];
    })
  );
}

export type SubmissionExportRowLite = {
  created_at: string;
  form_type: string;
  status: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

export function buildSubmissionsExportCsv(rows: SubmissionExportRowLite[]): string {
  const headers = [
    "created_at",
    "form_type",
    "status",
    "asset_code",
    "asset_name",
    "submitter",
  ];
  return toCsv(
    headers,
    rows.map((r) => {
      const submitter = [
        r.submitted_by_name,
        r.submitted_by_email,
        r.submitted_by_phone,
      ]
        .filter(Boolean)
        .join(" · ");
      return [
        r.created_at,
        r.form_type,
        r.status,
        r.asset?.asset_code ?? "",
        r.asset?.asset_name ?? "",
        submitter,
      ];
    })
  );
}
