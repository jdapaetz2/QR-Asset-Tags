/**
 * Platform-owner organization sub-navigation (Wave 3N.4). One source of truth for the five org-context tabs so
 * the sub-nav component and its tests never drift. Owner **Export is always present** — it is the platform-side
 * export capability and is deliberately independent of the customer `customer_exports_enabled` flag (3N.1).
 */

export const OWNER_ORG_TABS = ["overview", "qr", "users", "export", "settings"] as const;
export type OwnerOrgTab = (typeof OWNER_ORG_TABS)[number];

export type OwnerOrgTabItem = { key: OwnerOrgTab; label: string; href: string };

/** The five org tabs (Overview · QR codes · Users · Export · Settings) for a given organization id. */
export function ownerOrgTabs(orgId: string): OwnerOrgTabItem[] {
  const base = `/owner/organizations/${orgId}`;
  return [
    { key: "overview", label: "Overview", href: base },
    { key: "qr", label: "QR codes", href: `${base}/qr` },
    { key: "users", label: "Users", href: `${base}/users` },
    { key: "export", label: "Export", href: `${base}/export` },
    { key: "settings", label: "Settings", href: `${base}/settings` },
  ];
}
