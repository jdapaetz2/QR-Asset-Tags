import { revalidatePath } from "next/cache";

/**
 * Invalidate every surface whose submission counts/rows can change after a status mutation (Phase 3C.4).
 *
 * The nav "new submissions" badge lives in the shared authenticated **layout** (`components/app-shell.tsx`),
 * which the App Router preserves across soft navigations and only refetches when its segment is invalidated.
 * Before this helper, no mutation revalidated anything, so the badge only refreshed on a full page reload. The
 * `"layout"` second argument is essential — it busts the layout segment (and its badge), not just the page.
 *
 * Call after EVERY successful submission-status mutation: single status change, Mark returned & resolve, staff
 * return completion, bulk status change, and public submission creation. Server-only (uses `next/cache`); never
 * import into a client component. No polling, no `router.refresh` — the revalidation drives the refresh.
 */
export function revalidateSubmissionSurfaces(): void {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/submissions");
}
