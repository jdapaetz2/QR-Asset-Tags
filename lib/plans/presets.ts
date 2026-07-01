/**
 * Internal plan presets for the platform admin. Prices are CAD cents; these are
 * commercial metadata only (no billing/Stripe). "custom" carries no preset numbers —
 * the owner types values. Pure, no I/O.
 */

export type PlanPreset = {
  key: string;
  label: string;
  covered_asset_limit: number | null;
  intro_price_cents: number | null;
  renewal_price_cents: number | null;
  tag_credit_cents: number | null;
};

export const PLAN_PRESETS: PlanPreset[] = [
  {
    key: "starter",
    label: "Starter Yard",
    covered_asset_limit: 25,
    intro_price_cents: 150000,
    renewal_price_cents: 240000,
    tag_credit_cents: 25000,
  },
  {
    key: "standard",
    label: "Standard Yard",
    covered_asset_limit: 100,
    intro_price_cents: 450000,
    renewal_price_cents: 650000,
    tag_credit_cents: 75000,
  },
  {
    key: "pro",
    label: "Pro Yard",
    covered_asset_limit: 250,
    intro_price_cents: 850000,
    renewal_price_cents: 1200000,
    tag_credit_cents: 150000,
  },
  {
    key: "scale",
    label: "Scale Yard",
    covered_asset_limit: 500,
    intro_price_cents: 1400000,
    renewal_price_cents: 2000000,
    tag_credit_cents: 250000,
  },
  {
    key: "custom",
    label: "Custom",
    covered_asset_limit: null,
    intro_price_cents: null,
    renewal_price_cents: null,
    tag_credit_cents: null,
  },
];

export const PLAN_KEYS = PLAN_PRESETS.map((p) => p.key);

export function isPlanKey(value: unknown): value is string {
  return typeof value === "string" && PLAN_KEYS.includes(value);
}

export function getPlanPreset(key: string): PlanPreset | null {
  return PLAN_PRESETS.find((p) => p.key === key) ?? null;
}

/** Format CAD cents as a display string, e.g. 240000 → "C$2,400". */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `C$${Math.round(cents / 100).toLocaleString("en-CA")}`;
}
