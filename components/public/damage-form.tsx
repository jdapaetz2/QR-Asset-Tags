"use client";

import { submitDamageReport } from "@/lib/forms/actions";
import { PublicForm, fieldClass } from "@/components/public/public-form";
import { TriageChoiceGroup } from "@/components/public/triage-choice-group";
import {
  DAMAGE_SEVERITY_OPTIONS,
  EQUIPMENT_STATE_OPTIONS,
  RESPONSE_NEED_OPTIONS,
  TRIAGE_FIELDS,
  TRIAGE_VERSION,
  TRIAGE_VERSION_FIELD,
} from "@/lib/submissions/triage";

export function DamageForm({ shortCode }: { shortCode: string }) {
  return (
    <PublicForm
      action={submitDamageReport.bind(null, shortCode)}
      submitLabel="Submit damage report"
      requireName
      contactNote="Provide an email or a phone number so the rental company can follow up."
    >
      {/* Engineering Phase D2: optional, unselected reported triage. The marker tells the server this page asks them. */}
      <input type="hidden" name={TRIAGE_VERSION_FIELD} value={TRIAGE_VERSION} readOnly />

      <TriageChoiceGroup
        name={TRIAGE_FIELDS.equipmentState}
        legend="Can the equipment be used?"
        options={EQUIPMENT_STATE_OPTIONS}
      />
      <TriageChoiceGroup
        name={TRIAGE_FIELDS.responseNeed}
        legend="How soon do you need help?"
        options={RESPONSE_NEED_OPTIONS}
      />
      <TriageChoiceGroup
        name={TRIAGE_FIELDS.damageSeverity}
        legend="How serious does the damage look?"
        options={DAMAGE_SEVERITY_OPTIONS}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">What&apos;s damaged? *</span>
        <textarea className={fieldClass} name="description" rows={4} required />
      </label>
    </PublicForm>
  );
}
