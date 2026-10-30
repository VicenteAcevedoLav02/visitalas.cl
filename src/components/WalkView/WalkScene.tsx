import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Euler,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import {
  clearSpawnFromWalls,
  collectWallSegments,
  moveWithCollision,
} from "../../geometry/walkMesh";
import type { Point, Polygon, Segment } from "../../geometry/types";
import type { WallMediaEntry } from "../../store/wallMediaSlice";
import { FloorCeiling } from "./FloorCeiling";
import { WallMeshes } from "./WallMeshes";

const MOVE_SPEED = 5;
const PLAYER_RADIUS = 0.18;

type WalkSceneProps = {
  polygons: Polygon[];
  internalWalls: Segment[];
  ceilingHeightM: number;
  eyeHeightM: number;
  fovDeg: number;
  wallThickness: number;
  spawn: Point;
  mediaByWallId: Record<string, WallMediaEntry>;
  wallEditOpen: boolean;
  onPose: (pose: { x: number; y: number; yaw: number }) => void;
  onWallPick: (wallId: string, segment: Segment) => void;
};

const MOVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function clampEyeHeight(eyeHeightM: number, ceilingHeightM: number): number {
  const maxEye = Math.max(0.3, ceilingHeightM - 0.05);
  return Math.min(Math.max(eyeHeightM, 0.3), maxEye);
}

function PlayerController({
  polygons,
  walls,
  spawn,
  eyeHeightM,
  ceilingHeightM,
  fovDeg,
  wallEditOpen,
  onPose,
  onWallPick,
}: {
  polygons: Polygon[];
  walls: Segment[];
  spawn: Point;
  eyeHeightM: number;
  ceilingHeightM: number;
  fovDeg: number;
  wallEditOpen: boolean;
  onPose: (pose: { x: number; y: number; yaw: number }) => void;
  onWallPick: (wallId: string, segment: Segment) => void;
}) {
  const { camera, gl, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const eyeY = clampEyeHeight(eyeHeightM, ceilingHeightM);
  const pos = useRef(new Vector3(spawn.x, eyeY, spawn.y));
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));
  const dir = useRef(new Vector3());
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const wish = useRef(new Vector3());
  const poseAccum = useRef(0);
  const raycaster = useRef(new Raycaster());
  const ndcCenter = useRef(new Vector2(0, 0));
  const polygonsRef = useRef(polygons);
  const wallsRef = useRef(walls);
  const onWallPickRef = useRef(onWallPick);
  polygonsRef.current = polygons;
  wallsRef.current = walls;
  onWallPickRef.current = onWallPick;

  useEffect(() => {
    const cleared = clearSpawnFromWalls(spawn, polygons, walls, PLAYER_RADIUS);
    const y = clampEyeHeight(eyeHeightM, ceilingHeightM);
    pos.current.set(cleared.x, y, cleared.y);
    camera.position.copy(pos.current);
  }, [camera, polygons, walls, spawn.x, spawn.y, spawn, eyeHeightM, ceilingHeightM]);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) {
      return;
    }
    camera.fov = fovDeg;
    camera.updateProjectionMatrix();
  }, [camera, fovDeg]);

  useEffect(() => {
    if (wallEditOpen) {
      keys.current = {};
      document.body.style.cursor = "auto";
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
      // After the dialog closes, focus the WebGL canvas so the next click
      // can re-engage pointer lock (camera look) without opening a wall.
      gl.domElement.focus();
    }
  }, [wallEditOpen, gl]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    };

    const pickWallUnderCrosshair = () => {
      // Only while locked — unlocked clicks must stay free for pointer-lock.
      if (document.pointerLockElement !== gl.domElement) {
        return;
      }
      raycaster.current.setFromCamera(ndcCenter.current, camera);
      const hits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of hits) {
        let obj: Object3D | null = hit.object;
        while (obj) {
          const data = obj.userData as {
            wallId?: string;
            segment?: Segment;
          };
          if (data.wallId && data.segment) {
            onWallPickRef.current(data.wallId, data.segment);
            return;
          }
          obj = obj.parent;
        }
      }
    };

    const down = (e: KeyboardEvent) => {
      if (wallEditOpen || isTypingTarget(e.target)) {
        return;
      }
      if (MOVE_CODES.has(e.code)) {
        e.preventDefault();
        keys.current[e.code] = true;
        return;
      }
      if (e.code === "KeyE") {
        e.preventDefault();
        pickWallUnderCrosshair();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) {
        keys.current[e.code] = false;
      }
    };
    const blur = () => {
      keys.current = {};
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [camera, scene, wallEditOpen, gl]);

  useEffect(() => {
    const onLock = () => {
      if (document.pointerLockElement) {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
        gl.domElement.focus();
      }
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [gl]);

  useFrame((_, dt) => {
    if (wallEditOpen) {
      return;
    }
    const k = keys.current;
    const forwardAmt = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafeAmt = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);

    camera.getWorldDirection(dir.current);
    forward.current.set(dir.current.x, 0, dir.current.z);
    if (forward.current.lengthSq() > 1e-8) {
      forward.current.normalize();
    } else {
      forward.current.set(0, 0, -1);
    }
    right.current.set(-forward.current.z, 0, forward.current.x);

    if (forwardAmt !== 0 || strafeAmt !== 0) {
      wish.current
        .set(0, 0, 0)
        .addScaledVector(forward.current, forwardAmt)
        .addScaledVector(right.current, strafeAmt);
      if (wish.current.lengthSq() > 1e-8) {
        wish.current.normalize().multiplyScalar(MOVE_SPEED * Math.min(dt, 0.05));
        const from: Point = { x: pos.current.x, y: pos.current.z };
        const to: Point = {
          x: from.x + wish.current.x,
          y: from.y + wish.current.z,
        };
        const next = moveWithCollision(
          from,
          to,
          polygonsRef.current,
          wallsRef.current,
          PLAYER_RADIUS,
        );
        pos.current.x = next.x;
        pos.current.z = next.y;
      }
    }

    pos.current.y = clampEyeHeight(eyeHeightM, ceilingHeightM);
    camera.position.copy(pos.current);

    poseAccum.current += dt;
    if (poseAccum.current >= 0.05) {
      poseAccum.current = 0;
      euler.current.setFromQuaternion(camera.quaternion);
      onPose({ x: pos.current.x, y: pos.current.z, yaw: euler.current.y });
    }
  });

  // Keep controls mounted; disable while editing so remount doesn't break re-lock.
  return (
    <PointerLockControls
      selector="canvas"
      enabled={!wallEditOpen}
    />
  );
}

