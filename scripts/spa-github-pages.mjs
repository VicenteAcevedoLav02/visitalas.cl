import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * GitHub Pages serves 404.html for unknown paths. Copying index.html there
 * lets BrowserRouter deep links (e.g. /recorrido) load the SPA.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
