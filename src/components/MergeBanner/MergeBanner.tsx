import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  cancelMergeReview,
  confirmMergeReview,
  selectDoorWidth,
  selectMergeReview,
} from "../../store/floorPlanSlice";
import styles from "./MergeBanner.module.css";

export function MergeBanner() {
  const dispatch = useAppDispatch();
  const review = useAppSelector(selectMergeReview);
  const doorWidth = useAppSelector(selectDoorWidth);

  if (!review) {
    return null;
  }

  const widthLabel = doorWidth.toLocaleString("es-CL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return (
    <aside className={styles.banner} aria-live="polite">
      <p className={styles.title}>Fusión pendiente</p>
      <p className={styles.hint}>
        Haz clic en el muro que desaparecería para abrir una puerta de {widthLabel} m.
        Arrastra sobre el muro para borrar un tramo más largo. Lo que no borres queda
        como muro interno.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.continueBtn}
          onClick={() => dispatch(confirmMergeReview())}
        >
          Continuar
        </button>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => dispatch(cancelMergeReview())}
        >
          Cancelar
        </button>
      </div>
    </aside>
  );
}
