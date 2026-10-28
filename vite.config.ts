import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Project Pages URL: https://vicenteacevedolav02.github.io/visitalas.cl/ */
export default defineConfig({
  base: "/visitalas.cl/",
  plugins: [react()],
});
