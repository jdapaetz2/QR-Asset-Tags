/**
 * Generic, editable equipment-page templates for common rental categories. Pure
 * data — no I/O. These are STARTING POINTS only: deliberately generic, with no
 * detailed safety-critical instructions. Rental staff must verify and edit all
 * equipment-specific content before publishing (see TEMPLATE_VERIFY_NOTE). Pages
 * created from a template default to draft.
 */

export const TEMPLATE_VERIFY_NOTE =
  "Templates are generic starting points. Rental company staff must review and " +
  "verify all equipment-specific content — especially safety and operating " +
  "details — before publishing each page.";

/** The seven editable text fields a template fills (matches EquipmentPageInput). */
export type EquipmentTemplate = {
  headline: string;
  quick_start_text: string;
  safety_notes: string;
  fuel_power_notes: string | null;
  return_notes: string;
  troubleshooting_notes: string;
  emergency_notes: string;
};

const EMERGENCY =
  "For emergencies call your local emergency number. For equipment issues, use the " +
  "support contact on this page.";

const VERIFY_LINE = "Verify these details against the unit before each use.";

export const EQUIPMENT_TEMPLATES = {
  mini_excavator: {
    headline: "Mini excavator — operating guide",
    quick_start_text:
      "Walk around the machine and confirm it is on stable, level ground before " +
      "operating. " + VERIFY_LINE,
    safety_notes:
      "Wear a seatbelt and keep bystanders clear of the swing radius. Confirm the " +
      "work area is clear of people, overhead lines, and underground utilities.",
    fuel_power_notes:
      "Diesel powered. Check fuel and fluid levels before use; do not refuel while " +
      "the engine is running.",
    return_notes:
      "Clean off mud and debris, lower the bucket and blade to the ground, and " +
      "return the key.",
    troubleshooting_notes:
      "If it will not start, confirm the safety lever is down. For any unusual " +
      "noise, leak, or fault, stop and contact support.",
    emergency_notes: EMERGENCY,
  },
  utility_trailer: {
    headline: "Utility trailer — operating guide",
    quick_start_text:
      "Couple to the hitch, latch the coupler, cross and attach the safety chains, " +
      "and connect the lighting plug. Confirm the lights work before towing. " +
      VERIFY_LINE,
    safety_notes:
      "Do not exceed the rated load. Distribute the load evenly and secure it. " +
      "Check tire condition and lights before each trip.",
    fuel_power_notes: null,
    return_notes:
      "Sweep out the bed, secure the ramps and gate, lower the jack, and return " +
      "with the chains coiled.",
    troubleshooting_notes:
      "If the lights do not work, check the plug connection and the tow vehicle " +
      "fuse. If the coupler will not latch, clear debris and confirm the ball size.",
    emergency_notes: EMERGENCY,
  },
  portable_generator: {
    headline: "Portable generator — operating guide",
    quick_start_text:
      "Place on level ground in the open air, well away from doors and windows. " +
      VERIFY_LINE,
    safety_notes:
      "Never run indoors or in enclosed spaces — risk of carbon monoxide. Keep dry " +
      "and do not overload the rated output.",
    fuel_power_notes:
      "Gasoline powered. Check oil and fuel before starting; never refuel while it " +
      "is running.",
    return_notes:
      "Let it cool, wipe down the unit, and return it with the fuel topped off.",
    troubleshooting_notes:
      "If it will not start, check the fuel valve, choke position, and oil level. " +
      "Stop and contact support for any electrical fault.",
    emergency_notes: EMERGENCY,
  },
  plate_compactor: {
    headline: "Plate compactor — operating guide",
    quick_start_text:
      "Confirm the area is clear and the plate is free of debris before starting. " +
      VERIFY_LINE,
    safety_notes:
      "Wear hearing and foot protection. Keep hands and feet away from the base " +
      "plate while running.",
    fuel_power_notes:
      "Gasoline powered. Check engine oil before each use.",
    return_notes:
      "Clean the base plate, let the unit cool, and return with the fuel topped off.",
    troubleshooting_notes:
      "If the plate will not move, confirm the throttle is engaged and the drive " +
      "belt is intact. Stop and contact support for any fault.",
    emergency_notes: EMERGENCY,
  },
  scissor_lift: {
    headline: "Scissor lift — operating guide",
    quick_start_text:
      "Use only on firm, level ground within the rated limits. Confirm guardrails " +
      "are in place and the area overhead is clear. " + VERIFY_LINE,
    safety_notes:
      "Wear required fall protection per site rules. Do not exceed the rated " +
      "capacity or move the lift while elevated unless the unit is rated to do so.",
    fuel_power_notes:
      "Check the power source (battery charge or engine, per the unit) before use.",
    return_notes:
      "Lower the platform fully, clean the deck, and return the unit on charge if " +
      "battery powered.",
    troubleshooting_notes:
      "If it will not raise or lower, confirm the emergency stop is released and " +
      "the unit is on level ground. Stop and contact support for any fault.",
    emergency_notes: EMERGENCY,
  },
  skid_steer: {
    headline: "Skid steer — operating guide",
    quick_start_text:
      "Walk around the machine, confirm the attachment is secured, and fasten the " +
      "seatbelt before operating. " + VERIFY_LINE,
    safety_notes:
      "Keep bystanders clear. Lower attachments before leaving the seat and never " +
      "exceed the rated operating capacity.",
    fuel_power_notes:
      "Diesel powered. Check fuel and fluid levels before use; do not refuel while " +
      "running.",
    return_notes:
      "Clean off debris, lower the attachment to the ground, and return the key.",
    troubleshooting_notes:
      "If it will not start, confirm the seatbelt and safety bar are engaged. Stop " +
      "and contact support for any leak or fault.",
    emergency_notes: EMERGENCY,
  },
  air_compressor: {
    headline: "Air compressor — operating guide",
    quick_start_text:
      "Place on level ground, connect hoses securely, and confirm fittings are " +
      "rated for the pressure before use. " + VERIFY_LINE,
    safety_notes:
      "Wear eye and hearing protection. Never point an air hose at yourself or " +
      "others, and relieve pressure before disconnecting fittings.",
    fuel_power_notes:
      "Check the power source (electric or engine, per the unit). For engine units, " +
      "check oil and fuel before starting.",
    return_notes:
      "Relieve system pressure, coil the hoses, and return all fittings and " +
      "accessories.",
    troubleshooting_notes:
      "If it will not build pressure, check for open valves or loose fittings. " +
      "Stop and contact support for any leak or fault.",
    emergency_notes: EMERGENCY,
  },
  electrical_test_equipment: {
    headline: "Electrical test equipment — handling guide",
    quick_start_text:
      "Inspect the case, leads, probes, and connectors for damage before use. Do " +
      "not use damaged leads. " + VERIFY_LINE,
    safety_notes:
      "Use only within the instrument's rated category and voltage. Inspect leads " +
      "and probes for cracks or exposed conductors before every use, and follow " +
      "your site's electrical safety rules.",
    fuel_power_notes:
      "Battery powered where applicable — check the battery or charge level before " +
      "use and return the unit charged if it is rechargeable.",
    return_notes:
      "Return all leads, probes, clips, and accessories. Gather the leads loosely " +
      "and report any damaged leads or connectors. Confirm the case and connectors " +
      "are in good condition.",
    troubleshooting_notes:
      "If readings are unclear or inconsistent, confirm the correct range and lead " +
      "connections. Note any calibration or verification reminder on the unit, and " +
      "contact support for damaged leads or questionable readings.",
    emergency_notes: EMERGENCY,
  },
} as const satisfies Record<string, EquipmentTemplate>;

