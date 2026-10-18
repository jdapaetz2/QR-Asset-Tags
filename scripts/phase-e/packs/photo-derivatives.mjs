/**
 * Engineering Phase E2A — build the showcase photo derivatives from the licensed originals.
 *
 *   npm.cmd run phase-e:packs:photos [-- --only=e20-a,cat-301-5] [--vault=<dir>] [--inspect-dir=<dir outside Git>]
 *
 * Originals stay in the private source vault outside Git (default <home>/Mulemark-Sources/e2a). Each original's
 * SHA-256 is checked before use. Per recipe: remove third-party marks (scripts/lib/photo-retouch.mjs), crop to 16:9,
 * resize to the page hero size, bake the licence credit when the licence requires attribution, then encode WebP and
 * JPEG within the page budget. Metadata from the original (camera, location) is dropped; the credit and licence are
 * written as EXIF Artist/Copyright instead.
 *
 * Output: docs/phase-e/packs/<model_key>/media/<name>.{webp,jpg} and media.json, which lists every modification, the
 * crop, the credit, sizes and hashes. The credit label uses the machine's installed fonts, so bytes can differ between
 * machines; media.json records the files actually written.
 */
import { hash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { BUDGETS } from "../../lib/content-pack.mjs";
import { circlePolygon, inpaintDirectional } from "../../lib/photo-retouch.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PACKS = path.join(REPO, "docs", "phase-e", "packs");
export const HERO = { width: 1280, height: 720 };
export const BUDGET_BYTES = BUDGETS.heroBytes;

const BY_SA = { license: "CC BY-SA 4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0/" };
const CC0 = { license: "CC0 1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" };

/** Coordinates are original-image pixels, read off gridded inspection crops. */
export const RECIPES = [
  {
    id: "e20-a",
    status: "approved",
    model_key: "bobcat.e20.b3bl-canopy",
    out_dir: "bobcat.e20.b3bl-canopy/media",
    out_name: "e20-hero-a",
    source_id: "src-photo-e20-taurusemerald",
    original: {
      file: "photos/originals/Bobcat_E20_Mini_Excavator.jpg",
      sha256: "7577af369f83de13553d722108accec23e38e3544d5d0f52f02799c5e3c5cb81",
      width: 3658,
      height: 2686,
    },
    alt: "Bobcat E20 compact excavator with an open canopy, seen from the left side on a dirt lot",
    credit: {
      author: "TaurusEmerald",
      ...BY_SA,
      source_url: "https://commons.wikimedia.org/wiki/File:Bobcat_E20_Mini_Excavator.jpg",
      baked: "Photo: TaurusEmerald (Wikimedia Commons), CC BY-SA 4.0, modified",
    },
    retouch: [
      {
        what: "rental company's phone number on the lower body panel",
        polygon: [[738, 1895], [1022, 1895], [1022, 1961], [738, 1961]],
        angle: 0,
        relax: 600,
        grain: [760, 1966, 240, 30],
        grainRadius: 10,
      },
      {
        what: "rental company's name and 'Rents' sticker below the E20 model decal (the E20 decal is kept)",
        polygon: [[1025, 1883], [1104, 1883], [1105, 1871], [1318, 1878], [1317, 1977], [1104, 1971], [1103, 1949], [1025, 1949]],
        exclude: [[[1040, 1790], [1330, 1790], [1330, 1878], [1105, 1871], [1040, 1871]]],
        angle: 0,
        relax: 600,
        grain: [760, 1966, 240, 30],
        grainRadius: 10,
      },
      {
        what: "rental fleet number label on the canopy roof",
        polygon: [[872, 383], [1076, 394], [1076, 440], [872, 428]],
        // The sky above the roof edge is never a source, so the fill stays roof-coloured.
        exclude: [[[820, 300], [1130, 300], [1130, 399], [820, 377.5]]],
        angle: 3.9,
        feather: 3,
        grain: [1082, 406, 56, 22],
        grainStrength: 0.8,
      },
    ],
    crop: { left: 0, top: 326, width: 3658, height: 2058 },
    // Full-frame copy with the same edits for the marketing site's tag-placement scenes, whose overlay coordinates
    // are relative to the original frame. No baked label: getmulemark.com credits it on its credits page.
    extras: [{ name: "e20-fullframe-a", width: 1280, height: 940, format: "jpg", purpose: "getmulemark.com placement scenes (candidate)" }],
  },
  // Candidate B (src-photo-e20-housen, the 2015 Libramont cab unit) was prepared for the Stage 1 comparison and
  // dropped when the operator chose A on 2026-10-17.
  {
    id: "cat-301-5",
    status: "approved",
    model_key: "cat.301-5.canopy",
    out_dir: "cat.301-5.canopy/media",
    out_name: "301-5-hero",
    source_id: "src-photo-301-5-lostplanetkd73",
    original: {
      file: "photos/originals/A_small_Cat_vehicle_in_Bay_Shore_NY_-_July_2024.jpg",
      sha256: "dd86f34d500d06b70b22519fa9bbe61337e44aad47cf149b4fe3de040f300292",
      width: 4032,
      height: 3024,
    },
    alt: "Caterpillar 301.5 mini excavator with an open canopy, seen from the right side in a gravel yard",
    credit: {
      author: "LostplanetKD73",
      ...CC0,
      source_url: "https://commons.wikimedia.org/wiki/File:A_small_Cat_vehicle_in_Bay_Shore,_NY_-_July_2024.jpg",
      baked: null,
    },
    retouch: [
      {
        what: "round political sticker on the boom",
        // Centred 3 px down-right of the sticker (centre 1555.6,1246.9, radius 62) to cover its lower-right shadow while
        // staying clear of the plate edge above it.
        polygon: circlePolygon(1557.7, 1249, 71),
        // Along the boom's plate edges; a few relaxation sweeps soften the streaks without blurring the plates.
        angle: 40,
        relax: 20,
        feather: 3,
        grain: [1471, 1172, 13, 60],
        grainStrength: 0.8,
      },
      {
        what: "dealer decal above the 301.5 model decal (the model decal is kept)",
        polygon: [[2644, 1901], [2830, 1910], [2882, 1918], [2882, 1972], [2826, 1972], [2700, 1968], [2644, 1968]],
        exclude: [[[2640, 1966], [2910, 1966], [2910, 2060], [2640, 2060]]],
        angle: 3,
        relax: 600,
        feather: 2,
        grain: [2660, 1889, 180, 11],
      },
    ],
    crop: { left: 0, top: 427, width: 4032, height: 2268 },
  },
];

function parseArgs(argv) {
  const args = { vault: path.join(os.homedir(), "Mulemark-Sources", "e2a"), only: null, inspectDir: null };
  for (const arg of argv) {
    if (arg.startsWith("--vault=")) args.vault = arg.slice("--vault=".length);
    else if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length).split(",").filter(Boolean);
    else if (arg.startsWith("--inspect-dir=")) args.inspectDir = arg.slice("--inspect-dir=".length);
    else throw new Error(`Unknown option ${arg}.`);
  }
  return args;
}

