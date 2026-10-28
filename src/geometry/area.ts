import type { Point, Polygon } from "./types";

/** Shoelace area in m² (absolute). Ring may be open or closed. */
export function polygonArea(ring: Point[]): number {
  if (ring.length < 3) {
    return 0;
  }

  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (!a || !b) {
      continue;
    }
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function totalArea(polygons: Polygon[]): number {
  return polygons.reduce((acc, poly) => acc + polygonArea(poly.ring), 0);
}
