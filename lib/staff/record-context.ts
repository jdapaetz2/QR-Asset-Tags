/**
 * Pure guard for staff record wrappers (Wave 3N.3). A staff evidence/submission wrapper resolves the scanned
 * short code to the caller's own-org asset (RLS), then loads a rental session or submission by id (RLS again).
 * This confirms the loaded record actually belongs to the scanned asset — blocking a "cross-asset" pairing
 * (e.g. `/staff/t/CODE-A/evidence/<session-of-asset-B>`) even within the same org, and any null/cross-org id.
 * Cross-org is already impossible (both loads are RLS-scoped → 404), so this is the same-org asset-match check.
 */
export function belongsToScannedAsset(
  recordAssetId: string | null | undefined,
  scannedAssetId: string
): boolean {
  return (
    typeof recordAssetId === "string" &&
    recordAssetId.length > 0 &&
    recordAssetId === scannedAssetId
  );
}
