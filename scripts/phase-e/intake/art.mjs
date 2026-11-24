/**
 * Engineering Phase E3 — original drawings for the customer's one-page "what to expect" sheet (kit 2.0).
 *
 * Drawn from the E2A drawing kit (scripts/phase-e/packs/pictogram-kit.mjs), so they share its look and its text rule:
 * numbers and symbols only, never words (the kit refuses anything else at draw time). The words that go with each
 * drawing live in the documents, next to it. Every drawing has a title and a description for screen readers.
 */
import sharp from "sharp";

import { C, arrow, book, camera, circle, cross, eye, keyGlyph, line, padlock, path, rect, svgDocument, tick } from "../packs/pictogram-kit.mjs";

/** A spreadsheet page with a dark header band and grid lines. */
function sheet(x, y, w, h) {
  const parts = [rect(x, y, w, h, { fill: C.paper, sw: 4, rx: 4 }), rect(x, y, w, h * 0.16, { fill: C.dark, sw: 4, rx: 4 })];
  for (let i = 1; i <= 4; i++) parts.push(line(x + 4, y + h * 0.16 + (i * h * 0.84) / 5, x + w - 4, y + h * 0.16 + (i * h * 0.84) / 5, { stroke: C.steel, sw: 2.5 }));
  parts.push(line(x + w * 0.38, y + h * 0.16, x + w * 0.38, y + h - 3, { stroke: C.steel, sw: 2.5 }));
  return parts.join("");
}

/** A metal asset tag: rounded plate, a ring hole and QR-like modules. */
function assetTag(cx, cy, s = 1) {
  const w = 150 * s;
  const h = 92 * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const parts = [rect(x, y, w, h, { fill: C.steel, sw: 4 * s, rx: 14 * s }), circle(x + 24 * s, cy, 10 * s, { fill: C.paper, sw: 4 * s })];
  const qx = x + 58 * s;
  const qy = y + 14 * s;
  const m = 8 * s;
  const finder = (fx, fy) => rect(fx, fy, 3 * m, 3 * m, { fill: C.ink, stroke: "none" }) + rect(fx + m * 0.6, fy + m * 0.6, m * 1.8, m * 1.8, { fill: C.steel, stroke: "none" }) + rect(fx + m, fy + m, m, m, { fill: C.ink, stroke: "none" });
  parts.push(rect(qx - 3 * s, qy - 3 * s, 8 * m + 6 * s, 8 * m + 6 * s, { fill: C.paper, stroke: "none", rx: 3 * s }));
  parts.push(finder(qx, qy), finder(qx + 5 * m, qy), finder(qx, qy + 5 * m));
  for (const [i, j] of [[4, 0], [4, 2], [3, 4], [5, 4], [6, 5], [4, 6], [7, 7], [5, 7], [7, 3], [6, 6]]) parts.push(rect(qx + i * m, qy + j * m, m, m, { fill: C.ink, stroke: "none" }));
  return parts.join("");
}

/** A phone body with its screen; returns the screen box too, for whatever is drawn on it. */
function phone(cx, cy, s = 1) {
  const w = 76 * s;
  const h = 136 * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const screen = { x: x + 7 * s, y: y + 14 * s, w: w - 14 * s, h: h - 28 * s };
  return { svg: rect(x, y, w, h, { fill: C.dark, sw: 4 * s, rx: 12 * s }) + rect(screen.x, screen.y, screen.w, screen.h, { fill: C.paper, sw: 2.5 * s, rx: 4 * s }), screen };
}

