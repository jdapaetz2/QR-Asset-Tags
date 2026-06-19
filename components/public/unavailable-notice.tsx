import { PublicFooter } from "@/components/public/public-footer";

/** Friendly fallback shown when a QR link/asset/page isn't publicly available. */
export function UnavailableNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border text-muted-foreground">
          ?
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          This page isn&apos;t available
        </h1>
        <p className="text-sm text-muted-foreground">
          The equipment information for this tag isn&apos;t published right now. If
          you scanned a tag, please contact the rental company directly.
        </p>
      </div>
      <PublicFooter />
    </main>
  );
}
