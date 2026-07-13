/**
 * Pure logic for constrained organization inspection templates (Return Inspection V2, Phase 2). No I/O.
 *
 * An organization template is copied from a curated system template and edited within STRICT boundaries.
 * `validateOrgTemplateDefinition` is the server-authoritative guard: it REBUILDS the definition from an
 * allow-list of keys and the closed field-type set, so nothing outside the sanctioned InspectionTemplate
 * shape can ever be stored (no arbitrary HTML/CSS/script, no unsupported field types, no cross-field
 * expressions beyond single-equality, and the required attestation can never be removed). This is a
 * constrained editor, NOT a form builder.
 */
import {
  ACCESSORY_STATES,
  INSPECTION_FIELD_TYPES,
  type Condition,
  type InspectionField,
  type InspectionSection,
  type InspectionTemplate,
  type InspectionFieldType,
} from "@/lib/inspections/types";
import { RETURN_TEMPLATES, type ReturnTemplateKey } from "@/lib/inspections/templates";

export type OrgTemplateStatus = "draft" | "published" | "retired";

// Bounds — keep a custom template comprehensible and cheap to render/store.
const MAX_SECTIONS = 24;
const MAX_FIELDS_PER_SECTION = 40;
const MAX_OPTIONS = 30;
const MAX_ITEMS = 30;
const MAX_LABEL = 200;
const MAX_HELP = 600;
export const MAX_TEMPLATE_NAME = 120;
export const MAX_TEMPLATE_DESCRIPTION = 600;
const MAX_PHOTOS = 12;

const FIELD_TYPES = new Set<InspectionFieldType>(INSPECTION_FIELD_TYPES);

type Result<T> = { value: T } | { error: string };

/** Deep clone of a curated system template as the seed definition for a new draft (org may then edit). */
export function copyFromSystemTemplate(
  systemKey: ReturnTemplateKey,
  familyKey: string
): InspectionTemplate {
  const clone = JSON.parse(JSON.stringify(RETURN_TEMPLATES[systemKey])) as InspectionTemplate;
  clone.key = familyKey;
  clone.version = "1";
  clone.inspection_type = "return";
  return clone;
}

/** Stamp the stable family key + version onto a definition before persisting a row. */
export function stampDefinition(
  def: InspectionTemplate,
  familyKey: string,
  version: number,
  name: string,
  description: string | null
): InspectionTemplate {
  return { ...def, key: familyKey, version: String(version), name, description: description ?? "" };
}

