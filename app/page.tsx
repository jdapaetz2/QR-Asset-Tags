import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";

const FEATURES = [
  {
    title: "Permanent QR support pages",
    body: "One durable tag per asset links to a page you control — update the content anytime without reprinting.",
  },
  {
    title: "Mobile scan pages",
    body: "Renters scan and instantly get quick-start steps, safety notes, manuals, and your support contact.",
  },
  {
    title: "Damage, support & return forms",
    body: "Issues come straight to your dashboard with photos — no phone tag, no lost paperwork.",
  },
  {
    title: "Admin dashboard",
    body: "Manage equipment, content, documents, submissions, and scan activity in one place.",
  },
  {
    title: "Tag production handled for you",
    body: "AssetTag QR produces and ships the physical tags — you just manage the content.",
  },
  {
    title: "Built for rental yards",
    body: "Designed for small and mixed local equipment rental operations.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
          <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            For equipment rental yards
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {PRODUCT_NAME}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {PRODUCT_TAGLINE}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/t/demo-ex017">View demo scan page</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Admin login</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
          What it does
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            See it on a real tag
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Open the demo scan page to see exactly what a renter sees after scanning a
            tag, then sign in to manage equipment and submissions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/t/demo-ex017">View demo scan page</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Admin login</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
