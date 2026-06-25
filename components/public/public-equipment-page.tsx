import Link from "next/link";

import { resolveSupportContact } from "@/lib/public/equipment";
import {
  findDocumentHref,
  isDocumentOpenable,
  type PublicDocument,
} from "@/lib/public/documents";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/documents/validate";
import { safeBrandColor, readableTextOn } from "@/lib/public/brand";
import { PublicFooter } from "@/components/public/public-footer";
import { AckPrompt } from "@/components/public/ack-prompt";

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
  primary_color: string | null;
  support_phone: string | null;
  support_email: string | null;
  powered_by_label: string | null;
} | null;

function Section({
  id,
  title,
  body,
  brand,
}: {
  id?: string;
  title: string;
  body: string | null;
  brand: string;
}) {
  if (!body) return null;
  return (
    <section
      id={id}
      className="scroll-mt-4 rounded-lg border border-l-4 bg-card p-4"
      style={{ borderLeftColor: brand }}
    >
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <p className="whitespace-pre-line text-sm leading-relaxed">{body}</p>
    </section>
  );
}

/** Filled, brand-colored primary action (forms). Text auto-contrasts. */
function PrimaryAction({
  href,
  brand,
  brandText,
  children,
}: {
  href: string;
  brand: string;
  brandText: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-12 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold"
      style={{ backgroundColor: brand, color: brandText }}
    >
      {children}
    </Link>
  );
}

/** Outline document action (Manual / Start-Up): brand border, neutral text. */
function DocAction({
  href,
  brand,
  children,
}: {
  href: string;
  brand: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-12 w-full items-center justify-center rounded-lg border-2 bg-background px-4 text-sm font-medium text-foreground"
      style={{ borderColor: brand }}
    >
      {children}
    </a>
  );
}

