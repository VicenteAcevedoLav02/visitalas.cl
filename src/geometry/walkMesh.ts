import {
  mergeColinearSegments,
  pointInFigure,
  ringEdges,
  segmentLength,
} from "./segments";
import type { Point, Polygon, Segment } from "./types";

const EPS = 1e-6;

/** All wall segments to extrude in 3D: outer, holes, internal fusion walls. */
export function collectWallSegments(polygons: Polygon[], internalWalls: Segment[]): Segment[] {
  const edges: Segment[] = [];
  for (const poly of polygons) {
    edges.push(...ringEdges(poly.ring));
    for (const hole of poly.holes ?? []) {
      edges.push(...ringEdges(hole));
    }
  }
  edges.push(...internalWalls);
  // Keep every edge; merge only helps colinear axis pieces. Never drop edges.
  const merged = mergeColinearSegments(edges);
  return merged.filter((s) => segmentLength(s) >= 0.01);
}

function ringCentroid(ring: Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, ring.length);
  return { x: sx / n, y: sy / n };
}

function figureBounds(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly.ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Random point strictly inside solid floor area (not in holes). */
export function randomSpawnInFigures(polygons: Polygon[]): Point | null {
  if (polygons.length === 0) {
    return null;
  }

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const poly = polygons[Math.floor(Math.random() * polygons.length)];
    if (!poly) {
      continue;
    }
    const b = figureBounds(poly);
    const p: Point = {
      x: b.minX + Math.random() * (b.maxX - b.minX),
      y: b.minY + Math.random() * (b.maxY - b.minY),
    };
    if (pointInFigure(p, poly)) {
      return p;
    }
  }

  for (const poly of polygons) {
    const c = ringCentroid(poly.ring);
    if (pointInFigure(c, poly)) {
      return c;
    }
  }

  const first = polygons[0];
  return first ? ringCentroid(first.ring) : null;
}

export function pointInAnyFigure(p: Point, polygons: Polygon[]): boolean {
  return polygons.some((poly) => pointInFigure(p, poly));
}

/** Distance from point to segment (2D). */
function distPointSegment(p: Point, seg: Segment): number {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS * EPS) {
    return Math.hypot(p.x - seg.a.x, p.y - seg.a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2));
  const qx = seg.a.x + t * dx;
  const qy = seg.a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

/** True if a circular footprint can stand at p (indoors, clear of walls). */
export function canStandAt(
  p: Point,
  polygons: Polygon[],
  walls: Segment[],
  radius: number,
): boolean {
  if (!pointInAnyFigure(p, polygons)) {
    return false;
  }
  for (const wall of walls) {
    if (distPointSegment(p, wall) < radius) {
      return false;
    }
  }
  return true;
}

/**
 * Try to move from `from` toward `to` with wall/floor collision.
 * Returns the furthest valid point along the path (simple slide on axes).
 */
export function moveWithCollision(
  from: Point,
  to: Point,
  polygons: Polygon[],
  walls: Segment[],
  radius: number,
): Point {
  if (canStandAt(to, polygons, walls, radius)) {
    return to;
  }
  const alongX: Point = { x: to.x, y: from.y };
  if (canStandAt(alongX, polygons, walls, radius)) {
    return alongX;
  }
  const alongY: Point = { x: from.x, y: to.y };
  if (canStandAt(alongY, polygons, walls, radius)) {
    return alongY;
  }
  // Recover if we started inside a wall clearance zone: allow any indoor step.
  if (!canStandAt(from, polygons, walls, radius) && pointInAnyFigure(to, polygons)) {
    return to;
  }
  return from;
}

/** Nudge a point away from nearby walls so the player can start moving. */
export function clearSpawnFromWalls(
  spawn: Point,
  polygons: Polygon[],
  walls: Segment[],
  radius: number,
): Point {
  if (canStandAt(spawn, polygons, walls, radius)) {
    return spawn;
  }
  const angles = 16;
  for (let dist = radius; dist <= radius * 4; dist += radius * 0.5) {
    for (let i = 0; i < angles; i += 1) {
      const a = (i / angles) * Math.PI * 2;
      const candidate: Point = {
        x: spawn.x + Math.cos(a) * dist,
        y: spawn.y + Math.sin(a) * dist,
      };
      if (canStandAt(candidate, polygons, walls, radius)) {
        return candidate;
      }
    }
  }
  return spawn;
}

/** Bounds of all polygons for minimap framing. */
export function planBounds(polygons: Polygon[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (polygons.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    const b = figureBounds(poly);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}
