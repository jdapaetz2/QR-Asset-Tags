/**
 * Curated SYSTEM return-inspection templates (Return Inspection V2, Phase 1A). Frozen in code — no
 * template DB table, no org customization, no builder (mirrors the equipment-page system-template
 * precedent). Each template is snapshotted into the submission at submit time, so history is immutable
 * even if a template is later revised (bump `version`). Every template includes a `damage_observed`
 * yes_no (drives the damage conditional + the canonical flag), an accessories input (flagged
 * `accessories`), a required overview photo, and a required attestation.
 */
import type {
  InspectionField,
  InspectionSection,
  InspectionTemplate,
} from "@/lib/inspections/types";

/** Shared version stamp for this initial release. Bump per-template when a template changes. */
const V = "2026-07-1";

const SEVERITY_OPTIONS = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

// ---------------------------------------------------------------------------
// Field builders (keep the templates below terse + consistent).
// ---------------------------------------------------------------------------
function photoSlot(
  id: string,
  label: string,
  opts: { required?: boolean; min?: number; max?: number; help?: string } = {}
): InspectionField {
  const required = opts.required ?? true;
  return {
    id,
    type: "photo_slot",
    label,
    help: opts.help,
    required,
    photo: { minPhotos: opts.min ?? (required ? 1 : 0), maxPhotos: opts.max ?? 6 },
  };
}
function passFail(id: string, label: string): InspectionField {
  return { id, type: "pass_fail_na", label, required: true };
}
function yesNo(
  id: string,
  label: string,
  opts: { required?: boolean; flag?: "damage_observed" | "accessories" } = {}
): InspectionField {
  return { id, type: "yes_no", label, required: opts.required ?? true, flag: opts.flag };
}
function meter(
  id: string,
  label: string,
  opts: { unit?: string; required?: boolean; min?: number; max?: number } = {}
): InspectionField {
  return {
    id,
    type: "numeric_meter",
    label,
    required: opts.required ?? false,
    unit: opts.unit ?? "hours",
    min: opts.min ?? 0,
    max: opts.max,
  };
}
function fuel(id = "fuel_or_charge_level", label = "Fuel / charge level"): InspectionField {
  return { id, type: "fuel_charge_level", label, required: false };
}
function shortText(id: string, label: string, required = false): InspectionField {
  return { id, type: "short_text", label, required };
}
function longText(id: string, label: string, required = false): InspectionField {
  return { id, type: "long_text", label, required };
}
function select(
  id: string,
  label: string,
  options: { value: string; label: string }[],
  required = true
): InspectionField {
  return { id, type: "select", label, options, required };
}
function accessories(
  id: string,
  items: { id: string; label: string }[]
): InspectionField {
  return { id, type: "accessory_checklist", label: "Accessories", items, flag: "accessories" };
}
function accessoriesReturned(): InspectionField {
  return yesNo("accessories_returned", "Accessories returned?", { flag: "accessories" });
}

const DAMAGE_OBSERVED = yesNo("damage_observed", "Damage observed?", {
  flag: "damage_observed",
});

const DAMAGE_DETAILS_SECTION: InspectionSection = {
  id: "damage_details",
  title: "Damage details",
  help: "Complete these because damage was reported.",
  visible_when: { field: "damage_observed", equals: "yes" },
  fields: [
    shortText("damage_location", "Where is the damage?", true),
    select("damage_severity", "Severity", SEVERITY_OPTIONS, true),
    longText("damage_description", "Describe the damage", true),
    photoSlot("damage_photos", "Damage photos", {
      required: true,
      min: 1,
      help: "At least one close-up of the damage.",
    }),
  ],
};

/** Stable slot id for the always-visible optional "Additional photos" area (Phase 1A.1). */
export const ADDITIONAL_PHOTOS_SLOT_ID = "additional_photos";

/**
 * Optional catch-all photos, always available regardless of the damage answer. Renders near the end of
 * the single-page inspection (after damage details, before confirmation). minPhotos 0 → never required.
 */
