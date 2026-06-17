import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { createQrLink, setQrLinkStatus } from "@/lib/qr/actions";
import { ActionButton } from "@/components/action-button";
import { CopyableUrl } from "@/components/copyable-url";

export type QrLinkRow = {
  id: string;
  short_code: string;
  status: string;
  last_scanned_at: string | null;
  created_at: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/**
 * QR link management for an asset. Public URLs are always computed from
 * NEXT_PUBLIC_SITE_URL + short_code (never the stored public_url).
 */
export function QrLinkSection({
  assetId,
  links,
}: {
  assetId: string;
  links: QrLinkRow[];
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">QR link</h2>
        {links.length === 0 ? (
          <ActionButton action={createQrLink.bind(null, assetId)}>
            Create QR link
          </ActionButton>
        ) : null}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No QR link yet. Create one to generate a permanent scan URL.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {links.map((link) => {
            const url = buildPublicQrUrl(publicEnv.siteUrl, link.short_code);
            const nextStatus = link.status === "active" ? "disabled" : "active";
            return (
              <li key={link.id} className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono">{link.short_code}</span>
                  <span
                    className={
                      link.status === "active"
                        ? "rounded-full border px-2 py-0.5 text-xs"
                        : "rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {link.status}
                  </span>
                </div>
                <CopyableUrl url={url} />
                <p className="text-xs text-muted-foreground">
                  Last scanned: {formatDate(link.last_scanned_at)} · Created:{" "}
                  {formatDate(link.created_at)}
                </p>
                <div>
                  <ActionButton
                    action={setQrLinkStatus.bind(null, link.id, nextStatus)}
                    variant="outline"
                  >
                    {link.status === "active" ? "Deactivate" : "Activate"}
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
