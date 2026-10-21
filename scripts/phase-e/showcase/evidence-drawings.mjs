/**
 * Engineering Phase E2B — the original drawings that stand in for condition photos in the synthetic showcase history.
 *
 * Plain functions that return a 960 x 720 SVG each, in the E2A drawing kit's visual system (scripts/phase-e/packs/
 * pictogram-kit.mjs): ink outlines on flat fills, no words. Nothing is traced from photos or OEM figures; each drawing
 * shows only what the model's sourced pack facts say it has (2 in ball coupler, top-wind jack, 4-way plug and ramp gate on
 * the 35SA-12; adjustable coupler, drop-leg jack, breakaway, 7-way plug, battery box with a small solar charger, steel
 * sides and rear doors on the 14LP-14; the bucket of each excavator, in its maker's arm colour). The "Illustration" tag is
 * added by make-media.mjs when the drawing is rasterised, never here.
 */
import { C, circle, ellipse, line, path, poly, rect, tongueJack } from "../packs/pictogram-kit.mjs";

export const DRAWING_W = 960;
export const DRAWING_H = 720;

const n = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPt = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

const COL = {
  ink: C.ink,
  sky: "#E8EDF0",
  gravel: "#DCD3C2",
  gravelDot: "#B9AE99",
  dirt: "#C7B393",
  dirtDark: "#9C8564",
  black: "#2E2B27",
  blackLit: "#4A463F",
  steel: "#A9A397",
  steelLit: "#CFCAC0",
  wood: "#C9A777",
  woodLine: "#8C6A40",
  bobcatWhite: "#F3F1EC",
  catYellow: "#F2B705",
  catYellowDark: "#C99600",
  oil: "#3A2A12",
  lens: "#C62828",
  lensLit: "#E2574C",
  solar: "#2E3A4A",
  wire: "#6B4F33",
};

/** Deterministic speckle so the gravel looks the same on every render. */
function speckles(x0, y0, x1, y1, count, color, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = lerp(x0, x1, rnd());
    const y = lerp(y0, y1, rnd());
    const r = 1.5 + rnd() * 3.5 * ((y - y0) / Math.max(1, y1 - y0) + 0.4);
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}"/>`);
  }
  return out.join("");
}

function frame(body, { sky = COL.sky, ground = COL.gravel, horizon = 470, dots = COL.gravelDot } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${DRAWING_W}" height="${DRAWING_H}" viewBox="0 0 ${DRAWING_W} ${DRAWING_H}">` +
    `<rect width="${DRAWING_W}" height="${DRAWING_H}" fill="${sky}"/>` +
    (horizon < DRAWING_H ? `<rect y="${horizon}" width="${DRAWING_W}" height="${DRAWING_H - horizon}" fill="${ground}"/>` : "") +
    (horizon < DRAWING_H ? speckles(0, horizon + 6, DRAWING_W, DRAWING_H, 160, dots) : "") +
    body +
    "</svg>"
  );
}

/** Chain as a heavy dashed curve, scaled for close-ups. */
function heavyChain(x1, y1, cx, cy, x2, y2, sw = 11) {
  return path(`M${n(x1)} ${n(y1)} Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`, { stroke: COL.blackLit, sw, dash: `${n(sw * 1.4)} ${n(sw * 0.7)}` });
}

/** Ball coupler for close-ups, side view: (x, y) is where it meets the tongue; the nose points left. s scales it. */
function closeCoupler(x, y, s = 1, { channel = false } = {}) {
  const X = (dx) => x + dx * s;
  const Y = (dy) => y + dy * s;
  const parts = [];
  parts.push(path(`M${n(X(0))} ${n(Y(-20))} L${n(X(-64))} ${n(Y(-26))} C${n(X(-104))} ${n(Y(-28))} ${n(X(-118))} ${n(Y(-4))} ${n(X(-112))} ${n(Y(16))} C${n(X(-106))} ${n(Y(30))} ${n(X(-88))} ${n(Y(34))} ${n(X(-70))} ${n(Y(30))} L${n(X(0))} ${n(Y(22))} Z`, { fill: COL.steelLit, sw: 5 }));
  parts.push(path(`M${n(X(-104))} ${n(Y(24))} Q${n(X(-86))} ${n(Y(42))} ${n(X(-66))} ${n(Y(28))}`, { stroke: COL.ink, sw: 4 }));
  parts.push(path(`M${n(X(-96))} ${n(Y(-22))} Q${n(X(-60))} ${n(Y(-46))} ${n(X(-14))} ${n(Y(-30))}`, { stroke: COL.black, sw: 11 }));
  parts.push(circle(X(-30), Y(-6), 7 * s, { fill: COL.black, sw: 3 }));
  if (channel) parts.push(rect(X(-4), Y(-70), 40 * s, 150 * s, { fill: COL.black, sw: 4 }));
  return parts.join("");
}

