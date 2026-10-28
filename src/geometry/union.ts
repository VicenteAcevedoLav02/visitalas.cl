import polygonClipping from "polygon-clipping";
import type { Point, Polygon, Rect } from "./types";

/** Expand slightly so exact edge-touch unions merge reliably. */
const EDGE_EPS = 1e-4;

type PcPair = [number, number];
type PcRing = PcPair[];
type PcPolygon = PcRing[];
type PcMulti = PcPolygon[];

function rectToPc(rect: Rect, expand: number): PcPolygon {
  const x0 = rect.x - expand;
  const y0 = rect.y - expand;
  const x1 = rect.x + rect.width + expand;
  const y1 = rect.y + rect.height + expand;
  const ring: PcRing = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return [ring];
}

function polygonToPc(poly: Polygon): PcPolygon {
  if (poly.ring.length < 3) {
    return [];
  }

  const ring: PcRing = poly.ring.map((p) => [p.x, p.y] as PcPair);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return [ring];
}

function pcToPolygons(multi: PcMulti): Polygon[] {
  const result: Polygon[] = [];
  for (const poly of multi) {
    const outer = poly[0];
    if (!outer || outer.length < 4) {
      continue;
    }
    const ring: Point[] = outer.slice(0, -1).map(([x, y]) => ({ x, y }));
    if (ring.length >= 3) {
      result.push({ ring });
    }
  }
  return result;
}

/**
 * Union a new rectangle into the existing figure set.
 * Edge-adjacent rectangles merge (shared edge disappears).
 */
export function unionRectIntoPolygons(polygons: Polygon[], rect: Rect): Polygon[] {
  if (polygons.length === 0) {
    return [
      {
        ring: [
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width, y: rect.y },
          { x: rect.x + rect.width, y: rect.y + rect.height },
          { x: rect.x, y: rect.y + rect.height },
        ],
      },
    ];
  }

  const subject: PcMulti = polygons
    .map(polygonToPc)
    .filter((p) => p.length > 0);

  const clip: PcMulti = [rectToPc(rect, EDGE_EPS)];
  const merged = polygonClipping.union(subject, clip);
  return pcToPolygons(merged);
}
