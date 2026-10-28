import type { Point, Polygon, Rect, Segment } from "./types";

const EPS = 1e-6;

export function segmentLength(seg: Segment): number {
  return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
}

export function pointsEqual(a: Point, b: Point, eps = EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function closedRing(ring: Point[]): Point[] {
  if (ring.length === 0) {
    return [];
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && pointsEqual(first, last)) {
    return ring.slice(0, -1);
  }
  return ring;
}

export function ringEdges(ring: Point[]): Segment[] {
  const verts = closedRing(ring);
  const edges: Segment[] = [];
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!a || !b || pointsEqual(a, b)) {
      continue;
    }
    edges.push({ a: { ...a }, b: { ...b } });
  }
  return edges;
}

export function rectEdges(rect: Rect): Segment[] {
  return [
    { a: { x: rect.x, y: rect.y }, b: { x: rect.x + rect.width, y: rect.y } },
    {
      a: { x: rect.x + rect.width, y: rect.y },
      b: { x: rect.x + rect.width, y: rect.y + rect.height },
    },
    {
      a: { x: rect.x + rect.width, y: rect.y + rect.height },
      b: { x: rect.x, y: rect.y + rect.height },
    },
    { a: { x: rect.x, y: rect.y + rect.height }, b: { x: rect.x, y: rect.y } },
  ];
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

function isHorizontal(seg: Segment): boolean {
  return almostEqual(seg.a.y, seg.b.y);
}

function isVertical(seg: Segment): boolean {
  return almostEqual(seg.a.x, seg.b.x);
}

function overlap1D(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { lo: number; hi: number } | null {
  const loA = Math.min(a0, a1);
  const hiA = Math.max(a0, a1);
  const loB = Math.min(b0, b1);
  const hiB = Math.max(b0, b1);
  const lo = Math.max(loA, loB);
  const hi = Math.min(hiA, hiB);
  if (hi - lo <= EPS) {
    return null;
  }
  return { lo, hi };
}

export function sharedColinearOverlap(a: Segment, b: Segment): Segment | null {
  if (isHorizontal(a) && isHorizontal(b) && almostEqual(a.a.y, b.a.y)) {
    const y = a.a.y;
    const ov = overlap1D(a.a.x, a.b.x, b.a.x, b.b.x);
    if (!ov) {
      return null;
    }
    return { a: { x: ov.lo, y }, b: { x: ov.hi, y } };
  }
  if (isVertical(a) && isVertical(b) && almostEqual(a.a.x, b.a.x)) {
    const x = a.a.x;
    const ov = overlap1D(a.a.y, a.b.y, b.a.y, b.b.y);
    if (!ov) {
      return null;
    }
    return { a: { x, y: ov.lo }, b: { x, y: ov.hi } };
  }
  return null;
}

/** Snap near-axis edges so floaty boolean-union rings still count as walls. */
export function snapAxisAligned(seg: Segment, tol = 1e-4): Segment {
  if (Math.abs(seg.a.y - seg.b.y) <= tol) {
    const y = (seg.a.y + seg.b.y) / 2;
    return { a: { x: seg.a.x, y }, b: { x: seg.b.x, y } };
  }
  if (Math.abs(seg.a.x - seg.b.x) <= tol) {
    const x = (seg.a.x + seg.b.x) / 2;
    return { a: { x, y: seg.a.y }, b: { x, y: seg.b.y } };
  }
  return { a: { ...seg.a }, b: { ...seg.b } };
}

export function mergeColinearSegments(segments: Segment[]): Segment[] {
  const horizontals: Segment[] = [];
  const verticals: Segment[] = [];
  const others: Segment[] = [];
  for (const raw of segments) {
    if (segmentLength(raw) <= EPS) {
      continue;
    }
    const seg = snapAxisAligned(raw);
    if (isHorizontal(seg)) {
      horizontals.push(seg);
    } else if (isVertical(seg)) {
      verticals.push(seg);
    } else {
      // Keep diagonal / non-axis edges (do not drop them)
      others.push(seg);
    }
  }

  const mergeGroup = (group: Segment[], horizontal: boolean): Segment[] => {
    const byKey = new Map<string, Segment[]>();
    for (const seg of group) {
      const key = horizontal ? seg.a.y.toFixed(6) : seg.a.x.toFixed(6);
      const list = byKey.get(key) ?? [];
      list.push(seg);
      byKey.set(key, list);
    }
    const out: Segment[] = [];
    for (const list of byKey.values()) {
      const intervals = list
        .map((s) =>
          horizontal
            ? { lo: Math.min(s.a.x, s.b.x), hi: Math.max(s.a.x, s.b.x), c: s.a.y }
            : { lo: Math.min(s.a.y, s.b.y), hi: Math.max(s.a.y, s.b.y), c: s.a.x },
        )
        .sort((u, v) => u.lo - v.lo);

      let cur = intervals[0];
      if (!cur) {
        continue;
      }
      for (let i = 1; i < intervals.length; i += 1) {
        const n = intervals[i];
        if (!n) {
          continue;
        }
        if (n.lo <= cur.hi + EPS) {
          cur = { ...cur, hi: Math.max(cur.hi, n.hi) };
        } else {
          out.push(
            horizontal
              ? { a: { x: cur.lo, y: cur.c }, b: { x: cur.hi, y: cur.c } }
              : { a: { x: cur.c, y: cur.lo }, b: { x: cur.c, y: cur.hi } },
          );
          cur = n;
        }
      }
      out.push(
        horizontal
          ? { a: { x: cur.lo, y: cur.c }, b: { x: cur.hi, y: cur.c } }
          : { a: { x: cur.c, y: cur.lo }, b: { x: cur.c, y: cur.hi } },
      );
    }
    return out;
  };

  return [...mergeGroup(horizontals, true), ...mergeGroup(verticals, false), ...others];
}

export function findSharedEdges(polygons: Polygon[], rect: Rect): Segment[] {
  const pending = rectEdges(rect);
  const found: Segment[] = [];
  for (const poly of polygons) {
    for (const edge of ringEdges(poly.ring)) {
      for (const pEdge of pending) {
        const share = sharedColinearOverlap(edge, pEdge);
        if (share) {
          found.push(share);
        }
      }
    }
  }
  return mergeColinearSegments(found).filter((s) => segmentLength(s) >= 0.1);
}

function pointInRect(p: Point, rect: Rect): boolean {
  return (
    p.x > rect.x + EPS &&
    p.x < rect.x + rect.width - EPS &&
    p.y > rect.y + EPS &&
    p.y < rect.y + rect.height - EPS
  );
}

/** Even-odd point in polygon (meters). Boundary counts as inside. */
export function pointInPolygon(p: Point, ring: Point[]): boolean {
  const verts = closedRing(ring);
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i, i += 1) {
    const vi = verts[i];
    const vj = verts[j];
    if (!vi || !vj) {
      continue;
    }
    const intersect =
      vi.y > p.y !== vj.y > p.y &&
      p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y + EPS * EPS) + vi.x;
    if (intersect) {
      inside = !inside;
    }
  }
  // Treat near-boundary as inside for wall detection
  for (const edge of ringEdges(ring)) {
    if (distancePointToSegment(p, edge) <= EPS * 10) {
      return true;
    }
  }
  return inside;
}

