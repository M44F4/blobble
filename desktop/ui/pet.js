// The desktop pet, like OmaBlob's Pet.qml: the same blob and mood as the tray, bigger, on a
// see-through overlay over the screen. Only the blob, its time pill and its menu catch the
// mouse; everywhere else clicks go through to what is underneath.
import { log } from "./shared/log.js";
import { applyShellStyle } from "./shared/shellstyle.js";
import { applyAccentPalette } from "./shared/palette.js";
import * as Actions from "./core/Actions.mjs";
import { Service } from "./service.js";
import { BlobView } from "./shared/blobview.js";
import { icon, I } from "./shared/icons.js";
import * as Platform from "./shared/platform.js";

const { invoke } = window.__TAURI__.core;
const { listen, emitTo } = window.__TAURI__.event;
const { getCurrentWindow, primaryMonitor, currentMonitor } = window.__TAURI__.window;
const { getCurrentWebview } = window.__TAURI__.webview;
const { PhysicalPosition, PhysicalSize } = window.__TAURI__.dpi;

const win = getCurrentWindow();
const $ = (id) => document.getElementById(id);
const stage = $("stage"), blobEl = $("blob"), ringEl = $("ring"), labelEl = $("label"), listEl = $("list"), pillsEl = $("pills");
const service = new Service();

// --- the screen ------------------------------------------------------------------------
let mon = null;           // { x, y, w, h, sf } physical origin, CSS size, scale
let work = { x: 0, y: 0, w: 1920, h: 1040 };   // the work area (screen minus taskbar), CSS px in the overlay
let edge = "bottom";      // where the taskbar is

async function fitScreen() {
  // Wayland has no primary monitor: then the one the overlay is on.
  const m = (await primaryMonitor()) || (await currentMonitor());
  if (!m) return;
  const sf = m.scaleFactor;
  const same = mon && mon.x === m.position.x && mon.y === m.position.y && mon.w === m.size.width / sf && mon.h === m.size.height / sf && mon.sf === sf;
  mon = { x: m.position.x, y: m.position.y, w: m.size.width / sf, h: m.size.height / sf, sf };
  const wa = m.workArea || { position: m.position, size: m.size };
  work = { x: (wa.position.x - m.position.x) / sf, y: (wa.position.y - m.position.y) / sf, w: wa.size.width / sf, h: wa.size.height / sf };
  edge = work.y > 1 ? "top" : work.h < mon.h - 1 ? "bottom" : work.x > 1 ? "left" : work.w < mon.w - 1 ? "right" : "bottom";
  if (service.taskbarEdge !== edge) { service.taskbarEdge = edge; service.broadcast(); }
  if (!same && !host) {   // a layer is sized and placed by the compositor
    await win.setPosition(new PhysicalPosition(m.position.x, m.position.y));
    await win.setSize(new PhysicalSize(m.size.width, m.size.height));
  }
  layout();
}

// --- where the blob is -----------------------------------------------------------------
const pet = () => service.group("pet");
// What differs per desktop is in desktop/: its words, and a host for what goes on around this page
// (null on Windows). The host says when the overlay is up only to catch a click, and where the
// blob flies when it goes back into a bar.
const { desktop } = Platform;
let host = null;
const home = () => pet().home || desktop.defaultHome;
let posX = null, posY = null;   // the box's top-left (it may be negative at the screen's edge), or null at home
let walkOffset = 0;

const size = () => Math.max(48, Math.min(400, Number(pet().size) || 96));
const pad = () => Math.round(size() * 0.3);

// Home spots. "taskbar" puts it inside the taskbar's strip, beside the tray area; the corners
// and the centre keep it in the free part of the screen, wherever the taskbar is. The taskbar and the
// tray are modelled in desktop/taskbar.js; this page asks it.
const taskbar = desktop.taskbar({ invoke, screen: () => ({ mon, work, edge }), home: () => home(), atHome: () => atHome(), layout: () => layout() });
const trayTarget = () => taskbar.trayTarget();
function homeSpot() {
  const s = size(), p = pad(), e = Math.max(16, edgeRoom());
  const L = work.x + e, T = work.y + e, R = work.x + work.w - e, B = work.y + work.h - e;
  switch (home()) {
    case "top-left": return { x: L - p, y: T - p };
    case "top-right": return { x: R - s - p, y: T - p };
    case "center": return { x: work.x + (work.w - s) / 2 - p, y: work.y + (work.h - s) / 2 - p };
    case "bottom-left": return { x: L - p, y: B - s - p };
    case "bottom-right": return { x: R - s - p, y: B - s - p };
  }
  return taskbar.homeSpot(s, p);
}
const atHome = () => posX === null || posY === null;
const inTaskbar = () => taskbar.inTaskbar();
// The box may hang off the screen by its padding, so the blob itself can reach every edge.
// On a layer desktop the blob keeps room for its symbols (a bolt, a note, a Zz) at the screen's edges,
// which would otherwise be cut off by the screen. Windows lets the blob touch them.
const edgeRoom = () => (host ? Math.round(size() * 0.36) : 0);
function minX() { return edgeRoom() - pad(); }
function minY() { return edgeRoom() - pad(); }
function maxX() { return (mon ? mon.w : 1920) - size() - pad() - edgeRoom(); }
function maxY() { return (mon ? mon.h : 1080) - size() - pad() - edgeRoom(); }
function x0() { return atHome() ? homeSpot().x : Math.max(minX(), Math.min(posX, maxX())); }
function y0() { return atHome() ? homeSpot().y : Math.max(minY(), Math.min(posY, maxY())); }
// It walks along the taskbar: up and down when the taskbar stands on the left or right.
const upright = () => taskbar.upright();
function px() { return Math.max(minX(), Math.min(maxX(), x0() + (upright() ? 0 : walkOffset))); }
function py() { return Math.max(minY(), Math.min(maxY(), y0() + (upright() ? walkOffset : 0))); }

function savePosition() { invoke("save_state", { name: "pet", text: JSON.stringify({ x: posX, y: posY }) }); }
function resetPosition() { stopWalking(); walkOffset = 0; posX = null; posY = null; savePosition(); layout(); }

