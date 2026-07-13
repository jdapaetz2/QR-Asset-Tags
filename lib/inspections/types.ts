/**
 * Typed, CLOSED field model for guided return inspections (Return Inspection V2, Phase 1A).
 * Templates are curated system definitions in code (lib/inspections/templates.ts) — there is no
 * template DB table, no form builder, and no general rules engine. Conditional logic is a single
 * equality (`visible_when` / `required_when`). Field/section/value shapes here are the contract for
 * the pure resolver/validator/snapshot helpers, the public guided form, and the admin summary.
 */

/** The only field types a template may use. */
export const INSPECTION_FIELD_TYPES = [
  "pass_fail_na",
  "yes_no",
  "select",
  "short_text",
  "long_text",
  "numeric_meter",
  "fuel_charge_level",
  "accessory_checklist",
  "photo_slot",
  "acknowledgement",
] as const;
export type InspectionFieldType = (typeof INSPECTION_FIELD_TYPES)[number];

export const PASS_FAIL_NA = ["pass", "fail", "na"] as const;
export type PassFailNa = (typeof PASS_FAIL_NA)[number];

export const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];

export const ACCESSORY_STATES = ["returned", "missing", "na"] as const;
export type AccessoryState = (typeof ACCESSORY_STATES)[number];

/** A single equality condition against another field's answer in the same submission. */
export type Condition = { field: string; equals: string };

/** One line item inside an `accessory_checklist` field. */
export type AccessoryItem = { id: string; label: string };

/** Constraints for a `photo_slot` field (guided photos). */
export type PhotoSlotSpec = { minPhotos: number; maxPhotos: number };

/** Select option. */
export type SelectOption = { value: string; label: string };

/**
 * A field feeds a canonical submission flag: `damage_observed` (a yes_no whose "yes" drives the
 * damage conditional + the dashboard attention flag) or `accessories` (a checklist / yes_no whose
 * "missing"/"no" sets `accessories_missing`).
 */
export type FieldFlag = "damage_observed" | "accessories";

export type InspectionField = {
  id: string;
  type: InspectionFieldType;
  label: string;
  help?: string;
  /** Always-required (server-authoritative). Photo required = `photo.minPhotos > 0`. */
  required?: boolean;
  options?: SelectOption[]; // select
  unit?: string; // numeric_meter
  min?: number; // numeric_meter
  max?: number; // numeric_meter
  items?: AccessoryItem[]; // accessory_checklist
  photo?: PhotoSlotSpec; // photo_slot
  /** Show/collect this field only when the condition holds. */
  visible_when?: Condition;
  /** Require this field only when the condition holds (in addition to `required`). */
  required_when?: Condition;
  flag?: FieldFlag;
};

/** Presentational stage grouping (Phase 3C.1) — collapses the guided form into ≤3 primary stages. */
export type InspectionStage = "condition" | "return_details";

export type InspectionSection = {
  id: string;
  title: string;
  help?: string;
  /** Hide the whole section (e.g. Damage details) until the condition holds. */
  visible_when?: Condition;
  /**
   * Which primary stage this section renders in (Phase 3C.1). Optional + snapshot-safe: when absent the
   * renderer infers it from the section id (see lib/inspections/stages.ts), so old snapshots and custom
   * templates still collapse to Condition → Return details → Review.
   */
  stage?: InspectionStage;
  fields: InspectionField[];
};

/** Inspection variants. "return" = renter drop-off checklist; "outbound" = staff pre-use baseline. */
export type InspectionType = "return" | "outbound";

export type InspectionTemplate = {
  key: string;
  /** Immutable version stamp frozen into each submission snapshot. */
  version: string;
  inspection_type: InspectionType;
  name: string;
  description: string;
  /** Human equipment types this preset suits (display/help only). */
  equipmentTypes: string[];
  sections: InspectionSection[];
};

/** A photo captured for a slot, stored in the submission answers. */
export type PhotoAnswer = { path: string; caption: string };

/** Structured answers for a submission. Field values keyed by field id; photos keyed by slot id. */
export type InspectionAnswers = {
  values: Record<string, string | number | Record<string, string>>;
  photos: Record<string, PhotoAnswer[]>;
};

/** Canonical flags derived server-side and stored top-level for cross-version compatibility. */
export type InspectionFlags = {
  damage_observed: YesNo;
  accessories_missing: boolean;
  /**
   * True when damage was reported but no damage photo was attached (Phase 3C.1). Server-authoritative —
   * derived from the validated uploaded files, never a client claim. Optional for back-compat with pre-3C.1
   * V2 payloads (absent = photos not omitted / not applicable).
   */
  damage_photos_missing?: boolean;
};

/** The V2 `submission_data_json` shape. */
export type ReturnInspectionData = {
  schema_version: 2;
  template_key: string;
  template_version: string;
  template_snapshot: InspectionTemplate;
  answers: InspectionAnswers;
  flags: InspectionFlags;
  /**
   * Set true only when the user explicitly elected to submit reported damage WITHOUT photos (Phase 3C.1).
   * Evidence of intent, not a security credential — the server is authoritative on whether photos exist.
   */
  damage_photo_omission_acknowledged?: boolean;
  /**
   * Who performed the inspection. Absent = a public renter submission (default). "staff" marks an
   * authenticated staff return/outbound inspection, so the historical snapshot self-identifies the
   * workflow even independently of the DB `submission_origin` column. Optional for back-compat with
   * every V2 payload written before Phase 3A.1.
   */
  audience?: "public" | "staff";
};
