/**
 * Engineering Phase E2A — the original pictographic panels, one function per approved storyboard panel.
 *
 * Picture-first (operator review, 2026-10-17): each panel is a short sequence of up to four frames: do (blue
 * arrows), check (green tick) and don't (red outline and cross over the mistake the manual names). Drawings carry no
 * words: only numbers, units and symbols (text-policy.mjs). Every frame maps to a frame in pack.json, whose
 * derived_from names the sourced step it shows. Trailers are drawn hitched wherever the manual has them hitched. Only
 * panels whose storyboard is sourced are drawn; BLOCKED panels have no entry.
 */
import {
  C,
  arrow,
  badge,
  box,
  brakeArcs,
  cell,
  chain,
  circle,
  clock,
  coupler,
  cross,
  curvedArrow,
  dumpTrailer,
  ellipse,
  excavator,
  excavatorRear,
  excavatorTop,
  eye,
  footOnPedal,
  gauge,
  groundBand,
  group,
  heatWaves,
  hookGlyph,
  label,
  labelPlate,
  lampOn,
  latchGlyph,
  line,
  magnifier,
  padlock,
  padlockOpen,
  path,
  person,
  phone,
  pinGlyph,
  plugPair,
  poly,
  prohibition,
  rect,
  remoteFob,
  softGround,
  spiritLevel,
  step,
  tick,
  tongueJack,
  trailerRear,
  truckRear,
  turnArrow,
  utilityTrailer,
  warning,
  weightGlyph,
  wheel,
  wrench,
} from "./pictogram-kit.mjs";

const divider = (x, y1 = 44, y2 = 330) => line(x, y1, x, y2, { sw: 2.5, stroke: C.body2 });

/** A frame cell drawn in local coordinates. "dont" gets a red outline and a red cross, "check" a green tick. */
function frame(x, y, w, h, kind, content) {
  const parts = [cell(x, y, w, h, kind === "dont" ? C.stop : C.body2), group(`translate(${x},${y})`, content)];
  if (kind === "dont") parts.push(cross(x + w - 17, y + 17, 13));
  if (kind === "check") parts.push(tick(x + w - 17, y + 17, 13));
  return parts.join("");
}

/**
 * Tow vehicle and trailer on one ground line, coupler on the ball at (nx, ny). The truck is drawn larger than the
 * trailer so both sets of tires stand on the ground, which lies `reach * s` below the ball.
 */
const REACH = { utility: 85, dump: 82 };
function rig(nx, ny, s, { dump = false, ...trailer } = {}) {
  const reach = dump ? REACH.dump : REACH.utility;
  const tow = truckRear(nx, ny, { scale: (reach / 64) * s });
  return tow + (dump ? dumpTrailer(nx, ny, { scale: s, ...trailer }) : utilityTrailer(nx, ny, { scale: s, ...trailer }));
}

/** Close-up of ball mount, coupler and tongue start, seated; the ball centre is at (x, y). */
function seatedCloseUp(x, y, { scale = 1, pin = true, tongueTo = 96, ghost = false } = {}) {
  const k = scale;
  if (ghost) {
    const o = { fill: "none", stroke: C.action, sw: 2.5, dash: "6 5" };
    return [rect(x - 92 * k, y + 24 * k, 40 * k, 14 * k, o), rect(x - 52 * k, y + 26 * k, 54 * k, 10 * k, o), rect(x - 6 * k, y + 10 * k, 12 * k, 26 * k, o), circle(x, y, 18 * k, o)].join("");
  }
  return [
    rect(x - 92 * k, y + 24 * k, 40 * k, 14 * k, { fill: C.dark, sw: 3 }),
    rect(x - 52 * k, y + 26 * k, 54 * k, 10 * k, { fill: C.steel, sw: 3 }),
    rect(x - 6 * k, y + 10 * k, 12 * k, 26 * k, { fill: C.steel, sw: 3 }),
    path(`M${x + 34 * k} ${y - 2 * k} L${x + tongueTo * k} ${y + 8 * k}`, { sw: 8 * k }),
    coupler(x, y, { scale: k, pin }),
  ].join("");
}