/** Inside outer ring and not inside any hole. */
export function pointInFigure(p: Point, poly: Polygon): boolean {
  if (!pointInPolygon(p, poly.ring)) {
    return false;
  }
  for (const hole of poly.holes ?? []) {
    if (pointInPolygon(p, hole)) {
      return false;
    }
  }
  return true;
}

function sampleEdgeInside(
  edge: Segment,
  isInside: (p: Point) => boolean,
): Segment[] {
  const len = segmentLength(edge);
  if (len <= EPS) {
    return [];
  }
  const steps = Math.max(8, Math.ceil(len / 0.05));
  const parts: Segment[] = [];
  let runStart: Point | null = null;
  let prev: Point | null = null;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p: Point = {
      x: edge.a.x + (edge.b.x - edge.a.x) * t,
      y: edge.a.y + (edge.b.y - edge.a.y) * t,
    };
    const inside = isInside(p);
    if (inside && !runStart) {
      runStart = prev ?? p;
    }
    if (!inside && runStart && prev) {
      if (segmentLength({ a: runStart, b: prev }) > EPS) {
        parts.push({ a: { ...runStart }, b: { ...prev } });
      }
      runStart = null;
    }
    prev = p;
  }
  if (runStart && prev && segmentLength({ a: runStart, b: prev }) > EPS) {
    parts.push({ a: { ...runStart }, b: { ...prev } });
  }
  return parts;
}

