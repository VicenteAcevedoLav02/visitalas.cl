import type { Point, Rect } from "./types";

/** Base pixels per meter on the workboard grid (zoom = 1). */
export const PX_PER_METER = 40;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 0.1;

/** Ignore accidental tiny drags below this size (meters). */
export const MIN_RECT_METERS = 0.1;

export function clampZoom(zoom: number): number {
  const stepped = Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(stepped.toFixed(2))));
}

export function pixelsPerMeter(zoom: number): number {
  return PX_PER_METER * clampZoom(zoom);
}

export function screenToWorld(
  sx: number,
  sy: number,
  originX: number,
  originY: number,
  zoom = 1,
): Point {
  const ppm = pixelsPerMeter(zoom);
  return {
    x: (sx - originX) / ppm,
    y: (sy - originY) / ppm,
  };
}

export function worldToScreen(
  p: Point,
  originX: number,
  originY: number,
  zoom = 1,
): Point {
  const ppm = pixelsPerMeter(zoom);
  return {
    x: originX + p.x * ppm,
    y: originY + p.y * ppm,
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