const ADDITIONAL_PHOTOS_SECTION: InspectionSection = {
  id: "additional_photos",
  title: "Additional photos",
  fields: [
    photoSlot(ADDITIONAL_PHOTOS_SLOT_ID, "Additional photos", {
      required: false,
      min: 0,
      max: 6,
      help: "Add any other photos that may help the rental company review the equipment’s return condition.",
    }),
  ],
};

const CONFIRMATION_SECTION: InspectionSection = {
  id: "confirmation",
  title: "Confirmation",
  fields: [
    {
      id: "attestation",
      type: "acknowledgement",
      label:
        "I confirm this information reflects the condition of the equipment at return, to the best of my knowledge.",
      required: true,
    },
  ],
};

/** Assemble a template from its photo, condition, and accessories sections + the shared spine. */
function buildTemplate(
  base: Pick<InspectionTemplate, "key" | "name" | "description" | "equipmentTypes">,
  sections: { photos: InspectionField[]; condition: InspectionField[]; accessories: InspectionField }
): InspectionTemplate {
  return {
    key: base.key,
    version: V,
    inspection_type: "return",
    name: base.name,
    description: base.description,
    equipmentTypes: base.equipmentTypes,
    sections: [
      { id: "photos", title: "Photos", help: "Show the whole unit.", fields: sections.photos },
      {
        id: "condition",
        title: "Condition",
        fields: [...sections.condition, DAMAGE_OBSERVED],
      },
      { id: "accessories", title: "Accessories", fields: [sections.accessories] },
      DAMAGE_DETAILS_SECTION,
      ADDITIONAL_PHOTOS_SECTION,
      CONFIRMATION_SECTION,
    ],
  };
}

