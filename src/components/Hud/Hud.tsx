import { useAppSelector } from "../../store/hooks";
import { selectTotalAreaM2 } from "../../store/floorPlanSlice";
import styles from "./Hud.module.css";

function formatArea(m2: number): string {
  if (m2 === 0) {
    return "0";
  }
  return m2.toLocaleString("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function Hud() {
  const area = useAppSelector(selectTotalAreaM2);

  return (
    <aside className={styles.hud} aria-live="polite">
      <span className={styles.label}>Área total</span>
      <span className={styles.value}>{formatArea(area)} m²</span>
    </aside>
  );
}