/** Full-resolution before/after crops of each retouched area, for review outside Git (they show the removed marks). */
async function writeInspection(dir, recipe, before, after, image) {
  await mkdir(dir, { recursive: true });
  for (const [n, step] of recipe.retouch.entries()) {
    const xs = step.polygon.map(([x]) => x);
    const ys = step.polygon.map(([, y]) => y);
    const left = Math.max(0, Math.floor(Math.min(...xs)) - 40);
    const top = Math.max(0, Math.floor(Math.min(...ys)) - 40);
    const region = {
      left,
      top,
      width: Math.min(image.width, Math.ceil(Math.max(...xs)) + 40) - left,
      height: Math.min(image.height, Math.ceil(Math.max(...ys)) + 40) - top,
    };
    for (const [label, pixels] of [["before", before], ["after", after]]) {
      await sharp(pixels, { raw: image })
        .extract(region)
        .resize(region.width * 2, region.height * 2, { kernel: "nearest" })
        .png()
        .toFile(path.join(dir, `${recipe.id}-${n + 1}-${label}.png`));
    }
  }
}

function escapeMarkup(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A dark rounded label in the top-right corner, sized to the rendered text. */
async function creditLayers(text, imageWidth) {
  const label = await sharp({
    text: { text: `<span foreground="#FFFFFF">${escapeMarkup(text)}</span>`, font: "Arial 21", rgba: true, dpi: 72 },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  const padX = 10;
  const padY = 5;
  const margin = 14;
  const pillWidth = label.info.width + 2 * padX;
  const pillHeight = label.info.height + 2 * padY;
  const left = imageWidth - pillWidth - margin;
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pillWidth}" height="${pillHeight}">` +
      `<rect width="${pillWidth}" height="${pillHeight}" rx="6" fill="#000000" fill-opacity="0.62"/></svg>`
  );
  return {
    layers: [
      { input: pill, left, top: margin },
      { input: label.data, left: left + padX, top: margin + padY },
    ],
    box: { left, top: margin, width: pillWidth, height: pillHeight },
  };
}

async function encodeWithinBudget(raw, format, exif) {
  for (let quality = 84; quality >= 52; quality -= 4) {
    const image = sharp(raw.data, { raw: raw.info }).withExif(exif);
    const buffer =
      format === "webp"
        ? await image.webp({ quality, effort: 6 }).toBuffer()
        : await image.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= BUDGET_BYTES) return { buffer, quality };
  }
  throw new Error(`The ${format} hero does not fit within ${BUDGET_BYTES} bytes.`);
}

