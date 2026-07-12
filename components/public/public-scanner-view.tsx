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
import { QuickStart } from "@/components/public/quick-start";

/**
 * Shared presentational scanner page used by BOTH the public route (/t/[shortCode])
 * and the editor live preview, so the two can never visually diverge.
 *
 * - mode="public": real links — internal <Link> for forms, new-tab <a> for docs.
 * - mode="preview": every action is an inert, identically-styled disabled button.
 *
 * Design (Prompt B): tenant-first. The tenant logo + tenant color carry identity (a slim
 * tenant top bar is the strongest color moment); the platform is only a quiet footer mark.
 * System fonts only, no webfonts, no decorative motion. Server component — the accordions are
 * native <details> (zero JS); Quick Start is a tiny client island that auto-expands on the
 * first scan of a new rental session. Receives PUBLIC-SAFE fields only.
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
  "flex h-12 w-full items-center justify-center rounded-lg px-4 text-base font-semibold";
const OUTLINE_CLS =
  "flex h-12 w-full items-center justify-center rounded-lg border-2 bg-background px-4 text-base font-medium text-foreground";

const EYEBROW_CLS =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** One action affordance, rendered live (public) or inert (preview). */
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
      <button type="button" disabled title="Preview only" className={`${cls} cursor-default`} style={style}>
        {children}
      </button>
    );
  }
  if (newTab) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
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

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 text-muted-foreground transition-none group-[[open]]:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Collapsible content section — native <details>, no JS, no animation (reduced-motion safe by
 * construction). The whole <summary> row is the ≥44px tap target.
 */
function Accordion({ label, body }: { label: string; body: string | null }) {
  if (!body) return null;
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className={EYEBROW_CLS}>{label}</span>
        <ChevronDown />
      </summary>
      <div className="whitespace-pre-line border-t px-4 py-3 text-lg leading-relaxed">
        {body}
      </div>
    </details>
  );
}

