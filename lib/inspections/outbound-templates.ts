/**
 * Curated SYSTEM outbound (pre-use) inspection templates (Yard Staff Scanner Mode, Phase 3A). Frozen in
 * code, mirroring the return templates but capturing the BASELINE condition of equipment as it leaves the
 * yard: overview + category photos, meter/hours, fuel/charge, pass/fail checks, existing-condition notes,
 * an existing-damage flag, accessories issued, additional photos, and a required STAFF attestation. Reuses
 * the shared field builders and the same closed field-type model as the return engine — no separate forms
 * engine. Keys MIRROR the return template keys so an asset's assigned system key selects the matching
 * outbound template.
 */
import type {
  InspectionField,
  InspectionSection,
  InspectionTemplate,
} from "@/lib/inspections/types";
import {
  accessories,
  fuel,
  longText,
  meter,
  passFail,
  photoSlot,
  yesNo,
} from "@/lib/inspections/field-builders";
import { suggestTemplateKeyFromCategory } from "@/lib/inspections/resolve";

const V = "2026-07-1";

/** Shared "existing damage" flag (drives the canonical damage_observed flag on the baseline). */
const EXISTING_DAMAGE = yesNo("existing_damage", "Any existing damage?", {
  flag: "damage_observed",
});
const EXISTING_CONDITION = longText("condition_notes", "Existing condition notes");

const ADDITIONAL_PHOTOS_SECTION: InspectionSection = {
  id: "additional_photos",
  title: "Additional photos",
  fields: [
    photoSlot("additional_photos", "Additional photos", {
      required: false,
      min: 0,
      max: 6,
      help: "Add any other photos of the equipment's condition as it leaves the yard.",
    }),
  ],
};

const STAFF_CONFIRMATION_SECTION: InspectionSection = {
  id: "confirmation",
  title: "Confirmation",
  fields: [
    {
      id: "attestation",
      type: "acknowledgement",
      label:
        "I confirm this records the equipment's condition and accessories at the time it left the yard, to the best of my knowledge.",
      required: true,
    },
  ],
};

/** Assemble an outbound template: photos → condition (+existing condition/damage) → accessories issued
 *  → additional photos → staff attestation. */
function buildOutboundTemplate(
  base: Pick<InspectionTemplate, "key" | "name" | "description" | "equipmentTypes">,
  sections: { photos: InspectionField[]; condition: InspectionField[]; accessories: InspectionField }
): InspectionTemplate {
  return {
    key: base.key,
    version: V,
    inspection_type: "outbound",
    name: base.name,
    description: base.description,
    equipmentTypes: base.equipmentTypes,
    sections: [
      { id: "photos", title: "Photos", help: "Show the whole unit before it leaves.", fields: sections.photos },
      {
        id: "condition",
        title: "Condition",
        fields: [...sections.condition, EXISTING_CONDITION, EXISTING_DAMAGE],
      },
      { id: "accessories", title: "Accessories issued", fields: [sections.accessories] },
      ADDITIONAL_PHOTOS_SECTION,
      STAFF_CONFIRMATION_SECTION,
    ],
  };
}

