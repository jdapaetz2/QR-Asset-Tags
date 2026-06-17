import Link from "next/link";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { resolveSupportContact } from "@/lib/public/equipment";

export const dynamic = "force-dynamic";

export default async function DamageThanksPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();
  const resolved = await resolvePublicEquipment(supabase, shortCode);

  const support = resolved
    ? resolveSupportContact(resolved.asset, resolved.org)
    : { phone: null, email: null };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border text-xl">
        ✓
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Report received</h1>
      <p className="text-sm text-muted-foreground">
        Thank you — your damage report has been sent to the rental company.
        {resolved
          ? ` (${resolved.asset.asset_name} · ${resolved.asset.asset_code})`
          : ""}
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
