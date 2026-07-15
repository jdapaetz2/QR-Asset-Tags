import Link from "next/link";

import type { SupportContact } from "@/lib/public/equipment";
import { PublicFooter } from "@/components/public/public-footer";

/**
 * Shared success view for public form submissions (Prompt B). A finished moment: it names the
 * tenant, shows a large, quotable reference in a quiet neutral tag-shaped chip (system mono, NOT
 * AssetCodeChip, no brass), says what happens next, and offers a way back. The platform stays a
 * quiet footer mark. `reference` is display-only (derived from the submission id); it renders only
 * when present, so the honeypot/no-ref path degrades gracefully.
 */
export function FormThanks({
  shortCode,
  orgName,
  title,
  reference,
  detail,
  support,
}: {
  shortCode: string;
  orgName: string | null;
  title: string;
  reference?: string | null;
  detail: string | null;
  support: SupportContact;
}) {
  const tenant = orgName ?? "the rental company";
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
          </div>
        ) : null}

        <p className="max-w-xs text-base leading-relaxed">
          The {tenant} team has been notified and will follow up if needed.
          {detail ? (
            <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
          ) : null}
        </p>

        {support.phone || support.email ? (
          <div className="mt-2 flex flex-col gap-1 text-base">
            <span className="text-sm text-muted-foreground">Need help now?</span>
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
