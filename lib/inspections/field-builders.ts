/**
 * Generic inspection-field builders shared by the curated return (Phase 1) and outbound (Phase 3A)
 * system templates. Pure, inspection-type-agnostic — they only construct `InspectionField` objects.
 */
import type { InspectionField } from "@/lib/inspections/types";

export function photoSlot(
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

export function passFail(id: string, label: string): InspectionField {
  return { id, type: "pass_fail_na", label, required: true };
}

export function yesNo(
  id: string,
  label: string,
  opts: { required?: boolean; flag?: "damage_observed" | "accessories" } = {}
): InspectionField {
  return { id, type: "yes_no", label, required: opts.required ?? true, flag: opts.flag };
}

export function meter(
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

export function fuel(id = "fuel_or_charge_level", label = "Fuel / charge level"): InspectionField {
  return { id, type: "fuel_charge_level", label, required: false };
}

export function shortText(id: string, label: string, required = false): InspectionField {
  return { id, type: "short_text", label, required };
}

export function longText(id: string, label: string, required = false): InspectionField {
  return { id, type: "long_text", label, required };
}

export function select(
  id: string,
  label: string,
  options: { value: string; label: string }[],
  required = true
): InspectionField {
  return { id, type: "select", label, options, required };
}

export function accessories(
  id: string,
  items: { id: string; label: string }[]
): InspectionField {
  return { id, type: "accessory_checklist", label: "Accessories", items, flag: "accessories" };
}

export function accessoriesReturned(): InspectionField {
  return yesNo("accessories_returned", "Accessories returned?", { flag: "accessories" });
}