/** Chain drawn as links along a quadratic curve (alternate links seen edge-on). */
function linkChain(x1, y1, cx, cy, x2, y2, { link = 22, color = COL.blackLit } = {}) {
  const pt = (t) => [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2];
  let length = 0;
  let prev = pt(0);
  const samples = [{ t: 0, at: 0 }];
  for (let i = 1; i <= 200; i++) {
    const p = pt(i / 200);
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    samples.push({ t: i / 200, at: length });
    prev = p;
  }
  const parts = [];
  const count = Math.max(2, Math.floor(length / (link * 0.8)));
  for (let i = 0; i <= count; i++) {
    const target = (i / count) * length;
    const sample = samples.find((s) => s.at >= target) ?? samples[samples.length - 1];
    const [px, py] = pt(sample.t);
    const [qx, qy] = pt(Math.min(1, sample.t + 0.01));
    const angle = (Math.atan2(qy - py, qx - px) * 180) / Math.PI;
    parts.push(i % 2 === 0
      ? `<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(link * 0.55)}" ry="${n(link * 0.3)}" fill="none" stroke="${color}" stroke-width="${n(link * 0.2)}" transform="rotate(${n(angle)} ${n(px)} ${n(py)})"/>`
      : `<line x1="${n(px - link * 0.5)}" y1="${n(py)}" x2="${n(px + link * 0.5)}" y2="${n(py)}" stroke="${color}" stroke-width="${n(link * 0.24)}" stroke-linecap="round" transform="rotate(${n(angle)} ${n(px)} ${n(py)})"/>`);
  }
  return parts.join("");
}

const shadow = (cx, cy, rx, ry) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000000" fill-opacity="0.13"/>`;

// ---------------------------------------------------------------------------------------------------------------------
// Trailer condition views
// ---------------------------------------------------------------------------------------------------------------------

/** Big Tex 35SA-12, front / hitch: A-frame tongue with the 2 in ball coupler, top-wind jack down, crossed chains, 4-way plug. */
export function hitch35sa() {
  const k = 3.3;
  const parts = [];
  parts.push(shadow(520, 612, 380, 34));
  // Front of the deck and its rail at the right edge.
  parts.push(rect(712, 236, 22, 172, { fill: COL.black, sw: 4 }));
  parts.push(rect(712, 236, 260, 16, { fill: COL.black, sw: 4 }));
  parts.push(rect(712, 372, 260, 12, { fill: COL.wood, stroke: COL.woodLine, sw: 3 }));
  parts.push(rect(700, 384, 272, 30, { fill: COL.black, sw: 4 }));
  for (const x of [800, 890]) parts.push(rect(x, 252, 12, 120, { fill: COL.black, sw: 3 }));
  // Far A-frame rail (perspective) then the near rail.
  parts.push(poly([[300, 376], [712, 350], [712, 366], [300, 392]], { fill: COL.blackLit, sw: 3.5 }));
  parts.push(poly([[290, 390], [712, 396], [712, 420], [290, 416]], { fill: COL.black, sw: 4 }));
  parts.push(line(296, 392, 708, 398, { stroke: "#6A655C", sw: 3 }));
  // 4-way wire along the tongue, plug resting low near the coupler.
  parts.push(path("M700 426 C600 432 470 430 380 436 C330 440 318 470 330 498", { stroke: COL.wire, sw: 7 }));
  parts.push(rect(304, 496, 58, 24, { fill: COL.steelLit, sw: 3.5, rx: 4 }));
  for (let i = 0; i < 4; i++) parts.push(rect(312 + i * 11, 520, 6, 10, { fill: COL.steel, stroke: "none" }));
  // Safety chains hanging from the tongue, hooks resting near the nose.
  parts.push(linkChain(330, 424, 300, 540, 214, 452));
  parts.push(linkChain(360, 426, 350, 556, 250, 462, { color: COL.black }));
  // Coupler at the nose and the jack on the tongue, foot on the ground.
  parts.push(closeCoupler(300, 402, 1.25));
  parts.push(tongueJack(452, 372, { scale: k, state: "down", groundY: 604 }));
  return frame(parts.join(""));
}

