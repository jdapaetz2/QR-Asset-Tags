"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { TemplateFormState } from "@/lib/onboarding/org-templates-actions";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

const SAFETY_WARNING =
  "Templates are starter content. Rental company staff must verify equipment-specific instructions before publishing.";

type TemplateFormAction = (
  state: TemplateFormState,
  formData: FormData
) => Promise<TemplateFormState>;

export type TemplateDefaults = {
  key: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  headline: string | null;
  quick_start_text: string | null;
  safety_notes: string | null;
  fuel_power_notes: string | null;
  return_notes: string | null;
  troubleshooting_notes: string | null;
  emergency_notes: string | null;
  is_active: boolean;
};

function Area({
  name,
  label,
  defaultValue,
  rows = 3,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      />
    </label>
  );
}

export function TemplateForm({
  action,
  template,
  submitLabel,
}: {
  action: TemplateFormAction;
  template: TemplateDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
        {SAFETY_WARNING}
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Name<span className="text-destructive"> *</span>
          </span>
          <input
            name="name"
            defaultValue={template.name ?? ""}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Template key<span className="text-destructive"> *</span>
          </span>
          <input
            name="key"
            defaultValue={template.key ?? ""}
            required
            placeholder="electrical_meter_kit"
            className={`${inputClass} font-mono`}
          />
          <span className="text-xs text-muted-foreground">
            Use this in the import CSV. 2–40 lowercase letters, numbers, or
            underscores. Reusing a built-in key overrides it for your organization.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Category</span>
          <input
            name="category"
            defaultValue={template.category ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Description</span>
          <input
            name="description"
            defaultValue={template.description ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <Area name="headline" label="Headline" defaultValue={template.headline} rows={2} />
      <Area name="quick_start_text" label="Quick start" defaultValue={template.quick_start_text} />
      <Area name="safety_notes" label="Safety" defaultValue={template.safety_notes} />
      <Area name="fuel_power_notes" label="Fuel / power" defaultValue={template.fuel_power_notes} />
      <Area name="return_notes" label="Return" defaultValue={template.return_notes} />
      <Area
        name="troubleshooting_notes"
        label="Troubleshooting"
        defaultValue={template.troubleshooting_notes}
      />
      <Area name="emergency_notes" label="Emergency" defaultValue={template.emergency_notes} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={template.is_active}
          className="size-4"
        />
        <span>Active (available for import)</span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/dashboard/templates"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
