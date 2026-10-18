/**
 * Engineering Phase E2A — drawing kit for the original pictographic guide panels.
 *
 * Plain functions that return SVG fragments in one visual system: ink outlines on light fills, one blue for the
 * action to take, green for "correct", ISO 3864-style red for "prohibited" and yellow for warnings. Every panel is
 * drawn here from primitives: nothing is traced from photos, OEM figures or standard symbols. Text uses system
 * fonts only. Panels are 480 x 360 units; labels stay at 20 units or larger so they read at 360 px wide.
 */

export const W = 480;
export const H = 360;
export const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
export const MIN_LABEL = 20;

export const C = {
  ink: "#1F1D1A",
  paper: "#FFFFFF",
  body: "#EFEBE3",
  body2: "#D8D2C5",
  steel: "#A9A397",
  dark: "#4A463F",
  soil: "#E7DCC8",
  sky: "#EAF2F8",
  action: "#1F63A8",
  go: "#2E7D32",
  stop: "#C62828",
  caution: "#F2C200",
  lamp: "#E53935",
  amber: "#F39C12",
};

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${typeof v === "number" ? fmt(v) : v}"`)
    .join(" ");

export function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const group = (transform, ...children) => `<g transform="${transform}">${children.flat().join("")}</g>`;

export function rect(x, y, w, h, { fill = C.body, stroke = C.ink, sw = 4, rx = 0, dash } = {}) {
  return `<rect ${attrs({ x, y, width: w, height: h, rx, fill, stroke, "stroke-width": sw, "stroke-dasharray": dash, "stroke-linejoin": "round" })}/>`;
}

export function circle(cx, cy, r, { fill = C.body, stroke = C.ink, sw = 4, dash } = {}) {
  return `<circle ${attrs({ cx, cy, r, fill, stroke, "stroke-width": sw, "stroke-dasharray": dash })}/>`;
}

export function ellipse(cx, cy, rx, ry, { fill = C.body, stroke = C.ink, sw = 4, dash } = {}) {
  return `<ellipse ${attrs({ cx, cy, rx, ry, fill, stroke, "stroke-width": sw, "stroke-dasharray": dash })}/>`;
}

export function line(x1, y1, x2, y2, { stroke = C.ink, sw = 4, dash, cap = "round" } = {}) {
  return `<line ${attrs({ x1, y1, x2, y2, stroke, "stroke-width": sw, "stroke-dasharray": dash, "stroke-linecap": cap })}/>`;
}

export function path(d, { fill = "none", stroke = C.ink, sw = 4, dash, cap = "round" } = {}) {
  return `<path ${attrs({ d, fill, stroke, "stroke-width": sw, "stroke-dasharray": dash, "stroke-linecap": cap, "stroke-linejoin": "round" })}/>`;
}

export function poly(points, { fill = C.body, stroke = C.ink, sw = 4 } = {}) {
  return `<polygon ${attrs({ points: points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" "), fill, stroke, "stroke-width": sw, "stroke-linejoin": "round" })}/>`;
}

export function label(x, y, text, { size = 22, weight = 700, fill = C.ink, anchor = "middle", halo = true } = {}) {
  if (size < MIN_LABEL) throw new Error(`Label "${text}" is ${size} units; the minimum is ${MIN_LABEL}.`);
  const common = { x, y, "font-family": FONT, "font-size": size, "font-weight": weight, "text-anchor": anchor };
  const back = halo
    ? `<text ${attrs({ ...common, fill: "none", stroke: C.paper, "stroke-width": 6, "stroke-linejoin": "round" })}>${esc(text)}</text>`
    : "";
  return `${back}<text ${attrs({ ...common, fill })}>${esc(text)}</text>`;
}

/** Straight arrow with a filled head at (x2, y2). */
export function arrow(x1, y1, x2, y2, { color = C.action, sw = 6, head = 15 } = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - head * Math.cos(a);
  const by = y2 - head * Math.sin(a);
  const p1 = [bx + (head * 0.6) * Math.sin(a), by - (head * 0.6) * Math.cos(a)];
  const p2 = [bx - (head * 0.6) * Math.sin(a), by + (head * 0.6) * Math.cos(a)];
  return line(x1, y1, bx, by, { stroke: color, sw }) + poly([[x2, y2], p1, p2], { fill: color, stroke: color, sw: 2 });
}

/** Quadratic curved arrow ending at (x2, y2), bending through control point (cx, cy). */
export function curvedArrow(x1, y1, cx, cy, x2, y2, { color = C.action, sw = 6, head = 15 } = {}) {
  const a = Math.atan2(y2 - cy, x2 - cx);
  const bx = x2 - head * Math.cos(a);
  const by = y2 - head * Math.sin(a);
  const p1 = [bx + (head * 0.6) * Math.sin(a), by - (head * 0.6) * Math.cos(a)];
  const p2 = [bx - (head * 0.6) * Math.sin(a), by + (head * 0.6) * Math.cos(a)];
  return path(`M${fmt(x1)} ${fmt(y1)} Q${fmt(cx)} ${fmt(cy)} ${fmt(bx)} ${fmt(by)}`, { stroke: color, sw }) + poly([[x2, y2], p1, p2], { fill: color, stroke: color, sw: 2 });
}

