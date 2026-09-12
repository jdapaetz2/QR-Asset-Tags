# libheif (via libheif-js) — third-party notice

`libheif.js` and `libheif.wasm` in this folder are the **unmodified** WebAssembly build of
[libheif](https://github.com/strukturag/libheif) published in the npm package
[libheif-js 1.23.2](https://www.npmjs.com/package/libheif-js/v/1.23.2). The build reports libheif version 1.23.2.

- libheif source: <https://github.com/strukturag/libheif> (releases: <https://github.com/strukturag/libheif/releases>)
- libheif-js build scripts: <https://github.com/catdad-experiments/libheif-js>

libheif is licensed under the **GNU Lesser General Public License v3.0**; the licence text is in `LICENSE` in this
folder. Mulemark uses it as a separate, dynamically loaded file: `/workers/photo-worker.js` loads it only when a
browser cannot decode a HEIC/HEIF photo itself, to convert that photo to JPEG on the user's own device. You may replace
these two files with your own build of the same interface.
