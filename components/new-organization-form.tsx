"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { createOrganization, type OrgSettingsState } from "@/lib/org/actions";
import { PLAN_PRESETS, getPlanPreset } from "@/lib/plans/presets";
import { slugify } from "@/lib/org/slug";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Platform-owner form to create a new customer organization. Name auto-fills the
 * slug (until the owner edits the slug), and choosing a plan preset prefills the
 * numeric plan fields — same convenience pattern as PlanSettingsForm. All values are
 * re-validated server-side in `createOrganization`; the owner role is the gate.
 */
export function NewOrganizationForm() {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    createOrganization,
    {}
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const [assetLimit, setAssetLimit] = useState("");
  const [intro, setIntro] = useState("");
  const [renewal, setRenewal] = useState("");
  const [tagCredit, setTagCredit] = useState("");
  const [planName, setPlanName] = useState("");

  function onName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function onPreset(key: string) {
    const preset = getPlanPreset(key);
    if (!preset || key === "custom") {
      setPlanName(preset?.label ?? "");
      return;
    }
    setPlanName(preset.label);
    setAssetLimit(preset.covered_asset_limit?.toString() ?? "");
    setIntro(preset.intro_price_cents?.toString() ?? "");
    setRenewal(preset.renewal_price_cents?.toString() ?? "");
    setTagCredit(preset.tag_credit_cents?.toString() ?? "");
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* Identity */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Organization</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Name<span className="text-destructive"> *</span>
          </span>
          <input
            name="name"
            value={name}
            onChange={(e) => onName(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Slug<span className="text-destructive"> *</span>
          </span>
          <input
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            required
            className={`${inputClass} font-mono`}
          />
          <span className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and single hyphens. Must be unique.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue="active" className={inputClass}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </fieldset>

      {/* Plan */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Plan &amp; coverage</legend>
        <p className="text-xs text-muted-foreground">
          Commercial metadata + covered-asset limit (owner-only). Prices are CAD cents
          (e.g. 240000 = C$2,400). Choose a preset to prefill, or Custom for manual values.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Preset</span>
            <select
              name="plan_key"
              defaultValue="custom"
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
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Billing interval</span>
            <select name="billing_interval" defaultValue="" className={inputClass}>
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
              placeholder="blank = unset (not enforced yet)"
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="video_uploads_enabled" className="size-4" />
          <span className="font-medium">Video uploads enabled</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Plan notes (internal)</span>
          <textarea name="plan_notes" rows={2} className={inputClass} />
        </label>
      </fieldset>

      {/* Support & branding */}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Support &amp; branding</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Support phone</span>
            <input name="support_phone" type="tel" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Support email</span>
            <input name="support_email" type="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Website</span>
            <input
              name="website_url"
              type="url"
              placeholder="https://…"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Primary color</span>
            <input
              name="primary_color"
              placeholder="#1d4ed8"
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Logo URL</span>
            <input
              name="logo_url"
              placeholder="https://… or /demo-assets/…"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Powered-by label</span>
            <input name="powered_by_label" className={inputClass} />
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
