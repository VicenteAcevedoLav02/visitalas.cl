import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { totalArea } from "../geometry/area";
import { isRectLargeEnough } from "../geometry/coords";
import type { Point, Polygon, Rect } from "../geometry/types";
import { unionRectIntoPolygons } from "../geometry/union";

export type FloorPlanState = {
  polygons: Polygon[];
  draftStart: Point | null;
  draftRect: Rect | null;
};

const initialState: FloorPlanState = {
  polygons: [],
  draftStart: null,
  draftRect: null,
};

const floorPlanSlice = createSlice({
  name: "floorPlan",
  initialState,
  reducers: {
    startDraft(state, action: PayloadAction<Point>) {
      state.draftStart = action.payload;
      state.draftRect = {
        x: action.payload.x,
        y: action.payload.y,
        width: 0,
        height: 0,
      };
    },
    updateDraft(state, action: PayloadAction<Rect>) {
      if (!state.draftStart) {
        return;
      }
      state.draftRect = action.payload;
    },
    commitDraft(state) {
      const rect = state.draftRect;
      state.draftStart = null;
      state.draftRect = null;
      if (!rect || !isRectLargeEnough(rect)) {
        return;
      }
      state.polygons = unionRectIntoPolygons(state.polygons, rect);
    },
    cancelDraft(state) {
      state.draftStart = null;
      state.draftRect = null;
    },
  },
});

export const { startDraft, updateDraft, commitDraft, cancelDraft } = floorPlanSlice.actions;
export const floorPlanReducer = floorPlanSlice.reducer;

export function selectPolygons(state: { floorPlan: FloorPlanState }): Polygon[] {
  return state.floorPlan.polygons;
}

export function selectDraftRect(state: { floorPlan: FloorPlanState }): Rect | null {
  return state.floorPlan.draftRect;
}

export function selectTotalAreaM2(state: { floorPlan: FloorPlanState }): number {
  return totalArea(state.floorPlan.polygons);
}
