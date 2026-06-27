"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { updateOrgExportSettings, type OrgSettingsState } from "@/lib/org/actions";
import { EXPORT_TYPES, type ExportFlags } from "@/lib/export/types";

/**
 * Platform-owner control for a customer organization's export access. The master
 * toggle gates everything; the per-type toggles choose which CSVs the customer can
 * download. Customer admins never see this form (owner route only).
 */
export function ExportSettingsForm({
  organizationId,
  flags,
}: {
  organizationId: string;
  flags: ExportFlags;
}) {
  const [state, formAction, pending] = useActionState<OrgSettingsState, FormData>(
    updateOrgExportSettings.bind(null, organizationId),
    {}
  );

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
        <legend className="px-1 text-sm font-medium">Customer data exports</legend>
        <p className="text-xs text-muted-foreground">
          Off by default. Enable self-serve CSV exports for this organization when a
          buyer-trust or offboarding need arises. AssetTag QR can always export this
          org&apos;s data regardless of these toggles.
        </p>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="customer_exports_enabled"
            defaultChecked={flags.customer_exports_enabled}
            className="mt-0.5 size-4"
          />
          <span className="font-medium">
            Enable customer exports (master switch)
          </span>
        </label>

        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">
            Export types
          </span>
          {EXPORT_TYPES.map((t) => (
            <label key={t.key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={t.flag}
                defaultChecked={Boolean(flags[t.flag])}
                className="size-4"
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save export settings"}
        </Button>
      </div>
    </form>
  );
}