/** Hitch ball on its mount, side view, ball centre at (x, y). */
function ballOnMount(x, y, s = 1) {
  return rect(x - 46 * s, y + 18 * s, 40 * s, 10 * s, { fill: C.steel, sw: 3 * s }) + rect(x - 7 * s, y + 8 * s, 14 * s, 22 * s, { fill: C.steel, sw: 3 * s }) + circle(x, y, 13 * s, { fill: C.steel, sw: 3 * s });
}

/** Frames 1-3 shared by both trailers' coupling panels: seated and pinned; lift test of 1 inch at most; jack up. */
function coupleSequence({ n, ballText, weightText = null, jackKind }) {
  const parts = [divider(160), divider(320)];
  parts.push(step(84, 62, 1));
  if (weightText) parts.push(weightGlyph(22, 104, 0.8), label(38, 112, weightText, { size: 20, anchor: "start" }));
  parts.push(seatedCloseUp(48, 200, { scale: 1.15, tongueTo: 92 }));
  parts.push(arrow(112, 140, 82, 164, { sw: 5, head: 12 }));
  parts.push(label(104, 262, ballText, { size: 22, fill: C.action }));
  parts.push(step(244, 62, 2));
  parts.push(seatedCloseUp(240, 196, { scale: 0.85, tongueTo: 92 }));
  parts.push(seatedCloseUp(240, 184, { scale: 0.85, ghost: true }));
  parts.push(tongueJack(290, 199, { state: "down", groundY: 300, kind: jackKind }));
  parts.push(line(166, 300, 314, 300, { sw: 4 }));
  parts.push(arrow(196, 178, 196, 140, { sw: 5, head: 12 }));
  parts.push(label(206, 126, "≤ 1 in", { size: 24, anchor: "start" }));
  parts.push(step(380, 62, 3));
  parts.push(seatedCloseUp(402, 196, { scale: 0.85, tongueTo: 92 }));
  parts.push(tongueJack(452, 199, { state: "up", groundY: 300, kind: jackKind }));
  parts.push(line(326, 300, 474, 300, { sw: 4 }));
  parts.push(arrow(452, 290, 452, 248, { sw: 5, head: 12 }));
  parts.push(tick(446, 110, 20));
  parts.push(badge(n));
  return parts.join("");
}

/** Top view of the hitch: tow vehicle on the left, A-frame tongue on the right, ball at (176, 130). */
function hitchTopView({ breakaway = false } = {}) {
  const parts = [];
  parts.push(rect(-10, 22, 122, 216, { fill: C.body2, sw: 4, rx: 10 }));
  parts.push(rect(104, 40, 16, 180, { fill: C.steel, sw: 3.5 }));
  parts.push(rect(120, 120, 44, 20, { fill: C.dark, sw: 3 }));
  parts.push(circle(126, 80, 7, { fill: C.paper, sw: 3.5 }));
  parts.push(circle(126, 180, 7, { fill: C.paper, sw: 3.5 }));
  parts.push(circle(198, 130, 30, { fill: "rgba(31,99,168,0.16)", stroke: "none" }));
  parts.push(path("M176 130 L330 54 M176 130 L330 206", { sw: 9 }));
  parts.push(rect(330, 38, 160, 184, { fill: C.body, sw: 4 }));
  parts.push(ellipse(176, 130, 22, 18, { fill: C.steel, sw: 3.5 }));
  parts.push(chain(262, 88, 196, 150, 130, 182));
  parts.push(chain(262, 172, 196, 110, 130, 78));
  if (breakaway) {
    parts.push(rect(250, 120, 28, 20, { fill: C.caution, sw: 3 }));
    parts.push(path("M250 130 Q200 156 160 164 Q140 168 120 162", { stroke: C.action, sw: 4 }));
  }
  return parts.join("");
}

