// Omarchy (Hyprland and its Quickshell bar). The blob is a bar widget, like OmaBlob's: the
// Quickshell plugin in desktop/omarchy/ owns its slot, so the shell places it, the layout moves
// it and it follows the bar to any side. This app draws the blob and the panel:
//   widget -> app   `blobble --bar hello|panel|open|poke|btop|walk|antic ...` (see ctl.rs)
//   app -> widget   $XDG_RUNTIME_DIR/blobble/bar.svg (the blob) and bar.json (its settings)
import { card, grid, caption, slider, sizePicker, commandBlock, button, on, esc } from "../panel/ui.js";
import { I } from "../shared/icons.js";
import { layerHost } from "./layer.js";
import { createTaskbar } from "./taskbar.js";

// OmaBlob's popup is 378 wide and sits flush at its gap from the bar.
const PANEL_WIDTH = 378;

// OmaBlob's sizes of the blob in the bar, as a share of the bar.
const BAR_SIZES = [{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }, { value: "xl", label: "XL" }, { value: "xxl", label: "XXL" }];
const BAR_SCALE = { small: 0.55, medium: 0.75, large: 0.95, xl: 1.25, xxl: 1.6 };
const barScale = (v) => (typeof v === "number" ? Math.max(0.4, Math.min(2.2, v)) : BAR_SCALE[v] || 0.75);

// OmaBlob's Bar tab: how big the blob is in the bar, and what it shows. Where it sits is the
// bar layout's: move the widget like any other.
function barPage(h, kit) {
  const { ft, isOn, flip } = kit;
  const v = h.setting("barBlobSize", "medium");
  const scale = barScale(v);
  return card({ title: "Size in the bar", info: "Above 100% it hangs below the bar.", trailing: Math.round(scale * 100) + "% of the bar" },
      sizePicker({ options: kit.previews(BAR_SIZES), value: String(v), change: (x) => h.save("barBlobSize", x) }) +
      slider({ min: 0.4, max: 2.2, step: 0.05, value: scale, change: (x) => h.save("barBlobSize", Math.round(x * 100) / 100) })) +
    card({ title: "Details" }, grid(3,
      ft({ glyph: I.symbols, label: "Symbols", tip: "Music notes, sweat, Zz and the rest next to the bar blob", on: isOn("", "barAccessories", true), act: on(() => flip("", "barAccessories", true)) }) +
      ft({ glyph: I.hat, label: "Outfits", tip: "Hats, headphones and glasses on the bar blob", on: isOn("", "barWear", true), act: on(() => flip("", "barWear", true)) }) +
      ft({ glyph: I.walk, label: "Walks", tip: "Now and then it visits another widget", on: isOn("", "barWalk", true), act: on(() => flip("", "barWalk", true)) })));
}

// --- Shortcuts and Long commands: what OmaBlob has and only a Hyprland/bash desktop can do ------
const DEFAULT_RING_KEY = "SUPER + ALT + B";
const SNIPPET = "~/.config/omarchy/plugins/m44f4.blobble/bin/blobble.bash";

// A keyboard event as Hyprland names the combination ("SUPER + ALT + B"), or "" until a key that
// can stand alone is pressed.
const KEY_NAMES = { Space: "SPACE", Enter: "RETURN", NumpadEnter: "RETURN", Tab: "TAB", ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN",
  Home: "HOME", End: "END", PageUp: "PRIOR", PageDown: "NEXT", Insert: "INSERT", Delete: "DELETE", Comma: "COMMA", Period: "PERIOD", Slash: "SLASH", Minus: "MINUS",
  Equal: "EQUAL", Semicolon: "SEMICOLON", Quote: "APOSTROPHE", BracketLeft: "BRACKETLEFT", BracketRight: "BRACKETRIGHT", Backslash: "BACKSLASH", Backquote: "GRAVE" };
