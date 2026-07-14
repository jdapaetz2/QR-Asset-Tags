/**
 * Pure structured comparison across a rental session's three condition sources (Phase 3B): the OUTBOUND
 * baseline, the RENTER return report(s), and the authenticated STAFF return. No I/O. Everything is keyed by
 * `rental_session_id` upstream; this module only diffs already-loaded V2 payloads that share field ids
 * (the outbound + return system templates do).
 *
 * IMPORTANT — this records DIFFERENCES and flags REVIEW only. It never asserts causation or fault. The note
 * vocabulary is a closed set; there is deliberately no "renter caused / charge / proven customer damage".
 */
import type { InspectionField, ReturnInspectionData } from "@/lib/inspections/types";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { accessoryLabel, accessoryPresence } from "@/lib/inspections/accessories";

export type ComparisonNote =
  | "Difference recorded"
  | "Review recommended"
  | "Renter reported damage"
  | "Staff confirmed damage"
  | "Staff did not confirm reported damage";

export type ComparisonRow = {
  fieldId: string;
  label: string;
  kind: "meter" | "fuel" | "condition" | "select" | "accessory";
  outbound: string | null;
  renter: string | null;
  staff: string | null;
  /** Meter delta (staff − outbound) with unit, when both numeric. */
  delta: string | null;
  changed: boolean;
  note: ComparisonNote | null;
};

export type ConditionSummary = {
  renterDamage: boolean;
  staffDamage: boolean;
  renterMissing: boolean;
  staffMissing: boolean;
  note: ComparisonNote | null;
};

export type SessionComparison = {
  hasOutbound: boolean;
  hasRenter: boolean;
  hasStaff: boolean;
  rows: ComparisonRow[];
  condition: ConditionSummary;
  followUps: string[];
};

type AnyData = ReturnInspectionData | null | undefined;

function isV2(data: unknown): data is ReturnInspectionData {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { schema_version?: unknown }).schema_version === 2
  );
}

function valuesOf(data: AnyData): Record<string, string | number | Record<string, string>> {
  return data?.answers?.values ?? {};
}