/** Big Tex 35SA-12, deck: seen from behind and above, wood deck, rails with tie-down loops, ramp gate lowered. */
export function deck35sa() {
  const nearL = [190, 556];
  const nearR = [770, 556];
  const farL = [322, 206];
  const farR = [638, 206];
  const railNear = 104;
  const railFar = 66;
  const top = (p, t) => [p[0] - lerp(12, 6, t), p[1] - lerp(railNear, railFar, t)];
  const parts = [];
  parts.push(shadow(520, 600, 430, 70));
  // Wheels and fenders outside the rails, about mid-depth.
  for (const [side, sign] of [[[nearL, farL], -1], [[nearR, farR], 1]]) {
    const a = lerpPt(side[0], side[1], 0.42);
    const b = lerpPt(side[0], side[1], 0.7);
    const mid = lerpPt(a, b, 0.5);
    parts.push(ellipse(mid[0] + sign * 46, mid[1] + 40, 30, 52, { fill: COL.black, sw: 4 }));
    parts.push(path(`M${n(a[0])} ${n(a[1] - 6)} Q${n(mid[0] + sign * 78)} ${n(mid[1] - 40)} ${n(b[0])} ${n(b[1] - 6)}`, { fill: COL.steelLit, sw: 4 }));
  }
  // Deck boards.
  parts.push(poly([nearL, nearR, farR, farL], { fill: COL.wood, stroke: COL.ink, sw: 5 }));
  for (let i = 1; i < 9; i++) {
    const a = lerpPt(nearL, nearR, i / 9);
    const b = lerpPt(farL, farR, i / 9);
    parts.push(line(a[0], a[1], b[0], b[1], { stroke: COL.woodLine, sw: 3 }));
  }
  // Side rails with uprights and tie-down loops.
  for (const [p, q] of [[nearL, farL], [nearR, farR]]) {
    parts.push(line(...top(p, 0), ...top(q, 1), { stroke: COL.black, sw: 11 }));
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const b = lerpPt(p, q, t);
      const u = top(lerpPt(p, q, t), t);
      parts.push(line(b[0], b[1], u[0], u[1], { stroke: COL.black, sw: lerp(9, 6, t) }));
    }
    for (const t of [0.15, 0.55, 0.9]) {
      const b = lerpPt(p, q, t);
      parts.push(circle(b[0] + (p === nearL ? 14 : -14), b[1] - 10, lerp(9, 6, t), { fill: "none", stroke: COL.steel, sw: 4 }));
    }
  }
  // Front rail across the far end.
  const fl = top(farL, 1);
  const fr = top(farR, 1);
  parts.push(line(fl[0], fl[1], fr[0], fr[1], { stroke: COL.black, sw: 9 }));
  for (const t of [0.33, 0.66]) {
    const b = lerpPt(farL, farR, t);
    const u = lerpPt(fl, fr, t);
    parts.push(line(b[0], b[1], u[0], u[1], { stroke: COL.black, sw: 6 }));
  }
  // Ramp gate lowered to the ground toward the viewer, expanded-metal infill.
  const gL = [150, 704];
  const gR = [810, 704];
  parts.push(poly([nearL, nearR, gR, gL], { fill: "#8E897F", stroke: COL.black, sw: 9 }));
  for (let i = 1; i < 14; i++) {
    const a = lerpPt(nearL, nearR, i / 14);
    const b = lerpPt(gL, gR, Math.min(1, i / 14 + 0.07));
    const c = lerpPt(gL, gR, Math.max(0, i / 14 - 0.07));
    parts.push(line(a[0], a[1], b[0], b[1], { stroke: "#B7B2A8", sw: 2 }));
    parts.push(line(a[0], a[1], c[0], c[1], { stroke: "#B7B2A8", sw: 2 }));
  }
  parts.push(line(nearL[0], nearL[1], nearR[0], nearR[1], { stroke: COL.black, sw: 10 }));
  return frame(parts.join(""), { horizon: 118 });
}

