"use client";

import { useActionState } from "react";

type ActionState = { error?: string };

type ActionFn = (
  state: ActionState,
  formData: FormData
) => Promise<ActionState>;

/**
 * Submit button backed by a server action (bound to its fixed args by the
 * caller). Surfaces the action's error via useActionState; on success the
 * action redirects. Used for the publish toggle and QR link controls.
 */
export function ActionButton({
  action,
  children,
  variant = "primary",
}: {
  action: ActionFn;
  children: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  const base =
    "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-50";
  const styles =
    variant === "outline"
      ? "border hover:bg-accent hover:text-accent-foreground"
      : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button type="submit" disabled={pending} className={`${base} ${styles}`}>
        {children}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
