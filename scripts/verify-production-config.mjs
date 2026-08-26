#!/usr/bin/env node
/**
 * Static production-configuration verifier (Phase A2). SAFE by construction:
 * it never prints a secret value, never applies migrations, never mutates a
 * remote project, never sends email, and needs no service-role access. It only
 * reads local files + already-present env var NAMES.
 *
 * Hard checks (exit 1 on FAIL) are limited to things safe to enforce locally:
 * required var names declared, the migration sequence contiguous from 0001 to
 * the highest present (currently 0033 — the check is dynamic, not pinned),
 * canonical Node version consistent, and server-only import boundaries intact.
 * Value checks (site URL shape, salt strength, sender format) run only when the
 * values are set — WARN locally, FAIL in Vercel production/preview.
 *
 * SCOPE: this is the DEPLOYMENT config gate. It intentionally accepts a Vercel
 * preview host as a valid QA target. Whether the base URL is safe to etch into a
 * PERMANENT tag is a stricter, separate question — see scripts/verify-tag-config.mjs.
 *
 * Run: npm run verify:production-config
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const results = [];
const add = (level, name, detail) => results.push({ level, name, detail });

const vercelEnv = process.env.VERCEL_ENV;
const isDeployed = vercelEnv === "production" || vercelEnv === "preview";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SCAN_IP_HASH_SALT",
  "RESEND_API_KEY",
  "NOTIFICATION_FROM_EMAIL",
  "NOTIFICATION_REPLY_TO_EMAIL",
];
const SALT_MIN = 32;

// 1) Required variable NAMES are declared in .env.local.example (never values).
try {
  const example = readFileSync(join(root, ".env.local.example"), "utf8");
  const missing = REQUIRED_VARS.filter((v) => !new RegExp(`^${v}=`, "m").test(example));
  if (missing.length) add("fail", "env-names", `.env.local.example missing: ${missing.join(", ")}`);
  else add("pass", "env-names", "all required variable names declared");
} catch {
  add("fail", "env-names", ".env.local.example not found");
}

// 2) Migration files are contiguous from 0001 to the highest present (no gaps).
{
  const dir = join(root, "supabase", "migrations");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")) : [];
  const numbers = files
    .map((f) => Number(f.slice(0, 4)))
    .filter((n) => Number.isInteger(n) && n > 0);
  const highest = numbers.length ? Math.max(...numbers) : 0;
  const missing = [];
  for (let i = 1; i <= highest; i++) {
    if (!numbers.includes(i)) missing.push(String(i).padStart(4, "0"));
  }
  if (!highest) add("fail", "migrations", "no migration files found");
  else if (missing.length) add("fail", "migrations", `gaps in migration sequence: ${missing.join(", ")}`);
  else
    add(
      "pass",
      "migrations",
      `0001–${String(highest).padStart(4, "0")} contiguous (remote-applied state is operator-verified, not checked here)`
    );
}

// 3) Canonical Node version consistent (.nvmrc == package.json engines major).
{
  let nvmrc = null;
  let engines = null;
  try {
    nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
  } catch {}
  try {
    engines = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines?.node ?? null;
  } catch {}
  const major = (s) => (s ? String(s).replace(/[^\d]/g, "").slice(0, 2) : null);
  if (!nvmrc) add("fail", "node-version", ".nvmrc missing");
  else if (!engines) add("fail", "node-version", "package.json engines.node missing");
  else if (major(nvmrc) !== major(engines))
    add("fail", "node-version", `.nvmrc (${nvmrc}) != engines.node (${engines})`);
  else add("pass", "node-version", `canonical Node ${major(nvmrc)} (.nvmrc + engines agree)`);
}

// 4) Server-only import boundaries intact.
{
  const admin = join(root, "lib", "supabase", "admin.ts");
  const notify = join(root, "lib", "notifications", "notify.ts");
  const hasServerOnly = (p) => existsSync(p) && /["']server-only["']/.test(readFileSync(p, "utf8"));
  const boundaryFails = [];
  if (!hasServerOnly(admin)) boundaryFails.push("lib/supabase/admin.ts lacks `import \"server-only\"`");
  if (!hasServerOnly(notify)) boundaryFails.push("lib/notifications/notify.ts lacks `import \"server-only\"`");

  // No "use client" file may import the admin (service-role) client.
  const offenders = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        if (/^\s*["']use client["']/m.test(src) && /lib\/supabase\/admin|createAdminClient/.test(src)) {
          offenders.push(p.replace(root + "\\", "").replace(root + "/", ""));
        }
      }
    }
  };
  for (const base of ["app", "lib", "components"]) {
    const d = join(root, base);
    if (existsSync(d)) walk(d);
  }
  if (offenders.length) boundaryFails.push(`"use client" files import the service-role client: ${offenders.join(", ")}`);

  if (boundaryFails.length) add("fail", "server-only", boundaryFails.join(" | "));
  else add("pass", "server-only", "service-role + notifier are server-only; no client importer");
}

// 4b) Service-role import allowlist (Phase A3.2). Only reviewed, documented modules may import the
// service-role client. A new importer fails this gate until it is added here AND audited in
// docs/SECURITY_MODEL.md, so service-role reach cannot grow silently. Every allowlisted module must
// also be server-only (an `import "server-only"` or a `"use server"` action file).
{
  const ALLOWED = new Set([
    "lib/supabase/admin.ts", // defines createAdminClient
    "lib/notifications/notify.ts", // trusted notification lookup/delivery
    "lib/team/actions.ts", // Supabase Auth Admin invitation lifecycle + cross-tenant collision probe
    "lib/ratelimit/limiter.ts", // Phase A4 shared-store rate limiter (private counter table, service_role only)
  ]);
  const rel = (p) => p.replace(root + "\\", "").replace(root + "/", "").split("\\").join("/");
  const importers = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        if (/from\s+["']@\/lib\/supabase\/admin["']|createAdminClient\s*\(/.test(src)) {
          importers.push({ file: rel(p), serverOnly: /["']server-only["']/.test(src) || /^\s*["']use server["']/m.test(src) });
        }
      }
    }
  };
  for (const base of ["app", "lib", "components"]) {
    const d = join(root, base);
    if (existsSync(d)) walk(d);
  }
  const rogue = importers.filter((i) => !ALLOWED.has(i.file)).map((i) => i.file);
  const notServerOnly = importers.filter((i) => ALLOWED.has(i.file) && !i.serverOnly).map((i) => i.file);
  const fails = [];
  if (rogue.length) fails.push(`un-allowlisted service-role importer(s): ${rogue.join(", ")} (add to ALLOWED + audit in SECURITY_MODEL.md)`);
  if (notServerOnly.length) fails.push(`service-role module(s) not server-only: ${notServerOnly.join(", ")}`);
  if (fails.length) add("fail", "service-role-allowlist", fails.join(" | "));
  else add("pass", "service-role-allowlist", `${importers.length} service-role importer(s), all allowlisted + server-only`);
}

// 5) Value checks — only when set. WARN locally, FAIL in Vercel production/preview.
{
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) {
    add(isDeployed ? "fail" : "warn", "site-url", "NEXT_PUBLIC_SITE_URL not set in this shell");
  } else {
    let issue = null;
    try {
      const u = new URL(site);
      const host = u.hostname.toLowerCase();
      const placeholder = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "placeholder"].some(
        (h) => host === h || host.startsWith("placeholder.") || host.endsWith(".localhost")
      );
      if (u.protocol !== "https:") issue = "must use https";
      else if (placeholder) issue = "is a localhost/placeholder host";
    } catch {
      issue = "is not a valid URL";
    }
    if (issue) add(vercelEnv === "production" ? "fail" : "warn", "site-url", `NEXT_PUBLIC_SITE_URL ${issue}`);
    else add("pass", "site-url", "NEXT_PUBLIC_SITE_URL is https + non-placeholder");
  }

  // Salt: never print the value — only its length class.
  const salt = process.env.SCAN_IP_HASH_SALT ?? "";
  if (isDeployed) {
    if (salt.length < SALT_MIN) add("fail", "scan-salt", `SCAN_IP_HASH_SALT must be ≥ ${SALT_MIN} chars in ${vercelEnv}`);
    else add("pass", "scan-salt", `SCAN_IP_HASH_SALT present and ≥ ${SALT_MIN} chars`);
  } else {
    add(salt.length >= SALT_MIN ? "pass" : "warn", "scan-salt", salt.length ? "set (local)" : "unset (local fail-soft OK)");
  }

  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (from) {
    const ok = /<[^@\s]+@[^@\s]+\.[^@\s]+>/.test(from) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from);
    add(ok ? "pass" : "warn", "sender", ok ? "NOTIFICATION_FROM_EMAIL format looks valid" : "NOTIFICATION_FROM_EMAIL format looks off");
    // Transactional mail should carry one consistent display name across every event (B4, Part E).
    if (ok && !/^Mulemark\s*</.test(from)) {
      add("warn", "sender-name", 'NOTIFICATION_FROM_EMAIL display name is not "Mulemark <…>"');
    }
  } else {
    add("warn", "sender", "NOTIFICATION_FROM_EMAIL unset (dry-run email)");
  }

  // Reply-To: optional, but a live sender without one points replies at a no-reply address.
  const replyTo = process.env.NOTIFICATION_REPLY_TO_EMAIL;
  if (replyTo) {
    const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo);
    add(ok ? "pass" : "warn", "reply-to", ok ? "NOTIFICATION_REPLY_TO_EMAIL format looks valid" : "NOTIFICATION_REPLY_TO_EMAIL format looks off");
  } else if (from) {
    add("warn", "reply-to", "NOTIFICATION_REPLY_TO_EMAIL unset — replies go to the sending address");
  }

  // Live email is production-only. The code refuses to send from preview regardless (send.ts), so a
  // key here is inert rather than dangerous — but it should not exist, and silence would hide it.
  if (vercelEnv === "preview" && (process.env.RESEND_API_KEY || from)) {
    add("warn", "preview-email", "live-email variables present in preview (inert — code forces dry-run — but remove them)");
  }
}

// ---- Report ----
const icon = { pass: "PASS", warn: "WARN", fail: "FAIL" };
console.log(`\nProduction config verifier  (VERCEL_ENV=${vercelEnv ?? "unset/local"})\n`);
for (const r of results) console.log(`  [${icon[r.level]}] ${r.name}: ${r.detail}`);
const fails = results.filter((r) => r.level === "fail");
const warns = results.filter((r) => r.level === "warn");
console.log(`\n${fails.length} fail, ${warns.length} warn, ${results.length - fails.length - warns.length} pass\n`);
process.exit(fails.length ? 1 : 0);
