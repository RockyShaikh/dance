// Copies the MediaPipe WASM runtime from node_modules into public/wasm so the
// page can load it from the same origin. Runs before `dev` and `build`.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "wasm");

if (!existsSync(from)) {
  console.error("copy-wasm: @mediapipe/tasks-vision is not installed. Run `npm install`.");
  process.exit(1);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log("copy-wasm: copied MediaPipe wasm to public/wasm");
