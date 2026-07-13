/**
 * Pure parsing + SERVER-AUTHORITATIVE validation for guided return inspections (Phase 1A). No I/O.
 * The public form mirrors these for UX, but the server re-runs them as the source of truth. Answers
 * are read through a `reader(key)` so the same code validates FormData (server) and plain maps (tests).
 * Unknown answer keys are ignored — only fields defined in the resolved template are parsed.
 */
import {
  ACCESSORY_STATES,
  PASS_FAIL_NA,
  YES_NO,
  type Condition,
  type InspectionAnswers,
  type InspectionField,
  type InspectionFlags,
  type InspectionSection,
  type InspectionTemplate,
} from "@/lib/inspections/types";

type AnswerValues = Record<string, string | number | Record<string, string>>;
export type AnswerReader = (key: string) => string | null;

function trimOrNull(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** A single-equality condition holds when the referenced field's value equals the target. */
export function isConditionMet(cond: Condition | undefined, values: AnswerValues): boolean {
  if (!cond) return true;
  return values[cond.field] === cond.equals;
}

export function visibleSections(
  template: InspectionTemplate,
  values: AnswerValues
): InspectionSection[] {
  return template.sections.filter((s) => isConditionMet(s.visible_when, values));
}

export function visibleFields(
  section: InspectionSection,
  values: AnswerValues
): InspectionField[] {
  return section.fields.filter((f) => isConditionMet(f.visible_when, values));
}

/** Every currently-visible photo_slot field (for media validation). */
export function visiblePhotoSlots(
  template: InspectionTemplate,
  values: AnswerValues
): InspectionField[] {
  const out: InspectionField[] = [];
  for (const section of visibleSections(template, values)) {
    for (const field of visibleFields(section, values)) {
      if (field.type === "photo_slot") out.push(field);
    }
  }
  return out;
}

/**
 * Parse answers from a reader into a typed `values` map, reading ONLY fields defined in the template
 * (unknown keys ignored). Accessory items are read from `answer:<fieldId>:<itemId>`. Two passes so a
 * conditional field's visibility reflects the values in the same submission.
 */
export function parseAnswerValues(
  template: InspectionTemplate,
  reader: AnswerReader
): AnswerValues {
  const values: AnswerValues = {};
  const readOne = (field: InspectionField) => {
    if (field.type === "photo_slot") return; // photos are files, not text values
    if (field.type === "accessory_checklist") {
      const map: Record<string, string> = {};
      for (const item of field.items ?? []) {
        const raw = trimOrNull(reader(`answer:${field.id}:${item.id}`));
        if (raw) map[item.id] = raw;
      }
      if (Object.keys(map).length > 0) values[field.id] = map;
      return;
    }
    if (field.type === "acknowledgement") {
      const raw = trimOrNull(reader(`answer:${field.id}`));
      // Checkboxes post "on"/"yes"/"true" when checked.
      values[field.id] = raw && ["on", "yes", "true", "1"].includes(raw.toLowerCase()) ? "yes" : "no";
      return;
    }
    const raw = trimOrNull(reader(`answer:${field.id}`));
    if (raw == null) return;
    if (field.type === "numeric_meter") {
      const n = Number(raw);
      values[field.id] = Number.isFinite(n) ? n : raw; // keep raw so validation reports the error
    } else {
      values[field.id] = raw;
    }
  };
  // Pass 1: read every field regardless of visibility so conditions can be evaluated.
  for (const section of template.sections) for (const field of section.fields) readOne(field);
  return values;
}

function isAnswered(field: InspectionField, values: AnswerValues): boolean {
  const v = values[field.id];
  if (field.type === "accessory_checklist") {
    return typeof v === "object" && v !== null && Object.keys(v).length > 0;
  }
  return v != null && v !== "";
}

function fieldRequired(field: InspectionField, values: AnswerValues): boolean {
  if (field.required) return true;
  return isConditionMet(field.required_when, values) && field.required_when != null;
}

/**
 * Server-authoritative validation. Returns an error message (first failure) or null. Only VISIBLE
 * sections/fields are enforced; photos are validated separately (they are files, not text answers).
 */
export function evaluateInspection(
  template: InspectionTemplate,
  values: AnswerValues
): string | null {
  for (const section of visibleSections(template, values)) {
    for (const field of visibleFields(section, values)) {
      if (field.type === "photo_slot") continue;

      const answered = isAnswered(field, values);
      if (fieldRequired(field, values) && !answered) {
        if (field.type === "acknowledgement") return "Please confirm the attestation to submit.";
        return `"${field.label}" is required.`;
      }
      if (!answered) continue;

      const v = values[field.id];
      switch (field.type) {
        case "pass_fail_na":
          if (!(PASS_FAIL_NA as readonly string[]).includes(String(v))) {
            return `Answer "${field.label}".`;
          }
          break;
        case "yes_no":
          if (!(YES_NO as readonly string[]).includes(String(v))) {
            return `Answer "${field.label}".`;
          }
          break;
        case "acknowledgement":
          if (v !== "yes") return "Please confirm the attestation to submit.";
          break;
        case "select":
          if (!(field.options ?? []).some((o) => o.value === v)) {
            return `Choose a valid option for "${field.label}".`;
          }
          break;
        case "numeric_meter": {
          if (typeof v !== "number") return `"${field.label}" must be a number.`;
          if (field.min != null && v < field.min) return `"${field.label}" is too low.`;
          if (field.max != null && v > field.max) return `"${field.label}" is too high.`;
          break;
        }
        case "accessory_checklist": {
          const map = v as Record<string, string>;
          for (const state of Object.values(map)) {
            if (!(ACCESSORY_STATES as readonly string[]).includes(state)) {
              return `Answer the accessories for "${field.label}".`;
            }
          }
          break;
        }
        default:
          break; // short_text / long_text / fuel_charge_level — free text, no domain check
      }
    }
  }
  return null;
}

/**
 * First client-side blocking error across ALL currently-visible sections (Phase 1A.1). Mirrors the
 * server's required / required_when / acknowledgement checks and returns the offending field id (so the
 * single-page form can scroll + focus it) with a message. Photos NEVER block (Phase 3C.1.1) — all photo
 * evidence is recommended and confirmed at submit. The server remains authoritative — this only gates
 * opening the Review stage; value-domain checks (bad numbers, etc.) are left to the server.
 */
export function firstInspectionError(
  template: InspectionTemplate,
  values: AnswerValues,
  opts?: { sectionFilter?: (section: InspectionSection) => boolean }
): { fieldId: string; message: string } | null {
  const sections = opts?.sectionFilter
    ? visibleSections(template, values).filter(opts.sectionFilter)
    : visibleSections(template, values);
  for (const section of sections) {
    for (const field of visibleFields(section, values)) {
      // Photos never block Review (Phase 3C.1.1) — all photo evidence is recommended, confirmed at submit.
      if (field.type === "photo_slot") continue;
      if (field.type === "acknowledgement") {
        if (field.required && values[field.id] !== "yes") {
          return { fieldId: field.id, message: "Please confirm the attestation to submit." };
        }
        continue;
      }
      if (fieldRequired(field, values) && !isAnswered(field, values)) {
        return { fieldId: field.id, message: `"${field.label}" is required.` };
      }
    }
  }
  return null;
}

/** Per-slot photo counts for the currently-visible photo slots (drives the Review photo summary). */
export function visiblePhotoSlotCounts(
  template: InspectionTemplate,
  values: AnswerValues,
  fileCounts: Record<string, number>
): { id: string; label: string; count: number }[] {
  return visiblePhotoSlots(template, values).map((slot) => ({
    id: slot.id,
    label: slot.label,
    count: fileCounts[slot.id] ?? 0,
  }));
}

/** Canonical flags derived from the answers (damage yes/no + accessories missing). */
export function deriveFlags(
  template: InspectionTemplate,
  values: AnswerValues
): InspectionFlags {
  let damage: "yes" | "no" = "no";
  let missing = false;
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.flag === "damage_observed" && values[field.id] === "yes") damage = "yes";
      if (field.flag === "accessories") {
        const v = values[field.id];
        if (field.type === "accessory_checklist" && v && typeof v === "object") {
          if (Object.values(v as Record<string, string>).includes("missing")) missing = true;
        } else if (v === "no") {
          missing = true; // accessories_returned = no
        }
      }
    }
  }
  return { damage_observed: damage, accessories_missing: missing };
}

