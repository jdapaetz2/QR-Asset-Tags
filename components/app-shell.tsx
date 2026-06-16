import Link from "next/link";

import { PRODUCT_NAME } from "@/lib/constants";
import { signOut } from "@/lib/auth/actions";
import { navForRole } from "@/lib/auth/nav";
import type { Profile } from "@/lib/auth/session";

/**
 * Shared authenticated shell: product name, role-based nav, signed-in identity,
 * and sign-out. Generic and data-driven — no customer branding is hard-coded.
 */
export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const nav = navForRole(profile.role);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold tracking-tight">{PRODUCT_NAME}</span>
            <nav className="flex items-center gap-4 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {profile.email ?? profile.name ?? "Signed in"}
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
