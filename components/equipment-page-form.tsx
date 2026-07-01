"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_NAME } from "@/lib/constants";
import type { EquipmentFormState } from "@/lib/assets/equipment-actions";
import type { EquipmentPageInput } from "@/lib/assets/equipment";
import { equipmentReadiness } from "@/lib/assets/equipment";
import type { PublicDocument } from "@/lib/public/documents";
import type {
  PublicOrg,
  PublicAsset,
} from "@/components/public/public-scanner-view";
import { EquipmentPagePreview } from "@/components/public/equipment-page-preview";

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

const TEXT_KEYS = [
  "headline",
  "quick_start_text",
  "safety_notes",
  "fuel_power_notes",
  "return_notes",
  "troubleshooting_notes",
  "emergency_notes",
] as const;

type TextKey = (typeof TEXT_KEYS)[number];

export function EquipmentPageForm({
  action,
  page,
  cancelHref,
  org,
  asset,
  documents,
  shortCode,
  hasActiveQr,
}: {
  action: EquipmentFormAction;
  page?: PageDefaults;
  cancelHref: string;
  org: PublicOrg;
  asset: PublicAsset & { public_status: string };
  documents: PublicDocument[];
  shortCode: string | null;
  hasActiveQr: boolean;
}) {
  const [state, formAction, pending] = useActionState<EquipmentFormState, FormData>(
    action,
    {}
  );

  // Live, local-only editor state — drives the preview. Nothing is saved until the
  // explicit Save action runs; there is no autosave and no per-keystroke server call.
  const [fields, setFields] = useState<Record<TextKey, string>>(() => {
    const init = {} as Record<TextKey, string>;
    for (const key of TEXT_KEYS) {
      init[key] = (page?.[key] as string | null) ?? "";
    }
    return init;
  });
  const [isPublished, setIsPublished] = useState(page?.is_published ?? false);

  const readiness = equipmentReadiness({
    isPublic: asset.public_status === "public",
    isPublished,
    hasActiveQr,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <form action={formAction} className="flex flex-col gap-4">
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
              value={fields[section.name as TextKey]}
              onChange={(e) =>
                setFields((prev) => ({
                  ...prev,
                  [section.name]: e.target.value,
                }))
              }
              className={textareaClass}
            />
          </label>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_published"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
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

      {/* Live preview */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Live preview</span>
            <Badge tone={isPublished ? "success" : "neutral"}>
              {isPublished ? "Published" : "Draft"}
            </Badge>
          </div>
          {readiness.ready && shortCode ? (
            <a
              href={`/t/${shortCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Open live public page ↗
            </a>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Preview shows your unsaved local edits. The public page updates only after you
          Save.
        </p>

        {!readiness.ready ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
            Not live for renters yet: {readiness.issues.join(" · ")}.
          </p>
        ) : null}

        <EquipmentPagePreview
          org={org}
          asset={asset}
          fields={fields}
          documents={documents}
          shortCode={shortCode}
        />
      </div>
    </div>
  );
}
