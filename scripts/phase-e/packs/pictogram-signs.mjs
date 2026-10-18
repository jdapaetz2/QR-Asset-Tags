/**
 * Engineering Phase E2A — original safety sign tiles and accessory icons for the picture-first guides.
 *
 * One tile per sourced warning (or Northridge policy), drawn in ISO 3864 style without copying ISO 7010 symbols:
 * red prohibition, yellow warning, blue mandatory, a white limit plate, a green-bordered checklist and a pale info
 * plate for customer policies. Tiles are 240 x 240 and carry no words; their short label (at most 3 words) sits under
 * the tile in the guide and gallery. Each id matches a sign in pack.json, whose derived_from names what it shows.
 */
import {
  C,
  SIGN,
  arrow,
  book,
  bottleJack,
  breakawayBox,
  bolt,
  bucketGlyph,
  burst,
  camera,
  chain,
  cigarette,
  circle,
  coupler,
  cross,
  curvedArrow,
  drop,
  dumpTrailer,
  excavator,
  flame,
  fuelNozzle,
  group,
  handover,
  hookGlyph,
  keyGlyph,
  label,
  lessOrEqual,
  line,
  path,
  payloadDecal,
  person,
  phone,
  pinGlyph,
  prohibition,
  rect,
  remoteFob,
  seatedPerson,
  shovel,
  signTile,
  skull,
  soundWaves,
  speedometer,
  steeringWheel,
  stopHand,
  strapGlyph,
  svgDocument,
  tick,
  tongueJack,
  truckRear,
  utilityTrailer,
  warningLamp,
  weightGlyph,
  wheel,
} from "./pictogram-kit.mjs";

const white = { fill: C.paper, stroke: C.paper };

/** Ticked row of pre-move checks above the rig drawn moving off (the rig faces left: truck left, trailer right). */
function beforeMoving(glyphs, rig) {
  const step = 180 / glyphs.length;
  const parts = glyphs.map((draw, i) => {
    const cx = 30 + step * (i + 0.5);
    return draw(cx, 72) + tick(cx, 124, 13);
  });
  parts.push(line(24, 206, 216, 206, { sw: 3, stroke: C.steel }));
  parts.push(rig);
  parts.push(arrow(66, 150, 30, 150, { sw: 5, head: 11 }));
  return parts.join("");
}

const couplerPinned = (s) => (cx, cy) => coupler(cx - 9 * s, cy + 4 * s, { scale: s, pin: true });
const chainsCrossed = (s) => (cx, cy) => chain(cx - 20 * s, cy - 22 * s, cx, cy, cx + 20 * s, cy + 24 * s) + chain(cx + 20 * s, cy - 22 * s, cx, cy, cx - 20 * s, cy + 24 * s);
const jackRaised = (s) => (cx, cy) => tongueJack(cx - 6 * s, cy - 8 * s, { scale: s, state: "up" }) + arrow(cx + 14 * s, cy + 26 * s, cx + 14 * s, cy - 12 * s, { sw: 4, head: 9 });

/** A small trailer with someone riding in it. */
function riderInTrailer(dump) {
  const trailer = dump ? dumpTrailer(44, 124, { scale: 0.46 }) : utilityTrailer(46, 126, { scale: 0.46 });
  return trailer + person(138, dump ? 134 : 133, 70);
}

/** Flammable, explosive and poisonous loads on a trailer deck. */
function hazardLoads() {
  return flame(78, 112, 1.3) + burst(122, 110, 1.15) + skull(166, 108, 1.05) +
    rect(46, 140, 148, 10, { fill: C.dark, sw: 3 }) + wheel(150, 164, 14);
}

function maxSpeed() {
  return speedometer(120, 112, 58) + label(120, 182, "≤ 60 mph", { size: 38 });
}

