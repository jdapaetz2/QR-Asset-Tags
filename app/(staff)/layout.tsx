/**
 * Staff scanner surface (Phase 3A). A minimal, mobile-first, system-font layout — NOT the admin AppShell.
 * Like the public `/t/` scan pages, these routes stay webfont-free (they are reached by scanning a tag).
 * Each page guards its own access + cross-org 404 via `lib/staff/guard.ts`.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
