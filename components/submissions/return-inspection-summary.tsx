import { Badge } from "@/components/ui/badge";
import { accessoryLabel } from "@/lib/inspections/accessories";
import type {
  InspectionField,
  ReturnInspectionData,
} from "@/lib/inspections/types";

/** Whether a submission's data is a V2 guided-inspection payload. */
export function isReturnInspectionV2(data: unknown): data is ReturnInspectionData {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { schema_version?: unknown }).schema_version === 2
  );
}

function formatValue(field: InspectionField, value: unknown): string {
  if (value == null || value === "") return "—";
  switch (field.type) {
    case "pass_fail_na":
      return value === "na" ? "N/A" : String(value).replace(/^\w/, (c) => c.toUpperCase());
    case "yes_no":
      return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
    case "select":
      return field.options?.find((o) => o.value === value)?.label ?? String(value);
    case "numeric_meter":
      return field.unit ? `${value} ${field.unit}` : String(value);
    case "acknowledgement":
      return value === "yes" ? "Confirmed" : "Not confirmed";
    default:
      return String(value);
  }
}

/**
 * Structured admin view for a V2 guided return inspection. Renders from the immutable
 * `template_snapshot` + `answers` (so it always reflects the exact template used), with an attention
 * badge, a damage block, missing accessories, the checklist in template order, and photos grouped by
 * slot. `signedByPath` maps each stored media path to a short-lived signed URL (built by the page).
 */
export function ReturnInspectionSummary({
  data,
  signedByPath,
  hidePhotos = false,
}: {
  data: ReturnInspectionData;
  signedByPath: Map<string, string | null>;
  /** Omit the per-slot photo grid (Phase 3C.5). The session-evidence page renders photos once in its
   * consolidated "Photos by source" gallery, so the per-source summaries there set this to avoid duplication. */
  hidePhotos?: boolean;
}) {
  const template = data.template_snapshot;
  const values = data.answers?.values ?? {};
  const photos = data.answers?.photos ?? {};
  const flags = data.flags ?? { damage_observed: "no", accessories_missing: false };

  const damaged = flags.damage_observed === "yes";
  const missing = flags.accessories_missing === true;
  // Soft photo evidence (Phase 3C.1.1). Prefer the server flags; fall back to snapshot photos for older
  // payloads. One consolidated Evidence note by priority: damage-without-photo → no photos → some missing.
  const f = flags as { damage_photos_missing?: boolean; condition_photos_missing?: boolean };
  const totalPhotoCount = Object.values(photos as Record<string, unknown[]>).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0
  );
  const damagePhotoCount = (photos as Record<string, unknown[]>)?.["damage_photos"]?.length ?? 0;
  const damagePhotosMissing = f.damage_photos_missing === true || (damaged && damagePhotoCount === 0);
  const conditionPhotosMissing = f.condition_photos_missing === true || totalPhotoCount === 0;
  const missingRecommended = data.missing_recommended_photo_slots ?? [];
  const someRecommendedMissing = !conditionPhotosMissing && missingRecommended.length > 0;
  const omissionAck =
    data.photo_omission_acknowledged === true || data.damage_photo_omission_acknowledged === true;
  const evidenceNote = damagePhotosMissing
    ? "Damage reported without photos."
    : conditionPhotosMissing
      ? "No condition photos provided."
      : someRecommendedMissing
        ? "Some recommended photos were not provided."
        : null;
  const heading =
    template.inspection_type === "outbound"
      ? "Outbound inspection"
      : data.audience === "staff"
        ? "Staff return checklist"
        : "Return checklist";

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">{heading}</h2>
          <p className="text-xs text-muted-foreground">
            {template.name} · v{data.template_version}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {damaged ? <Badge tone="danger">Damage reported</Badge> : null}
          {missing ? <Badge tone="warning">Accessories missing</Badge> : null}
          {!damaged && !missing ? <Badge tone="success">No issues flagged</Badge> : null}
        </div>
      </div>

      {/* One concise Evidence summary (Phase 3C.1.1). */}
      {evidenceNote ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Evidence
          </p>
          <p className="mt-0.5">
            <span className="font-medium text-amber-700 dark:text-amber-400">{evidenceNote}</span>{" "}
            <span className="text-muted-foreground">
              {totalPhotoCount} photo{totalPhotoCount === 1 ? "" : "s"} received.
              {omissionAck ? " Submission without photos was acknowledged." : ""}
            </span>
          </p>
        </div>
      ) : null}

      {/* Checklist answers in template order (photos + attestation handled separately). */}
      {template.sections.map((section) => {
        const rows = section.fields.filter(
          (f) => f.type !== "photo_slot" && f.type !== "acknowledgement"
        );
        if (rows.length === 0) return null;
        // Skip a conditional section whose gate wasn't met (no values captured).
        if (section.visible_when && values[section.visible_when.field] !== section.visible_when.equals) {
          return null;
        }
        return (
          <div key={section.id} className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              {rows.map((field) => {
                if (field.type === "accessory_checklist") {
                  const map = (values[field.id] as Record<string, string>) ?? {};
                  return (
                    <div key={field.id} className="contents">
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd className="text-foreground">
                        {(field.items ?? [])
                          // Context labels (Issued/Not issued for outbound; Returned/Missing for return), with
                          // legacy outbound values normalized so old snapshots read correctly (Phase 3C.5).
                          .map((i) => `${i.label}: ${accessoryLabel(map[i.id], template.inspection_type)}`)
                          .join(" · ")}
                      </dd>
                    </div>
                  );
                }
                return (
                  <div key={field.id} className="contents">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="whitespace-pre-line text-foreground">
                      {formatValue(field, values[field.id])}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}

      {/* Photos grouped by slot. */}
      {!hidePhotos && Object.keys(photos).length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Photos
          </p>
          {Object.entries(photos).map(([slotId, list]) => {
            const label = findFieldLabel(template, slotId) ?? slotId;
            return (
              <div key={slotId} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {list.map((photo, i) => {
                    const url = signedByPath.get(photo.path) ?? null;
                    return url ? (
                      <li key={photo.path} className="flex flex-col gap-1">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${label} ${i + 1}`}
                            className="aspect-square w-full rounded-md border object-cover"
                          />
                        </a>
                        <a
                          href={url}
                          download
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                          Download
                        </a>
                      </li>
                    ) : (
                      <li key={photo.path} className="text-xs text-muted-foreground">
                        Photo unavailable
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function findFieldLabel(
  template: ReturnInspectionData["template_snapshot"],
  fieldId: string
): string | null {
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.id === fieldId) return field.label;
    }
  }
  return null;
}