/** Green disc with a white tick: "this is right". */
export function tick(cx, cy, r = 18) {
  return circle(cx, cy, r, { fill: C.go, stroke: C.paper, sw: 3 }) +
    path(`M${fmt(cx - r * 0.45)} ${fmt(cy + r * 0.02)} L${fmt(cx - r * 0.1)} ${fmt(cy + r * 0.38)} L${fmt(cx + r * 0.5)} ${fmt(cy - r * 0.35)}`, { stroke: C.paper, sw: r * 0.22 });
}

/** ISO 3864-style prohibition ring and bar over whatever is drawn beneath. */
export function prohibition(cx, cy, r) {
  const s = r * Math.SQRT1_2;
  return circle(cx, cy, r, { fill: "none", stroke: C.stop, sw: r * 0.16 }) +
    line(cx - s, cy - s, cx + s, cy + s, { stroke: C.stop, sw: r * 0.16, cap: "butt" });
}

/** Yellow warning triangle with a black border and an exclamation mark. */
export function warning(cx, cy, size = 40) {
  const h = size * 0.87;
  return poly([[cx, cy - h / 2], [cx + size / 2, cy + h / 2], [cx - size / 2, cy + h / 2]], { fill: C.caution, stroke: C.ink, sw: 3.5 }) +
    line(cx, cy - h * 0.15, cx, cy + h * 0.17, { sw: size * 0.1 }) + circle(cx, cy + h * 0.32, size * 0.055, { fill: C.ink, stroke: "none" });
}

/** Yellow triangle with a lightning bolt (electrical hazard). */
export function electricWarning(cx, cy, size = 54) {
  const h = size * 0.87;
  const k = size / 54;
  const bolt = [[cx + 3 * k, cy - 14 * k], [cx - 7 * k, cy + 4 * k], [cx + 1 * k, cy + 4 * k], [cx - 4 * k, cy + 17 * k], [cx + 8 * k, cy - 2 * k], [cx, cy - 2 * k]];
  return poly([[cx, cy - h / 2], [cx + size / 2, cy + h / 2], [cx - size / 2, cy + h / 2]], { fill: C.caution, stroke: C.ink, sw: 3.5 }) + poly(bolt, { fill: C.ink, stroke: C.ink, sw: 1 });
}

/** Panel number in the top-left corner. */
export function badge(n) {
  return circle(24, 24, 17, { fill: C.ink, stroke: "none" }) + label(24, 32, String(n), { size: 22, fill: C.paper, halo: false });
}

/** Small numbered disc for a frame inside a panel. */
export function step(x, y, n) {
  return circle(x, y, 13, { fill: C.paper, stroke: C.ink, sw: 3 }) + label(x, y + 7.5, String(n), { size: 20, halo: false });
}

export const ground = (y = 304, x1 = 8, x2 = 472) => line(x1, y, x2, y, { sw: 4 });

/** Hatched ground strip under a scene. */
export function groundBand(y, x1 = 8, x2 = 472) {
  const ticks = [];
  for (let x = x1 + 6; x < x2; x += 18) ticks.push(line(x, y + 4, x - 10, y + 14, { sw: 2.5, stroke: C.steel }));
  return line(x1, y, x2, y, { sw: 4 }) + ticks.join("");
}

/** Simple standing person (pictogram style), feet at (x, y), height h. */
export function person(x, y, h = 120, { color = C.ink, pose = "stand", facing = 1 } = {}) {
  const k = h / 120;
  const head = circle(x, y - 108 * k, 12 * k, { fill: color, stroke: "none" });
  const torso = path(`M${fmt(x)} ${fmt(y - 92 * k)} L${fmt(x)} ${fmt(y - 50 * k)}`, { stroke: color, sw: 15 * k });
  let legs;
  let arms;
  if (pose === "walk") {
    legs = path(`M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x + 14 * k * facing)} ${fmt(y - 4 * k)} M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x - 12 * k * facing)} ${fmt(y - 4 * k)}`, { stroke: color, sw: 12 * k });
    arms = path(`M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x + 14 * k * facing)} ${fmt(y - 62 * k)} M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x - 13 * k * facing)} ${fmt(y - 64 * k)}`, { stroke: color, sw: 10 * k });
  } else if (pose === "reach") {
    legs = path(`M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x + 8 * k)} ${fmt(y - 4 * k)} M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x - 8 * k)} ${fmt(y - 4 * k)}`, { stroke: color, sw: 12 * k });
    arms = path(`M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x + 34 * k * facing)} ${fmt(y - 80 * k)} M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x + 30 * k * facing)} ${fmt(y - 70 * k)}`, { stroke: color, sw: 10 * k });
  } else if (pose === "crouch") {
    legs = path(`M${fmt(x)} ${fmt(y - 40 * k)} L${fmt(x + 16 * k * facing)} ${fmt(y - 22 * k)} L${fmt(x + 6 * k * facing)} ${fmt(y - 2 * k)} M${fmt(x)} ${fmt(y - 40 * k)} L${fmt(x - 10 * k * facing)} ${fmt(y - 4 * k)}`, { stroke: color, sw: 12 * k });
    arms = path(`M${fmt(x)} ${fmt(y - 72 * k)} L${fmt(x + 30 * k * facing)} ${fmt(y - 52 * k)}`, { stroke: color, sw: 10 * k });
    return circle(x + 6 * k * facing, y - 92 * k, 12 * k, { fill: color, stroke: "none" }) +
      path(`M${fmt(x + 4 * k * facing)} ${fmt(y - 78 * k)} L${fmt(x)} ${fmt(y - 40 * k)}`, { stroke: color, sw: 15 * k }) + legs + arms;
  } else {
    legs = path(`M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x + 8 * k)} ${fmt(y - 4 * k)} M${fmt(x)} ${fmt(y - 50 * k)} L${fmt(x - 8 * k)} ${fmt(y - 4 * k)}`, { stroke: color, sw: 12 * k });
    arms = path(`M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x + 12 * k)} ${fmt(y - 56 * k)} M${fmt(x)} ${fmt(y - 86 * k)} L${fmt(x - 12 * k)} ${fmt(y - 56 * k)}`, { stroke: color, sw: 10 * k });
  }
  return head + torso + legs + arms;
}