// WebKitGTK does not report the Super key in metaKey (it is a different modifier to GTK), so it is
// followed through its own key events.
let superHeld = false;
const isSuper = (e) => e.key === "Super" || e.key === "Meta" || e.key === "OS" || /^(Meta|OS)(Left|Right)$/.test(e.code);
window.addEventListener("keydown", (e) => { if (isSuper(e)) superHeld = true; }, true);
window.addEventListener("keyup", (e) => { if (isSuper(e)) superHeld = false; }, true);
window.addEventListener("blur", () => { superHeld = false; });
function combo(e) {
  const mods = [(e.metaKey || superHeld) && "SUPER", e.ctrlKey && "CTRL", e.altKey && "ALT", e.shiftKey && "SHIFT"].filter(Boolean);
  let key = KEY_NAMES[e.code] || "";
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d+$/.test(e.code)) key = e.code;
  return { mods, key, text: mods.join(" + ") };
}

// Which shortcut is being recorded, and what other binds already use each combination.
let recording = null;
const taken = {};
function takenBy(h, keys) {
  if (!keys) return "";
  if (taken[keys] === undefined) {
    taken[keys] = "";
    window.__TAURI__.core.invoke("keys_taken", { combo: keys }).then((who) => { if (who !== taken[keys]) { taken[keys] = who; h.render(); } }).catch(() => {});
  }
  return taken[keys];
}
// One recorder for the whole page: while one is armed, the next key combination is its shortcut.
let armedFor = null;
window.addEventListener("keydown", (e) => {
  if (!recording || !armedFor) return;
  e.preventDefault(); e.stopPropagation();
  const { key, mods, text } = combo(e);
  const h = armedFor, name = recording;
  if (e.key === "Escape") { recording = null; h.render(); return; }
  if (e.key === "Backspace" && !mods.length) { recording = null; h.saveIn("keys", name, ""); return; }
  if (!key) return;                                                  // just a modifier so far
  // A lone key would steal it from every app; F keys are fine alone.
  const plain = mods.length === 0 || (mods.length === 1 && mods[0] === "SHIFT");
  if (plain && !/^F\d+$/.test(key)) return;
  recording = null;
  h.saveIn("keys", name, mods.concat([key]).join(" + "));
}, true);

function keyRecorder(h, name, label, fallback) {
  const value = String(h.groupValue("keys", name, fallback));
  const rec = recording === name;
  const who = takenBy(h, value);
  return `<div class="keyrec"><div class="name">${esc(label)}</div><div class="row" style="flex-wrap:nowrap">` +
    `<button class="btn bordered keybox${rec ? " selected" : ""}" data-act="${on(() => { recording = rec ? null : name; armedFor = h; h.render(); })}">` +
    `${rec ? "Press the keys..." : value ? esc(value) : "Not set"}</button>` +
    (fallback ? `<button class="btn small" data-act="${on(() => h.saveIn("keys", name, fallback))}" data-tip="Back to the default">Reset</button>` : "") +
    `<button class="btn small" data-act="${on(() => h.saveIn("keys", name, ""))}" data-tip="No shortcut">Clear</button></div>` +
    (who ? `<p class="caption warn">Already used by ${esc(who)}</p>` : "") + `</div>`;
}

// The Features tab's extras: two tiles in the list, and the cards under it.
function features(h, kit) {
  const { ft, isOn, flip } = kit;
  const keysOn = h.groupValue("keys", "enabled", false) === true;
  const commandsOn = h.groupValue("reactions", "commands", true) === true;
  const afterTimer = ft({ glyph: I.console, label: "Long commands", tip: "Cheers or sulks when a long command ends in your shell. Needs a line in your shell setup (below)",
    on: commandsOn, act: on(() => flip("reactions", "commands", true)) });
  const afterAntics = ft({ glyph: I.walk, label: "Walks the bar", tip: "Now and then it visits another widget", on: isOn("", "barWalk", true), act: on(() => flip("", "barWalk", true)) }) +
    ft({ glyph: I.shortcut, label: "Shortcuts", tip: "Keys that open the ring and this panel. Added to Hyprland while Blobble runs; your config files are not changed",
      on: keysOn, act: on(() => flip("keys", "enabled", false)) });
  let cards = "";
  if (keysOn) {
    cards += card({ title: "Shortcuts", info: "Added to Hyprland while Blobble runs. Your config files are not changed." },
      keyRecorder(h, "ring", "Open the ring", DEFAULT_RING_KEY) + keyRecorder(h, "popup", "Open this panel", "") +
      caption("Without the desktop pet, the ring key opens this panel."));
  }
  if (commandsOn) {
    cards += card({ title: "Long commands setup", info: "A command that took half a minute or more makes the blob cheer (it worked) or sulk (it failed)." },
      caption("Add this line to ~/.bashrc, then open a new terminal:") + commandBlock("source " + SNIPPET));
  }
  return { afterTimer, afterAntics, cards };
}

