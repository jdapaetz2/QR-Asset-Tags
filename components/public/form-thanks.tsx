import Link from "next/link";

import type { SupportContact } from "@/lib/public/equipment";

/** Shared success view for public form submissions. */
export function FormThanks({
  shortCode,
  title,
  detail,
  support,
}: {
  shortCode: string;
  title: string;
  detail: string | null;
  support: SupportContact;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border text-xl">
        ✓
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Thank you — your submission has been sent to the rental company.
        {detail ? ` (${detail})` : ""}
      </p>

      {support.phone || support.email ? (
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Need help now?</span>
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
        className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to equipment page
      </Link>
    </main>
  );
}