/** An eye, for "look". */
export function eye(cx, cy, s = 1) {
  return path(`M${fmt(cx - 22 * s)} ${fmt(cy)} Q${fmt(cx)} ${fmt(cy - 18 * s)} ${fmt(cx + 22 * s)} ${fmt(cy)} Q${fmt(cx)} ${fmt(cy + 18 * s)} ${fmt(cx - 22 * s)} ${fmt(cy)} Z`, { fill: C.paper, stroke: C.action, sw: 4 }) +
    circle(cx, cy, 6.5 * s, { fill: C.action, stroke: "none" });
}

/** Magnifying glass. */
export function magnifier(cx, cy, r = 20, color = C.action) {
  return circle(cx, cy, r, { fill: "rgba(255,255,255,0.35)", stroke: color, sw: 5 }) +
    line(cx + r * 0.72, cy + r * 0.72, cx + r * 1.55, cy + r * 1.55, { stroke: color, sw: 8 });
}

/** Wheel and tire in side view. */
export function wheel(cx, cy, r = 30, { lugs = 0 } = {}) {
  const parts = [circle(cx, cy, r, { fill: C.dark, stroke: C.ink, sw: 4 }), circle(cx, cy, r * 0.58, { fill: C.body2, stroke: C.ink, sw: 3 })];
  if (lugs > 0) {
    for (let i = 0; i < lugs; i++) {
      const a = (2 * Math.PI * i) / lugs - Math.PI / 2;
      parts.push(circle(cx + r * 0.36 * Math.cos(a), cy + r * 0.36 * Math.sin(a), Math.max(2.5, r * 0.07), { fill: C.ink, stroke: "none" }));
    }
  } else {
    parts.push(circle(cx, cy, r * 0.16, { fill: C.ink, stroke: "none" }));
  }
  return parts.join("");
}

/**
 * Pickup rear in side view, facing right: the hitch ball top sits at (bx, by). Wheel and bed are to the left.
 * lift lifts the vehicle body (not the tire) to show a jack test.
 */
export function truckRear(bx, by, { lift = 0, ball = true, scale = 1 } = {}) {
  const k = scale;
  const y0 = by - lift;
  const parts = [];
  // Body: bed side and tailgate.
  parts.push(path(`M${fmt(bx - 230 * k)} ${fmt(y0 - 64 * k)} L${fmt(bx - 52 * k)} ${fmt(y0 - 64 * k)} L${fmt(bx - 52 * k)} ${fmt(y0 + 6 * k)} L${fmt(bx - 230 * k)} ${fmt(y0 + 6 * k)}`, { fill: C.body2, sw: 4 * k }));
  // Wheel arch cut and tire (tire stays on the ground).
  parts.push(wheel(bx - 150 * k, by + 34 * k, 30 * k));
  parts.push(path(`M${fmt(bx - 192 * k)} ${fmt(y0 + 6 * k)} A${fmt(42 * k)} ${fmt(42 * k)} 0 0 1 ${fmt(bx - 108 * k)} ${fmt(y0 + 6 * k)}`, { sw: 4 * k }));
  // Bumper and receiver.
  parts.push(rect(bx - 60 * k, y0 + 6 * k, 20 * k, 16 * k, { fill: C.steel, sw: 3.5 * k }));
  parts.push(rect(bx - 44 * k, y0 + 24 * k, 26 * k, 14 * k, { fill: C.dark, sw: 3 * k }));
  if (ball) {
    // Ball mount: shank, riser, ball.
    parts.push(rect(bx - 22 * k, y0 + 26 * k, 24 * k, 10 * k, { fill: C.steel, sw: 3 * k }));
    parts.push(rect(bx - 6 * k, y0 + 10 * k, 12 * k, 26 * k, { fill: C.steel, sw: 3 * k }));
    parts.push(circle(bx, y0, 11 * k, { fill: C.steel, sw: 3.5 * k }));
  }
  return parts.join("");
}

