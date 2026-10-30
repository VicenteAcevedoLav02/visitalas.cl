import type { Point } from "./types";

/** 3×3 row-major homography matrix. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type Quad = readonly [Point, Point, Point, Point];

/** Unit-square corners: TL, TR, BR, BL. */
export const UNIT_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function applyMat(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  const inv = Math.abs(w) < 1e-12 ? 0 : 1 / w;
  return {
    x: (m[0] * x + m[1] * y + m[2]) * inv,
    y: (m[3] * x + m[4] * y + m[5]) * inv,
  };
}

/** Solve H mapping each `src[i]` → `dst[i]` (projective). */
export function solveHomography(src: Quad, dst: Quad): Mat3 | null {
  // 8×9 system Ah = 0, h9 = 1. Use Gaussian elimination on 8×8.
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) {
        pivot = r;
      }
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) {
      return null;
    }
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let c = col; c <= n; c += 1) {
      M[col]![c]! /= div;
    }
    for (let r = 0; r < n; r += 1) {
      if (r === col) {
        continue;
      }
      const f = M[r]![col]!;
      for (let c = col; c <= n; c += 1) {
        M[r]![c]! -= f * M[col]![c]!;
      }
    }
  }

  const h = M.map((row) => row[n]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invertHomography(m: Mat3): Mat3 | null {
  const [
    a, b, c,
    d, e, f,
    g, h, i,
  ] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) {
    return null;
  }
  const inv = 1 / det;
  return [
    A * inv, D * inv, G * inv,
    B * inv, E * inv, H * inv,
    C * inv, F * inv, I * inv,
  ];
}

/**
 * Warp `image` so UNIT_QUAD maps onto `destCorners` (TL TR BR BL in canvas px).
 * Samples with inverse homography into `dest`.
 */
export function warpImageToQuad(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  destCorners: Quad,
  dest: HTMLCanvasElement | OffscreenCanvas,
): boolean {
  const H = solveHomography(UNIT_QUAD, destCorners);
  if (!H) {
    return false;
  }
  const inv = invertHomography(H);
  if (!inv) {
    return false;
  }

  const w = dest.width;
  const h = dest.height;
  const ctx = dest.getContext("2d");
  if (!ctx) {
    return false;
  }

  // Source pixels via temporary canvas for getImageData reliability.
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = Math.max(1, Math.floor(imageWidth));
  srcCanvas.height = Math.max(1, Math.floor(imageHeight));
  const sctx = srcCanvas.getContext("2d");
  if (!sctx) {
    return false;
  }
  sctx.drawImage(image, 0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const out = ctx.createImageData(w, h);
  const od = out.data;
  const sd = srcData.data;

  const minX = Math.max(0, Math.floor(Math.min(...destCorners.map((p) => p.x)) - 1));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(...destCorners.map((p) => p.x)) + 1));
  const minY = Math.max(0, Math.floor(Math.min(...destCorners.map((p) => p.y)) - 1));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...destCorners.map((p) => p.y)) + 1));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const uv = applyMat(inv, x + 0.5, y + 0.5);
      if (uv.x < -0.01 || uv.x > 1.01 || uv.y < -0.01 || uv.y > 1.01) {
        continue;
      }
      const sx = uv.x * (sw - 1);
      const sy = uv.y * (sh - 1);
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        // Soft edge clamp
        const cx = Math.min(sw - 1, Math.max(0, sx));
        const cy = Math.min(sh - 1, Math.max(0, sy));
        const si = (Math.round(cy) * sw + Math.round(cx)) * 4;
        const di = (y * w + x) * 4;
        od[di] = sd[si]!;
        od[di + 1] = sd[si + 1]!;
        od[di + 2] = sd[si + 2]!;
        od[di + 3] = sd[si + 3]!;
        continue;
      }
      // Bilinear sample
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const di = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const v00 = sd[i00 + c]!;
        const v10 = sd[i10 + c]!;
        const v01 = sd[i01 + c]!;
        const v11 = sd[i11 + c]!;
        od[di + c] = Math.round(
          v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy,
        );
      }
    }
  }

  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(out, 0, 0);
  return true;
}

/** Interactive preview via subdivided triangles (projective corner map). */
export function drawWarpedPreview(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  destCorners: Quad,
  divisions = 16,
): void {
  const H = solveHomography(UNIT_QUAD, destCorners);
  const [tl, tr, br, bl] = destCorners;
  const map = (u: number, v: number): Point => {
    if (H) {
      return applyMat(H, u, v);
    }
    // Fallback bilinear if homography is degenerate.
    const topX = tl.x + (tr.x - tl.x) * u;
    const topY = tl.y + (tr.y - tl.y) * u;
    const botX = bl.x + (br.x - bl.x) * u;
    const botY = bl.y + (br.y - bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  };

  for (let yi = 0; yi < divisions; yi += 1) {
    for (let xi = 0; xi < divisions; xi += 1) {
      const u0 = xi / divisions;
      const v0 = yi / divisions;
      const u1 = (xi + 1) / divisions;
      const v1 = (yi + 1) / divisions;
      const p00 = map(u0, v0);
      const p10 = map(u1, v0);
      const p11 = map(u1, v1);
      const p01 = map(u0, v1);
      const sx0 = u0 * imageWidth;
      const sy0 = v0 * imageHeight;
      const sx1 = u1 * imageWidth;
      const sy1 = v1 * imageHeight;
      drawTexturedTriangle(
        ctx,
        image,
        { x: sx0, y: sy0 },
        { x: sx1, y: sy0 },
        { x: sx1, y: sy1 },
        p00,
        p10,
        p11,
      );
      drawTexturedTriangle(
        ctx,
        image,
        { x: sx0, y: sy0 },
        { x: sx1, y: sy1 },
        { x: sx0, y: sy1 },
        p00,
        p11,
        p01,
      );
    }
  }
}

/** Affine textured triangle (canvas 2d). */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Solve affine: dest = A * src
  const denom =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 1e-8) {
    ctx.restore();
    return;
  }

  const m11 =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const m12 =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const m13 =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  const m21 =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const m22 =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const m23 =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denom;

  ctx.setTransform(m11, m21, m12, m22, m13, m23);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

export function defaultFitCorners(
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number,
): Quad {
  if (imageW <= 0 || imageH <= 0) {
    return [
      { x: 0, y: 0 },
      { x: canvasW, y: 0 },
      { x: canvasW, y: canvasH },
      { x: 0, y: canvasH },
    ];
  }
  const scale = Math.min(canvasW / imageW, canvasH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  const x = (canvasW - w) / 2;
  const y = (canvasH - h) / 2;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Normalize pixel corners to 0–1 relative to canvas size. */
export function cornersToNormalized(corners: Quad, w: number, h: number): Quad {
  const nw = Math.max(w, 1e-6);
  const nh = Math.max(h, 1e-6);
  return [
    { x: corners[0].x / nw, y: corners[0].y / nh },
    { x: corners[1].x / nw, y: corners[1].y / nh },
    { x: corners[2].x / nw, y: corners[2].y / nh },
    { x: corners[3].x / nw, y: corners[3].y / nh },
  ];
}

export function cornersFromNormalized(norm: Quad, w: number, h: number): Quad {
  return [
    { x: norm[0].x * w, y: norm[0].y * h },
    { x: norm[1].x * w, y: norm[1].y * h },
    { x: norm[2].x * w, y: norm[2].y * h },
    { x: norm[3].x * w, y: norm[3].y * h },
  ];
}
