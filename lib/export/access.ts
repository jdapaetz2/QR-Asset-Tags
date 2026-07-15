/**
 * The single source of truth for whether the CUSTOMER "Data export" capability is available to the current viewer
 * (Wave 3N.1). Pure — no I/O. Two conditions, both required, and it fails CLOSED:
 *
 *   1. the viewer is a `customer_admin` (never `customer_staff`, never a platform owner — owners use the owner-side
 *      org export, which is a separate capability), AND
 *   2. the organization's platform-owner-controlled master flag `customer_exports_enabled` is on.
 *
 * Used to gate the export nav link, the `/dashboard/export` page, the download route, the dashboard card, and the
 * Settings "Data export" item — so navigation visibility and route authorization can never disagree. The per-TYPE
 * flags (`export_*_enabled`) are still checked at download time by `isExportTypeEnabled`.
 */

import { ROLES, type Role } from "@/lib/auth/roles";
import type { ExportFlags } from "@/lib/export/types";

export function canCustomerUseExport(input: { role: Role; flags: ExportFlags }): boolean {
  return input.role === ROLES.CUSTOMER_ADMIN && input.flags.customer_exports_enabled === true;
}
