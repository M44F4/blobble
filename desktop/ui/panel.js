// The panel above the tray, like OmaBlob's popup: the blob and its day, Edit and Studio, the
// desktop pet, the Pomodoro, the timer and Settings. It shows what the pet page's brain sends
// ("state") and asks it to change things ("cmd").
import { log } from "./shared/log.js";
import * as Platform from "./shared/platform.js";
import { applyShellStyle } from "./shared/shellstyle.js";
import { applyAccentPalette } from "./shared/palette.js";
import * as Render from "./core/Render.mjs";
import * as Mood from "./core/MoodEngine.mjs";
import { BlobView } from "./shared/blobview.js";
import { icon, I } from "./shared/icons.js";
import * as P from "./panel/pages.js";
import { resetHandlers, handler, on, action, toggle, esc, withScope } from "./panel/ui.js";
import { GIFEncoder, quantize, applyPalette } from "./vendor/gifenc.js";

const { invoke, Channel } = window.__TAURI__.core;
const { listen, emitTo } = window.__TAURI__.event;
const { getCurrentWindow, primaryMonitor, currentMonitor } = window.__TAURI__.window;
const { PhysicalPosition, PhysicalSize, LogicalSize } = window.__TAURI__.dpi;

const win = getCurrentWindow();
const $ = (id) => document.getElementById(id);
const scrollEl = $("scroll"), titleEl = $("title"), contentEl = $("content"), shellEl = $("shell"), tipEl = $("tip");

// Where the panel is a layer (a Linux desktop with a layer shell) it is sized and placed by the compositor.
const LAYER = !!Platform.desktop.host;
const WIDTH = Platform.desktop.panelWidth;
const AIR = Platform.desktop.panelAir === undefined ? 8 : Platform.desktop.panelAir;   // see-through margin around the card          // the window, CSS px; the card has 8 px of air around it
const MAX_HEIGHT = 680;
const EDITOR_HEIGHT = 660;

let st = null;
let page = "blob";
let isOpen = false;
let closedAt = 0;
let studio = null;
const ui = { editorTab: "look", settingsTab: "reactions", petSub: "place", paletteFor: "body" };

const isHex = (v) => /^#?[0-9a-fA-F]{6}$/.test(String(v || "").trim());
function lookOf(s) {
  return {
    shape: s.shape || "seed", hue: s.hue === undefined ? "seed" : s.hue, tone: s.tone === undefined ? "seed" : s.tone,
    background: s.background || "none", backdropColour: s.backdropColour || "auto",
    themeMode: s.themeMode || "tinted", bodyColour: s.bodyColour || "", restingFace: s.restingFace || "idle",
  };
}
const pick = (o, name, fallback) => { const v = o ? o[name] : undefined; return v === undefined || v === null ? fallback : v; };

// --- the host the pages talk to (OmaBlob's bar widget, in short) -----------------------------
const host = {
  openUrl(url) { invoke("open_url", { url }).catch(() => {}); },
  ui,
  get st() { return st; },
  get page() { return page; },
  get data() { return st.settings; },
  setting(name, fallback) { return pick(st.settings, name, fallback); },
  group(name) { const v = st.settings[name]; return v && typeof v === "object" ? v : {}; },
  groupValue(g, name, fallback) { return pick(host.group(g), name, fallback); },
  get seed() { return st.settings.seed || st.username || "blob"; },
  get look() { return lookOf(st.settings); },
  get accent() { return isHex(st.settings.accentColour) ? st.settings.accentColour : st.themeAccent; },
  get active() { return st.settings.active !== false; },
  get fg() { return st.dark ? "#e6e6ec" : "#1d1d24"; },
  cmd(name, ...args) { emitTo("pet", "cmd", { name, args }); },
  // Saved at once here so the page answers straight away; the brain saves it for real.
  save(name, value, quiet) { const c = {}; c[name] = value; host.saveMany(c, quiet); },
  saveIn(g, name, value) { const o = Object.assign({}, host.group(g)); o[name] = value; host.save(g, o); },
  saveMany(changes, quiet) {
    st.settings = Object.assign({}, st.settings, changes);
    if (changes.accentColour !== undefined) st.accent = host.accent;
    host.cmd("saveMany", changes);
    if (quiet) refreshPreviews(); else render();
  },
  go(p) { const [name, tab] = String(p).split("/"); page = name || "blob"; if (tab) ui.editorTab = tab; ensureStudio(); render(false, true); },
  close() { hide(); },
  render(toTop) { render(toTop); },
  exportStudio(mode) { exportStudio(mode); },
  studioFrom(which) { studioFrom(which); },
};

