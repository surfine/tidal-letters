// npm run build — copies what a host page embeds into dist/.
// demo/ is for the standalone page only; it is not part of the embed tree.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const shipped = ["ais6-bridge.js", "app.manifest.json", "kit.css", "shared", "reader"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const path of shipped) cpSync(join(root, path), join(dist, path), { recursive: true });
console.log(`built dist/ (${shipped.join(", ")})`);
