import Link from "next/link";

import { PRODUCT_NAME } from "@/lib/constants";
import { signOut } from "@/lib/auth/actions";
import { navForRole } from "@/lib/auth/nav";
import { ROLES, roleLabel } from "@/lib/auth/roles";
import type { Profile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { BrandLockup } from "@/components/brand/brand";
import { brandFontVars } from "@/app/fonts";

/**
 * Shared authenticated shell: product mark, role-based nav (active-route aware),
 * signed-in identity, and sign-out. Generic and data-driven — no customer branding is
 * hard-coded. Nav content + role boundary come from navForRole (unchanged). The
 * Submissions link carries a live "new" badge for customer roles.
 */
export async function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const nav = navForRole(profile.role);
  const home = profile.role === ROLES.PLATFORM_OWNER ? "/owner" : "/dashboard";

  // Live "new submissions" count for the nav badge (customer roles only; RLS-scoped).
  let submissionsNew = 0;
  if (profile.role !== ROLES.PLATFORM_OWNER && profile.organization_id) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    submissionsNew = count ?? 0;
  }

  return (
    <div className={`${brandFontVars} font-sans flex min-h-full flex-col`}>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href={home} aria-label={`${PRODUCT_NAME} home`} className="flex items-center">
              <BrandLockup className="h-6 w-auto" />
            </Link>
            <NavLinks items={nav} badgeCounts={{ submissions_new: submissionsNew }} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-foreground">
                {profile.email ?? profile.name ?? "Signed in"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {roleLabel(profile.role)}
              </span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
