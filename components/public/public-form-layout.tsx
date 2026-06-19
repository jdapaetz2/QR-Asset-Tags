import Link from "next/link";

import { PublicFooter } from "@/components/public/public-footer";

/** Mobile-first header shell for the public forms. Asset is shown, not editable. */
export function PublicFormLayout({
  shortCode,
  title,
  orgName,
  assetName,
  assetCode,
  poweredByLabel,
  children,
}: {
  shortCode: string;
  title: string;
  orgName: string;
  assetName: string;
  assetCode: string;
  poweredByLabel?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header>
        <Link
          href={`/t/${shortCode}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to equipment page
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      </header>

      {/* Asset is locked to the scanned tag — shown read-only, never editable. */}
      <section className="rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Equipment
          </span>
          <span className="text-xs text-muted-foreground">Locked to this tag</span>
        </div>
        <p className="mt-1 text-sm font-medium">{assetName}</p>
        <p className="text-xs text-muted-foreground">
          {orgName} · {assetCode}
        </p>
      </section>

      {children}

      <PublicFooter poweredByLabel={poweredByLabel} />
    </main>
  );
}
