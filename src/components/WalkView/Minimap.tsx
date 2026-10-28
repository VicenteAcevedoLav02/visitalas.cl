import { useEffect, useRef } from "react";
import { planBounds } from "../../geometry/walkMesh";
import type { Point, Polygon, Segment } from "../../geometry/types";
import styles from "./WalkView.module.css";

type MinimapProps = {
  polygons: Polygon[];
  internalWalls: Segment[];
  player: Point;
  yaw: number;
};

/**
 * Player-up minimap: the navigator icon always faces the top of the widget;
 * the floor plan translates/rotates under it.
 */
export function Minimap({ polygons, internalWalls, player, yaw }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const size = 140;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#e8e4dc";
    ctx.fillRect(0, 0, size, size);

    const bounds = planBounds(polygons);
    if (!bounds) {
      return;
    }

    const pad = 12;
    const bw = Math.max(0.01, bounds.maxX - bounds.minX);
    const bh = Math.max(0.01, bounds.maxY - bounds.minY);
    const diag = Math.hypot(bw, bh);
    const scale = Math.min((size - pad * 2) / diag, (size - pad * 2) / Math.max(bw, bh));
    const cx = size / 2;
    const cy = size / 2;
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);

    const toScreen = (p: Point): Point => {
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return {
        x: cx + rx * scale,
        y: cy + ry * scale,
      };
    };

    const strokeRing = (ring: Point[]) => {
      if (ring.length < 3) {
        return;
      }
      ctx.beginPath();
      ring.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) {
          ctx.moveTo(s.x, s.y);
        } else {
          ctx.lineTo(s.x, s.y);
        }
      });
      ctx.closePath();
      ctx.stroke();
    };

    for (const poly of polygons) {
      ctx.beginPath();
      poly.ring.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) {
          ctx.moveTo(s.x, s.y);
        } else {
          ctx.lineTo(s.x, s.y);
        }
      });
      ctx.closePath();
      for (const hole of poly.holes ?? []) {
        hole.forEach((p, i) => {
          const s = toScreen(p);
          if (i === 0) {
            ctx.moveTo(s.x, s.y);
          } else {
            ctx.lineTo(s.x, s.y);
          }
        });
        ctx.closePath();
      }
      ctx.fillStyle = "#ffffff";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (const hole of poly.holes ?? []) {
        strokeRing(hole);
      }
    }

    // Internal fusion walls (same thick lines as 2D workboard)
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const wall of internalWalls) {
      const a = toScreen(wall.a);
      const b = toScreen(wall.b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.fillStyle = "#c45c26";
    ctx.strokeStyle = "#c45c26";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 8);
    ctx.lineTo(cx, cy - 14);
    ctx.lineTo(cx + 4, cy - 8);
    ctx.closePath();
    ctx.fill();
  }, [polygons, internalWalls, player, yaw]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.minimap}
      width={140}
      height={140}
      aria-label="Minimapa de la propiedad"
    />
  );
}
