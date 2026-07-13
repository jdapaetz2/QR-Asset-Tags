/**
 * Build the immutable V2 `submission_data_json` for a return inspection (Phase 1A). Pure, no I/O.
 * The template definition is deep-frozen into `template_snapshot` at submit time so the historical
 * record preserves the EXACT checklist used — even if the system template is later revised.
 */
import type {
  InspectionAnswers,
  InspectionFlags,
  InspectionTemplate,
  ReturnInspectionData,
} from "@/lib/inspections/types";

/** Deep, value-only copy of the template used (frozen historical snapshot). */
export function buildTemplateSnapshot(template: InspectionTemplate): InspectionTemplate {
  return JSON.parse(JSON.stringify(template)) as InspectionTemplate;
}

export function buildReturnSubmissionData(input: {
  template: InspectionTemplate;
  answers: InspectionAnswers;
  flags: InspectionFlags;
}): ReturnInspectionData {
  return {
    schema_version: 2,
    template_key: input.template.key,
    template_version: input.template.version,
    template_snapshot: buildTemplateSnapshot(input.template),
    answers: input.answers,
    flags: input.flags,
  };
}
