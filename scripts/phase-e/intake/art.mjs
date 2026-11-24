/**
 * Engineering Phase E3 — original drawings for the intake guide and the workbook's START HERE tab.
 *
 * Drawn from the E2A drawing kit (scripts/phase-e/packs/pictogram-kit.mjs), so they share its look and its text rule:
 * numbers and symbols only, never words (the kit refuses anything else at draw time). The words that go with each
 * drawing live in the documents, next to it. Every drawing has a title and a description for screen readers.
 */
import sharp from "sharp";

import {
  C,
  arrow,
  book,
  camera,
  circle,
  coupler,
  cross,
  excavator,
  eye,
  label,
  keyGlyph,
  labelPlate,
  line,
  magnifier,
  padlock,
  path,
  poly,
  rect,
  svgDocument,
  tick,
  truckRear,
} from "../packs/pictogram-kit.mjs";

/** Viewfinder corner brackets around a photo subject. */
function viewfinder(x, y, w, h, color = C.ink) {
  const k = 22;
  return [
    path(`M${x} ${y + k} L${x} ${y} L${x + k} ${y}`, { stroke: color, sw: 5 }),
    path(`M${x + w - k} ${y} L${x + w} ${y} L${x + w} ${y + k}`, { stroke: color, sw: 5 }),
    path(`M${x} ${y + h - k} L${x} ${y + h} L${x + k} ${y + h}`, { stroke: color, sw: 5 }),
    path(`M${x + w - k} ${y + h} L${x + w} ${y + h} L${x + w} ${y + h - k}`, { stroke: color, sw: 5 }),
  ].join("");
}

/** A spreadsheet page with a dark header band and grid lines. */
function sheet(x, y, w, h) {
  const parts = [rect(x, y, w, h, { fill: C.paper, sw: 4, rx: 4 }), rect(x, y, w, h * 0.16, { fill: C.dark, sw: 4, rx: 4 })];
  for (let i = 1; i <= 4; i++) parts.push(line(x + 4, y + h * 0.16 + (i * h * 0.84) / 5, x + w - 4, y + h * 0.16 + (i * h * 0.84) / 5, { stroke: C.steel, sw: 2.5 }));
  parts.push(line(x + w * 0.38, y + h * 0.16, x + w * 0.38, y + h - 3, { stroke: C.steel, sw: 2.5 }));
  return parts.join("");
}

/** A folder with an optional glyph inside. */
function folder(cx, cy, w = 110, h = 80, inner = "") {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const tab = path(`M${x} ${y + 10} L${x} ${y - 4} Q${x} ${y - 10} ${x + 6} ${y - 10} L${x + w * 0.34} ${y - 10} L${x + w * 0.42} ${y} L${x + w} ${y} L${x + w} ${y + 10}`, { fill: C.body2, sw: 4 });
  return tab + rect(x, y + 6, w, h - 6, { fill: "#F3D98B", sw: 4, rx: 6 }) + inner;
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

/** A phone showing an equipment page: photo block, text lines and a button. */
function phonePage(cx, cy, s = 1) {
  const w = 76 * s;
  const h = 136 * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    rect(x, y, w, h, { fill: C.dark, sw: 4 * s, rx: 12 * s }),
    rect(x + 7 * s, y + 14 * s, w - 14 * s, h - 28 * s, { fill: C.paper, sw: 2.5 * s, rx: 4 * s }),
    rect(x + 13 * s, y + 21 * s, w - 26 * s, 30 * s, { fill: C.body2, stroke: "none", rx: 3 * s }),
    line(x + 14 * s, y + 63 * s, x + w - 14 * s, y + 63 * s, { stroke: C.steel, sw: 4 * s }),
    line(x + 14 * s, y + 75 * s, x + w - 24 * s, y + 75 * s, { stroke: C.steel, sw: 4 * s }),
    line(x + 14 * s, y + 87 * s, x + w - 18 * s, y + 87 * s, { stroke: C.steel, sw: 4 * s }),
    rect(x + 14 * s, y + 97 * s, w - 28 * s, 12 * s, { fill: C.action, stroke: "none", rx: 4 * s }),
  ].join("");
}

/** A document page with text lines. */
function page(x, y, w, h, lines = 4) {
  const parts = [rect(x, y, w, h, { fill: C.paper, sw: 4, rx: 4 })];
  for (let i = 0; i < lines; i++) parts.push(line(x + 12, y + 20 + i * 16, x + w - 12 - (i % 2) * 14, y + 20 + i * 16, { stroke: C.steel, sw: 4 }));
  return parts.join("");
}

/** Head and shoulders, for "no faces". */
function headAndShoulders(cx, cy) {
  return circle(cx, cy - 26, 24, { fill: C.body2, sw: 4 }) + path(`M${cx - 52} ${cy + 46} Q${cx - 48} ${cy + 4} ${cx} ${cy + 4} Q${cx + 48} ${cy + 4} ${cx + 52} ${cy + 46} Z`, { fill: C.body2, sw: 4 });
}

/** An ID-style card: photo box and lines, for "no paperwork or personal documents". */
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