/** The four light checks: what you do (cause) above, which lamps light below. */
function lightChecks(y0, { dump = false } = {}) {
  const parts = [];
  const causes = [
    (cx) => lampOn(cx, y0 + 28, 0.9, C.caution),
    (cx) => footOnPedal(cx - 6, y0 + 40, 0.8),
    (cx) => turnArrow(cx, y0 + 28, -1, 0.9),
    (cx) => turnArrow(cx, y0 + 28, 1, 0.9),
  ];
  const states = ["tail", "brake", "left", "right"];
  for (let i = 0; i < 4; i++) {
    const x = 8 + i * 116;
    const cx = x + 56;
    parts.push(cell(x, y0, 112, 354 - y0));
    parts.push(causes[i](cx));
    parts.push(arrow(cx, y0 + 62, cx, y0 + 84, { sw: 4, head: 10 }));
    parts.push(trailerRear(cx, 300, { width: 80, lights: states[i], dump }));
  }
  return parts.join("");
}

/** A tire seen from the side with one defect mark. */
function tireWith(cx, cy, defect) {
  const parts = [circle(cx, cy, 24, { fill: C.dark, sw: 3 }), circle(cx, cy, 12, { fill: C.body2, sw: 2.5 })];
  if (defect === "bald") parts.push(path(`M${cx - 18} ${cy - 16} A24 24 0 0 1 ${cx + 18} ${cy - 16}`, { stroke: C.steel, sw: 7 }));
  if (defect === "bulge") parts.push(path(`M${cx + 20} ${cy - 10} q14 10 0 20`, { fill: C.dark, stroke: C.ink, sw: 3 }));
  if (defect === "cut") parts.push(line(cx - 6, cy - 26, cx + 8, cy - 14, { stroke: C.lamp, sw: 4 }));
  if (defect === "cords") parts.push(path(`M${cx - 14} ${cy + 10} l10 10 M${cx - 6} ${cy + 6} l10 10 M${cx - 18} ${cy + 18} l18 -10`, { stroke: C.amber, sw: 2.5 }));
  return parts.join("");
}

/** A raised dump body seen alone, pivoting at its rear hinge (hx, hy). */
function raisedBody(hx, hy, len, tilt) {
  return line(hx - len - 6, hy, hx + 6, hy, { sw: 5, stroke: C.dark }) + group(`rotate(${tilt} ${hx} ${hy})`, rect(hx - len, hy - 24, len, 24, { fill: C.body, sw: 3.5 })) + circle(hx, hy, 4, { fill: C.dark, stroke: "none" });
}