/** A phone showing an equipment page: photo block, text lines and a button. */
function phonePage(cx, cy, s = 1) {
  const { svg } = phone(cx, cy, s);
  const x = cx - 38 * s;
  const y = cy - 68 * s;
  const w = 76 * s;
  return [
    svg,
    rect(x + 13 * s, y + 21 * s, w - 26 * s, 30 * s, { fill: C.body2, stroke: "none", rx: 3 * s }),
    line(x + 14 * s, y + 63 * s, x + w - 14 * s, y + 63 * s, { stroke: C.steel, sw: 4 * s }),
    line(x + 14 * s, y + 75 * s, x + w - 24 * s, y + 75 * s, { stroke: C.steel, sw: 4 * s }),
    line(x + 14 * s, y + 87 * s, x + w - 18 * s, y + 87 * s, { stroke: C.steel, sw: 4 * s }),
    rect(x + 14 * s, y + 97 * s, w - 28 * s, 12 * s, { fill: C.action, stroke: "none", rx: 4 * s }),
  ].join("");
}

/** Sound waves: two arcs opening to the upper right of (cx, cy), for "a call". */
function waves(cx, cy, s = 1) {
  return [16, 28].map((r) => path(`M${cx + r * s * 0.2} ${cy - r * s} A${r * s} ${r * s} 0 0 1 ${cx + r * s} ${cy - r * s * 0.2}`, { stroke: C.action, sw: 5 * s })).join("");
}

/** An envelope: body and flap. */
function envelope(cx, cy, s = 1) {
  const w = 96 * s;
  const h = 64 * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return rect(x, y, w, h, { fill: C.paper, sw: 4 * s, rx: 5 * s }) + path(`M${x + 4 * s} ${y + 6 * s} L${cx} ${cy + 6 * s} L${x + w - 4 * s} ${y + 6 * s}`, { stroke: C.ink, sw: 4 * s });
}

/** A document page with text lines. */
function page(x, y, w, h, lines = 4) {
  const parts = [rect(x, y, w, h, { fill: C.paper, sw: 4, rx: 4 })];
  for (let i = 0; i < lines; i++) parts.push(line(x + 12, y + 20 + i * 16, x + w - 12 - (i % 2) * 14, y + 20 + i * 16, { stroke: C.steel, sw: 4 }));
  return parts.join("");
}

/** Head and shoulders, for "no renter details". */
function headAndShoulders(cx, cy) {
  return circle(cx, cy - 26, 24, { fill: C.body2, sw: 4 }) + path(`M${cx - 52} ${cy + 46} Q${cx - 48} ${cy + 4} ${cx} ${cy + 4} Q${cx + 48} ${cy + 4} ${cx + 52} ${cy + 46} Z`, { fill: C.body2, sw: 4 });
}

/** An ID-style card: photo box and lines, for "no ID documents". */
function idCard(cx, cy) {
  return [
    rect(cx - 70, cy - 44, 140, 88, { fill: C.paper, sw: 4, rx: 8 }),
    rect(cx - 58, cy - 30, 40, 50, { fill: C.body2, sw: 3, rx: 3 }),
    circle(cx - 38, cy - 12, 9, { fill: C.steel, stroke: "none" }),
    line(cx - 8, cy - 22, cx + 56, cy - 22, { stroke: C.steel, sw: 4 }),
    line(cx - 8, cy - 6, cx + 46, cy - 6, { stroke: C.steel, sw: 4 }),
    line(cx - 8, cy + 10, cx + 52, cy + 10, { stroke: C.steel, sw: 4 }),
  ].join("");
}

