import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cornersFromNormalized,
  cornersToNormalized,
  defaultFitCorners,
  drawWarpedPreview,
  type Quad,
} from "../../geometry/homography";
import type { Segment } from "../../geometry/types";
import { wallLengthM } from "../../geometry/wallId";
import type {
  WallCornersNorm,
  WallMediaEntry,
} from "../../store/wallMediaSlice";
import styles from "./WallPhotoEditor.module.css";

const HANDLE_LABELS = ["TL", "TR", "BR", "BL"] as const;
const MAX_BAKE_EDGE = 1280;

type WallPhotoEditorProps = {
  wallId: string;
  segment: Segment;
  wallHeightM: number;
  existing: WallMediaEntry | undefined;
  onSave: (entry: WallMediaEntry) => void;
  onClear: () => void;
  onClose: () => void;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = url;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Lectura inválida"));
      }
    };
    reader.onerror = () => reject(new Error("Error al leer archivo"));
    reader.readAsDataURL(file);
  });
}

function computeCanvasSize(
  wallW: number,
  wallH: number,
  maxCss = 480,
): { width: number; height: number } {
  const aspect = wallW / Math.max(wallH, 1e-6);
  if (aspect >= 1) {
    const width = Math.min(maxCss, Math.floor(window.innerWidth * 0.42));
    return { width, height: Math.max(100, Math.round(width / aspect)) };
  }
  const height = Math.min(maxCss, Math.floor(window.innerHeight * 0.42));
  return { width: Math.max(100, Math.round(height * aspect)), height };
}

