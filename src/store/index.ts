import { configureStore } from "@reduxjs/toolkit";
import { floorPlanReducer } from "./floorPlanSlice";

export const store = configureStore({
  reducer: {
    floorPlan: floorPlanReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