export function WalkScene({
  polygons,
  internalWalls,
  ceilingHeightM,
  eyeHeightM,
  fovDeg,
  wallThickness,
  spawn,
  mediaByWallId,
  wallEditOpen,
  onPose,
  onWallPick,
}: WalkSceneProps) {
  const wallSegs = useMemo(
    () => collectWallSegments(polygons, internalWalls),
    [polygons, internalWalls],
  );

  return (
    <>
      <color attach="background" args={["#b8c4ce"]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={["#ffffff", "#d0d0d0", 0.7]} />
      <directionalLight position={[6, 14, 4]} intensity={0.7} />
      <pointLight
        position={[spawn.x, ceilingHeightM * 0.7, spawn.y]}
        intensity={1.4}
        distance={50}
      />

      <FloorCeiling polygons={polygons} ceilingHeightM={ceilingHeightM} />
      <WallMeshes
        segments={wallSegs}
        height={ceilingHeightM}
        thickness={wallThickness}
        mediaByWallId={mediaByWallId}
        editingEnabled={!wallEditOpen}
        onWallPick={onWallPick}
      />

      <PlayerController
        polygons={polygons}
        walls={wallSegs}
        spawn={spawn}
        eyeHeightM={eyeHeightM}
        ceilingHeightM={ceilingHeightM}
        fovDeg={fovDeg}
        wallEditOpen={wallEditOpen}
        onPose={onPose}
        onWallPick={onWallPick}
      />
    </>
  );
}