/**
 * Walls that would disappear on union: shared edges plus edge spans
 * covered by the other figure (area overlap).
 */
export function findDisappearingWalls(polygons: Polygon[], rect: Rect): Segment[] {
  const found: Segment[] = [...findSharedEdges(polygons, rect)];

  for (const pEdge of rectEdges(rect)) {
    for (const poly of polygons) {
      found.push(...sampleEdgeInside(pEdge, (p) => pointInFigure(p, poly)));
    }
  }

  for (const poly of polygons) {
    for (const edge of ringEdges(poly.ring)) {
      found.push(...sampleEdgeInside(edge, (p) => pointInRect(p, rect)));
    }
    for (const hole of poly.holes ?? []) {
      for (const edge of ringEdges(hole)) {
        found.push(...sampleEdgeInside(edge, (p) => pointInRect(p, rect)));
      }
    }
  }

  return mergeColinearSegments(found).filter((s) => segmentLength(s) >= 0.1);
}

export function wouldMerge(polygons: Polygon[], rect: Rect): boolean {
  if (polygons.length === 0) {
    return false;
  }
  if (findSharedEdges(polygons, rect).length > 0) {
    return true;
  }
  for (const poly of polygons) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of closedRing(poly.ring)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const rx1 = rect.x + rect.width;
    const ry1 = rect.y + rect.height;
    if (rect.x >= maxX - EPS || rx1 <= minX + EPS || rect.y >= maxY - EPS || ry1 <= minY + EPS) {
      continue;
    }
    const areaOverlap =
      Math.min(rx1, maxX) - Math.max(rect.x, minX) > EPS &&
      Math.min(ry1, maxY) - Math.max(rect.y, minY) > EPS;
    if (areaOverlap) {
      return true;
    }
  }
  return false;
}

export function projectPointOnSegment(p: Point, seg: Segment): { point: Point; t: number } {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS * EPS) {
    return { point: { ...seg.a }, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2));
  return {
    point: { x: seg.a.x + t * dx, y: seg.a.y + t * dy },
    t,
  };
}

export function distancePointToSegment(p: Point, seg: Segment): number {
  const { point } = projectPointOnSegment(p, seg);
  return Math.hypot(p.x - point.x, p.y - point.y);
}

export function openingFromClick(seg: Segment, click: Point, doorWidth: number): Segment | null {
  const width = Math.max(0, doorWidth);
  if (width <= EPS || segmentLength(seg) <= EPS) {
    return null;
  }
  const { t } = projectPointOnSegment(click, seg);
  const len = segmentLength(seg);
  const half = width / 2;
  let lo = t * len - half;
  let hi = t * len + half;
  if (hi - lo > len) {
    lo = 0;
    hi = len;
  } else {
    if (lo < 0) {
      hi -= lo;
      lo = 0;
    }
    if (hi > len) {
      lo -= hi - len;
      hi = len;
    }
    lo = Math.max(0, lo);
    hi = Math.min(len, hi);
  }
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  return {
    a: { x: seg.a.x + ux * lo, y: seg.a.y + uy * lo },
    b: { x: seg.a.x + ux * hi, y: seg.a.y + uy * hi },
  };
}

export function openingFromDrag(seg: Segment, from: Point, to: Point): Segment | null {
  const len = segmentLength(seg);
  if (len <= EPS) {
    return null;
  }
  const t0 = projectPointOnSegment(from, seg).t;
  const t1 = projectPointOnSegment(to, seg).t;
  const loT = Math.min(t0, t1);
  const hiT = Math.max(t0, t1);
  if ((hiT - loT) * len <= EPS) {
    return null;
  }
  return {
    a: {
      x: seg.a.x + (seg.b.x - seg.a.x) * loT,
      y: seg.a.y + (seg.b.y - seg.a.y) * loT,
    },
    b: {
      x: seg.a.x + (seg.b.x - seg.a.x) * hiT,
      y: seg.a.y + (seg.b.y - seg.a.y) * hiT,
    },
  };
}

