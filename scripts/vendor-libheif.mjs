#!/usr/bin/env node
/**
 * Copies the unmodified libheif-js WebAssembly build into public/vendor/libheif/ (Engineering Phase D4.1).
 *
 * public/workers/photo-worker.js loads these two files on demand, only when a browser cannot decode a HEIC/HEIF photo
 * itself. libheif is LGPL-3.0: the files are served byte-for-byte as published (so a user can swap in their own
 * build), alongside the licence and a notice naming the source (public/vendor/libheif/NOTICE.md,
 * THIRD_PARTY_NOTICES.md). The copies are build output — gitignored and produced by `predev` / `prebuild` and the e2e
 * web server — so they always match the pinned dependency. The version check stops a silent upgrade.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = `${root}node_modules/libheif-js/`;
const destination = `${root}public/vendor/libheif/`;
const FILES = [
  ["libheif-wasm/libheif.js", "libheif.js"],
  ["libheif-wasm/libheif.wasm", "libheif.wasm"],
  ["LICENSE", "LICENSE"],
];

const pinned = JSON.parse(readFileSync(`${root}package.json`, "utf8")).dependencies?.["libheif-js"];
let installed;
try {
  installed = JSON.parse(readFileSync(`${source}package.json`, "utf8")).version;
} catch {
  console.error("[vendor-libheif] libheif-js is not installed — run npm install.");
  process.exit(1);
}
if (!pinned || installed !== pinned) {
  console.error(
    `[vendor-libheif] installed libheif-js ${installed} does not match the pinned ${pinned ?? "(none)"}. ` +
      "Pin an exact version in package.json, review the upstream changes and update NOTICE.md."
  );
  process.exit(1);
}

mkdirSync(destination, { recursive: true });
for (const [from, to] of FILES) copyFileSync(`${source}${from}`, `${destination}${to}`);
console.log(`[vendor-libheif] copied libheif-js ${installed} (${FILES.map(([, to]) => to).join(", ")})`);
