/**
 * Engineering Phase E2A — deterministic retouching on raw interleaved pixel buffers (no image library).
 *
 * scripts/phase-e/packs/photo-derivatives.mjs uses it to remove third-party marks (a rental company's decals, phone
 * number and fleet number; stickers) from licensed photos before cropping. Each removal is one recorded recipe step: a
 * polygon, a fill direction, optional exclusions and an optional grain reference. The same inputs always give the same
 * pixels, so the modification list published with a derivative describes exactly what changed.
 *
 * The fill has three stages:
 *   1. directional interpolation: each pixel inside the polygon blends the clean pixels reached by walking from it along
 *      the fill direction and against it, weighted by distance. Pointing the direction along the surface's own lines
 *      (a panel's length, a roof edge, a boom's plates) carries those lines across the patch;
 *   2. relaxation (optional): Gauss-Seidel over-relaxation towards a membrane (Laplace) fill whose edges match every
 *      clean neighbour. It removes the streaks of stage 1 and matches the surrounding tone on all sides;
 *   3. grain: the high-pass residual of a clean reference rectangle, mirror-tiled so no seams repeat, restores the
 *      sensor noise a smooth fill lacks.
 * A feathered edge then blends the fill into the original. Pixels inside an `exclude` polygon (a decal to keep, a bolt
 * head) are never used as fill sources.
 */

/** Even-odd point-in-polygon at pixel centres, limited to the polygon's bounding box clipped to the image. */
export function rasterizePolygon(polygon, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3) throw new Error("A retouch polygon needs at least 3 points.");
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(height, Math.ceil(Math.max(...ys)));
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const py = y0 + j + 0.5;
    for (let i = 0; i < w; i++) {
      const px = x0 + i + 0.5;
      let inside = false;
      for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
        const [xa, ya] = polygon[a];
        const [xb, yb] = polygon[b];
        if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
      }
      if (inside) mask[j * w + i] = 1;
    }
  }
  return { x0, y0, w, h, mask };
}

/** Membership test for a set of polygons, rasterized once. */
function regionTest(polygons, width, height) {
  const regions = (polygons ?? []).map((polygon) => rasterizePolygon(polygon, width, height));
  return (x, y) =>
    regions.some((r) => x >= r.x0 && y >= r.y0 && x < r.x0 + r.w && y < r.y0 + r.h && r.mask[(y - r.y0) * r.w + (x - r.x0)] === 1);
}

/** Chamfer distance from each masked pixel to the nearest unmasked one (1 on the edge); 0 outside the mask. */
export function insideDistance(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? Infinity : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : d[j * w + i]);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + Math.SQRT2, at(i + 1, j - 1) + Math.SQRT2);
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (!mask[k]) continue;
      d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + Math.SQRT2, at(i - 1, j + 1) + Math.SQRT2);
    }
  }
  return d;
}

/** Index into 0..n-1 by mirroring at both ends (…2 1 0 0 1 2 … n-1 n-1 n-2 …), so tiles meet without a seam. */
export function mirrorIndex(i, n) {
  const m = ((i % (2 * n)) + 2 * n) % (2 * n);
  return m < n ? m : 2 * n - 1 - m;
}

/**
 * High-pass residual (pixel minus a mirrored box blur) of a clean rectangle: the grain a smooth fill lacks. Values
 * beyond 2.5 standard deviations are clipped so one bright speck cannot repeat across the tiling.
 */
export function grainResidual(pixels, { width, height, channels }, [gx, gy, gw, gh], radius = 3) {
  if (gx < 0 || gy < 0 || gw < 1 || gh < 1 || gx + gw > width || gy + gh > height) {
    throw new Error(`Grain rectangle ${[gx, gy, gw, gh].join(",")} is outside the ${width}x${height} image.`);
  }
  const residual = new Float32Array(gw * gh * channels);
  const span = (2 * radius + 1) ** 2;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let v = j - radius; v <= j + radius; v++) {
          for (let u = i - radius; u <= i + radius; u++) {
            sum += pixels[((gy + mirrorIndex(v, gh)) * width + gx + mirrorIndex(u, gw)) * channels + c];
          }
        }
        residual[(j * gw + i) * channels + c] = pixels[((gy + j) * width + gx + i) * channels + c] - sum / span;
      }
    }
  }
  for (let c = 0; c < channels; c++) {
    let sq = 0;
    for (let k = c; k < residual.length; k += channels) sq += residual[k] * residual[k];
    const limit = 2.5 * Math.sqrt(sq / (gw * gh));
    for (let k = c; k < residual.length; k += channels) residual[k] = Math.max(-limit, Math.min(limit, residual[k]));
  }
  return { residual, gx, gy, gw, gh };
}

/**
 * Replace the pixels inside `step.polygon` in place.
 *   angle    fill direction in degrees (0 = left↔right, 90 = up↔down; y grows downwards)
 *   depth    clean pixels averaged beyond each end of the walk (default 5)
 *   spread   parallel lines averaged on each side of the walk (default 2, so 5 lines)
 *   relax    over-relaxation sweeps towards the membrane fill (default 0 = directional only)
 *   exclude  polygons whose pixels must never be used as fill sources
 *   feather  edge blend width in pixels (default 4); the polygon must clear the mark by at least this much
 *   grain    [x, y, w, h] clean rectangle whose high-pass residual is mirror-tiled over the fill
 *   grainRadius  blur radius of that high-pass (default 3: sensor noise; ~10 also carries dust and mottling)
 * Returns { changed, sweeps }.
 */
