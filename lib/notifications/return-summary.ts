/**
 * Engineering Phase D1 — one reader for every shipped return-checklist shape. Pure, no I/O.
 *
 * The notification brief must not care which historical JSON a row was written in, so every shape is reduced here:
 *
 *   - V1 flat checklist (no `schema_version`): top-level `damage_observed` / `accessories_returned`.
 *   - V2 `2026-07-1` as first shipped: damage photos required, no additional-photos section.
 *   - V2 `2026-07-1` with the additional-photos section (same version string).
 *   - V2 `2026-07-2` before the 3C.1.1 hotfix: `flags.damage_photos_missing`.
 *   - V2 `2026-07-2` after the hotfix: adds `flags.condition_photos_missing` and `missing_recommended_photo_slots`.
 *   - Custom organization templates: integer versions, org-defined field ids, and pass/fail checks that may be
 *     optional.
 *
 * Shapes are detected by `schema_version` and key presence — never by version string, which is not unique. Absent
 * optional keys mean "not reported" and are never inferred. Answers stored for fields hidden by `visible_when` are
 * ignored: only visible sections and fields are read, using the same helpers as server validation.
 */
import { fieldRequired, visibleFields, visibleSections } from "@/lib/inspections/validate";
import type { InspectionTemplate } from "@/lib/inspections/types";

type Values = Record<string, string | number | Record<string, string>>;

/** The conditional damage photo slot shared by every system template. */
export const DAMAGE_PHOTOS_SLOT = "damage_photos";

/**
 * System-template yes/no fields whose "no" means the equipment did not start or operate. A custom template's own
 * operating question is displayed in Mulemark but not detected here (design §5.3).
 */
export const OPERATING_FIELD_IDS: ReadonlySet<string> = new Set(["starts_operates", "powers_on"]);