/** Next version number for a family given the existing version numbers. */
export function nextVersionNumber(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Rebuild a single-equality condition from an allow-list, or return an error / null. */
function cleanCondition(raw: unknown, label: string): Result<Condition | undefined> {
  if (raw == null) return { value: undefined };
  if (typeof raw !== "object") return { error: `Invalid condition on "${label}".` };
  const c = raw as Record<string, unknown>;
  const field = str(c.field);
  const equals = str(c.equals);
  if (!field || equals == null) {
    return { error: `A condition on "${label}" needs a field and an equals value.` };
  }
  // Only the two sanctioned keys are kept — no operators, no nesting, no expressions.
  return { value: { field, equals } };
}

function cleanField(raw: unknown, seen: Set<string>): Result<InspectionField> {
  if (!raw || typeof raw !== "object") return { error: "A field is malformed." };
  const f = raw as Record<string, unknown>;

  const id = trimmed(f.id);
  if (!id) return { error: "Every field needs an id." };
  if (seen.has(id)) return { error: `Duplicate field id "${id}".` };
  seen.add(id);

  const type = f.type as InspectionFieldType;
  if (!FIELD_TYPES.has(type)) return { error: `Unsupported field type on "${id}".` };

  const label = trimmed(f.label);
  if (!label) return { error: `Field "${id}" needs a label.` };
  if (label.length > MAX_LABEL) return { error: `A field label is too long.` };

  const out: InspectionField = { id, type, label };

  const help = str(f.help);
  if (help && help.trim()) {
    if (help.length > MAX_HELP) return { error: "A field help text is too long." };
    out.help = help;
  }
  if (f.required === true) out.required = true;

  if (type === "select") {
    const options = Array.isArray(f.options) ? f.options : [];
    if (options.length === 0) return { error: `Select field "${id}" needs at least one option.` };
    if (options.length > MAX_OPTIONS) return { error: `Select field "${id}" has too many options.` };
    const values = new Set<string>();
    out.options = options.map((o) => {
      const value = trimmed((o as Record<string, unknown>)?.value);
      const optLabel = trimmed((o as Record<string, unknown>)?.label) || value;
      if (!value) throw new Error(`Select field "${id}" has an option without a value.`);
      if (values.has(value)) throw new Error(`Select field "${id}" has duplicate option values.`);
      values.add(value);
      return { value, label: optLabel };
    });
  }

  if (type === "numeric_meter") {
    const unit = str(f.unit);
    if (unit && unit.trim()) out.unit = unit;
    if (typeof f.min === "number") out.min = f.min;
    if (typeof f.max === "number") out.max = f.max;
    if (out.min != null && out.max != null && out.min > out.max) {
      return { error: `Field "${id}" has min greater than max.` };
    }
  }

  if (type === "accessory_checklist") {
    const items = Array.isArray(f.items) ? f.items : [];
    if (items.length === 0) return { error: `Accessory field "${id}" needs at least one item.` };
    if (items.length > MAX_ITEMS) return { error: `Accessory field "${id}" has too many items.` };
    const ids = new Set<string>();
    out.items = items.map((it) => {
      const itemId = trimmed((it as Record<string, unknown>)?.id);
      const itemLabel = trimmed((it as Record<string, unknown>)?.label) || itemId;
      if (!itemId) throw new Error(`Accessory field "${id}" has an item without an id.`);
      if (ids.has(itemId)) throw new Error(`Accessory field "${id}" has duplicate item ids.`);
      ids.add(itemId);
      return { id: itemId, label: itemLabel };
    });
  }

  if (type === "photo_slot") {
    const photo = (f.photo ?? {}) as Record<string, unknown>;
    const minPhotos = typeof photo.minPhotos === "number" ? photo.minPhotos : 0;
    const maxPhotos = typeof photo.maxPhotos === "number" ? photo.maxPhotos : 6;
    if (minPhotos < 0 || maxPhotos < 1 || minPhotos > maxPhotos || maxPhotos > MAX_PHOTOS) {
      return { error: `Photo field "${id}" has invalid min/max photos.` };
    }
    out.photo = { minPhotos, maxPhotos };
  }

  const flag = str(f.flag);
  if (flag === "damage_observed" || flag === "accessories") out.flag = flag;

  const visible = cleanCondition(f.visible_when, id);
  if ("error" in visible) return { error: visible.error };
  if (visible.value) out.visible_when = visible.value;

  const requiredWhen = cleanCondition(f.required_when, id);
  if ("error" in requiredWhen) return { error: requiredWhen.error };
  if (requiredWhen.value) out.required_when = requiredWhen.value;

  return { value: out };
}

function cleanSection(raw: unknown, seenFieldIds: Set<string>): Result<InspectionSection> {
  if (!raw || typeof raw !== "object") return { error: "A section is malformed." };
  const s = raw as Record<string, unknown>;
  const id = trimmed(s.id);
  if (!id) return { error: "Every section needs an id." };
  const title = trimmed(s.title);
  if (!title) return { error: `Section "${id}" needs a title.` };

  const rawFields = Array.isArray(s.fields) ? s.fields : [];
  if (rawFields.length > MAX_FIELDS_PER_SECTION) {
    return { error: `Section "${title}" has too many fields.` };
  }
  const fields: InspectionField[] = [];
  for (const rf of rawFields) {
    const cleaned = cleanField(rf, seenFieldIds);
    if ("error" in cleaned) return { error: cleaned.error };
    fields.push(cleaned.value);
  }

  const out: InspectionSection = { id, title, fields };
  const help = str(s.help);
  if (help && help.trim()) out.help = help;
  const visible = cleanCondition(s.visible_when, title);
  if ("error" in visible) return { error: visible.error };
  if (visible.value) out.visible_when = visible.value;
  return { value: out };
}

/**
 * Server-authoritative validation. Returns a REBUILT definition containing only sanctioned structure, or
 * an error message. Enforces: closed field types, unique ids, single-equality conditions only, photo
 * bounds, size limits, and a required attestation (acknowledgement) that cannot be removed.
 */
export function validateOrgTemplateDefinition(raw: unknown): Result<InspectionTemplate> {
  try {
    if (!raw || typeof raw !== "object") return { error: "The template definition is missing." };
    const t = raw as Record<string, unknown>;

    const name = trimmed(t.name);
    if (!name) return { error: "The template needs a name." };
    if (name.length > MAX_TEMPLATE_NAME) return { error: "The template name is too long." };

    const description = str(t.description) ?? "";
    if (description.length > MAX_TEMPLATE_DESCRIPTION) {
      return { error: "The template description is too long." };
    }

    const key = trimmed(t.key);
    if (!key) return { error: "The template is missing its family key." };
    const version = trimmed(t.version) || "1";

    const equipmentTypes = Array.isArray(t.equipmentTypes)
      ? t.equipmentTypes.filter((x): x is string => typeof x === "string")
      : [];

    const rawSections = Array.isArray(t.sections) ? t.sections : [];
    if (rawSections.length === 0) return { error: "The template needs at least one section." };
    if (rawSections.length > MAX_SECTIONS) return { error: "The template has too many sections." };

    const seenSectionIds = new Set<string>();
    const seenFieldIds = new Set<string>();
    const sections: InspectionSection[] = [];
    for (const rs of rawSections) {
      const cleaned = cleanSection(rs, seenFieldIds);
      if ("error" in cleaned) return { error: cleaned.error };
      if (seenSectionIds.has(cleaned.value.id)) {
        return { error: `Duplicate section id "${cleaned.value.id}".` };
      }
      seenSectionIds.add(cleaned.value.id);
      sections.push(cleaned.value);
    }

    // Legal/safety guard: a required attestation (acknowledgement) must remain.
    const hasRequiredAttestation = sections.some((s) =>
      s.fields.some((f) => f.type === "acknowledgement" && f.required === true)
    );
    if (!hasRequiredAttestation) {
      return { error: "The confirmation attestation is required and cannot be removed." };
    }

    return {
      value: {
        key,
        version,
        inspection_type: "return",
        name,
        description,
        equipmentTypes,
        sections,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The template definition is invalid." };
  }
}

/** Whether a field's required flag can be toggled in the editor (attestation stays required). */
export function canToggleRequired(field: InspectionField): boolean {
  return field.type !== "acknowledgement";
}

/** The closed set of field types offered when adding a field (attestation is not add-able). */
export const ADDABLE_FIELD_TYPES: InspectionFieldType[] = INSPECTION_FIELD_TYPES.filter(
  (t) => t !== "acknowledgement"
);

/** Accessory states re-exported for the editor's option help. */
export { ACCESSORY_STATES };
