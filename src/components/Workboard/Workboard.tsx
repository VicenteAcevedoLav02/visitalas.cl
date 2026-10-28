import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  normalizeRect,
  pixelsPerMeter,
  screenToWorld,
  worldToScreen,
} from "../../geometry/coords";
import {
  findNearestSegment,
  openingFromDrag,
  segmentLength,
  survivingWalls,
} from "../../geometry/segments";
import type { Point, Polygon, Rect, Segment } from "../../geometry/types";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  addDoorOpening,
  addDoorOpeningDrag,
  commitDraft,
  panBy,
  selectDraftRect,
  selectMergeReview,
  selectPan,
  selectPolygons,
  selectToolMode,
  selectWalls,
  selectZoom,
  startDraft,
  updateDraft,
  type MergeReview,
  type ToolMode,
} from "../../store/floorPlanSlice";
import { beginWalk } from "../../store/walkSlice";
import { Hud } from "../Hud/Hud";
import { MergeBanner } from "../MergeBanner/MergeBanner";
import styles from "./Workboard.module.css";

const BOARD_PAD_PX = 56;
const LABEL_OFFSET_PX = 12;
const MIN_LABEL_METERS = 0.05;
const WALL_HIT_METERS = 0.55;
const DRAG_THRESHOLD_METERS = 0.08;