/** Lifting a foot off a narrow accelerator pedal. */
function footOffGas(cx, cy) {
  return path(`M${cx - 6} ${cy + 30} L${cx + 6} ${cy + 6}`, { stroke: C.dark, sw: 5 }) + rect(cx, cy - 18, 12, 26, { fill: C.dark, sw: 2, rx: 3 }) +
    path(`M${cx - 18} ${cy - 40} L${cx + 2} ${cy - 40} Q${cx + 18} ${cy - 40} ${cx + 20} ${cy - 30} L${cx - 18} ${cy - 28} Z`, { fill: C.action, stroke: C.ink, sw: 2.5 }) +
    arrow(cx - 22, cy - 22, cx - 22, cy - 50, { sw: 4, head: 9 });
}

/** Pressing a wide brake pedal. */
function footOnBrake(cx, cy) {
  return path(`M${cx - 8} ${cy + 30} L${cx + 4} ${cy + 6}`, { stroke: C.dark, sw: 5 }) + rect(cx - 12, cy - 6, 30, 12, { fill: C.dark, sw: 2, rx: 3 }) +
    path(`M${cx - 20} ${cy - 22} L${cx} ${cy - 22} Q${cx + 16} ${cy - 22} ${cx + 18} ${cy - 12} L${cx - 20} ${cy - 10} Z`, { fill: C.action, stroke: C.ink, sw: 2.5 }) +
    arrow(cx - 2, cy - 48, cx - 2, cy - 28, { sw: 4, head: 9 });
}

function sway() {
  const truck = rect(24, 48, 64, 34, { fill: C.body2, sw: 3.5, rx: 7 });
  const trailerBox = (angle, ghost) =>
    group(`rotate(${angle} 92 65)`, ghost ? rect(98, 47, 92, 36, { fill: "none", stroke: C.action, sw: 3, dash: "7 6" }) : rect(98, 47, 92, 36, { fill: C.body, sw: 3.5 }) + line(92, 65, 98, 65, { sw: 4 }));
  return truck + trailerBox(-13, true) + trailerBox(13, false) + curvedArrow(200, 38, 222, 66, 198, 98, { sw: 4, head: 10 }) + curvedArrow(198, 96, 176, 66, 200, 36, { sw: 4, head: 10 }) +
    line(30, 110, 210, 110, { sw: 2.5, stroke: C.body2 }) +
    footOffGas(48, 168) + tick(52, 206, 12) +
    steeringWheel(120, 160, 24) + curvedArrow(108, 128, 120, 122, 132, 128, { sw: 3, head: 7 }) + tick(120, 206, 12) +
    footOnBrake(184, 168) + cross(188, 206, 12);
}

/** Dump trailer (side view) with its body raised by `tilt` degrees. */
const raisedDump = (nx, ny, s, tilt, extra = {}) => dumpTrailer(nx, ny, { scale: s, tilt, ...extra });

function underRaisedBody() {
  return raisedDump(36, 138, 0.44, 30) + person(150, 148, 58, { pose: "crouch", facing: -1 }) + line(30, 168, 210, 168, { sw: 3 });
}

function noAssist() {
  const top = raisedDump(52, 54, 0.3, 18) + bottleJack(98, 70, 0.55, 16) + prohibition(118, 58, 44);
  const heap = path("M98 196 Q130 150 176 196 Z", { fill: C.soil, stroke: C.ink, sw: 3 });
  const bottom = heap + shovel(60, 140, 1.25) + tick(194, 160, 14) + line(30, 196, 210, 196, { sw: 3 });
  return top + line(30, 112, 210, 112, { sw: 2.5, stroke: C.body2 }) + bottom;
}

function fullRaiseLoaded() {
  return truckRear(86, 150, { scale: 0.26 }) + raisedDump(86, 150, 0.34, 46) + weightGlyph(152, 104, 1.1) + line(26, 170, 214, 170, { sw: 3 });
}

function powerLinesHazard() {
  return path("M66 92 Q120 110 174 92", { sw: 3.5 }) + path("M70 82 Q120 100 170 82", { sw: 3.5 }) +
    bolt(118, 122, 0.95) + raisedDump(54, 176, 0.36, 40) + line(36, 196, 204, 196, { sw: 3 });
}