/**
 * Utility trailer (single axle, open sides, ramp gate) in side view, coupler nose at (nx, ny) = ball centre when
 * coupled. Length about 330 units at scale 1.
 */
export function utilityTrailer(nx, ny, { scale = 1, jack = "up", gate = "up", load = null, latchPin = false } = {}) {
  const k = scale;
  const deckY = ny + 18 * k;
  const x0 = nx + 70 * k;
  const x1 = nx + 330 * k;
  const axleX = nx + 210 * k;
  const parts = [];
  // Tongue and coupler.
  parts.push(path(`M${fmt(nx + 8 * k)} ${fmt(ny + 6 * k)} L${fmt(x0)} ${fmt(deckY)}`, { sw: 7 * k }));
  parts.push(coupler(nx, ny, { scale: k, pin: latchPin }));
  // Jack on the tongue.
  parts.push(tongueJack(nx + 46 * k, ny + 10 * k, { scale: k, state: jack, groundY: ny + 86 * k }));
  // Deck and rails.
  parts.push(rect(x0, deckY, x1 - x0, 12 * k, { fill: C.dark, sw: 3.5 * k }));
  parts.push(line(x0, deckY - 34 * k, x1, deckY - 34 * k, { sw: 5 * k }));
  for (let x = x0; x <= x1 + 0.1; x += (x1 - x0) / 6) parts.push(line(x, deckY, x, deckY - 34 * k, { sw: 3.5 * k }));
  // Fender and wheel.
  parts.push(path(`M${fmt(axleX - 44 * k)} ${fmt(deckY + 12 * k)} A${fmt(44 * k)} ${fmt(36 * k)} 0 0 1 ${fmt(axleX + 44 * k)} ${fmt(deckY + 12 * k)}`, { fill: C.body2, sw: 4 * k }));
  parts.push(wheel(axleX, ny + 56 * k, 29 * k));
  // Rear ramp gate.
  if (gate === "up") {
    parts.push(rect(x1 - 2 * k, deckY - 62 * k, 10 * k, 74 * k, { fill: C.body2, sw: 3.5 * k }));
    for (let y = deckY - 52 * k; y < deckY + 6 * k; y += 12 * k) parts.push(line(x1 - 2 * k, y, x1 + 8 * k, y, { sw: 2 * k }));
  }
  if (load) parts.push(load);
  return parts.join("");
}

/** A-frame ball coupler, side view, socket centred on the ball at (x, y). */
export function coupler(x, y, { scale = 1, pin = false, open = false } = {}) {
  const k = scale;
  const parts = [];
  parts.push(path(`M${fmt(x - 16 * k)} ${fmt(y + 6 * k)} Q${fmt(x - 18 * k)} ${fmt(y - 16 * k)} ${fmt(x)} ${fmt(y - 18 * k)} L${fmt(x + 30 * k)} ${fmt(y - 12 * k)} L${fmt(x + 34 * k)} ${fmt(y + 8 * k)} L${fmt(x + 12 * k)} ${fmt(y + 10 * k)} Q${fmt(x + 4 * k)} ${fmt(y + 2 * k)} ${fmt(x - 16 * k)} ${fmt(y + 6 * k)} Z`, { fill: C.steel, sw: 3.5 * k }));
  // Latch lever on top.
  const lever = open
    ? path(`M${fmt(x + 6 * k)} ${fmt(y - 18 * k)} L${fmt(x + 2 * k)} ${fmt(y - 40 * k)}`, { sw: 6 * k })
    : path(`M${fmt(x + 4 * k)} ${fmt(y - 19 * k)} L${fmt(x + 30 * k)} ${fmt(y - 16 * k)}`, { sw: 6 * k });
  parts.push(lever);
  if (pin) {
    parts.push(circle(x + 22 * k, y - 22 * k, 5 * k, { fill: C.action, stroke: C.ink, sw: 2 * k }));
    parts.push(path(`M${fmt(x + 22 * k)} ${fmt(y - 22 * k)} q${fmt(10 * k)} ${fmt(-14 * k)} ${fmt(18 * k)} ${fmt(-2 * k)}`, { stroke: C.action, sw: 3 * k }));
  }
  return parts.join("");
}

/** Tongue jack: post with a crank on top; state "up" (foot raised) or "down" (foot on the ground). */
export function tongueJack(x, y, { scale = 1, state = "up", groundY, kind = "top-wind" } = {}) {
  const k = scale;
  const footY = state === "down" ? groundY : y + 40 * k;
  const parts = [];
  parts.push(rect(x - 6 * k, y - 22 * k, 12 * k, 40 * k, { fill: C.body2, sw: 3 * k }));
  parts.push(rect(x - 4 * k, y + 18 * k, 8 * k, footY - y - 18 * k, { fill: C.steel, sw: 2.5 * k }));
  parts.push(rect(x - 11 * k, footY - 3 * k, 22 * k, 6 * k, { fill: C.dark, sw: 2.5 * k }));
  if (kind === "side-wind") {
    parts.push(path(`M${fmt(x + 6 * k)} ${fmt(y - 8 * k)} l${fmt(16 * k)} 0 l0 ${fmt(14 * k)}`, { sw: 3 * k }));
  } else {
    parts.push(path(`M${fmt(x)} ${fmt(y - 22 * k)} l0 ${fmt(-8 * k)} l${fmt(16 * k)} 0 l0 ${fmt(8 * k)}`, { sw: 3 * k }));
  }
  return parts.join("");
}

