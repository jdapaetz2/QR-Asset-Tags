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

/**
 * Shared presentational scanner page used by BOTH the public route (/t/[shortCode])
 * and the editor live preview, so the two can never visually diverge.
 *
 * - mode="public": real links — internal <Link> for forms, new-tab <a> for docs.
 * - mode="preview": every action is an inert, identically-styled disabled button. It
 *   cannot navigate or submit; the editor preview wraps this in a phone frame. No scan
 *   logging or ack prompt live here — those stay with the public wrapper.
 */

export type ScannerMode = "public" | "preview";

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

const PRIMARY_CLS =
  "flex h-12 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold";
const OUTLINE_CLS =
  "flex h-12 w-full items-center justify-center rounded-lg border-2 bg-background px-4 text-sm font-medium text-foreground";

/**
 * One action affordance, rendered live (public) or inert (preview). Inert uses a
 * disabled button so it looks real but cannot navigate or submit.
 */
function Action({
  mode,
  href,
  newTab,
  variant,
  brand,
  brandText,
  children,
}: {
  mode: ScannerMode;
  href: string;
  newTab?: boolean;
  variant: "primary" | "outline";
  brand: string;
  brandText: string;
  children: React.ReactNode;
}) {
  const cls = variant === "primary" ? PRIMARY_CLS : OUTLINE_CLS;
  const style =
    variant === "primary"
      ? { backgroundColor: brand, color: brandText }
      : { borderColor: brand };

  if (mode === "preview") {
    return (
      <button
        type="button"
        disabled
        title="Preview only"
        className={`${cls} cursor-default`}
        style={style}
      >
        {children}
      </button>
    );
  }
  if (newTab) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

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

export function PublicScannerView({
  mode,
  shortCode,
  asset,
  page,
  org,
  documents,
}: {
  mode: ScannerMode;
  shortCode: string;
  asset: PublicAsset;
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
  const preview = mode === "preview";

  return (
    <div className="flex flex-col gap-6">
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
        <h1 className="text-2xl font-semibold tracking-tight">{asset.asset_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asset.asset_code}
          {asset.category ? ` · ${asset.category}` : ""}
          {makeModel ? ` · ${makeModel}` : ""}
        </p>
        {page.headline ? <p className="mt-3 text-base">{page.headline}</p> : null}
      </div>

      {/* Action buttons — only show what actually works (no disabled placeholders). */}
      <nav className="flex flex-col gap-2">
        {startupHref ? (
          <Action
            mode={mode}
            href={startupHref}
            newTab
            variant="outline"
            brand={brand}
            brandText={brandText}
          >
            Start-Up Guide
          </Action>
        ) : page.quick_start_text ? (
          <Action
            mode={mode}
            href="#quick-start"
            variant="outline"
            brand={brand}
            brandText={brandText}
          >
            Start-Up Guide
          </Action>
        ) : null}
        {manualHref ? (
          <Action
            mode={mode}
            href={manualHref}
            newTab
            variant="outline"
            brand={brand}
            brandText={brandText}
          >
            Manual
          </Action>
        ) : null}
        <Action
          mode={mode}
          href={`/forms/${shortCode}/damage`}
          variant="primary"
          brand={brand}
          brandText={brandText}
        >
          Report Damage
        </Action>
        <Action
          mode={mode}
          href={`/forms/${shortCode}/return`}
          variant="primary"
          brand={brand}
          brandText={brandText}
        >
          Return Checklist
        </Action>
        <Action
          mode={mode}
          href={`/forms/${shortCode}/support`}
          variant="primary"
          brand={brand}
          brandText={brandText}
        >
          Request Support
        </Action>
      </nav>

      {/* Content sections */}
      <div className="flex flex-col gap-3">
        <Section id="quick-start" title="Quick start" body={page.quick_start_text} brand={brand} />
        <Section title="Safety" body={page.safety_notes} brand={brand} />
        <Section title="Fuel / power" body={page.fuel_power_notes} brand={brand} />
        <Section title="Return" body={page.return_notes} brand={brand} />
        <Section title="Troubleshooting" body={page.troubleshooting_notes} brand={brand} />
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
              const openable = isDocumentOpenable(doc);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">{doc.title}</span>{" "}
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </span>
                  {!openable ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Currently unavailable
                    </span>
                  ) : preview ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {doc.link_status === "needs_review" ? "Open · being verified" : "Open"}
                    </span>
                  ) : (
                    <a
                      href={doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        doc.link_status === "needs_review"
                          ? "shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
                          : "shrink-0 underline-offset-4 hover:underline"
                      }
                    >
                      {doc.link_status === "needs_review" ? "Open · being verified" : "Open"}
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
              preview ? (
                <span>Call {support.phone}</span>
              ) : (
                <a href={`tel:${support.phone}`} className="underline-offset-4 hover:underline">
                  Call {support.phone}
                </a>
              )
            ) : null}
            {support.email ? (
              preview ? (
                <span>Email {support.email}</span>
              ) : (
                <a
                  href={`mailto:${support.email}`}
                  className="underline-offset-4 hover:underline"
                >
                  Email {support.email}
                </a>
              )
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Support contact isn&apos;t listed here — see your rental agreement or the
            rental company.
          </p>
        )}
      </section>

      {/* Footer */}
      <PublicFooter poweredByLabel={org?.powered_by_label} />
    </div>
  );
}

