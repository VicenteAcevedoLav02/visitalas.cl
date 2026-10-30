import type { Segment } from "./types";
import { segmentLength } from "./segments";

/** Round meters for stable wall keys across tiny float drift. */
function roundCoord(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

/**
 * Stable id for a plan wall segment (order-independent endpoints).
 * Used to attach photos across walk sessions for the same geometry.
 */
export function wallIdFromSegment(seg: Segment): string {
  const a = `${roundCoord(seg.a.x)},${roundCoord(seg.a.y)}`;
  const b = `${roundCoord(seg.b.x)},${roundCoord(seg.b.y)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function wallLengthM(seg: Segment): number {
  return segmentLength(seg);
}