// --- drawing ---------------------------------------------------------------------------
const view = new BlobView(blobEl, { size: 96, fit: true, accessoryScale: 0.26 });
let held = false, dragging = false, landing = false, smelling = false, tiltTarget = 0;
let carry = null;         // a flight to or from the tray: { from, to, start, toTray }

function carryMood() {
  const base = service.mood;
  const reacts = pet().carryReactions !== false;
  if (smelling) return Object.assign({}, base, { face: "surprised", mild: false, gaze: { x: 0, y: -1 } });
  if (!reacts) return base;
  if (held && dragging) return Object.assign({}, base, { face: "surprised", mild: false, gaze: { x: 0, y: -1 } });
  if (landing) return Object.assign({}, base, { face: "happy", mild: false });
  return base;
}

function fullscreenMode() { return pet().fullscreen || "duck"; }
// Pressed or with its menu open still counts: the ducked blob must not jump away, the menu opens where it is.
function inFullscreen() { return service.s.fullscreen && !carry && !dragging; }

function layout() {
  const s = size(), p = pad();
  const ducked = inFullscreen() && fullscreenMode() === "duck";
  const faded = inFullscreen() && fullscreenMode() === "fade";
  let x = px(), y = ducked ? (mon ? mon.h : 1080) - p - s : py();   // sitting on the screen's edge, all of it in view
  let scale = 1;
  if (carry) {
    const t = carry.t;
    x = carry.from.x + (carry.to.x - carry.from.x) * t;
    y = carry.from.y + (carry.to.y - carry.from.y) * t - Math.min(90, s) * Math.sin(Math.PI * t);
    scale = carry.toTray ? 1 - 0.7 * t : 0.3 + 0.7 * t;
  }
  // The window can be up just to catch the click that closes the panel: then no pet is shown.
  blobEl.style.display = carry || (service.petEnabled && service.active) ? "" : "none";
  blobEl.style.left = x + p + "px";
  blobEl.style.top = y + p + "px";
  blobEl.style.width = s + "px";
  blobEl.style.height = s + "px";
  blobEl.style.transform = scale !== 1 ? `scale(${scale})` : "";
  blobEl.style.opacity = faded || steppingAside ? 0 : 1;
  view.set({
    seed: service.seed, look: service.look, accent: service.accent, mood: carryMood(), size: s,
    reduceMotion: service.reduceMotion, walk: walking ? 1 : 0, walkDir,
    lift: pet().carryReactions !== false && dragging ? 1 : 0,
    tilt: pet().carryReactions !== false || carry ? tiltTarget : 0,
    gazeEnabled: !held && service.reacts("gaze"),
    foreground: service.s.dark ? "#e6e6ec" : "#1d1d24",
  });
  layoutPills(x, y);
  updateRegion();
  placePad();
}

// --- the time under the pet --------------------------------------------------------------
function layoutPills(x, y) {
  const s = size(), p = pad();
  const pills = [];
  const ph = Math.max(18, Math.round(s * 0.2));
  if (service.showPomoTime) {
    const resting = service.onBreak;
    pills.push(`<div class="pill ${resting ? "lit" : ""} ${service.pomo.paused ? "paused" : ""}" data-open="pomodoro" style="height:${ph}px;font-size:${Math.round(ph * 0.62)}px">` +
      (service.pomo.paused ? icon(I.pause, Math.round(ph * 0.6)) : resting ? icon(I.coffee, Math.round(ph * 0.6)) : icon("tomato", Math.round(ph * 0.66))) +
      `<span>${service.pomoClock}</span></div>`);
  }
  if (service.showTimerTime) {
    pills.push(`<div class="pill ${service.timer.paused ? "paused" : ""}" data-open="timer" style="height:${ph}px;font-size:${Math.round(ph * 0.62)}px">` +
      icon(service.timer.paused ? I.pause : I.timer, Math.round(ph * 0.6)) + `<span>${service.timerClock}</span></div>`);
  }
  const html = pills.join("");
  if (pillsEl.dataset.html !== html) { pillsEl.innerHTML = html; pillsEl.dataset.html = html; }
  pillsEl.style.display = pills.length && !carry && !(inFullscreen() && fullscreenMode() !== "stay") ? "flex" : "none";
  // Below the blob, or above it when it sits on the taskbar or near the bottom.
  const perched = taskbar.perched();
  const below = !perched && y + p + s + Math.round(p * 0.6) + pills.length * (ph + 4) < (mon ? mon.h : 1080);
  pillsEl.style.left = x + p + s / 2 + "px";
  pillsEl.style.transform = "translateX(-50%)";
  if (below) { pillsEl.style.top = y + p + s + Math.round(p * 0.6) - ph / 2 + "px"; pillsEl.style.bottom = ""; }
  else { pillsEl.style.top = y + p - pills.length * (ph + 4) - 2 + "px"; }
}
pillsEl.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-open]");
  if (pill) service.openPanel(pill.dataset.open);
});

// --- walking -----------------------------------------------------------------------------
let walking = false, walkDir = 1, walkAnim = null;
function walkTo(offset) {
  // In the taskbar it walks away from the tray and back, never over it (taskbar.js); elsewhere, anywhere on screen.
  const inBar = taskbar.walkTarget(offset, x0(), y0());
  const target = inBar !== undefined ? inBar : Math.max(minX() - x0(), Math.min(maxX() - x0(), offset));
  const dist = target - walkOffset;
  if (Math.abs(dist) < 4) return;
  walkDir = dist < 0 ? -1 : 1;
  walkAnim = { from: walkOffset, to: target, start: performance.now(), dur: Math.abs(dist) / (55 + size() * 0.25) * 1000 };
  walking = true;
}
function stopWalking() { walkAnim = null; walking = false; }
function stroll() {
  clearTimeout(stroll.t);
  stroll.t = setTimeout(stroll, 14000 + Math.random() * 22000);
  const wanders = pet().wander !== false && !service.reduceMotion;
  if (!wanders || held || menuOpen || inFullscreen() || service.asleep) return;
  const m = service.mood;
  if (!m || !m.mild || walking || view.anticRunning) return;
  const range = upright() ? Math.max(80, Math.min(300, work.h * 0.25)) : Math.max(120, Math.min(420, (mon ? mon.w : 1920) * 0.18));
  const next = Math.abs(walkOffset) > range * 0.6 && Math.random() < 0.7
    ? walkOffset * Math.random() * 0.3
    : walkOffset + (Math.random() < 0.5 ? -1 : 1) * (range * (0.25 + Math.random() * 0.5));
  walkTo(Math.max(-range, Math.min(range, next)));
}