// What goes on around the pet page here: the layer behaviour every layer shell desktop has, plus
// the bar widget's side of the conversation.
function host(ctx) {
  const { service, invoke, listen, emitTo, log, BlobView } = ctx;
  const layer = layerHost(ctx);
  let plugin = false, helloAt = 0, slotAlong = 0;
  let info = null;                  // the bar and the cursor, from Hyprland: { edge, thickness, w, h, cursor }
  let walkDir = 0;                  // the widget is walking the blob along the bar: -1, 1, or 0 standing
  const BAR_ROOM = 0.5;             // must match roomAround in the widget

  async function openPanelAt(along, page) {
    await invoke("panel_at", { along, width: PANEL_WIDTH }).catch((e) => log("panel_at failed:", String(e)));
    emitTo("panel", "panel:toggle", page ? "open:" + page : "");
  }

  listen("bar:ctl", (e) => {
    const [cmd, arg] = String(e.payload).trim().split(/\s+/);
    const num = Number(arg);
    if (Number.isFinite(num) && arg !== undefined && (cmd === "hello" || cmd === "panel")) slotAlong = num;
    if (cmd === "hello") {
      helloAt = Date.now();
      if (!plugin) { plugin = true; invoke("show_tray", { on: false }).catch(() => {}); ctx.refresh(); }
    } else if (cmd === "panel") openPanelAt(slotAlong);
    else if (cmd === "open") openPanelAt(slotAlong, arg);   // a page by name, e.g. `blobble --bar open settings`
    else if (cmd === "poke") service.poke();
    else if (cmd === "btop") invoke("run_action", { id: "btop" }).catch(() => {});
    else if (cmd === "command") service.commandDone(num, Number(String(e.payload).trim().split(/\s+/)[2]));   // a long command ended
    else if (cmd === "ring") { if (service.petEnabled) emitTo("pet", "pet:ring", ""); else openPanelAt(slotAlong); }
    else if (cmd === "toggle") openPanelAt(slotAlong);
    else if (cmd === "simulate") service.simulate(arg);
    // For recordings and tests: `set <setting> <json>`, `focus <minutes>`, `togglepet`.
    else if (cmd === "set") {
      const [, key, ...rest] = String(e.payload).trim().split(/\s+/);
      try { service.save(key, JSON.parse(rest.join(" "))); } catch (err) { log("set failed:", String(err)); }
    } else if (cmd === "focus") service.startFocus(num || 25);
    else if (cmd === "stopfocus") service.stopFocus();
    else if (cmd === "resetpet") service.command({ name: "resetPet" });
    else if (cmd === "togglepet") service.togglePet();
    else if (cmd === "walk") walkDir = Math.max(-1, Math.min(1, num || 0));
    else if (cmd === "antic" && barView) barView.doAntic(arg);
  });
  // The widget says hello every ten seconds. Without it for forty, it is gone (removed from the bar,
  // or the plugin switched off), and the app goes with it, as OmaBlob does: there it all lives inside
  // the plugin. (An app that never met the widget stays, with its tray icon.)
  setInterval(() => {
    if (plugin && Date.now() - helloAt > 40000) invoke("quit_app").catch(() => {});
  }, 5000);

  // The blob for the widget, written to a file it shows, like OmaBlob's bar blob: alive, in its own
  // colours and reacting, while Blobble is on and the pet is in the bar; still, in the bar's text
  // colour, when it is off (asleep, dim), while the pet is out, and while the panel is open.
  const barEl = document.createElement("div");
  barEl.style.cssText = "position:absolute;left:-400px;top:40px;width:64px;height:64px;pointer-events:none";
  document.body.appendChild(barEl);
  let barView = null, barSent = "", barConf = "", tick = 0;
  // A worker's clock, not setTimeout: a hidden page's timers are held to one a second.
  const clock = new Worker(URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 40)"], { type: "text/javascript" })));
  clock.onmessage = () => drawBar();

  let lastCursor = null;
  async function readBar() {
    try { info = await invoke("bar_info"); } catch (e) { info = null; }
    // Typing is input with no pointer movement: the brain needs to know when the pointer last moved.
    const c = info && info.cursor;
    if (c && (!lastCursor || Math.abs(c[0] - lastCursor[0]) + Math.abs(c[1] - lastCursor[1]) > 1)) service.lastPointerMove = Date.now();
    if (c) lastCursor = c;
  }
  const isLive = () => service.active && !service.petEnabled && !layer.catching();
  // The bar blob hops and does its idle tricks too, as OmaBlob's does.
  service.on("hop", (size, lean) => { if (barView && isLive()) barView.hop(size, lean); });
  service.on("antic", (name) => { if (barView && isLive() && !walkDir) barView.doAntic(name); });

  // The shortcuts: bound in Hyprland while Blobble runs (see keys.rs), again when its config reloads.
  let keysSoon = 0;
  function applyKeys() {
    clearTimeout(keysSoon);
    keysSoon = setTimeout(() => {
      const g = service.group("keys");
      const on = g.enabled === true;
      invoke("keys_apply", { ring: on ? String(g.ring === undefined ? DEFAULT_RING_KEY : g.ring) : "", popup: on ? String(g.popup || "") : "" }).catch(() => {});
    }, 400);
  }
  service.on("settings", (now, before) => { if (JSON.stringify(now.keys) !== JSON.stringify((before || {}).keys)) applyKeys(); });
  service.on("keys", applyKeys);
  setTimeout(applyKeys, 3000);
  // Where the blob's centre is on the screen (CSS px of the overlay): in its slot, in the bar.
  function blobCentre() {
    if (!info || !plugin) return null;
    const t = info.thickness / 2;
    switch (info.edge) {
      case "bottom": return { x: slotAlong, y: info.h - t };
      case "left": return { x: t, y: slotAlong };
      case "right": return { x: info.w - t, y: slotAlong };
      default: return { x: slotAlong, y: t };
    }
  }

  function drawBar() {
    if (!plugin) return;
    if (tick++ % 2 === 0) readBar();   // the cursor and the bar, five times a second
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
    const on = service.active, live = on && !service.petEnabled && !layer.catching();
    const mono = /^#[0-9a-f]{6}$/i.test(fg) && !live ? { themeMode: "exact", bodyColour: fg } : {};
    const props = { seed: service.seed, accent: service.accent, reduceMotion: service.reduceMotion || !live,
      look: Object.assign({}, service.look, mono, on ? {} : { restingFace: "sleepy" }),
      mood: Object.assign({}, service.mood, live && service.setting("barAccessories", true) !== false ? {} : { accessories: [] }),
      showWear: live && service.setting("barWear", true) !== false,
      gazeEnabled: live && service.reacts("gaze"), foreground: fg || "#e6e6ec",
      walk: live && walkDir ? 1 : 0, walkDir: walkDir || 1 };
    if (!barView) barView = new BlobView(barEl, Object.assign({ size: 64, fit: true }, props))   // framed with what it wears, as OmaBlob frames it: a hat makes the body a little smaller;
    else barView.set(props);
    // The eyes follow the cursor, as OmaBlob's do.
    const c = blobCentre();
    if (c && info && info.cursor && live) barView.setCursor(info.cursor[0] - c.x, info.cursor[1] - c.y);
    else barView.setCursor(null);
    barView.frame(performance.now());   // by hand: a hidden page gets no animation frames
    let svg = barEl.innerHTML;
    // Room around the blob for its symbols and hats, which hang outside the picture's box: the
    // widget shows the picture bigger by the same amount, so the blob keeps its size.
    svg = svg.replace(/width="64" height="64" viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/, (m, x, y, w, h) => {
      const px = w * BAR_ROOM, py = h * BAR_ROOM;
      return `width="${64 * (1 + 2 * BAR_ROOM)}" height="${64 * (1 + 2 * BAR_ROOM)}" viewBox="${x - px} ${y - py} ${+w + 2 * px} ${+h + 2 * py}"`;
    });
    if (!on) svg = svg.replace("<svg ", '<svg opacity="0.45" ');
    if (svg !== barSent) { barSent = svg; invoke("write_bar_file", { name: "bar.svg", text: svg }).catch(() => {}); }
    // What the widget needs to know: its size, whether it walks, and what the blob is doing.
    const m = service.mood || {};
    const conf = JSON.stringify({ scale: barScale(service.setting("barBlobSize", "medium")), walks: service.setting("barWalk", true) !== false && !service.reduceMotion,
      asleep: !!service.asleep, playing: !!(m.motion && m.motion.bob > 0), live });
    if (conf !== barConf) { barConf = conf; invoke("write_bar_file", { name: "bar.json", text: conf }).catch(() => {}); }
  }

  return {
    catching: layer.catching,
    // Open the panel at the widget, from anywhere (the pet's ring, its pills).
    openPanel: (page) => openPanelAt(slotAlong, page),
    // Back into the bar: the blob flies to its slot.
    flightTarget(size, pad) {
      const c = blobCentre();
      return c ? { x: c.x - size / 2 - pad, y: c.y - size / 2 - pad } : null;
    },
    // On Omarchy the bar widget is the blob's home while it is loaded.
    inBar: () => plugin,
  };
}

