import Link from "next/link";

import { PRODUCT_NAME } from "@/lib/constants";
import { requireProfile, ownOrgActive, landingPathForRole } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Suspended-account message for customer users whose organization has been suspended by
 * the platform owner (Wave 5E.1). Deliberately org-agnostic: it needs only the auth
 * user/profile, never tenant data (which RLS denies under suspension). Anyone whose org
 * is still active — and every platform owner — is sent to their normal landing, so this
 * page only ever shows to a genuinely suspended customer.
 */
export default async function SuspendedAccountPage() {
  const profile = await requireProfile();
  if (await ownOrgActive(profile)) {
    redirect(landingPathForRole(profile.role));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border text-muted-foreground">
          !
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Account suspended</h1>
        <p className="text-sm text-muted-foreground">
          Your organization&apos;s {PRODUCT_NAME} account is currently suspended. Contact{" "}
          {PRODUCT_NAME} for help.
        </p>
        <Link
          href="/login"
          className="mt-2 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
