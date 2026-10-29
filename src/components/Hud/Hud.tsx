import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "../../geometry/coords";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  redo,
  selectCanRedo,
  selectCanUndo,
  selectDoorWidth,
  selectMergeReview,
  selectToolMode,
  selectTotalAreaM2,
  selectWallThickness,
  selectZoom,
  setDoorWidth,
  setToolMode,
  setWallThickness,
  setZoom,
  undo,
  type ToolMode,
} from "../../store/floorPlanSlice";
import styles from "./Hud.module.css";
import { SavedPlans } from "./SavedPlans";

function formatArea(m2: number): string {
  if (m2 === 0) {
    return "0";
  }
  return m2.toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function Hud() {
  const dispatch = useAppDispatch();
  const area = useAppSelector(selectTotalAreaM2);
  const toolMode = useAppSelector(selectToolMode);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);
  const doorWidth = useAppSelector(selectDoorWidth);
  const wallThickness = useAppSelector(selectWallThickness);
  const mergeReview = useAppSelector(selectMergeReview);
  const zoom = useAppSelector(selectZoom);
  const locked = Boolean(mergeReview);

  const setMode = (mode: ToolMode) => {
    dispatch(setToolMode(mode));
  };

  const onMeterChange = (raw: string, apply: (n: number) => void) => {
    if (raw.trim() === "") {
      apply(0);
      return;
    }
    const normalized = raw.replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      apply(parsed);
    }
  };

  return (
    <aside className={styles.hud} aria-label="Controles del plano">
      <div className={styles.areaBlock} aria-live="polite">
        <span className={styles.label}>Área total</span>
        <span className={styles.value}>{formatArea(area)} m²</span>
      </div>

      <div className={styles.switch} role="group" aria-label="Modo de herramienta">
        <button
          type="button"
          className={`${styles.switchOption} ${toolMode === "draw" ? styles.switchOptionActive : ""}`}
          aria-pressed={toolMode === "draw"}
          disabled={locked}
          onClick={() => setMode("draw")}
        >
          Dibujar
        </button>
        <button
          type="button"
          className={`${styles.switchOption} ${toolMode === "erase" ? styles.switchOptionActive : ""}`}
          aria-pressed={toolMode === "erase"}
          disabled={locked}
          onClick={() => setMode("erase")}
        >
          Borrar
        </button>
      </div>

      <div className={styles.historyRow}>
        <button
          type="button"
          className={styles.historyBtn}
          disabled={!canUndo}
          onClick={() => dispatch(undo())}
        >
          Atrás
        </button>
        <button
          type="button"
          className={styles.historyBtn}
          disabled={!canRedo}
          onClick={() => dispatch(redo())}
        >
          Adelante
        </button>
      </div>

      <label className={styles.doorField}>
        <span className={styles.label}>Ancho de puerta (m)</span>
        <input
          className={styles.doorInput}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={doorWidth}
          onChange={(e) =>
            onMeterChange(e.target.value, (n) => dispatch(setDoorWidth(n)))
          }
        />
        <p className={styles.doorHint}>Hasta 2 decimales</p>
      </label>

      <label className={styles.doorField}>
        <span className={styles.label}>Grosor de muro (m)</span>
        <input
          className={styles.doorInput}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={wallThickness}
          onChange={(e) =>
            onMeterChange(e.target.value, (n) => dispatch(setWallThickness(n)))
          }
        />
        <p className={styles.doorHint}>Hasta 2 decimales · 3D</p>
      </label>

      <label className={styles.zoomBlock}>
        <span className={styles.label}>
          Zoom {zoom.toLocaleString("es-CL", { maximumFractionDigits: 2 })}×
        </span>
        <input
          className={styles.zoomSlider}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          aria-valuemin={MIN_ZOOM}
          aria-valuemax={MAX_ZOOM}
          aria-valuenow={zoom}
          onChange={(e) => dispatch(setZoom(Number.parseFloat(e.target.value)))}
        />
        <p className={styles.doorHint}>
          {MIN_ZOOM}× – {MAX_ZOOM}× · paso {ZOOM_STEP.toLocaleString("es-CL")}
        </p>
      </label>

      <SavedPlans />
    </aside>
  );
}
