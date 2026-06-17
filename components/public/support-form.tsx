"use client";

import { submitSupportRequest } from "@/lib/forms/actions";
import { PREFERRED_CONTACT_METHODS } from "@/lib/forms/validate";
import { PublicForm, fieldClass } from "@/components/public/public-form";

export function SupportForm({ shortCode }: { shortCode: string }) {
  return (
    <PublicForm
      action={submitSupportRequest.bind(null, shortCode)}
      submitLabel="Send support request"
      requireName
      contactNote="Provide an email or a phone number so the rental company can reach you."
    >
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
        <span className="font-medium">What do you need help with? *</span>
        <textarea className={fieldClass} name="description" rows={4} required />
      </label>
    </PublicForm>
  );
}
