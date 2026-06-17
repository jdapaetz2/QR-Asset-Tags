import Link from "next/link";

/** Mobile-first header shell for the public forms. Asset is shown, not editable. */
export function PublicFormLayout({
  shortCode,
  title,
  orgName,
  assetName,
  assetCode,
  children,
}: {
  shortCode: string;
  title: string;
  orgName: string;
  assetName: string;
  assetCode: string;
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
        <p className="mt-1 text-sm text-muted-foreground">
          {orgName} · {assetName} ({assetCode})
        </p>
      </header>
      {children}
    </main>
  );
}
