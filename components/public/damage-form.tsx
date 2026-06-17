"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { submitDamageReport, type DamageFormState } from "@/lib/forms/actions";
import { HONEYPOT_FIELD, URGENCY_LEVELS } from "@/lib/forms/validate";
import { ALLOWED_IMAGE_TYPES, MAX_FILES } from "@/lib/forms/media";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export function DamageForm({ shortCode }: { shortCode: string }) {
  const action = submitDamageReport.bind(null, shortCode);
  const [state, formAction, pending] = useActionState<DamageFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Your name *</span>
        <input className={inputClass} name="name" autoComplete="name" required />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input className={inputClass} type="email" name="email" autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Phone</span>
          <input className={inputClass} type="tel" name="phone" autoComplete="tel" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Provide an email or a phone number so the rental company can follow up.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Urgency</span>
        <select className={inputClass} name="urgency" defaultValue="medium">
          {URGENCY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level[0].toUpperCase() + level.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">What&apos;s damaged? *</span>
        <textarea className={inputClass} name="description" rows={4} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Photos * (up to {MAX_FILES}, 10 MB each)</span>
        <input
          className={inputClass}
          type="file"
          name="media"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          required
        />
      </label>

      {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit damage report"}
      </Button>
    </form>
  );
}
