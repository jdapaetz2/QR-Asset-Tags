import { PRODUCT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { verifyAuthToken } from "@/lib/auth/actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Prefetch-safe invite / magic-link landing. The GET render does NOT verify the
 * token — email-security scanners issue GET requests that would otherwise consume
 * the single-use token before the real user clicks. Verification happens only in the
 * `verifyAuthToken` server action, triggered by the explicit "Continue" POST.
 */
export default async function AuthActionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const tokenHash = firstString(sp.token_hash);
  const type = firstString(sp.type) || "invite";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          Continue to {PRODUCT_NAME}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {type === "invite"
            ? "You've been invited. Click continue to accept and set up your account."
            : "Click continue to finish signing in."}
        </p>

        {tokenHash ? (
          <form action={verifyAuthToken} className="flex flex-col gap-3">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <Button type="submit">Continue</Button>
          </form>
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            This link is missing its token. Ask your inviter to send a new invite link.
          </p>
        )}
      </div>
    </main>
  );
}