export type TemplateKey = keyof typeof EQUIPMENT_TEMPLATES;

export const TEMPLATE_KEYS = Object.keys(EQUIPMENT_TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.prototype.hasOwnProperty.call(EQUIPMENT_TEMPLATES, value);
}

/** Catalog metadata so admins can recognize a template before importing. */
export type TemplateMeta = {
  name: string;
  equipmentType: string;
  description: string;
};

export const TEMPLATE_META: Record<TemplateKey, TemplateMeta> = {
  mini_excavator: {
    name: "Mini excavator",
    equipmentType: "Compact excavator / digger (diesel)",
    description:
      "Walk-around, swing-radius safety, fuel/fluid checks, and return basics for a small tracked excavator.",
  },
  utility_trailer: {
    name: "Utility trailer",
    equipmentType: "Towable utility / flatbed trailer (no engine)",
    description:
      "Coupling, safety chains, lighting check, load safety, and return — no fuel or engine content.",
  },
  portable_generator: {
    name: "Portable generator",
    equipmentType: "Gasoline portable generator",
    description:
      "Open-air placement, carbon-monoxide safety, fueling, and shutdown basics.",
  },
  plate_compactor: {
    name: "Plate compactor",
    equipmentType: "Walk-behind plate compactor (gasoline)",
    description:
      "Operating, hearing/foot PPE, engine-oil check, and return basics.",
  },
  scissor_lift: {
    name: "Scissor lift",
    equipmentType: "Vertical aerial work platform",
    description:
      "Level-ground setup, fall-protection reminder, power check, and return — generic power source.",
  },
  skid_steer: {
    name: "Skid steer",
    equipmentType: "Compact loader with attachments (diesel)",
    description:
      "Walk-around, attachment safety, fuel/fluid checks, and return basics.",
  },
  air_compressor: {
    name: "Air compressor",
    equipmentType: "Portable / towable air compressor",
    description:
      "Hose and fitting safety, pressure handling, power check, and return.",
  },
  electrical_test_equipment: {
    name: "Electrical test equipment",
    equipmentType: "Meters, testers, and probes (no engine or fuel)",
    description:
      "Leads/probes inspection, battery/charge, accessories returned, case/connector condition, and calibration reminders. Intentionally avoids fuel, engine, oil, and hydraulics.",
  },
};

/** The seven editable page fields, in display order, with friendly labels. */
export const TEMPLATE_FIELDS = [
  { key: "headline", label: "Headline" },
  { key: "quick_start_text", label: "Quick start" },
  { key: "safety_notes", label: "Safety" },
  { key: "fuel_power_notes", label: "Fuel / power" },
  { key: "return_notes", label: "Return" },
  { key: "troubleshooting_notes", label: "Troubleshooting" },
  { key: "emergency_notes", label: "Emergency" },
] as const satisfies readonly { key: keyof EquipmentTemplate; label: string }[];

export type TemplateCatalogEntry = TemplateMeta & {
  key: TemplateKey;
  fields: { label: string; value: string | null }[];
};

/** Pure catalog view: metadata + the labeled field content each template inserts. */
export function templateCatalog(): TemplateCatalogEntry[] {
  return TEMPLATE_KEYS.map((key) => {
    const template = EQUIPMENT_TEMPLATES[key];
    return {
      key,
      ...TEMPLATE_META[key],
      fields: TEMPLATE_FIELDS.map(({ key: fieldKey, label }) => ({
        label,
        value: template[fieldKey],
      })),
    };
  });
}
