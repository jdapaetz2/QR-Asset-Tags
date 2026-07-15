import Link from "next/link";

import { SecondaryNav } from "@/components/ui/secondary-nav";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ownerOrgTabs, type OwnerOrgTab } from "@/lib/owner/org-nav";

/**
 * Persistent organization context strip for the platform owner (Wave 3N.4). Rendered at the top of every org
 * route (Overview · QR codes · Users · Export · Settings) so the owner keeps the organization in view and can
 * jump between tabs without returning to the org list. Fed by the `org.name` each page already loads (no extra
 * query). Owner **Export is always shown** — it is the platform export capability, independent of the customer
 * export capability flag (3N.1). `active` marks the current tab.
 */
export function OwnerOrgSubnav({
  orgId,
  orgName,
  active,
}: {
  orgId: string;
  orgName: string;
  active: OwnerOrgTab;
}) {
  const items = ownerOrgTabs(orgId).map((t) => ({
    label: t.label,
    href: t.href,
    active: t.key === active,
  }));

  return (
    <div className="flex flex-col gap-2 border-b border-iron-200 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col">
          <Eyebrow>Organization</Eyebrow>
          <span className="text-lg font-semibold tracking-tight text-iron-950">{orgName}</span>
        </div>
        <Link
          href="/owner"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← All organizations
        </Link>
      </div>
      <SecondaryNav ariaLabel="Organization sections" items={items} />
    </div>
  );
}
