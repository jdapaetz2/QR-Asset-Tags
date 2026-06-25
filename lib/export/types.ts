/**
 * Export type registry + the per-org gating flags. Pure — no I/O. The flags live on
 * organizations (see migration 0015) and are platform-controlled: customer access is
 * the master `customer_exports_enabled` AND the per-type flag.
 */

export const EXPORT_TYPES = [
  { key: "assets", label: "Assets", flag: "export_assets_enabled" },
  { key: "qr_mapping", label: "QR mapping", flag: "export_qr_mapping_enabled" },
  { key: "documents", label: "Documents", flag: "export_documents_enabled" },
  { key: "submissions", label: "Submissions", flag: "export_submissions_enabled" },
] as const;

export type ExportTypeKey = (typeof EXPORT_TYPES)[number]["key"];

export function isExportTypeKey(value: unknown): value is ExportTypeKey {
  return (
    typeof value === "string" &&
    EXPORT_TYPES.some((t) => t.key === value)
  );
}

export type ExportFlags = {
  customer_exports_enabled: boolean;
  export_assets_enabled: boolean;
  export_qr_mapping_enabled: boolean;
  export_documents_enabled: boolean;
  export_submissions_enabled: boolean;
};

export const EXPORT_FLAG_COLUMNS = [
  "customer_exports_enabled",
  "export_assets_enabled",
  "export_qr_mapping_enabled",
  "export_documents_enabled",
  "export_submissions_enabled",
] as const;

/** A customer may download a type only if the master flag AND the type flag are on. */
export function isExportTypeEnabled(
  flags: ExportFlags,
  key: ExportTypeKey
): boolean {
  if (!flags.customer_exports_enabled) return false;
  const meta = EXPORT_TYPES.find((t) => t.key === key);
  return meta ? Boolean(flags[meta.flag]) : false;
}

/** The export types a customer can currently download (master + per-type). */
export function enabledExportTypes(
  flags: ExportFlags
): { key: ExportTypeKey; label: string }[] {
  if (!flags.customer_exports_enabled) return [];
  return EXPORT_TYPES.filter((t) => flags[t.flag]).map((t) => ({
    key: t.key,
    label: t.label,
  }));
}

/** Coalesce a possibly-partial DB row into a full ExportFlags (defaults false). */
export function toExportFlags(row: Partial<ExportFlags> | null | undefined): ExportFlags {
  return {
    customer_exports_enabled: Boolean(row?.customer_exports_enabled),
    export_assets_enabled: Boolean(row?.export_assets_enabled),
    export_qr_mapping_enabled: Boolean(row?.export_qr_mapping_enabled),
    export_documents_enabled: Boolean(row?.export_documents_enabled),
    export_submissions_enabled: Boolean(row?.export_submissions_enabled),
  };
}

/** Parse the owner export-settings form (unchecked checkbox = absent = false). */
export function parseExportSettingsForm(
  formData: Pick<FormData, "get">
): ExportFlags {
  const on = (name: string) => formData.get(name) != null;
  return {
    customer_exports_enabled: on("customer_exports_enabled"),
    export_assets_enabled: on("export_assets_enabled"),
    export_qr_mapping_enabled: on("export_qr_mapping_enabled"),
    export_documents_enabled: on("export_documents_enabled"),
    export_submissions_enabled: on("export_submissions_enabled"),
  };
}
