import { useEffect, useRef } from "react";
import {
  normalizeRect,
  PX_PER_METER,
  screenToWorld,
  worldToScreen,
} from "../../geometry/coords";
import type { Point, Polygon, Rect } from "../../geometry/types";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  commitDraft,
  selectDraftRect,
  selectPolygons,
  startDraft,
  updateDraft,
} from "../../store/floorPlanSlice";
import { Hud } from "../Hud/Hud";
import styles from "./Workboard.module.css";

const BOARD_PAD_PX = 48;

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
): void {
  const step = PX_PER_METER;
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = 1;

  const startX = originX % step;
  const startY = originY % step;

  for (let x = startX; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = startY; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Polygon,
  originX: number,
  originY: number,
): void {
  if (polygon.ring.length < 3) {
    return;
  }
  ctx.beginPath();
  polygon.ring.forEach((p, i) => {
    const s = worldToScreen(p, originX, originY);
    if (i === 0) {
      ctx.moveTo(s.x, s.y);
    } else {
      ctx.lineTo(s.x, s.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawDraftRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  originX: number,
  originY: number,
): void {
  const tl = worldToScreen({ x: rect.x, y: rect.y }, originX, originY);
  const w = rect.width * PX_PER_METER;
  const h = rect.height * PX_PER_METER;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.fillRect(tl.x, tl.y, w, h);
  ctx.strokeRect(tl.x, tl.y, w, h);
  ctx.restore();
}

function paint(
  canvas: HTMLCanvasElement,
  polygons: Polygon[],
  draft: Rect | null,
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

  const originX = BOARD_PAD_PX;
  const originY = BOARD_PAD_PX;
  const surfaceW = Math.max(0, width - BOARD_PAD_PX * 2);
  const surfaceH = Math.max(0, height - BOARD_PAD_PX * 2);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#e8e4dc";
  ctx.fillRect(originX, originY, surfaceW, surfaceH);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(originX + 0.5, originY + 0.5, surfaceW - 1, surfaceH - 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, surfaceW, surfaceH);
  ctx.clip();
  drawGrid(ctx, width, height, originX, originY);

  for (const poly of polygons) {
    drawPolygon(ctx, poly, originX, originY);
  }
  if (draft) {
    drawDraftRect(ctx, draft, originX, originY);
  }
  ctx.restore();
}

function eventToWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const bounds = canvas.getBoundingClientRect();
  const sx = clientX - bounds.left;
  const sy = clientY - bounds.top;
  return screenToWorld(sx, sy, BOARD_PAD_PX, BOARD_PAD_PX);
}

export function Workboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const draftStartRef = useRef<Point | null>(null);
  const dispatch = useAppDispatch();
  const polygons = useAppSelector(selectPolygons);
  const draftRect = useAppSelector(selectDraftRect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const redraw = () => {
      paint(canvas, polygons, draftRect);
    };

    redraw();

    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
  }, [polygons, draftRect]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || !canvasRef.current || !draftStartRef.current) {
        return;
      }
      const end = eventToWorld(canvasRef.current, e.clientX, e.clientY);
      dispatch(updateDraft(normalizeRect(draftStartRef.current, end)));
    };

    const onPointerUp = () => {
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
  }, [dispatch]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const world = eventToWorld(canvas, e.clientX, e.clientY);
    draftStartRef.current = world;
    draggingRef.current = true;
    dispatch(startDraft(world));
    canvas.setPointerCapture(e.pointerId);
  };

  return (
    <div className={styles.root}>
      <Hud />
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        aria-label="Mesa de trabajo del plano"
      />
    </div>
  );
}