export function subtractOpeningsFromWall(wall: Segment, openings: Segment[]): Segment[] {
  if (!isHorizontal(wall) && !isVertical(wall)) {
    return [wall];
  }
  const horizontal = isHorizontal(wall);
  const c = horizontal ? wall.a.y : wall.a.x;
  const lo = horizontal ? Math.min(wall.a.x, wall.b.x) : Math.min(wall.a.y, wall.b.y);
  const hi = horizontal ? Math.max(wall.a.x, wall.b.x) : Math.max(wall.a.y, wall.b.y);

  const cuts = openings
    .filter((o) => {
      if (horizontal) {
        return isHorizontal(o) && almostEqual(o.a.y, c);
      }
      return isVertical(o) && almostEqual(o.a.x, c);
    })
    .map((o) =>
      horizontal
        ? { lo: Math.min(o.a.x, o.b.x), hi: Math.max(o.a.x, o.b.x) }
        : { lo: Math.min(o.a.y, o.b.y), hi: Math.max(o.a.y, o.b.y) },
    )
    .map((iv) => ({
      lo: Math.max(lo, iv.lo),
      hi: Math.min(hi, iv.hi),
    }))
    .filter((iv) => iv.hi - iv.lo > EPS)
    .sort((a, b) => a.lo - b.lo);

  const mergedCuts: { lo: number; hi: number }[] = [];
  for (const cut of cuts) {
    const last = mergedCuts[mergedCuts.length - 1];
    if (last && cut.lo <= last.hi + EPS) {
      last.hi = Math.max(last.hi, cut.hi);
    } else {
      mergedCuts.push({ ...cut });
    }
  }

  const survivors: Segment[] = [];
  let cursor = lo;
  for (const cut of mergedCuts) {
    if (cut.lo - cursor > EPS) {
      survivors.push(
        horizontal
          ? { a: { x: cursor, y: c }, b: { x: cut.lo, y: c } }
          : { a: { x: c, y: cursor }, b: { x: c, y: cut.lo } },
      );
    }
    cursor = Math.max(cursor, cut.hi);
  }
  if (hi - cursor > EPS) {
    survivors.push(
      horizontal
        ? { a: { x: cursor, y: c }, b: { x: hi, y: c } }
        : { a: { x: c, y: cursor }, b: { x: c, y: hi } },
    );
  }
  return survivors;
}

export function survivingWalls(sharedEdges: Segment[], openings: Segment[]): Segment[] {
  const parts: Segment[] = [];
  for (const wall of sharedEdges) {
    parts.push(...subtractOpeningsFromWall(wall, openings));
  }
  return mergeColinearSegments(parts);
}

/**
 * Cut fusion/internal walls where they cross an erase rectangle.
 * Axis-aligned walls only (same as the rest of the floor-plan POC).
 */
export function eraseWallsWithRect(walls: Segment[], rect: Rect): Segment[] {
  const rx0 = rect.x;
  const ry0 = rect.y;
  const rx1 = rect.x + rect.width;
  const ry1 = rect.y + rect.height;
  const parts: Segment[] = [];

  for (const wall of walls) {
    if (isHorizontal(wall)) {
      const y = wall.a.y;
      if (y < ry0 - EPS || y > ry1 + EPS) {
        parts.push(wall);
        continue;
      }
      const ov = overlap1D(wall.a.x, wall.b.x, rx0, rx1);
      if (!ov) {
        parts.push(wall);
        continue;
      }
      parts.push(
        ...subtractOpeningsFromWall(wall, [
          { a: { x: ov.lo, y }, b: { x: ov.hi, y } },
        ]),
      );
      continue;
    }

    if (isVertical(wall)) {
      const x = wall.a.x;
      if (x < rx0 - EPS || x > rx1 + EPS) {
        parts.push(wall);
        continue;
      }
      const ov = overlap1D(wall.a.y, wall.b.y, ry0, ry1);
      if (!ov) {
        parts.push(wall);
        continue;
      }
      parts.push(
        ...subtractOpeningsFromWall(wall, [
          { a: { x, y: ov.lo }, b: { x, y: ov.hi } },
        ]),
      );
      continue;
    }

    parts.push(wall);
  }

  return mergeColinearSegments(parts).filter((s) => segmentLength(s) >= 0.1);
}

export function findNearestSegment(
  point: Point,
  segments: Segment[],
  maxDist: number,
): { segment: Segment; index: number } | null {
  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }
    const dist = distancePointToSegment(point, segment);
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) {
    return null;
  }
  const segment = segments[bestIndex];
  if (!segment) {
    return null;
  }
  return { segment, index: bestIndex };
}
