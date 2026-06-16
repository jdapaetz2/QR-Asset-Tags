import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