export function PublicScannerView({
  mode,
  shortCode,
  asset,
  assetId,
  activeRentalSessionId,
  page,
  org,
  documents,
}: {
  mode: ScannerMode;
  shortCode: string;
  asset: PublicAsset;
  /** Public asset uuid + active rental session — drive Quick Start's first-scan expand.
   *  Omitted in preview mode, so Quick Start renders collapsed and never uses localStorage. */
  assetId?: string;
  activeRentalSessionId?: string | null;
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
      {/* Slim tenant-color top bar — the strongest color moment. Bleeds to the column edges. */}
      <div className="-mx-4 -mt-6 h-2" style={{ backgroundColor: brand }} />

      {/* Tenant identity + trust line */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {org?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logo_url}
              alt={orgName}
              width={40}
              height={40}
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
          <span className="text-base font-semibold">{orgName}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Official equipment page for {orgName}
        </p>
      </header>

      {/* Hero: cover image, or an intentional branded placeholder. Explicit ratio avoids shift. */}
      {asset.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.cover_image_url}
          alt={asset.asset_name}
          width={640}
          height={360}
          decoding="async"
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

      {/* Asset identity — code in system mono (BRAND.md rule 4: no AssetTagChip on scan pages). */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{asset.asset_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{asset.asset_code}</span>
          {asset.category ? ` · ${asset.category}` : ""}
          {makeModel ? ` · ${makeModel}` : ""}
        </p>
        {page.headline ? <p className="mt-3 text-lg">{page.headline}</p> : null}
      </div>

      {/* Actions — tenant color as an accent (Report Damage primary; the rest outline). */}
      <nav className="flex flex-col gap-2">
        {startupHref ? (
          <Action mode={mode} href={startupHref} newTab variant="outline" brand={brand} brandText={brandText}>
            Start-Up Guide
          </Action>
        ) : null}
        {manualHref ? (
          <Action mode={mode} href={manualHref} newTab variant="outline" brand={brand} brandText={brandText}>
            Manual
          </Action>
        ) : null}
        <Action mode={mode} href={`/forms/${shortCode}/damage`} variant="primary" brand={brand} brandText={brandText}>
          Report Damage
        </Action>
        <Action mode={mode} href={`/forms/${shortCode}/return`} variant="outline" brand={brand} brandText={brandText}>
          Return Checklist
        </Action>
        <Action mode={mode} href={`/forms/${shortCode}/support`} variant="outline" brand={brand} brandText={brandText}>
          Request Support
        </Action>
      </nav>

      {/* Content — Quick Start first (auto-expands on the first scan of a new rental
          session; collapsed otherwise), then the always-collapsible sections. */}
      <div className="flex flex-col gap-3">
        {page.quick_start_text ? (
          <QuickStart
            body={page.quick_start_text}
            assetId={assetId}
            sessionId={activeRentalSessionId}
            interactive={mode === "public"}
          />
        ) : null}
        <Accordion label="Safety" body={page.safety_notes} />
        <Accordion label="Fuel / power" body={page.fuel_power_notes} />
        <Accordion label="Troubleshooting" body={page.troubleshooting_notes} />
        <Accordion label="Return" body={page.return_notes} />
        <Accordion label="Emergency" body={page.emergency_notes} />
      </div>

      {/* Public documents */}
      {documents.length > 0 ? (
        <section className="rounded-lg border bg-card p-4">
          <p className={`mb-2 ${EYEBROW_CLS}`}>Documents</p>
          <ul className="flex flex-col gap-3 text-base">
            {documents.map((doc) => {
              const label =
                DOCUMENT_TYPE_LABELS[doc.document_type as DocumentType] ?? doc.document_type;
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
                          ? "shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline"
                          : "shrink-0 text-sm font-medium underline-offset-4 hover:underline"
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
      <section id="support" className="scroll-mt-4 rounded-lg border bg-card p-4">
        <p className={`mb-2 ${EYEBROW_CLS}`}>Contact support</p>
        {support.phone || support.email ? (
          <div className="flex flex-col gap-2 text-base">
            {support.phone ? (
              preview ? (
                <span>Call {support.phone}</span>
              ) : (
                <a href={`tel:${support.phone}`} className="font-medium underline-offset-4 hover:underline">
                  Call {support.phone}
                </a>
              )
            ) : null}
            {support.email ? (
              preview ? (
                <span>Email {support.email}</span>
              ) : (
                <a href={`mailto:${support.email}`} className="underline-offset-4 hover:underline">
                  Email {support.email}
                </a>
              )
            ) : null}
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            Support contact isn&apos;t listed here — see your rental agreement or the
            rental company.
          </p>
        )}
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}

/**
 * Sticky bottom action bar (mobile). public → fixed to the viewport; preview → absolute inside
 * the phone frame. Report Damage is the primary (tenant color); a Call tel: cell appears when a
 * support phone exists. ≥48px targets, safe-area padding, no animation.
 */
export function PublicScannerStickyActions({
  mode,
  shortCode,
  documents,
  org,
  supportPhone,
}: {
  mode: ScannerMode;
  shortCode: string;
  documents: PublicDocument[];
  org: PublicOrg;
  supportPhone: string | null;
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

  type Cell =
    | { kind: "link"; href: string; newTab?: boolean; variant: "primary" | "outline"; label: string }
    | { kind: "tel"; href: string; label: string };

  const cells: Cell[] = [
    ...(docHref
      ? [{ kind: "link" as const, href: docHref, newTab: true, variant: "outline" as const, label: docLabel }]
      : []),
    { kind: "link", href: `/forms/${shortCode}/damage`, variant: "primary", label: "Report Damage" },
    { kind: "link", href: `/forms/${shortCode}/return`, variant: "outline", label: "Return" },
    ...(supportPhone
      ? [{ kind: "tel" as const, href: `tel:${supportPhone}`, label: "Call" }]
      : [{ kind: "link" as const, href: `/forms/${shortCode}/support`, variant: "outline" as const, label: "Support" }]),
  ];

  const renderCell = (c: Cell) => {
    const isPrimary = c.kind === "link" && c.variant === "primary";
    const style = isPrimary ? { backgroundColor: brand, color: brandText } : { borderColor: brand };
    const klass = isPrimary ? cellBase : `${cellBase} border-2 bg-background text-foreground`;

    if (preview) {
      return (
        <button key={c.label} type="button" disabled title="Preview only" className={`${klass} cursor-default`} style={style}>
          {c.label}
        </button>
      );
    }
    if (c.kind === "tel") {
      return (
        <a key={c.label} href={c.href} className={klass} style={style}>
          {c.label}
        </a>
      );
    }
    if (c.variant === "primary") {
      return (
        <Link key={c.label} href={c.href} className={klass} style={style}>
          {c.label}
        </Link>
      );
    }
    return (
      <a
        key={c.label}
        href={c.href}
        {...(c.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={klass}
        style={style}
      >
        {c.label}
      </a>
    );
  };

  return (
    <div
      className={`${position} border-t bg-background/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur`}
    >
      <nav className="mx-auto flex max-w-md items-stretch gap-2">{cells.map(renderCell)}</nav>
    </div>
  );
}