async function build(recipe, vault, inspectDir) {
  const bytes = await readFile(path.join(vault, recipe.original.file));
  const sha256 = hash("sha256", bytes);
  if (sha256 !== recipe.original.sha256) {
    throw new Error(`${recipe.id}: the original's SHA-256 is ${sha256}, not the recorded ${recipe.original.sha256}.`);
  }
  const decoded = await sharp(bytes).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (width !== recipe.original.width || height !== recipe.original.height) {
    throw new Error(`${recipe.id}: decoded ${width}x${height}, expected ${recipe.original.width}x${recipe.original.height}.`);
  }
  const pixels = decoded.data;
  const before = inspectDir ? Buffer.from(pixels) : null;
  const retouch = recipe.retouch.map((step) => {
    const { changed, sweeps } = inpaintDirectional(pixels, { width, height, channels }, step);
    return {
      what: step.what,
      polygon: step.polygon,
      exclude: step.exclude ?? [],
      angle: step.angle ?? 0,
      relax_sweeps: sweeps,
      grain: step.grain ?? null,
      pixels_changed: changed,
    };
  });
  if (inspectDir) await writeInspection(inspectDir, recipe, before, pixels, { width, height, channels });

  const credit = recipe.credit.baked ? await creditLayers(recipe.credit.baked, HERO.width) : null;
  // A lossless PNG hop gives the composite a properly tagged sRGB base; compositing straight onto raw input shifted
  // the colours of the whole frame.
  const resized = await sharp(pixels, { raw: { width, height, channels } })
    .extract(recipe.crop)
    .resize(HERO.width, HERO.height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const finalRaw = await sharp(resized)
    .composite(credit ? credit.layers : [])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const modified = recipe.retouch.length > 0;
  const exif = {
    IFD0: {
      Artist: recipe.credit.author,
      Copyright: `${recipe.credit.author}, ${recipe.credit.license}${modified ? ", modified" : ""} (${recipe.credit.source_url})`,
      ImageDescription: recipe.alt,
    },
  };
  const dir = path.join(PACKS, ...recipe.out_dir.split("/"));
  await mkdir(dir, { recursive: true });
  const outputs = [];
  for (const format of ["webp", "jpg"]) {
    const { buffer, quality } = await encodeWithinBudget(finalRaw, format, exif);
    const file = `${recipe.out_name}.${format}`;
    await writeFile(path.join(dir, file), buffer);
    outputs.push({ file, width: HERO.width, height: HERO.height, bytes: buffer.length, sha256: hash("sha256", buffer), quality });
  }
  const extras = [];
  for (const extra of recipe.extras ?? []) {
    const raw = await sharp(pixels, { raw: { width, height, channels } })
      .resize(extra.width, extra.height, { kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { buffer, quality } = await encodeWithinBudget(raw, extra.format, exif);
    const file = `${extra.name}.${extra.format}`;
    await writeFile(path.join(dir, file), buffer);
    extras.push({ file, width: extra.width, height: extra.height, bytes: buffer.length, sha256: hash("sha256", buffer), quality, purpose: extra.purpose });
  }

  const modifications = [
    ...retouch.map((step) => `Removed the ${step.what}.`),
    `Cropped to 16:9 (left ${recipe.crop.left}, top ${recipe.crop.top}, ${recipe.crop.width}x${recipe.crop.height}) and resized to ${HERO.width}x${HERO.height}.`,
    ...(credit ? [`Added the credit label "${recipe.credit.baked}" in the top-right corner.`] : []),
    ...extras.map((e) => `${e.file}: the same edits on the full frame, resized to ${e.width}x${e.height}, no label (${e.purpose}).`),
    "Dropped the original's camera and location metadata.",
  ];
  return {
    dir,
    item: {
      id: recipe.id,
      status: recipe.status,
      model_key: recipe.model_key,
      source_id: recipe.source_id,
      alt: recipe.alt,
      original: { file: path.posix.basename(recipe.original.file), sha256, width, height },
      credit: { ...recipe.credit, modified },
      modifications,
      retouch,
      crop: recipe.crop,
      credit_box: credit ? credit.box : null,
      outputs,
      ...(extras.length ? { extras } : {}),
    },
  };
}

async function writeManifest(dir, items) {
  const file = path.join(dir, "media.json");
  let existing = [];
  try {
    existing = JSON.parse(await readFile(file, "utf8")).items ?? [];
  } catch {
    existing = [];
  }
  const merged = [...existing.filter((item) => !items.some((n) => n.id === item.id)), ...items].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const manifest = {
    generated_by: "scripts/phase-e/packs/photo-derivatives.mjs",
    budget_bytes: BUDGET_BYTES,
    items: merged,
  };
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error("Usage: npm.cmd run phase-e:packs:photos [-- --only=<id>[,<id>]] [--vault=<dir>]");
    process.exitCode = 2;
    return;
  }
  const recipes = args.only ? RECIPES.filter((r) => args.only.includes(r.id)) : RECIPES;
  if (recipes.length === 0) {
    console.error(`No recipe matches ${args.only.join(",")}. Known: ${RECIPES.map((r) => r.id).join(", ")}.`);
    process.exitCode = 2;
    return;
  }
  const byDir = new Map();
  for (const recipe of recipes) {
    const { dir, item } = await build(recipe, args.vault, args.inspectDir);
    byDir.set(dir, [...(byDir.get(dir) ?? []), item]);
    for (const out of item.outputs) {
      console.log(`${recipe.id}: ${recipe.out_dir}/${out.file}  ${out.bytes} bytes  q${out.quality}  sha256 ${out.sha256}`);
    }
    for (const step of item.retouch) console.log(`  removed ${step.what} (${step.pixels_changed} px)`);
  }
  for (const [dir, items] of byDir) await writeManifest(dir, items);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
