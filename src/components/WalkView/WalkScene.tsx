import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Vector3 } from "three";
import {
  clearSpawnFromWalls,
  collectWallSegments,
  moveWithCollision,
} from "../../geometry/walkMesh";
import type { Point, Polygon, Segment } from "../../geometry/types";
import { FloorCeiling } from "./FloorCeiling";
import { WallMeshes } from "./WallMeshes";

const EYE_HEIGHT = 1.8;
const MOVE_SPEED = 5;
const PLAYER_RADIUS = 0.18;

type WalkSceneProps = {
  polygons: Polygon[];
  internalWalls: Segment[];
  ceilingHeightM: number;
  wallThickness: number;
  spawn: Point;
  onPose: (pose: { x: number; y: number; yaw: number }) => void;
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

function PlayerController({
  polygons,
  walls,
  spawn,
  onPose,
}: {
  polygons: Polygon[];
  walls: Segment[];
  spawn: Point;
  onPose: (pose: { x: number; y: number; yaw: number }) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const pos = useRef(new Vector3(spawn.x, EYE_HEIGHT, spawn.y));
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));
  const dir = useRef(new Vector3());
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const wish = useRef(new Vector3());
  const poseAccum = useRef(0);
  const polygonsRef = useRef(polygons);
  const wallsRef = useRef(walls);
  polygonsRef.current = polygons;
  wallsRef.current = walls;

  useEffect(() => {
    const cleared = clearSpawnFromWalls(spawn, polygons, walls, PLAYER_RADIUS);
    pos.current.set(cleared.x, EYE_HEIGHT, cleared.y);
    camera.position.copy(pos.current);
  }, [camera, polygons, walls, spawn.x, spawn.y, spawn]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    };

    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }
      if (MOVE_CODES.has(e.code)) {
        e.preventDefault();
        keys.current[e.code] = true;
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

    // Capture phase so HUD / canvas focus cannot swallow WASD
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    const onLock = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      gl.domElement.focus();
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [gl]);

  useFrame((_, dt) => {
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

    pos.current.y = EYE_HEIGHT;
    camera.position.copy(pos.current);

    poseAccum.current += dt;
    if (poseAccum.current >= 0.05) {
      poseAccum.current = 0;
      euler.current.setFromQuaternion(camera.quaternion);
      onPose({ x: pos.current.x, y: pos.current.z, yaw: euler.current.y });
    }
  });

  return <PointerLockControls selector="canvas" />;
}

export function WalkScene({
  polygons,
  internalWalls,
  ceilingHeightM,
  wallThickness,
  spawn,
  onPose,
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
      />

      <PlayerController
        polygons={polygons}
        walls={wallSegs}
        spawn={spawn}
        onPose={onPose}
      />
    </>
  );
}