/**
 * Sticky bottom action bar. public → fixed to the viewport (mobile only); preview →
 * absolute, pinned to the phone-frame the caller positions it in. Inert in preview.
 */
export function PublicScannerStickyActions({
  mode,
  shortCode,
  documents,
  org,
}: {
  mode: ScannerMode;
  shortCode: string;
  documents: PublicDocument[];
  org: PublicOrg;
}) {
  const brand = safeBrandColor(org?.primary_color);
  const brandText = readableTextOn(brand);
  const startupHref = findDocumentHref(documents, "startup_guide");
  const manualHref = findDocumentHref(documents, "manual");
  const docHref = startupHref ?? manualHref;
  const docLabel = startupHref ? "Start-Up" : "Manual";
  const preview = mode === "preview";

  const cellBase =
    "flex h-12 flex-1 items-center justify-center rounded-md px-1 text-center text-xs font-semibold leading-tight";
  const position = preview
    ? "absolute inset-x-0 bottom-0 z-20"
    : "fixed inset-x-0 bottom-0 z-20 sm:hidden";

  const cells: { href: string; variant: "primary" | "outline"; label: string }[] = [
    ...(docHref
      ? [{ href: docHref, variant: "outline" as const, label: docLabel }]
      : []),
    { href: `/forms/${shortCode}/damage`, variant: "primary", label: "Report Damage" },
    { href: `/forms/${shortCode}/support`, variant: "primary", label: "Request Support" },
    { href: `/forms/${shortCode}/return`, variant: "primary", label: "Return" },
  ];

  const renderCell = (c: (typeof cells)[number]) => {
    const style =
      c.variant === "primary"
        ? { backgroundColor: brand, color: brandText }
        : { borderColor: brand };
    const klass =
      c.variant === "primary"
        ? cellBase
        : `${cellBase} border-2 bg-background text-foreground`;
    if (preview) {
      return (
        <button
          key={c.label}
          type="button"
          disabled
          title="Preview only"
          className={`${klass} cursor-default`}
          style={style}
        >
          {c.label}
        </button>
      );
    }
    if (c.variant === "outline") {
      return (
        <a
          key={c.label}
          href={c.href}
          target="_blank"
          rel="noopener noreferrer"
          className={klass}
          style={style}
        >
          {c.label}
        </a>
      );
    }
    return (
      <Link key={c.label} href={c.href} className={klass} style={style}>
        {c.label}
      </Link>
    );
  };

  return (
    <div className={`${position} border-t bg-background/95 p-2 backdrop-blur`}>
      <nav className="mx-auto flex max-w-md items-stretch gap-2">
        {cells.map(renderCell)}
      </nav>
    </div>
  );
}