export type ReturnChecklistSummary = {
  shape: "v1" | "v2";
  /** Canonical damage flag. */
  damage: boolean;
  damageLocation: string | null;
  /** The template's own option label (system templates store `severe`, shown as "Severe"). Display only. */
  damageSeverityLabel: string | null;
  damageDescription: string | null;
  /** Labels of visible pass/fail checks answered `fail` that are required (or whose `required_when` holds). */
  failedRequired: string[];
  /** Labels of visible pass/fail checks answered `fail` that are optional — custom templates only. */
  failedOptional: string[];
  /** Labels of visible system operating questions answered `no`. */
  notOperating: string[];
  /** Canonical missing-accessory flag. */
  accessoriesMissing: boolean;
  missingAccessoryLabels: string[];
  damagePhotosMissing: boolean;
  conditionPhotosMissing: boolean;
  missingRecommendedPhotos: boolean;
  missingRecommendedSlotLabels: string[];
  /** Photo counts by slot: damage slot first, then template order. */
  slotCounts: { label: string; count: number }[];
  /** Stored photo paths in the same order. Server-only metadata — never rendered. */
  slotPaths: string[];
  /** The same paths with the slot each came from (D4 preview ranking). Server-only metadata — never rendered. */
  slotPathEntries: { slotId: string; label: string; path: string }[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isTemplate(value: unknown): value is InspectionTemplate {
  const candidate = asRecord(value);
  return (
    Array.isArray(candidate.sections) &&
    candidate.sections.every((section) => Array.isArray(asRecord(section).fields))
  );
}

function emptySummary(shape: ReturnChecklistSummary["shape"]): ReturnChecklistSummary {
  return {
    shape,
    damage: false,
    damageLocation: null,
    damageSeverityLabel: null,
    damageDescription: null,
    failedRequired: [],
    failedOptional: [],
    notOperating: [],
    accessoriesMissing: false,
    missingAccessoryLabels: [],
    damagePhotosMissing: false,
    conditionPhotosMissing: false,
    missingRecommendedPhotos: false,
    missingRecommendedSlotLabels: [],
    slotCounts: [],
    slotPaths: [],
    slotPathEntries: [],
  };
}

export function summarizeReturnChecklist(data: unknown): ReturnChecklistSummary {
  const obj = asRecord(data);
  if (obj.schema_version === 2 && isTemplate(obj.template_snapshot)) {
    return summarizeV2(obj, obj.template_snapshot);
  }
  return summarizeV1(obj);
}

/** V1 flat checklist — the same exact-value reading as `returnChecklistFlags` (`lib/submissions/returns.ts`). */
function summarizeV1(obj: Record<string, unknown>): ReturnChecklistSummary {
  const summary = emptySummary("v1");
  summary.damage = obj.damage_observed === "yes";
  summary.accessoriesMissing = obj.accessories_returned === "no";
  return summary;
}

function summarizeV2(obj: Record<string, unknown>, template: InspectionTemplate): ReturnChecklistSummary {
  const summary = emptySummary("v2");
  const answers = asRecord(obj.answers);
  const values = asRecord(answers.values) as Values;
  const photos = asRecord(answers.photos);
  const flags = asRecord(obj.flags);

  summary.damage = flags.damage_observed === "yes";
  summary.accessoriesMissing = flags.accessories_missing === true;
  summary.damagePhotosMissing = flags.damage_photos_missing === true;
  summary.conditionPhotosMissing = flags.condition_photos_missing === true;

  const labels = new Map<string, string>();
  const slotOrder: string[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      labels.set(field.id, field.label);
      if (field.type === "photo_slot") slotOrder.push(field.id);
    }
  }

  for (const section of visibleSections(template, values)) {
    for (const field of visibleFields(section, values)) {
      const value = values[field.id];
      switch (field.type) {
        case "pass_fail_na":
          if (value === "fail") {
            (fieldRequired(field, values) ? summary.failedRequired : summary.failedOptional).push(field.label);
          }
          break;
        case "yes_no":
          if (OPERATING_FIELD_IDS.has(field.id) && value === "no") summary.notOperating.push(field.label);
          break;
        case "accessory_checklist":
          if (field.flag === "accessories" && value && typeof value === "object") {
            const states = value as Record<string, string>;
            for (const item of field.items ?? []) {
              if (states[item.id] === "missing") summary.missingAccessoryLabels.push(item.label);
            }
          }
          break;
        case "short_text":
          if (field.id === "damage_location") summary.damageLocation = nonEmpty(value);
          break;
        case "select":
          if (field.id === "damage_severity" && typeof value === "string") {
            summary.damageSeverityLabel = field.options?.find((option) => option.value === value)?.label ?? null;
          }
          break;
        case "long_text":
          if (field.id === "damage_description") summary.damageDescription = nonEmpty(value);
          break;
        default:
          break;
      }
    }
  }

  // Damage details describe reported damage; the canonical flag decides whether there is any.
  if (!summary.damage) {
    summary.damageLocation = null;
    summary.damageSeverityLabel = null;
    summary.damageDescription = null;
  }

  const missingSlots = Array.isArray(obj.missing_recommended_photo_slots)
    ? obj.missing_recommended_photo_slots.filter(isString)
    : [];
  summary.missingRecommendedPhotos = missingSlots.length > 0;
  summary.missingRecommendedSlotLabels = missingSlots
    .map((slotId) => labels.get(slotId))
    .filter(isString);

  const unknownSlots = Object.keys(photos).filter((key) => !slotOrder.includes(key));
  const orderedSlots = [
    DAMAGE_PHOTOS_SLOT,
    ...slotOrder.filter((slotId) => slotId !== DAMAGE_PHOTOS_SLOT),
    ...unknownSlots.filter((slotId) => slotId !== DAMAGE_PHOTOS_SLOT),
  ];
  const seenPaths = new Set<string>();
  for (const slotId of orderedSlots) {
    const list = Array.isArray(photos[slotId]) ? (photos[slotId] as unknown[]) : [];
    const paths = list.map((photo) => asRecord(photo).path).filter(isString);
    if (paths.length === 0) continue;
    const label = labels.get(slotId) ?? "Photos";
    summary.slotCounts.push({ label, count: paths.length });
    for (const path of paths) {
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      summary.slotPaths.push(path);
      summary.slotPathEntries.push({ slotId, label, path });
    }
  }

  return summary;
}
