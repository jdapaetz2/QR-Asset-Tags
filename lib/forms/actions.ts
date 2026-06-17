"use server";

import {
  readString,
  submitPublicForm,
  type PublicFormState,
} from "@/lib/forms/submit";
import {
  validateDamageReport,
  validateReturnChecklist,
  validateSupportRequest,
} from "@/lib/forms/validate";

/** Public damage-report intake. */
export async function submitDamageReport(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const urgency = readString(formData, "urgency");
  const description = readString(formData, "description");

  return submitPublicForm(shortCode, formData, {
    formType: "damage_report",
    thanksSlug: "damage",
    fieldError: validateDamageReport({ name, email, phone, urgency, description }),
    submittedBy: { name, email, phone },
    dataJson: { urgency: urgency ?? null, description },
  });
}

/** Public support-request intake. */
export async function submitSupportRequest(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const preferred = readString(formData, "preferred_contact_method");
  const description = readString(formData, "description");

  return submitPublicForm(shortCode, formData, {
    formType: "support_request",
    thanksSlug: "support",
    fieldError: validateSupportRequest({
      name,
      email,
      phone,
      preferred_contact_method: preferred,
      description,
    }),
    submittedBy: { name, email, phone },
    dataJson: { preferred_contact_method: preferred ?? null, description },
  });
}

/** Public return-checklist intake (contact optional). */
export async function submitReturnChecklist(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const condition_notes = readString(formData, "condition_notes");
  const fuel_or_charge_level = readString(formData, "fuel_or_charge_level");
  const cleaned = readString(formData, "cleaned");
  const accessories_returned = readString(formData, "accessories_returned");
  const damage_observed = readString(formData, "damage_observed");

  return submitPublicForm(shortCode, formData, {
    formType: "return_checklist",
    thanksSlug: "return",
    fieldError: validateReturnChecklist({
      name,
      email,
      phone,
      condition_notes,
      fuel_or_charge_level,
      cleaned,
      accessories_returned,
      damage_observed,
    }),
    submittedBy: { name, email, phone },
    dataJson: {
      condition_notes,
      fuel_or_charge_level,
      cleaned: cleaned ?? null,
      accessories_returned: accessories_returned ?? null,
      damage_observed: damage_observed ?? null,
    },
  });
}