// --- carrying it ---------------------------------------------------------------------------
let press = null, longPress = null, releasedAt = 0, lastMoveAt = 0, settle = null;
blobEl.style.touchAction = "none";   // a finger on the blob is the blob's, never a page scroll
let touchId = null, touchAt = 0;
blobEl.addEventListener("mousedown", (e) => {
  // A touch is handled by the pointer events below; the mouse events it makes after are echoes.
  if (Date.now() - touchAt < 700) return;
  if (e.button === 2) { openMenu("actions", []); return; }
  if (e.button !== 0) return;
  startPress(e.clientX, e.clientY, false);
});
function startPress(x, y, touch) {
  const suspect = Date.now() - releasedAt < 120;
  closeMenu();
  stopWalking();
  held = true; dragging = false;
  const r = blobEl.getBoundingClientRect();
  press = { x, y, fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, longPressed: false, suspect, touch };
  service.dragging = true;
  clearTimeout(longPress);
  if (pet().longPress !== false && !suspect) {
    longPress = setTimeout(() => { if (held && !dragging) { press.longPressed = true; openMenu("actions", []); } }, 550);
  }
  blobEl.classList.add("held");
  layout();
}
// Touch and pen: Windows does not report a finger as the mouse button or move the cursor, so the
// page follows the finger itself. Hold still to open the ring, then slide onto an action and
// lift to choose it, or drag to carry the blob.
blobEl.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || !e.isPrimary) return;
  touchAt = Date.now();
  touchId = e.pointerId;
  try { blobEl.setPointerCapture(e.pointerId); } catch (err) { /* the finger is already gone */ }
  startPress(e.clientX, e.clientY, true);
});
blobEl.addEventListener("pointermove", (e) => touchMove(e.pointerId, e.clientX, e.clientY));
function touchMove(id, x, y) {
  if (id !== touchId || !held || !press) return;
  touchAt = Date.now();
  if (!press.longPressed) { dragTo(x, y); return; }
  const at = document.elementFromPoint(x, y);
  const slot = at && at.closest(".slot, .row");
  const i = !slot ? -1 : slot.classList.contains("slot") ? Array.prototype.indexOf.call(ringEl.querySelectorAll(".slot"), slot) : +slot.dataset.i;
  if (i === hovered) return;
  hovered = i;
  if (pet().menu === "list") paintList(); else paintRing(performance.now());
}
function endTouch(e) {
  if (e.pointerId !== touchId) return;
  touchId = null;
  touchAt = Date.now();
  if (!held) return;
  const pick = e.type === "pointerup" && press && press.longPressed && menuOpen && hovered >= 0 ? menuItems()[hovered] : null;
  release(e.type === "pointerup");
  if (pick) choose(pick.id);
}
blobEl.addEventListener("lostpointercapture", endTouch);   // never stay held with the whole screen caught
blobEl.addEventListener("pointerup", endTouch);
blobEl.addEventListener("pointercancel", endTouch);
// While held, the blob follows the cursor as Windows reports it (see watchCursor), not this
// window's mouse events: those stop at screen edges and over the taskbar.
function dragTo(x, y) {
  if (!held || !press || press.longPressed || press.suspect) return;
  const dx = x - press.x, dy = y - press.y;
  if (!dragging && Math.abs(dx) + Math.abs(dy) < 8) return;
  if (!dragging) { dragging = true; clearTimeout(longPress); win.setAlwaysOnTop(true); }
  const s = size(), p = pad();
  const nx = Math.max(minX(), Math.min(maxX(), x - p - s * press.fx));
  const now = Date.now();
  if (lastMoveAt > 0 && now > lastMoveAt) {
    const vx = (nx - px()) / (now - lastMoveAt) * 1000;
    tiltTarget = Math.max(-20, Math.min(20, vx * 0.025));
  }
  lastMoveAt = now;
  clearTimeout(settle);
  settle = setTimeout(() => { tiltTarget = 0; layout(); }, 140);
  walkOffset = 0;
  posX = nx;
  posY = Math.max(minY(), Math.min(maxY(), y - p - s * press.fy));
  layout();
}
window.addEventListener("mouseup", (e) => { if (e.button === 0 && held) release(true); });
function release(poke) {
  releasedAt = Date.now();
  clearTimeout(longPress);
  service.dragging = false;
  if (dragging) {
    // Dropped on the taskbar: back into it.
    const r = blobEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (taskbar.droppedOn(cx, cy)) {
      posX = null; posY = null; walkOffset = 0;
      if (home() !== "taskbar") service.saveIn("pet", "home", "taskbar");
    }
    savePosition();
    applyLayer();
    if (pet().carryReactions !== false) {
      landing = true;
      setTimeout(() => { landing = false; layout(); }, 1100);
      view.hop();
    }
  } else if (poke && press && !press.longPressed) {
    const file = service.freshDownload();
    if (file) {
      service.lastDownloadAt = 0;
      invoke("offer_download", { path: file }).then(() => openMenu("files", [file])).catch(() => service.poke());
    } else service.poke();
  }
  held = false; dragging = false; tiltTarget = 0; lastMoveAt = 0; press = null;
  blobEl.classList.remove("held");
  layout();
}
window.addEventListener("contextmenu", (e) => e.preventDefault());

// --- flying to and from the tray ------------------------------------------------------------
function traySpot() {
  const s = size(), p = pad();
  const bar = host && host.flightTarget && host.flightTarget(s, p);   // back into a bar widget
  if (bar) return bar;
  return taskbar.flightSpot(s, p);
}
function fly(toTray) {
  closeMenu(); stopWalking();
  const there = { x: px(), y: py() }, tray = traySpot();
  carry = toTray ? { from: there, to: tray, toTray: true, t: 0, start: performance.now() } : { from: tray, to: there, toTray: false, t: 0, start: performance.now() };
  tiltTarget = carry.to.x < carry.from.x ? -12 : 12;
}
function flyToTray() {
  if (pet().barTrip === false || service.reduceMotion) { service.saveIn("pet", "enabled", false); return; }
  fly(true);
}

