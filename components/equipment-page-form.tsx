"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/constants";
import type { EquipmentFormState } from "@/lib/assets/equipment-actions";
import type { EquipmentPageInput } from "@/lib/assets/equipment";

const textareaClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type EquipmentFormAction = (
  state: EquipmentFormState,
  formData: FormData
) => Promise<EquipmentFormState>;

type PageDefaults = Partial<EquipmentPageInput>;

const SECTIONS: { name: keyof EquipmentPageInput; label: string; rows: number }[] = [
  { name: "headline", label: "Headline", rows: 2 },
  { name: "quick_start_text", label: "Quick start", rows: 4 },
  { name: "safety_notes", label: "Safety notes", rows: 4 },
  { name: "fuel_power_notes", label: "Fuel / power notes", rows: 3 },
  { name: "return_notes", label: "Return notes", rows: 3 },
  { name: "troubleshooting_notes", label: "Troubleshooting", rows: 4 },
  { name: "emergency_notes", label: "Emergency / support notes", rows: 3 },
];

export function EquipmentPageForm({
  action,
  page,
  cancelHref,
}: {
  action: EquipmentFormAction;
  page?: PageDefaults;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<EquipmentFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-muted-foreground">
        You are responsible for verifying all equipment instructions before
        publishing. {PRODUCT_NAME} does not generate or validate safety information.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {SECTIONS.map((section) => (
        <label key={section.name} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{section.label}</span>
          <textarea
            name={section.name}
            rows={section.rows}
            defaultValue={(page?.[section.name] as string | null) ?? undefined}
            className={textareaClass}
          />
        </label>
      ))}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={page?.is_published ?? false}
          className="size-4"
        />
        <span className="font-medium">Published</span>
        <span className="text-muted-foreground">
          (visible on the public page once the asset is also public)
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save equipment page"}
        </Button>
        <Link
          href={cancelHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
