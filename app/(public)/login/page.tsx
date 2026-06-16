import { PRODUCT_NAME } from "@/lib/constants";
import { sanitizeNextPath } from "@/lib/auth/redirect";

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
  const mode = firstString(sp.mode) === "password" ? "password" : "magic";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          Sign in to {PRODUCT_NAME}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Use a magic link or your email and password.
        </p>
        <LoginForm next={next} error={error} sent={sent} initialMode={mode} />
      </div>
    </main>
  );
}
