"use client";

import { submitDamageReport } from "@/lib/forms/actions";
import { URGENCY_LEVELS } from "@/lib/forms/validate";
import { PublicForm, fieldClass } from "@/components/public/public-form";

export function DamageForm({ shortCode }: { shortCode: string }) {
  return (
    <PublicForm
      action={submitDamageReport.bind(null, shortCode)}
      submitLabel="Submit damage report"
      requireName
      contactNote="Provide an email or a phone number so the rental company can follow up."
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Urgency</span>
        <select className={fieldClass} name="urgency" defaultValue="medium">
          {URGENCY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level[0].toUpperCase() + level.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">What&apos;s damaged? *</span>
        <textarea className={fieldClass} name="description" rows={4} required />
      </label>
    </PublicForm>
  );
}
