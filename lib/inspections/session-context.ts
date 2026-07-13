/**
 * Pure helpers that give a staff member operational CONTEXT while inspecting a return (Phase 3B):
 * compact outbound baseline hints keyed by field id, and a short summary of a renter's return report.
 * No I/O. Nothing here pre-fills or constrains the staff answers — it is reference only.
 */
import type { ReturnInspectionData } from "@/lib/inspections/types";
import { returnChecklistFlags } from "@/lib/submissions/returns";
import { submissionReference } from "@/lib/submissions/inbox";

function passFailLabel(v: string): string {
  if (v === "na") return "N/A";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Short per-field hints from the OUTBOUND baseline, keyed by field id — e.g. `engine_hours → "Outbound:
 * 783 hours"`, `accessories → "Expected: cords, wheel kit, manual"`, a pass/fail → "Outbound: Pass",
 * a photo slot → "Outbound photo available". Only fields with a recorded value produce a hint. Returns an
 * empty object for a null/absent baseline (the caller shows "No outbound baseline recorded").
 */
export function outboundBaselineHints(
  outbound: ReturnInspectionData | null | undefined
): Record<string, string> {
  const hints: Record<string, string> = {};
  if (!outbound) return hints;
  const values = outbound.answers?.values ?? {};
  const photos = outbound.answers?.photos ?? {};

  for (const section of outbound.template_snapshot?.sections ?? []) {
    for (const field of section.fields) {
      const raw = values[field.id];
      switch (field.type) {
        case "numeric_meter": {
          if (raw === undefined || raw === null || raw === "") break;
          hints[field.id] = `Outbound: ${raw}${field.unit ? ` ${field.unit}` : ""}`;
          break;
        }
        case "fuel_charge_level":
        case "short_text":
        case "long_text": {
          if (typeof raw === "string" && raw.trim()) hints[field.id] = `Outbound: ${raw.trim()}`;
          break;
        }
        case "pass_fail_na": {
          if (typeof raw === "string" && raw) hints[field.id] = `Outbound: ${passFailLabel(raw)}`;
          break;
        }
        case "yes_no": {
          if (raw === "yes" || raw === "no") {
            hints[field.id] = `Outbound: ${raw === "yes" ? "Yes" : "No"}`;
          }
          break;
        }
        case "select": {
          if (typeof raw === "string" && raw) {
            const label = field.options?.find((o) => o.value === raw)?.label ?? raw;
            hints[field.id] = `Outbound: ${label}`;
          }
          break;
        }
        case "accessory_checklist": {
          const map = (raw as Record<string, string>) ?? {};
          const issued = (field.items ?? [])
            .filter((it) => map[it.id] !== "missing" && map[it.id] !== "na")
            .map((it) => it.label);
          const list = issued.length > 0 ? issued : (field.items ?? []).map((it) => it.label);
          if (list.length > 0) hints[field.id] = `Expected: ${list.join(", ")}`;
          break;
        }
        case "photo_slot": {
          if ((photos[field.id]?.length ?? 0) > 0) hints[field.id] = "Outbound photo available";
          break;
        }
        default:
          break;
      }
    }
  }
  return hints;
}

const NOTE_KEYS = ["condition_notes", "general_condition", "deck_condition", "notes"] as const;

/** First non-empty free-text condition note from a V2 answers map (best-effort). */
function extractNotes(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as { answers?: { values?: Record<string, unknown> } } & Record<string, unknown>;
  const values = obj.answers?.values ?? obj; // V2 answers.values, or V1 flat
  for (const key of NOTE_KEYS) {
    const v = (values as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export type RenterReportSummary = {
  id: string;
  reference: string;
  createdAt: string;
  damage: boolean;
  missing: boolean;
  notes: string | null;
  photoCount: number;
};

/**
 * Compact summary of a renter's return report for the staff pre-inspection context card. Reads the
 * damage/missing flags via `returnChecklistFlags` (V1 + V2), a best-effort condition note, and the
 * attachment count. Pure — the caller renders it and links to the full report.
 */
export function summarizeRenterReport(row: {
  id: string;
  created_at: string;
  submission_data_json: unknown;
  media_urls: unknown;
}): RenterReportSummary {
  const flags = returnChecklistFlags(row.submission_data_json);
  return {
    id: row.id,
    reference: submissionReference(row.id, row.created_at),
    createdAt: row.created_at,
    damage: flags.damage,
    missing: flags.missing,
    notes: extractNotes(row.submission_data_json),
    photoCount: Array.isArray(row.media_urls) ? row.media_urls.length : 0,
  };
}