/** Compact sticky bar shown only on mobile so the key actions are always reachable. */
function StickyActionBar({
  shortCode,
  docHref,
  docLabel,
  brand,
  brandText,
}: {
  shortCode: string;
  docHref: string | null;
  docLabel: string;
  brand: string;
  brandText: string;
}) {
  const cell =
    "flex h-12 flex-1 items-center justify-center rounded-md px-1 text-center text-xs font-semibold leading-tight";
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-2 backdrop-blur sm:hidden">
      <nav className="mx-auto flex max-w-md items-stretch gap-2">
        {docHref ? (
          <a
            href={docHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${cell} border-2 bg-background text-foreground`}
            style={{ borderColor: brand }}
          >
            {docLabel}
          </a>
        ) : null}
        <Link
          href={`/forms/${shortCode}/damage`}
          className={cell}
          style={{ backgroundColor: brand, color: brandText }}
        >
          Report Damage
        </Link>
        <Link
          href={`/forms/${shortCode}/support`}
          className={cell}
          style={{ backgroundColor: brand, color: brandText }}
        >
          Request Support
        </Link>
        <Link
          href={`/forms/${shortCode}/return`}
          className={cell}
          style={{ backgroundColor: brand, color: brandText }}
        >
          Return
        </Link>
      </nav>
    </div>
  );
}

export function PublicEquipmentPage({
  shortCode,
  asset,
  assetId,
  activeRentalSessionId,
  page,
  org,
  documents,
}: {
  shortCode: string;
  asset: PublicAsset;
  assetId: string;
  activeRentalSessionId: string | null;
  page: PublicPage;
  org: PublicOrg;
  documents: PublicDocument[];
}) {
  const orgName = org?.name ?? "Rental Equipment";
  const brand = safeBrandColor(org?.primary_color);
  const brandText = readableTextOn(brand);
  const support = resolveSupportContact(asset, org);
  const manualHref = findDocumentHref(documents, "manual");
  const startupHref = findDocumentHref(documents, "startup_guide");
  const makeModel = [asset.make, asset.model].filter(Boolean).join(" ");

  // One sticky-bar doc shortcut: Start-Up first, else Manual.
  const stickyDocHref = startupHref ?? manualHref;
  const stickyDocLabel = startupHref ? "Start-Up" : "Manual";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-28 pt-6 sm:pb-6">
      {/* Brand accent strip */}
      <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: brand }} />

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
          <div
            className="flex size-10 items-center justify-center rounded-md text-sm font-semibold"
            style={{ backgroundColor: brand, color: brandText }}
          >
            {orgName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium">{orgName}</span>
      </header>

      {/* Hero: cover image, or an intentional branded placeholder */}
      {asset.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.cover_image_url}
          alt={asset.asset_name}
          className="aspect-video w-full rounded-lg border object-cover"
        />
      ) : (
        <div
          className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border text-center"
          style={{ backgroundColor: `${brand}14` }}
        >
          <span className="text-sm font-medium text-foreground">
            Equipment photo coming soon
          </span>
          {asset.category ? (
            <span className="text-xs text-muted-foreground">{asset.category}</span>
          ) : null}
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

      {/* Action buttons — only show what actually works (no disabled placeholders). */}
      <nav className="flex flex-col gap-2">
        {startupHref ? (
          <DocAction href={startupHref} brand={brand}>
            Start-Up Guide
          </DocAction>
        ) : page.quick_start_text ? (
          <a
            href="#quick-start"
            className="flex h-12 w-full items-center justify-center rounded-lg border-2 bg-background px-4 text-sm font-medium text-foreground"
            style={{ borderColor: brand }}
          >
            Start-Up Guide
          </a>
        ) : null}
        {manualHref ? (
          <DocAction href={manualHref} brand={brand}>
            Manual
          </DocAction>
        ) : null}
        <PrimaryAction
          href={`/forms/${shortCode}/damage`}
          brand={brand}
          brandText={brandText}
        >
          Report Damage
        </PrimaryAction>
        <PrimaryAction
          href={`/forms/${shortCode}/return`}
          brand={brand}
          brandText={brandText}
        >
          Return Checklist
        </PrimaryAction>
        <PrimaryAction
          href={`/forms/${shortCode}/support`}
          brand={brand}
          brandText={brandText}
        >
          Request Support
        </PrimaryAction>
      </nav>

      {/* Content sections */}
      <div className="flex flex-col gap-3">
        <Section
          id="quick-start"
          title="Quick start"
          body={page.quick_start_text}
          brand={brand}
        />
        <Section title="Safety" body={page.safety_notes} brand={brand} />
        <Section title="Fuel / power" body={page.fuel_power_notes} brand={brand} />
        <Section title="Return" body={page.return_notes} brand={brand} />
        <Section
          title="Troubleshooting"
          body={page.troubleshooting_notes}
          brand={brand}
        />
        <Section title="Emergency" body={page.emergency_notes} brand={brand} />
      </div>

      {/* Public documents */}
      {documents.length > 0 ? (
        <section
          className="rounded-lg border border-l-4 bg-card p-4"
          style={{ borderLeftColor: brand }}
        >
          <h2 className="mb-2 text-sm font-semibold">Documents</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {documents.map((doc) => {
              const label =
                DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] ??
                doc.document_type;
              return (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{doc.title}</span>{" "}
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </span>
                  {!isDocumentOpenable(doc) ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Currently unavailable
                    </span>
                  ) : doc.link_status === "needs_review" ? (
                    <a
                      href={doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Open · being verified
                    </a>
                  ) : (
                    <a
                      href={doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 underline-offset-4 hover:underline"
                    >
                      Open
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Support contact */}
      <section
        id="support"
        className="scroll-mt-4 rounded-lg border border-l-4 bg-card p-4"
        style={{ borderLeftColor: brand }}
      >
        <h2 className="mb-2 text-sm font-semibold">Contact support</h2>
        {support.phone || support.email ? (
          <div className="flex flex-col gap-2 text-sm">
            {support.phone ? (
              <a
                href={`tel:${support.phone}`}
                className="underline-offset-4 hover:underline"
              >
                Call {support.phone}
              </a>
            ) : null}
            {support.email ? (
              <a
                href={`mailto:${support.email}`}
                className="underline-offset-4 hover:underline"
              >
                Email {support.email}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Support contact isn&apos;t listed here — see your rental agreement or
            the rental company.
          </p>
        )}
      </section>

      {/* Footer */}
      <PublicFooter poweredByLabel={org?.powered_by_label} />

      {/* Mobile-only sticky actions */}
      <StickyActionBar
        shortCode={shortCode}
        docHref={stickyDocHref}
        docLabel={stickyDocLabel}
        brand={brand}
        brandText={brandText}
      />

      {/* Once-per-rental acknowledgement prompt (only when rented) */}
      <AckPrompt
        shortCode={shortCode}
        assetId={assetId}
        sessionId={activeRentalSessionId}
        brand={brand}
      />
    </main>
  );
}