export function WallPhotoEditor({
  wallId,
  segment,
  wallHeightM,
  existing,
  onSave,
  onClear,
  onClose,
}: WallPhotoEditorProps) {
  const wallLen = wallLengthM(segment);
  const canvasSize = computeCanvasSize(wallLen, wallHeightM);

  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(
    existing?.sourceDataUrl ?? null,
  );
  const [corners, setCorners] = useState<Quad>(() => {
    if (existing) {
      return cornersFromNormalized(
        existing.cornersNorm,
        canvasSize.width,
        canvasSize.height,
      );
    }
    return [
      { x: 0, y: 0 },
      { x: canvasSize.width, y: 0 },
      { x: canvasSize.width, y: canvasSize.height },
      { x: 0, y: canvasSize.height },
    ];
  });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fitOnLoadRef = useRef(!existing);
  const dragRef = useRef<{
    index: number;
    ox: number;
    oy: number;
    start: Quad;
  } | null>(null);

  useEffect(() => {
    document.exitPointerLock();
  }, []);

  useEffect(() => {
    if (!sourceDataUrl) {
      setImage(null);
      return;
    }
    let cancelled = false;
    void loadImage(sourceDataUrl)
      .then((img) => {
        if (cancelled) {
          return;
        }
        setImage(img);
        if (fitOnLoadRef.current) {
          setCorners(
            defaultFitCorners(
              canvasSize.width,
              canvasSize.height,
              img.naturalWidth,
              img.naturalHeight,
            ),
          );
        }
        fitOnLoadRef.current = false;
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("No se pudo abrir la imagen");
          setImage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceDataUrl, canvasSize.width, canvasSize.height]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Wall plate
    ctx.fillStyle = "#3a3f45";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    if (image) {
      drawWarpedPreview(
        ctx,
        image,
        image.naturalWidth,
        image.naturalHeight,
        corners,
        20,
      );
      // Quad outline
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [corners, image]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const onUpload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      setStatus("Elige un archivo de imagen");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      fitOnLoadRef.current = true;
      setSourceDataUrl(dataUrl);
      setStatus(null);
    } catch {
      setStatus("Error al subir la imagen");
    }
  };

  const onPointerDownHandle = (
    index: number,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      index,
      ox: e.clientX,
      oy: e.clientY,
      start: [
        { ...corners[0] },
        { ...corners[1] },
        { ...corners[2] },
        { ...corners[3] },
      ],
    };
  };

  const onPointerMoveHandle = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const dx = (e.clientX - drag.ox) * scaleX;
    const dy = (e.clientY - drag.oy) * scaleY;
    const next: Quad = [
      { ...drag.start[0] },
      { ...drag.start[1] },
      { ...drag.start[2] },
      { ...drag.start[3] },
    ];
    const p = next[drag.index]!;
    p.x = drag.start[drag.index]!.x + dx;
    p.y = drag.start[drag.index]!.y + dy;
    setCorners(next);
  };

  const onPointerUpHandle = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
  };

  const bakeAndSave = async () => {
    if (!image || !sourceDataUrl) {
      setStatus("Sube una imagen primero");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const aspect = canvasSize.width / canvasSize.height;
      let outW: number;
      let outH: number;
      if (aspect >= 1) {
        outW = Math.min(MAX_BAKE_EDGE, Math.max(64, Math.round(wallLen * 200)));
        outH = Math.max(64, Math.round(outW / aspect));
      } else {
        outH = Math.min(MAX_BAKE_EDGE, Math.max(64, Math.round(wallHeightM * 200)));
        outW = Math.max(64, Math.round(outH * aspect));
      }

      const bakeCanvas = document.createElement("canvas");
      bakeCanvas.width = outW;
      bakeCanvas.height = outH;
      const scaleCorners: Quad = [
        {
          x: (corners[0].x / canvasSize.width) * outW,
          y: (corners[0].y / canvasSize.height) * outH,
        },
        {
          x: (corners[1].x / canvasSize.width) * outW,
          y: (corners[1].y / canvasSize.height) * outH,
        },
        {
          x: (corners[2].x / canvasSize.width) * outW,
          y: (corners[2].y / canvasSize.height) * outH,
        },
        {
          x: (corners[3].x / canvasSize.width) * outW,
          y: (corners[3].y / canvasSize.height) * outH,
        },
      ];

      // Same warp path as the live editor preview → what you see is what hits the wall.
      const bctx = bakeCanvas.getContext("2d");
      if (!bctx) {
        throw new Error("Canvas no disponible");
      }
      bctx.fillStyle = "#3a3f45";
      bctx.fillRect(0, 0, outW, outH);
      drawWarpedPreview(
        bctx,
        image,
        image.naturalWidth,
        image.naturalHeight,
        scaleCorners,
        32,
      );

      const bakedDataUrl = bakeCanvas.toDataURL("image/jpeg", 0.88);
      const entry: WallMediaEntry = {
        wallId,
        sourceDataUrl,
        cornersNorm: cornersToNormalized(
          corners,
          canvasSize.width,
          canvasSize.height,
        ) as WallCornersNorm,
        bakedDataUrl,
      };
      onSave(entry);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al guardar");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Editor de foto del muro"
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Foto del muro</h2>
          <p className={styles.meta}>
            {wallLen.toLocaleString("es-CL", { maximumFractionDigits: 2 })} m ×{" "}
            {wallHeightM.toLocaleString("es-CL", { maximumFractionDigits: 2 })} m
          </p>
        </header>

        <div className={styles.stage}>
          {!image ? (
            <p className={styles.empty}>
              Sube una foto para montarla en este muro.
              <br />
              Luego arrastra las esquinas (distorsión / perspectiva).
            </p>
          ) : null}
          <div
            className={styles.canvasWrap}
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              width={canvasSize.width}
              height={canvasSize.height}
            />
            {image
              ? corners.map((c, i) => (
                  <button
                    key={HANDLE_LABELS[i]}
                    type="button"
                    className={styles.handle}
                    style={{ left: c.x, top: c.y }}
                    aria-label={`Esquina ${HANDLE_LABELS[i]}`}
                    onPointerDown={(e) => onPointerDownHandle(i, e)}
                    onPointerMove={onPointerMoveHandle}
                    onPointerUp={onPointerUpHandle}
                    onPointerCancel={onPointerUpHandle}
                  />
                ))
              : null}
          </div>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Subir foto
          </button>
          <input
            ref={fileRef}
            className={styles.hiddenFile}
            type="file"
            accept="image/*"
            onChange={(e) => {
              void onUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || !image}
            onClick={() => {
              void bakeAndSave();
            }}
          >
            {busy ? "Guardando…" : "Guardar en el muro"}
          </button>
          {existing ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={busy}
              onClick={onClear}
            >
              Quitar foto
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <p className={styles.hint}>
            Arrastra cada esquina como Control-T con distorsión. Guardar aplica
            la imagen al muro en 3D.
            {status ? ` · ${status}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
