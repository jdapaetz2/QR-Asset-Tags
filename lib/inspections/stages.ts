/**
 * Presentational stage grouping for the guided return inspection (Phase 3C.1). Pure, no I/O. Collapses any
 * template — system, organization-customized, or outbound — into at most THREE primary stages:
 *   1. Condition       — overview photos, meters, fuel, operational/condition checks
 *   2. Return details  — cleanliness, accessories, damage, additional photos, acknowledgement
 *   3. Review & submit — (rendered by the form, not a template section)
 *
 * A section's stage comes from its optional `stage` field; when absent it is inferred from the section id so
 * old snapshots and custom templates group correctly without any template change. Everything not explicitly
 * a return-detail section falls into Condition, so no template can ever produce a fourth+ stage.
 */
import type { InspectionSection, InspectionStage } from "@/lib/inspections/types";

/** The two IN-FORM stages (Review is the third primary stage, owned by the renderer). */
export const INSPECTION_STAGES: InspectionStage[] = ["condition", "return_details"];

/** Section ids that belong to the Return-details stage by default (system + outbound templates use these). */
const RETURN_DETAIL_SECTION_IDS = new Set([
  "accessories",
  "damage_details",
  "additional_photos",
  "confirmation",
]);

/** The stage a section renders in: its explicit `stage`, else inferred from the section id. */
export function sectionStage(section: InspectionSection): InspectionStage {
  if (section.stage) return section.stage;
  return RETURN_DETAIL_SECTION_IDS.has(section.id) ? "return_details" : "condition";
}
