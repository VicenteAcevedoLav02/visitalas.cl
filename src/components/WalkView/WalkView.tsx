import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Point } from "../../geometry/types";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  selectPolygons,
  selectWalls,
  selectWallThickness,
} from "../../store/floorPlanSlice";
import {
  selectCeilingHeight,
  selectWalkSessionKey,
  selectWalkSpawn,
  setCeilingHeight,
} from "../../store/walkSlice";
import { Minimap } from "./Minimap";
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

export function WalkView() {
  const dispatch = useAppDispatch();
  const polygons = useAppSelector(selectPolygons);
  const walls = useAppSelector(selectWalls);
  const wallThickness = useAppSelector(selectWallThickness);
  const ceilingHeightM = useAppSelector(selectCeilingHeight);
  const spawn = useAppSelector(selectWalkSpawn);
  const sessionKey = useAppSelector(selectWalkSessionKey);

  const [pose, setPose] = useState<{ x: number; y: number; yaw: number } | null>(null);
  const [locked, setLocked] = useState(false);

  const onPose = useCallback((next: { x: number; y: number; yaw: number }) => {
    setPose(next);
  }, []);

  if (polygons.length === 0 || !spawn) {
    return <Navigate to="/" replace />;
  }

  const player: Point = pose ? { x: pose.x, y: pose.y } : spawn;
  const yaw = pose?.yaw ?? 0;

  const onCeilingChange = (raw: string) => {
    if (raw.trim() === "") {
      return;
    }
    const parsed = Number.parseFloat(raw.replace(",", "."));
    if (Number.isFinite(parsed)) {
      dispatch(setCeilingHeight(parsed));
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap}>
        <Canvas
          key={sessionKey}
          shadows
          camera={{ fov: 75, near: 0.05, far: 200, position: [spawn.x, 1.8, spawn.y] }}
        >
          <WalkScene
            polygons={polygons}
            internalWalls={walls}
            ceilingHeightM={ceilingHeightM}
            wallThickness={wallThickness}
            spawn={spawn}
            onPose={onPose}
          />
        </Canvas>
      </div>

      <aside className={styles.hud} aria-label="HUD del recorrido">
        <Minimap
          polygons={polygons}
          internalWalls={walls}
          player={player}
          yaw={yaw}
        />
        <label className={styles.ceilingField}>
          <span className={styles.label}>Altura del techo (m)</span>
          <input
            className={styles.ceilingInput}
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.01}
            value={ceilingHeightM}
            onChange={(e) => onCeilingChange(e.target.value)}
          />
          <p className={styles.hint}>WASD para caminar · clic para mirar</p>
        </label>
      </aside>

      {!locked ? (
        <p className={styles.lockHint}>Haz clic en la vista para capturar el mouse</p>
      ) : null}

      <Link className={styles.backBtn} to="/">
        Volver al plano
      </Link>

      <PointerLockWatcher onChange={setLocked} />
    </div>
  );
}
