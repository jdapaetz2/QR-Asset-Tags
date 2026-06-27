import { requireOrgId } from "@/lib/auth/session";
import { buildImportTemplateCsv } from "@/lib/onboarding/import";

// Auth-scoped download — never cache.
export const dynamic = "force-dynamic";

export async function GET() {
  await requireOrgId();
  const csv = buildImportTemplateCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assettag-asset-import-template.csv"',
    },
  });
}
