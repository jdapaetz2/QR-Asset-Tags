import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { createDocument, deleteDocument } from "@/lib/documents/actions";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/documents/validate";
import { DocumentForm } from "@/components/document-form";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { documentLinkTone } from "@/lib/ui/status";

const DOCUMENTS_BUCKET = "documents";

type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
  visibility: string;
  link_status: string;
  url: string | null;
  storage_path: string | null;
  created_at: string;
  last_checked_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

function typeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  await requireOrgId();
  const { assetId } = await params;

  const supabase = await createClient();

  // RLS-scoped: another org's asset isn't returned → 404.
  const { data: asset } = await supabase
    .from("assets")
    .select("asset_code, asset_name")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) notFound();

  const { data } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, visibility, link_status, url, storage_path, created_at, last_checked_at"
    )
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  const documents = (data ?? []) as DocumentRow[];

  // Short-lived signed URLs for hosted files (private bucket). External docs use url.
  const links = await Promise.all(
    documents.map(async (doc) => {
      if (!doc.storage_path) return { id: doc.id, href: doc.url, hosted: false };
      const { data: signed } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, 3600);
      return { id: doc.id, href: signed?.signedUrl ?? null, hosted: true };
    })
  );
  const linkById = new Map(links.map((l) => [l.id, l]));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href={`/dashboard/assets/${assetId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {asset.asset_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code} · {documents.length} document
          {documents.length === 1 ? "" : "s"}
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Visibility</th>
              <th className="px-4 py-2 font-medium">Link status</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Checked</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  <EmptyState
                    title="No documents yet"
                    description="Add manuals, start-up guides, and safety sheets as hosted files or links. Public documents appear on this asset's scan page for renters."
                  />
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const link = linkById.get(doc.id);
                return (
                  <tr key={doc.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{doc.title}</td>
                    <td className="px-4 py-2">{typeLabel(doc.document_type)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={doc.visibility === "public" ? "success" : "neutral"}>
                        {doc.visibility === "public" ? "Public" : "Private"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={documentLinkTone(doc.link_status)}>
                        {doc.link_status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      {link?.href ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          {link.hosted ? "Download" : "Open"}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDate(doc.last_checked_at)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/dashboard/assets/${assetId}/documents/${doc.id}`}
                          className="text-sm underline-offset-4 hover:underline"
                        >
                          Edit
                        </Link>
                        <ActionButton
                          action={deleteDocument.bind(null, assetId, doc.id)}
                          variant="outline"
                        >
                          Delete
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-medium">Add a document</h2>
        <DocumentForm
          action={createDocument.bind(null, assetId)}
          submitLabel="Add document"
          showUrl
          showFile
          showLinkStatus={false}
          cancelHref={`/dashboard/assets/${assetId}`}
        />
      </section>
    </div>
  );
}