function passFailLabel(v: string): string {
  return v === "na" ? "N/A" : v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Human display of a single field's value from a values map (null when unanswered). `inspectionType` selects the
 * accessory vocabulary (outbound: Issued/Not issued; return: Returned/Missing) so each column reads correctly and
 * legacy outbound values normalize (Phase 3C.5).
 */
function fieldDisplay(
  field: InspectionField,
  raw: unknown,
  inspectionType?: string
): string | null {
  if (raw === undefined || raw === null || raw === "") {
    if (field.type !== "accessory_checklist") return null;
  }
  switch (field.type) {
    case "numeric_meter":
      return field.unit ? `${raw} ${field.unit}` : String(raw);
    case "pass_fail_na":
      return typeof raw === "string" ? passFailLabel(raw) : null;
    case "yes_no":
      return raw === "yes" ? "Yes" : raw === "no" ? "No" : null;
    case "select":
      return typeof raw === "string"
        ? field.options?.find((o) => o.value === raw)?.label ?? raw
        : null;
    case "fuel_charge_level":
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    case "accessory_checklist": {
      const map = (raw as Record<string, string>) ?? {};
      const parts = (field.items ?? []).map(
        (it) => `${it.label}: ${accessoryLabel(map[it.id], inspectionType)}`
      );
      return parts.length ? parts.join(" · ") : null;
    }
    default:
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
}

const COMPARABLE = new Set([
  "numeric_meter",
  "fuel_charge_level",
  "pass_fail_na",
  "yes_no",
  "select",
  "accessory_checklist",
]);

function kindOf(field: InspectionField): ComparisonRow["kind"] {
  if (field.type === "numeric_meter") return "meter";
  if (field.type === "fuel_charge_level") return "fuel";
  if (field.type === "select") return "select";
  if (field.type === "accessory_checklist") return "accessory";
  return "condition";
}

/**
 * Build the session comparison. Value rows are produced ONLY when both an outbound baseline and a staff
 * return exist (nothing is fabricated from a single source). The renter column is filled from the earliest
 * V2 renter report when its field ids line up; the damage/missing reconciliation summary spans all sources.
 */
export function buildSessionComparison(input: {
  outbound: AnyData;
  staff: AnyData;
  renterReports: { submission_data_json: unknown }[];
}): SessionComparison {
  const outbound = isV2(input.outbound) ? input.outbound : null;
  const staff = isV2(input.staff) ? input.staff : null;
  const renterPrimary =
    input.renterReports.map((r) => r.submission_data_json).find((d) => isV2(d)) ?? null;
  const renterV2 = isV2(renterPrimary) ? renterPrimary : null;

  const hasOutbound = outbound !== null;
  const hasRenter = input.renterReports.length > 0;
  const hasStaff = staff !== null;

  const rows: ComparisonRow[] = [];
  const followUps: string[] = [];

  if (outbound && staff) {
    const outValues = valuesOf(outbound);
    const staffValues = valuesOf(staff);
    const renterValues = valuesOf(renterV2);

    // Spine = the staff return's fields (the full return set); match outbound by the shared id.
    for (const section of staff.template_snapshot.sections) {
      for (const field of section.fields) {
        if (!COMPARABLE.has(field.type)) continue;
        const outRaw = outValues[field.id];
        const staffRaw = staffValues[field.id];
        if (outRaw === undefined && staffRaw === undefined) continue;

        // Each column labels accessories in its own vocabulary (outbound Issued/Not issued vs return
        // Returned/Missing); presence comparison below is vocabulary-agnostic.
        const outDisp = fieldDisplay(field, outRaw, "outbound");
        const staffDisp = fieldDisplay(field, staffRaw, "return");
        const renterDisp =
          field.id in renterValues ? fieldDisplay(field, renterValues[field.id], "return") : null;

        let delta: string | null = null;
        let changed = false;
        let note: ComparisonNote | null = null;

        if (field.type === "numeric_meter") {
          const o = typeof outRaw === "number" ? outRaw : Number(outRaw);
          const s = typeof staffRaw === "number" ? staffRaw : Number(staffRaw);
          if (Number.isFinite(o) && Number.isFinite(s)) {
            const d = s - o;
            delta = `${d >= 0 ? "+" : ""}${d}${field.unit ? ` ${field.unit}` : ""}`;
            changed = d !== 0;
            if (changed) note = "Difference recorded";
          }
        } else if (field.type === "pass_fail_na") {
          changed = outDisp !== null && staffDisp !== null && outRaw !== staffRaw;
          if (outRaw === "pass" && staffRaw === "fail") note = "Review recommended";
          else if (changed) note = "Difference recorded";
        } else if (field.type === "accessory_checklist") {
          // Vocabulary-agnostic: an accessory the staff return marks absent (missing / not-returned) is the
          // review signal, regardless of whether the row stored legacy or current values.
          const map = (staffRaw as Record<string, string>) ?? {};
          const anyAbsent = Object.values(map).some((v) => accessoryPresence(v) === "absent");
          changed = anyAbsent;
          if (anyAbsent) note = "Review recommended";
        } else {
          changed = outDisp !== null && staffDisp !== null && outDisp !== staffDisp;
          if (changed) note = "Difference recorded";
        }

        rows.push({
          fieldId: field.id,
          label: field.label,
          kind: kindOf(field),
          outbound: outDisp,
          renter: renterDisp,
          staff: staffDisp,
          delta,
          changed,
          note,
        });
        if (changed && note) followUps.push(`${field.label} — ${note}`);
      }
    }
  }

  // Damage / missing reconciliation across all sources (independent of the field-level rows).
  const renterFlags = input.renterReports.map((r) => returnChecklistFlags(r.submission_data_json));
  const renterDamage = renterFlags.some((f) => f.damage);
  const renterMissing = renterFlags.some((f) => f.missing);
  const staffFlags = staff ? returnChecklistFlags(staff) : { damage: false, missing: false };
  const staffDamage = staffFlags.damage;
  const staffMissing = staffFlags.missing;

  let condNote: ComparisonNote | null = null;
  if (renterDamage && staffDamage) condNote = "Staff confirmed damage";
  else if (renterDamage && hasStaff && !staffDamage) condNote = "Staff did not confirm reported damage";
  else if (renterDamage) condNote = "Renter reported damage";
  else if (staffDamage) condNote = "Review recommended";

  if (condNote) followUps.push(`Condition — ${condNote}`);
  if ((renterMissing || staffMissing) && !followUps.some((f) => f.startsWith("Condition"))) {
    followUps.push("Accessories — Review recommended");
  }

  return {
    hasOutbound,
    hasRenter,
    hasStaff,
    rows,
    condition: {
      renterDamage,
      staffDamage,
      renterMissing,
      staffMissing,
      note: condNote,
    },
    followUps,
  };
}

export type PhotoSource = "outbound" | "renter" | "staff";

export type PhotoSlotGroup = {
  source: PhotoSource;
  slotId: string;
  label: string;
  paths: string[];
};

/** Photos grouped by source then slot (paths only; the caller signs URLs). Pure. */
export function photoSlotsBySource(input: {
  outbound: AnyData;
  staff: AnyData;
  renterReports: { submission_data_json: unknown }[];
}): PhotoSlotGroup[] {
  const groups: PhotoSlotGroup[] = [];
  const collect = (source: PhotoSource, data: unknown) => {
    if (!isV2(data)) return;
    const photos = data.answers?.photos ?? {};
    for (const [slotId, list] of Object.entries(photos)) {
      const paths = (list ?? []).map((p) => p.path).filter(Boolean);
      if (paths.length === 0) continue;
      const label = findSlotLabel(data, slotId) ?? slotId;
      groups.push({ source, slotId, label, paths });
    }
  };
  collect("outbound", input.outbound);
  for (const r of input.renterReports) collect("renter", r.submission_data_json);
  collect("staff", input.staff);
  return groups;
}

function findSlotLabel(data: ReturnInspectionData, slotId: string): string | null {
  for (const section of data.template_snapshot.sections) {
    for (const field of section.fields) {
      if (field.id === slotId) return field.label;
    }
  }
  return null;
}