export const PANELS = {
  // --------------------------------------------------------------- Big Tex 35SA-12 (utility trailer, no brakes)
  "35sa-p1": () => [
    groundBand(250),
    truckRear(150, 186),
    label(150, 164, "2 in", { size: 24, fill: C.action }),
    weightGlyph(36, 92, 0.9),
    label(56, 100, "≥ 2,995 lb", { size: 22, anchor: "start" }),
    path("M338 168 L478 188", { sw: 8 }),
    coupler(304, 156, { scale: 1.15 }),
    tongueJack(398, 177, { state: "down", groundY: 250 }),
    label(304, 124, "2 in", { size: 24, fill: C.action }),
    line(214, 158, 246, 158, { stroke: C.action, sw: 6 }),
    line(214, 172, 246, 172, { stroke: C.action, sw: 6 }),
    tick(230, 128, 15),
    frame(8, 262, 152, 92, "dont", ballOnMount(70, 40, 1.5) + path("M64 22 l8 9 l-7 7 l9 11", { stroke: C.stop, sw: 4 })),
    frame(164, 262, 152, 92, "dont", ballOnMount(70, 40, 1.5) + line(53, 30, 87, 30, { stroke: C.paper, sw: 6, cap: "butt" }) + line(53, 33, 87, 33, { sw: 2.5 }) + [[62, 44], [74, 48], [80, 40], [66, 52]].map(([x, y]) => circle(x, y, 2.6, { fill: C.ink, stroke: "none" })).join("")),
    frame(320, 262, 152, 92, "dont", ballOnMount(70, 40, 1.5) + curvedArrow(44, 26, 36, 46, 48, 66, { sw: 3.5, head: 9 }) + curvedArrow(104, 26, 112, 46, 100, 66, { sw: 3.5, head: 9 })),
    badge(1),
  ].join(""),

  "35sa-p2": () => coupleSequence({ n: 2, ballText: "2 in", jackKind: "top-wind" }),

  "35sa-p3": () => [
    hitchTopView(),
    frame(8, 262, 152, 92, "do", rect(36, 22, 70, 10, { fill: C.steel, sw: 2.5 }) + circle(70, 42, 7, { fill: C.paper, sw: 3 }) + hookGlyph(62, 66, 0.9) + arrow(40, 84, 40, 50, { sw: 4, head: 9 })),
    frame(164, 262, 152, 92, "check", rect(16, 24, 14, 10, { fill: C.steel, sw: 2.5 }) + rect(122, 24, 14, 10, { fill: C.steel, sw: 2.5 }) + path("M30 30 Q76 66 122 30", { stroke: C.dark, sw: 5, dash: "7 4" }) + line(12, 80, 140, 80, { sw: 3 }) + line(76, 52, 76, 78, { stroke: C.go, sw: 3, dash: "3 3" })),
    frame(320, 262, 152, 92, "dont", ballOnMount(92, 38, 1.1) + path("M54 56 Q36 70 16 62", { stroke: C.dark, sw: 5, dash: "7 4" }) + hookGlyph(56, 50, 0.6)),
    badge(3),
  ].join(""),

  "35sa-p4": () => [
    plugPair(196, 74, "4", { joined: true }),
    tick(326, 74, 16),
    person(440, 128, 84),
    eye(400, 52, 0.7),
    lightChecks(140),
    badge(4),
  ].join(""),

  "35sa-p5": () => [
    frame(8, 34, 228, 150, "check", labelPlate(52, 76, 1.5) + path("M88 76 L132 76", { stroke: C.action, sw: 4, dash: "6 5" }) + arrow(132, 76, 146, 76, { sw: 4, head: 10 }) + gauge(180, 70, 26)),
    frame(244, 34, 228, 150, "", wheel(64, 92, 36) + heatWaves(64, 34, 1.1) + cross(100, 60, 13) + wheel(166, 92, 36) + tick(200, 60, 13)),
    frame(8, 196, 228, 158, "check", wheel(112, 80, 60, { lugs: 5 }) + wrench(196, 34, 124, 72)),
    frame(244, 196, 228, 158, "", tireWith(56, 44, "bald") + cross(80, 22, 9) + tireWith(170, 44, "bulge") + cross(194, 22, 9) + tireWith(56, 116, "cut") + cross(80, 94, 9) + tireWith(170, 116, "cords") + cross(194, 94, 9)),
    badge(5),
  ].join(""),

  "35sa-p6": () => [
    groundBand(220),
    rig(170, 150, 0.82, { load: [box(234, 128.8, 44, 36), box(281, 136.8, 40, 28), box(320, 120.8, 46, 44, { heavy: true }), box(380, 144.8, 30, 20)].join("") }),
    line(342, 104, 342, 216, { sw: 3, dash: "8 6", stroke: C.action }),
    path("M229 116 L229 104 L333 104 L333 116", { stroke: C.action, sw: 4 }),
    label(281, 94, "≈ 60%", { size: 24, fill: C.action }),
    weightGlyph(52, 56, 0.9),
    label(72, 64, "≤ 2,995 lb", { size: 22, anchor: "start" }),
    spiritLevel(420, 50, 90),
    frame(8, 262, 228, 92, "do", seatedCloseUp(56, 46, { scale: 0.62 }) + tick(118, 22, 11) + arrow(130, 46, 160, 46, { sw: 4, head: 10 }) + box(168, 26, 40, 34)),
    frame(244, 262, 228, 92, "dont", poly([[24, 84], [204, 84], [204, 52]], { fill: C.soil, stroke: C.ink, sw: 3 }) + group("rotate(-10 114 66)", trailerRear(114, 66, { width: 70 }) + box(90, 10, 34, 26))),
    badge(6),
  ].join(""),

  "35sa-p7": () => [
    groundBand(222),
    rig(180, 150, 0.85, { load: box(300, 119.3, 96, 46) }),
    path("M304 121 L254 163", { stroke: C.action, sw: 5 }),
    path("M392 121 L446 163", { stroke: C.action, sw: 5 }),
    circle(254, 163, 6, { fill: C.paper, sw: 3 }),
    circle(446, 163, 6, { fill: C.paper, sw: 3 }),
    circle(463, 124, 8, { fill: C.action, stroke: C.ink, sw: 3 }),
    frame(8, 262, 152, 92, "check", rect(22, 14, 108, 64, { fill: C.body, sw: 3 }) + box(56, 30, 40, 32) + [[30, 22], [122, 22], [30, 70], [122, 70]].map(([x, y]) => circle(x, y, 6, { fill: C.paper, stroke: C.action, sw: 3 })).join("") + path("M30 22 L122 70 M122 22 L30 70", { stroke: C.action, sw: 3 })),
    frame(164, 262, 152, 92, "do", rect(56, 10, 14, 76, { fill: C.body2, sw: 3 }) + latchGlyph(86, 34, 0.9) + pinGlyph(108, 44, 0.8)),
    frame(320, 262, 152, 92, "dont", trailerRear(66, 62, { width: 70 }) + rect(34, 64, 64, 10, { fill: C.body2, sw: 2.5 }) + group("rotate(20 110 70)", box(96, 50, 28, 24))),
    badge(7),
  ].join(""),

  "35sa-p8": () => [
    rect(40, 40, 72, 40, { fill: C.go, stroke: C.ink, sw: 3, rx: 5 }),
    label(76, 68, "50 mi", { size: 20, fill: C.paper, halo: false }),
    line(76, 80, 76, 100, { sw: 4 }),
    clock(76, 150, 26),
    label(124, 158, "1 h", { size: 22, anchor: "start" }),
    arrow(120, 62, 196, 100, { sw: 5, head: 12 }),
    arrow(170, 146, 198, 128, { sw: 5, head: 12 }),
    cell(204, 34, 268, 150),
    line(210, 149, 466, 149, { sw: 3 }),
    rig(330, 115, 0.4),
    person(446, 149, 58, { pose: "walk", facing: -1 }),
    seatedCloseUp(74, 252, { scale: 0.62 }),
    tick(84, 314, 15),
    chain(150, 236, 176, 280, 214, 240),
    tick(182, 314, 15),
    box(262, 226, 58, 48),
    path("M262 238 L320 262", { stroke: C.action, sw: 4 }),
    tick(292, 314, 15),
    rect(390, 216, 14, 70, { fill: C.body2, sw: 3 }),
    circle(398, 232, 8, { fill: C.action, stroke: C.ink, sw: 2.5 }),
    tick(398, 314, 15),
    badge(8),
  ].join(""),

  // --------------------------------------------------------------- Big Tex 14LP-14 (dump trailer)
  "14lp-p1": () => coupleSequence({ n: 1, ballText: "2-5/16 in", weightText: "≥ 14,000 lb", jackKind: "side-wind" }),

  "14lp-p2": () => [
    hitchTopView({ breakaway: true }),
    line(150, 228, 300, 228, { stroke: C.dark, sw: 6, dash: "9 5" }),
    line(150, 244, 252, 244, { stroke: C.action, sw: 5 }),
    path("M262 238 L276 244 L262 250", { stroke: C.action, sw: 3 }),
    frame(8, 262, 312, 92, "check",
      rect(14, 34, 34, 22, { fill: C.caution, sw: 3 }) + circle(58, 45, 5, { fill: C.action, stroke: C.ink, sw: 2 }) + arrow(64, 40, 92, 30, { sw: 4, head: 9 }) +
      wheel(140, 50, 22) + brakeArcs(140, 50, 22) + arrow(170, 50, 196, 50, { sw: 4, head: 9 }) +
      rect(214, 34, 34, 22, { fill: C.caution, sw: 3 }) + circle(256, 45, 5, { fill: C.action, stroke: C.ink, sw: 2 }) + arrow(290, 30, 264, 42, { sw: 4, head: 9 })),
    frame(324, 262, 148, 92, "dont", chain(14, 52, 74, 76, 134, 52) + path("M74 66 L84 30", { stroke: C.action, sw: 4 }) + rect(78, 18, 20, 14, { fill: C.caution, sw: 2.5 })),
    badge(2),
  ].join(""),

  "14lp-p3": () => [
    plugPair(160, 64, "7", { joined: true }),
    tick(262, 64, 16),
    cell(276, 26, 196, 110),
    line(282, 107, 466, 107, { sw: 3 }),
    rig(376, 84, 0.28, { dump: true }),
    brakeArcs(437.6, 100.2, 10),
    brakeArcs(453.3, 100.2, 10),
    arrow(330, 46, 290, 46, { sw: 4, head: 10 }),
    label(412, 56, "< 5 mph", { size: 22 }),
    lightChecks(144, { dump: true }),
    badge(3),
  ].join(""),

  "14lp-p4": () => [
    groundBand(235),
    rect(240, 84, 184, 150, { fill: "none", stroke: C.action, sw: 3, dash: "10 8", rx: 10 }),
    rig(130, 176, 0.72, { dump: true }),
    person(398, 235, 64),
    cross(398, 152, 12),
    person(452, 235, 78, { color: C.go }),
    tick(452, 140, 13),
    frame(8, 262, 152, 92, "check", rect(30, 18, 92, 56, { fill: C.body, sw: 3 }) + group("translate(76,28) scale(0.6)", spiritLevel(0, 0, 90)) + group("translate(44,46) rotate(90) scale(0.42)", spiritLevel(0, 0, 90))),
    frame(164, 262, 152, 92, "dont", softGround(14, 62, 124) + wheel(76, 54, 22) + rect(40, 18, 72, 16, { fill: C.dark, sw: 2.5 })),
    frame(320, 262, 152, 92, "dont", line(14, 8, 14, 58, { sw: 5, stroke: C.dark }) + line(110, 8, 110, 58, { sw: 5, stroke: C.dark }) + path("M4 16 Q62 32 120 16", { sw: 2.5 }) + path("M4 24 Q62 40 120 24", { sw: 2.5 }) + dumpTrailer(12, 64, { scale: 0.3, tilt: 35 })),
    badge(4),
  ].join(""),

  "14lp-p5": () => [
    rect(40, 70, 190, 130, { fill: C.body, sw: 4 }),
    rect(22, 92, 18, 28, { fill: C.dark, sw: 2.5 }),
    rect(230, 72, 66, 9, { fill: C.body2, sw: 3 }),
    rect(230, 189, 66, 9, { fill: C.body2, sw: 3 }),
    curvedArrow(276, 128, 304, 112, 286, 92, { sw: 4, head: 10 }),
    curvedArrow(276, 144, 304, 160, 286, 180, { sw: 4, head: 10 }),
    chain(248, 78, 240, 64, 214, 68),
    chain(248, 192, 240, 206, 214, 202),
    frame(40, 222, 190, 120, "check", rect(30, 40, 52, 10, { fill: C.body2, sw: 2.5 }) + chain(82, 46, 110, 60, 140, 50) + hookGlyph(140, 56, 0.8) + rect(150, 34, 12, 40, { fill: C.body, sw: 2.5 })),
    divider(316, 40, 340),
    rect(352, 40, 84, 60, { fill: C.body2, sw: 3.5 }),
    padlock(394, 72, 0.9),
    arrow(394, 106, 394, 126, { sw: 4, head: 9 }),
    rect(352, 132, 84, 60, { fill: C.body2, sw: 3.5 }),
    padlockOpen(394, 166, 0.9),
    arrow(394, 198, 394, 218, { sw: 4, head: 9 }),
    rect(352, 254, 84, 60, { fill: C.body2, sw: 3.5 }),
    path("M352 254 L368 222 L452 222 L436 254", { fill: C.paper, sw: 3.5 }),
    tick(452, 300, 14),
    badge(5),
  ].join(""),

  "14lp-p6": () => [
    groundBand(248),
    rig(160, 182, 0.8, { dump: true, tilt: 34, ghostTilt: 21 }),
    label(208, 92, "≈ ½", { size: 24, fill: C.action }),
    label(272, 34, "≈ ¾", { size: 24 }),
    eye(458, 222, 0.85),
    frame(8, 262, 228, 92, "check",
      line(4, 66, 222, 66, { sw: 3 }) + rect(162, 8, 52, 58, { fill: "rgba(198,40,40,0.10)", stroke: C.stop, sw: 2.5, dash: "5 4" }) +
      rig(78, 46, 0.24, { dump: true, tilt: 28 }) + person(100, 66, 50) + remoteFob(112, 36, 0.42)),
    frame(244, 262, 228, 92, "dont", line(6, 63, 222, 63, { sw: 3 }) + rig(70, 46, 0.2, { dump: true, tilt: 30 }) + person(178, 63, 50, { pose: "walk", facing: 1 }) + arrow(150, 80, 210, 80, { sw: 4, head: 9 })),
    badge(6),
  ].join(""),

  "14lp-p7": () => [
    frame(8, 34, 228, 152, "dont", groundBand(97, 6, 222) + rig(96, 66, 0.38, { dump: true, tilt: 30 }) + person(176, 97, 46, { pose: "crouch", facing: -1 })),
    frame(244, 34, 228, 152, "dont", remoteFob(60, 76, 1.3, { arrowUp: false }) + path("M96 40 l14 14 l-14 14 l14 14 l-14 14", { stroke: C.action, sw: 5 }) + raisedBody(206, 112, 76, 28)),
    frame(8, 196, 228, 158, "dont", groundBand(126, 6, 222) + rig(96, 95, 0.38, { dump: true, tilt: 28 }) + arrow(78, 20, 30, 20, { sw: 5, head: 12 }) + brakeArcs(179.6, 117, 9.1) + brakeArcs(200.9, 117, 9.1) + line(196, 129, 222, 129, { sw: 5, stroke: C.dark }) + line(120, 129, 150, 129, { sw: 5, stroke: C.dark })),
    frame(244, 196, 228, 158, "check", groundBand(126, 6, 222) + trailerRear(96, 124, { width: 110, dump: true }) + arrow(96, 8, 96, 22, { sw: 4, head: 9 }) + person(190, 126, 74, { pose: "reach", facing: -1 })),
    badge(7),
  ].join(""),

  "14lp-p8": () => [
    groundBand(258),
    rig(140, 180, 0.95, { dump: true }),
    arrow(330, 96, 330, 136, { sw: 5, head: 12 }),
    tick(362, 100, 16),
    latchGlyph(440, 170, 0.75),
    tick(452, 120, 16),
    padlock(228, 108, 1),
    tick(262, 80, 16),
    arrow(120, 70, 40, 70, { sw: 7, head: 16 }),
    badge(8),
  ].join(""),

  // --------------------------------------------------------------- Bobcat E20 (sourced panels only)
  "e20-p1": () => [
    phone(70, 130, "811"),
    arrow(116, 130, 162, 130, { sw: 5, head: 12 }),
    rect(170, 110, 302, 140, { fill: C.soil, sw: 0, stroke: "none" }),
    line(170, 110, 472, 110, { sw: 4 }),
    line(176, 220, 466, 220, { sw: 5, dash: "14 8", stroke: C.dark }),
    line(310, 110, 310, 56, { sw: 4 }),
    poly([[310, 56], [344, 68], [310, 80]], { fill: C.action, stroke: C.ink, sw: 2.5 }),
    line(310, 120, 310, 212, { sw: 3, dash: "4 6", stroke: C.action }),
    frame(8, 262, 152, 92, "", line(10, 30, 50, 30, { sw: 4 }) + path("M50 30 L60 70 L94 70 L104 30", { fill: C.soil, sw: 4 }) + line(104, 30, 142, 30, { sw: 4 }) + warning(126, 62, 30)),
    frame(164, 262, 152, 92, "", path("M10 30 L80 30 L92 70 L142 70", { sw: 4 }) + warning(40, 60, 30)),
    frame(320, 262, 152, 92, "", line(10, 30, 142, 30, { sw: 4 }) + softGround(14, 44, 124) + warning(126, 74, 26)),
    badge(1),
  ].join(""),

  "e20-p2": () => [
    groundBand(246),
    ellipse(236, 196, 214, 62, { fill: "none", stroke: C.action, sw: 4, dash: "4 10" }),
    excavator(212, 244, { scale: 0.82, arm: "travel" }),
    person(40, 246, 100, { pose: "walk", facing: 1 }),
    frame(8, 262, 228, 92, "check", line(20, 70, 208, 70, { sw: 3 }) + path("M114 40 q10 14 0 24 q-10 -10 0 -24 Z", { fill: C.action, stroke: C.action, sw: 2 }) + ellipse(114, 72, 26, 6, { fill: "rgba(31,99,168,0.25)", stroke: "none" }) + magnifier(114, 52, 26)),
    frame(244, 262, 228, 92, "check", path("M24 56 Q90 18 200 52", { stroke: C.dark, sw: 9 }) + path("M108 34 l6 8 l-6 6 l6 8", { stroke: C.lamp, sw: 3 }) + magnifier(110, 44, 26)),
    badge(2),
  ].join(""),

  "e20-p5": () => [
    frame(8, 34, 228, 152, "check", poly([[8, 140], [220, 140], [220, 83.2]], { fill: C.soil, stroke: C.ink, sw: 3 }) + group("rotate(-15 112 112)", excavator(112, 112, { scale: 0.34, arm: "travel" })) + arrow(58, 74, 128, 55, { sw: 4, head: 10 }) + label(60, 36, "≤ 15°", { size: 22, fill: C.action })),
    frame(244, 34, 228, 152, "check", poly([[12, 140], [216, 140], [12, 85.3]], { fill: C.soil, stroke: C.ink, sw: 3 }) + group("rotate(15 114 113)", excavatorRear(114, 113, 0.42)) + label(170, 36, "≤ 15°", { size: 22, fill: C.action })),
    frame(8, 196, 228, 158, "check", poly([[8, 146], [220, 146], [220, 47.1]], { fill: C.soil, stroke: C.ink, sw: 3 }) + group("rotate(-25 96 107)", excavator(96, 107, { scale: 0.28, arm: "travel", facing: -1 })) + arrow(128, 70, 72, 96, { sw: 4, head: 10 }) + group("rotate(-25 176 70)", excavator(176, 70, { scale: 0.2, arm: "travel", facing: -1 })) + arrow(160, 62, 200, 43, { sw: 3, head: 8 }) + label(58, 36, "≤ 25°", { size: 22, fill: C.action })),
    frame(244, 196, 228, 158, "dont", poly([[8, 146], [220, 146], [220, 90]], { fill: C.soil, stroke: C.ink, sw: 3 }) + group("rotate(-15 110 118)", excavator(110, 118, { scale: 0.32 })) + curvedArrow(60, 40, 110, 10, 164, 40, { sw: 4, head: 10 })),
    badge(5),
  ].join(""),

  "e20-p6": () => [
    divider(240),
    circle(116, 196, 98, { fill: "rgba(198,40,40,0.08)", stroke: C.stop, sw: 3, dash: "10 7" }),
    excavatorTop(106, 196, { scale: 0.58, swing: -30 }),
    curvedArrow(60, 120, 30, 170, 52, 236, { sw: 4, head: 10 }),
    arrow(150, 286, 210, 286, { sw: 4, head: 10 }),
    eye(160, 108, 0.6),
    person(222, 320, 84, { color: C.go }),
    tick(222, 212, 15),
    groundBand(304, 248, 472),
    excavator(300, 302, { scale: 0.62, arm: "raise" }),
    person(424, 302, 76),
    prohibition(414, 236, 60),
    badge(6),
  ].join(""),
};

/** Panels with art. Anything else in a pack is BLOCKED and has none. */
export const DRAWN_PANEL_IDS = Object.keys(PANELS);