/** Cargo box. */
export function box(x, y, w, h, { fill = C.body, heavy = false } = {}) {
  return rect(x, y, w, h, { fill: heavy ? C.body2 : fill, sw: 3.5, rx: 3 }) +
    (heavy ? label(x + w / 2, y + h / 2 + 8, "kg", { size: 22, halo: false, fill: C.dark }) : line(x + 6, y + h * 0.35, x + w - 6, y + h * 0.35, { sw: 2.5, stroke: C.steel }));
}

/** Tow-vehicle socket and trailer plug, side by side. kind "4" (flat) or "7" (round RV). */
export function plugPair(x, y, kind = "4", { joined = false } = {}) {
  const parts = [];
  const gap = joined ? 0 : 34;
  if (kind === "4") {
    parts.push(rect(x - 70, y - 13, 56, 26, { fill: C.dark, sw: 3.5, rx: 4 }));
    parts.push(line(x - 140, y, x - 70, y, { sw: 8, stroke: C.dark }));
    parts.push(rect(x - 14 + gap, y - 13, 56, 26, { fill: C.body2, sw: 3.5, rx: 4 }));
    for (let i = 0; i < 4; i++) parts.push(rect(x - 14 + gap - 12, y - 10 + i * 6, 12, 3.5, { fill: C.steel, stroke: "none" }));
    parts.push(line(x + 42 + gap, y, x + 112 + gap, y, { sw: 8, stroke: C.body2 }));
  } else {
    parts.push(circle(x - 46, y, 26, { fill: C.dark, sw: 3.5 }));
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      parts.push(circle(x - 46 + 14 * Math.cos(a), y + 14 * Math.sin(a), 3, { fill: C.steel, stroke: "none" }));
    }
    parts.push(circle(x - 46, y, 3.5, { fill: C.steel, stroke: "none" }));
    parts.push(line(x - 140, y, x - 72, y, { sw: 8, stroke: C.dark }));
    parts.push(circle(x + 6 + gap, y, 24, { fill: C.body2, sw: 3.5 }));
    parts.push(line(x + 30 + gap, y, x + 112 + gap, y, { sw: 8, stroke: C.body2 }));
  }
  return parts.join("");
}

/** Trailer seen from behind: frame, two tires, a light cluster each side. lights: off | tail | brake | left | right. */
export function trailerRear(cx, y, { width = 170, lights = "off", dump = false } = {}) {
  const half = width / 2;
  const parts = [];
  if (dump) {
    parts.push(rect(cx - half, y - 96, width, 86, { fill: C.body, sw: 4 }));
    parts.push(line(cx, y - 96, cx, y - 10, { sw: 3 }));
  } else {
    parts.push(rect(cx - half, y - 70, width, 52, { fill: "none", sw: 4 }));
    for (let x = cx - half + width / 6; x < cx + half - 1; x += width / 6) parts.push(line(x, y - 70, x, y - 18, { sw: 2.5 }));
  }
  parts.push(rect(cx - half - 6, y - 14, width + 12, 12, { fill: C.dark, sw: 3 }));
  parts.push(rect(cx - half - 20, y - 4, 22, 44, { fill: C.dark, sw: 3, rx: 6 }));
  parts.push(rect(cx + half - 2, y - 4, 22, 44, { fill: C.dark, sw: 3, rx: 6 }));
  // Tail lights glow softly; brake lights are bright with a double halo; a turn signal is amber on one side.
  const lamp = (x, state, color) => {
    if (state === "off") return rect(x - 9, y - 14, 18, 12, { fill: "#F3C9C7", sw: 2.5, rx: 2 });
    const bright = state === "bright";
    const halo = circle(x, y - 8, 15, { fill: "none", stroke: color, sw: 3, dash: "4 5" }) +
      (bright ? circle(x, y - 8, 22, { fill: "none", stroke: color, sw: 3, dash: "4 6" }) : "");
    return rect(x - 9, y - 14, 18, 12, { fill: bright || color === C.amber ? color : "#F08A84", sw: 2.5, rx: 2 }) + halo;
  };
  const side = (s) => {
    if (lights === "tail") return ["soft", C.lamp];
    if (lights === "brake") return ["bright", C.lamp];
    if (lights === s) return ["bright", C.amber];
    return ["off", C.lamp];
  };
  parts.push(lamp(cx - half + 12, ...side("left")));
  parts.push(lamp(cx + half - 12, ...side("right")));
  return parts.join("");
}

