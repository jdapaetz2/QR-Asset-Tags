import path from "node:path";

import { LOCAL_OWNER, LOCAL_PASSWORD } from "../../scripts/lib/showcase-local-login.mjs";
import { E2E_BASE_URL } from "../e2e/support/roles";
import { applyLocalGrantParity } from "../security/setup/grants";
import { assertLocal, getStackConfig } from "../security/setup/stack";
import { NORTHRIDGE, db, runTool, serviceClient, tempRoot } from "./support";

/**
 * Engineering Phase E2B — walkthrough setup on the LOCAL stack (the npm script resets it first): hosted-parity grants,
 * the rehearsal bootstrap, the showcase applied with the real reset tool, a local platform-owner login, and a proof that
 * the server on the E2E port reads THIS stack (a seed-only code must resolve; Production does not have it).
 */
export default async function globalSetup(): Promise<void> {
  const { apiUrl } = getStackConfig();
  assertLocal(apiUrl);
  await applyLocalGrantParity();

  const boot = runTool("scripts/phase-e/showcase-bootstrap.mjs", ["--target=local", "--apply"]);
  if (boot.status !== 0) throw new Error(`walkthrough setup: the bootstrap failed\n${boot.out.slice(-1500)}`);
  const manifest = path.join(tempRoot("walkthrough"), "showcase.json");
  for (const step of [["manifest", "--kind=showcase", `--org=${NORTHRIDGE}`, `--out=${manifest}`], ["plan", `--manifest=${manifest}`], ["apply", `--manifest=${manifest}`]]) {
    const r = runTool("scripts/phase-e/showcase-reset.mjs", ["--target=local", ...step]);
    if (r.status !== 0) throw new Error(`walkthrough setup: ${step[0]} failed (reset the local stack first)\n${r.out.slice(-1500)}`);
  }

  const admin = serviceClient();
  const existing = await admin.auth.admin.getUserById(LOCAL_OWNER.authId);
  if (!existing.data?.user) {
    const { error } = await admin.auth.admin.createUser({ id: LOCAL_OWNER.authId, email: LOCAL_OWNER.email, password: LOCAL_PASSWORD, email_confirm: true });
    if (error) throw new Error(`walkthrough setup: could not create the local owner login (${error.message})`);
  }
  const client = await db();
  try {
    await client.query(
      `insert into public.profiles (id, auth_user_id, organization_id, name, email, role, status) values ($1, $2, null, $3, $4, 'platform_owner', 'active') on conflict (id) do nothing`,
      [LOCAL_OWNER.profileId, LOCAL_OWNER.authId, LOCAL_OWNER.name, LOCAL_OWNER.email]
    );
  } finally {
    await client.end();
  }

  const res = await fetch(`${E2E_BASE_URL}/nojs/t/demo-sl021`, { redirect: "manual" });
  const body = await res.text();
  if (res.status !== 200 || /This page isn(?:&#x27;|&#39;|’|')t available/i.test(body)) {
    throw new Error(`the server on ${E2E_BASE_URL} does not read the local stack (the seed-only code did not resolve); stop it and run again`);
  }
}