export default {
  id: "omarchy",
  os: "linux",
  name: "Linux",
  words: { home: "bar", back: "Back to the bar", trip: "Trips to the bar", tripTip: "Flies into the bar and back out", autostartTip: "Starts quietly in the bar when you sign in" },
  defaultHome: "bottom-right",
  taskbarHome: false,
  mapBar: true,
  startLabel: null,   // the bar widget starts the app with the shell, like any installed plugin
  monitorName: "btop",
  aboutLine: "lives in your bar",
  actionLabels: { open: "Open Blobble", bar: "Back to the bar", btop: "System monitor", dnd: "Do not disturb", power: "Power mode", nightlight: "Night light" },
  missingActions: ["ocr", "keyboard"],
  // What Hyprland, Omarchy's notifications and the sensors give it (see src-tauri/src/events.rs).
  reactions: ["music", "workload", "sleep", "battery", "gaze", "poke", "disk", "network",
    "breaks", "downloads", "theme", "bedtime", "eyes", "water", "notifications", "workspaces", "windows", "attention", "privacy", "updates", "power", "typing", "commands"],
  nativeColourPicker: false,
  // The buttons, bars and borders use the theme's accent; the blob's own accent (Edit > Colour) only tints the blob, as in OmaBlob.
  uiAccentFromTheme: true,
  sizePreviews: true,   // the size picker's tiles show the blob at a growing size, like OmaBlob's
  // The taskbar and the tray as the pet page asks for them (see taskbar.js).
  taskbar: createTaskbar,
  settingsTab: { label: "Bar", page: barPage },
  features,
  panelWidth: PANEL_WIDTH,
  panelAir: 0,   // no see-through margin around the card
  panelMaxHeight: 660,   // OmaBlob's popup is never taller
  host,
};
