// Which computer this is, before anything else: the OS from the browser, and on Linux whether it
// is Omarchy (its shell has a theme the app can read). Everything that differs per desktop then
// lives in its own module here (windows.js, omarchy.js, linux.js, macos.js), chosen by SHELL.
const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
export const OS = /Windows/.test(agent) ? "windows" : /Mac OS X|Macintosh/.test(agent) ? "macos" : "linux";

// windows | macos | omarchy | linux (any other Linux desktop)
export let SHELL = OS;
if (OS === "linux") {
  SHELL = "linux";
  try { if (window.__TAURI__ && await window.__TAURI__.core.invoke("shell_style")) SHELL = "omarchy"; } catch (e) { /* any other desktop */ }
}
