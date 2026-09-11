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
import { captureDamageReport, captureSupportRequest } from "@/lib/forms/triage-capture";
import { submitReturnInspectionCore } from "@/lib/inspections/submit";
import { submitOutboundInspectionCore } from "@/lib/inspections/outbound-submit";
import { submitStaffReturnInspectionCore } from "@/lib/inspections/staff-return-submit";
import { preparePublicUploads, prepareStaffUploads } from "@/lib/forms/upload-prepare";
import type { PrepareUploadsRequest, PrepareUploadsResult } from "@/lib/forms/upload-contract";

/**
 * Public damage-report intake. Engineering Phase D2: optional reported triage answers are validated and stored by
 * `captureDamageReport`; a post from a page rendered before D2 is stored in its legacy `urgency` shape.
 */
export async function submitDamageReport(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const description = readString(formData, "description");
  const capture = captureDamageReport(formData, description);

  return submitPublicForm(shortCode, formData, {
    formType: "damage_report",
    thanksSlug: "damage",
    fieldError: validateDamageReport({ name, email, phone, urgency: capture.legacyUrgency, description }),
    submittedBy: { name, email, phone },
    dataJson: capture.dataJson,
    callNow: capture.callNow,
  });
}

/** Public support-request intake, with the same optional D2 triage capture. */
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
  const capture = captureSupportRequest(formData, { preferredContactMethod: preferred, description });

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
    dataJson: capture.dataJson,
    callNow: capture.callNow,
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

/**
 * Authenticated STAFF return inspection intake (Phase 3A.1). Records the return condition and COMPLETES the
 * physical return atomically (closes the rental session + clears the asset pointer). Guarded to the caller's
 * own organization by the staff guard; no renter contact/acknowledgement; identity derived from the session.
 */
export async function submitStaffReturnInspection(
  shortCode: string,
  _prev: PublicFormState,
  formData: FormData
): Promise<PublicFormState> {
  return submitStaffReturnInspectionCore(shortCode, formData);
}

// ---------------------------------------------------------------------------
// Direct photo uploads, step 1 (lib/forms/upload-contract.ts): metadata in, path-bound signed upload URLs out.
// ---------------------------------------------------------------------------

export async function prepareDamageUploads(
  shortCode: string,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  return preparePublicUploads(shortCode, "damage", request);
}

export async function prepareSupportUploads(
  shortCode: string,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  return preparePublicUploads(shortCode, "support", request);
}

export async function prepareReturnUploads(
  shortCode: string,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  return preparePublicUploads(shortCode, "return", request);
}

export async function prepareOutboundUploads(
  shortCode: string,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  return prepareStaffUploads(shortCode, "outbound", request);
}

export async function prepareStaffReturnUploads(
  shortCode: string,
  request: PrepareUploadsRequest
): Promise<PrepareUploadsResult> {
  return prepareStaffUploads(shortCode, "staff_return", request);
}
