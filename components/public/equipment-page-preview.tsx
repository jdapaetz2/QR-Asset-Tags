"use client";

import { safeBrandColor, readableTextOn } from "@/lib/public/brand";
import { resolveSupportContact } from "@/lib/public/equipment";

/**
 * Lightweight phone-framed preview of the public scan page for the editor. Client-only
 * and driven by live form state — it never saves or fetches. Mirrors the public page's
 * styling closely enough to communicate "this is what renters see," but is not a
 * pixel-perfect copy. Shows only public-safe content (resolved support contact; no
 * internal notes / raw overrides).
 */

export type PreviewOrg = {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  support_phone: string | null;
  support_email: string | null;
};

export type PreviewAsset = {
  asset_code: string;
  asset_name: string;
  category: string | null;
  cover_image_url: string | null;
  support_phone_override: string | null;
  support_email_override: string | null;
};

export type PreviewFields = {
  headline: string;
  quick_start_text: string;
  safety_notes: string;
  fuel_power_notes: string;
  return_notes: string;
  troubleshooting_notes: string;
  emergency_notes: string;
};

function Section({
  title,
  body,
  brand,
}: {
  title: string;
  body: string;
  brand: string;
}) {
  if (!body.trim()) return null;
  return (
    <section
      className="rounded-lg border border-l-4 bg-card p-3"
      style={{ borderLeftColor: brand }}
    >
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="whitespace-pre-line text-sm leading-relaxed">{body}</p>
    </section>
  );
}

export function EquipmentPagePreview({
  org,
  asset,
  fields,
}: {
  org: PreviewOrg;
  asset: PreviewAsset;
  fields: PreviewFields;
}) {
  const orgName = org.name ?? "Rental Equipment";
  const brand = safeBrandColor(org.primary_color);
  const brandText = readableTextOn(brand);
  const support = resolveSupportContact(asset, org);
  const makeModelCategory = asset.category;

  return (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-8 border-foreground/10 bg-background shadow-sm">
      <div className="max-h-[600px] overflow-y-auto px-4 pb-6 pt-4">
        <div className="flex flex-col gap-4">
          {/* Brand accent strip */}
          <div
            className="h-1.5 w-full rounded-full"
            style={{ backgroundColor: brand }}
          />

          {/* Organization */}
          <header className="flex items-center gap-3">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt={orgName}
                className="size-9 rounded-md object-contain"
              />
            ) : (
              <div
                className="flex size-9 items-center justify-center rounded-md text-sm font-semibold"
                style={{ backgroundColor: brand, color: brandText }}
                aria-hidden
              >
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
          ) : null}

          {/* Asset identity */}
          <div>
            <h2 className="text-lg font-semibold leading-tight">
              {asset.asset_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {asset.asset_code}
              {makeModelCategory ? ` · ${makeModelCategory}` : ""}
            </p>
          </div>

          {fields.headline.trim() ? (
            <p className="text-sm font-medium">{fields.headline}</p>
          ) : null}

          {/* Content sections */}
          <div className="flex flex-col gap-2">
            <Section title="Quick start" body={fields.quick_start_text} brand={brand} />
            <Section title="Safety" body={fields.safety_notes} brand={brand} />
            <Section title="Fuel / power" body={fields.fuel_power_notes} brand={brand} />
            <Section title="Return" body={fields.return_notes} brand={brand} />
            <Section
              title="Troubleshooting"
              body={fields.troubleshooting_notes}
              brand={brand}
            />
            <Section title="Emergency" body={fields.emergency_notes} brand={brand} />
          </div>

          {/* Support contact */}
          <section
            className="rounded-lg border border-l-4 bg-card p-3"
            style={{ borderLeftColor: brand }}
          >
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact support
            </h3>
            {support.phone || support.email ? (
              <div className="flex flex-col gap-0.5 text-sm">
                {support.phone ? <span>Call {support.phone}</span> : null}
                {support.email ? <span>Email {support.email}</span> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Support contact isn&apos;t listed yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
