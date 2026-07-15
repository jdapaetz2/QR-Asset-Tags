import { SecondaryNav } from "@/components/ui/secondary-nav";
import { withReturnTo } from "@/lib/nav/return-to";

/**
 * Consistent per-asset secondary navigation (Wave 3N.2): Overview · Equipment page ·
 * Documents · Timeline · Rental sessions. Rendered once at the top of every asset
 * page so navigation between an asset's sub-pages is predictable and never duplicated
 * across content cards.
 *
 * - `assetId` is preserved on every tab.
 * - `returnTo` (the originating Assets-list URL) is threaded onto the same-area tabs so
 *   the detail's "← Assets" back link keeps targeting the filtered list wherever the
 *   operator lands. The Rental sessions tab crosses into the session browser via the
 *   existing `?asset=` prefilter, so it does not carry the assets-list returnTo.
 * - All five tabs show for both customer roles: per Wave 3N.1 the asset sub-pages are
 *   staff-allowed operational surfaces, so none is hidden.
 */

export type AssetSection =
  | "overview"
  | "page"
  | "documents"
  | "timeline"
  | "rentals";

export function AssetSubnav({
  assetId,
  current,
  returnTo,
}: {
  assetId: string;
  current: AssetSection;
  returnTo?: string;
}) {
  const base = `/dashboard/assets/${assetId}`;
  const items = [
    { key: "overview", label: "Overview", href: withReturnTo(base, returnTo) },
    { key: "page", label: "Equipment page", href: withReturnTo(`${base}/page`, returnTo) },
    { key: "documents", label: "Documents", href: withReturnTo(`${base}/documents`, returnTo) },
    { key: "timeline", label: "Timeline", href: withReturnTo(`${base}/timeline`, returnTo) },
    { key: "rentals", label: "Rental sessions", href: `/dashboard/rentals?asset=${assetId}` },
  ] as const;

  return (
    <SecondaryNav
      ariaLabel="Asset sections"
      items={items.map((i) => ({
        label: i.label,
        href: i.href,
        active: i.key === current,
      }))}
    />
  );
}