/** Chain drawn as links along a quadratic curve. */
export function chain(x1, y1, cx, cy, x2, y2, { color = C.dark } = {}) {
  return path(`M${fmt(x1)} ${fmt(y1)} Q${fmt(cx)} ${fmt(cy)} ${fmt(x2)} ${fmt(y2)}`, { stroke: color, sw: 7, dash: "9 5", cap: "round" });
}

/** Dump trailer (tandem axle, solid sides, front shroud) in side view; body tilts by `tilt` degrees about the rear hinge. */
export function dumpTrailer(nx, ny, { scale = 1, tilt = 0, ghostTilt = 0, jack = "up", doors = "closed", latchPin = false } = {}) {
  const k = scale;
  const frameY = ny + 22 * k;
  const x0 = nx + 70 * k;
  const x1 = nx + 340 * k;
  const parts = [];
  parts.push(path(`M${fmt(nx + 8 * k)} ${fmt(ny + 6 * k)} L${fmt(x0)} ${fmt(frameY)}`, { sw: 8 * k }));
  parts.push(coupler(nx, ny, { scale: k, pin: latchPin }));
  parts.push(tongueJack(nx + 50 * k, ny + 12 * k, { scale: k, state: jack, groundY: ny + 82 * k, kind: "side-wind" }));
  parts.push(rect(x0, frameY, x1 - x0, 12 * k, { fill: C.dark, sw: 3.5 * k }));
  // Tandem wheels.
  parts.push(wheel(nx + 220 * k, ny + 58 * k, 24 * k));
  parts.push(wheel(nx + 276 * k, ny + 58 * k, 24 * k));
  parts.push(path(`M${fmt(nx + 190 * k)} ${fmt(frameY + 12 * k)} L${fmt(nx + 190 * k)} ${fmt(frameY)} L${fmt(nx + 306 * k)} ${fmt(frameY)} L${fmt(nx + 306 * k)} ${fmt(frameY + 12 * k)}`, { sw: 3 * k }));
  // Body (box) pivots about the rear-bottom corner.
  const bodyH = 58 * k;
  const hinge = [x1, frameY];
  const bodyParts = [];
  bodyParts.push(rect(x0 + 6 * k, frameY - bodyH, x1 - x0 - 6 * k, bodyH, { fill: C.body, sw: 4 * k }));
  bodyParts.push(rect(x0 + 6 * k, frameY - bodyH - 16 * k, 34 * k, 16 * k, { fill: C.body2, sw: 3 * k }));
  bodyParts.push(line(x0 + 6 * k, frameY - bodyH + 14 * k, x1, frameY - bodyH + 14 * k, { sw: 2.5 * k, stroke: C.steel }));
  if (doors === "closed") bodyParts.push(rect(x1 - 8 * k, frameY - bodyH, 8 * k, bodyH, { fill: C.body2, sw: 3 * k }));
  parts.push(`<g transform="rotate(${fmt(tilt)} ${fmt(hinge[0])} ${fmt(hinge[1])})">${bodyParts.join("")}</g>`);
  if (ghostTilt > 0) {
    const ghost = rect(x0 + 6 * k, frameY - bodyH, x1 - x0 - 6 * k, bodyH, { fill: "none", stroke: C.action, sw: 3 * k, dash: `${fmt(9 * k)} ${fmt(7 * k)}` });
    parts.push(`<g transform="rotate(${fmt(ghostTilt)} ${fmt(hinge[0])} ${fmt(hinge[1])})">${ghost}</g>`);
  }
  if (tilt > 0) {
    // Scissor hoist under the raised body.
    const rad = (tilt * Math.PI) / 180;
    const lift = (x) => [x1 - (x1 - x) * Math.cos(rad), frameY - (x1 - x) * Math.sin(rad)];
    const [ax, ay] = lift(nx + 160 * k);
    const [bx2, by2] = lift(nx + 230 * k);
    parts.push(path(`M${fmt(nx + 150 * k)} ${fmt(frameY)} L${fmt(bx2)} ${fmt(by2)} M${fmt(nx + 236 * k)} ${fmt(frameY)} L${fmt(ax)} ${fmt(ay)}`, { sw: 5 * k, stroke: C.dark }));
  }
  return parts.join("");
}

/**
 * Compact excavator with canopy in side view (original drawing in E20-like proportions), facing right, tracks on
 * the ground at y. Length about 300 units at scale 1 with the arm forward.
 */
