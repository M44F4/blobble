// On Omarchy the panel and pet wear the desktop's own look, like OmaBlob's popup: the theme's
// colours, Hyprland's corner rounding and border, the system monospace font. Elsewhere this
// does nothing and theme.css stays as it is.
const invoke = window.__TAURI__.core.invoke;

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export async function applyShellStyle() {
  let st = null;
  try { st = await invoke("shell_style"); } catch (e) { /* not available */ }
  const root = document.documentElement;
  if (!st || !rgb(st.background) || !rgb(st.foreground)) return false;
  const set = (k, v) => root.style.setProperty(k, v);
  const [r, g, b] = rgb(st.foreground);
  for (const t of [4, 5, 7, 9, 10, 12, 18, 25, 35]) set("--tint-" + String(t).padStart(2, "0"), `rgba(${r}, ${g}, ${b}, ${t === 4 ? .045 : t / 100})`);
  set("--bg", st.background);
  set("--cut", st.background);
  set("--popup", st.background);
  set("--fg", st.foreground);
  set("--popup-text", st.foreground);
  set("--popup-line", st.accent || st.foreground);
  if (rgb(st.urgent)) set("--urgent", st.urgent);
  // Every corner follows the theme's rounding, as in OmaBlob (square when the theme is).
  const rad = Math.max(0, st.radius) + "px";
  // Round badges and dots stay round, as in OmaBlob; what is a box (switches, icon buttons) follows.
  for (const v of ["--radius", "--popup-radius", "--r-ctl", "--r-pill", "--r-follow", "--r-s3", "--r-s4", "--r-s5"]) set(v, rad);
  root.classList.add("omarchy");
  // The panel's text at the shell's size (12 px by default; Blobble's own is 13).
  const k = (Number(st.fontSize) || 12) / 13;
  for (const n of [9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 15, 16, 18, 26, 42]) set("--fs-" + String(n).replace(".", "_"), Math.round(n * k * 2) / 2 + "px");
  set("--popup-border", Math.max(0, st.border) + "px");
  set("--font", 'monospace, "JetBrainsMono Nerd Font"');
  return true;
}
