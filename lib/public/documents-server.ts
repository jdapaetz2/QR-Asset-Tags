import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isHttpUrl } from "@/lib/documents/validate";
import { signPaths } from "@/lib/storage/signed-urls";
import { normalizeLinkStatus, type DocRow, type PublicDocument } from "./documents";

/**
 * The server half of public-document loading, split out in Phase C4.
 *
 * WHY IT IS A SEPARATE MODULE. `lib/public/documents.ts` is imported by client components
 * (`public-scanner-view.tsx` pulls in `findDocumentHref` and `isDocumentOpenable` as real runtime
 * values, not just types), so that module is part of the scan page's CLIENT bundle. The signing
 * helper is `server-only`, and importing it there would drag a server-only module into a Client
 * Component graph — Turbopack fails the build for exactly that reason, correctly.
 *
 * Keeping the query here means the client-safe module stays client-safe, and the scan route no
 * longer ships this function's code to the browser at all — which matters on `/t/`, where the
 * standing rule is no new client JS.
 */

const DOCUMENTS_BUCKET = "documents";
/** Unchanged from the per-path signing this replaced. */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Public documents for the /t/[shortCode] page. Visibility is enforced by RLS: the anon
 * `documents_public_select` policy returns only public documents of public assets, and the anon
 * `documents public read` storage policy permits signing only those hosted objects. Private
 * documents are never read or signed.
 *
 * `link_status` is carried through so the page can suppress known-broken links and soften ones
 * flagged for review (we never auto-check links here).
 */
export async function getPublicDocuments(
  supabase: SupabaseClient,
  assetId: string
): Promise<PublicDocument[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, title, document_type, url, storage_path, link_status")
    .eq("asset_id", assetId)
    .order("document_type", { ascending: true });

  const rows = (data ?? []) as DocRow[];
  const docs: PublicDocument[] = [];

  /**
   * Phase C4. This loop used to `await createSignedUrl` once per hosted document, SEQUENTIALLY — the
   * only serial N+1 in the signing inventory, and it sat on the public scan page, the route a renter
   * reaches from a physical tag and the most latency-sensitive surface in the product. Signing now
   * happens once for all hosted paths before the loop; the loop keeps its external-vs-hosted
   * branching and its ordering exactly as they were.
   */
  const hostedPaths = rows
    .filter((r) => !r.url && r.storage_path)
    .map((r) => r.storage_path as string);
  const signedByPath = await signPaths(
    supabase,
    DOCUMENTS_BUCKET,
    hostedPaths,
    SIGNED_URL_TTL_SECONDS,
    "public-documents"
  );

  for (const row of rows) {
    const link_status = normalizeLinkStatus(row.link_status);
    if (row.url) {
      // Only render valid http(s) links.
      if (isHttpUrl(row.url)) {
        docs.push({
          id: row.id,
          title: row.title,
          document_type: row.document_type,
          href: row.url,
          external: true,
          link_status,
        });
      }
      continue;
    }
    if (row.storage_path) {
      const signedUrl = signedByPath.get(row.storage_path);
      // Unchanged behaviour: a document that could not be signed is omitted rather than rendered
      // with a raw storage path.
      if (signedUrl) {
        docs.push({
          id: row.id,
          title: row.title,
          document_type: row.document_type,
          href: signedUrl,
          external: false,
          link_status,
        });
      }
      // If signing fails (e.g. policy not yet applied), skip silently.
    }
  }

  return docs;
}
