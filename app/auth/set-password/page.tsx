import { requireProfile } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { setPassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

// Auth-scoped; never cache.
export const dynamic = "force-dynamic";

/**
 * Set a password for the signed-in user. Reachable by authenticated invited users
 * (getProfile allows `invited`); disabled users are denied by requireProfile →
 * /login. The action only ever changes the caller's own password + profile.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireProfile();
  const sp = await searchParams;
  const error = firstString(sp.error);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          Set your password
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Choose a password to finish setting up your {PRODUCT_NAME} account. You&apos;ll
          use your email and this password to sign in.
        </p>

        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <form action={setPassword} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New password</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Confirm password</span>
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              className={inputClass}
            />
          </label>
          <Button type="submit">Set password &amp; continue</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>
    </main>
  );
}
