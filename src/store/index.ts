import { configureStore } from "@reduxjs/toolkit";
import { floorPlanReducer } from "./floorPlanSlice";
import { walkReducer } from "./walkSlice";
import { wallMediaReducer } from "./wallMediaSlice";

export const store = configureStore({
  reducer: {
    floorPlan: floorPlanReducer,
    walk: walkReducer,
    wallMedia: wallMediaReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
