"use server";

import {
  readString,
  submitPublicForm,
  type PublicFormState,
} from "@/lib/forms/submit";
import {
  validateDamageReport,
  validateSupportRequest,
} from "@/lib/forms/validate";
import { submitReturnInspectionCore } from "@/lib/inspections/submit";
import { submitOutboundInspectionCore } from "@/lib/inspections/outbound-submit";

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

/**
 * Public guided return INSPECTION intake (contact optional). Replaces the flat return checklist:
 * the template + snapshot + flags + rental session are all derived server-side (Return Inspection V2,
 * Phase 1A). Still writes `form_type='return_checklist'` so the RPC / inbox / mark-resolve are unchanged.
 */
export async function submitReturnInspection(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  return submitReturnInspectionCore(shortCode, formData);
}

/**
 * Authenticated STAFF outbound (pre-use) inspection intake (Phase 3A). Records the baseline condition and
 * marks the asset rented atomically. Guarded to the caller's own organization by the staff guard.
 */
export async function submitOutboundInspection(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  return submitOutboundInspectionCore(shortCode, formData);
}
