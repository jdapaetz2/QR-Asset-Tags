import type {
  InspectionField,
  InspectionSection,
  InspectionTemplate,
} from "@/lib/inspections/types";

/**
 * Inert, read-only preview of a system return-inspection template (Phase 1B). Renders the exact section
 * and field structure a renter would fill, but with NO inputs and NO submit — it never mounts the public
 * form. System templates are code-owned and not editable here.
 */

const TYPE_LABELS: Record<InspectionField["type"], string> = {
  pass_fail_na: "Pass / Fail / N/A",
  yes_no: "Yes / No",
  select: "Choose one",
  short_text: "Short text",
  long_text: "Long text",
  numeric_meter: "Number",
  fuel_charge_level: "Fuel / charge",
  accessory_checklist: "Accessory checklist",
  photo_slot: "Photos",
  acknowledgement: "Attestation",
};

function fieldDetail(field: InspectionField): string {
  if (field.type === "photo_slot") {
    const min = field.photo?.minPhotos ?? 0;
    const max = field.photo?.maxPhotos ?? 0;
    return min > 0 ? `${min}–${max} photos (required)` : `up to ${max} photos (optional)`;
  }
  if (field.type === "select") {
    return (field.options ?? []).map((o) => o.label).join(" · ");
  }
  if (field.type === "accessory_checklist") {
    return (field.items ?? []).map((i) => i.label).join(" · ");
  }
  if (field.type === "numeric_meter" && field.unit) return field.unit;
  return TYPE_LABELS[field.type];
}

function SectionBlock({ section }: { section: InspectionSection }) {
  const conditional = Boolean(section.visible_when);
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{section.title}</p>
        {conditional ? (
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-500">
            Shown when damage is reported
          </span>
        ) : null}
      </div>
      {section.help ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{section.help}</p>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1">
        {section.fields.map((field) => (
          <li key={field.id} className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-foreground">
              {field.label}
              {field.required || (field.photo?.minPhotos ?? 0) > 0 ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </span>
            <span className="text-right text-xs text-muted-foreground">{fieldDetail(field)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReturnTemplatePreview({ template }: { template: InspectionTemplate }) {
  return (
    <div className="mt-3 flex flex-col gap-3" aria-hidden={false}>
      <p className="text-xs text-muted-foreground">
        Read-only preview — this is the checklist renters complete. It is not interactive here.
      </p>
      {template.sections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}
    </div>
  );
}