/** Big Tex 14LP-14, front / hitch: adjustable coupler, drop-leg jack, breakaway box, battery box with solar charger, 7-way. */
export function hitch14lp() {
  const k = 3.4;
  const parts = [];
  parts.push(shadow(520, 622, 400, 36));
  // Dump body front wall and frame at the right.
  parts.push(rect(650, 132, 330, 274, { fill: COL.black, sw: 5 }));
  parts.push(rect(650, 132, 330, 22, { fill: COL.blackLit, sw: 4 }));
  parts.push(line(650, 270, 980, 270, { stroke: "#5C5850", sw: 4 }));
  parts.push(rect(636, 404, 340, 30, { fill: COL.black, sw: 4 }));
  // A-frame (far rail, then near rail).
  parts.push(poly([[300, 372], [650, 344], [650, 362], [300, 390]], { fill: COL.blackLit, sw: 3.5 }));
  parts.push(poly([[286, 388], [650, 404], [650, 432], [286, 416]], { fill: COL.black, sw: 4 }));
  // Battery box on the tongue with the small solar charger on its lid.
  parts.push(rect(468, 300, 136, 92, { fill: "#8E8A80", sw: 4, rx: 4 }));
  parts.push(line(468, 318, 604, 318, { stroke: COL.ink, sw: 3 }));
  parts.push(rect(488, 288, 96, 14, { fill: COL.solar, sw: 3 }));
  for (let x = 504; x < 584; x += 16) parts.push(line(x, 289, x, 301, { stroke: "#6F86A3", sw: 1.5 }));
  // Adjustable coupler channel with holes, coupler bolted to it.
  parts.push(rect(262, 318, 44, 166, { fill: COL.black, sw: 4 }));
  for (let y = 336; y < 476; y += 26) parts.push(circle(284, y, 6, { fill: COL.sky, sw: 2.5 }));
  parts.push(closeCoupler(262, 400, 1.35));
  // Breakaway switch on the tongue and its coiled cable.
  parts.push(rect(330, 356, 36, 28, { fill: COL.black, sw: 3, rx: 3 }));
  parts.push(path("M348 384 l-10 12 l18 8 l-18 8 l18 8 l-18 8 l18 8 l-12 10", { stroke: COL.lens, sw: 4 }));
  // Safety chains and the 7-way plug hanging under the nose.
  parts.push(linkChain(316, 428, 290, 556, 196, 466, { link: 26 }));
  parts.push(linkChain(346, 430, 340, 572, 232, 476, { link: 26, color: COL.black }));
  parts.push(path("M640 440 C560 452 430 446 380 456 C340 466 340 500 352 520", { stroke: COL.black, sw: 9 }));
  parts.push(circle(352, 540, 24, { fill: COL.black, sw: 3.5 }));
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    parts.push(circle(352 + 12 * Math.cos(a), 540 + 12 * Math.sin(a), 2.8, { fill: COL.steel, stroke: "none" }));
  }
  // Drop-leg jack (side wind), foot on the ground.
  parts.push(tongueJack(420, 368, { scale: k, state: "down", groundY: 612, kind: "side-wind" }));
  return frame(parts.join(""));
}

