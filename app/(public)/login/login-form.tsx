"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signInWithMagicLink, signInWithPassword } from "@/lib/auth/actions";

type Mode = "magic" | "password";

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

        <Button type="submit">
          {mode === "magic" ? "Send magic link" : "Sign in"}
        </Button>
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
    </div>
  );
}
