"use client";

import { submitReturnChecklist } from "@/lib/forms/actions";
import { YES_NO } from "@/lib/forms/validate";
import { PublicForm, fieldClass } from "@/components/public/public-form";

function YesNo({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select className={fieldClass} name={name} defaultValue="no">
        {YES_NO.map((value) => (
          <option key={value} value={value}>
            {value[0].toUpperCase() + value.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReturnForm({ shortCode }: { shortCode: string }) {
  return (
    <PublicForm
      action={submitReturnChecklist.bind(null, shortCode)}
      submitLabel="Submit return checklist"
      contactNote="Contact info is optional — add it if you'd like a follow-up."
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Condition notes</span>
        <textarea className={fieldClass} name="condition_notes" rows={3} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Fuel / charge level</span>
        <input
          className={fieldClass}
          name="fuel_or_charge_level"
          placeholder="e.g. Full, 1/2 tank, fully charged"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <YesNo name="cleaned" label="Cleaned?" />
        <YesNo name="accessories_returned" label="Accessories returned?" />
        <YesNo name="damage_observed" label="Damage observed?" />
      </div>
    </PublicForm>
  );
}
