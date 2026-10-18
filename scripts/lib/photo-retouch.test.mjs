import { describe, expect, it } from "vitest";

import { circlePolygon, grainResidual, inpaintDirectional, insideDistance, mirrorIndex, rasterizePolygon } from "./photo-retouch.mjs";

/** A width x height RGB image filled by fn(x, y) -> [r, g, b]. */
function makeImage(width, height, fn) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels.set(fn(x, y), (y * width + x) * 3);
  }
  return { pixels, image: { width, height, channels: 3 } };
}

const at = (pixels, width, x, y) => [...pixels.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];

describe("rasterizePolygon", () => {
  it("covers exactly the pixel centres inside an axis-aligned rectangle, clipped to the image", () => {
    const { x0, y0, w, h, mask } = rasterizePolygon([[2, 3], [6, 3], [6, 5], [2, 5]], 10, 10);
    expect({ x0, y0, w, h }).toEqual({ x0: 2, y0: 3, w: 4, h: 2 });
    expect(mask.reduce((a, b) => a + b, 0)).toBe(8);
    expect(rasterizePolygon([[-5, -5], [3, -5], [3, 3], [-5, 3]], 10, 10).w).toBe(3);
  });

  it("rejects a degenerate polygon", () => {
    expect(() => rasterizePolygon([[0, 0], [1, 1]], 10, 10)).toThrow(/at least 3 points/);
  });
});

describe("insideDistance and mirrorIndex", () => {
  it("measures 1 on the edge of a mask and grows inwards", () => {
    const mask = new Uint8Array(25).fill(1);
    const d = insideDistance(mask, 5, 5);
    expect(d[0]).toBe(1);
    expect(d[12]).toBe(3);
  });

  it("mirrors indices at both ends without repeating a seam", () => {
    expect([-2, -1, 0, 1, 2, 3, 4, 5].map((i) => mirrorIndex(i, 3))).toEqual([1, 0, 0, 1, 2, 2, 1, 0]);
  });
});

describe("grainResidual", () => {
  it("is zero on a flat patch and refuses a rectangle outside the image", () => {
    const { pixels, image } = makeImage(20, 20, () => [40, 50, 60]);
    const { residual } = grainResidual(pixels, image, [2, 2, 10, 10]);
    expect(Math.max(...residual.map(Math.abs))).toBe(0);
    expect(() => grainResidual(pixels, image, [15, 15, 10, 10])).toThrow(/outside/);
  });
});

describe("inpaintDirectional", () => {
  const gradient = (x) => [x * 2, 100, 200 - x];

  it("replaces a decal on a horizontal gradient with the gradient itself", () => {
    const { pixels, image } = makeImage(60, 30, (x, y) => (x >= 20 && x < 40 && y >= 10 && y < 20 ? [255, 255, 0] : gradient(x)));
    const { changed } = inpaintDirectional(pixels, image, { polygon: [[16, 6], [44, 6], [44, 24], [16, 24]], angle: 0, feather: 2 });
    expect(changed).toBe(28 * 18);
    for (const [x, y] of [[25, 12], [30, 15], [38, 18]]) {
      at(pixels, 60, x, y).forEach((v, c) => expect(Math.abs(v - gradient(x)[c])).toBeLessThanOrEqual(2));
    }
  });

  it("never pulls colour from an excluded region, even after relaxation", () => {
    // A white "model decal" sits right above a dark panel with a yellow sticker; the decal is excluded.
    const { pixels, image } = makeImage(40, 40, (x, y) => {
      if (y < 10) return [250, 250, 250];
      if (x >= 12 && x < 28 && y >= 12 && y < 24) return [230, 180, 20];
      return [20, 24, 32];
    });
    inpaintDirectional(pixels, image, {
      polygon: [[8, 10], [32, 10], [32, 28], [8, 28]],
      exclude: [[[0, 0], [40, 0], [40, 10], [0, 10]]],
      angle: 0,
      relax: 300,
      feather: 1,
    });
    for (const [x, y] of [[20, 10], [20, 18], [12, 26]]) {
      at(pixels, 40, x, y).forEach((v, c) => expect(Math.abs(v - [20, 24, 32][c])).toBeLessThanOrEqual(1));
    }
    expect(at(pixels, 40, 20, 5)).toEqual([250, 250, 250]);
  });

  it("is deterministic and leaves pixels outside the polygon untouched", () => {
    const build = () => makeImage(30, 30, (x, y) => [(x * 7 + y * 3) % 256, (x * y) % 256, (x + y) % 256]);
    const a = build();
    const b = build();
    const step = { polygon: circlePolygon(15, 15, 6), angle: 40, relax: 20, grain: [0, 0, 8, 8] };
    inpaintDirectional(a.pixels, a.image, step);
    inpaintDirectional(b.pixels, b.image, step);
    expect(a.pixels.equals(b.pixels)).toBe(true);
    const fresh = build();
    expect(at(a.pixels, 30, 2, 28)).toEqual(at(fresh.pixels, 30, 2, 28));
  });
});
