# Third-party notices

Mulemark includes or serves the following third-party software. Application dependencies installed from npm are
listed in `package.json` and `package-lock.json` with their own licences; this file records components that are
**served to browsers as separate files** or that carry licence obligations beyond attribution.

## libheif (via libheif-js)

- **What:** the libheif HEIF/HEIC decoder compiled to WebAssembly, from the npm package `libheif-js` 1.23.2
  (libheif 1.23.2).
- **Licence:** GNU Lesser General Public License v3.0 (LGPL-3.0).
- **Source:** <https://github.com/strukturag/libheif>; build scripts <https://github.com/catdad-experiments/libheif-js>.
- **How Mulemark uses it:** `scripts/vendor-libheif.mjs` copies the unmodified `libheif.js` and `libheif.wasm`, with the
  licence text and a notice, into `public/vendor/libheif/` at build time. The photo worker
  (`public/workers/photo-worker.js`) loads them on demand, only when a browser cannot decode a HEIC/HEIF photo itself,
  to convert that photo to JPEG on the user's device. They are separate files, not bundled into application code, and
  can be replaced with another build of the same interface.
- **Updating:** pin an exact version in `package.json`, review upstream security advisories and changes, update this
  file and `public/vendor/libheif/NOTICE.md`, and re-run the D4.1 photo checks (docs/STORAGE_MEDIA_LIFECYCLE.md).
