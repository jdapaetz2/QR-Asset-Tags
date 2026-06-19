import Link from "next/link";

import { resolveSupportContact } from "@/lib/public/equipment";
import { PublicFooter } from "@/components/public/public-footer";
import {
  findDocumentHref,
  type PublicDocument,
} from "@/lib/public/documents";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/documents/validate";

export type PublicAsset = {
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  cover_image_url: string | null;
  support_phone_override: string | null;
  support_email_override: string | null;
};

export type PublicPage = {
  headline: string | null;
  quick_start_text: string | null;
  safety_notes: string | null;
  fuel_power_notes: string | null;
  return_notes: string | null;
  troubleshooting_notes: string | null;
  emergency_notes: string | null;
};

export type PublicOrg = {
  name: string | null;
  logo_url: string | null;
  support_phone: string | null;
  support_email: string | null;
  powered_by_label: string | null;
} | null;

function Section({
  id,
  title,
  body,
}: {
  id?: string;
  title: string;
  body: string | null;
}) {
  if (!body) return null;
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <p className="whitespace-pre-line text-sm leading-relaxed">{body}</p>
    </section>
  );
}

function ActionLink({
  href,
  children,
  internal = false,
  newTab = false,
}: {
  href: string;
  children: React.ReactNode;
  internal?: boolean;
  newTab?: boolean;
}) {
  const className =
    "flex h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground";
  if (internal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function DisabledAction({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-disabled="true"
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium text-muted-foreground opacity-60"
    >
      {children}
      <span className="rounded-full border px-2 py-0.5 text-xs">Soon</span>
    </span>
  );
}

export function PublicEquipmentPage({
  shortCode,
  asset,
  page,
  org,
  documents,
}: {
  shortCode: string;
  asset: PublicAsset;
  page: PublicPage;
  org: PublicOrg;
  documents: PublicDocument[];
}) {
  const orgName = org?.name ?? "Rental Equipment";
  const support = resolveSupportContact(asset, org);
  const manualHref = findDocumentHref(documents, "manual");
  const startupHref = findDocumentHref(documents, "startup_guide");
  const makeModel = [asset.make, asset.model].filter(Boolean).join(" ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      {/* Organization */}
      <header className="flex items-center gap-3">
        {org?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={org.logo_url}
            alt={orgName}
            className="size-10 rounded-md object-contain"
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-semibold text-muted-foreground">
            {orgName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium">{orgName}</span>
      </header>

      {/* Cover image */}
      {asset.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.cover_image_url}
          alt={asset.asset_name}
          className="aspect-video w-full rounded-lg border object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
          No image
        </div>
      )}

      {/* Asset identity */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {asset.asset_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code}
          {asset.category ? ` · ${asset.category}` : ""}
          {makeModel ? ` · ${makeModel}` : ""}
        </p>
        {page.headline ? (
          <p className="mt-3 text-base">{page.headline}</p>
        ) : null}
      </div>

      {/* Action buttons */}
      <nav className="flex flex-col gap-2">
        {startupHref ? (
          <ActionLink href={startupHref} newTab>
            Start-Up Guide
          </ActionLink>
        ) : page.quick_start_text ? (
          <ActionLink href="#quick-start">Start-Up Guide</ActionLink>
        ) : (
          <DisabledAction>Start-Up Guide</DisabledAction>
        )}
        {manualHref ? (
          <ActionLink href={manualHref} newTab>
            Manual
          </ActionLink>
        ) : (
          <DisabledAction>Manual</DisabledAction>
        )}
        <ActionLink href={`/forms/${shortCode}/damage`} internal>
          Report Damage
        </ActionLink>
        <ActionLink href={`/forms/${shortCode}/return`} internal>
          Return Checklist
        </ActionLink>
        <ActionLink href={`/forms/${shortCode}/support`} internal>
          Request Support
        </ActionLink>
      </nav>

      {/* Content sections */}
      <div className="flex flex-col gap-5">
        <Section id="quick-start" title="Quick start" body={page.quick_start_text} />
        <Section title="Safety" body={page.safety_notes} />
        <Section title="Fuel / power" body={page.fuel_power_notes} />
        <Section title="Return" body={page.return_notes} />
        <Section title="Troubleshooting" body={page.troubleshooting_notes} />
        <Section title="Emergency" body={page.emergency_notes} />
      </div>

      {/* Public documents */}
      {documents.length > 0 ? (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Documents</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="font-medium">{doc.title}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] ??
                      doc.document_type}
                  </span>
                </span>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 underline-offset-4 hover:underline"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Support contact */}
      {support.phone || support.email ? (
        <section id="support" className="scroll-mt-4 rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Contact support</h2>
          <div className="flex flex-col gap-2 text-sm">
            {support.phone ? (
              <a href={`tel:${support.phone}`} className="underline-offset-4 hover:underline">
                Call {support.phone}
              </a>
            ) : null}
            {support.email ? (
              <a href={`mailto:${support.email}`} className="underline-offset-4 hover:underline">
                Email {support.email}
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Footer */}
      <PublicFooter poweredByLabel={org?.powered_by_label} />
    </main>
  );
}