export const OUTBOUND_TEMPLATES = {
  utility_trailer: buildOutboundTemplate(
    {
      key: "utility_trailer",
      name: "Utility trailer (outbound)",
      description: "Baseline: deck, tires, lights, coupler, chains, and accessories issued.",
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
        passFail("coupler", "Coupler / hitch"),
        passFail("safety_chains", "Safety chains"),
      ],
      accessories: accessories("accessories", [
        { id: "straps", label: "Straps" },
        { id: "chains", label: "Chains" },
        { id: "pins", label: "Pins" },
        { id: "spare", label: "Spare tire" },
      ]),
    }
  ),

  mini_excavator_skid_steer: buildOutboundTemplate(
    {
      key: "mini_excavator_skid_steer",
      name: "Mini excavator / skid steer (outbound)",
      description: "Baseline: hours, fuel, tracks, hydraulics, attachment, and accessories issued.",
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
      ],
      accessories: accessories("accessories", [
        { id: "keys", label: "Keys" },
        { id: "attachments", label: "Attachments" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  portable_generator: buildOutboundTemplate(
    {
      key: "portable_generator",
      name: "Portable generator (outbound)",
      description: "Baseline: run hours, fuel, oil, cords/outlets, and accessories issued.",
      equipmentTypes: ["Portable generator", "Towable generator"],
    },
    {
      photos: [photoSlot("overall_photo", "Overall photo")],
      condition: [
        meter("run_hours", "Run hours", { unit: "hours", required: false }),
        fuel(),
        passFail("oil_level", "Oil level"),
        passFail("cords_outlets", "Cords / outlets"),
      ],
      accessories: accessories("accessories", [
        { id: "cords", label: "Cords" },
        { id: "wheel_kit", label: "Wheel kit" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  plate_compactor: buildOutboundTemplate(
    {
      key: "plate_compactor",
      name: "Plate compactor (outbound)",
      description: "Baseline: fuel, plate, belt/guard, and accessories issued.",
      equipmentTypes: ["Plate compactor", "Compactor"],
    },
    {
      photos: [photoSlot("overall_photo", "Overall photo")],
      condition: [fuel(), passFail("plate_condition", "Plate condition"), passFail("belt_guard", "Belt / guard")],
      accessories: accessories("accessories", [
        { id: "water_kit", label: "Water kit" },
        { id: "manual", label: "Manual" },
      ]),
    }
  ),

  electrical_test_equipment: buildOutboundTemplate(
    {
      key: "electrical_test_equipment",
      name: "Electrical test equipment (outbound)",
      description: "Baseline: leads/probes, case/screen, battery, and accessories issued.",
      equipmentTypes: ["Electrical test equipment", "Test equipment"],
    },
    {
      photos: [photoSlot("equipment_case_photo", "Equipment / case photo")],
      condition: [
        passFail("leads_probes", "Leads / probes"),
        passFail("case_screen", "Case / screen"),
        passFail("battery_charge", "Battery / charge"),
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

  generic: buildOutboundTemplate(
    {
      key: "generic",
      name: "Generic equipment (outbound)",
      description: "A general outbound baseline for any equipment.",
      equipmentTypes: ["Any equipment"],
    },
    {
      photos: [photoSlot("overview_photos", "Overview photos", { max: 6 })],
      condition: [fuel()],
      accessories: yesNo("accessories_issued", "Accessories issued?", { flag: "accessories" }),
    }
  ),
} as const satisfies Record<string, InspectionTemplate>;

export type OutboundTemplateKey = keyof typeof OUTBOUND_TEMPLATES;
export const OUTBOUND_TEMPLATE_KEYS = Object.keys(OUTBOUND_TEMPLATES) as OutboundTemplateKey[];
export const GENERIC_OUTBOUND_KEY: OutboundTemplateKey = "generic";

export function isOutboundTemplateKey(value: unknown): value is OutboundTemplateKey {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(OUTBOUND_TEMPLATES, value)
  );
}

export function getOutboundTemplate(key: OutboundTemplateKey): InspectionTemplate {
  return OUTBOUND_TEMPLATES[key];
}

/**
 * Resolve the outbound template for an asset: the asset's explicit system key (mirrored as an outbound
 * key) → the exact category suggestion → generic. Outbound has no custom (org) templates in Phase 3A.
 */
export function resolveOutboundTemplate(input: {
  assignmentKey: string | null | undefined;
  category: string | null | undefined;
}): InspectionTemplate {
  if (input.assignmentKey && isOutboundTemplateKey(input.assignmentKey)) {
    return getOutboundTemplate(input.assignmentKey);
  }
  const suggested = suggestTemplateKeyFromCategory(input.category);
  if (suggested && isOutboundTemplateKey(suggested)) return getOutboundTemplate(suggested);
  return getOutboundTemplate(GENERIC_OUTBOUND_KEY);
}
