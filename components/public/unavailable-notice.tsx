import { PRODUCT_NAME } from "@/lib/constants";

/** Friendly fallback shown when a QR link/asset/page isn't publicly available. */
export function UnavailableNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full border text-muted-foreground">
          ?
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          This page isn&apos;t available
        </h1>
        <p className="text-sm text-muted-foreground">
          The equipment information for this tag isn&apos;t published right now.
          If you scanned a tag, please contact the rental company directly.
        </p>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        Powered by {PRODUCT_NAME}
      </p>
    </main>
  );
}
