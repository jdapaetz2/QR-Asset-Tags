import type { SupabaseClient } from "@supabase/supabase-js";

import { isHttpUrl, type LinkStatus } from "@/lib/documents/validate";

/**
 * Public documents for the /t/[shortCode] page. Visibility is enforced by RLS:
 * the anon `documents_public_select` policy returns only public documents of
 * public assets, and the anon `documents public read` storage policy permits
 * signing only those hosted objects. Private documents are never read or signed.
 *
 * `link_status` is carried through so the page can suppress known-broken links
 * and soften ones flagged for review (we never auto-check links here).
 */

const DOCUMENTS_BUCKET = "documents";

export type PublicDocument = {
  id: string;
  title: string;
  document_type: string;
  /** A ready-to-open URL (external link or a short-lived signed URL). */
  href: string;
  external: boolean;
  link_status: LinkStatus;
};

type DocRow = {
  id: string;
  title: string;
  document_type: string;
  url: string | null;
  storage_path: string | null;
  link_status: string | null;
};

function normalizeLinkStatus(value: string | null): LinkStatus {
  return value === "ok" || value === "broken" || value === "needs_review"
    ? value
    : "unknown";
}

/** A document is openable unless it has been flagged broken. */
export function isDocumentOpenable(doc: PublicDocument): boolean {
  return doc.link_status !== "broken";
}

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
      const { data: signed } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(row.storage_path, 3600);
      if (signed?.signedUrl) {
        docs.push({
          id: row.id,
          title: row.title,
          document_type: row.document_type,
          href: signed.signedUrl,
          external: false,
          link_status,
        });
      }
      // If signing fails (e.g. policy not yet applied), skip silently.
    }
  }

  return docs;
}

/**
 * First openable public document href of a given type, or null. Known-broken
 * documents are skipped so primary action buttons never point at a dead link.
 */
export function findDocumentHref(
  docs: PublicDocument[],
  documentType: string
): string | null {
  return (
    docs.find((d) => d.document_type === documentType && isDocumentOpenable(d))
      ?.href ?? null
  );
}
