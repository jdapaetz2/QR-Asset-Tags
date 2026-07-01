"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { updateOrgPlan, type OrgSettingsState } from "@/lib/org/actions";
import { PLAN_PRESETS, getPlanPreset } from "@/lib/plans/presets";
import type { PlanSettings } from "@/lib/plans/settings";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Platform-owner control for a customer organization's plan / commercial fields.
 * Choosing a preset prefills the numeric fields (client-side convenience); the owner
 * can then edit. Customer admins never see this form; the 0016 DB trigger also blocks
 * non-owner writes to these columns.
 */
export function PlanSettingsForm({
  organizationId,
  plan,
}: {
  organizationId: string;
  plan: PlanSettings;
}) {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    updateOrgPlan.bind(null, organizationId),
    {}
  );

  const [assetLimit, setAssetLimit] = useState(plan.asset_limit?.toString() ?? "");
  const [intro, setIntro] = useState(plan.intro_price_cents?.toString() ?? "");
  const [renewal, setRenewal] = useState(plan.renewal_price_cents?.toString() ?? "");
  const [tagCredit, setTagCredit] = useState(plan.tag_credit_cents?.toString() ?? "");

  function onPreset(key: string) {
    const preset = getPlanPreset(key);
    if (!preset || key === "custom") return;
    setAssetLimit(preset.covered_asset_limit?.toString() ?? "");
    setIntro(preset.intro_price_cents?.toString() ?? "");
    setRenewal(preset.renewal_price_cents?.toString() ?? "");
    setTagCredit(preset.tag_credit_cents?.toString() ?? "");
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Plan &amp; coverage</legend>
        <p className="text-xs text-muted-foreground">
          Commercial metadata + covered-asset limit. Owner-only. Prices are CAD cents
          (e.g. 240000 = C$2,400). Tag credit is metadata, not billing.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Preset</span>
            <select
              name="plan_key"
              defaultValue={plan.plan_key ?? "custom"}
              onChange={(e) => onPreset(e.target.value)}
              className={inputClass}
            >
              {PLAN_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Plan name</span>
            <input
              name="plan_name"
              defaultValue={plan.plan_name ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Billing interval</span>
            <select
              name="billing_interval"
              defaultValue={plan.billing_interval ?? ""}
              className={inputClass}
            >
              <option value="">—</option>
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Covered asset limit</span>
            <input
              name="asset_limit"
              inputMode="numeric"
              value={assetLimit}
              onChange={(e) => setAssetLimit(e.target.value)}
              placeholder="blank = unlimited"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Intro / year-one price (cents)</span>
            <input
              name="intro_price_cents"
              inputMode="numeric"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Renewal price (cents)</span>
            <input
              name="renewal_price_cents"
              inputMode="numeric"
              value={renewal}
              onChange={(e) => setRenewal(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tag credit (cents)</span>
            <input
              name="tag_credit_cents"
              inputMode="numeric"
              value={tagCredit}
              onChange={(e) => setTagCredit(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Storage limit (MB)</span>
            <input
              name="storage_limit_mb"
              inputMode="numeric"
              defaultValue={plan.storage_limit_mb?.toString() ?? ""}
              placeholder="blank = unset (not enforced yet)"
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="video_uploads_enabled"
            defaultChecked={plan.video_uploads_enabled}
            className="size-4"
          />
          <span className="font-medium">Video uploads enabled</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Plan notes</span>
          <textarea
            name="plan_notes"
            rows={2}
            defaultValue={plan.plan_notes ?? ""}
            className={inputClass}
          />
        </label>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save plan settings"}
        </Button>
      </div>
    </form>
  );
}
