import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Point } from "../geometry/types";

/** TL, TR, BR, BL in normalized wall space (mutable for Immer). */
export type WallCornersNorm = [Point, Point, Point, Point];

export type WallMediaEntry = {
  wallId: string;
  /** Original uploaded image (data URL). */
  sourceDataUrl: string;
  /** Image quad corners in normalized wall UV space (TL TR BR BL). */
  cornersNorm: WallCornersNorm;
  /** Baked wall-aspect texture applied in 3D (JPEG data URL). */
  bakedDataUrl: string;
};

function cloneCorners(corners: WallCornersNorm): WallCornersNorm {
  return [
    { x: corners[0].x, y: corners[0].y },
    { x: corners[1].x, y: corners[1].y },
    { x: corners[2].x, y: corners[2].y },
    { x: corners[3].x, y: corners[3].y },
  ];
}

export type WallMediaState = {
  byWallId: Record<string, WallMediaEntry>;
};

const initialState: WallMediaState = {
  byWallId: {},
};

const wallMediaSlice = createSlice({
  name: "wallMedia",
  initialState,
  reducers: {
    setWallMedia(state, action: PayloadAction<WallMediaEntry>) {
      const entry = action.payload;
      state.byWallId[entry.wallId] = {
        wallId: entry.wallId,
        sourceDataUrl: entry.sourceDataUrl,
        bakedDataUrl: entry.bakedDataUrl,
        cornersNorm: cloneCorners(entry.cornersNorm),
      };
    },
    clearWallMedia(state, action: PayloadAction<string>) {
      delete state.byWallId[action.payload];
    },
    replaceWallMedia(
      state,
      action: PayloadAction<Record<string, WallMediaEntry>>,
    ) {
      const next: Record<string, WallMediaEntry> = {};
      for (const [id, entry] of Object.entries(action.payload)) {
        next[id] = {
          wallId: entry.wallId,
          sourceDataUrl: entry.sourceDataUrl,
          bakedDataUrl: entry.bakedDataUrl,
          cornersNorm: cloneCorners(entry.cornersNorm),
        };
      }
      state.byWallId = next;
    },
    clearAllWallMedia(state) {
      state.byWallId = {};
    },
  },
});

export const {
  setWallMedia,
  clearWallMedia,
  replaceWallMedia,
  clearAllWallMedia,
} = wallMediaSlice.actions;

export const wallMediaReducer = wallMediaSlice.reducer;

export function selectWallMediaMap(state: {
  wallMedia: WallMediaState;
}): Record<string, WallMediaEntry> {
  return state.wallMedia.byWallId;
}

export function selectWallMedia(
  state: { wallMedia: WallMediaState },
  wallId: string,
): WallMediaEntry | undefined {
  return state.wallMedia.byWallId[wallId];
}
