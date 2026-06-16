import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile, landingPathForRole } from "@/lib/auth/session";

const COMING_SOON = [
  { title: "Assets", note: "Manage equipment records" },
  { title: "Submissions", note: "Damage reports & support requests" },
  { title: "QR Pages", note: "Public equipment pages & tags" },
  { title: "Settings", note: "Organization profile & branding" },
];

export default async function DashboardPage() {
  const profile = await requireProfile();

  // Platform owners have no organization; send them to their own landing.
  if (!profile.organization_id) {
    redirect(landingPathForRole(profile.role));
  }

  // RLS-scoped read: a customer admin/staff can only see their own org.
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug, status")
    .eq("id", profile.organization_id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          {org?.name ?? "Your organization"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {profile.name ?? profile.email ?? "user"} · {profile.role}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Organization</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-muted-foreground">
          <dt>Name</dt>
          <dd className="text-foreground">{org?.name ?? "—"}</dd>
          <dt>Slug</dt>
          <dd className="text-foreground">{org?.slug ?? "—"}</dd>
          <dt>Status</dt>
          <dd className="text-foreground">{org?.status ?? "—"}</dd>
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Coming soon
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COMING_SOON.map((card) => (
            <div
              key={card.title}
              aria-disabled="true"
              className="rounded-lg border bg-card p-4 opacity-60"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{card.title}</h3>
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  Soon
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{card.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