export const ART = {
  "step-call": {
    title: "Call and list",
    desc: "A phone with sound waves next to a spreadsheet: a short call, and your equipment list as your software exports it.",
    width: 240,
    height: 200,
    body: () => sheet(18, 50, 96, 118) + phone(168, 110, 0.95).svg + waves(206, 46, 1),
  },
  "step-prepare": {
    title: "We build",
    desc: "A manual, an arrow and a phone page: Mulemark turns your rules and the maker's manual into your equipment pages.",
    width: 240,
    height: 200,
    body: () => book(52, 104, 1.5) + arrow(84, 104, 128, 104, { sw: 7, head: 16 }) + phonePage(178, 104, 1),
  },
  "step-preview": {
    title: "Check",
    desc: "A phone showing an equipment page, and an eye: you check every page on your phone.",
    width: 240,
    height: 200,
    body: () => phonePage(98, 104, 1.15) + eye(184, 70, 1.4),
  },
  "step-approve": {
    title: "Approve",
    desc: "A page with a large green tick: you approve the exact version you saw.",
    width: 240,
    height: 200,
    body: () => page(46, 34, 118, 140, 5) + tick(166, 146, 34),
  },
  "step-tags": {
    title: "Tags",
    desc: "A metal tag with a punched hole and a QR code: tags are made for the approved equipment.",
    width: 240,
    height: 200,
    body: () => assetTag(120, 100, 1.2),
  },
  "photo-phone": {
    title: "Photos from a phone",
    desc: "A phone with a camera on its screen: add photos of your machines from your phone, any time.",
    width: 160,
    height: 130,
    body: () => {
      const p = phone(80, 66, 0.82);
      return p.svg + camera(80, 68, 0.95);
    },
  },
  "manual-email": {
    title: "Manuals by email",
    desc: "A manual and an envelope with an arrow between them: email us any manuals or instructions of your own.",
    width: 160,
    height: 130,
    body: () => book(38, 66, 1.2) + arrow(62, 66, 84, 66, { sw: 5, head: 11 }) + envelope(120, 66, 0.62),
  },
  "no-password": {
    title: "No passwords",
    desc: "A padlock and a key with a red cross: don't send passwords or sign-in details.",
    width: 160,
    height: 130,
    body: () => padlock(64, 72, 1.8) + keyGlyph(112, 66, 1.1) + cross(136, 108, 16),
  },
  "no-card": {
    title: "No card or bank details",
    desc: "A payment card with a red cross: don't send card or bank details.",
    width: 160,
    height: 130,
    body: () => rect(26, 32, 104, 66, { fill: C.body2, sw: 4, rx: 8 }) + rect(26, 46, 104, 12, { fill: C.dark, stroke: "none" }) + rect(38, 70, 26, 16, { fill: "#F3D98B", sw: 2.5, rx: 3 }) + cross(136, 108, 16),
  },
  "no-id": {
    title: "No ID documents",
    desc: "An ID card with a red cross: don't send ID documents.",
    width: 160,
    height: 130,
    body: () => `<g transform="translate(-36 -20) scale(0.95)">${idCard(116, 96)}</g>` + cross(136, 108, 16),
  },
  "no-renter": {
    title: "No renter details",
    desc: "A person with a red cross: don't send renter names or contact details.",
    width: 160,
    height: 130,
    body: () => `<g transform="translate(-42 -14) scale(0.9)">${headAndShoulders(116, 90)}</g>` + cross(136, 108, 16),
  },
  "no-contract": {
    title: "No rental contracts",
    desc: "A page with a signature line and a red cross: don't send rental contracts.",
    width: 160,
    height: 130,
    body: () => page(40, 14, 76, 98, 3) + path("M54 92 q8 -10 14 0 t14 0 t14 -2", { stroke: C.action, sw: 3 }) + cross(136, 108, 16),
  },
};

export function artSvg(id) {
  const a = ART[id];
  if (!a) throw new Error(`Unknown drawing ${id}`);
  return svgDocument({ id, title: a.title, desc: a.desc, body: a.body(), width: a.width, height: a.height });
}

/** PNG render for Office files (2x by default), deterministic for the same SVG and sharp version. */
export async function artPng(id, scale = 2) {
  const svg = Buffer.from(artSvg(id), "utf8");
  return sharp(svg, { density: 72 * scale }).png({ compressionLevel: 9, palette: true }).toBuffer();
}

/** The brand lockup (docs/brand/mulemark-lockup.svg) as PNG at a given pixel width; never re-typed. */
export async function lockupPng(svgText, width) {
  return sharp(Buffer.from(svgText, "utf8"), { density: 300 }).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
}
