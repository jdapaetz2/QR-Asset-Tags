/**
 * Pure validation/normalization for the asset create/edit form. No I/O and no
 * `organization_id` handling — the org is always derived from the signed-in
 * profile in the server action, never from user input. See lib/assets/actions.ts.
 */

export type AssetInput = {
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  year: number | null;
  support_phone_override: string | null;
  support_email_override: string | null;
  internal_notes: string | null;
};

export type NormalizeResult =
  | { value: AssetInput; error?: undefined }
  | { value?: undefined; error: string };

/** Raw form values as plain strings (e.g. extracted from FormData). */
export type RawAssetForm = Record<string, string | undefined>;

const MIN_YEAR = 1900;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeAssetForm(raw: RawAssetForm): NormalizeResult {
  const asset_code = clean(raw.asset_code);
  const asset_name = clean(raw.asset_name);

  if (!asset_code) return { error: "Asset code is required." };
  if (!asset_name) return { error: "Asset name is required." };

  let year: number | null = null;
  const rawYear = clean(raw.year);
  if (rawYear !== null) {
    const maxYear = new Date().getFullYear() + 1;
    const parsed = Number(rawYear);
    if (!Number.isInteger(parsed) || parsed < MIN_YEAR || parsed > maxYear) {
      return { error: `Year must be a whole number between ${MIN_YEAR} and ${maxYear}.` };
    }
    year = parsed;
  }

  const support_email_override = clean(raw.support_email_override);
  if (support_email_override && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support_email_override)) {
    return { error: "Support email override must be a valid email address." };
  }

  return {
    value: {
      asset_code,
      asset_name,
      category: clean(raw.category),
      make: clean(raw.make),
      model: clean(raw.model),
      serial_number: clean(raw.serial_number),
      year,
      support_phone_override: clean(raw.support_phone_override),
      support_email_override,
      internal_notes: clean(raw.internal_notes),
    },
  };
}
