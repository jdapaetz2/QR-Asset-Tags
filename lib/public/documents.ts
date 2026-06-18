import type { SupabaseClient } from "@supabase/supabase-js";

import { isHttpUrl } from "@/lib/documents/validate";

/**
 * Public documents for the /t/[shortCode] page. Visibility is enforced by RLS:
 * the anon `documents_public_select` policy returns only public documents of
 * public assets, and the anon `documents public read` storage policy permits
 * signing only those hosted objects. Private documents are never read or signed.
 */

const DOCUMENTS_BUCKET = "documents";

export type PublicDocument = {
  id: string;
  title: string;
  document_type: string;
  /** A ready-to-open URL (external link or a short-lived signed URL). */
  href: string;
  external: boolean;
};

type DocRow = {
  id: string;
  title: string;
  document_type: string;
  url: string | null;
  storage_path: string | null;
};

export async function getPublicDocuments(
  supabase: SupabaseClient,
  assetId: string
): Promise<PublicDocument[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, title, document_type, url, storage_path")
    .eq("asset_id", assetId)
    .order("document_type", { ascending: true });

  const rows = (data ?? []) as DocRow[];
  const docs: PublicDocument[] = [];

  for (const row of rows) {
    if (row.url) {
      // Only render valid http(s) links.
      if (isHttpUrl(row.url)) {
        docs.push({
          id: row.id,
          title: row.title,
          document_type: row.document_type,
          href: row.url,
          external: true,
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
        });
      }
      // If signing fails (e.g. policy not yet applied), skip silently.
    }
  }

  return docs;
}

/** First public document href of a given type, or null. Pure. */
export function findDocumentHref(
  docs: PublicDocument[],
  documentType: string
): string | null {
  return docs.find((d) => d.document_type === documentType)?.href ?? null;
}
