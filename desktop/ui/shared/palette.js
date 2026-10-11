// The panel's and the pet's colours where there is no Omarchy theme to read (Windows, other Linux,
// macOS): made the way Omarchy's themes are, a dark (or light) shade and a light (or dark) ink both
// tinted in the accent's hue, with the accent on the border. So the blob's popup looks like
// OmaBlob's in whatever accent the system has, instead of a fixed grey-violet.
import * as Blob from "../core/Blob.mjs";
import * as Wear from "../core/Wear.mjs";

export function applyAccentPalette(accent, dark) {
  const root = document.documentElement;
  if (root.classList.contains("omarchy")) return;   // Omarchy's own theme is in charge (shellstyle.js)
  const c = /^#?[0-9a-f]{6}$/i.test(accent || "") ? Blob.oklch(accent) : null;
  const hue = c && c.c > 0.02 ? c.h : 255;
  const bg = dark ? Wear.hexFromOklch(0.2, 0.022, hue) : Wear.hexFromOklch(0.97, 0.012, hue);
  const fg = dark ? Wear.hexFromOklch(0.88, 0.035, hue) : Wear.hexFromOklch(0.27, 0.03, hue);
  const line = c ? accent : Wear.hexFromOklch(dark ? 0.6 : 0.5, 0.1, hue);
  const n = parseInt(fg.replace("#", ""), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const set = (k, v) => root.style.setProperty(k, v);
  for (const t of [4, 5, 7, 9, 10, 12, 18, 25, 35]) set("--tint-" + String(t).padStart(2, "0"), `rgba(${r}, ${g}, ${b}, ${t === 4 ? 0.045 : t / 100})`);
  set("--bg", bg); set("--cut", bg); set("--popup", bg);
  set("--fg", fg); set("--popup-text", fg);
  set("--popup-line", line);
}
