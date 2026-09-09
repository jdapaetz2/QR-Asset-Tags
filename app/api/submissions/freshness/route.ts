import { createClient } from "@/lib/supabase/server";
import { getProfile, ownOrgActive } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { countNewSubmissions, latestSubmissionAt } from "@/lib/submissions/counts";

/**
 * Phase C7 — the smallest possible answer to "is the submissions inbox stale?".
 *
 * WHY IT EXISTS. The inbox used to answer that question by re-rendering the entire page every 30 s and
 * comparing nothing: measured on staging, 3 refreshes in 90 idle seconds dragged **63 link prefetches**
 * along with them. This returns two numbers instead, and the client refreshes only when they move.
 *
 * WHAT IT RETURNS: `{ newCount, latest }` and nothing else. **No rows, no ids, no names, no email
 * addresses, no signed URLs.** Both values are already on screen for the same admin in the inbox, so
 * this discloses nothing they cannot already see.
 *
 * AUTHORIZATION. Deliberately NOT `requireOrgContext()`: that helper `redirect()`s, and a redirect to
 * an HTML login page is a nonsense answer to a JSON poll — a fetch would follow it and the client would
 * try to parse a page. This checks the same conditions and answers with status codes.
 *
 * **Every refusal returns the identical body.** Signed-out, platform owner, no organization, suspended
 * organization — all produce `{ ok: false }`. A caller cannot use the shape or size of a refusal to
 * learn whether an organization exists, whether it is suspended, or whether they merely lack a role.
 *
 * Tenant isolation is RLS, exactly as everywhere else: the RLS-scoped client counts only the caller's
 * own organization's rows. **The service-role client is never used here** — freshness is customer data.
 */

// Per-request and auth-scoped: never cached, never prerendered.
export const dynamic = "force-dynamic";

/** One refusal shape for every reason. See the note above on why they are indistinguishable. */
function refuse(status: number): Response {
  return Response.json({ ok: false }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(): Promise<Response> {
  const profile = await getProfile();

  // Not signed in, no profile, or a disabled profile (getProfile already returns null for those).
  if (!profile) return refuse(401);

  // Freshness is a customer-organization concept. A platform owner has no inbox of their own, and
  // answering for them would mean choosing an organization on their behalf.
  if (profile.role === ROLES.PLATFORM_OWNER || !profile.organization_id) return refuse(403);

  // A suspended organization's data stays unreadable here too, so this endpoint cannot become a side
  // channel that keeps reporting counts after access was withdrawn.
  if (!(await ownOrgActive(profile))) return refuse(403);

  const supabase = await createClient();
  const [newCount, latest] = await Promise.all([
    countNewSubmissions(supabase),
    latestSubmissionAt(supabase),
  ]);

  return Response.json(
    { newCount, latest },
    { headers: { "cache-control": "no-store" } }
  );
}