/**
 * Read the explicit photo-omission acknowledgement from a submitted form (server-side).
 */
const ACK_TRUE = new Set(["yes", "on", "true", "1"]);

export function readOmissionAck(formData: FormData): boolean {
  const raw = formData.get("damage_photos_omission_ack");
  return typeof raw === "string" && ACK_TRUE.has(raw.trim().toLowerCase());
}

/**
 * Server-authoritative resolution of the SOFT photo-evidence rule (Phase 3C.1.1). ALL photos are strongly
 * recommended, never mandatory. An inspection may be submitted (a) with reported damage but no damage photo,
 * or (b) with no photos at all — only after an explicit omission acknowledgement. Counts are computed by the
 * caller from the VALIDATED uploaded files (never a client claim); `acknowledged` reflects the omission form
 * field.
 *
 *   - damagePhotosMissing    = damage reported AND zero damage photos.
 *   - conditionPhotosMissing = zero photos across every slot.
 *   - error (non-null) when either condition holds but the user did not acknowledge → blocks the omission.
 */
export function resolvePhotoEvidence(input: {
  damage: boolean;
  damagePhotoCount: number;
  totalPhotoCount: number;
  /** Whether the resolved template exposes any photo slot at all (default true). */
  hasPhotoSlots?: boolean;
  acknowledged: boolean;
}): { damagePhotosMissing: boolean; conditionPhotosMissing: boolean; error: string | null } {
  const damagePhotosMissing = input.damage && input.damagePhotoCount === 0;
  // "No condition photos" only applies when the template actually offers photo slots.
  const conditionPhotosMissing = (input.hasPhotoSlots ?? true) && input.totalPhotoCount === 0;
  const needsAck = damagePhotosMissing || conditionPhotosMissing;
  const error =
    needsAck && !input.acknowledged
      ? "Add photos, or confirm you want to submit the inspection without them."
      : null;
  return { damagePhotosMissing, conditionPhotosMissing, error };
}

/** Assemble the structured answers object (values + per-slot photos) stored on the submission. */
export function buildAnswers(
  values: AnswerValues,
  photos: InspectionAnswers["photos"]
): InspectionAnswers {
  return { values, photos };
}
