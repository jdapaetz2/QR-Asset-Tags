/**
 * Pure validation/normalization for the owner plan-settings form. No I/O and no
 * organization_id handling (the owner action supplies the org id from the route). All
 * fields are platform-owner-controlled commercial metadata.
 */

import { isPlanKey } from "@/lib/plans/presets";
import { parseCadInputToCents } from "@/lib/plans/money";

export type PlanSettings = {
  plan_key: string | null;
  plan_name: string | null;
  billing_interval: string | null;
  asset_limit: number | null;
  intro_price_cents: number | null;
  renewal_price_cents: number | null;
  tag_credit_cents: number | null;
  storage_limit_mb: number | null;
  video_uploads_enabled: boolean;
  plan_notes: string | null;
};

export type PlanSettingsResult =
  | { value: PlanSettings; error?: undefined }
  | { value?: undefined; error: string };

export type RawPlanForm = Record<string, string | undefined>;

const BILLING_INTERVALS = ["monthly", "annual"];

function cleanText(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Parse a non-negative integer, or null when blank. Returns undefined when invalid. */
function nonNegInt(value: string | undefined): number | null | undefined {
  const t = cleanText(value);
  if (t === null) return null;
  if (!/^\d+$/.test(t)) return undefined;
  return Number(t);
}

export function normalizePlanForm(raw: RawPlanForm): PlanSettingsResult {
  const plan_key = cleanText(raw.plan_key);
  if (plan_key !== null && !isPlanKey(plan_key)) {
    return { error: "Unknown plan." };
  }

  const billing_interval = cleanText(raw.billing_interval);
  if (billing_interval !== null && !BILLING_INTERVALS.includes(billing_interval)) {
    return { error: "Billing interval must be monthly or annual." };
  }

  // Plain integer counts (not money).
  const counts: [keyof PlanSettings, string | undefined, string][] = [
    ["asset_limit", raw.asset_limit, "Covered asset limit"],
    ["storage_limit_mb", raw.storage_limit_mb, "Storage limit"],
  ];
  const nums: Record<string, number | null> = {};
  for (const [key, rawValue, label] of counts) {
    const parsed = nonNegInt(rawValue);
    if (parsed === undefined) {
      return { error: `${label} must be a whole number (0 or more), or blank.` };
    }
    nums[key] = parsed;
  }

  // Money fields: entered in CAD dollars, stored in cents. Blank → null.
  const money: [keyof PlanSettings, string | undefined, string][] = [
    ["intro_price_cents", raw.intro_price_cents, "Intro / year-one price"],
    ["renewal_price_cents", raw.renewal_price_cents, "Renewal price"],
    ["tag_credit_cents", raw.tag_credit_cents, "Tag credit"],
  ];
  for (const [key, rawValue, label] of money) {
    const parsed = parseCadInputToCents(rawValue);
    if (parsed === undefined) {
      return {
        error: `${label} must be a valid CAD dollar amount (e.g. 4500), or blank.`,
      };
    }
    nums[key] = parsed;
  }

  return {
    value: {
      plan_key,
      plan_name: cleanText(raw.plan_name),
      billing_interval,
      asset_limit: nums.asset_limit,
      intro_price_cents: nums.intro_price_cents,
      renewal_price_cents: nums.renewal_price_cents,
      tag_credit_cents: nums.tag_credit_cents,
      storage_limit_mb: nums.storage_limit_mb,
      video_uploads_enabled: raw.video_uploads_enabled != null,
      plan_notes: cleanText(raw.plan_notes),
    },
  };
}