/** White line drawing on the blue disc: the operator holds the remote, standing clear of a raised dump body. */
function stayAtControls() {
  const w = { fill: "none", stroke: C.paper, sw: 5 };
  const body = group("rotate(32 200 160)", rect(118, 136, 82, 24, w));
  return line(40, 186, 204, 186, { stroke: C.paper, sw: 4 }) + line(112, 162, 204, 162, { stroke: C.paper, sw: 5 }) + body +
    circle(150, 174, 11, w) + circle(176, 174, 11, w) + person(74, 186, 104, { color: C.paper, pose: "reach" }) + rect(98, 84, 13, 24, { ...white, sw: 2, rx: 4 });
}

function withinPayload() {
  return weightGlyph(66, 120, 1.7) + lessOrEqual(120, 116, 1.25) + payloadDecal(172, 120, 1.45);
}

function excavatorRider() {
  return excavator(112, 170, { scale: 0.42, arm: "dig" }) + person(92, 155, 52) + line(34, 170, 206, 170, { sw: 3 });
}

function controlsFromGround() {
  return excavator(140, 176, { scale: 0.44, arm: "travel" }) + person(70, 176, 96, { pose: "reach" }) + line(30, 176, 210, 176, { sw: 3 });
}

function limbsInside() {
  const w = { stroke: C.paper, sw: 6 };
  return line(76, 186, 76, 66, w) + line(166, 186, 166, 66, w) + line(64, 62, 178, 62, { stroke: C.paper, sw: 9 }) +
    rect(96, 148, 34, 10, { ...white, sw: 2, rx: 3 }) + seatedPerson(108, 146, 1.05, C.paper) + line(60, 190, 182, 190, { stroke: C.paper, sw: 4 });
}

function fuelingNoSmoking() {
  return fuelNozzle(82, 132, 1.6) + cigarette(146, 122, 1.15);
}

function withinLiftChart() {
  const hung = line(66, 52, 66, 92, { sw: 4 }) + hookGlyph(58, 100, 0.8) + rect(46, 118, 40, 34, { fill: C.body2, sw: 3.5, rx: 3 }) + weightGlyph(66, 136, 0.7);
  const chart = rect(150, 72, 54, 78, { fill: C.paper, sw: 3.5, rx: 4 }) +
    [86, 102, 118, 134].map((y) => line(160, y, 194, y, { sw: 3 })).join("");
  return hung + lessOrEqual(118, 110, 1.2) + chart;
}

function stopAndCall() {
  return warningLamp(64, 64, 0.95) + drop(118, 62, 1.15) + soundWaves(158, 64, 0.85) +
    arrow(120, 94, 120, 120, { sw: 5, head: 11 }) +
    stopHand(80, 168, 1.55) + arrow(118, 168, 144, 168, { sw: 5, head: 11 }) + phone(178, 168, null, 0.6);
}

function staffHandover() {
  return handover(120, 112, 1.15) + line(40, 182, 200, 182, { sw: 3 });
}

function handoverPhotos() {
  return camera(120, 66, 1.5) + excavator(118, 196, { scale: 0.3, arm: "travel" }) +
    curvedArrow(56, 172, 40, 120, 76, 96, { sw: 4, head: 10 }) + curvedArrow(164, 96, 200, 120, 184, 172, { sw: 4, head: 10 });
}

