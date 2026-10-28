import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WalkView } from "./components/WalkView/WalkView";
import { Workboard } from "./components/Workboard/Workboard";
import styles from "./App.module.css";

/** Vite `base` includes a trailing slash; React Router basename must not. */
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export function App() {
  return (
    <div className={styles.app}>
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route path="/" element={<Workboard />} />
          <Route path="/recorrido" element={<WalkView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
