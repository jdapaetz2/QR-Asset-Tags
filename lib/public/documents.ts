import { isHttpUrl, type LinkStatus } from "@/lib/documents/validate";

/**
 * Shapes and pure helpers for public documents on the /t/[shortCode] page.
 *
 * CLIENT-SAFE ON PURPOSE. `public-scanner-view.tsx` imports `findDocumentHref` and
 * `isDocumentOpenable` as runtime values, so this module is part of the scan page's client bundle
 * and must not reach any server-only code. The Supabase read and the Storage signing live in
 * `./documents-server`.
 */

export type PublicDocument = {
  id: string;
  title: string;
  document_type: string;
  /** A ready-to-open URL (external link or a short-lived signed URL). */
  href: string;
  external: boolean;
  link_status: LinkStatus;
};

export type DocRow = {
  id: string;
  title: string;
  document_type: string;
  url: string | null;
  storage_path: string | null;
  link_status: string | null;
};

export function normalizeLinkStatus(value: string | null): LinkStatus {
  return value === "ok" || value === "broken" || value === "needs_review"
    ? value
    : "unknown";
}

/** A document is openable unless it has been flagged broken. */
export function isDocumentOpenable(doc: PublicDocument): boolean {
  return doc.link_status !== "broken";
}

/**
 * Map document rows to PublicDocument[] for the editor's INERT preview: same
 * "qualifies" rule as getPublicDocuments (external http(s) link, or a hosted object),
 * but with no signing — `href` is a placeholder "#" because preview actions never
 * navigate. The caller must pass only `visibility='public'` rows; storage paths are
 * never carried into the returned shape. Pure (no I/O), so it's unit-tested.
 */
export function toPreviewDocuments(rows: DocRow[]): PublicDocument[] {
  const docs: PublicDocument[] = [];
  for (const row of rows) {
    const link_status = normalizeLinkStatus(row.link_status);
    if (row.url) {
      if (isHttpUrl(row.url)) {
        docs.push({
          id: row.id,
          title: row.title,
          document_type: row.document_type,
          href: "#",
          external: true,
          link_status,
        });
      }
      continue;
    }
    if (row.storage_path) {
      docs.push({
        id: row.id,
        title: row.title,
        document_type: row.document_type,
        href: "#",
        external: false,
        link_status,
      });
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