// The Studio's stand-in: the same calls, but everything lives in an in-memory pose.
const studioHost = {
  ui, studioMode: true,
  get st() { return st; },
  get data() { return studio || {}; },
  get fg() { return host.fg; },
  setting(name, fallback) { return pick(studio, name, fallback); },
  group(name) { const v = (studio || {})[name]; return v && typeof v === "object" ? v : {}; },
  groupValue(g, name, fallback) { return pick(studioHost.group(g), name, fallback); },
  get seed() { return studioHost.setting("seed", "") || host.seed; },
  get look() { return lookOf(studio || {}); },
  get accent() { return isHex(studioHost.setting("accentColour", "")) ? studio.accentColour : host.accent; },
  save(name, value, quiet) { const c = {}; c[name] = value; studioHost.saveMany(c, quiet); },
  saveIn(g, name, value) { const o = Object.assign({}, studioHost.group(g)); o[name] = value; studioHost.save(g, o); },
  saveMany(changes, quiet) {
    studio = Object.assign({}, studio, changes);
    host.cmd("keepStudio", studio);
    ui.lastExport = "";
    if (quiet) refreshPreviews(); else render();
  },
  render(toTop) { render(toTop); },
};

const LOOK_KEYS = ["seed", "shape", "hue", "tone", "background", "backdropColour", "themeMode", "bodyColour", "restingFace",
  "accentColour", "wearHead", "wearFace", "wearNeck", "wearEars", "wearHand", "wearColour"];
function studioFrom(which) {
  const fresh = { symbols: [], states: [], motion: "still", size: 512, fill: true };
  if (which === "last" && st.lastStudio && Object.keys(st.lastStudio).length) studio = Object.assign({}, st.lastStudio);
  else {
    studio = fresh;
    LOOK_KEYS.forEach((k) => { if (st.settings[k] !== undefined) studio[k] = st.settings[k]; });
  }
  host.cmd("keepStudio", studio);
  render();
}
function ensureStudio() { if (page === "studio" && !studio) studioFrom(host.setting("studioStart", "last")); }

// --- drawing the page ---------------------------------------------------------------------------
const PAGES = ["blob", "appearance", "studio", "pet", "pomodoro", "timer", "settings"];
const TITLES = { welcome: "Welcome", appearance: "Edit", studio: "Edit", settings: "Settings", pet: "Desktop pet", pomodoro: "Pomodoro", timer: "Timer" };
let heroView = null, previewView = null, motionTiles = [];
let shapeKey = "";

function titleRow() {
  const onBlob = page === "blob";
  const p = st.pomo, t = st.timer;
  return (onBlob ? "" : action({ glyph: I.back, tip: "Back to your blob", act: on(() => host.go("blob")) })) +
    `<h1>${esc(TITLES[page] || "Blobble")}</h1>` + (onBlob ? `<span class="version">v${esc(st.version)}</span>` : "") +
    `<span class="grow"></span>` +
    (p.on ? action({ html: icon("tomato"), lit: p.focusing, bordered: page === "pomodoro",
      tip: page === "pomodoro" ? "Back to your blob" : p.focusing ? `Pomodoro: ${p.label} ${p.clock}` : "Pomodoro",
      act: on(() => host.go(page === "pomodoro" ? "blob" : "pomodoro")) }) : "") +
    (t.on ? action({ glyph: I.timer, lit: t.timing, bordered: page === "timer",
      tip: page === "timer" ? "Back to your blob" : t.timing ? "Timer: " + t.clock : "Timer",
      act: on(() => host.go(page === "timer" ? "blob" : "timer")) }) : "") +
    (p.on || t.on ? `<span class="divider"></span>` : "") +
    action({ glyph: I.settings, bordered: page === "settings", tip: page === "settings" ? "Back to your blob" : "Settings",
      act: on(() => host.go(page === "settings" ? "blob" : "settings")) }) +
    `<span class="divider"></span>` +
    toggle({ checked: host.active, small: true, tip: host.active ? "Blobble is on" : "Blobble is off", act: on(() => host.save("active", !host.active)) });
}