// --- menus -----------------------------------------------------------------------------------
let menuTimer = null;
let menuOpen = false, menuKind = "actions", dropped = [], hovered = -1, byKeys = false;
function menuItems() {
  if (menuKind === "files") return Actions.fileActions(dropped);
  return Platform.ring(pet().ring).filter((a) => a.id !== "focus" || service.pomodoroOn);
}
function menuTitle() {
  if (menuKind !== "files") return "";
  if (dropped.length !== 1) return dropped.length + " files";
  return String(dropped[0]).replace(/[\\/]$/, "").split(/[\\/]/).pop();
}
function openMenu(kind, paths, keys) {
  if (menuOpen && kind === menuKind && kind === "actions") { closeMenu(); return; }
  byKeys = keys === true;
  hovered = byKeys ? 0 : -1;
  stopWalking();
  menuKind = kind;
  dropped = paths || [];
  menuOpen = true;
  setInteractive(true);
  invoke("pet_focus", { on: true });   // the keys work in the menu
  clearTimeout(menuTimer);
  menuTimer = setTimeout(closeMenu, 20000);   // clicks outside the menu now reach the desktop, so it closes by itself
  if (pet().menu === "list") drawList(); else drawRing(true);
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  invoke("pet_focus", { on: false });   // and the keyboard goes back to what you were doing
  clearTimeout(menuTimer);
  ringEl.classList.remove("on");
  listEl.classList.remove("on");
  updateRegion();
}
function choose(id) {
  // The eyedropper must open while the menu still has the focus.
  if (id === "picker" && menuKind !== "files") { pickColour(); closeMenu(); return; }
  closeMenu();
  if (menuKind === "files") return fileAction(id, dropped);
  if (id === "bar") return flyToTray();
  if (id === "screenshot") { stepAside(() => service.runAction(id)); return; }
  service.runAction(id);
}
let steppingAside = false;
function stepAside(run) {
  steppingAside = true; layout();
  setTimeout(() => { run(); setTimeout(() => { steppingAside = false; layout(); }, 1200); }, 350);
}

// The ring: a full circle when there is room all around, else an arc on the side that has room.
// Buttons only go in the work area, so they never cover the taskbar: on the taskbar the ring
// opens as an arc towards the free side of the screen.
function ringLayout(center, n, button) {
  const spacing = 10, inner = size() / 2 + 12 + button / 2, margin = 8 + button / 2;
  const on = (r, a) => {
    const x = center.x + r * Math.cos(a), y = center.y + r * Math.sin(a);
    return x >= work.x + margin && x <= work.x + work.w - margin && y >= work.y + margin && y <= work.y + work.h - margin;
  };
  const per = button + spacing, steps = 120;
  let r = Math.max(inner, n * per / (2 * Math.PI));
  for (let tries = 0; tries < 40; tries++, r += per / 3) {
    const free = [];
    let all = true;
    for (let k = 0; k < steps; k++) { free.push(on(r, k * 2 * Math.PI / steps)); if (!free[k]) all = false; }
    if (all) {
      const angles = [];
      for (let i = 0; i < n; i++) angles.push(-Math.PI / 2 + i * 2 * Math.PI / n);
      return { full: true, radius: r, angles, from: -Math.PI / 2, span: 2 * Math.PI };
    }
    let best = 0, bestStart = 0, run = 0, runStart = 0;
    for (let j = 0; j < steps * 2; j++) {
      if (free[j % steps]) { if (run === 0) runStart = j; run++; if (run > best && run <= steps) { best = run; bestStart = runStart; } }
      else run = 0;
    }
    const span = Math.max(0, (best - 2) * 2 * Math.PI / steps);
    if (best > 2 && (n - 1) * per <= r * span) {
      const mid = (bestStart + best / 2) * 2 * Math.PI / steps;
      const use = n > 1 ? Math.min(span, (n - 1) * per * 1.25 / r) : 0;
      const angles = [];
      for (let m = 0; m < n; m++) angles.push(mid - use / 2 + (n > 1 ? m * use / (n - 1) : 0));
      return { full: false, radius: r, angles, from: mid - use / 2, span: use };
    }
  }
  const angles = [];
  for (let q = 0; q < n; q++) angles.push(-Math.PI / 2 + q * 2 * Math.PI / n);
  return { full: true, radius: inner, angles, from: -Math.PI / 2, span: 2 * Math.PI };
}

