import { execFileSync } from "node:child_process";

/**
 * Resolves the LOCAL Supabase stack for the executed security suite (Phase A3.2).
 *
 * SAFETY — this suite is destructive (it db-resets and seeds fixtures), so it must NEVER
 * touch a hosted project. `assertLocal()` refuses to proceed unless the resolved API URL
 * is a loopback host. Key material is never printed: on a guard failure we print the host
 * only, never the keys. The linked project in `supabase/.temp/linked-project.json` is never
 * contacted — we read `supabase status`, which reports the local Docker stack only.
 */

export type StackConfig = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1"]);

let cached: StackConfig | null = null;

/** `npx supabase` — `.cmd` shim on Windows, bare binary elsewhere (CI is Linux). */
function supabaseBin(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function readStatusJson(): Record<string, string> {
  const out = execFileSync(supabaseBin(), ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    // `status` prints an npm notice banner on stderr; ignore it, parse stdout only.
    stdio: ["ignore", "pipe", "ignore"],
    // Windows requires a shell to execute the `npx.cmd` batch shim; args are static literals.
    shell: process.platform === "win32",
  });
  // Tolerate any leading non-JSON noise: slice from the first brace.
  const start = out.indexOf("{");
  if (start < 0) throw new Error("supabase status returned no JSON — is the local stack running? Run `npx supabase start`.");
  return JSON.parse(out.slice(start)) as Record<string, string>;
}

/**
 * Hard local-only guard. Throws (with the host, never a key) if the stack is not loopback.
 * Exported so a test can assert the guard itself fires (Verification step 4).
 */
export function assertLocal(apiUrl: string): void {
  let host: string;
  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch {
    throw new Error("refusing to run destructive security tests: Supabase API URL is not a valid URL");
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `refusing to run destructive security tests against a non-local Supabase (host: ${host}). ` +
        "This suite db-resets and seeds fixtures; point it only at a local `supabase start` stack."
    );
  }
}

export function getStackConfig(): StackConfig {
  if (cached) return cached;
  const status = readStatusJson();
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  const dbUrl = status.DB_URL;
  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) {
    throw new Error("supabase status is missing API_URL / ANON_KEY / SERVICE_ROLE_KEY / DB_URL — is the local stack running?");
  }
  assertLocal(apiUrl);
  cached = { apiUrl, anonKey, serviceRoleKey, dbUrl };
  return cached;
}
