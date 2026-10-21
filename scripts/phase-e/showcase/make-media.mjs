/**
 * Engineering Phase E2B — build the evidence images of the synthetic showcase history, once.
 *
 *   npm.cmd run phase-e:showcase:media                     write every image that does not exist yet, then media.json
 *   npm.cmd run phase-e:showcase:media -- --preview=<dir>   render everything into <dir> (outside Git); touch nothing tracked
 *   npm.cmd run phase-e:showcase:media -- --replace=<key>   re-render one image on purpose (its hash in media.json changes)
 *
 * Two rights-cleared photos (the E2A derivatives of the Bobcat E20, CC BY-SA 4.0, and the Cat 301.5, CC0) and the
 * original drawings of scripts/phase-e/showcase/evidence-drawings.mjs. Every image carries one small corner tag, and only
 * the tag: "Illustrative photo" (plus the licence credit the E20 photo's licence requires) or "Illustration". The tag
 * uses the machine's installed fonts, so a re-render can differ byte for byte: the images are written once, their
 * SHA-256 is recorded in docs/phase-e/showcase/media.json, and the dataset builder checks it. Existing files are never
 * overwritten without --replace.
 */
import { hash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { DRAWINGS } from "./evidence-drawings.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = path.join(REPO, "docs", "phase-e", "showcase", "media");
const MEDIA_JSON = path.join(REPO, "docs", "phase-e", "showcase", "media.json");

const DRAWING_RIGHTS = {
  author: "Mulemark (original drawing, Engineering Phase E2B)",
  license: "Mulemark original work",
  source_url: null,
  modified: false,
};

/** Every evidence image: what it shows, which inspection slot uses it, and its rights. */
export const MEDIA_ITEMS = [
  {
    key: "e20-illustrative-photo",
    kind: "photo",
    asset_code: "EXCAVATOR-017",
    from: "docs/phase-e/packs/bobcat.e20.b3bl-canopy/media/e20-fullframe-a.jpg",
    crop: { left: 0, top: 114, width: 1280, height: 720 },
    size: { width: 1024, height: 576 },
    tag: { strong: "Illustrative photo", rest: " · Photo: TaurusEmerald (Wikimedia Commons), CC BY-SA 4.0, modified" },
    alt: "Illustrative photo of a Bobcat E20 compact excavator with an open canopy (not this unit)",
    used_for: ["overall_photo"],
    rights: {
      author: "TaurusEmerald",
      license: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      source_url: "https://commons.wikimedia.org/wiki/File:Bobcat_E20_Mini_Excavator.jpg",
      modified: true,
      modifications: [
        "The E2A derivative (rental company marks removed, docs/phase-e/packs/bobcat.e20.b3bl-canopy/media/media.json), cropped to 16:9 and resized to 1024x576.",
        "Added the corner tag \"Illustrative photo · Photo: TaurusEmerald (Wikimedia Commons), CC BY-SA 4.0, modified\".",
      ],
      share_alike: "This derivative is shared under CC BY-SA 4.0.",
    },
  },
  {
    key: "cat-301-5-illustrative-photo",
    kind: "photo",
    asset_code: "EXCAVATOR-3015",
    from: "docs/phase-e/packs/cat.301-5.canopy/media/301-5-hero.jpg",
    size: { width: 1024, height: 576 },
    tag: { strong: "Illustrative photo", rest: "" },
    alt: "Illustrative photo of a Cat 301.5 mini excavator with a canopy (not this unit)",
    used_for: ["overall_photo"],
    rights: {
      author: "LostplanetKD73",
      license: "CC0 1.0",
      license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
      source_url: "https://commons.wikimedia.org/wiki/File:A_small_Cat_vehicle_in_Bay_Shore,_NY_-_July_2024.jpg",
      modified: true,
      modifications: ["The E2A derivative resized to 1024x576.", "Added the corner tag \"Illustrative photo\"."],
    },
  },
  { key: "e20-bucket-illustration", kind: "drawing", asset_code: "EXCAVATOR-017", alt: "Illustration: the E20's bucket on the end of its white arm, resting on dirt", used_for: ["attachment_photo"] },
  { key: "cat-301-5-bucket-illustration", kind: "drawing", asset_code: "EXCAVATOR-3015", alt: "Illustration: the 301.5's bucket on the end of its yellow arm, resting on dirt", used_for: ["attachment_photo"] },
  { key: "35sa-hitch-illustration", kind: "drawing", asset_code: "TRAILER-014", alt: "Illustration: the 35SA-12 tongue with its ball coupler, jack down, crossed safety chains and 4-way plug", used_for: ["front_hitch_photo"] },
  { key: "35sa-deck-illustration", kind: "drawing", asset_code: "TRAILER-014", alt: "Illustration: the 35SA-12 wood deck from behind, rails with tie-down loops, ramp gate lowered", used_for: ["deck_photo"] },
  { key: "14lp-hitch-illustration", kind: "drawing", asset_code: "TRAILER-2041", alt: "Illustration: the 14LP-14 tongue with its adjustable coupler, drop-leg jack, breakaway switch, battery box and 7-way plug", used_for: ["front_hitch_photo"] },
  { key: "14lp-body-illustration", kind: "drawing", asset_code: "TRAILER-2041", alt: "Illustration: the empty 14LP-14 dump body from behind, rear doors chained open", used_for: ["deck_photo"] },
  { key: "35sa-tail-lamp-illustration", kind: "drawing", asset_code: "TRAILER-014", alt: "Illustration: a cracked lens on the 35SA-12's left tail lamp", used_for: ["damage_photos"] },
  { key: "cat-301-5-worn-tooth-illustration", kind: "drawing", asset_code: "EXCAVATOR-3015", alt: "Illustration: the 301.5's bucket edge with one tooth worn short and blunt", used_for: ["damage_photos"] },
  { key: "cat-301-5-weeping-fitting-illustration", kind: "drawing", asset_code: "EXCAVATOR-3015", alt: "Illustration: a hose fitting on the 301.5's boom with an oil film and a drip", used_for: ["damage_photos"] },
];

function escapeMarkup(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One dark rounded tag in the bottom-left corner, sized to the rendered text. */
async function tagLayers({ strong, rest }, imageHeight) {
  const markup = `<span foreground="#FFFFFF"><b>${escapeMarkup(strong)}</b>${escapeMarkup(rest)}</span>`;
  const text = await sharp({ text: { text: markup, font: "Arial 16", rgba: true, dpi: 72 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  const padX = 9;
  const padY = 5;
  const margin = 12;
  const width = text.info.width + 2 * padX;
  const height = text.info.height + 2 * padY;
  const top = imageHeight - height - margin;
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="6" fill="#000000" fill-opacity="0.62"/></svg>`
  );
  return {
    layers: [
      { input: pill, left: margin, top },
      { input: text.data, left: margin + padX, top: top + padY },
    ],
    box: { left: margin, top, width, height },
  };
}

async function render(item) {
  let base;
  if (item.kind === "photo") {
    let image = sharp(await readFile(path.join(REPO, item.from))).rotate();
    if (item.crop) image = image.extract(item.crop);
    base = await image.resize(item.size.width, item.size.height, { kernel: "lanczos3" }).png().toBuffer();
  } else {
    const draw = DRAWINGS[item.key];
    if (!draw) throw new Error(`No drawing for ${item.key}.`);
    base = await sharp(Buffer.from(draw())).png().toBuffer();
  }
  const meta = await sharp(base).metadata();
  const tag = await tagLayers(item.kind === "photo" ? item.tag : { strong: "Illustration", rest: "" }, meta.height);
  const flat = await sharp(base).composite(tag.layers).removeAlpha().png().toBuffer();
  const webp = await sharp(flat).webp({ quality: item.kind === "photo" ? 80 : 84, effort: 6 }).toBuffer();
  return { webp, flat, width: meta.width, height: meta.height, tagBox: tag.box };
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw new Error(`Unknown argument ${arg}`);
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.preview) {
    const dir = path.resolve(String(args.preview));
    if (dir.startsWith(REPO)) throw new Error("Preview into a folder outside the repository.");
    await mkdir(dir, { recursive: true });
    for (const item of MEDIA_ITEMS) {
      const out = await render(item);
      await writeFile(path.join(dir, `${item.key}.png`), out.flat);
      console.log(`preview ${item.key} ${out.width}x${out.height} webp ${out.webp.length} B`);
    }
    return;
  }
  await mkdir(OUT, { recursive: true });
  const previous = existsSync(MEDIA_JSON) ? JSON.parse(await readFile(MEDIA_JSON, "utf8")) : { items: [] };
  const byKey = new Map(previous.items.map((i) => [i.key, i]));
  const items = [];
  for (const item of MEDIA_ITEMS) {
    const file = `${item.key}.webp`;
    const target = path.join(OUT, file);
    const replace = args.replace === item.key;
    let entry = byKey.get(item.key);
    if (!existsSync(target) || replace) {
      const out = await render(item);
      await writeFile(target, out.webp);
      entry = { width: out.width, height: out.height, tag_box: out.tagBox };
      console.log(`wrote ${file} (${out.webp.length} B)`);
    } else if (!entry) {
      throw new Error(`${file} exists but media.json has no record of it; re-render it on purpose with --replace=${item.key}.`);
    }
    const bytes = await readFile(target);
    // A replaced file keeps its key; its own size and hash are what get recorded.
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "webp") throw new Error(`${file} is not a WebP image`);
    items.push({
      key: item.key,
      file,
      kind: item.kind,
      asset_code: item.asset_code,
      content_type: "image/webp",
      width: meta.width,
      height: meta.height,
      bytes: bytes.length,
      sha256: hash("sha256", bytes),
      label: item.kind === "photo" ? `${item.tag.strong}${item.tag.rest}` : "Illustration",
      tag_box: entry.tag_box,
      alt: item.alt,
      used_for: item.used_for,
      rights: item.rights ?? DRAWING_RIGHTS,
    });
  }
  const json = {
    schema: "mulemark.phase-e.showcase-media/v1",
    generated_by: "scripts/phase-e/showcase/make-media.mjs",
    policy: [
      "Rights-cleared evidence for the synthetic history only: two licensed photos of the right model (not of the showcase units) and original drawings.",
      "Each image carries one small corner tag and nothing else: \"Illustrative photo\" (with the credit the CC BY-SA licence requires) or \"Illustration\".",
      "Same-asset images show the same model and configuration. Each damage drawing is used for one incident only; routine condition photos reuse the asset's own image.",
      "Incidents without a fitting image are valid reports without photos. Written once; the dataset builder checks every SHA-256.",
    ],
    items,
  };
  await writeFile(MEDIA_JSON, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`media.json: ${items.length} items`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
