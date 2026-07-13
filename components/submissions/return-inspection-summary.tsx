import { Badge } from "@/components/ui/badge";
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
}: {
  data: ReturnInspectionData;
  signedByPath: Map<string, string | null>;
}) {
  const template = data.template_snapshot;
  const values = data.answers?.values ?? {};
  const photos = data.answers?.photos ?? {};
  const flags = data.flags ?? { damage_observed: "no", accessories_missing: false };

  const damaged = flags.damage_observed === "yes";
  const missing = flags.accessories_missing === true;

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Return inspection</h2>
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
                          .map((i) => `${i.label}: ${map[i.id] ?? "—"}`)
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
      {Object.keys(photos).length > 0 ? (
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
