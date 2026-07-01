/**
 * Pure normalization for the equipment-page editor form. No I/O. Never reads
 * `organization_id` or `asset_id` — those are derived server-side from the
 * authenticated profile and the route. See lib/assets/equipment-actions.ts.
 */

export type EquipmentPageInput = {
  headline: string | null;
  quick_start_text: string | null;
  safety_notes: string | null;
  fuel_power_notes: string | null;
  return_notes: string | null;
  troubleshooting_notes: string | null;
  emergency_notes: string | null;
  is_published: boolean;
};

export type RawEquipmentForm = Record<string, string | undefined>;

export type EquipmentReadiness = { ready: boolean; issues: string[] };

/**
 * Whether an asset's public scan page is live-ready, from the editor's point of view.
 * Pure mirror of the asset-readiness rules in editor-shaped inputs so the "Open live
 * public page" gating + warning copy is testable. The page is live only when the asset
 * is public, its equipment page is published, and an active QR link exists.
 */
export function equipmentReadiness(input: {
  isPublic: boolean;
  isPublished: boolean;
  hasActiveQr: boolean;
}): EquipmentReadiness {
  const issues: string[] = [];
  if (!input.isPublic) issues.push("Asset is not public");
  if (!input.isPublished) issues.push("Equipment page is not published");
  if (!input.hasActiveQr) issues.push("No active QR link");
  return { ready: issues.length === 0, issues };
}

export const EQUIPMENT_TEXT_FIELDS = [
  "headline",
  "quick_start_text",
  "safety_notes",
  "fuel_power_notes",
  "return_notes",
  "troubleshooting_notes",
  "emergency_notes",
] as const;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Checkbox values arrive as "on"/"true" when checked, absent otherwise. */
export function toBool(value: string | undefined): boolean {
  return value === "on" || value === "true";
}

export function normalizeEquipmentPageForm(raw: RawEquipmentForm): {
  value: EquipmentPageInput;
} {
  return {
    value: {
      headline: clean(raw.headline),
      quick_start_text: clean(raw.quick_start_text),
      safety_notes: clean(raw.safety_notes),
      fuel_power_notes: clean(raw.fuel_power_notes),
      return_notes: clean(raw.return_notes),
      troubleshooting_notes: clean(raw.troubleshooting_notes),
      emergency_notes: clean(raw.emergency_notes),
      is_published: toBool(raw.is_published),
    },
  };
}
