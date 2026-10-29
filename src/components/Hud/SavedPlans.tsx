import { useRef, useState, type ChangeEvent } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { loadPlanDocument, selectMergeReview } from "../../store/floorPlanSlice";
import {
  createPlanDocument,
  deletePlanFromLibrary,
  downloadPlanJson,
  getSavedPlan,
  listSavedPlans,
  readPlanFile,
  savePlanToLibrary,
  type PlanDocument,
} from "../../store/planDocument";
import styles from "./Hud.module.css";

function formatSavedAt(ts: number): string {
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SavedPlans() {
  const dispatch = useAppDispatch();
  const mergeReview = useAppSelector(selectMergeReview);
  const floorPlan = useAppSelector((s) => s.floorPlan);
  const locked = Boolean(mergeReview);

  const [name, setName] = useState("");
  const [plans, setPlans] = useState<PlanDocument[]>(() => listSavedPlans());
  const [status, setStatus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => listSavedPlans()[0]?.id ?? null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = (next: PlanDocument[], message: string) => {
    setPlans(next);
    setSelectedId((prev) => {
      if (prev && next.some((p) => p.id === prev)) {
        return prev;
      }
      return next[0]?.id ?? null;
    });
    setStatus(message);
  };

  const onSave = (overwriteId?: string) => {
    if (locked) {
      return;
    }
    const existing = overwriteId ? getSavedPlan(overwriteId) : null;
    const doc = createPlanDocument(
      floorPlan,
      name || existing?.name || `Plano ${plans.length + 1}`,
      existing?.id,
    );
    const next = savePlanToLibrary(doc);
    setName("");
    refresh(next, `Guardado: ${doc.name}`);
    setSelectedId(doc.id);
  };

  const onLoad = (id: string) => {
    if (locked) {
      return;
    }
    const doc = getSavedPlan(id);
    if (!doc) {
      setStatus("No se encontró el plano");
      return;
    }
    dispatch(loadPlanDocument(doc));
    setStatus(`Cargado: ${doc.name} (${doc.past.length} undo)`);
  };

  const onDelete = (id: string) => {
    const doc = getSavedPlan(id);
    const next = deletePlanFromLibrary(id);
    refresh(next, doc ? `Eliminado: ${doc.name}` : "Eliminado");
  };

  const onExport = (id: string) => {
    const doc = getSavedPlan(id);
    if (!doc) {
      return;
    }
    downloadPlanJson(doc);
    setStatus(`Exportado: ${doc.name}`);
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || locked) {
      return;
    }
    const doc = await readPlanFile(file);
    if (!doc) {
      setStatus("Archivo inválido");
      return;
    }
    // Fresh id so import never overwrites an existing library entry by accident.
    const imported = createPlanDocument(
      {
        polygons: doc.polygons,
        walls: doc.walls,
        draftStart: null,
        draftRect: null,
        toolMode: floorPlan.toolMode,
        doorWidth: doc.doorWidth,
        wallThickness: doc.wallThickness,
        zoom: doc.zoom,
        panX: doc.panX,
        panY: doc.panY,
        mergeReview: null,
        past: doc.past,
        future: doc.future,
      },
      doc.name,
    );
    const next = savePlanToLibrary(imported);
    dispatch(loadPlanDocument(imported));
    refresh(next, `Importado: ${imported.name}`);
    setSelectedId(imported.id);
  };

  return (
    <div className={styles.plansBlock} aria-label="Planos guardados">
      <span className={styles.label}>Planos de prueba</span>
      <p className={styles.doorHint}>Incluyen historial undo/redo</p>

      <input
        className={styles.doorInput}
        type="text"
        placeholder="Nombre del plano"
        value={name}
        disabled={locked}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
        }}
      />

      <div className={styles.historyRow}>
        <button
          type="button"
          className={styles.historyBtn}
          disabled={locked}
          onClick={() => onSave()}
        >
          Guardar
        </button>
        <button
          type="button"
          className={styles.historyBtn}
          disabled={locked || !selectedId}
          onClick={() => selectedId && onSave(selectedId)}
          title="Sobrescribe el plano seleccionado"
        >
          Actualizar
        </button>
      </div>

      {plans.length === 0 ? (
        <p className={styles.doorHint}>Aún no hay planos guardados</p>
      ) : (
        <ul className={styles.plansList}>
          {plans.map((plan) => {
            const selected = plan.id === selectedId;
            return (
              <li
                key={plan.id}
                className={`${styles.planItem} ${selected ? styles.planItemSelected : ""}`}
              >
                <button
                  type="button"
                  className={styles.planSelect}
                  disabled={locked}
                  onClick={() => setSelectedId(plan.id)}
                >
                  <span className={styles.planName}>{plan.name}</span>
                  <span className={styles.planMeta}>
                    {formatSavedAt(plan.savedAt)} · {plan.past.length} undo
                  </span>
                </button>
                <div className={styles.planActions}>
                  <button
                    type="button"
                    className={styles.planActionBtn}
                    disabled={locked}
                    onClick={() => onLoad(plan.id)}
                  >
                    Cargar
                  </button>
                  <button
                    type="button"
                    className={styles.planActionBtn}
                    onClick={() => onExport(plan.id)}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    className={styles.planActionBtn}
                    onClick={() => onDelete(plan.id)}
                  >
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.historyRow}>
        <button
          type="button"
          className={styles.historyBtn}
          disabled={locked}
          onClick={() => fileInputRef.current?.click()}
        >
          Importar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.hiddenFile}
          onChange={(e) => {
            void onImportFile(e);
          }}
        />
      </div>

      {status ? (
        <p className={styles.plansStatus} role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
