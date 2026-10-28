import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { totalArea } from "../geometry/area";
import { clampZoom, isRectLargeEnough, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "../geometry/coords";
import {
  eraseWallsWithRect,
  findDisappearingWalls,
  openingFromClick,
  openingFromDrag,
  survivingWalls,
  wouldMerge,
} from "../geometry/segments";
import type { Point, Polygon, Rect, Segment } from "../geometry/types";
import { differenceRectFromPolygons, unionRectIntoPolygons } from "../geometry/union";

export type ToolMode = "draw" | "erase";

export type PlanSnapshot = {
  polygons: Polygon[];
  walls: Segment[];
};

export type MergeReview = {
  pendingRect: Rect;
  sharedEdges: Segment[];
  openings: Segment[];
};

export type FloorPlanState = {
  polygons: Polygon[];
  walls: Segment[];
  draftStart: Point | null;
  draftRect: Rect | null;
  toolMode: ToolMode;
  doorWidth: number;
  /** Wall extrusion thickness in meters (3D walk). */
  wallThickness: number;
  zoom: number;
  /** Screen-pixel offset of the drawing surface under the fixed green frame. */
  panX: number;
  panY: number;
  mergeReview: MergeReview | null;
  past: PlanSnapshot[];
  future: PlanSnapshot[];
};

const initialState: FloorPlanState = {
  polygons: [],
  walls: [],
  draftStart: null,
  draftRect: null,
  toolMode: "draw",
  doorWidth: 0.9,
  wallThickness: 0.05,
  zoom: MIN_ZOOM,
  panX: 0,
  panY: 0,
  mergeReview: null,
  past: [],
  future: [],
};

function clonePolygons(polygons: Polygon[]): Polygon[] {
  return polygons.map((poly) => ({
    ring: poly.ring.map((p) => ({ x: p.x, y: p.y })),
    holes: poly.holes?.map((hole) => hole.map((p) => ({ x: p.x, y: p.y }))),
  }));
}

function cloneSegments(segments: Segment[]): Segment[] {
  return segments.map((s) => ({
    a: { x: s.a.x, y: s.a.y },
    b: { x: s.b.x, y: s.b.y },
  }));
}

function cloneSnapshot(polygons: Polygon[], walls: Segment[]): PlanSnapshot {
  return {
    polygons: clonePolygons(polygons),
    walls: cloneSegments(walls),
  };
}

function pushHistory(state: FloorPlanState): void {
  state.past.push(cloneSnapshot(state.polygons, state.walls));
  state.future = [];
}

function polygonsUnchanged(a: Polygon[], b: Polygon[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const floorPlanSlice = createSlice({
  name: "floorPlan",
  initialState,
  reducers: {
    setToolMode(state, action: PayloadAction<ToolMode>) {
      if (state.mergeReview) {
        return;
      }
      state.toolMode = action.payload;
      state.draftStart = null;
      state.draftRect = null;
    },
    setDoorWidth(state, action: PayloadAction<number>) {
      const value = Math.round(Math.max(0, action.payload) * 100) / 100;
      state.doorWidth = value;
    },
    setWallThickness(state, action: PayloadAction<number>) {
      const value = Math.round(Math.max(0, action.payload) * 100) / 100;
      state.wallThickness = value;
    },
    zoomIn(state) {
      state.zoom = clampZoom(state.zoom + ZOOM_STEP);
    },
    zoomOut(state) {
      state.zoom = clampZoom(state.zoom - ZOOM_STEP);
    },
    setZoom(state, action: PayloadAction<number>) {
      state.zoom = clampZoom(action.payload);
    },
    panBy(state, action: PayloadAction<{ dx: number; dy: number }>) {
      state.panX += action.payload.dx;
      state.panY += action.payload.dy;
    },
    setPan(state, action: PayloadAction<{ x: number; y: number }>) {
      state.panX = action.payload.x;
      state.panY = action.payload.y;
    },
    startDraft(state, action: PayloadAction<Point>) {
      if (state.mergeReview) {
        return;
      }
      state.draftStart = action.payload;
      state.draftRect = {
        x: action.payload.x,
        y: action.payload.y,
        width: 0,
        height: 0,
      };
    },
    updateDraft(state, action: PayloadAction<Rect>) {
      if (!state.draftStart || state.mergeReview) {
        return;
      }
      state.draftRect = action.payload;
    },
    commitDraft(state) {
      if (state.mergeReview) {
        return;
      }
      const rect = state.draftRect;
      const mode = state.toolMode;
      state.draftStart = null;
      state.draftRect = null;
      if (!rect || !isRectLargeEnough(rect)) {
        return;
      }

      if (mode === "erase") {
        const nextPolygons = differenceRectFromPolygons(state.polygons, rect);
        const nextWalls = eraseWallsWithRect(state.walls, rect);
        const polygonsSame = polygonsUnchanged(nextPolygons, state.polygons);
        const wallsSame = JSON.stringify(nextWalls) === JSON.stringify(state.walls);
        if (polygonsSame && wallsSame) {
          return;
        }
        pushHistory(state);
        state.polygons = nextPolygons;
        state.walls = nextWalls;
        return;
      }

      // Draw: if merge would happen, enter review instead of applying.
      if (wouldMerge(state.polygons, rect)) {
        const sharedEdges = findDisappearingWalls(state.polygons, rect);
        state.mergeReview = {
          pendingRect: { ...rect },
          sharedEdges: cloneSegments(sharedEdges),
          openings: [],
        };
        return;
      }

      const next = unionRectIntoPolygons(state.polygons, rect);
      if (polygonsUnchanged(next, state.polygons)) {
        return;
      }
      pushHistory(state);
      state.polygons = next;
    },
    cancelDraft(state) {
      state.draftStart = null;
      state.draftRect = null;
    },
    cancelMergeReview(state) {
      state.mergeReview = null;
    },
    addDoorOpening(state, action: PayloadAction<{ wallIndex: number; click: Point }>) {
      const review = state.mergeReview;
      if (!review) {
        return;
      }
      const wall = review.sharedEdges[action.payload.wallIndex];
      if (!wall) {
        return;
      }
      const opening = openingFromClick(wall, action.payload.click, state.doorWidth);
      if (!opening) {
        return;
      }
      review.openings.push(opening);
    },
    addDoorOpeningDrag(
      state,
      action: PayloadAction<{ wallIndex: number; from: Point; to: Point }>,
    ) {
      const review = state.mergeReview;
      if (!review) {
        return;
      }
      const wall = review.sharedEdges[action.payload.wallIndex];
      if (!wall) {
        return;
      }
      const opening = openingFromDrag(wall, action.payload.from, action.payload.to);
      if (!opening) {
        return;
      }
      review.openings.push(opening);
    },
    confirmMergeReview(state) {
      const review = state.mergeReview;
      if (!review) {
        return;
      }
      const nextPolygons = unionRectIntoPolygons(state.polygons, review.pendingRect);
      const keptWalls = survivingWalls(review.sharedEdges, review.openings);

      pushHistory(state);
      state.polygons = nextPolygons;
      state.walls = cloneSegments([...state.walls, ...keptWalls]);
      state.mergeReview = null;
    },
    undo(state) {
      if (state.mergeReview || state.past.length === 0) {
        return;
      }
      state.draftStart = null;
      state.draftRect = null;
      state.future.unshift(cloneSnapshot(state.polygons, state.walls));
      const previous = state.past.pop();
      state.polygons = previous?.polygons ?? [];
      state.walls = previous?.walls ?? [];
    },
    redo(state) {
      if (state.mergeReview || state.future.length === 0) {
        return;
      }
      state.draftStart = null;
      state.draftRect = null;
      state.past.push(cloneSnapshot(state.polygons, state.walls));
      const next = state.future.shift();
      state.polygons = next?.polygons ?? [];
      state.walls = next?.walls ?? [];
    },
  },
});

export const {
  setToolMode,
  setDoorWidth,
  setWallThickness,
  zoomIn,
  zoomOut,
  setZoom,
  panBy,
  setPan,
  startDraft,
  updateDraft,
  commitDraft,
  cancelDraft,
  cancelMergeReview,
  addDoorOpening,
  addDoorOpeningDrag,
  confirmMergeReview,
  undo,
  redo,
} = floorPlanSlice.actions;

export const floorPlanReducer = floorPlanSlice.reducer;

export function selectPolygons(state: { floorPlan: FloorPlanState }): Polygon[] {
  return state.floorPlan.polygons;
}

export function selectWalls(state: { floorPlan: FloorPlanState }): Segment[] {
  return state.floorPlan.walls;
}

export function selectDraftRect(state: { floorPlan: FloorPlanState }): Rect | null {
  return state.floorPlan.draftRect;
}

export function selectToolMode(state: { floorPlan: FloorPlanState }): ToolMode {
  return state.floorPlan.toolMode;
}

export function selectDoorWidth(state: { floorPlan: FloorPlanState }): number {
  return state.floorPlan.doorWidth;
}

export function selectWallThickness(state: { floorPlan: FloorPlanState }): number {
  return state.floorPlan.wallThickness;
}

export function selectZoom(state: { floorPlan: FloorPlanState }): number {
  return state.floorPlan.zoom;
}

export function selectCanZoomIn(state: { floorPlan: FloorPlanState }): boolean {
  return state.floorPlan.zoom < MAX_ZOOM - 1e-9;
}

export function selectCanZoomOut(state: { floorPlan: FloorPlanState }): boolean {
  return state.floorPlan.zoom > MIN_ZOOM + 1e-9;
}

export function selectPan(state: { floorPlan: FloorPlanState }): { x: number; y: number } {
  return { x: state.floorPlan.panX, y: state.floorPlan.panY };
}

export function selectMergeReview(state: { floorPlan: FloorPlanState }): MergeReview | null {
  return state.floorPlan.mergeReview;
}

export function selectTotalAreaM2(state: { floorPlan: FloorPlanState }): number {
  return totalArea(state.floorPlan.polygons);
}

export function selectCanUndo(state: { floorPlan: FloorPlanState }): boolean {
  return !state.floorPlan.mergeReview && state.floorPlan.past.length > 0;
}

export function selectCanRedo(state: { floorPlan: FloorPlanState }): boolean {
  return !state.floorPlan.mergeReview && state.floorPlan.future.length > 0;
}
