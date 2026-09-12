import { PublicScanRoute } from "@/components/public/public-scan-route";

// Public, no-login page. Dynamic because each visit logs a scan and reads headers. `after()` is not a
// request-time API and does not change that either way — this route stays dynamic, never static.
export const dynamic = "force-dynamic";

export default async function PublicScanPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  // Eligibility, the scan log and the page itself live in PublicScanRoute, shared with the no-JavaScript copy
  // (app/nojs/t/[shortCode]/page.tsx), which renders the same page without recording a second scan.
  return <PublicScanRoute shortCode={shortCode} recordScan />;
}
