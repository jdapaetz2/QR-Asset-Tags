import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { NewOrganizationForm } from "@/components/new-organization-form";

// Owner-only, auth-scoped; never cache.
export const dynamic = "force-dynamic";

export default async function NewOrganizationPage() {
  // Authoritative role gate — non-owners are redirected to their own landing.
  await requireRole(ROLES.PLATFORM_OWNER);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Organizations
        </Link>
        <div className="mt-2">
          <PageHeader
            title="New organization"
            description="Create a customer organization. No assets or users are created — invite the first admin next."
          />
        </div>
      </div>
      <NewOrganizationForm />
    </div>
  );
}
