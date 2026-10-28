import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  ShapeUtils,
  Vector2,
} from "three";
import type { Point, Polygon } from "../../geometry/types";

function cleanRing(ring: Point[]): Point[] {
  if (ring.length < 3) {
    return [];
  }
  const out: Point[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 1e-9 && Math.abs(prev.y - p.y) < 1e-9) {
      continue;
    }
    out.push({ x: p.x, y: p.y });
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    first &&
    last &&
    out.length > 1 &&
    Math.abs(first.x - last.x) < 1e-9 &&
    Math.abs(first.y - last.y) < 1e-9
  ) {
    out.pop();
  }
  return out.length >= 3 ? out : [];
}

/**
 * Triangulate a floor-plan polygon into a horizontal XZ mesh at world Y.
 * Plan (x,y) maps to Three (x, yUp, z=planY) — same as WallMeshes.
 */
function polygonToHorizontalGeometry(
  poly: Polygon,
  yUp: number,
): BufferGeometry | null {
  const outer = cleanRing(poly.ring);
  if (outer.length < 3) {
    return null;
  }

  // Three.js ShapeUtils expects clockwise outer, counter-clockwise holes.
  let contour = outer.map((p) => new Vector2(p.x, p.y));
  if (!ShapeUtils.isClockWise(contour)) {
    contour = contour.reverse();
  }

  const holes = (poly.holes ?? [])
    .map(cleanRing)
    .filter((h) => h.length >= 3)
    .map((h) => {
      let ring = h.map((p) => new Vector2(p.x, p.y));
      if (ShapeUtils.isClockWise(ring)) {
        ring = ring.reverse();
      }
      return ring;
    });

  let faces: number[][] | null = null;
  try {
    faces = ShapeUtils.triangulateShape(contour, holes);
  } catch {
    faces = null;
  }

  // Convex-ish fallback when earcut fails (no holes).
  if ((!faces || faces.length === 0) && holes.length === 0 && contour.length >= 3) {
    faces = [];
    for (let i = 1; i < contour.length - 1; i += 1) {
      faces.push([0, i, i + 1]);
    }
  }

  if (!faces || faces.length === 0) {
    return null;
  }

  const vertices2d = contour.concat(...holes);
  const positions = new Float32Array(vertices2d.length * 3);
  for (let i = 0; i < vertices2d.length; i += 1) {
    const v = vertices2d[i];
    if (!v) {
      continue;
    }
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = yUp;
    positions[i * 3 + 2] = v.y;
  }

  const indices = new Uint32Array(faces.length * 3);
  let w = 0;
  for (const face of faces) {
    if (face.length < 3) {
      continue;
    }
    indices[w] = face[0] ?? 0;
    indices[w + 1] = face[1] ?? 0;
    indices[w + 2] = face[2] ?? 0;
    w += 3;
  }
  if (w < 3) {
    return null;
  }

  const indexArray = new Uint32Array(w);
  indexArray.set(indices.subarray(0, w));

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setIndex(new BufferAttribute(indexArray, 1));
  geo.computeVertexNormals();
  return geo;
}

type FloorCeilingProps = {
  polygons: Polygon[];
  ceilingHeightM: number;
};

export function FloorCeiling({ polygons, ceilingHeightM }: FloorCeilingProps) {
  const meshes = useMemo(() => {
    const floor: { key: string; geo: BufferGeometry }[] = [];
    const ceiling: { key: string; geo: BufferGeometry }[] = [];
    const h = Math.max(ceilingHeightM, 0.5);
    polygons.forEach((poly, i) => {
      const floorGeo = polygonToHorizontalGeometry(poly, 0.01);
      if (floorGeo) {
        floor.push({ key: `floor-${i}`, geo: floorGeo });
      }
      const ceilGeo = polygonToHorizontalGeometry(poly, h - 0.01);
      if (ceilGeo) {
        ceiling.push({ key: `ceil-${i}`, geo: ceilGeo });
      }
    });
    return { floor, ceiling };
  }, [polygons, ceilingHeightM]);

  useEffect(() => {
    return () => {
      for (const { geo } of meshes.floor) {
        geo.dispose();
      }
      for (const { geo } of meshes.ceiling) {
        geo.dispose();
      }
    };
  }, [meshes]);

  return (
    <group>
      {meshes.floor.map(({ key, geo }) => (
        <mesh key={key} geometry={geo} receiveShadow>
          <meshStandardMaterial
            color="#f4f4f4"
            side={DoubleSide}
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
      {meshes.ceiling.map(({ key, geo }) => (
        <mesh key={key} geometry={geo}>
          <meshStandardMaterial
            color="#eef1f4"
            side={DoubleSide}
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}