export function inpaintDirectional(pixels, image, step) {
  const { width, height, channels } = image;
  const { polygon, angle = 0, depth = 5, spread = 2, relax = 0, feather = 4 } = step;
  const { grain = null, grainStrength = 1, grainRadius = 3 } = step;
  const { x0, y0, w, h, mask } = rasterizePolygon(polygon, width, height);
  const excluded = regionTest(step.exclude, width, height);
  const inMask = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && mask[(y - y0) * w + (x - x0)] === 1;
  const isSource = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !inMask(x, y) && !excluded(x, y);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const nx = -dy;
  const ny = dx;
  const maxSteps = 4 * (w + h) + 8;

  const walk = (x, y, sign) => {
    for (let t = 1; t < maxSteps; t++) {
      const fx = x + sign * t * dx;
      const fy = y + sign * t * dy;
      const rx = Math.round(fx);
      const ry = Math.round(fy);
      if (rx < 0 || ry < 0 || rx >= width || ry >= height) return null;
      if (!inMask(rx, ry)) return { t, fx, fy };
    }
    return null;
  };

  const sampleBeyond = (hit, sign) => {
    if (!hit) return null;
    const acc = new Float64Array(channels);
    let n = 0;
    for (let k = 0; k < depth; k++) {
      for (let o = -spread; o <= spread; o++) {
        const x = Math.round(hit.fx + sign * k * dx + o * nx);
        const y = Math.round(hit.fy + sign * k * dy + o * ny);
        if (!isSource(x, y)) continue;
        const base = (y * width + x) * channels;
        for (let c = 0; c < channels; c++) acc[c] += pixels[base + c];
        n++;
      }
    }
    if (n === 0) return null;
    for (let c = 0; c < channels; c++) acc[c] /= n;
    return acc;
  };

  // Stage 1: directional interpolation into a float fill buffer.
  const fill = new Float32Array(w * h * channels);
  const filled = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      const ahead = walk(x0 + i, y0 + j, 1);
      const behind = walk(x0 + i, y0 + j, -1);
      const ca = sampleBeyond(ahead, 1);
      const cb = sampleBeyond(behind, -1);
      if (!ca && !cb) continue;
      const wa = ca && cb ? behind.t / (ahead.t + behind.t) : ca ? 1 : 0;
      for (let c = 0; c < channels; c++) fill[k * channels + c] = (ca ? ca[c] * wa : 0) + (cb ? cb[c] * (1 - wa) : 0);
      filled[k] = 1;
    }
  }

  // Stage 2: over-relaxation towards the membrane fill. Clean neighbours are fixed boundary values; excluded ones are
  // skipped (a free edge), so a kept decal never bleeds in.
  let sweeps = 0;
  if (relax > 0) {
    const omega = 1.85;
    const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (; sweeps < relax; sweeps++) {
      let maxDelta = 0;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = j * w + i;
          if (!mask[k]) continue;
          for (let c = 0; c < channels; c++) {
            let sum = 0;
            let n = 0;
            for (const [oi, oj] of neighbours) {
              const ii = i + oi;
              const jj = j + oj;
              if (ii >= 0 && jj >= 0 && ii < w && jj < h && mask[jj * w + ii]) {
                sum += fill[(jj * w + ii) * channels + c];
                n++;
              } else if (isSource(x0 + ii, y0 + jj)) {
                sum += pixels[((y0 + jj) * width + x0 + ii) * channels + c];
                n++;
              }
            }
            if (n === 0) continue;
            const delta = omega * (sum / n - fill[k * channels + c]);
            fill[k * channels + c] += delta;
            maxDelta = Math.max(maxDelta, Math.abs(delta));
          }
          filled[k] = 1;
        }
      }
      if (maxDelta < 0.02) {
        sweeps++;
        break;
      }
    }
  }

  // Stage 3: grain, then the feathered blend into the original.
  const noise = grain ? grainResidual(pixels, image, grain, grainRadius) : null;
  const dist = insideDistance(mask, w, h);
  let changed = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k] || !filled[k]) continue;
      const x = x0 + i;
      const y = y0 + j;
      const alpha = Math.min(1, dist[k] / feather);
      const base = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        let value = fill[k * channels + c];
        if (noise) {
          const u = mirrorIndex(x - noise.gx, noise.gw);
          const v = mirrorIndex(y - noise.gy, noise.gh);
          value += grainStrength * noise.residual[(v * noise.gw + u) * channels + c];
        }
        const blended = pixels[base + c] * (1 - alpha) + value * alpha;
        pixels[base + c] = Math.max(0, Math.min(255, Math.round(blended)));
      }
      changed++;
    }
  }
  return { changed, sweeps };
}

/** Points on a circle, for round stickers. */
export function circlePolygon(cx, cy, r, points = 48) {
  return Array.from({ length: points }, (_, n) => {
    const a = (2 * Math.PI * n) / points;
    return [Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10];
  });
}
