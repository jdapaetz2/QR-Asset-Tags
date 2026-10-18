/**
 * Engineering Phase E2A — the original pictographic panels, one function per approved storyboard panel.
 *
 * Each function returns the SVG body for a 480 x 360 panel (pictogram-kit.mjs). Only panels whose storyboard is
 * sourced and approved are drawn; BLOCKED panels (control layouts that need a manual not in hand) have no entry here.
 * The panel ids match pack.json, and the pack tests check both directions.
 */
import {
  C,
  arrow,
  badge,
  box,
  chain,
  circle,
  clock,
  coupler,
  curvedArrow,
  dumpTrailer,
  electricWarning,
  ellipse,
  excavator,
  excavatorTop,
  eye,
  groundBand,
  group,
  label,
  line,
  magnifier,
  padlock,
  path,
  person,
  phone,
  plugPair,
  poly,
  prohibition,
  rect,
  spiritLevel,
  step,
  tick,
  tongueJack,
  trailerRear,
  truckRear,
  utilityTrailer,
  warning,
  wheel,
} from "./pictogram-kit.mjs";

const divider = (x) => line(x, 44, x, 330, { sw: 2.5, stroke: C.body2 });

/** Close-up of ball mount, coupler and tongue start, seated; the ball centre is at (x, y). */
function seatedCloseUp(x, y, { scale = 1, pin = true, tongueTo = 96 } = {}) {
  const k = scale;
  return [
    rect(x - 92 * k, y + 24 * k, 40 * k, 14 * k, { fill: C.dark, sw: 3 }),
    rect(x - 52 * k, y + 26 * k, 54 * k, 10 * k, { fill: C.steel, sw: 3 }),
    rect(x - 6 * k, y + 10 * k, 12 * k, 26 * k, { fill: C.steel, sw: 3 }),
    path(`M${x + 34 * k} ${y - 2 * k} L${x + tongueTo * k} ${y + 8 * k}`, { sw: 8 * k }),
    coupler(x, y, { scale: k, pin }),
  ].join("");
}

/** Frames 1-3 shared by both trailers' coupling panels: seated and pinned; 1-inch lift test; jack raised. */
function coupleSequence({ n, ballText, jackKind }) {
  const parts = [badge(n), divider(160), divider(320)];
  // 1: seated, latched, pinned (close-up).
  parts.push(step(84, 62, 1));
  parts.push(seatedCloseUp(48, 200, { scale: 1.15, tongueTo: 92 }));
  parts.push(arrow(112, 130, 82, 162, { sw: 5, head: 12 }));
  parts.push(label(80, 300, ballText, { size: 22 }));
  // 2: lift test: 1 inch, no more.
  parts.push(step(244, 62, 2));
  parts.push(seatedCloseUp(240, 196, { scale: 0.85, tongueTo: 92 }));
  parts.push(tongueJack(290, 199, { state: "down", groundY: 300, kind: jackKind }));
  parts.push(line(166, 300, 314, 300, { sw: 4 }));
  parts.push(arrow(200, 176, 200, 136, { sw: 5, head: 12 }));
  parts.push(label(222, 124, "1 in", { size: 24, anchor: "start" }));
  parts.push(label(222, 150, "max", { size: 20, weight: 600, anchor: "start" }));
  // 3: jack fully raised.
  parts.push(step(380, 62, 3));
  parts.push(seatedCloseUp(402, 196, { scale: 0.85, tongueTo: 92 }));
  parts.push(tongueJack(452, 199, { state: "up", groundY: 300, kind: jackKind }));
  parts.push(line(326, 300, 474, 300, { sw: 4 }));
  parts.push(arrow(452, 290, 452, 248, { sw: 5, head: 12 }));
  parts.push(tick(446, 110, 20));
  return parts.join("");
}

