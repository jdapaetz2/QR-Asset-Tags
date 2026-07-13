"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  saveCategoryDefault,
  type CategoryDefaultFormState,
} from "@/lib/inspections/category-defaults-actions";
import { RETURN_TEMPLATE_PICKER } from "@/lib/inspections/templates";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Create or change an organization category → default return-template mapping. Upserts server-side on
 * (organization_id, normalized category), so submitting an existing category simply updates it. Category
 * options come from the org's existing categories (datalist) but any exact value may be typed.
 */
export function CategoryDefaultForm({
  categories = [],
  defaultCategory = "",
  defaultTemplateKey = "",
}: {
  categories?: string[];
  defaultCategory?: string;
  defaultTemplateKey?: string;
}) {
  const [state, formAction, pending] = useActionState<CategoryDefaultFormState, FormData>(
    saveCategoryDefault,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Category</span>
          <input
            name="category"
            list="category-default-categories"
            defaultValue={defaultCategory}
            required
            className={inputClass}
            placeholder="e.g. Utility Trailer"
          />
          <datalist id="category-default-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <span className="text-xs text-muted-foreground">
            Matched exactly (case- and spacing-insensitive). New assets and imports in this category use
            the template below.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Default return template</span>
          <select
            name="return_template_key"
            defaultValue={defaultTemplateKey}
            required
            className={inputClass}
          >
            <option value="">— select —</option>
            {RETURN_TEMPLATE_PICKER.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save mapping"}
      </Button>
    </form>
  );
}
