import type { Point, Rect } from "./types";

/** Pixels per meter on the workboard grid. */
export const PX_PER_METER = 40;

/** Ignore accidental tiny drags below this size (meters). */
export const MIN_RECT_METERS = 0.1;

export function screenToWorld(sx: number, sy: number, originX: number, originY: number): Point {
  return {
    x: (sx - originX) / PX_PER_METER,
    y: (sy - originY) / PX_PER_METER,
  };
}

export function worldToScreen(p: Point, originX: number, originY: number): Point {
  return {
    x: originX + p.x * PX_PER_METER,
    y: originY + p.y * PX_PER_METER,
  };
}

export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return { x, y, width, height };
}

export function isRectLargeEnough(rect: Rect): boolean {
  return rect.width >= MIN_RECT_METERS && rect.height >= MIN_RECT_METERS;
}
