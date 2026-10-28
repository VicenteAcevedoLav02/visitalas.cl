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

/**
 * Floor figure: outer ring plus optional holes (inner rings).
 * Holes are empty cutouts (e.g. erase a rect inside a larger polygon).
 */
export type Polygon = {
  ring: Point[];
  holes?: Point[][];
};

/** Axis-aligned or general wall/door segment in world meters. */
export type Segment = {
  a: Point;
  b: Point;
};
