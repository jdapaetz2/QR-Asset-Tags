import Link from "next/link";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { DamageForm } from "@/components/public/damage-form";
import { UnavailableNotice } from "@/components/public/unavailable-notice";

// Public, no-login form. Dynamic — eligibility is resolved per request.
export const dynamic = "force-dynamic";

export default async function DamageReportPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = createPublicClient();

  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) return <UnavailableNotice />;

  const orgName = resolved.org.name ?? "Rental Equipment";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header>
        <Link
          href={`/t/${shortCode}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to equipment page
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Report damage
        </h1>
        {/* Asset is prefilled and not editable. */}
        <p className="mt-1 text-sm text-muted-foreground">
          {orgName} · {resolved.asset.asset_name} ({resolved.asset.asset_code})
        </p>
      </header>

      <DamageForm shortCode={shortCode} />
    </main>
  );
}
