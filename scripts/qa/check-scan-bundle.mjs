#!/usr/bin/env node
/**
 * Scan-page bundle guard (Engineering Phase D4.1). Run after `npm run build`.
 *
 * The public scan page (/t/[shortCode] and its no-JavaScript copy) is the renter's first screen and must stay light:
 * it may not load the photo adapter (lib/media/consumer-photo/) or anything naming the HEIC decoder. The adapter's
 * chunks are found by markers that only its code contains; the damage form must reference them (proving the check can
 * see the adapter) and the scan pages must not.
 *
 * Reads local build output only. Exit 0 ok, 1 failed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CHUNKS = `${root}.next/static/chunks/`;
const MARKERS = ["/workers/photo-worker.js", "libheif"];
const SCAN_MANIFESTS = [
  ".next/server/app/t/[shortCode]/page_client-reference-manifest.js",
  ".next/server/app/nojs/t/[shortCode]/page_client-reference-manifest.js",
];
const CONTROL_MANIFEST = ".next/server/app/forms/[shortCode]/damage/(form)/page_client-reference-manifest.js";

function fail(message) {
  console.error(`[scan-bundle] FAIL: ${message}`);
  process.exit(1);
}

if (!existsSync(CHUNKS)) fail("no build output — run npm run build first");

const chunkNames = readdirSync(CHUNKS, { recursive: true })
  .map((name) => String(name).replaceAll("\\", "/"))
  .filter((name) => name.endsWith(".js"));
const adapterChunks = chunkNames.filter((name) => {
  const text = readFileSync(`${CHUNKS}${name}`, "utf8");
  return MARKERS.some((marker) => text.includes(marker));
});
if (adapterChunks.length === 0) fail("no client chunk contains the photo adapter — the markers are stale");

function referencedAdapterChunks(manifest) {
  if (!existsSync(`${root}${manifest}`)) fail(`missing ${manifest}`);
  const text = readFileSync(`${root}${manifest}`, "utf8");
  return adapterChunks.filter((chunk) => text.includes(chunk.split("/").pop()));
}

if (referencedAdapterChunks(CONTROL_MANIFEST).length === 0) {
  fail("the damage form does not reference the photo adapter — this check cannot see it");
}
for (const manifest of SCAN_MANIFESTS) {
  const hits = referencedAdapterChunks(manifest);
  if (hits.length > 0) fail(`${manifest} loads photo adapter chunks: ${hits.join(", ")}`);
}
console.log(
  `[scan-bundle] ok: ${adapterChunks.length} photo-adapter chunks; the damage form loads them, the scan page and its no-JavaScript copy do not`
);
