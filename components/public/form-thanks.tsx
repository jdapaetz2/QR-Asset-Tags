import Link from "next/link";

import type { SupportContact } from "@/lib/public/equipment";
import { callNowContact } from "@/lib/public/confirmation";
import { mailtoHref } from "@/lib/contact/links";
import { readableTextOn, safeBrandColor } from "@/lib/public/brand";
import { PublicFooter } from "@/components/public/public-footer";

/**
 * Shared success view for public form submissions (Prompt B). A finished moment: it names the tenant, shows a large,
 * quotable reference in a quiet neutral tag-shaped chip (system mono, NOT AssetCodeChip, no brass), and offers a way
 * back. The platform stays a quiet footer mark. `reference` is display-only (derived from the submission id); it
 * renders only when present, so the honeypot/no-ref path degrades gracefully.
 *
 * Engineering Phase D2 — truthful wording. The page says the rental company HAS the report. It never says anyone has
 * been notified, has read it or is responding: email alerts are best-effort. When the renter's own answers map to
 * Immediate attention (`callNow`, a display-only URL flag), a prominent block asks them to call the rental company
 * directly, in the tenant's colour, with the same public support phone the equipment page shows. No emergency-services
 * wording in this phase.
 */
export function FormThanks({
  shortCode,
  orgName,
  title,
  reference,
  detail,
  support,
  callNow = false,
  brandColor = null,
}: {
  shortCode: string;
  orgName: string | null;
  title: string;
  reference?: string | null;
  detail: string | null;
  support: SupportContact;
  callNow?: boolean;
  /** The organization's `primary_color` — validated here before use. */
  brandColor?: string | null;
}) {
  const tenant = orgName ?? "the rental company";
  const tenantSentence = orgName ?? "The rental company";
  const phone = callNowContact(support);
  const emailHref = mailtoHref(support.email);
  const brand = safeBrandColor(brandColor);
  const brandText = readableTextOn(brand);

  const emailContact = support.email ? (
    emailHref ? (
      <a href={emailHref} className="underline-offset-4 hover:underline">
        Email {support.email}
      </a>
    ) : (
      <span>Email {support.email}</span>
    )
  ) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border-2 border-success text-xl text-success">
          ✓
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Sent to {tenant}</h1>
        <p className="text-base text-muted-foreground">{title}</p>

        {reference ? (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Reference
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground"
              />
              <span className="font-mono text-lg tracking-tight">{reference}</span>
            </span>
            <span className="text-sm text-muted-foreground">Keep this reference for follow-up.</span>
          </div>
        ) : null}

        <p className="max-w-xs text-base leading-relaxed">
          {tenantSentence} has your report.
          {detail ? (
            <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
          ) : null}
        </p>

        {callNow ? (
          <section
            data-call-now
            aria-labelledby="call-now-heading"
            className="mt-2 flex w-full flex-col gap-2 rounded-lg border-2 p-4 text-left"
            style={{ borderColor: brand }}
          >
            <h2 id="call-now-heading" className="text-base font-semibold">
              You told us this needs attention now.
            </h2>
            {phone ? (
              <>
                <p className="text-sm">Don&apos;t wait for a reply — call {tenant} directly.</p>
                <a
                  href={phone.href}
                  className="mt-1 flex min-h-12 w-full items-center justify-center rounded-md px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  style={{ backgroundColor: brand, color: brandText }}
                >
                  Call {phone.label}
                </a>
              </>
            ) : (
              <>
                <p className="text-sm">Don&apos;t wait for a reply — contact {tenant} directly.</p>
                {support.phone ? <p className="text-sm">Phone: {support.phone}</p> : null}
              </>
            )}
            {emailContact ? <p className="text-sm">{emailContact}</p> : null}
          </section>
        ) : support.phone || support.email ? (
          <div className="mt-2 flex flex-col gap-1 text-base">
            <span className="text-sm text-muted-foreground">Need help now?</span>
            {support.phone ? (
              phone ? (
                <a href={phone.href} className="underline-offset-4 hover:underline">
                  Call {phone.label}
                </a>
              ) : (
                <span>Call {support.phone}</span>
              )
            ) : null}
            {emailContact}
          </div>
        ) : null}

        <Link
          href={`/t/${shortCode}`}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Return to equipment page
        </Link>
      </div>

      <PublicFooter />
    </main>
  );
}
