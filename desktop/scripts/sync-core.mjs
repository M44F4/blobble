// Copies the shared core next to the page, so the app ships it without a bundler.
import { cpSync, rmSync } from "node:fs";

const from = new URL("../../core/", import.meta.url);
const to = new URL("../ui/core/", import.meta.url);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".md") });
console.log("core/ synced into desktop/ui/core/");
