import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import type { Segment } from "../../geometry/types";

type WallMeshesProps = {
  segments: Segment[];
  height: number;
  thickness: number;
};

/** Thin double-sided quad when thickness is ~0. */
function segmentToThinWall(seg: Segment, height: number): BufferGeometry {
  const ax = seg.a.x;
  const az = seg.a.y;
  const bx = seg.b.x;
  const bz = seg.b.y;
  const positions = new Float32Array([
    ax,
    0,
    az,
    bx,
    0,
    bz,
    bx,
    height,
    bz,
    ax,
    height,
    az,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Box extruded along plan segment (x,y) → Three (x,z), centered on the
 * centerline with `thickness` meters of depth.
 */
function segmentToThickWall(
  seg: Segment,
  height: number,
  thickness: number,
): BufferGeometry | null {
  const ax = seg.a.x;
  const az = seg.a.y;
  const bx = seg.b.x;
  const bz = seg.b.y;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-4 || height < 1e-4) {
    return null;
  }

  if (thickness < 1e-4) {
    return segmentToThinWall(seg, height);
  }

  const half = thickness / 2;
  const nx = ((az - bz) / len) * half;
  const nz = ((bx - ax) / len) * half;

  // Bottom: a+n, b+n, b-n, a-n; top: same + height
  const positions = new Float32Array([
    ax + nx,
    0,
    az + nz,
    bx + nx,
    0,
    bz + nz,
    bx - nx,
    0,
    bz - nz,
    ax - nx,
    0,
    az - nz,
    ax + nx,
    height,
    az + nz,
    bx + nx,
    height,
    bz + nz,
    bx - nx,
    height,
    bz - nz,
    ax - nx,
    height,
    az - nz,
  ]);

  // 6 faces, 2 tris each
  const indices = new Uint16Array([
    // +n face
    0, 1, 5, 0, 5, 4,
    // -n face
    2, 3, 7, 2, 7, 6,
    // a end
    3, 0, 4, 3, 4, 7,
    // b end
    1, 2, 6, 1, 6, 5,
    // top
    4, 5, 6, 4, 6, 7,
    // bottom
    0, 3, 2, 0, 2, 1,
  ]);

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export function WallMeshes({ segments, height, thickness }: WallMeshesProps) {
  const geos = useMemo(() => {
    return segments
      .map((seg, i) => ({
        i,
        geo: segmentToThickWall(seg, height, thickness),
      }))
      .filter((item): item is { i: number; geo: BufferGeometry } => item.geo != null);
  }, [segments, height, thickness]);

  return (
    <group>
      {geos.map(({ i, geo }) => (
        <mesh key={`wall-${i}`} geometry={geo}>
          <meshStandardMaterial
            color="#c8cdd3"
            side={DoubleSide}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
