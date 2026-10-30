import { useEffect, useMemo, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  SRGBColorSpace,
  Texture,
} from "three";
import { wallIdFromSegment } from "../../geometry/wallId";
import type { Segment } from "../../geometry/types";
import type { WallMediaEntry } from "../../store/wallMediaSlice";

type WallMeshesProps = {
  segments: Segment[];
  height: number;
  thickness: number;
  mediaByWallId: Record<string, WallMediaEntry>;
  editingEnabled: boolean;
  onWallPick: (wallId: string, segment: Segment) => void;
};

type WallFaceGeos = {
  wallId: string;
  segment: Segment;
  /** Long faces that receive the photo (clean UVs). */
  faces: BufferGeometry[];
  /** Caps / edges without photo. */
  trim: BufferGeometry | null;
};

function quadGeo(
  positions: number[],
  uvs: number[],
): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build two photo faces (+n / -n) with independent verts/UVs, plus optional
 * thickness trim (ends / top / bottom) without shared-UV conflicts.
 */
function buildWallGeos(
  seg: Segment,
  height: number,
  thickness: number,
): Omit<WallFaceGeos, "wallId" | "segment"> | null {
  const ax = seg.a.x;
  const az = seg.a.y;
  const bx = seg.b.x;
  const bz = seg.b.y;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-4 || height < 1e-4) {
    return null;
  }

  const faceUvs = [0, 0, 1, 0, 1, 1, 0, 1];

  if (thickness < 1e-4) {
    const face = quadGeo(
      [ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az],
      faceUvs,
    );
    return { faces: [face], trim: null };
  }

  const half = thickness / 2;
  const nx = ((az - bz) / len) * half;
  const nz = ((bx - ax) / len) * half;

  // +n face (a → b, bottom → top) — UV 0..1 along length / height
  const facePos = quadGeo(
    [
      ax + nx, 0, az + nz,
      bx + nx, 0, bz + nz,
      bx + nx, height, bz + nz,
      ax + nx, height, az + nz,
    ],
    faceUvs,
  );

  // -n face: traverse b → a so the outward side still reads L→R with same UVs
  const faceNeg = quadGeo(
    [
      bx - nx, 0, bz - nz,
      ax - nx, 0, az - nz,
      ax - nx, height, az - nz,
      bx - nx, height, bz - nz,
    ],
    faceUvs,
  );

  // Trim box pieces (no UVs needed for plain material)
  const positions = new Float32Array([
    ax + nx, 0, az + nz,
    bx + nx, 0, bz + nz,
    bx - nx, 0, bz - nz,
    ax - nx, 0, az - nz,
    ax + nx, height, az + nz,
    bx + nx, height, bz + nz,
    bx - nx, height, bz - nz,
    ax - nx, height, az - nz,
  ]);
  const indices = new Uint16Array([
    // a end
    3, 0, 4, 3, 4, 7,
    // b end
    1, 2, 6, 1, 6, 5,
    // top
    4, 5, 6, 4, 6, 7,
    // bottom
    0, 3, 2, 0, 2, 1,
  ]);
  const trim = new BufferGeometry();
  trim.setAttribute("position", new BufferAttribute(positions, 3));
  trim.setIndex(new BufferAttribute(indices, 1));
  trim.computeVertexNormals();

  return { faces: [facePos, faceNeg], trim };
}

function useWallTexture(dataUrl: string | undefined): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);

  useEffect(() => {
    if (!dataUrl) {
      setTex((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) {
        return;
      }
      const t = new Texture(img);
      t.colorSpace = SRGBColorSpace;
      t.flipY = true;
      t.anisotropy = 8;
      t.needsUpdate = true;
      setTex((prev) => {
        prev?.dispose();
        return t;
      });
    };
    img.onerror = () => {
      if (!cancelled) {
        setTex((prev) => {
          prev?.dispose();
          return null;
        });
      }
    };
    img.src = dataUrl;

    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  useEffect(() => {
    return () => {
      tex?.dispose();
    };
  }, [tex]);

  return tex;
}

function WallMeshItem({
  segment,
  wallId,
  faces,
  trim,
  bakedDataUrl,
  editingEnabled,
  onWallPick,
}: {
  segment: Segment;
  wallId: string;
  faces: BufferGeometry[];
  trim: BufferGeometry | null;
  bakedDataUrl: string | undefined;
  editingEnabled: boolean;
  onWallPick: (wallId: string, segment: Segment) => void;
}) {
  const texture = useWallTexture(bakedDataUrl);
  const [hovered, setHovered] = useState(false);

  const pickHandlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      if (!editingEnabled || !document.pointerLockElement) {
        return;
      }
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHovered(false);
      document.body.style.cursor = "auto";
    },
    onClick: (e: { stopPropagation: () => void }) => {
      // Unlocked clicks must reach PointerLockControls to re-capture the mouse.
      // Wall edit while looking: E key, or click only when already locked.
      if (!editingEnabled || !document.pointerLockElement) {
        return;
      }
      e.stopPropagation();
      onWallPick(wallId, segment);
    },
  };

  const plainColor = hovered ? "#d5dde6" : "#c8cdd3";

  return (
    <group userData={{ wallId, segment }}>
      {faces.map((geo, i) => (
        <mesh
          key={`${wallId}-face-${i}-${bakedDataUrl ? "tex" : "plain"}`}
          geometry={geo}
          userData={{ wallId, segment }}
          {...pickHandlers}
        >
          <meshStandardMaterial
            key={bakedDataUrl ?? "none"}
            color={texture ? "#ffffff" : plainColor}
            map={texture}
            side={DoubleSide}
            roughness={0.85}
            metalness={0.05}
            emissive={hovered ? "#1a3344" : "#000000"}
            emissiveIntensity={hovered ? 0.25 : 0}
          />
        </mesh>
      ))}
      {trim ? (
        <mesh
          geometry={trim}
          userData={{ wallId, segment }}
          {...pickHandlers}
        >
          <meshStandardMaterial
            color={plainColor}
            side={DoubleSide}
            roughness={0.9}
            metalness={0.04}
            emissive={hovered ? "#1a3344" : "#000000"}
            emissiveIntensity={hovered ? 0.2 : 0}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export function WallMeshes({
  segments,
  height,
  thickness,
  mediaByWallId,
  editingEnabled,
  onWallPick,
}: WallMeshesProps) {
  const geos = useMemo(() => {
    const list: WallFaceGeos[] = [];
    for (const seg of segments) {
      const built = buildWallGeos(seg, height, thickness);
      if (!built) {
        continue;
      }
      list.push({
        wallId: wallIdFromSegment(seg),
        segment: seg,
        faces: built.faces,
        trim: built.trim,
      });
    }
    return list;
  }, [segments, height, thickness]);

  useEffect(() => {
    return () => {
      for (const item of geos) {
        for (const g of item.faces) {
          g.dispose();
        }
        item.trim?.dispose();
      }
    };
  }, [geos]);

  return (
    <group>
      {geos.map(({ wallId, segment, faces, trim }) => (
        <WallMeshItem
          key={wallId}
          wallId={wallId}
          segment={segment}
          faces={faces}
          trim={trim}
          bakedDataUrl={mediaByWallId[wallId]?.bakedDataUrl}
          editingEnabled={editingEnabled}
          onWallPick={onWallPick}
        />
      ))}
    </group>
  );
}
