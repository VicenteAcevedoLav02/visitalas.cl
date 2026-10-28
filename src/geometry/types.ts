/** Point in world meters (origin = board top-left of working area). */
export type Point = {
  x: number;
  y: number;
};

/** Axis-aligned rectangle in world meters. */
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Closed outer ring: first point equals last, or treated as closed. */
export type Polygon = {
  ring: Point[];
};