// ---------------------------------------------------------------------------
// The six system templates.
// ---------------------------------------------------------------------------
export const RETURN_TEMPLATES = {
  utility_trailer: buildTemplate(
    {
      key: "utility_trailer",
      name: "Utility trailer",
      description: "Deck, tires, lights, coupler, chains, and accessories.",
      equipmentTypes: ["Utility trailer", "Equipment trailer", "Dump trailer"],
    },
    {
      photos: [
        photoSlot("front_hitch_photo", "Front / hitch photo"),
        photoSlot("deck_photo", "Deck photo"),
      ],
      condition: [
        passFail("tires_wheels", "Tires / wheels"),
        passFail("lights_wiring", "Lights / wiring"),
        yesNo("ramps_gate", "Ramps / gate operate?"),
        passFail("coupler", "Coupler / hitch"),
        passFail("safety_chains", "Safety chains"),
        passFail("jack", "Jack / stand"),
        passFail("body_fenders", "Body / fenders"),
        longText("deck_condition", "Deck condition notes"),
      ],
      accessories: accessories("accessories", [
        { id: "straps", label: "Straps" },
        { id: "chains", label: "Chains" },
        { id: "pins", label: "Pins" },
        { id: "spare", label: "Spare tire" },
      ]),
    }
  ),

  mini_excavator_skid_steer: buildTemplate(
    {
      key: "mini_excavator_skid_steer",
      name: "Mini excavator / skid steer",
      description: "Hours, fuel, tracks, hydraulics, attachment, cab, and accessories.",
      equipmentTypes: ["Mini excavator", "Compact excavator", "Skid steer"],
    },
    {
      photos: [
        photoSlot("overall_photo", "Overall photo"),
        photoSlot("attachment_photo", "Attachment photo"),
      ],
      condition: [
        meter("engine_hours", "Engine hours", { unit: "hours" }),
        fuel(),
        passFail("tracks_tires", "Tracks / tires"),
        passFail("hydraulics_leaks", "Hydraulics / leaks"),
        select("bucket_attachment", "Bucket / attachment", [
          { value: "standard_bucket", label: "Standard bucket" },
          { value: "grading_bucket", label: "Grading bucket" },
          { value: "auger", label: "Auger" },
          { value: "breaker", label: "Breaker" },
          { value: "forks", label: "Forks" },
          { value: "none", label: "None" },
          { value: "other", label: "Other" },
        ]),
        passFail("cab_glass", "Cab / glass"),
        passFail("warning_lights_controls", "Warning lights / controls"),
        passFail("coolant_oil", "Coolant / oil"),
      ],
      accessories: accessories("accessories", [
        { id: "keys", label: "Keys" },
        { id: "attachments", label: "Attachments" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  portable_generator: buildTemplate(
    {
      key: "portable_generator",
      name: "Portable generator",
      description: "Run hours, fuel, oil, cords/outlets, and accessories.",
      equipmentTypes: ["Portable generator", "Towable generator"],
    },
    {
      photos: [photoSlot("overall_photo", "Overall photo")],
      condition: [
        meter("run_hours", "Run hours", { unit: "hours", required: false }),
        fuel(),
        passFail("oil_level", "Oil level"),
        passFail("cords_outlets", "Cords / outlets"),
        yesNo("starts_operates", "Starts / operates?"),
        passFail("frame_wheels", "Frame / wheels"),
      ],
      accessories: accessories("accessories", [
        { id: "cords", label: "Cords" },
        { id: "wheel_kit", label: "Wheel kit" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  plate_compactor: buildTemplate(
    {
      key: "plate_compactor",
      name: "Plate compactor",
      description: "Fuel, plate, belt/guard, operation, and accessories.",
      equipmentTypes: ["Plate compactor", "Compactor"],
    },
    {
      photos: [photoSlot("overall_photo", "Overall photo")],
      condition: [
        fuel(),
        passFail("plate_condition", "Plate condition"),
        passFail("belt_guard", "Belt / guard"),
        yesNo("starts_operates", "Starts / operates?"),
      ],
      accessories: accessories("accessories", [
        { id: "water_kit", label: "Water kit" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  electrical_test_equipment: buildTemplate(
    {
      key: "electrical_test_equipment",
      name: "Electrical test equipment",
      description: "Power-on, leads/probes, case/screen, calibration, and accessories.",
      equipmentTypes: ["Electrical test equipment", "Test equipment"],
    },
    {
      photos: [photoSlot("equipment_case_photo", "Equipment / case photo")],
      condition: [
        yesNo("powers_on", "Powers on?"),
        passFail("leads_probes", "Leads / probes"),
        passFail("case_screen", "Case / screen"),
        passFail("battery_charge", "Battery / charge"),
        yesNo("calibration_sticker", "Calibration sticker present?"),
      ],
      accessories: accessories("accessories", [
        { id: "leads", label: "Leads" },
        { id: "case", label: "Case" },
        { id: "charger", label: "Charger" },
        { id: "adapters", label: "Adapters" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  generic: buildTemplate(
    {
      key: "generic",
      name: "Generic equipment",
      description: "A general return inspection for any equipment. Review recommended.",
      equipmentTypes: ["Any equipment"],
    },
    {
      photos: [photoSlot("overview_photos", "Overview photos", { max: 6 })],
      condition: [
        longText("general_condition", "General condition"),
        fuel(),
        yesNo("cleaned", "Cleaned?"),
      ],
      accessories: accessoriesReturned(),
    }
  ),
} as const satisfies Record<string, InspectionTemplate>;

export type ReturnTemplateKey = keyof typeof RETURN_TEMPLATES;
export const RETURN_TEMPLATE_KEYS = Object.keys(RETURN_TEMPLATES) as ReturnTemplateKey[];
export const GENERIC_TEMPLATE_KEY: ReturnTemplateKey = "generic";

export function isReturnTemplateKey(value: unknown): value is ReturnTemplateKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RETURN_TEMPLATES, value)
  );
}

export function getReturnTemplate(key: ReturnTemplateKey): InspectionTemplate {
  return RETURN_TEMPLATES[key];
}

/** Compact list for the admin template selector (key + friendly name + description). */
export const RETURN_TEMPLATE_PICKER: { key: ReturnTemplateKey; name: string; description: string }[] =
  RETURN_TEMPLATE_KEYS.map((key) => ({
    key,
    name: RETURN_TEMPLATES[key].name,
    description: RETURN_TEMPLATES[key].description,
  }));