/** Top view of the hitch: tow vehicle on the left, A-frame tongue on the right, ball at (170, 130). */
function hitchTopView({ breakaway = false } = {}) {
  const parts = [];
  parts.push(rect(-10, 22, 122, 216, { fill: C.body2, sw: 4, rx: 10 }));
  parts.push(rect(104, 40, 16, 180, { fill: C.steel, sw: 3.5 }));
  parts.push(rect(120, 120, 44, 20, { fill: C.dark, sw: 3 }));
  parts.push(circle(126, 80, 7, { fill: C.paper, sw: 3.5 }));
  parts.push(circle(126, 180, 7, { fill: C.paper, sw: 3.5 }));
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

export const PANELS = {
  // --------------------------------------------------------------- Big Tex 35SA-12 (utility trailer, no brakes)
  "35sa-p1": () => [
    badge(1),
    groundBand(304),
    truckRear(170, 206),
    label(170, 262, "2 in", { size: 24, fill: C.action }),
    label(104, 116, "rated 2,995 lb+", { size: 20, weight: 600 }),
    path("M330 200 L478 220", { sw: 8 }),
    coupler(300, 182, { scale: 1.15 }),
    tongueJack(392, 200, { state: "down", groundY: 300 }),
    label(300, 136, "2 in", { size: 24, fill: C.action }),
    line(222, 184, 254, 184, { stroke: C.action, sw: 6 }),
    line(222, 198, 254, 198, { stroke: C.action, sw: 6 }),
    // Inspect: no cracks, wear or looseness.
    magnifier(304, 232, 18),
    tick(350, 236, 14),
  ].join(""),

  "35sa-p2": () => coupleSequence({ n: 2, ballText: "2 in ball", jackKind: "top-wind" }),

  "35sa-p3": () => [
    hitchTopView(),
    badge(3),
    // Side-view inset: the hook goes up through the loop; the slack clears the road.
    rect(288, 236, 184, 108, { fill: C.paper, sw: 3, rx: 8 }),
    line(298, 330, 462, 330, { sw: 3 }),
    rect(304, 252, 30, 12, { fill: C.steel, sw: 2.5 }),
    circle(330, 272, 6, { fill: C.paper, sw: 3 }),
    path("M330 282 Q384 318 450 276", { stroke: C.dark, sw: 6, dash: "8 4" }),
    arrow(330, 312, 330, 284, { sw: 5, head: 12 }),
    label(380, 262, "hook up", { size: 20 }),
    label(60, 300, "cross under", { size: 20, weight: 600 }),
  ].join(""),

  "35sa-p4": () => [
    badge(4),
    plugPair(250, 86, "4"),
    arrow(326, 118, 286, 118, { sw: 5, head: 12 }),
    trailerRear(86, 280, { width: 104, lights: "tail" }),
    trailerRear(240, 280, { width: 104, lights: "brake" }),
    trailerRear(394, 280, { width: 104, lights: "left" }),
    label(86, 200, "tail", { size: 22 }),
    label(240, 200, "brake", { size: 22 }),
    label(394, 200, "turn", { size: 22 }),
  ].join(""),

  "35sa-p5": () => [
    badge(5),
    // Top view of the trailer, tongue forward (up): the label is at the front left.
    path("M100 70 L76 112 M100 70 L124 112", { sw: 6 }),
    rect(56, 112, 88, 170, { fill: C.body, sw: 4 }),
    rect(46, 176, 10, 40, { fill: C.dark, sw: 2.5 }),
    rect(144, 176, 10, 40, { fill: C.dark, sw: 2.5 }),
    rect(60, 118, 26, 18, { fill: C.action, sw: 2.5 }),
    arrow(28, 92, 56, 118, { sw: 5, head: 12 }),
    label(100, 314, "VIN label", { size: 20 }),
    // Wheel close-up with lug nuts, wrench and gauge.
    wheel(318, 196, 92, { lugs: 5 }),
    path("M296 186 L230 104", { stroke: C.action, sw: 12 }),
    circle(226, 98, 13, { fill: C.action, stroke: C.ink, sw: 3 }),
    circle(414, 104, 24, { fill: C.paper, sw: 4 }),
    line(414, 104, 424, 90, { sw: 3.5, stroke: C.action }),
    line(402, 124, 392, 146, { sw: 5 }),
    label(424, 62, "cold", { size: 22, fill: C.action }),
    label(318, 330, "lug nuts tight", { size: 20, weight: 600 }),
  ].join(""),

  "35sa-p6": () => [
    badge(6),
    spiritLevel(404, 40, 92),
    groundBand(304),
    truckRear(110, 210, { scale: 0.8 }),
    utilityTrailer(110, 210, {
      scale: 1.05,
      load: [box(196, 186, 50, 42), box(250, 196, 46, 32), box(300, 172, 58, 56, { heavy: true })].join(""),
    }),
    line(330, 150, 330, 300, { sw: 3, dash: "8 6", stroke: C.action }),
    path("M184 132 L184 120 L320 120 L320 132", { stroke: C.action, sw: 4 }),
    path("M336 132 L336 120 L456 120 L456 132", { stroke: C.steel, sw: 4 }),
    label(252, 110, "60%", { size: 26, fill: C.action }),
    label(396, 110, "40%", { size: 24, fill: C.dark }),
  ].join(""),

  "35sa-p7": () => [
    badge(7),
    groundBand(304),
    utilityTrailer(40, 196, { scale: 1.25, load: box(258, 154, 104, 64) }),
    // Straps from the load to the tie-down loops, with a ratchet.
    path("M262 156 L214 218", { stroke: C.action, sw: 5 }),
    path("M358 156 L410 218", { stroke: C.action, sw: 5 }),
    rect(226, 186, 18, 12, { fill: C.action, sw: 2 }),
    circle(214, 220, 6, { fill: C.paper, sw: 3 }),
    circle(410, 220, 6, { fill: C.paper, sw: 3 }),
    // Gate latch and its pin.
    circle(458, 152, 9, { fill: C.action, stroke: C.ink, sw: 3 }),
    path("M458 152 q12 -18 18 2", { stroke: C.action, sw: 3 }),
    tick(436, 96, 18),
  ].join(""),

  "35sa-p8": () => [
    badge(8),
    // Road with distance and time.
    path("M60 132 L180 132", { sw: 26, stroke: C.dark, cap: "butt" }),
    line(66, 132, 174, 132, { sw: 3, stroke: C.paper, dash: "14 10" }),
    rect(84, 52, 68, 40, { fill: C.go, stroke: C.ink, sw: 3, rx: 5 }),
    label(118, 80, "50 mi", { size: 20, fill: C.paper, halo: false }),
    line(118, 92, 118, 118, { sw: 4 }),
    label(212, 110, "or", { size: 22, weight: 600 }),
    clock(262, 104, 28),
    label(262, 158, "1 h", { size: 22 }),
    // Speed: 60 mph maximum (a plain panel, not a road sign).
    rect(334, 56, 116, 94, { fill: C.paper, sw: 4, rx: 8 }),
    label(392, 92, "60 mph", { size: 26, halo: false }),
    label(392, 124, "max", { size: 22, weight: 600, halo: false }),
    // Four checks: coupler, chains, load, latch.
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
  ].join(""),

  // --------------------------------------------------------------- Big Tex 14LP-14 (dump trailer)
  "14lp-p1": () => coupleSequence({ n: 1, ballText: "2-5/16 in", jackKind: "side-wind" }),

  "14lp-p2": () => [
    hitchTopView({ breakaway: true }),
    badge(2),
    label(206, 210, "breakaway", { size: 20, fill: C.action }),
    // Inset: pull the pin to test, then put it straight back.
    rect(288, 236, 184, 108, { fill: C.paper, sw: 3, rx: 8 }),
    rect(304, 266, 44, 30, { fill: C.caution, sw: 3 }),
    circle(356, 281, 6, { fill: C.action, stroke: C.ink, sw: 2.5 }),
    arrow(362, 270, 410, 254, { sw: 4, head: 11 }),
    curvedArrow(412, 318, 386, 326, 362, 294, { sw: 4, head: 11 }),
    tick(446, 268, 14),
    label(436, 314, "test", { size: 20 }),
  ].join(""),

  "14lp-p3": () => [
    badge(3),
    plugPair(250, 72, "7"),
    arrow(326, 110, 286, 110, { sw: 5, head: 12 }),
    trailerRear(110, 290, { width: 120, lights: "brake", dump: true }),
    label(110, 180, "lights", { size: 22 }),
    // Slow brake test: rig rolling under 5 mph, trailer brakes applied.
    groundBand(304, 230, 472),
    rect(246, 232, 70, 44, { fill: C.body2, sw: 3.5, rx: 6 }),
    wheel(266, 286, 16),
    line(316, 262, 340, 262, { sw: 5 }),
    rect(340, 226, 116, 48, { fill: C.body, sw: 3.5 }),
    wheel(380, 288, 15),
    wheel(414, 288, 15),
    path("M366 288 A16 16 0 0 1 396 286", { stroke: C.action, sw: 6 }),
    path("M400 288 A16 16 0 0 1 430 286", { stroke: C.action, sw: 6 }),
    arrow(250, 204, 300, 204, { sw: 5, head: 12 }),
    label(380, 196, "< 5 mph", { size: 22 }),
  ].join(""),

  "14lp-p4": () => [
    badge(4),
    // Overhead wires (poles out of frame) with a prohibition: none over or near the trailer.
    line(60, 52, 60, 132, { sw: 7, stroke: C.dark }),
    line(420, 52, 420, 132, { sw: 7, stroke: C.dark }),
    line(40, 62, 80, 62, { sw: 5, stroke: C.dark }),
    line(400, 62, 440, 62, { sw: 5, stroke: C.dark }),
    path("M44 62 Q240 104 404 62", { sw: 3 }),
    path("M76 62 Q240 104 436 62", { sw: 3 }),
    prohibition(240, 86, 40),
    electricWarning(320, 96, 46),
    groundBand(304),
    rect(30, 170, 404, 132, { fill: "none", stroke: C.action, sw: 3, dash: "10 8", rx: 10 }),
    dumpTrailer(66, 234, { scale: 1 }),
    spiritLevel(110, 150, 86),
    person(458, 300, 96, { color: C.go }),
  ].join(""),

  "14lp-p5": () => [
    badge(5),
    // Top view of the body: rear doors swung open against the sides and chained.
    rect(60, 96, 220, 150, { fill: C.body, sw: 4 }),
    rect(40, 120, 20, 30, { fill: C.dark, sw: 2.5 }),
    rect(280, 98, 76, 10, { fill: C.body2, sw: 3 }),
    rect(280, 234, 76, 10, { fill: C.body2, sw: 3 }),
    curvedArrow(330, 160, 366, 140, 340, 118, { sw: 4, head: 11 }),
    curvedArrow(330, 182, 366, 202, 340, 224, { sw: 4, head: 11 }),
    chain(300, 104, 290, 90, 262, 94),
    chain(300, 238, 290, 252, 262, 248),
    label(170, 290, "doors open, chained", { size: 20, weight: 600 }),
    // Control box with its cover open; no switch layout is drawn.
    rect(388, 226, 70, 58, { fill: C.body2, sw: 3.5 }),
    path("M388 226 L404 176 L474 176 L458 226", { fill: C.paper, sw: 3.5 }),
    arrow(430, 140, 430, 172, { sw: 4, head: 11 }),
    label(422, 316, "control box", { size: 20, weight: 600 }),
  ].join(""),

  "14lp-p6": () => [
    badge(6),
    groundBand(304),
    dumpTrailer(104, 232, { scale: 0.92, tilt: 34, ghostTilt: 21 }),
    label(140, 120, "about ½", { size: 22, fill: C.action }),
    label(316, 62, "about ¾", { size: 22 }),
    // Operator well clear at the front, holding the control.
    person(52, 302, 104),
    rect(64, 228, 14, 22, { fill: C.action, sw: 2.5, rx: 3 }),
    // Walk back and look before raising further.
    eye(440, 196, 0.9),
    label(440, 160, "check", { size: 20 }),
  ].join(""),

  "14lp-p7": () => [
    badge(7),
    divider(240),
    // Never under a raised body.
    groundBand(304, 8, 232),
    dumpTrailer(14, 236, { scale: 0.6, tilt: 30 }),
    person(104, 300, 70, { pose: "crouch", facing: 1 }),
    prohibition(120, 220, 92),
    // Body down, free the load by hand from beside the trailer.
    groundBand(304, 248, 472),
    dumpTrailer(240, 236, { scale: 0.6 }),
    person(456, 300, 96, { pose: "reach", facing: -1 }),
    line(432, 214, 410, 246, { sw: 5 }),
    tick(440, 92, 18),
  ].join(""),

  "14lp-p8": () => [
    badge(8),
    groundBand(304),
    truckRear(100, 230, { scale: 0.8 }),
    dumpTrailer(100, 230, { scale: 1.05 }),
    tick(312, 150, 18),
    label(312, 122, "down", { size: 22 }),
    tick(452, 160, 18),
    label(436, 128, "latched", { size: 22 }),
    padlock(192, 150, 1),
    label(192, 108, "locked", { size: 22 }),
  ].join(""),

  // --------------------------------------------------------------- Bobcat E20 (sourced panels only)
  "e20-p1": () => [
    badge(1),
    phone(80, 160, "811"),
    arrow(130, 160, 176, 160, { sw: 5, head: 12 }),
    // Ground cross-section: buried line, marker flag, a drop-off at the edge.
    rect(190, 150, 282, 170, { fill: C.soil, sw: 0, stroke: "none" }),
    path("M190 150 L380 150 L400 210 L472 210", { sw: 4 }),
    line(196, 270, 466, 270, { sw: 5, dash: "14 8", stroke: C.dark }),
    line(270, 150, 270, 96, { sw: 4 }),
    poly([[270, 96], [304, 108], [270, 120]], { fill: C.action, stroke: C.ink, sw: 2.5 }),
    line(270, 160, 270, 262, { sw: 3, dash: "4 6", stroke: C.action }),
    warning(430, 160, 46),
  ].join(""),

  "e20-p2": () => [
    badge(2),
    groundBand(296),
    ellipse(236, 238, 214, 70, { fill: "none", stroke: C.action, sw: 4, dash: "4 10" }),
    excavator(212, 294, { scale: 0.88, arm: "travel" }),
    person(40, 296, 104, { pose: "walk", facing: 1 }),
    magnifier(176, 252, 22),
    magnifier(290, 160, 20),
    path("M232 262 q8 12 0 20 q-8 -8 0 -20 Z", { fill: C.action, stroke: C.action, sw: 2 }),
  ].join(""),

  "e20-p5": () => [
    badge(5),
    divider(240),
    // Across or up: 15 degrees or less.
    poly([[16, 300], [228, 300], [228, 243.2]], { fill: C.soil, stroke: C.ink, sw: 3.5 }),
    group("rotate(-15 120 272.1)", excavator(120, 272.1, { scale: 0.42, arm: "travel" })),
    arrow(80, 236, 150, 217, { sw: 5, head: 12 }),
    label(120, 132, "up or across", { size: 20, weight: 600 }),
    label(120, 104, "15° max", { size: 24, fill: C.action }),
    // Down or backing up: 25 degrees or less.
    poly([[252, 300], [464, 300], [464, 201.1]], { fill: C.soil, stroke: C.ink, sw: 3.5 }),
    group("rotate(-25 362 248.7)", excavator(362, 248.7, { scale: 0.42, arm: "travel", facing: -1 })),
    arrow(404, 200, 334, 232, { sw: 5, head: 12 }),
    label(358, 132, "down or backing up", { size: 20, weight: 600 }),
    label(358, 104, "25° max", { size: 24, fill: C.action }),
  ].join(""),

  "e20-p6": () => [
    badge(6),
    divider(240),
    // Keep people out of the swing area.
    circle(116, 196, 98, { fill: "rgba(198,40,40,0.08)", stroke: C.stop, sw: 3, dash: "10 7" }),
    excavatorTop(106, 196, { scale: 0.58, swing: -30 }),
    person(222, 320, 84, { color: C.go }),
    tick(222, 212, 15),
    // Never lift over a person.
    groundBand(304, 248, 472),
    excavator(300, 302, { scale: 0.62, arm: "raise" }),
    person(424, 302, 76),
    prohibition(414, 236, 60),
  ].join(""),
};

/** Panels with art. Anything else in a pack is BLOCKED and has none. */
export const DRAWN_PANEL_IDS = Object.keys(PANELS);
