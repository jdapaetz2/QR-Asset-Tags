import { PRODUCT_NAME } from "@/lib/constants";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { BrandLockup } from "@/components/brand/brand";
import { brandFontVars } from "@/app/fonts";

import { LoginForm } from "./login-form";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = sanitizeNextPath(firstString(sp.next)) ?? "";
  const error = firstString(sp.error);
  const sent = firstString(sp.sent) === "1";
  // Default to password (reliable). Magic links depend on email delivery, which
  // isn't configured yet, so they're opt-in via ?mode=magic.
  const mode = firstString(sp.mode) === "magic" ? "magic" : "password";

  return (
    <main
      className={`${brandFontVars} font-sans flex flex-1 flex-col items-center justify-center px-6 py-16`}
    >
      <div className="w-full max-w-sm">
        <BrandLockup className="mb-6 h-7 w-auto" title={`${PRODUCT_NAME} home`} />
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Use a magic link or your email and password.
        </p>
        <LoginForm next={next} error={error} sent={sent} initialMode={mode} />
      </div>
    </main>
  );
}
