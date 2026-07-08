import { AppShell } from "@/components/app-shell";
import { requireActiveOrg } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireActiveOrg redirects a suspended-org customer to /suspended before any
  // customer surface renders; platform owners and active-org customers pass through.
  const profile = await requireActiveOrg();
  return <AppShell profile={profile}>{children}</AppShell>;
}
