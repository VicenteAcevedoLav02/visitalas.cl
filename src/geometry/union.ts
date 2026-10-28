import polygonClipping from "polygon-clipping";
import type { Point, Polygon, Rect } from "./types";

/** Expand slightly so exact edge-touch unions merge reliably. */
const EDGE_EPS = 1e-4;

type PcPair = [number, number];
type PcRing = PcPair[];
type PcPolygon = PcRing[];
type PcMulti = PcPolygon[];

function closePcRing(points: Point[]): PcRing {
  const ring: PcRing = points.map((p) => [p.x, p.y] as PcPair);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

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

  const rings: PcPolygon = [closePcRing(poly.ring)];
  for (const hole of poly.holes ?? []) {
    if (hole.length >= 3) {
      rings.push(closePcRing(hole));
    }
  }
  return rings;
}

function pcRingToPoints(ring: PcRing): Point[] {
  return ring.slice(0, -1).map(([x, y]) => ({ x, y }));
}

function pcToPolygons(multi: PcMulti): Polygon[] {
  const result: Polygon[] = [];
  for (const poly of multi) {
    const outer = poly[0];
    if (!outer || outer.length < 4) {
      continue;
    }
    const ring = pcRingToPoints(outer);
    if (ring.length < 3) {
      continue;
    }

    const holes: Point[][] = [];
    for (let i = 1; i < poly.length; i += 1) {
      const holeRing = poly[i];
      if (!holeRing || holeRing.length < 4) {
        continue;
      }
      const hole = pcRingToPoints(holeRing);
      if (hole.length >= 3) {
        holes.push(hole);
      }
    }

    result.push(holes.length > 0 ? { ring, holes } : { ring });
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

/** Subtract a rectangle from the existing figure set (erase). Creates holes when fully inside. */
export function differenceRectFromPolygons(polygons: Polygon[], rect: Rect): Polygon[] {
  if (polygons.length === 0) {
    return [];
  }

  const subject: PcMulti = polygons
    .map(polygonToPc)
    .filter((p) => p.length > 0);

  if (subject.length === 0) {
    return [];
  }

  const clip: PcMulti = [rectToPc(rect, 0)];
  const cut = polygonClipping.difference(subject, clip);
  return pcToPolygons(cut);
}