export function excavator(x, y, { scale = 1, facing = 1, arm = "dig" } = {}) {
  const k = scale;
  const f = facing;
  const X = (dx) => x + dx * k * f;
  const Y = (dy) => y + dy * k;
  const parts = [];
  // Tracks.
  parts.push(path(`M${fmt(X(-70))} ${fmt(Y(0))} L${fmt(X(70))} ${fmt(Y(0))} A${fmt(18 * k)} ${fmt(18 * k)} 0 0 ${f > 0 ? 0 : 1} ${fmt(X(70))} ${fmt(Y(-36))} L${fmt(X(-70))} ${fmt(Y(-36))} A${fmt(18 * k)} ${fmt(18 * k)} 0 0 ${f > 0 ? 0 : 1} ${fmt(X(-70))} ${fmt(Y(0))} Z`, { fill: C.dark, sw: 4 * k }));
  for (const dx of [-62, -20, 20, 62]) parts.push(circle(X(dx), Y(-18), 8 * k, { fill: C.steel, sw: 2.5 * k }));
  // Blade at the front.
  parts.push(path(`M${fmt(X(86))} ${fmt(Y(-30))} L${fmt(X(104))} ${fmt(Y(-36))} L${fmt(X(108))} ${fmt(Y(-2))} L${fmt(X(90))} ${fmt(Y(-4))} Z`, { fill: C.body2, sw: 3.5 * k }));
  parts.push(line(X(70), Y(-22), X(88), Y(-20), { sw: 5 * k }));
  // Upper structure (house) with counterweight.
  parts.push(path(`M${fmt(X(-78))} ${fmt(Y(-40))} L${fmt(X(40))} ${fmt(Y(-40))} L${fmt(X(40))} ${fmt(Y(-70))} L${fmt(X(-60))} ${fmt(Y(-70))} Q${fmt(X(-80))} ${fmt(Y(-70))} ${fmt(X(-80))} ${fmt(Y(-52))} Z`, { fill: C.body, sw: 4 * k }));
  // Seat and canopy.
  parts.push(path(`M${fmt(X(-20))} ${fmt(Y(-70))} L${fmt(X(-14))} ${fmt(Y(-96))} L${fmt(X(2))} ${fmt(Y(-96))}`, { sw: 5 * k }));
  parts.push(line(X(-52), Y(-70), X(-48), Y(-150), { sw: 6 * k }));
  parts.push(line(X(26), Y(-70), X(22), Y(-148), { sw: 6 * k }));
  parts.push(path(`M${fmt(X(-60))} ${fmt(Y(-150))} L${fmt(X(30))} ${fmt(Y(-150))}`, { sw: 8 * k }));
  // Boom, arm, bucket.
  if (arm === "dig") {
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(80))} ${fmt(Y(-140))} ${fmt(X(130))} ${fmt(Y(-128))}`, { sw: 13 * k, stroke: C.body2 }));
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(80))} ${fmt(Y(-140))} ${fmt(X(130))} ${fmt(Y(-128))}`, { sw: 3 * k }));
    parts.push(line(X(130), Y(-128), X(160), Y(-40), { sw: 10 * k, stroke: C.body2 }));
    parts.push(line(X(130), Y(-128), X(160), Y(-40), { sw: 3 * k }));
    parts.push(path(`M${fmt(X(152))} ${fmt(Y(-44))} Q${fmt(X(170))} ${fmt(Y(-6))} ${fmt(X(146))} ${fmt(Y(-4))} L${fmt(X(162))} ${fmt(Y(-38))} Z`, { fill: C.dark, sw: 3 * k }));
  } else if (arm === "raise") {
    // Boom up, arm reaching out, bucket held high.
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(66))} ${fmt(Y(-176))} ${fmt(X(124))} ${fmt(Y(-182))}`, { sw: 13 * k, stroke: C.body2 }));
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(66))} ${fmt(Y(-176))} ${fmt(X(124))} ${fmt(Y(-182))}`, { sw: 3 * k }));
    parts.push(line(X(124), Y(-182), X(196), Y(-150), { sw: 10 * k, stroke: C.body2 }));
    parts.push(line(X(124), Y(-182), X(196), Y(-150), { sw: 3 * k }));
    parts.push(path(`M${fmt(X(190))} ${fmt(Y(-154))} Q${fmt(X(214))} ${fmt(Y(-126))} ${fmt(X(188))} ${fmt(Y(-116))} L${fmt(X(198))} ${fmt(Y(-146))} Z`, { fill: C.dark, sw: 3 * k }));
  } else {
    // Travel pose: arm folded, bucket low.
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(74))} ${fmt(Y(-118))} ${fmt(X(110))} ${fmt(Y(-104))}`, { sw: 13 * k, stroke: C.body2 }));
    parts.push(path(`M${fmt(X(40))} ${fmt(Y(-56))} Q${fmt(X(74))} ${fmt(Y(-118))} ${fmt(X(110))} ${fmt(Y(-104))}`, { sw: 3 * k }));
    parts.push(line(X(110), Y(-104), X(118), Y(-30), { sw: 10 * k, stroke: C.body2 }));
    parts.push(line(X(110), Y(-104), X(118), Y(-30), { sw: 3 * k }));
    parts.push(path(`M${fmt(X(112))} ${fmt(Y(-34))} Q${fmt(X(132))} ${fmt(Y(-8))} ${fmt(X(108))} ${fmt(Y(-12))} L${fmt(X(122))} ${fmt(Y(-30))} Z`, { fill: C.dark, sw: 3 * k }));
  }
  return parts.join("");
}

/** Excavator from above, upper swung `swing` degrees from the tracks; blade at the front of the tracks. */
export function excavatorTop(cx, cy, { scale = 1, swing = 0 } = {}) {
  const k = scale;
  const parts = [];
  parts.push(rect(cx - 64 * k, cy - 46 * k, 128 * k, 22 * k, { fill: C.dark, sw: 3.5 * k, rx: 8 * k }));
  parts.push(rect(cx - 64 * k, cy + 24 * k, 128 * k, 22 * k, { fill: C.dark, sw: 3.5 * k, rx: 8 * k }));
  parts.push(rect(cx + 70 * k, cy - 50 * k, 12 * k, 100 * k, { fill: C.body2, sw: 3.5 * k }));
  const upper = [
    circle(cx, cy, 44 * k, { fill: C.body, sw: 4 * k }),
    rect(cx - 6 * k, cy - 12 * k, 140 * k, 24 * k, { fill: C.body2, sw: 3.5 * k, rx: 6 * k }),
    rect(cx - 26 * k, cy - 18 * k, 26 * k, 36 * k, { fill: C.paper, sw: 3 * k }),
  ].join("");
  parts.push(`<g transform="rotate(${fmt(swing)} ${fmt(cx)} ${fmt(cy)})">${upper}</g>`);
  return parts.join("");
}

/** Smartphone with a short number on screen. */
export function phone(x, y, text) {
  return rect(x - 32, y - 58, 64, 116, { fill: C.dark, sw: 4, rx: 10 }) + rect(x - 24, y - 44, 48, 82, { fill: C.paper, sw: 2.5, rx: 4 }) +
    label(x, y + 6, text, { size: 24, fill: C.action, halo: false });
}

/** Utility pole pair with sagging wires between x1 and x2 at height y. */
export function powerLines(x1, x2, y) {
  const pole = (x) => line(x, y - 10, x, y + 120, { sw: 7, stroke: C.dark }) + line(x - 22, y, x + 22, y, { sw: 5, stroke: C.dark });
  return pole(x1) + pole(x2) +
    path(`M${fmt(x1 - 18)} ${fmt(y)} Q${fmt((x1 + x2) / 2)} ${fmt(y + 26)} ${fmt(x2 - 18)} ${fmt(y)}`, { sw: 3 }) +
    path(`M${fmt(x1 + 18)} ${fmt(y)} Q${fmt((x1 + x2) / 2)} ${fmt(y + 26)} ${fmt(x2 + 18)} ${fmt(y)}`, { sw: 3 });
}

/** Spirit level with a centred bubble, for "level ground". */
export function spiritLevel(cx, cy, w = 90) {
  return rect(cx - w / 2, cy - 12, w, 24, { fill: C.caution, sw: 3.5, rx: 5 }) + rect(cx - 16, cy - 7, 32, 14, { fill: "#D9F2D0", sw: 2.5, rx: 7 }) +
    circle(cx, cy, 4.5, { fill: C.go, stroke: "none" }) + line(cx - 10, cy - 7, cx - 10, cy + 7, { sw: 2 }) + line(cx + 10, cy - 7, cx + 10, cy + 7, { sw: 2 });
}

/** Clock face showing one hour. */
export function clock(cx, cy, r = 26) {
  return circle(cx, cy, r, { fill: C.paper, sw: 4 }) + line(cx, cy, cx, cy - r * 0.7, { sw: 4 }) + line(cx, cy, cx + r * 0.45, cy, { sw: 4 });
}

/** Padlock. */
export function padlock(cx, cy, s = 1) {
  return path(`M${fmt(cx - 11 * s)} ${fmt(cy - 4 * s)} L${fmt(cx - 11 * s)} ${fmt(cy - 14 * s)} A${fmt(11 * s)} ${fmt(11 * s)} 0 0 1 ${fmt(cx + 11 * s)} ${fmt(cy - 14 * s)} L${fmt(cx + 11 * s)} ${fmt(cy - 4 * s)}`, { sw: 5 * s }) +
    rect(cx - 17 * s, cy - 6 * s, 34 * s, 26 * s, { fill: C.action, sw: 3 * s, rx: 4 * s });
}

/** Generic hand-held control with UP and DOWN buttons (the words the manual uses), UP highlighted when active. */
export function upDownControl(cx, cy, { active = "up" } = {}) {
  return rect(cx - 30, cy - 52, 60, 104, { fill: C.dark, sw: 3.5, rx: 10 }) +
    rect(cx - 22, cy - 42, 44, 36, { fill: active === "up" ? C.action : C.body2, sw: 2.5, rx: 6 }) +
    label(cx, cy - 16, "UP", { size: 20, fill: active === "up" ? C.paper : C.ink, halo: false }) +
    rect(cx - 22, cy + 6, 44, 36, { fill: active === "down" ? C.action : C.body2, sw: 2.5, rx: 6 }) +
    label(cx, cy + 31, "DN", { size: 20, fill: active === "down" ? C.paper : C.ink, halo: false });
}

/** Assemble a complete, self-contained SVG document. */
export function svgDocument({ id, title, desc, body }) {
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="${titleId} ${descId}">`,
    `<title id="${titleId}">${esc(title)}</title>`,
    `<desc id="${descId}">${esc(desc)}</desc>`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${C.paper}"/>`,
    body,
    "</svg>",
    "",
  ].join("\n");
}
