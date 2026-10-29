import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { randomSpawnInFigures } from "../geometry/walkMesh";
import type { Point, Polygon } from "../geometry/types";

export type WalkState = {
  ceilingHeightM: number;
  /** Camera / eye height above the floor (meters). */
  eyeHeightM: number;
  /** Perspective camera vertical FOV in degrees. */
  fovDeg: number;
  /** Spawn for the current /recorrido visit; null until beginWalk. */
  spawn: Point | null;
  /** Bumps when entering 3D so the scene remounts with a fresh spawn. */
  sessionKey: number;
};

const initialState: WalkState = {
  ceilingHeightM: 2.5,
  eyeHeightM: 1.8,
  fovDeg: 75,
  spawn: null,
  sessionKey: 0,
};

const walkSlice = createSlice({
  name: "walk",
  initialState,
  reducers: {
    setCeilingHeight(state, action: PayloadAction<number>) {
      const value = Math.round(Math.max(0.5, action.payload) * 100) / 100;
      state.ceilingHeightM = value;
    },
    setEyeHeight(state, action: PayloadAction<number>) {
      const value = Math.round(Math.max(0.3, Math.min(3.5, action.payload)) * 100) / 100;
      state.eyeHeightM = value;
    },
    setFov(state, action: PayloadAction<number>) {
      const value = Math.round(Math.max(40, Math.min(120, action.payload)));
      state.fovDeg = value;
    },
    beginWalk(state, action: PayloadAction<{ polygons: Polygon[] }>) {
      state.spawn = randomSpawnInFigures(action.payload.polygons);
      state.sessionKey += 1;
    },
    clearWalk(state) {
      state.spawn = null;
    },
  },
});

export const {
  setCeilingHeight,
  setEyeHeight,
  setFov,
  beginWalk,
  clearWalk,
} = walkSlice.actions;
export const walkReducer = walkSlice.reducer;

export function selectCeilingHeight(state: { walk: WalkState }): number {
  return state.walk.ceilingHeightM;
}

export function selectEyeHeight(state: { walk: WalkState }): number {
  return state.walk.eyeHeightM;
}

export function selectFov(state: { walk: WalkState }): number {
  return state.walk.fovDeg;
}

export function selectWalkSpawn(state: { walk: WalkState }): Point | null {
  return state.walk.spawn;
}

export function selectWalkSessionKey(state: { walk: WalkState }): number {
  return state.walk.sessionKey;
}