function formatMeters(m: number): string {
  return `${m.toLocaleString("es-CL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: m % 1 === 0 ? 0 : 1,
  })} m`;
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

function closedRing(ring: Point[]): Point[] {
  if (ring.length === 0) {
    return [];
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) {
    return ring.slice(0, -1);
  }
  return ring;
}

function drawBoardGrid(
  ctx: CanvasRenderingContext2D,
  viewport: { left: number; top: number; right: number; bottom: number },
  originX: number,
  originY: number,
  zoom: number,
): void {
  const step = pixelsPerMeter(zoom);
  const tickStep = step * 0.1;
  // Tick spans 0.1 m total: 0.05 m each side of the grid line
  const tickHalf = step * 0.05;

  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = 1;

  const startX =
    originX + Math.floor((viewport.left - originX) / step) * step;
  const startY =
    originY + Math.floor((viewport.top - originY) / step) * step;

  // 1 m major lines
  for (let x = startX; x <= viewport.right + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, viewport.top);
    ctx.lineTo(x + 0.5, viewport.bottom);
    ctx.stroke();
  }
  for (let y = startY; y <= viewport.bottom + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(viewport.left, y + 0.5);
    ctx.lineTo(viewport.right, y + 0.5);
    ctx.stroke();
  }

  // 0.1 m tick marks on major lines (not full grid lines)
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 1;

  for (let x = startX; x <= viewport.right + step; x += step) {
    const tickStartY =
      originY + Math.floor((viewport.top - originY) / tickStep) * tickStep;
    for (let y = tickStartY; y <= viewport.bottom + tickStep; y += tickStep) {
      const along = (y - originY) / step;
      const frac = along - Math.floor(along + 1e-9);
      if (frac < 1e-6 || frac > 1 - 1e-6) {
        continue; // skip 1 m crossings
      }
      ctx.beginPath();
      ctx.moveTo(x - tickHalf + 0.5, y + 0.5);
      ctx.lineTo(x + tickHalf + 0.5, y + 0.5);
      ctx.stroke();
    }
  }

  for (let y = startY; y <= viewport.bottom + step; y += step) {
    const tickStartX =
      originX + Math.floor((viewport.left - originX) / tickStep) * tickStep;
    for (let x = tickStartX; x <= viewport.right + tickStep; x += tickStep) {
      const along = (x - originX) / step;
      const frac = along - Math.floor(along + 1e-9);
      if (frac < 1e-6 || frac > 1 - 1e-6) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y - tickHalf + 0.5);
      ctx.lineTo(x + 0.5, y + tickHalf + 0.5);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function pathFromRing(
  ctx: CanvasRenderingContext2D,
  ring: Point[],
  originX: number,
  originY: number,
  zoom: number,
): void {
  ring.forEach((p, i) => {
    const s = worldToScreen(p, originX, originY, zoom);
    if (i === 0) {
      ctx.moveTo(s.x, s.y);
    } else {
      ctx.lineTo(s.x, s.y);
    }
  });
  ctx.closePath();
}

function drawDottedGridInClip(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  zoom: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  const step = pixelsPerMeter(zoom);
  const pad = 1;
  const left = Math.floor((bounds.minX - pad - originX) / step) * step + originX;
  const top = Math.floor((bounds.minY - pad - originY) / step) * step + originY;
  const right = bounds.maxX + pad;
  const bottom = bounds.maxY + pad;

  ctx.save();
  ctx.strokeStyle = "#c8c8c8";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);

  for (let x = left; x <= right; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, top);
    ctx.lineTo(x + 0.5, bottom);
    ctx.stroke();
  }
  for (let y = top; y <= bottom; y += step) {
    ctx.beginPath();
    ctx.moveTo(left, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function screenBoundsForRing(
  ring: Point[],
  originX: number,
  originY: number,
  zoom: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    const s = worldToScreen(p, originX, originY, zoom);
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }
  return { minX, minY, maxX, maxY };
}

function drawFilledShapeWithInnerGrid(
  ctx: CanvasRenderingContext2D,
  ring: Point[],
  originX: number,
  originY: number,
  zoom: number,
  options: {
    fillStyle?: string;
    strokeStyle?: string;
    dashedStroke?: boolean;
    showInnerGrid?: boolean;
    holes?: Point[][];
  },
): void {
  if (ring.length < 3) {
    return;
  }

  const holes = (options.holes ?? []).filter((h) => h.length >= 3);
  const bounds = screenBoundsForRing(ring, originX, originY, zoom);

  ctx.beginPath();
  pathFromRing(ctx, ring, originX, originY, zoom);
  for (const hole of holes) {
    pathFromRing(ctx, hole, originX, originY, zoom);
  }
  ctx.fillStyle = options.fillStyle ?? "#ffffff";
  ctx.fill("evenodd");

  if (options.showInnerGrid !== false) {
    ctx.save();
    ctx.beginPath();
    pathFromRing(ctx, ring, originX, originY, zoom);
    for (const hole of holes) {
      pathFromRing(ctx, hole, originX, originY, zoom);
    }
    ctx.clip("evenodd");
    drawDottedGridInClip(ctx, originX, originY, zoom, bounds);
    ctx.restore();
  }

  ctx.strokeStyle = options.strokeStyle ?? "#0a0a0a";
  ctx.lineWidth = 2;
  if (options.dashedStroke) {
    ctx.setLineDash([6, 4]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  pathFromRing(ctx, ring, originX, originY, zoom);
  ctx.stroke();
  for (const hole of holes) {
    ctx.beginPath();
    pathFromRing(ctx, hole, originX, originY, zoom);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawEdgeLengthLabels(
  ctx: CanvasRenderingContext2D,
  ring: Point[],
  originX: number,
  originY: number,
  zoom: number,
): void {
  const verts = closedRing(ring);
  if (verts.length < 2) {
    return;
  }

  const centroid = ringCentroid(verts);

  ctx.save();
  ctx.font = '600 11px "Segoe UI", "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1a1a1a";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 3;

  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!a || !b) {
      continue;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthM = Math.hypot(dx, dy);
    if (lengthM < MIN_LABEL_METERS) {
      continue;
    }

    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const midScreen = worldToScreen(mid, originX, originY, zoom);

    let nx = -dy;
    let ny = dx;
    const nLen = Math.hypot(nx, ny) || 1;
    nx /= nLen;
    ny /= nLen;

    const toCentroidX = centroid.x - mid.x;
    const toCentroidY = centroid.y - mid.y;
    if (nx * toCentroidX + ny * toCentroidY > 0) {
      nx = -nx;
      ny = -ny;
    }

    const horizontal = Math.abs(dy) < Math.abs(dx) * 0.15;
    const vertical = Math.abs(dx) < Math.abs(dy) * 0.15;
    let labelX = midScreen.x;
    let labelY = midScreen.y;
    if (horizontal) {
      labelY += (ny >= 0 ? 1 : -1) * LABEL_OFFSET_PX;
    } else if (vertical) {
      labelX += (nx >= 0 ? 1 : -1) * LABEL_OFFSET_PX;
    } else {
      labelX += nx * LABEL_OFFSET_PX;
      labelY += ny * LABEL_OFFSET_PX;
    }

    const text = formatMeters(lengthM);
    ctx.strokeText(text, labelX, labelY);
    ctx.fillText(text, labelX, labelY);
  }

  ctx.restore();
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  originX: number,
  originY: number,
  zoom: number,
  style: { color: string; width: number; dash?: number[] },
): void {
  const a = worldToScreen(seg.a, originX, originY, zoom);
  const b = worldToScreen(seg.b, originX, originY, zoom);
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  if (style.dash) {
    ctx.setLineDash(style.dash);
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawSegmentLabel(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  originX: number,
  originY: number,
  zoom: number,
  color: string,
): void {
  const len = segmentLength(seg);
  if (len < MIN_LABEL_METERS) {
    return;
  }
  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  const midScreen = worldToScreen(mid, originX, originY, zoom);
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const horizontal = Math.abs(dy) < Math.abs(dx) * 0.15;
  const labelX = midScreen.x + (horizontal ? 0 : LABEL_OFFSET_PX);
  const labelY = midScreen.y + (horizontal ? -LABEL_OFFSET_PX : 0);

  ctx.save();
  ctx.font = '700 11px "Segoe UI", "Helvetica Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.fillStyle = color;
  const text = formatMeters(len);
  ctx.strokeText(text, labelX, labelY);
  ctx.fillText(text, labelX, labelY);
  ctx.restore();
}

function rectToRing(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Polygon,
  originX: number,
  originY: number,
  zoom: number,
): void {
  drawFilledShapeWithInnerGrid(ctx, polygon.ring, originX, originY, zoom, {
    holes: polygon.holes,
  });
  drawEdgeLengthLabels(ctx, polygon.ring, originX, originY, zoom);
  for (const hole of polygon.holes ?? []) {
    drawEdgeLengthLabels(ctx, hole, originX, originY, zoom);
  }
}

function drawDraftRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  originX: number,
  originY: number,
  zoom: number,
  toolMode: ToolMode,
): void {
  if (rect.width < MIN_LABEL_METERS && rect.height < MIN_LABEL_METERS) {
    return;
  }
  const ring = rectToRing(rect);
  const erase = toolMode === "erase";
  drawFilledShapeWithInnerGrid(ctx, ring, originX, originY, zoom, {
    fillStyle: erase ? "rgba(180, 40, 40, 0.28)" : "rgba(255, 255, 255, 0.72)",
    strokeStyle: erase ? "#7a1515" : "#0a0a0a",
    dashedStroke: true,
    showInnerGrid: !erase,
  });
  drawEdgeLengthLabels(ctx, ring, originX, originY, zoom);
}

function drawMergeReview(
  ctx: CanvasRenderingContext2D,
  review: MergeReview,
  originX: number,
  originY: number,
  zoom: number,
  draftOpening: Segment | null,
): void {
  const ring = rectToRing(review.pendingRect);
  drawFilledShapeWithInnerGrid(ctx, ring, originX, originY, zoom, {
    fillStyle: "rgba(255, 255, 255, 0.55)",
    strokeStyle: "#0f2a1c",
    dashedStroke: true,
  });

  const openings = draftOpening ? [...review.openings, draftOpening] : review.openings;
  const remaining = survivingWalls(review.sharedEdges, openings);

  for (const wall of review.sharedEdges) {
    drawSegment(ctx, wall, originX, originY, zoom, {
      color: "#c45c26",
      width: 5,
      dash: [8, 5],
    });
    drawSegmentLabel(ctx, wall, originX, originY, zoom, "#8a3a12");
  }

  for (const opening of openings) {
    drawSegment(ctx, opening, originX, originY, zoom, {
      color: "#d62828",
      width: 7,
    });
  }

  for (const wall of remaining) {
    drawSegment(ctx, wall, originX, originY, zoom, {
      color: "#0a0a0a",
      width: 4,
    });
  }
}

function drawCommittedWalls(
  ctx: CanvasRenderingContext2D,
  walls: Segment[],
  originX: number,
  originY: number,
  zoom: number,
): void {
  for (const wall of walls) {
    drawSegment(ctx, wall, originX, originY, zoom, {
      color: "#0a0a0a",
      width: 4,
    });
  }
}

function paint(
  canvas: HTMLCanvasElement,
  polygons: Polygon[],
  walls: Segment[],
  draft: Rect | null,
  toolMode: ToolMode,
  review: MergeReview | null,
  draftOpening: Segment | null,
  zoom: number,
  pan: { x: number; y: number },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Fixed viewport window (white sheet) under the green frame
  const viewLeft = BOARD_PAD_PX;
  const viewTop = BOARD_PAD_PX;
  const surfaceW = Math.max(0, width - BOARD_PAD_PX * 2);
  const surfaceH = Math.max(0, height - BOARD_PAD_PX * 2);
  const viewRight = viewLeft + surfaceW;
  const viewBottom = viewTop + surfaceH;

  // Sliding content origin behind that window
  const originX = viewLeft + pan.x;
  const originY = viewTop + pan.y;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(viewLeft, viewTop, surfaceW, surfaceH);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(viewLeft + 0.5, viewTop + 0.5, surfaceW - 1, surfaceH - 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewLeft, viewTop, surfaceW, surfaceH);
  ctx.clip();
  drawBoardGrid(
    ctx,
    { left: viewLeft, top: viewTop, right: viewRight, bottom: viewBottom },
    originX,
    originY,
    zoom,
  );

  for (const poly of polygons) {
    drawPolygon(ctx, poly, originX, originY, zoom);
  }
  drawCommittedWalls(ctx, walls, originX, originY, zoom);

  if (review) {
    drawMergeReview(ctx, review, originX, originY, zoom, draftOpening);
  } else if (draft) {
    drawDraftRect(ctx, draft, originX, originY, zoom, toolMode);
  }
  ctx.restore();
}

function eventToWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom: number,
  pan: { x: number; y: number },
): Point {
  const bounds = canvas.getBoundingClientRect();
  const sx = clientX - bounds.left;
  const sy = clientY - bounds.top;
  return screenToWorld(sx, sy, BOARD_PAD_PX + pan.x, BOARD_PAD_PX + pan.y, zoom);
}

type DoorDrag = {
  wallIndex: number;
  from: Point;
};

type PanDrag = {
  lastX: number;
  lastY: number;
};

export function Workboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const draftStartRef = useRef<Point | null>(null);
  const doorDragRef = useRef<DoorDrag | null>(null);
  const panDragRef = useRef<PanDrag | null>(null);
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [draftOpening, setDraftOpening] = useState<Segment | null>(null);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const polygons = useAppSelector(selectPolygons);
  const walls = useAppSelector(selectWalls);
  const draftRect = useAppSelector(selectDraftRect);
  const toolMode = useAppSelector(selectToolMode);
  const mergeReview = useAppSelector(selectMergeReview);
  const zoom = useAppSelector(selectZoom);
  const pan = useAppSelector(selectPan);
  const canEnter3d = polygons.length > 0 && !mergeReview;

  const goTo3d = () => {
    if (!canEnter3d) {
      return;
    }
    dispatch(beginWalk({ polygons }));
    navigate("/recorrido");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") {
        return;
      }
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const redraw = () => {
      paint(
        canvas,
        polygons,
        walls,
        draftRect,
        toolMode,
        mergeReview,
        draftOpening,
        zoom,
        pan,
      );
    };

    redraw();

    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
  }, [polygons, walls, draftRect, toolMode, mergeReview, draftOpening, zoom, pan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dispatch(
        panBy({
          dx: -e.deltaX,
          dy: -e.deltaY,
        }),
      );
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [dispatch]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      if (panDragRef.current) {
        const dx = e.clientX - panDragRef.current.lastX;
        const dy = e.clientY - panDragRef.current.lastY;
        panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
        dispatch(panBy({ dx, dy }));
        return;
      }

      if (doorDragRef.current && mergeReview) {
        const wall = mergeReview.sharedEdges[doorDragRef.current.wallIndex];
        if (!wall) {
          return;
        }
        const to = eventToWorld(canvas, e.clientX, e.clientY, zoom, pan);
        const from = doorDragRef.current.from;
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        if (dist >= DRAG_THRESHOLD_METERS) {
          setDraftOpening(openingFromDrag(wall, from, to));
        }
        return;
      }

      if (!draggingRef.current || !draftStartRef.current || mergeReview) {
        return;
      }
      const end = eventToWorld(canvas, e.clientX, e.clientY, zoom, pan);
      dispatch(updateDraft(normalizeRect(draftStartRef.current, end)));
    };

    const onPointerUp = (e: PointerEvent) => {
      const canvas = canvasRef.current;

      if (panDragRef.current) {
        panDragRef.current = null;
        return;
      }

      if (doorDragRef.current && mergeReview && canvas) {
        const drag = doorDragRef.current;
        const to = eventToWorld(canvas, e.clientX, e.clientY, zoom, pan);
        const dist = Math.hypot(to.x - drag.from.x, to.y - drag.from.y);
        doorDragRef.current = null;
        setDraftOpening(null);

        if (dist < DRAG_THRESHOLD_METERS) {
          dispatch(
            addDoorOpening({
              wallIndex: drag.wallIndex,
              click: drag.from,
            }),
          );
        } else {
          dispatch(
            addDoorOpeningDrag({
              wallIndex: drag.wallIndex,
              from: drag.from,
              to,
            }),
          );
        }
        return;
      }

      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      draftStartRef.current = null;
      dispatch(commitDraft());
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dispatch, mergeReview, zoom, pan]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const wantsPan =
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && spaceHeldRef.current);

    if (wantsPan) {
      e.preventDefault();
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) {
      return;
    }

    const world = eventToWorld(canvas, e.clientX, e.clientY, zoom, pan);

    if (mergeReview) {
      const hit = findNearestSegment(world, mergeReview.sharedEdges, WALL_HIT_METERS);
      if (!hit) {
        return;
      }
      doorDragRef.current = { wallIndex: hit.index, from: world };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    draftStartRef.current = world;
    draggingRef.current = true;
    dispatch(startDraft(world));
    canvas.setPointerCapture(e.pointerId);
  };

  const canvasClass = [
    styles.canvas,
    toolMode === "erase" ? styles.canvasErase : "",
    mergeReview ? styles.canvasDoor : "",
    spaceHeld ? styles.canvasPan : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.root}>
      <MergeBanner />
      <Hud />
      <canvas
        ref={canvasRef}
        className={canvasClass}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Mesa de trabajo del plano"
      />
      <p className={styles.scaleHint}>
        Cada línea de la cuadrícula = 1 metro · Desliza la mesa (rueda, clic medio o Espacio+arrastrar)
      </p>
      <button
        type="button"
        className={styles.to3dBtn}
        disabled={!canEnter3d}
        onClick={goTo3d}
      >
        Ver en 3D
      </button>
    </div>
  );
}
