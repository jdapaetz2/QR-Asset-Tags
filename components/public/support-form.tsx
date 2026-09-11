"use client";

import { submitSupportRequest } from "@/lib/forms/actions";
import { PREFERRED_CONTACT_METHODS } from "@/lib/forms/validate";
import { PublicForm, fieldClass } from "@/components/public/public-form";
import { TriageChoiceGroup } from "@/components/public/triage-choice-group";
import {
  ISSUE_TYPE_OPTIONS,
  RESPONSE_NEED_OPTIONS,
  TRIAGE_FIELDS,
  TRIAGE_VERSION,
  TRIAGE_VERSION_FIELD,
} from "@/lib/submissions/triage";

export function SupportForm({ shortCode }: { shortCode: string }) {
  return (
    <PublicForm
      action={submitSupportRequest.bind(null, shortCode)}
      submitLabel="Send support request"
      requireName
      contactNote="Provide an email or a phone number so the rental company can reach you."
    >
      {/* Engineering Phase D2: optional, unselected reported triage. The marker tells the server this page asks them. */}
      <input type="hidden" name={TRIAGE_VERSION_FIELD} value={TRIAGE_VERSION} readOnly />

      <TriageChoiceGroup
        name={TRIAGE_FIELDS.issueType}
        legend="What do you need help with?"
        options={ISSUE_TYPE_OPTIONS}
      />
      <TriageChoiceGroup
        name={TRIAGE_FIELDS.responseNeed}
        legend="How soon do you need help?"
        options={RESPONSE_NEED_OPTIONS}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Preferred contact method</span>
        <select
          className={fieldClass}
          name="preferred_contact_method"
          defaultValue="phone"
        >
          {PREFERRED_CONTACT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method[0].toUpperCase() + method.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Describe the problem *</span>
        <textarea className={fieldClass} name="description" rows={4} required />
      </label>
    </PublicForm>
  );
}
