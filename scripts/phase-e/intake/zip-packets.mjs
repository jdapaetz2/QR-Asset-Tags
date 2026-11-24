/**
 * Engineering Phase E3 — build the two ZIP packets from the committed kit folders.
 *
 *   npm.cmd run phase-e:intake:zip
 *
 * Writes docs/phase-e/intake/packets/ (gitignored; rebuilt on demand):
 *   mulemark-customer-packet-v<version>.zip   everything in customer/ (send this, plus the upload link, to a customer)
 *   mulemark-internal-packet-v<version>.zip   internal/ and the synthetic example-run/ (never sent to customers)
 * Reproducible: sorted entries, fixed timestamps.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KIT, PATHS } from "./kit-config.mjs";
import { writeZip } from "./zip.mjs";

async function filesUnder(dir, prefix) {
  const out = [];
  async function walk(d) {
    for (const entry of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push({ name: `${prefix}/${path.relative(dir, full).split(path.sep).join("/")}`, data: await readFile(full) });
    }
  }
  await walk(dir);
  return out;
}

export async function buildPackets() {
  const v = KIT.workbookVersion;
  await mkdir(PATHS.packets, { recursive: true });
  const customerTop = `Mulemark customer packet v${v}`;
  const internalTop = `Mulemark internal packet v${v}`;
  const customer = await filesUnder(PATHS.customer, customerTop);
  const internal = [...(await filesUnder(PATHS.internal, internalTop)), ...(await filesUnder(PATHS.exampleRun, `${internalTop}/example-run`))];
  const out = {
    customer: path.join(PATHS.packets, `mulemark-customer-packet-v${v}.zip`),
    internal: path.join(PATHS.packets, `mulemark-internal-packet-v${v}.zip`),
  };
  await writeFile(out.customer, writeZip(customer, { date: KIT.fixedDate }));
  await writeFile(out.internal, writeZip(internal, { date: KIT.fixedDate }));
  return { out, counts: { customer: customer.length, internal: internal.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, counts } = await buildPackets();
  console.log(`Customer packet: ${counts.customer} files -> ${out.customer}`);
  console.log(`Internal packet: ${counts.internal} files -> ${out.internal}`);
}