/** A small building, for the company folder. */
function building(cx, cy, s = 1) {
  return poly([[cx - 26 * s, cy - 4 * s], [cx, cy - 24 * s], [cx + 26 * s, cy - 4 * s]], { fill: C.dark, sw: 3 * s }) +
    rect(cx - 21 * s, cy - 4 * s, 42 * s, 30 * s, { fill: C.paper, sw: 3 * s }) + rect(cx - 6 * s, cy + 8 * s, 12 * s, 18 * s, { fill: C.dark, sw: 2 * s });
}

export const ART = {
  "step-send": {
    title: "Send",
    desc: "A spreadsheet and a folder, with an arrow going up: you upload the workbook and your files.",
    width: 240,
    height: 200,
    body: () => sheet(22, 56, 92, 116) + folder(170, 140, 104, 70) + camera(170, 146, 0.8) + `<g>${line(170, 92, 170, 54, { stroke: C.action, sw: 7 })}${poly([[170, 30], [156, 54], [184, 54]], { fill: C.action, stroke: C.action, sw: 2 })}</g>`,
  },
  "step-prepare": {
    title: "We prepare",
    desc: "A manual, an arrow and a phone page: Mulemark turns your facts and the maker's manual into your equipment page.",
    width: 240,
    height: 200,
    body: () => book(52, 104, 1.5) + arrow(84, 104, 128, 104, { sw: 7, head: 16 }) + phonePage(178, 104, 1),
  },
  "step-preview": {
    title: "Preview",
    desc: "A phone showing an equipment page, and an eye: you check every page on your phone.",
    width: 240,
    height: 200,
    body: () => phonePage(98, 104, 1.15) + eye(184, 70, 1.4),
  },
  "step-approve": {
    title: "Approve",
    desc: "A page with a large green tick: you approve the exact version.",
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
  "tabs-map": {
    title: "Workbook tabs",
    desc: "A workbook window with tabs along the bottom: START HERE, then tabs 1 to 4 in the order to fill them.",
    width: 480,
    height: 280,
    body: () => {
      const parts = [sheet(24, 18, 432, 196)];
      const tabs = [
        { x: 30, w: 70, n: null },
        { x: 106, w: 82, n: 1 },
        { x: 194, w: 82, n: 2 },
        { x: 282, w: 82, n: 3 },
        { x: 370, w: 82, n: 4 },
      ];
      for (const t of tabs) {
        parts.push(path(`M${t.x} 214 L${t.x + 6} 246 L${t.x + t.w - 6} 246 L${t.x + t.w} 214`, { fill: t.n ? C.paper : C.body2, sw: 4 }));
        if (t.n) {
          parts.push(circle(t.x + t.w / 2, 262, 15, { fill: C.ink, stroke: "none" }));
          parts.push(label(t.x + t.w / 2, 270, String(t.n), { size: 20, fill: C.paper, halo: false, seq: true }));
        } else {
          parts.push(poly([[t.x + t.w / 2, 222], [t.x + t.w / 2 + 9, 238], [t.x + t.w / 2 - 9, 238]], { fill: C.action, stroke: C.action, sw: 2 }));
        }
      }
      return parts.join("");
    },
  },
  folders: {
    title: "Folders",
    desc: "Three folders: one with a camera for photos, one with a book for model documents, one with a building for company files such as your logo.",
    width: 480,
    height: 190,
    body: () => folder(88, 100, 132, 104, camera(88, 108, 1.2)) + folder(240, 100, 132, 104, book(240, 108, 1)) + folder(392, 100, 132, 104, building(392, 108, 1.1)),
  },
  "photo-whole": {
    title: "Whole machine",
    desc: "A camera frame around a whole excavator, with a green tick: photograph the whole machine.",
    width: 240,
    height: 190,
    body: () => viewfinder(14, 14, 212, 162) + excavator(92, 150, { scale: 0.68 }) + tick(204, 150, 18),
  },
  "photo-plate": {
    title: "Model plate",
    desc: "A magnifier over a model plate, with a green tick: a readable photo of the model plate when the manual depends on the serial.",
    width: 240,
    height: 190,
    body: () => viewfinder(14, 14, 212, 162) + labelPlate(104, 92, 2.4) + magnifier(116, 98, 40) + tick(204, 150, 18),
  },
  "photo-detail": {
    title: "Key detail",
    desc: "A camera frame around a trailer coupler sitting on a truck's hitch ball, with a green tick: a close-up of the part renters use, such as the hitch or controls.",
    width: 240,
    height: 190,
    body: () => viewfinder(14, 14, 212, 162) + truckRear(122, 98, { scale: 0.5 }) + line(150, 100, 224, 114, { sw: 8 }) + coupler(122, 98, { scale: 1.1 }) + tick(204, 150, 18),
  },
  "photo-face": {
    title: "No faces",
    desc: "A camera frame around a person's head and shoulders, with a red cross: leave people out of the photos.",
    width: 240,
    height: 190,
    body: () => viewfinder(14, 14, 212, 162) + headAndShoulders(116, 100) + cross(204, 150, 18),
  },
  "photo-paper": {
    title: "No documents",
    desc: "A camera frame around an ID-style card, with a red cross: no licenses, plates, paperwork or personal documents.",
    width: 240,
    height: 190,
    body: () => viewfinder(14, 14, 212, 162) + idCard(116, 96) + cross(204, 150, 18),
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
