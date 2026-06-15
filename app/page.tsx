import { Button } from "@/components/ui/button";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/constants";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Foundation · Sprint 0
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
        <p className="text-lg text-muted-foreground">{PRODUCT_TAGLINE}</p>
        <p className="text-sm text-muted-foreground">
          The app scaffold is live. Admin, public equipment pages, and QR
          routing are built in later sprints — see{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">
            docs/SPRINT_PLAN.md
          </code>
          .
        </p>
        <Button disabled>Coming soon</Button>
      </div>
    </main>
  );
}
