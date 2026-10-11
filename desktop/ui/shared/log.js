// Page errors go to the terminal running the app, since its windows have no console to look at.
const { invoke } = window.__TAURI__.core;

export function log(...parts) {
  invoke("log", { text: parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === "string" ? p : JSON.stringify(p))).join(" ") }).catch(() => {});
}
window.addEventListener("error", (e) => log("error:", e.message, (e.filename || "") + ":" + (e.lineno || "")));
window.addEventListener("unhandledrejection", (e) => log("rejected:", e.reason instanceof Error ? e.reason : String(e.reason)));
