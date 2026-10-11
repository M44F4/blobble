// Draws the app and tray icon from the core, as the "blobble" blob.
import { writeFileSync } from "node:fs";
import * as Render from "../../core/Render.mjs";

const svg = Render.svg({ seed: "blobble", face: "happy", size: 1024, padding: 0.04 });
writeFileSync(new URL("../src-tauri/icon-source.svg", import.meta.url), svg);
console.log("wrote src-tauri/icon-source.svg");
