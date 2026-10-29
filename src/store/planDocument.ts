import type {
  FloorPlanState,
  PlanLoadPayload,
  PlanSnapshot,
} from "./floorPlanSlice";
import type { Polygon, Segment } from "../geometry/types";

export const PLAN_DOC_VERSION = 1 as const;
const STORAGE_KEY = "visitalas.savedPlans";

/** Serializable floor plan including undo/redo stacks. */
export type PlanDocument = PlanLoadPayload & {
  version: typeof PLAN_DOC_VERSION;
  id: string;
  name: string;
  savedAt: number;
};

export type PlanLibrary = {
  plans: PlanDocument[];
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

function cloneSnapshot(snapshot: PlanSnapshot): PlanSnapshot {
  return {
    polygons: clonePolygons(snapshot.polygons),
    walls: cloneSegments(snapshot.walls),
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPlanDocument(
  state: FloorPlanState,
  name: string,
  existingId?: string,
): PlanDocument {
  const trimmed = name.trim() || "Sin nombre";
  return {
    version: PLAN_DOC_VERSION,
    id: existingId ?? newId(),
    name: trimmed,
    savedAt: Date.now(),
    polygons: clonePolygons(state.polygons),
    walls: cloneSegments(state.walls),
    past: state.past.map(cloneSnapshot),
    future: state.future.map(cloneSnapshot),
    doorWidth: state.doorWidth,
    wallThickness: state.wallThickness,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
  };
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const p = value as { x?: unknown; y?: unknown };
  return typeof p.x === "number" && typeof p.y === "number";
}

function isPolygon(value: unknown): value is Polygon {
  if (!value || typeof value !== "object") {
    return false;
  }
  const poly = value as { ring?: unknown; holes?: unknown };
  if (!Array.isArray(poly.ring) || !poly.ring.every(isPoint)) {
    return false;
  }
  if (poly.holes === undefined) {
    return true;
  }
  return (
    Array.isArray(poly.holes) &&
    poly.holes.every(
      (hole) => Array.isArray(hole) && hole.every(isPoint),
    )
  );
}

function isSegment(value: unknown): value is Segment {
  if (!value || typeof value !== "object") {
    return false;
  }
  const s = value as { a?: unknown; b?: unknown };
  return isPoint(s.a) && isPoint(s.b);
}

function isSnapshot(value: unknown): value is PlanSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const snap = value as { polygons?: unknown; walls?: unknown };
  return (
    Array.isArray(snap.polygons) &&
    snap.polygons.every(isPolygon) &&
    Array.isArray(snap.walls) &&
    snap.walls.every(isSegment)
  );
}

export function parsePlanDocument(raw: unknown): PlanDocument | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const doc = raw as Partial<PlanDocument>;
  if (doc.version !== PLAN_DOC_VERSION) {
    return null;
  }
  if (typeof doc.id !== "string" || typeof doc.name !== "string") {
    return null;
  }
  if (typeof doc.savedAt !== "number") {
    return null;
  }
  if (
    !Array.isArray(doc.polygons) ||
    !doc.polygons.every(isPolygon) ||
    !Array.isArray(doc.walls) ||
    !doc.walls.every(isSegment) ||
    !Array.isArray(doc.past) ||
    !doc.past.every(isSnapshot) ||
    !Array.isArray(doc.future) ||
    !doc.future.every(isSnapshot)
  ) {
    return null;
  }
  if (
    typeof doc.doorWidth !== "number" ||
    typeof doc.wallThickness !== "number" ||
    typeof doc.zoom !== "number" ||
    typeof doc.panX !== "number" ||
    typeof doc.panY !== "number"
  ) {
    return null;
  }
  return {
    version: PLAN_DOC_VERSION,
    id: doc.id,
    name: doc.name,
    savedAt: doc.savedAt,
    polygons: clonePolygons(doc.polygons),
    walls: cloneSegments(doc.walls),
    past: doc.past.map(cloneSnapshot),
    future: doc.future.map(cloneSnapshot),
    doorWidth: doc.doorWidth,
    wallThickness: doc.wallThickness,
    zoom: doc.zoom,
    panX: doc.panX,
    panY: doc.panY,
  };
}

function readLibrary(): PlanLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { plans: [] };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { plans: [] };
    }
    const lib = parsed as { plans?: unknown };
    if (!Array.isArray(lib.plans)) {
      return { plans: [] };
    }
    const plans: PlanDocument[] = [];
    for (const item of lib.plans) {
      const doc = parsePlanDocument(item);
      if (doc) {
        plans.push(doc);
      }
    }
    return { plans };
  } catch {
    return { plans: [] };
  }
}

function writeLibrary(library: PlanLibrary): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function listSavedPlans(): PlanDocument[] {
  return readLibrary().plans.slice().sort((a, b) => b.savedAt - a.savedAt);
}

export function savePlanToLibrary(doc: PlanDocument): PlanDocument[] {
  const library = readLibrary();
  const index = library.plans.findIndex((p) => p.id === doc.id);
  if (index >= 0) {
    library.plans[index] = doc;
  } else {
    library.plans.push(doc);
  }
  writeLibrary(library);
  return listSavedPlans();
}

export function deletePlanFromLibrary(id: string): PlanDocument[] {
  const library = readLibrary();
  library.plans = library.plans.filter((p) => p.id !== id);
  writeLibrary(library);
  return listSavedPlans();
}

export function getSavedPlan(id: string): PlanDocument | null {
  return readLibrary().plans.find((p) => p.id === id) ?? null;
}

export function downloadPlanJson(doc: PlanDocument): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = doc.name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, "").trim() || "plano";
  anchor.href = url;
  anchor.download = `${safeName}.visitalas.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readPlanFile(file: File): Promise<PlanDocument | null> {
  const text = await file.text();
  try {
    return parsePlanDocument(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}