let ring = null;   // { items, center, lay, button, start, closing }
function drawRing(fresh) {
  const items = menuItems();
  const s = size();
  const button = Math.round(Math.max(34, Math.min(46, s * 0.42)));
  const box = blobEl.getBoundingClientRect();   // where it is drawn (ducked at the edge, say), not its home
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  ring = { items, center, button, lay: ringLayout(center, items.length, button), start: fresh ? performance.now() : (ring ? ring.start : performance.now()) };
  ringEl.querySelectorAll(".slot").forEach((n) => n.remove());
  items.forEach((a, i) => {
    const d = document.createElement("div");
    d.className = "slot";
    d.style.width = d.style.height = button + "px";
    d.innerHTML = (a.drawn === "tomato" ? icon("tomato") : icon(a.icon)) + (i < 10 ? `<span class="num">${(i + 1) % 10}</span>` : "");
    d.onmouseenter = () => { hovered = i; paintRing(performance.now()); };
    d.onmouseleave = () => { if (hovered === i) { hovered = -1; paintRing(performance.now()); } };
    d.onmousedown = (e) => e.stopPropagation();
    d.onclick = (e) => { e.stopPropagation(); choose(a.id); };
    ringEl.appendChild(d);
  });
  ringEl.classList.add("on");
  paintRing(performance.now());
}
const outBack = (t) => { const c = 1.3 * 1.525; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
function paintRing(now) {
  if (!ring || !menuOpen) return;
  const { lay, center, button, items } = ring;
  const elapsed = service.reduceMotion ? 1e6 : now - ring.start;
  const progress = Math.min(1, elapsed / 280);
  const drift = lay.full && pet().ringDrift === true && hovered === -1 && !service.reduceMotion ? (elapsed / 36000) * 2 * Math.PI : 0;
  ringEl.querySelectorAll(".slot").forEach((d, i) => {
    const t = Math.max(0, Math.min(1, (elapsed - i * 18) / 260));
    const k = service.reduceMotion ? 1 : outBack(t);
    const a = lay.angles[i] - (1 - t) * 0.9 + drift;
    const r = lay.radius * k;
    d.style.left = center.x + r * Math.cos(a) - button / 2 + "px";
    d.style.top = center.y + r * Math.sin(a) - button / 2 + "px";
    d.style.opacity = Math.min(1, t * 1.6);
    d.style.transform = `scale(${(0.5 + 0.5 * k) * (hovered === i ? 1.12 : 1)})`;
    d.classList.toggle("lit", hovered === i);
  });
  // The faint arc behind the buttons.
  const r = lay.radius * progress, from = lay.from + drift, span = lay.span;
  const path = ringEl.querySelector("path");
  if (span >= 2 * Math.PI - 0.001) {
    path.setAttribute("d", `M${center.x - r} ${center.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
  } else {
    const x1 = center.x + r * Math.cos(from), y1 = center.y + r * Math.sin(from);
    const x2 = center.x + r * Math.cos(from + span), y2 = center.y + r * Math.sin(from + span);
    path.setAttribute("d", `M${x1} ${y1}A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x2} ${y2}`);
  }
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--tint-18)");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.parentNode.style.opacity = 0.5 * progress;
  // The label: the hovered action, below the ring (or above it near the bottom).
  const text = hovered >= 0 && hovered < items.length ? (hovered < 10 ? (hovered + 1) % 10 + " · " : "") + items[hovered].label : menuTitle();
  labelEl.textContent = text;
  labelEl.classList.toggle("bold", hovered >= 0);
  labelEl.style.display = text && progress > 0.6 ? "block" : "none";
  labelEl.style.opacity = (progress - 0.6) / 0.4;
  const reach = lay.radius + button / 2 + 10;
  const lw = labelEl.offsetWidth, lh = labelEl.offsetHeight;
  const below = center.y + reach + lh < work.y + work.h - 4 && edge !== "bottom" || center.y - reach - lh < work.y + 4;
  labelEl.style.left = Math.max(work.x + 6, Math.min(work.x + work.w - lw - 6, center.x - lw / 2)) + "px";
  labelEl.style.top = Math.max(work.y + 4, Math.min(work.y + work.h - lh - 4, below ? center.y + reach : center.y - reach - lh)) + "px";
  updateRegion();
}
ringEl.addEventListener("mousedown", () => closeMenu());

function paintList() {
  listEl.querySelectorAll(".row").forEach((r) => r.classList.toggle("lit", +r.dataset.i === hovered));
}
function drawList() {
  const items = menuItems();
  const title = menuTitle();
  listEl.innerHTML = (title ? `<div class="title">${escapeHtml(title)}</div>` : "") + items.map((a, i) =>
    `<div class="row ${hovered === i ? "lit" : ""}" data-i="${i}">${a.drawn === "tomato" ? icon("tomato") : icon(a.icon)}<span>${escapeHtml(a.label)}</span></div>`).join("");
  listEl.querySelectorAll(".row").forEach((r) => {
    r.onmouseenter = () => { hovered = +r.dataset.i; paintList(); };   // not a redraw: that would swap the row under the click
    r.onclick = () => choose(items[+r.dataset.i].id);
  });
  listEl.classList.add("on");
  // Away from the taskbar, and always inside the work area.
  const r = blobEl.getBoundingClientRect();
  const w = listEl.offsetWidth, h = listEl.offsetHeight;
  const L = work.x + 4, T = work.y + 4, R = work.x + work.w - 4, B = work.y + work.h - 4;
  let x, y;
  if (edge === "bottom" && r.bottom > B - 40) { x = r.left + r.width / 2 - w / 2; y = r.top - h - 6; }
  else if (edge === "top" && r.top < T + 40) { x = r.left + r.width / 2 - w / 2; y = r.bottom + 6; }
  else if (edge === "left" && r.left < L + 40) { x = r.right + 6; y = r.top; }
  else if (edge === "right" && r.right > R - 40) { x = r.left - w - 6; y = r.top; }
  else { x = r.right + w + 6 < R ? r.right + 4 : r.left - w - 4; y = r.top; }
  listEl.style.left = Math.max(L, Math.min(R - w, x)) + "px";
  listEl.style.top = Math.max(T, Math.min(B - h, y)) + "px";
  updateRegion();
}
document.addEventListener("mousedown", (e) => {
  if (menuOpen && pet().menu === "list" && !e.target.closest("#list, #blob")) closeMenu();
});

window.addEventListener("keydown", (e) => {
  if (!menuOpen) return;
  const n = menuItems().length;
  if (e.key === "Escape") closeMenu();
  else if (["ArrowRight", "ArrowDown", "Tab"].includes(e.key) && !e.shiftKey) hovered = (hovered + 1) % Math.max(1, n);
  else if (["ArrowLeft", "ArrowUp"].includes(e.key) || (e.key === "Tab" && e.shiftKey)) hovered = hovered <= 0 ? n - 1 : hovered - 1;
  else if (e.key === "Home") hovered = 0;
  else if (e.key === "End") hovered = n - 1;
  else if (/^[1-9]$/.test(e.key)) { const i = +e.key - 1; if (i < n) choose(menuItems()[i].id); return; }
  else if (e.key === "0") { if (n >= 10) choose(menuItems()[9].id); return; }
  else if (["Enter", " "].includes(e.key)) { if (hovered >= 0 && hovered < n) choose(menuItems()[hovered].id); return; }
  else return;
  e.preventDefault();
  if (pet().menu === "list") paintList(); else paintRing(performance.now());
});
win.onFocusChanged(({ payload }) => { if (!payload && menuOpen) closeMenu(); });

// --- files dropped on it ---------------------------------------------------------------------
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
getCurrentWebview().onDragDropEvent((e) => {
  const p = e.payload;
  if (pet().acceptFiles === false) return;
  if (p.type === "enter" || p.type === "over") { if (!smelling) { smelling = true; stopWalking(); layout(); } }
  else if (p.type === "leave") { smelling = false; layout(); }
  else if (p.type === "drop") {
    smelling = false;
    if (p.paths && p.paths.length) { service.fed(); openMenu("files", p.paths); }
    layout();
  }
});

async function imageFile(path) {
  const b64 = await invoke("file_bytes", { path });
  const ext = (path.split(".").pop() || "png").toLowerCase();
  const type = { jpg: "jpeg", jpeg: "jpeg", svg: "svg+xml", tif: "tiff" }[ext] || ext;
  const img = new Image();
  img.src = `data:image/${type};base64,${b64}`;
  await img.decode();
  return img;
}
function canvasOf(img, scale) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const toB64 = (c, type, q) => c.toDataURL(type, q).split(",")[1];
async function fileAction(id, paths) {
  try {
    if (id === "copyPath") {
      await invoke("copy_text", { text: paths.join("\n") });
      return service.say("Copied", paths.length > 1 ? "The paths are on the clipboard" : "The path is on the clipboard");
    }
    if (id === "copyImage") {
      const c = canvasOf(await imageFile(paths[0]), 1);
      await invoke("copy_png", { data: toB64(c, "image/png") });
      return service.say("Copied", "The image is on the clipboard");
    }
    if (id === "png" || id === "jpg" || id === "shrink") {
      for (const path of paths) {
        const img = await imageFile(path);
        const ext = id === "shrink" ? (/\.jpe?g$/i.test(path) ? "jpg" : "png") : id;
        const c = canvasOf(img, id === "shrink" ? 0.5 : 1);
        if (ext === "jpg") { const ctx = c.getContext("2d"); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
        await invoke("write_beside", { path, suffix: id === "shrink" ? "-small" : "", ext, data: toB64(c, ext === "jpg" ? "image/jpeg" : "image/png", 0.92) });
      }
      return service.say("Done", id === "shrink" ? "Smaller copies saved next to the originals" : "Saved next to the original");
    }
    const out = await invoke("file_action", { id, paths });
    if (id === "zip") service.say("Zipped", out);
    if (id === "gif") service.say("GIF made", "Saved next to the video");
  } catch (e) {
    service.say("Could not do that", String(e));
  }
}

// The colour picker: Chromium's eyedropper, then the hex goes on the clipboard.
async function pickColour() {
  // Windows: look at the pixel under the cursor (Rust), never Chromium's modal eyedropper.
  if (desktop.nativeColourPicker) {
    // A chip follows the cursor with the colour under it, since the pet is otherwise silent.
    const chip = document.createElement("div");
    chip.style.cssText = "position:absolute;z-index:9;pointer-events:none;display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;" +
      "background:var(--popup);color:var(--popup-text);border:1px solid var(--popup-line);font:12px/1.2 var(--font);white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.35)";
    chip.innerHTML = '<span style="width:18px;height:18px;border-radius:50%;border:2px solid var(--popup-line);background:#888"></span><b></b><span style="opacity:.6">Click: pick · Esc: cancel</span>';
    const dot = chip.firstChild, label = chip.children[1];
    stage.appendChild(chip);
    let looking = true;
    const look = async () => {
      if (!looking) return;
      if (cursor) {
        chip.style.left = Math.min(cursor.x + 22, (mon ? mon.w : innerWidth) - chip.offsetWidth - 8) + "px";
        chip.style.top = Math.min(cursor.y + 22, (mon ? mon.h : innerHeight) - chip.offsetHeight - 8) + "px";
      }
      try { const hex = await invoke("pixel_under_cursor"); dot.style.background = hex; label.textContent = hex; } catch (e) { /* no pixel */ }
      setTimeout(look, 60);
    };
    look();
    let hex = null;
    try {
      hex = await invoke("pick_colour");
      await invoke("copy_text", { text: hex });
      dot.style.background = hex; label.textContent = "Copied " + hex;
      chip.lastChild.remove();
      service.say("Colour copied", hex);
    } catch (e) { /* cancelled */ }
    looking = false;
    setTimeout(() => chip.remove(), hex ? 1800 : 0);
    return;
  }
  if (!window.EyeDropper) return service.say("Colour picker", "Not available here");
  try {
    const { sRGBHex } = await new EyeDropper().open();
    await invoke("copy_text", { text: sRGBHex });
    service.say("Colour copied", sRGBHex);
  } catch (e) { /* cancelled */ }
}

// --- the mouse: only the blob (and its pill and menu) catch it -------------------------------
// --- the touch pad (Windows) ---------------------------------------------------------------------
// The pet's window is click-through, which a finger cannot cross, so a small see-through window
// (touch.html) sits over the blob and passes on what lands on it. It stays where it was while a
// finger is down, since the finger's positions are measured from it.
const PAD = Platform.OS === "windows" && !host;
let padRect = null, padKey = "";   // padRect: its corner in overlay CSS px
function placePad() {
  if (!PAD || !mon || touchId !== null) return;
  let rect = null;
  if (shown && !carry) {
    const r = blobEl.getBoundingClientRect(), d = Math.round(pad() * 0.5) + 6, sf = mon.sf;
    padRect = { x: r.left - d, y: r.top - d };
    rect = [Math.round(mon.x + padRect.x * sf), Math.round(mon.y + padRect.y * sf), Math.round((r.width + 2 * d) * sf), Math.round((r.height + 2 * d) * sf)];
  }
  const key = rect ? rect.join("|") : "off";
  if (key === padKey) return;
  padKey = key;
  invoke("touch_pad", { rect }).catch((e) => log("touch pad failed:", String(e)));
}
// What the pad passes on. A mouse's drags and releases come from watching the cursor, as they
// always did; only its presses are news here. A finger is followed by its own events.
listen("tp", (ev) => {
  const t = ev.payload;
  if (!PAD || !padRect) return;
  const x = padRect.x + t.x, y = padRect.y + t.y;
  if (t.kind === "mouse") {
    if (t.type !== "pointerdown") return;
    if (t.button === 2) openMenu("actions", []);
    else if (t.button === 0) startPress(x, y, false);
    return;
  }
  if (t.type === "pointerdown") {
    if (!t.primary) return;
    touchAt = Date.now();
    touchId = t.id;
    startPress(x, y, true);
  } else if (t.type === "pointermove") touchMove(t.id, x, y);
  else endTouch({ pointerId: t.id, type: t.type });
});

let interactive = null, cursor = null;
// A way to cut the pet window down to the blob, its pill and its menu, so touch lands on them.
// Off: a window that takes input all the time (even cut down to the blob) made Windows send the
// mouse wheel to it instead of to the app under the cursor. Click-through by cursor position
// (setInteractive below) leaves the desktop alone. Touch still needs a way that does not do that.
const REGION = false;   // Windows: click-through by the cursor. A layer window (below) cuts its input down instead.
let regionKey = "";
function updateRegion() {
  if (host) { updateLayerRegion(); return; }
  if (!REGION || !mon) return;
  const sf = mon.sf;
  const rect = (el, d) => {
    const r = el.getBoundingClientRect();
    return [Math.max(0, Math.floor((r.left - d) * sf)), Math.max(0, Math.floor((r.top - d) * sf)), Math.ceil((r.right + d) * sf), Math.ceil((r.bottom + d) * sf)];
  };
  // A held finger may stray from the blob, so it gets more room (it is also captured).
  const rects = [rect(blobEl, pad() + (held && press && press.touch ? 140 : 10))];
  if (pillsEl.style.display !== "none") rects.push(rect(pillsEl, 4));
  if (menuOpen) {
    ringEl.querySelectorAll(".slot").forEach((d) => rects.push(rect(d, 6)));
    if (labelEl.style.display === "block") rects.push(rect(labelEl, 4));
    if (listEl.classList.contains("on")) rects.push(rect(listEl, 4));
  }
  const key = rects.join("|");
  if (key === regionKey) return;
  regionKey = key;
  invoke("hit_region", { rects }).catch((e) => log("hit region failed:", String(e)));
}
// A layer window takes input only where the blob, its pill and its menu are (in CSS px, which is
// what a layer is measured in), so a mouse or a finger lands on them and everything else reaches
// the desktop, scrolling included. While the panel is open it takes all of it, for one click.
function updateLayerRegion() {
  let rects = null;
  // Held by the mouse it takes all of it too: the blob follows the cursor, and a region that moves
  // with the blob would drop the press (the desktop then reports a release).
  if (!host.catching() && !(held && press && !press.touch)) {
    const rect = (el, d) => {
      const r = el.getBoundingClientRect();
      return [Math.max(0, Math.floor(r.left - d)), Math.max(0, Math.floor(r.top - d)), Math.ceil(r.right + d), Math.ceil(r.bottom + d)];
    };
    rects = [rect(blobEl, Math.round(pad() * 0.5) + (held && press && press.touch ? 140 : 6))];
    if (pillsEl.style.display !== "none") rects.push(rect(pillsEl, 4));
    if (menuOpen) {
      ringEl.querySelectorAll(".slot").forEach((d) => rects.push(rect(d, 6)));
      if (labelEl.style.display === "block") rects.push(rect(labelEl, 4));
      if (listEl.classList.contains("on")) rects.push(rect(listEl, 4));
    }
  }
  const key = rects ? rects.join("|") : "all";
  if (key === regionKey) return;
  regionKey = key;
  invoke("hit_region", { rects }).catch((e) => log("hit region failed:", String(e)));
}
function setInteractive(on) {
  if (host) { updateRegion(); return; }   // a layer's input is its region, see updateLayerRegion
  if (REGION) {
    if (interactive !== true) {
      interactive = true;
      win.setIgnoreCursorEvents(false).catch((e) => log("click-through failed:", String(e)));
    }
    updateRegion();
    return;
  }
  if (on === interactive) return;
  interactive = on;
  win.setIgnoreCursorEvents(!on).catch((e) => log("click-through failed:", String(e)));
}
function overThings(x, y) {
  if (menuOpen || held) return true;
  const r = blobEl.getBoundingClientRect();
  if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return true;
  if (pillsEl.style.display !== "none") {
    const p = pillsEl.getBoundingClientRect();
    if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return true;
  }
  return false;
}
async function watchCursor() {
  try {
    // A layer desktop asks Hyprland for the cursor, already in the overlay's CSS pixels; elsewhere it is
    // the OS's, in physical pixels of the monitor the page measured.
    const c = host ? await invoke("cursor_logical") : await invoke("cursor");
    if (c && (host || mon)) {
      const x = host ? c[0] : (c[0] - mon.x) / mon.sf, y = host ? c[1] : (c[1] - mon.y) / mon.sf;
      if (!cursor || Math.abs(cursor.x - x) > 0.5 || Math.abs(cursor.y - y) > 0.5) service.lastPointerMove = Date.now();
      cursor = { x, y };
      if (held && press && press.touch && !menuOpen && Date.now() - touchAt > 4000) release(false);   // its events never ended
      if (held && !(press && press.touch)) {   // a finger is followed by its own events
        if (c[2]) dragTo(x, y);
        else release(true);   // let go, wherever that happened
      }
      setInteractive(overThings(x, y));
      const r = blobEl.getBoundingClientRect();
      view.setCursor(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    }
  } catch (e) { /* the window is going away */ }
  setTimeout(watchCursor, held ? 16 : 40);
}

// --- the tray icon: a little live blob ----------------------------------------------------------
// It blinks, bobs, changes face and looks at the cursor, like OmaBlob's blob in the bar.
const trayEl = document.createElement("div");
trayEl.style.cssText = "position:absolute;left:-400px;top:0;width:32px;height:32px;pointer-events:none";
document.body.appendChild(trayEl);
let trayView = null, traySent = "", trayTip = "", trayBusy = false;

async function drawTray() {
  setTimeout(drawTray, 100);
  if (trayBusy) return;
  const m = service.mood;
  // While the pet sits on the taskbar, the tray blob keeps still: one living blob on screen.
  const perched = service.petEnabled && service.active && inTaskbar() && !carry;
  const live = service.setting("trayLive", true) !== false && !perched;
  const moods = service.setting("trayMood", true) !== false && !perched;
  const props = { seed: service.seed, look: service.look, accent: service.accent, reduceMotion: service.reduceMotion || !live,
    mood: Object.assign({}, m, { accessories: [] }, moods ? {} : { face: "idle", mild: true }, perched ? { eyesClosed: false, motion: undefined } : {}),
    showWear: service.setting("trayWear", true) !== false,
    gazeEnabled: live && service.reacts("gaze"), foreground: service.s.dark ? "#e6e6ec" : "#1d1d24" };
  if (!trayView) trayView = new BlobView(trayEl, Object.assign({ size: 32, fit: true, tight: true }, props));
  else trayView.set(props);
  const t = trayTarget();
  if (cursor && t) trayView.setCursor(cursor.x - (t.x + t.w / 2), cursor.y - (t.y + t.h / 2));
  const svg = trayEl.innerHTML;
  const tip = "Blobble · " + ((m.reasons[0] && m.reasons[0].label) || "Calm");
  if (svg === traySent && tip === trayTip) return;
  trayBusy = true;
  try {
    // Windows shows tray icons at 16 px times the display scale (20 px at 125%).
    const px = Math.max(16, Math.round(16 * (mon ? mon.sf : 1)));
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const c = new OffscreenCanvas(px, px);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, px, px);
    await invoke("set_tray", { rgba: Array.from(ctx.getImageData(0, 0, px, px).data), size: px, tooltip: tip });
    traySent = svg; trayTip = tip;
  } catch (e) { /* try again next tick */ }
  trayBusy = false;
}

// --- keeping it all going ------------------------------------------------------------------------
function applyTheme() {
  document.documentElement.classList.toggle("light", !service.s.dark);
  const ui = desktop.uiAccentFromTheme && service.themeAccent ? service.themeAccent : service.accent;
  document.documentElement.style.setProperty("--accent", ui);
  applyAccentPalette(ui, service.s.dark);
}
function applyLayer() {
  if (pet().layer === "bottom" && !dragging) { win.setAlwaysOnTop(false); win.setAlwaysOnBottom(true); }
  else { win.setAlwaysOnBottom(false); win.setAlwaysOnTop(true); }
}
let shown = null;
// The overlay is on screen only for the pet on the desktop, or while the panel is open and it
// catches the click that closes it. Otherwise it is hidden, so it can never cover the screen.
function putAway() { if (!(host && host.catching())) win.hide(); }
function applyEnabled() {
  const on = service.petEnabled && service.active;
  if (on === shown) return;
  const first = shown === null;
  shown = on;
  if (on) {
    win.show().then(fitScreen).catch(() => {});
    if (!first && pet().barTrip !== false && !service.reduceMotion) fly(false);
  } else if (!carry) {
    closeMenu();
    putAway();
    placePad();
  }
}

function tick(now) {
  requestAnimationFrame(tick);
  if (walkAnim) {
    const t = Math.min(1, (now - walkAnim.start) / walkAnim.dur);
    const k = -(Math.cos(Math.PI * t) - 1) / 2;
    walkOffset = walkAnim.from + (walkAnim.to - walkAnim.from) * k;
    if (t >= 1) stopWalking();
    layout();
  }
  if (carry) {
    carry.t = Math.min(1, (now - carry.start) / 700);
    carry.t = carry.t < 0.5 ? 2 * carry.t * carry.t : 1 - Math.pow(-2 * carry.t + 2, 2) / 2;
    if (now - carry.start >= 700) {
      const toTray = carry.toTray;
      carry = null; tiltTarget = 0;
      if (toTray) { service.saveIn("pet", "enabled", false); putAway(); }
      else view.hop(1.3, 0);
    }
    layout();
  }
  if (menuOpen && pet().menu !== "list") paintRing(now);
}

service.on("mood", () => layout());
service.on("hop", (s, lean) => view.hop(s, lean));
service.on("antic", (name) => { if (!walking) view.doAntic(name); });
service.on("asleep", () => { if (walkOffset !== 0) walkTo(0); });
service.on("tick", () => layout());
service.on("home", () => { if (!service.petEnabled) service.saveIn("pet", "enabled", true); resetPosition(); });
service.on("toTray", () => flyToTray());
service.on("picker", () => pickColour());
service.on("settings", (now, before) => {
  const was = (before && before.pet) || {};
  if ((was.home || "taskbar") !== home()) resetPosition();
  applyTheme(); applyLayer(); applyEnabled();
  layout();
});

listen("pet:toggle", () => service.togglePet());
listen("pet:ring", () => { if (!service.petEnabled) service.saveIn("pet", "enabled", true); setTimeout(() => openMenu("actions", [], true), 200); });

// The desktop's host: what it does around this page (see desktop/). None on Windows.
function startHost() {
  if (!desktop.host) return;
  service.pollMs = 250;   // a layer desktop reads the sensors four times a second, for a quicker reaction
  host = desktop.host({ service, win, invoke, listen, emitTo, log, BlobView, blobEl, fitScreen,
    petOut: () => service.petEnabled && service.active,
    refresh: () => { layout(); updateRegion(); } });
  if (host && host.openPanel) service.panelOpener = host.openPanel;
}

async function start() {
  startHost();
  applyShellStyle();
  await service.start().catch((e) => log("pet failed to start:", e));
  try {
    const p = JSON.parse(await invoke("load_state", { name: "pet" }) || "null");
    // Older saves used -1 for "at home".
    const ok = (v) => typeof v === "number" && isFinite(v) && v !== -1;
    if (p && ok(p.x) && ok(p.y)) { posX = p.x; posY = p.y; }
  } catch (e) { /* first start */ }
  await fitScreen();
  applyTheme();
  applyLayer();
  setInteractive(false);
  layout();
  applyEnabled();
  await taskbar.find();
  drawTray();
  watchCursor();
  requestAnimationFrame(tick);
  stroll.t = setTimeout(stroll, 8000);
  setInterval(() => { layout(); }, 1000);          // fullscreen and the like
  // The taskbar comes to the front whenever it is clicked; put the pet back above it.
  setInterval(() => {
    if (shown && (pet().layer || "top") === "top" && !service.s.fullscreen) invoke("raise_pet").catch(() => {});
  }, 500);
  window.matchMedia("(resolution: 1dppx)").addEventListener?.("change", fitScreen);
  setInterval(() => { regionKey = ""; fitScreen(); taskbar.find(); applyShellStyle(); }, 10000);   // the taskbar moved, or the screen changed
}
start().catch((e) => log("pet failed to start:", e));
