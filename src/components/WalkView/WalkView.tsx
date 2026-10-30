import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Point, Segment } from "../../geometry/types";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  selectPolygons,
  selectWalls,
  selectWallThickness,
} from "../../store/floorPlanSlice";
import {
  selectCeilingHeight,
  selectEyeHeight,
  selectFov,
  selectWalkSessionKey,
  selectWalkSpawn,
  setCeilingHeight,
  setEyeHeight,
  setFov,
} from "../../store/walkSlice";
import {
  clearWallMedia,
  selectWallMediaMap,
  setWallMedia,
  type WallMediaEntry,
} from "../../store/wallMediaSlice";
import { Minimap } from "./Minimap";
import { WallPhotoEditor } from "./WallPhotoEditor";
import { WalkScene } from "./WalkScene";
import styles from "./WalkView.module.css";

function PointerLockWatcher({ onChange }: { onChange: (locked: boolean) => void }) {
  useEffect(() => {
    const sync = () => {
      onChange(document.pointerLockElement != null);
    };
    document.addEventListener("pointerlockchange", sync);
    sync();
    return () => document.removeEventListener("pointerlockchange", sync);
  }, [onChange]);
  return null;
}

type EditingWall = {
  wallId: string;
  segment: Segment;
};

export function WalkView() {
  const dispatch = useAppDispatch();
  const polygons = useAppSelector(selectPolygons);
  const walls = useAppSelector(selectWalls);
  const wallThickness = useAppSelector(selectWallThickness);
  const ceilingHeightM = useAppSelector(selectCeilingHeight);
  const eyeHeightM = useAppSelector(selectEyeHeight);
  const fovDeg = useAppSelector(selectFov);
  const spawn = useAppSelector(selectWalkSpawn);
  const sessionKey = useAppSelector(selectWalkSessionKey);
  const mediaByWallId = useAppSelector(selectWallMediaMap);

  const [pose, setPose] = useState<{ x: number; y: number; yaw: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [editing, setEditing] = useState<EditingWall | null>(null);
  const [fadeIn, setFadeIn] = useState(false);

  const onPose = useCallback((next: { x: number; y: number; yaw: number }) => {
    setPose(next);
  }, []);

  const onWallPick = useCallback((wallId: string, segment: Segment) => {
    document.exitPointerLock();
    setFadeIn(true);
    // Allow fade paint before mounting dialog
    window.setTimeout(() => {
      setEditing({ wallId, segment });
    }, 180);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setFadeIn(false);
    document.body.style.cursor = "auto";
  }, []);

  const saveWallMedia = useCallback(
    (entry: WallMediaEntry) => {
      dispatch(setWallMedia(entry));
      closeEditor();
    },
    [closeEditor, dispatch],
  );

  const clearCurrentWall = useCallback(() => {
    if (!editing) {
      return;
    }
    dispatch(clearWallMedia(editing.wallId));
    closeEditor();
  }, [closeEditor, dispatch, editing]);

  if (polygons.length === 0 || !spawn) {
    return <Navigate to="/" replace />;
  }

  const player: Point = pose ? { x: pose.x, y: pose.y } : spawn;
  const yaw = pose?.yaw ?? 0;

  const onMeterChange = (raw: string, apply: (n: number) => void) => {
    if (raw.trim() === "") {
      return;
    }
    const parsed = Number.parseFloat(raw.replace(",", "."));
    if (Number.isFinite(parsed)) {
      apply(parsed);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap}>
        <Canvas
          key={sessionKey}
          shadows
          camera={{
            fov: fovDeg,
            near: 0.05,
            far: 200,
            position: [spawn.x, eyeHeightM, spawn.y],
          }}
        >
          <WalkScene
            polygons={polygons}
            internalWalls={walls}
            ceilingHeightM={ceilingHeightM}
            eyeHeightM={eyeHeightM}
            fovDeg={fovDeg}
            wallThickness={wallThickness}
            spawn={spawn}
            mediaByWallId={mediaByWallId}
            wallEditOpen={editing != null}
            onPose={onPose}
            onWallPick={onWallPick}
          />
        </Canvas>
      </div>

      {locked && !editing ? <div className={styles.crosshair} aria-hidden /> : null}

      <aside className={styles.hud} aria-label="HUD del recorrido">
        <Minimap
          polygons={polygons}
          internalWalls={walls}
          player={player}
          yaw={yaw}
        />
        <div className={styles.controlsCol}>
          <label className={styles.ceilingField}>
            <span className={styles.label}>Altura del techo (m)</span>
            <input
              className={styles.ceilingInput}
              type="number"
              inputMode="decimal"
              min={0.5}
              step={0.01}
              value={ceilingHeightM}
              onChange={(e) =>
                onMeterChange(e.target.value, (n) => dispatch(setCeilingHeight(n)))
              }
            />
          </label>
          <label className={styles.ceilingField}>
            <span className={styles.label}>Altura de la cabeza (m)</span>
            <input
              className={styles.ceilingInput}
              type="number"
              inputMode="decimal"
              min={0.3}
              max={3.5}
              step={0.01}
              value={eyeHeightM}
              onChange={(e) =>
                onMeterChange(e.target.value, (n) => dispatch(setEyeHeight(n)))
              }
            />
          </label>
          <label className={styles.ceilingField}>
            <span className={styles.label}>FOV (°)</span>
            <input
              className={styles.ceilingInput}
              type="number"
              inputMode="numeric"
              min={40}
              max={120}
              step={1}
              value={fovDeg}
              onChange={(e) =>
                onMeterChange(e.target.value, (n) => dispatch(setFov(n)))
              }
            />
          </label>
          <p className={styles.hint}>
            WASD · clic captura mira · E (mirando un muro) para foto
          </p>
        </div>
      </aside>

      {!locked && !editing ? (
        <p className={styles.lockHint}>Haz clic en la vista para capturar el mouse</p>
      ) : null}

      <Link className={styles.backBtn} to="/">
        Volver al plano
      </Link>

      {(fadeIn || editing) && !editing ? (
        <div className={styles.fadeScrim} aria-hidden />
      ) : null}

      {editing ? (
        <WallPhotoEditor
          wallId={editing.wallId}
          segment={editing.segment}
          wallHeightM={ceilingHeightM}
          existing={mediaByWallId[editing.wallId]}
          onSave={saveWallMedia}
          onClear={clearCurrentWall}
          onClose={closeEditor}
        />
      ) : null}

      <PointerLockWatcher onChange={setLocked} />
    </div>
  );
}
