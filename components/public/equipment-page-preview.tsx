"use client";

import type { PublicDocument } from "@/lib/public/documents";
import {
  PublicScannerView,
  PublicScannerStickyActions,
  type PublicAsset,
  type PublicOrg,
} from "@/components/public/public-scanner-view";

/**
 * Editor live preview: the SAME shared scanner view as /t/[shortCode], rendered in
 * "preview" mode (all actions inert) inside a phone frame. Driven by live editor field
 * state — it never saves, fetches, logs scans, or submits. The sticky action bar is
 * pinned to the frame (not the viewport).
 */

export type PreviewFields = {
  headline: string;
  quick_start_text: string;
  safety_notes: string;
  fuel_power_notes: string;
  return_notes: string;
  troubleshooting_notes: string;
  emergency_notes: string;
};

export function EquipmentPagePreview({
  org,
  asset,
  fields,
  documents,
  shortCode,
}: {
  org: PublicOrg;
  asset: PublicAsset;
  fields: PreviewFields;
  documents: PublicDocument[];
  shortCode: string | null;
}) {
  const page = {
    headline: fields.headline || null,
    quick_start_text: fields.quick_start_text || null,
    safety_notes: fields.safety_notes || null,
    fuel_power_notes: fields.fuel_power_notes || null,
    return_notes: fields.return_notes || null,
    troubleshooting_notes: fields.troubleshooting_notes || null,
    emergency_notes: fields.emergency_notes || null,
  };

  return (
    <div className="relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-8 border-foreground/10 bg-background shadow-sm">
      <div className="max-h-[640px] overflow-y-auto px-4 pb-24 pt-4">
        <PublicScannerView
          mode="preview"
          shortCode={shortCode ?? ""}
          asset={asset}
          page={page}
          org={org}
          documents={documents}
        />
      </div>
      <PublicScannerStickyActions
        mode="preview"
        shortCode={shortCode ?? ""}
        documents={documents}
        org={org}
      />
    </div>
  );
}
