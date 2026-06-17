"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { PublicFormState } from "@/lib/forms/submit";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import { ALLOWED_IMAGE_TYPES, MAX_FILES } from "@/lib/forms/media";

export const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

type PublicFormAction = (
  state: PublicFormState,
  formData: FormData
) => Promise<PublicFormState>;

/**
 * Shared public-form shell: name + contact + a form-specific section
 * (`children`) + optional media + honeypot + submit. Used by the damage,
 * support, and return forms so layout and anti-abuse stay consistent.
 */
export function PublicForm({
  action,
  submitLabel,
  requireName = false,
  contactNote,
  children,
}: {
  action: PublicFormAction;
  submitLabel: string;
  requireName?: boolean;
  contactNote: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<PublicFormState, FormData>(
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
        <span className="font-medium">Your name{requireName ? " *" : ""}</span>
        <input
          className={fieldClass}
          name="name"
          autoComplete="name"
          required={requireName}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input className={fieldClass} type="email" name="email" autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Phone</span>
          <input className={fieldClass} type="tel" name="phone" autoComplete="tel" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{contactNote}</p>

      {children}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Photos (optional, up to {MAX_FILES}, 10 MB each)
        </span>
        <input
          className={fieldClass}
          type="file"
          name="media"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
        />
        <span className="text-xs text-muted-foreground">
          Photos are optional but helpful, especially for visible damage.
        </span>
      </label>

      {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : submitLabel}
      </Button>
    </form>
  );
}
