"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { signInWithMagicLink, signInWithPassword } from "@/lib/auth/actions";
import { loginPendingLabel } from "@/lib/ui/pending-labels";

type Mode = "magic" | "password";

/**
 * The submit button, split out purely so it can call `useFormStatus` — that hook reports the status of
 * the nearest enclosing form, so it must live INSIDE the `<form>`, not alongside it.
 *
 * Phase C8. Sign-in was the worst perceived-responsiveness defect in the product and the only action
 * with no pending state whatsoever: measured on staging at **4566 ms from click to dashboard with
 * nothing changing on screen**. A user with no feedback for four and a half seconds reasonably concludes
 * the click missed and clicks again, which is a duplicate authentication attempt.
 *
 * Disabling on submit is therefore both the feedback and the duplicate-submit guard. The label states an
 * action in progress and never an outcome — sign-in has not succeeded until the server redirects.
 */
function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending
        ? loginPendingLabel(mode)
        : mode === "magic"
          ? "Send magic link"
          : "Sign in"}
    </Button>
  );
}

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export function LoginForm({
  next,
  error,
  sent,
  initialMode,
}: {
  next: string;
  error?: string;
  sent?: boolean;
  initialMode: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Check your email for a sign-in link.
        </p>
      ) : null}

      <form
        action={mode === "magic" ? signInWithMagicLink : signInWithPassword}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="next" value={next} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            className={inputClass}
            type="email"
            name="email"
            autoComplete="email"
            required
          />
        </label>

        {mode === "password" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Password</span>
            <input
              className={inputClass}
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
        ) : null}

        <SubmitButton mode={mode} />
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "magic" ? "password" : "magic")}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {mode === "magic"
          ? "Use email and password instead"
          : "Use a magic link instead"}
      </button>

      {mode === "magic" ? (
        <p className="text-xs text-muted-foreground">
          Magic links depend on email delivery, which isn&apos;t configured yet — if a
          link doesn&apos;t arrive, sign in with your email and password.
        </p>
      ) : null}
    </div>
  );
}
