import { Workboard } from "./components/Workboard/Workboard";
import styles from "./App.module.css";

export function App() {
  return (
    <div className={styles.app}>
      <Workboard />
    </div>
  );
}