/** Big Tex 14LP-14, body: steel floor and sides seen from behind and above, rear doors chained open. */
export function body14lp() {
  const nearL = [222, 560];
  const nearR = [738, 560];
  const farL = [334, 236];
  const farR = [626, 236];
  const wallNear = 124;
  const wallFar = 82;
  const up = (p, h, dx) => [p[0] + dx, p[1] - h];
  const tNL = up(nearL, wallNear, -20);
  const tNR = up(nearR, wallNear, 20);
  const tFL = up(farL, wallFar, -10);
  const tFR = up(farR, wallFar, 10);
  const parts = [];
  parts.push(shadow(480, 610, 420, 70));
  // Rear frame and lights under the near edge.
  parts.push(rect(206, 560, 548, 28, { fill: COL.black, sw: 4 }));
  parts.push(rect(214, 566, 30, 14, { fill: COL.lens, sw: 2.5, rx: 2 }));
  parts.push(rect(716, 566, 30, 14, { fill: COL.lens, sw: 2.5, rx: 2 }));
  // Inner walls, floor.
  parts.push(poly([farL, farR, tFR, tFL], { fill: "#9C988F", sw: 4 }));
  parts.push(poly([nearL, farL, tFL, tNL], { fill: "#ABA79E", sw: 4 }));
  parts.push(poly([nearR, farR, tFR, tNR], { fill: "#A39F96", sw: 4 }));
  parts.push(poly([nearL, nearR, farR, farL], { fill: "#8A867E", sw: 5 }));
  for (const [a, b] of [[[300, 470], [380, 452]], [[520, 380], [600, 372]], [[420, 300], [470, 296]]]) {
    parts.push(line(a[0], a[1], b[0], b[1], { stroke: "#A8A49B", sw: 3 }));
  }
  // Top rails and the front shroud.
  for (const [a, b] of [[tNL, tFL], [tNR, tFR], [tFL, tFR]]) parts.push(line(a[0], a[1], b[0], b[1], { stroke: COL.black, sw: 12 }));
  parts.push(poly([[tFL[0] + 20, tFL[1]], [tFR[0] - 20, tFR[1]], [tFR[0] - 46, tFR[1] - 34], [tFL[0] + 46, tFL[1] - 34]], { fill: COL.black, sw: 4 }));
  // Rear doors swung open and chained back to the sides.
  parts.push(poly([nearL, tNL, [80, 470], [96, 600]], { fill: COL.black, sw: 5 }));
  parts.push(poly([nearR, tNR, [880, 470], [864, 600]], { fill: COL.black, sw: 5 }));
  parts.push(line(150, 520, 120, 540, { stroke: "#5C5850", sw: 4 }));
  parts.push(line(810, 520, 840, 540, { stroke: "#5C5850", sw: 4 }));
  parts.push(heavyChain(110, 492, 150, 470, 214, 478, 8));
  parts.push(heavyChain(850, 492, 810, 470, 746, 478, 8));
  return frame(parts.join(""), { horizon: 112 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Excavator attachment views
// ---------------------------------------------------------------------------------------------------------------------

/** Bucket on the end of the arm, resting on dirt; arm colour per maker (white Bobcat, yellow Cat). */
function bucketScene({ arm, armEdge, bucket, rounder }) {
  const parts = [];
  parts.push(shadow(520, 560, 260, 26));
  // Arm (stick) coming down from the upper right, the bucket cylinder rod beside it.
  parts.push(poly([[700, -20], [800, -20], [612, 330], [532, 312]], { fill: arm, stroke: COL.ink, sw: 5 }));
  parts.push(line(690, -20, 548, 300, { stroke: armEdge, sw: 4 }));
  parts.push(line(860, -20, 650, 300, { stroke: COL.steelLit, sw: 16 }));
  parts.push(line(860, -20, 650, 300, { stroke: COL.ink, sw: 2 }));
  // Linkage plates and pins.
  parts.push(poly([[560, 282], [672, 298], [646, 350], [544, 334]], { fill: COL.black, sw: 4 }));
  for (const [x, y] of [[566, 318], [648, 322]]) parts.push(circle(x, y, 13, { fill: COL.steel, sw: 3.5 }));
  // Bucket shell, opening toward the machine (off the right edge), teeth at the lip.
  const back = rounder
    ? "M520 316 C410 320 360 420 404 508 C416 532 444 546 480 548 L640 552"
    : "M520 316 C430 326 384 410 410 500 C420 530 446 544 480 546 L640 550";
  parts.push(path(`${back} L612 516 C566 470 560 380 600 338 Z`, { fill: bucket, stroke: COL.ink, sw: 5 }));
  parts.push(path("M612 516 C566 470 560 380 600 338", { stroke: "#5A564E", sw: 4 }));
  for (const [dx, dy] of [[-14, -16], [0, 0]]) {
    parts.push(poly([[618 + dx, 526 + dy], [646 + dx, 520 + dy], [714 + dx, 546 + dy], [650 + dx, 562 + dy], [622 + dx, 556 + dy]], { fill: COL.steel, stroke: COL.ink, sw: 4 }));
  }
  parts.push(path("M470 546 C500 560 560 562 640 556", { stroke: COL.dirtDark, sw: 6 }));
  return frame(parts.join(""), { horizon: 430, ground: COL.dirt, dots: COL.dirtDark });
}

export const bucketE20 = () => bucketScene({ arm: COL.bobcatWhite, armEdge: "#C9C5BC", bucket: COL.black, rounder: false });
export const bucketCat3015 = () => bucketScene({ arm: COL.catYellow, armEdge: COL.catYellowDark, bucket: COL.black, rounder: true });

// ---------------------------------------------------------------------------------------------------------------------
// Incident close-ups
// ---------------------------------------------------------------------------------------------------------------------

/** 35SA-12 left tail lamp with a cracked lens on the rear frame. */
export function tailLampCrack35sa() {
  const parts = [];
  // Deck edge, rear cross member, gravel below.
  parts.push(rect(0, 150, 960, 70, { fill: COL.wood, stroke: COL.woodLine, sw: 4 }));
  for (let x = 90; x < 960; x += 120) parts.push(line(x, 150, x, 220, { stroke: COL.woodLine, sw: 3 }));
  parts.push(rect(-10, 220, 980, 330, { fill: COL.black, sw: 5 }));
  parts.push(line(0, 250, 960, 250, { stroke: COL.blackLit, sw: 4 }));
  // Lamp bracket, housing and lens with its ridges.
  parts.push(rect(300, 268, 360, 230, { fill: COL.blackLit, sw: 4, rx: 10 }));
  parts.push(rect(330, 296, 300, 174, { fill: "#1E1C1A", sw: 4, rx: 14 }));
  parts.push(rect(348, 312, 264, 142, { fill: COL.lens, sw: 3.5, rx: 10 }));
  for (let y = 330; y < 450; y += 16) parts.push(line(358, y, 602, y, { stroke: COL.lensLit, sw: 2.5 }));
  // The crack, a chipped corner and the wire entering the housing.
  const crack = "M362 322 L414 360 L446 348 L494 396 L552 404 L604 448 M446 348 L470 318 M494 396 L486 446";
  parts.push(path(crack, { stroke: "#FBE3DF", sw: 7 }));
  parts.push(path(crack, { stroke: "#5A1C18", sw: 2.5 }));
  parts.push(poly([[404, 352], [430, 356], [418, 376]], { fill: "#5A1C18", stroke: "#5A1C18", sw: 1.5 }));
  parts.push(path("M300 420 C250 420 220 470 160 470", { stroke: COL.wire, sw: 8 }));
  return frame(parts.join(""), { horizon: 548 });
}

/** Cat 301.5 bucket cutting edge, front view: three sharp teeth and one worn short and blunt. */
export function wornToothCat3015() {
  const parts = [];
  // Yellow arm at the top, black bucket face, steel cutting edge, dirt below.
  parts.push(rect(-10, -10, 980, 80, { fill: COL.catYellow, sw: 5 }));
  parts.push(rect(-10, 70, 980, 352, { fill: COL.black, sw: 5 }));
  for (const x of [180, 780]) parts.push(rect(x - 30, 70, 60, 360, { fill: COL.blackLit, sw: 3 }));
  parts.push(rect(90, 412, 780, 44, { fill: "#6E6A63", sw: 4 }));
  const teeth = [214, 384, 556, 728];
  teeth.forEach((cx, i) => {
    parts.push(rect(cx - 50, 400, 100, 66, { fill: "#57534B", sw: 4, rx: 6 }));
    if (i === 2) {
      parts.push(path(`M${cx - 40} 462 L${cx + 40} 462 L${cx + 34} 502 Q${cx} 530 ${cx - 34} 502 Z`, { fill: "#C4BFB4", sw: 4 }));
      parts.push(path(`M${cx - 22} 506 Q${cx} 520 ${cx + 22} 506`, { stroke: "#E4E0D8", sw: 4 }));
    } else {
      parts.push(poly([[cx - 40, 462], [cx + 40, 462], [cx + 26, 566], [cx, 612], [cx - 26, 566]], { fill: COL.steel, sw: 4 }));
      parts.push(line(cx, 470, cx, 600, { stroke: "#8F897D", sw: 3 }));
    }
  });
  for (const [x, y, r] of [[250, 540, 14], [410, 590, 10], [700, 560, 16], [760, 610, 9]]) parts.push(circle(x, y, r, { fill: COL.dirtDark, stroke: "none" }));
  return frame(parts.join(""), { horizon: 430, ground: COL.dirt, dots: COL.dirtDark });
}

/** Cat 301.5 boom cylinder hose fitting, weeping: oil film around the nut and a drip below it. */
export function weepingFittingCat3015() {
  const parts = [];
  // Boom side plate in Cat yellow with a weld seam and shading.
  parts.push(rect(-10, -10, 980, 740, { fill: COL.catYellow, stroke: "none" }));
  parts.push(rect(-10, 520, 980, 210, { fill: COL.catYellowDark, stroke: "none" }));
  parts.push(path("M0 120 L960 96", { stroke: COL.catYellowDark, sw: 6 }));
  // Steel line from the left into the fitting.
  parts.push(rect(-10, 288, 446, 40, { fill: COL.steelLit, sw: 4 }));
  parts.push(line(0, 298, 436, 298, { stroke: "#EEEBE5", sw: 4 }));
  // Oil film under everything at the joint, then the hex nut, ferrule and hose.
  parts.push(path("M402 262 C430 240 520 246 540 276 C560 310 540 360 520 392 C500 430 470 452 452 430 C430 400 410 380 396 350 C380 320 384 280 402 262 Z", { fill: COL.oil, stroke: "none" }).replace("<path", '<path fill-opacity="0.55"'));
  parts.push(poly([[426, 270], [470, 258], [512, 270], [512, 346], [470, 358], [426, 346]], { fill: "#C9C5BC", sw: 4 }));
  parts.push(line(470, 258, 470, 358, { stroke: "#9F9A90", sw: 3 }));
  parts.push(rect(512, 276, 108, 64, { fill: "#D6D3CC", sw: 4, rx: 6 }));
  for (const x of [536, 560, 584]) parts.push(line(x, 278, x, 338, { stroke: "#A9A49A", sw: 4 }));
  parts.push(path("M620 308 C720 308 800 360 990 520", { stroke: "#1E1C1A", sw: 62 }));
  parts.push(path("M620 290 C716 292 800 340 990 496", { stroke: "#4A463F", sw: 5 }));
  // Glossy highlight on the wet nut, the hanging drip and the streak below.
  parts.push(path("M436 300 C446 290 458 288 466 292", { stroke: "#FFFFFF", sw: 4 }).replace("<path", '<path stroke-opacity="0.7"'));
  parts.push(path("M462 432 C450 452 448 470 462 478 C476 470 474 452 462 432 Z", { fill: COL.oil, stroke: "none" }).replace("<path", '<path fill-opacity="0.8"'));
  parts.push(path("M462 492 C458 540 470 600 466 660", { stroke: COL.oil, sw: 9 }).replace("<path", '<path stroke-opacity="0.45"'));
  for (const [x, y, r] of [[430, 392, 3], [500, 360, 2.5], [488, 410, 3.5]]) parts.push(circle(x, y, r, { fill: "#1E1C1A", stroke: "none" }));
  return frame(parts.join(""), { horizon: 720 });
}

/** Every drawing by media key (make-media.mjs renders these once; the bytes are tracked). */
export const DRAWINGS = {
  "35sa-hitch-illustration": hitch35sa,
  "35sa-deck-illustration": deck35sa,
  "14lp-hitch-illustration": hitch14lp,
  "14lp-body-illustration": body14lp,
  "e20-bucket-illustration": bucketE20,
  "cat-301-5-bucket-illustration": bucketCat3015,
  "35sa-tail-lamp-illustration": tailLampCrack35sa,
  "cat-301-5-worn-tooth-illustration": wornToothCat3015,
  "cat-301-5-weeping-fitting-illustration": weepingFittingCat3015,
};