function pageHtml() {
  switch (page) {
    case "appearance": case "studio": return P.editorPage(host, studioHost);
    case "pet": return `<div class="page">${P.petPage(host)}</div>`;
    case "pomodoro": return `<div class="page">${P.pomodoroPage(host)}</div>`;
    case "timer": return `<div class="page">${P.timerPage(host)}</div>`;
    case "settings": return `<div class="page">${P.settingsPage(host)}</div>`;
    case "welcome": return `<div class="page">${P.welcomePage(host)}</div>`;
    default: return `<div class="page">${P.infoPage(host)}</div>`;
  }
}

// What changes the page's layout (anything else is updated in place).
function layoutKey() {
  return JSON.stringify([page, ui, st.settings, studio, st.taskbarEdge, st.petEnabled, st.autostart, st.bedtimeDue, !!st.player, st.hasBattery, st.temp != null, st.dark,
    st.pomo.on, st.pomo.focusing, st.pomo.paused, st.pomo.onBreak, st.timer.on, st.timer.timing, st.timer.paused, st.themeAccent,
    page === "blob" ? st.today : 0, page === "pet" ? st.mood.face : 0, page === "appearance" ? [st.mood.reasons, st.mood.dressedBy, st.mood.wear] : 0]);
}

// toTop: start the page at the top (a new page or tab); otherwise keep where you were.
function render(toTop, fresh) {
  if (!st) return;
  const top = fresh || toTop === true ? 0 : scrollEl.scrollTop;
  const active = document.activeElement;
  const keep = active && active.dataset && active.dataset.keep;
  const sel = keep ? [active.selectionStart, active.selectionEnd] : null;
  resetHandlers();
  stopWelcome();
  if (heroView) heroView.destroy();
  if (previewView) previewView.destroy();
  heroView = previewView = null;
  titleEl.innerHTML = withScope("title", titleRow);
  titleEl.dataset.key = titleKey();
  contentEl.innerHTML = pageHtml();
  mountLive();
  scrollEl.scrollTop = top;
  if (keep) {
    const again = contentEl.querySelector(`[data-keep="${keep}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } }
  }
  shapeKey = layoutKey();
  fitWindow();
}

// --- the welcome guide's live blob: a demo for each step, as in OmaBlob's tutorial -----------------
const SCENES = [
  { label: "Music playing", input: { music: { playing: true } } },
  { label: "Music + a busy CPU", input: { music: { playing: true }, load: { cpu: 96, strainedSince: 1 } } },
  { label: "A notification", input: { events: [{ kind: "notify", at: -1 }] } },
  { label: "You stepped away", input: { asleep: true } },
  { label: "Charging", input: { battery: { present: true, percent: 60, charging: true } } },
];
const OUTFITS = [{ head: "tophat" }, { face: "sunglasses" }, { ears: "cat" }, { head: "party", neck: "bowtie" }, { head: "crown" }, { ears: "bunny", face: "glasses" }];
let welcomeView = null, welcomeTimers = [];
function stopWelcome() {
  welcomeTimers.forEach((t) => clearInterval(t));
  welcomeTimers = [];
  if (welcomeView) welcomeView.destroy();
  welcomeView = null;
}
// A few made-up moments run through the real mood engine, so the demo shows what the blob would do.
function sceneMood(i) {
  const now = 100000, s = SCENES[i].input;
  const input = Object.assign({ now }, s);
  if (s.load) input.load = Object.assign({}, s.load, { strainedSince: now - 60000 });
  if (s.events) input.events = [{ kind: "notify", at: now - 200 }];
  return Mood.resolve(input);
}
function mountWelcome() {
  stopWelcome();
  const el = $("wblob");
  if (!el) return;
  const step = ui.welcomeStep || 0;
  const every = (ms, fn) => welcomeTimers.push(setInterval(fn, ms));
  const view = welcomeView = new BlobView(el, { seed: host.seed, look: host.look, accent: host.accent, size: 120, accessoryScale: 0.26, foreground: host.fg,
    mood: step === 1 ? sceneMood(0) : st.mood, gazeEnabled: [0, 2, 7].indexOf(step) >= 0 && host.groupValue("reactions", "gaze", true) === true,
    reduceMotion: host.setting("reduceMotion", false) === true });
  if (step === 0) setTimeout(() => view.doAntic("wiggle"), 200);
  else if (step === 6) { setTimeout(() => view.doAntic("spin"), 200); let n = 0; every(1800, () => view.doAntic(["hop2", "wiggle", "spin", "nod"][++n % 4])); }
  else setTimeout(() => view.hop(1, 0), 200);
  if (step === 1) {
    let k = 0;
    const show = () => { view.set({ mood: sceneMood(k) }); $("wlabel").textContent = SCENES[k].label; };
    show();
    every(2600, () => { k = (k + 1) % SCENES.length; show(); if (sceneMood(k).motion && sceneMood(k).motion.hop) view.hop(); });
  } else if (step === 2) {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => { host.cmd("poke"); view.hop(1, 0); });
  } else if (step === 3) {
    let k = 0;
    view.set({ wear: OUTFITS[0] });
    every(1300, () => { k = (k + 1) % OUTFITS.length; view.set({ wear: OUTFITS[k] }); view.hop(0.6, 0); });
  } else if (step === 4) {
    // It walks from one side to the other and back.
    let x = -110, dir = 1;
    view.set({ walk: 1, walkDir: 1 });
    every(33, () => {
      x += dir * 110 / (2600 / 33);
      if (x > 110) { x = 110; dir = -1; view.set({ walkDir: -1 }); } else if (x < -110) { x = -110; dir = 1; view.set({ walkDir: 1 }); }
      el.style.transform = `translateX(${x.toFixed(1)}px)`;
    });
  } else if (step === 5) {
    view.set({ wear: { head: "headband" } });
    let secs = 25 * 60;
    const clock = () => { $("wclock").textContent = Math.floor(secs / 60) + ":" + ("0" + secs % 60).slice(-2); };
    clock();
    every(1000, () => { secs--; clock(); });
  }
}

function mountLive() {
  mountWelcome();
  const heroEl = $("hero");
  if (heroEl) heroView = new BlobView(heroEl, { seed: host.seed, look: host.look, accent: host.accent, mood: st.mood, size: 92,
    reduceMotion: host.setting("reduceMotion", false) === true, accessoryScale: 0.26, foreground: host.fg });
  const prevEl = $("preview");
  if (prevEl) {
    const studioMode = page === "studio";
    const h = studioMode ? studioHost : host;
    previewView = new BlobView(prevEl, { seed: h.seed, look: h.look, accent: h.accent, size: 96, fit: true, frameSymbols: true, foreground: host.fg,
      mood: studioMode ? P.studioMood(studioHost) : st.mood, still: false, gazeEnabled: !studioMode,
      reduceMotion: host.setting("reduceMotion", false) === true });
  }
  motionTiles = Array.from(contentEl.querySelectorAll("[data-motion]"));
}

// Previews only: after typing a name, without rebuilding the page.
function refreshPreviews() {
  if (heroView) heroView.set({ seed: host.seed, look: host.look, accent: host.accent });
  if (previewView) {
    const h = page === "studio" ? studioHost : host;
    previewView.set({ seed: h.seed, look: h.look, accent: h.accent });
  }
}

// Live bits: the blob's mood, stats, music and clocks.
function liveUpdate() {
  if (heroView) heroView.set({ mood: st.mood });
  if (previewView && page !== "studio") previewView.set({ mood: st.mood });
  const reasons = $("reasons");
  if (reasons && host.groupValue("sections", "reasons", true) === true) {
    reasons.innerHTML = (st.mood.reasons || []).map((r) => `<div class="why">${esc(r.label + (r.detail ? " · " + r.detail : ""))}</div>`).join("");
  }
  const stats = $("stats");
  if (stats) stats.innerHTML = P.statsHtml(host);
  // Rebuilt only when they change, so a hovered button keeps its tooltip.
  const media = $("media");
  const mediaKey = JSON.stringify(st.player);
  if (media && media.dataset.key !== mediaKey) {
    media.innerHTML = withScope("media", () => P.mediaCard(host));
    media.dataset.key = mediaKey;
  }
  const pomo = $("pomoclock");
  if (pomo) pomo.innerHTML = P.pomoClockHtml(host);
  const timer = $("timerclock");
  if (timer) timer.innerHTML = P.timerClockHtml(host);
  if (titleEl.dataset.key !== titleKey()) {
    titleEl.innerHTML = withScope("title", titleRow);
    titleEl.dataset.key = titleKey();
  }
}
function titleKey() {
  const p = st.pomo, t = st.timer;
  return [page, p.on, p.focusing, p.label, p.clock, t.on, t.timing, t.clock, st.settings.active].join("|");
}

// The Studio's motion tiles play their motion.
function animateTiles(now) {
  requestAnimationFrame(animateTiles);
  if (!isOpen || !motionTiles.length || page !== "studio") return;
  const s = studio || {};
  motionTiles.forEach((el) => {
    const name = el.dataset.motion;
    const t = ((now / 1000) / Render.MOTION_SECONDS[name]) % 1;
    el.innerHTML = Render.svg({ seed: studioHost.seed, look: Object.assign({}, studioHost.look, { background: "none" }), accent: studioHost.accent,
      face: s.restingFace || "idle", wear: {}, pose: Render.motionPose(name, t), motion: name, size: 48, foreground: host.fg });
  });
}

// --- clicks, typing and tooltips --------------------------------------------------------------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = handler(el.dataset.act);
  if (fn) { e.stopPropagation(); fn(e); }
});
// A slider's filled part follows the thumb while it moves (see .slider in panel.css).
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains("slider")) t.style.setProperty("--p", ((t.value - t.min) / (t.max - t.min) * 100) + "%");
});
document.addEventListener("input", (e) => {
  const fn = e.target.dataset && handler(e.target.dataset.input);
  if (fn) fn(e);
});
document.addEventListener("change", (e) => {
  const fn = e.target.dataset && handler(e.target.dataset.change);
  if (fn) fn(e);
});
// Drag the last Studio export out, into a chat or a folder (like OmaBlob's drag tile).
document.addEventListener("mousedown", (e) => {
  const tile = e.target.closest("[data-drag]");
  if (!tile || !ui.lastExport || e.button !== 0) return;
  e.preventDefault();
  const events = new Channel();
  events.onmessage = () => {};
  invoke("plugin:drag|start_drag", { item: [ui.lastExport], image: ui.lastThumb, options: { mode: "copy" }, onEvent: events })
    .catch((err) => log("drag failed:", String(err)));
});
let tipTimer = null;
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  clearTimeout(tipTimer);
  if (!el) { tipEl.classList.remove("on"); return; }
  tipTimer = setTimeout(() => {
    tipEl.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tipEl.style.left = "0px"; tipEl.style.top = "0px";
    const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    const x = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2));
    const y = r.top - hgt - 6 > 4 ? r.top - hgt - 6 : r.bottom + 6;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
    tipEl.classList.add("on");
  }, 450);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { hide(); return; }
  // The welcome guide: arrows, Enter and Space turn its pages.
  if (page === "welcome" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const at = ui.welcomeStep || 0;
    const to = e.key === "ArrowRight" || e.key === "Enter" || e.key === " " ? at + 1 : e.key === "ArrowLeft" ? at - 1 : null;
    if (to !== null) {
      e.preventDefault();
      if (to > P.WELCOME_LAST) { ui.welcomeStep = 0; host.go("blob"); }
      else if (to >= 0) { ui.welcomeStep = to; render(true); }
      return;
    }
  }
  if (e.ctrlKey && (e.key === "Tab" || e.key === "PageDown" || e.key === "PageUp")) {
    const list = ["blob", "appearance", "studio", "pet"].concat(st.pomo.on ? ["pomodoro"] : []).concat(["settings"]);
    const back = e.shiftKey || e.key === "PageUp";
    const i = list.indexOf(PAGES.indexOf(page) < 0 ? "blob" : page);
    host.go(list[((i < 0 ? 0 : i + (back ? -1 : 1)) % list.length + list.length) % list.length]);
    e.preventDefault();
  }
});

// --- the window: a flyout above the tray --------------------------------------------------------
let mon = null;
let heightCap = MAX_HEIGHT;   // the card's tallest, so it fits a screen of any shape
// A layer takes input only over the card (the rest of its window is see-through and reaches the
// desktop), with some room above and below for the card sliding in.
function sendRegion() {
  if (!LAYER || !isOpen) return;
  const r = shellEl.getBoundingClientRect();
  invoke("hit_region", { rects: [[Math.max(0, Math.floor(r.left) - 2), Math.max(0, Math.floor(r.top) - 12), Math.ceil(r.right) + 2, Math.ceil(r.bottom) + 12]] }).catch(() => {});
}
let refitSoon = 0;
if (LAYER) new ResizeObserver(() => { clearTimeout(refitSoon); refitSoon = setTimeout(() => { if (isOpen) fitWindow(); }, 60); }).observe(contentEl);
async function fitWindow() {
  if (!isOpen) return;
  const tall = page === "appearance" || page === "studio";
  // A layer measures the card as it naturally is (no height set); Windows keeps its own sum.
  let content;
  if (LAYER) { shellEl.style.height = "auto"; content = shellEl.clientHeight; }
  else content = titleEl.offsetHeight + 12 + contentEl.scrollHeight + 30;
  const h = Math.round(Math.min(heightCap, MAX_HEIGHT, tall ? EDITOR_HEIGHT : content));
  shellEl.style.height = h + "px";
  if (LAYER) { sendRegion(); return; }   // the layer is the free height beside the bar; only the card changes
  const want = h + 16;
  if (!mon || Math.abs((mon.h || 0) - want) < 2) return;
  mon.h = want;
  await place();
}
async function place() {
  // Wayland has no primary monitor: then the one the panel is on (a layer there, see overlay.rs).
  const m = (await primaryMonitor()) || (await currentMonitor());
  if (!m) return;
  const sf = m.scaleFactor;
  const wa = m.workArea || { position: m.position, size: m.size };
  // The work area minus the 4 px gap at each end and the 16 px of air around the card.
  heightCap = Math.max(160, Math.floor(wa.size.height / sf) - 8 - 16);
  if (LAYER) {
    // The bar's side and the room it leaves, as the layer was placed (see overlay.rs panel_at).
    const [side, room, slide] = (await invoke("panel_info").catch(() => null)) || ["", 0, 0];
    if (room > 0) heightCap = Math.max(160, Math.min(room - 2 * AIR, Platform.desktop.panelMaxHeight || 9999));
    document.body.classList.toggle("from-top", side !== "bottom");
    shellEl.style.top = side === "left" || side === "right" ? AIR + slide + "px" : "";   // beside a bar: level with its slot
  }
  const h = Math.min((mon && mon.h) || MAX_HEIGHT, heightCap + 16);
  const w = Math.min(WIDTH, Math.max(240, Math.floor(wa.size.width / sf) - 8));
  const W = Math.round(w * sf), H = Math.round(h * sf);
  const left = wa.position.x, top = wa.position.y, right = wa.position.x + wa.size.width, bottom = wa.position.y + wa.size.height;
  const leftBar = wa.position.x > m.position.x;
  const topBar = wa.position.y > m.position.y;
  // On Linux the layer sits at the bar's side already: the card hugs that side of its window.
  const x = leftBar ? left + 4 : right - W - 4;
  const y = topBar ? top + 4 : bottom - H - 4;
  if (LAYER) {
    // A layer on Wayland is sized and placed by the compositor, in logical pixels: the page
    // only says how big (the scale of its monitor is not known to it yet when it first opens).
    await invoke("panel_size", { width: Math.round(w) });
  } else {
    await win.setSize(new PhysicalSize(W, H));
    await win.setPosition(new PhysicalPosition(x, y));
  }
  mon = { h, sf, x, y };
  if (parseFloat(shellEl.style.height) > heightCap) shellEl.style.height = heightCap + "px";
}
async function show(to) {
  if (to) { const [name, tab] = to.split("/"); page = name; if (tab) { if (name === "settings") ui.settingsTab = tab === "bar" || tab === "tray" ? "taskbar" : tab; else ui.editorTab = tab; } }
  ensureStudio();
  if (!isOpen) {
    isOpen = true;
    focused = false;
    if (LAYER) emitTo("pet", "panel:open", true);   // the pet's overlay then catches a click outside (Linux layers)
    await applyShellStyle();   // the theme may have changed since the last time; and the text size sets the height
    mon = { h: MAX_HEIGHT };
    host.cmd("hello");
    render(false, true);
    await place();
    fitWindow();
    await win.show();
    await win.setFocus();
    // A timer, not requestAnimationFrame: WebKitGTK may not draw frames yet for a layer that was
    // just shown (Linux), and the panel would stay see-through.
    setTimeout(() => document.body.classList.add("open"), 16);
    setTimeout(sendRegion, 250);
    watchCursor();
  } else render(false, true);
}
function hide() {
  if (!isOpen) return;
  stopWelcome();
  isOpen = false;
  closedAt = Date.now();
  if (LAYER) emitTo("pet", "panel:open", false);
  document.body.classList.remove("open");
  tipEl.classList.remove("on");
  setTimeout(() => { if (!isOpen) win.hide(); }, 140);
}
// Closes when the focus goes elsewhere, once it has had it: on Wayland a panel opened from the
// bar blob only gets the keyboard when clicked, and must not close before that.
let focused = false;
if (!LAYER) win.onFocusChanged(({ payload }) => {
  if (payload) focused = true;
  else if (focused) { focused = false; hide(); }
});

listen("panel:toggle", (e) => {
  const p = String(e.payload || "");
  if (p.startsWith("open:")) return show(p.slice(5));
  if (p) return show(p);
  if (isOpen) hide();
  else if (Date.now() - closedAt > 300) show("blob");   // a click on the tray icon also blurs us first
});

listen("state", (e) => {
  const first = !st;
  st = e.payload;
  document.documentElement.classList.toggle("light", !st.dark);
  const ui = Platform.desktop.uiAccentFromTheme && st.themeAccent ? st.themeAccent : host.accent;
  document.documentElement.style.setProperty("--accent", ui);
  applyAccentPalette(ui, st.dark);
  if (!isOpen) return;
  if (first || layoutKey() !== shapeKey) render();
  else liveUpdate();
});

// The hero and the editor's preview watch the cursor too. One loop per opening.
let cursorLoop = 0;
async function watchCursor(loop) {
  if (loop === undefined) loop = ++cursorLoop;
  if (!isOpen || loop !== cursorLoop) return;
  try {
    const c = await invoke("cursor");
    if (c && mon && mon.sf) {
      [heroView, previewView].forEach((v) => {
        if (!v) return;
        const r = v.el.getBoundingClientRect();
        const cx = mon.x + (r.left + r.width / 2 + 8) * mon.sf, cy = mon.y + (r.top + r.height / 2) * mon.sf;
        v.setCursor((c[0] - cx) / mon.sf, (c[1] - cy) / mon.sf);
      });
    }
  } catch (e) { /* closing */ }
  setTimeout(() => watchCursor(loop), 60);
}

// --- Studio exports: Copy, PNG, GIF, Sticker and the folder ----------------------------------
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function svgCanvas(svg, size) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(img, 0, 0, size, size);
  return c;
}
function studioFrame(mode, t, size) {
  const s = studio || {};
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#1b1b22";
  const motion = s.motion || "still";
  return Render.svg({
    seed: studioHost.seed, look: studioHost.look, accent: studioHost.accent, face: s.restingFace || "idle",
    wear: { head: s.wearHead || "", face: s.wearFace || "", neck: s.wearNeck || "", ears: s.wearEars || "", hand: s.wearHand || "", tint: P.studioTint(studioHost) },
    symbols: s.symbols || [], pose: motion !== "still" ? Render.motionPose(motion, t) : { symbolPhase: 0.3 }, motion,
    size, background: mode !== "sticker" && s.fill !== false ? bg : "none", foreground: host.fg,
  });
}
// A small PNG of the export, for the drag tile and the picture under the cursor while dragging.
function thumb(canvas) {
  const t = document.createElement("canvas");
  t.width = t.height = 64;
  t.getContext("2d").drawImage(canvas, 0, 0, 64, 64);
  return t.toDataURL("image/png");
}
// Saved, and on the clipboard as a file so it pastes into a chat.
async function copied(title) {
  let body = "Drag it from the panel, or paste it anywhere";
  try { await invoke("copy_picture", { path: ui.lastExport }); } catch (e) { body = ui.lastExport; }
  invoke("notify", { title, body });
}
async function exportStudio(mode) {
  if (mode === "folder") { invoke("open_pictures"); return; }
  if (ui.exporting) return;
  ui.exporting = true; render();
  const s = studio || {};
  const size = mode === "sticker" ? 512 : Number(s.size) || 512;
  const name = "blobble-" + String(studioHost.seed).replace(/[^a-z0-9-]+/gi, "-").slice(0, 32) + "-" + new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  try {
    if (mode === "copy") {
      const c = await svgCanvas(studioFrame(mode, 0, size), size);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      invoke("notify", { title: "Copied", body: "The picture is on the clipboard, ready to paste" });
    } else if (mode === "png" || mode === "sticker") {
      const c = await svgCanvas(studioFrame(mode, 0, size), size);
      const ext = mode === "png" ? "png" : "webp";
      const data = c.toDataURL(mode === "png" ? "image/png" : "image/webp", 0.92).split(",")[1];
      ui.lastExport = await invoke("save_picture", { name: `${name}.${ext}`, data });
      ui.lastThumb = thumb(c);
      await copied(mode === "png" ? "PNG saved" : "Sticker saved");
    } else if (mode === "gif") {
      const motion = s.motion || "still";
      const fps = Render.MOTION_FPS;
      const frames = motion === "still" ? 1 : Math.round(Render.MOTION_SECONDS[motion] * fps);
      const clear = s.fill === false;
      const gif = GIFEncoder();
      for (let i = 0; i < frames; i++) {
        const c = await svgCanvas(studioFrame(mode, i / frames, size), size);
        const { data } = c.getContext("2d").getImageData(0, 0, size, size);
        const palette = quantize(data, 256, clear ? { format: "rgba4444", oneBitAlpha: true } : {});
        const index = applyPalette(data, palette, clear ? "rgba4444" : "rgb565");
        const transparentIndex = clear ? Math.max(0, palette.findIndex((p) => p[3] === 0)) : 0;
        gif.writeFrame(index, size, size, { palette, delay: Math.round(1000 / fps), transparent: clear, transparentIndex });
      }
      gif.finish();
      ui.lastExport = await invoke("save_picture", { name: `${name}.gif`, data: b64(gif.bytes()) });
      ui.lastThumb = thumb(await svgCanvas(studioFrame(mode, 0, 96), 96));
      await copied("GIF saved");
    }
  } catch (e) {
    invoke("notify", { title: "Studio could not export", body: String(e) });
  }
  ui.exporting = false;
  render();
}

requestAnimationFrame(animateTiles);
