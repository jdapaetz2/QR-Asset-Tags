/**
 * Staff RETURN inspection templates (Yard Staff Scanner Mode, Phase 3A.1). The authenticated staff return
 * reuses the curated SYSTEM return templates (lib/inspections/templates.ts) but WITHOUT the renter
 * acknowledgement — staff identity is derived from the signed-in account, not an attestation checkbox. This
 * module is a pure transform over the resolved system return template; it does NOT introduce a new template
 * registry. Custom (organization) templates are intentionally out of scope here (mirrors the outbound
 * precedent), so resolution is system-only and synchronous.
 */
import type { InspectionSection, InspectionTemplate } from "@/lib/inspections/types";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";

/**
 * Return a copy of a template with every `acknowledgement` (attestation) field removed, dropping any
 * section left empty. Used to build the staff return variant — the staff workflow records who performed
 * the return from the authenticated session, so the renter-facing attestation is not shown.
 */
export function stripAttestation(template: InspectionTemplate): InspectionTemplate {
  const sections: InspectionSection[] = [];
  for (const section of template.sections) {
    const fields = section.fields.filter((f) => f.type !== "acknowledgement");
    if (fields.length === 0) continue; // e.g. the "confirmation" section becomes empty → drop it
    sections.push({ ...section, fields });
  }
  return { ...template, sections };
}

/**
 * Resolve the staff return template for an asset: the same system return template the org would use
 * (explicit key → exact category suggestion → generic), with the attestation stripped. `inspection_type`
 * stays "return"; the staff audience is recorded on the submission (submission_origin + data.audience),
 * not on the template key.
 */
export function resolveStaffReturnTemplate(input: {
  assignmentKey: string | null | undefined;
  category: string | null | undefined;
}): InspectionTemplate {
  return stripAttestation(
    resolveReturnTemplate({ assignmentKey: input.assignmentKey, category: input.category })
  );
}