/** Sign tiles by id: kind (the frame) and the drawing. */
export const SIGNS = {
  "35sa-sign-before-moving": { kind: "checklist", draw: () => beforeMoving([couplerPinned(0.95), chainsCrossed(1), jackRaised(0.9)], truckRear(116, 178, { scale: 0.3 }) + utilityTrailer(116, 178, { scale: 0.3 })) },
  "35sa-sign-no-riders": { kind: "prohibition", draw: () => riderInTrailer(false) },
  "35sa-sign-no-hazmat": { kind: "prohibition", draw: hazardLoads },
  "35sa-sign-max-speed": { kind: "limit", draw: maxSpeed },
  "35sa-sign-sway": { kind: "checklist", draw: sway },

  "14lp-sign-under-body": { kind: "prohibition", draw: underRaisedBody },
  "14lp-sign-no-assist": { kind: "checklist", draw: noAssist },
  "14lp-sign-no-full-raise": { kind: "prohibition", draw: fullRaiseLoaded },
  "14lp-sign-power-lines": { kind: "warning", draw: powerLinesHazard },
  "14lp-sign-before-moving": {
    kind: "checklist",
    draw: () => beforeMoving([couplerPinned(0.72), chainsCrossed(0.78), (cx, cy) => breakawayBox(cx - 8, cy, 0.85), jackRaised(0.72)], truckRear(116, 178, { scale: 0.3 }) + dumpTrailer(116, 178, { scale: 0.28 })),
  },
  "14lp-sign-no-riders": { kind: "prohibition", draw: () => riderInTrailer(true) },
  "14lp-sign-no-hazmat": { kind: "prohibition", draw: hazardLoads },
  "14lp-sign-max-speed": { kind: "limit", draw: maxSpeed },
  "14lp-sign-stay-at-controls": { kind: "mandatory", draw: stayAtControls },
  "14lp-sign-payload": { kind: "limit", draw: withinPayload },

  "e20-sign-no-riders": { kind: "prohibition", draw: excavatorRider },
  "e20-sign-no-ground-controls": { kind: "prohibition", draw: controlsFromGround },
  "e20-sign-limbs-inside": { kind: "mandatory", draw: limbsInside },
  "e20-sign-no-smoking-fueling": { kind: "prohibition", draw: fuelingNoSmoking },
  "e20-sign-lift-chart": { kind: "limit", draw: withinLiftChart },
  "e20-sign-stop-call": { kind: "info", draw: stopAndCall },

  "301-sign-handover": { kind: "info", draw: staffHandover },
  "301-sign-stop-call": { kind: "info", draw: stopAndCall },
  "301-sign-photos": { kind: "info", draw: handoverPhotos },
};

export const DRAWN_SIGN_IDS = Object.keys(SIGNS);

/** Complete SVG for a sign record (sign_id, label, alt), or null when it has no drawing. */
export function signSvg(sign) {
  const entry = SIGNS[sign.sign_id];
  if (!entry) return null;
  return svgDocument({ id: sign.sign_id, title: sign.label, desc: sign.alt, body: signTile(entry.kind, entry.draw()), width: SIGN, height: SIGN, background: null });
}

// ------------------------------------------------------------------------------------------------ accessory icons

/** Accessory icons, 64 x 64, by the icon names the schema allows. */
export const ACCESSORY_ICONS = {
  strap: () => strapGlyph(32, 34, 1),
  "chain-pin": () => pinGlyph(30, 36, 1.15),
  "spare-tire": () => wheel(32, 32, 25, { lugs: 5 }),
  remote: () => remoteFob(32, 32, 1.1),
  keys: () => keyGlyph(34, 32, 1.1),
  attachment: () => bucketGlyph(32, 30, 1.1),
  manual: () => book(32, 32, 1),
};

export function accessorySvg({ id, icon, title }) {
  const draw = ACCESSORY_ICONS[icon];
  if (!draw) throw new Error(`Unknown accessory icon ${icon}.`);
  return svgDocument({ id, title, desc: title, body: draw(), width: 64, height: 64, background: null });
}

/** A model's accessory icon SVGs, keyed by accessory name; ids stay unique when several models share a page. */
export function accessorySvgs(model) {
  const prefix = model.model_key.replace(/\./g, "-");
  return new Map((model.accessory_icons ?? []).map((a) => [a.name, accessorySvg({ id: `${prefix}-acc-${a.icon}`, icon: a.icon, title: a.name })]));
}
