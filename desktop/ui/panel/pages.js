// The panel's pages, card by card after OmaBlob's InfoTab, Editor, AppearanceTab, WardrobeTab,
// PetTab, SettingsTab, PomodoroTab and TimerTab.
import * as Blob from "../core/Blob.mjs";
import * as Wear from "../core/Wear.mjs";
import * as Render from "../core/Render.mjs";
import * as Share from "../core/Share.mjs";
import * as Mood from "../core/MoodEngine.mjs";
import * as Actions from "../core/Actions.mjs";
import * as Platform from "../shared/platform.js";
const { desktop } = Platform;
import { still } from "../shared/blobview.js";
import { icon, I } from "../shared/icons.js";
import {
  on, esc, cap, card, button, action, toggle, smallSwitch, onBadge, segmented, tabStrip, buttonGroup,
  featureTile, choice, grid, caption, numberField, textField, slider, sizePicker, commandBlock, stat, swatch,
} from "./ui.js";

const REPO = "https://github.com/M44F4/blobble";

function duration(minutes) {
  const m = Math.round(minutes || 0);
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h " + (m % 60) + "m";
}
const tileOutfit = (h) => ({ head: h.setting("wearHead", ""), face: h.setting("wearFace", ""), neck: h.setting("wearNeck", ""),
  ears: h.setting("wearEars", ""), hand: h.setting("wearHand", ""),
  tint: h.setting("wearColour", "auto") === "theme" ? h.accent : h.setting("wearColour", "auto") });
// Size options with the blob drawn at a growing size, like OmaBlob's size picker (Omarchy only: the
// other desktops keep plain buttons).
const previews = (h, options) => !desktop.sizePreviews ? options : options.map((o, i) => Object.assign({}, o, {
  art: pic(h, { size: Math.round(40 * (0.4 + 0.6 * i / Math.max(1, options.length - 1))), showAccessories: false }) }));
const pic = (h, props) => still(Object.assign({ seed: h.seed, look: Object.assign({}, h.look, { background: "none" }), accent: h.accent,
  size: 64, fit: true, gazeEnabled: false, foreground: h.fg }, props));

// --- the Blob page -------------------------------------------------------------------------
export function infoPage(h) {
  const st = h.st;
  const shown = (s) => h.groupValue("sections", s, true) === true;
  const reasons = shown("reasons") ? (st.mood.reasons || []).map((r) =>
    `<div class="why">${esc(r.label + (r.detail ? " · " + r.detail : ""))}</div>`).join("") : "";
  const nav = h.active ? `<div class="nav">` +
    action({ glyph: I.pencil, tip: "Edit", act: on(() => h.go("appearance")) }) +
    action({ glyph: I.sparkle, tip: "Studio", act: on(() => h.go("studio")) }) +
    action({ glyph: I.paw, tip: "Desktop pet", act: on(() => h.go("pet")) }) +
    action({ glyph: st.petEnabled ? I.bar : I.out, lit: st.petEnabled, tip: st.petEnabled ? Platform.word("back") : "On screen",
      act: on(() => { h.close(); h.cmd(st.petEnabled ? "action" : "togglePet", st.petEnabled ? "bar" : undefined); }) }) +
    `</div>` : "";
  let out = card({}, `<div class="hero"><div class="blob" id="hero" data-tip="Poke it" data-act="${on(() => h.cmd("poke"))}"></div>` +
    `<div class="who"><div class="name">${esc(st.seed)}</div><div class="col" style="gap:2px" id="reasons">${reasons}</div>` +
    (st.bedtimeDue ? `<div>${button({ glyph: I.sleep, text: "Not tonight", tip: "No more bedtime nudges until tomorrow night", small: true, act: on(() => h.cmd("snoozeBedtime")) })}</div>` : "") +
    (!h.active ? `<div>${button({ text: "Turn Blobble on", small: true, act: on(() => h.save("active", true)) })}</div>` : "") +
    `</div>${nav}</div>`);

  if (shown("stats") && h.active) {
    out += card({ title: "Right now", trailingHtml: h.setting("quickActions", true) === true
      ? action({ glyph: I.btop, tip: "Open " + desktop.monitorName, size: 22, act: on(() => { h.close(); h.cmd("action", "btop"); }) }) : "" },
    `<div class="grid" id="stats" style="--cols:${2 + (st.hasBattery ? 1 : 0) + (st.temp != null ? 1 : 0)};--gap:6px">${statsHtml(h)}</div>`);
  }
  if (shown("media") && st.player) out += `<div id="media">${mediaCard(h)}</div>`;
  else if (shown("media")) out += `<div id="media"></div>`;
  if (shown("daily")) {
    const d = st.today || {};
    const extras = ["focus", "pomodoros"].some((k) => Number(d[k] || 0) > 0);
    out += card({ title: "Today" }, grid(3,
      stat({ label: "Awake", value: duration(d.awake) }) + stat({ label: "Asleep", value: duration(d.asleep) }) +
      stat({ label: "Songs", value: String(d.songs || 0) }) +
      // What it counts follows what this desktop can feel: workspace switches and notifications where it can.
      (Platform.feels("workspaces") ? stat({ label: "Switches", value: String(d.workspaces || 0) }) : "") +
      (Platform.feels("notifications") ? stat({ label: "Notifications", value: String(d.notifications || 0) }) : "") +
      stat({ label: "Pokes", value: String(d.pokes || 0) }) +
      (Platform.feels("workspaces") ? "" : stat({ label: "Downloads", value: String(d.downloads || 0) }) + stat({ label: "Files fed", value: String(d.fed || 0) })) +
      (extras ? stat({ label: "Focused", value: duration(d.focus) }) + stat({ label: "Pomodoros", value: String(d.pomodoros || 0) }) : "")));
  }
  return out;
}
export function statsHtml(h) {
  const st = h.st;
  const low = h.groupValue("thresholds", "lowBattery", 20);
  return stat({ label: "CPU", value: Math.round(st.cpu || 0) + "%", fraction: (st.cpu || 0) / 100 }) +
    stat({ label: "RAM", value: Math.round(st.ram || 0) + "%", fraction: (st.ram || 0) / 100 }) +
    (st.temp != null ? stat({ label: "Temp", value: Math.round(st.temp) + "°", fraction: Math.min(1, st.temp / 100),
      warn: st.temp >= h.groupValue("thresholds", "hot", 90) }) : "") +
    (st.hasBattery ? stat({ html: "Battery" + (st.charging ? " " + icon(I.charging) : ""), value: Math.round(st.batteryPercent) + "%",
      fraction: st.batteryPercent / 100, warn: !st.charging && st.batteryPercent <= low }) : "");
}
export function mediaCard(h) {
  const p = h.st.player;
  if (!p) return "";
  return card({ title: "Now playing", trailing: p.identity || "" }, `<div class="track"><div class="t">` +
    `<div class="title">${esc(p.trackTitle || "Unknown track")}</div>${p.trackArtist ? `<div class="artist">${esc(p.trackArtist)}</div>` : ""}</div>` +
    action({ glyph: I.prev, tip: "Previous", size: 26, act: on(() => h.cmd("media", "prev")) }) +
    action({ glyph: p.isPlaying ? I.pause : I.play, tip: p.isPlaying ? "Pause" : "Play", size: 26, bordered: true, act: on(() => h.cmd("media", "toggle")) }) +
    action({ glyph: I.next, tip: "Next", size: 26, act: on(() => h.cmd("media", "next")) }) + `</div>`);
}

// --- Look, Colour, Face (AppearanceTab) ------------------------------------------------------
const ADJECTIVES = ["sleepy", "bouncy", "tiny", "fuzzy", "cosmic", "mellow", "brave", "silly", "quiet", "zesty", "lucky", "witty"];
const CREATURES = ["blob", "bean", "mochi", "pebble", "noodle", "sprout", "bubble", "dumpling", "comet", "muffin", "pickle", "otter"];
const randomName = () => { const p = (l) => l[Math.floor(Math.random() * l.length)]; return p(ADJECTIVES) + "-" + p(CREATURES) + "-" + Math.floor(Math.random() * 100); };
const HUE_NAMES = ["red", "orange", "yellow", "green", "teal", "blue", "violet", "pink"];
const TONE_LC = [[0.9, 0.05], [0.82, 0.09], [0.74, 0.12], [0.66, 0.16], [0.58, 0.18], [0.42, 0.1]];
const isHex = (v) => /^#?[0-9a-fA-F]{6}$/.test(String(v || "").trim());
const hexOf = (v) => "#" + String(v).trim().replace("#", "").toLowerCase();
const lookWith = (h, c) => Object.assign({}, h.look, c);

function choicePic(h, look, extra) {
  return still(Object.assign({ seed: h.seed, look, accent: h.accent, size: 36, gazeEnabled: false, showAccessories: false, foreground: h.fg }, extra || {}));
}

export function namePage(h) {
  let typing;
  return card({ title: "Name", info: "The same name always makes the same blob." }, `<div class="row" style="flex-wrap:nowrap">` +
    textField({ id: h.studioMode ? "studio-seed" : "seed", value: h.setting("seed", ""), placeholder: h.st.username || "blob", width: "100%",
      input: (e) => { clearTimeout(typing); typing = setTimeout(() => h.save("seed", e.target.value.trim(), true), 500); },
      change: (e) => h.save("seed", e.target.value.trim()) }) +
    action({ glyph: I.dice, tip: "A random name", bordered: true, size: 30, act: on(() => h.save("seed", randomName())) }) + `</div>`);
}

export function shapePage(h) {
  const cur = h.look.shape || "seed";
  return card({ title: "Shape", info: "Auto takes the shape your name gives it.",
    trailingHtml: button({ text: "auto", small: true, selected: cur === "seed", act: on(() => h.save("shape", "seed")) }) },
  grid(5, Blob.SHAPES.map((s) => choice({ label: s.key, cols: 5, selected: cur === s.key, svg: choicePic(h, lookWith(h, { shape: s.key })),
    act: on(() => h.save("shape", s.key)) })).join("")));
}

export function facePage(h, title, note) {
  const cur = h.look.restingFace || "idle";
  return card({ title: title || "Resting face", info: note === undefined ? "Its everyday face, kept through small moods." : note, trailing: cur },
    grid(4, Blob.EXPRESSIONS.map((f) => choice({ label: f, selected: cur === f, svg: choicePic(h, lookWith(h, { restingFace: f })),
      act: on(() => h.save("restingFace", f)) })).join("")));
}

export function backdropPage(h) {
  const cur = h.look.background || "none";
  return card({ title: "Backdrop", info: "A plate behind the blob, like an avatar.",
    trailingHtml: button({ text: "none", small: true, selected: cur === "none", act: on(() => h.save("background", "none")) }) },
  grid(3, Blob.BACKGROUNDS.filter((b) => b !== "none").map((b) => choice({ label: b, cols: 3, selected: cur === b,
    svg: choicePic(h, lookWith(h, { background: b })), act: on(() => h.save("background", b)) })).join("")) +
  caption("Its colour is in the Colour tab, under Backdrop."));
}

export function sharePage(h) {
  const s = {};
  Share.KEYS.forEach((k) => { s[k] = h.setting(k, undefined); });
  s.seed = h.seed;
  const mine = Share.encode(s);
  const theirs = h.ui.shareCode ? Share.decode(h.ui.shareCode) : null;
  let preview = "";
  if (theirs) {
    const c = Share.apply(theirs);
    const m = Mood.resolve({ now: 1, outfit: { head: c.wearHead, face: c.wearFace, neck: c.wearNeck, ears: c.wearEars, hand: c.wearHand,
      tint: c.wearColour === "theme" ? h.accent : (c.wearColour || "auto") } });
    preview = `<div style="width:56px;height:56px;flex:none">${still({ seed: c.seed || "blob", look: Object.assign({}, c, { background: "none" }),
      accent: isHex(c.accentColour) ? c.accentColour : h.accent, size: 56, fit: true, gazeEnabled: false,
      mood: Object.assign({}, m, { face: c.restingFace || "idle", mild: false }) })}</div>`;
  }
  return card({ title: "Share", info: "A short code with this blob's look: name, shape, colours, face and outfit. Paste one to try it." },
    `<div class="row">${button({ glyph: h.ui.copied ? I.check : I.copy, text: h.ui.copied ? "Copied" : "Copy my code", tip: mine,
      act: on(() => { navigator.clipboard.writeText(mine); h.ui.copied = true; h.render(); setTimeout(() => { h.ui.copied = false; h.render(); }, 1800); }) })}</div>` +
    `<div class="row" style="flex-wrap:nowrap;gap:10px">${preview}<div class="col" style="flex:1">` +
    textField({ id: "share", value: h.ui.shareCode || "", placeholder: "Paste a code (blobble:...)", width: "100%",
      input: (e) => { h.ui.shareCode = e.target.value; h.render(); } }) +
    (h.ui.shareCode && h.ui.shareCode.trim() && !theirs ? `<div class="caption" style="color:var(--urgent);opacity:1">That is not a Blobble code.</div>` : "") +
    (theirs ? `<div>${button({ glyph: I.check, text: "Use this look", tip: "Your blob takes this look. Your settings stay.",
      act: on(() => { h.saveMany(Share.apply(theirs)); h.ui.shareCode = ""; }) })}</div>` : "") +
    `</div></div>`);
}

export function colourPage(h) {
  const look = h.look;
  const mode = look.themeMode === "exact" ? "exact" : typeof look.hue === "number" ? "custom" : look.themeMode === "follow" ? "follow" : look.themeMode === "seed" ? "own" : "tinted";
  const customAccent = isHex(h.setting("accentColour", ""));
  const bodyNow = Blob.bodyColour(h.seed, look, h.accent);
  const wearSetting = h.setting("wearColour", "auto") || "auto";
  const outfitFor = (tint) => Wear.palette(bodyNow, tint === "theme" ? h.accent : tint).main;
  const outfitNow = outfitFor(wearSetting);
  const plate = (look.background || "none") !== "none";
  const backdropSetting = look.backdropColour || "auto";
  const m = Blob.model(h.seed, Blob.options(lookWith(h, { background: "circle", backdropColour: "auto" }), h.accent), "idle");
  const backdropAuto = m.bg ? m.bg.fill : bodyNow;
  const backdropNow = isHex(backdropSetting) ? backdropSetting : backdropAuto;
  const target = h.ui.paletteFor || "body";
  const apply = (t, text) => {
    if (!isHex(text)) return;
    const x = hexOf(text);
    if (t === "body") h.saveMany({ bodyColour: x, themeMode: "exact", hue: "seed" });
    else if (t === "accent") h.save("accentColour", x);
    else if (t === "outfit") h.save("wearColour", x);
    else h.saveMany({ backdropColour: x, background: plate ? look.background : "circle" });
  };
  const pcard = (key, label, sw, src, dim) => `<div class="pcard ${target === key ? "on" : ""}" data-act="${on(() => { h.ui.paletteFor = key; h.render(); })}">` +
    `<div class="dot ${dim ? "dim" : ""}" style="background:${sw}"></div><div class="l">${label}</div><div class="src">${esc(src)}</div>` +
    (target === key ? `<span class="badge">${onBadge(true)}</span>` : "") + `</div>`;
  const srcopt = (label, sw, sel, act) => `<button class="srcopt ${sel ? "on" : ""}" data-act="${on(act)}"><span class="d" style="background:${sw}"></span>${esc(label)}</button>`;
  const exact = (t, value) => `<div class="row" style="flex-wrap:nowrap"><span class="dot" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--tint-35);background:${isHex(value) ? hexOf(value) : "transparent"}"></span>` +
    textField({ value, placeholder: "#e86a92", width: "110px", change: (e) => apply(t, e.target.value) }) +
    (desktop.nativeColourPicker || window.EyeDropper ? button({ glyph: I.picker, tip: desktop.nativeColourPicker ? "Pick from the screen: click a colour (Esc cancels)" : "Pick from the screen", small: true, act: on(async () => {
      try {
        // Windows: read the pixel under the cursor (Rust); Chromium's eyedropper can lock the screen.
        const hex = desktop.nativeColourPicker ? await window.__TAURI__.core.invoke("pick_colour") : (await new EyeDropper().open()).sRGBHex;
        apply(t, hex);
      } catch (e) { /* cancelled */ }
    }) }) : "") + `</div>`;

  let out = card({ title: "Palette", info: "Every colour your blob uses. Click one to change it." }, `<div class="palette">` +
    pcard("body", "Body", bodyNow, mode === "own" ? "from your name" : mode === "tinted" ? "accent tint" : mode === "follow" ? "accent" : "custom") +
    pcard("accent", "Accent", h.accent, customAccent ? "custom" : Platform.NAME + "'s") +
    pcard("outfit", "Outfit", outfitNow, wearSetting === "auto" ? "contrast" : wearSetting === "match" ? "matching" : wearSetting === "theme" ? "accent" : "custom") +
    pcard("backdrop", "Backdrop", backdropNow, !plate ? "no plate" : backdropSetting === "auto" ? "soft tint" : "custom", !plate) + `</div>`);

  if (target === "body") {
    const opts = [
      { mode: "own", label: "Your name", change: { hue: "seed", themeMode: "seed" } },
      { mode: "tinted", label: "Accent tint", change: { hue: "seed", themeMode: "tinted" } },
      { mode: "follow", label: "Accent", change: { hue: "seed", themeMode: "follow" } },
    ];
    let body = grid(2, opts.map((o) => srcopt(o.label, Blob.bodyColour(h.seed, lookWith(h, o.change), h.accent), mode === o.mode, () => h.saveMany(o.change))).join("") +
      srcopt("Custom", mode === "custom" || mode === "exact" ? bodyNow : Blob.bodyColour(h.seed, lookWith(h, { hue: Blob.HUES[0], themeMode: "seed" }), h.accent),
        mode === "custom" || mode === "exact", () => { if (!(mode === "custom" || mode === "exact")) h.saveMany({ hue: Blob.HUES[0], themeMode: "seed" }); }));
    if (mode === "own" || mode === "tinted") {
      body += `<div class="subhead">Tone</div>` + grid(Blob.TONES.length + 1,
        swatch({ hex: Blob.bodyColour(h.seed, lookWith(h, { tone: "seed" }), h.accent), tip: "Auto: the tone your name gives it", selected: typeof look.tone !== "number",
          act: on(() => h.save("tone", "seed")) }) +
        Blob.TONES.map((t) => swatch({ hex: Blob.bodyColour(h.seed, lookWith(h, { tone: t.value }), h.accent), tip: t.label, selected: look.tone === t.value,
          act: on(() => h.save("tone", t.value)) })).join(""), 5);
    } else {
      let cells = "";
      for (let i = 0; i < Blob.TONES.length * Blob.HUES.length; i++) {
        const hue = Blob.HUES[i % 8], t = Blob.TONES[Math.floor(i / 8)];
        cells += swatch({ hex: Blob.bodyColour(h.seed, lookWith(h, { hue, tone: t.value, themeMode: "seed" }), h.accent), tip: t.label + " " + HUE_NAMES[i % 8],
          selected: mode === "custom" && look.hue === hue && look.tone === t.value, act: on(() => h.saveMany({ hue, tone: t.value, themeMode: "seed" })) });
      }
      body += grid(8, cells, 5) + exact("body", mode === "exact" ? h.setting("bodyColour", "") : "");
    }
    out += card({ title: "Body colour", info: "Accent tint: its own shade in the accent's hue. Accent: the accent itself. The accent is " + Platform.NAME + "'s unless you pick one." }, body);
  } else {
    const sources = target === "accent" ? [{ label: Platform.NAME, swatch: h.st.themeAccent, sel: !customAccent, act: () => h.save("accentColour", "") }]
      : target === "outfit" ? [
        { label: "Contrast", swatch: outfitFor("auto"), sel: wearSetting === "auto", act: () => h.save("wearColour", "auto") },
        { label: "Matching", swatch: outfitFor("match"), sel: wearSetting === "match", act: () => h.save("wearColour", "match") },
        { label: "Accent", swatch: outfitFor("theme"), sel: wearSetting === "theme", act: () => h.save("wearColour", "theme") }]
      : [{ label: "Soft tint", swatch: backdropAuto, sel: backdropSetting === "auto", act: () => h.save("backdropColour", "auto") }];
    const custom = target === "accent" ? customAccent : target === "outfit" ? isHex(wearSetting) : isHex(backdropSetting);
    const first = Wear.hexFromOklch(0.66, 0.16, Blob.HUES[0]);
    let cells = "";
    for (let i = 0; i < TONE_LC.length * 8; i++) {
      const lc = TONE_LC[Math.floor(i / 8)];
      const pick = Wear.hexFromOklch(lc[0], lc[1], Blob.HUES[i % 8]);
      const sel = target === "accent" ? customAccent && String(h.accent).toLowerCase() === pick : target === "outfit" ? wearSetting.toLowerCase() === pick : backdropSetting.toLowerCase() === pick;
      cells += swatch({ hex: target === "outfit" ? outfitFor(pick) : pick, tip: Blob.TONES[Math.floor(i / 8)].label + " " + HUE_NAMES[i % 8], selected: sel, act: on(() => apply(target, pick)) });
    }
    out += card({ title: target === "accent" ? "Accent" : target === "outfit" ? "Outfit colour" : "Backdrop colour",
      info: target === "accent" ? "Used by accent tint, accent and the outfit's accent colour." : target === "outfit"
        ? "For the beanie, scarf, tie and the like. Contrast: opposite your blob's colour." : "The plate behind it. Picking one adds a circle if there is no plate." },
    grid(2, sources.map((s) => srcopt(s.label, s.swatch, s.sel, s.act)).join("") +
      srcopt("Custom", custom ? (target === "accent" ? h.accent : target === "outfit" ? outfitNow : backdropNow) : first, custom, () => { if (!custom) apply(target, first); })) +
    grid(8, cells, 5) +
    exact(target, target === "accent" ? (customAccent ? h.accent : "") : target === "outfit" ? (isHex(wearSetting) ? wearSetting : "") : (isHex(backdropSetting) ? backdropSetting : "")));
  }
  return out;
}

// --- Outfit (WardrobeTab) --------------------------------------------------------------------
export function wardrobePage(h, showMoments) {
  const cur = { head: h.setting("wearHead", "") || "none", face: h.setting("wearFace", "") || "none", neck: h.setting("wearNeck", "") || "none",
    ears: h.setting("wearEars", "") || "none", hand: h.setting("wearHand", "") || "none" };
  const colour = h.setting("wearColour", "auto") || "auto";
  const tint = colour === "theme" ? h.accent : colour;
  const outfitWith = (slot, item) => {
    const o = { head: cur.head === "none" ? "" : cur.head, face: cur.face === "none" ? "" : cur.face, neck: cur.neck === "none" ? "" : cur.neck,
      ears: cur.ears === "none" ? "" : cur.ears, hand: cur.hand === "none" ? "" : cur.hand, tint };
    o[slot] = item;
    return o;
  };
  const none = (key, slot) => button({ text: "none", small: true, selected: cur[slot] === "none", act: on(() => h.save(key, "")) });
  const section = (title, info, key, slot, items, cols) => card({ title, info, trailingHtml: none(key, slot) },
    grid(cols, items.map((item) => choice({ label: Wear.LABELS[item] || item, cols, selected: cur[slot] === item,
      svg: still({ seed: h.seed, look: Object.assign({}, h.look, { background: "none" }), accent: h.accent, size: 52, fit: true, showAccessories: false,
        gazeEnabled: false, wear: outfitWith(slot, item) }), act: on(() => h.save(key, item)) })).join("")));
  let out = caption("Outfit colours are in the Colour tab, under Outfit.") +
    section("Hats", "", "wearHead", "head", Wear.HATS_GROUP, 5) +
    section("Headwear", "Instead of a hat. Ears and the like go with either.", "wearHead", "head", Wear.HEADWEAR_GROUP, 4) +
    section("Ears and more", "Worn with any hat or headwear.", "wearEars", "ears", Wear.EARS, 3) +
    section("On its eyes", "", "wearFace", "face", Wear.FACE, 3) +
    section("Around its neck", "Worn together with a hat and glasses.", "wearNeck", "neck", Wear.NECK, 3) +
    section("In its hand", "", "wearHand", "hand", Wear.HAND, 3);
  if (showMoments !== false) {
    const auto = h.groupValue("dress", "auto", true) === true;
    const moment = (key, label, tip) => smallSwitch({ label, tip, checked: h.groupValue("dress", key, key !== "performance") === true,
      act: on(() => { if (auto) h.saveIn("dress", key, !(h.groupValue("dress", key, key !== "performance") === true)); }) });
    out += card({ title: "Moments", info: "Moments put something on for a while, then give your pick back." },
      buttonGroup({ options: [{ value: "keep", label: "Keep my pick" }, { value: "moments", label: "Let moments change it" }],
        value: auto ? "moments" : "keep", change: (v) => h.saveIn("dress", "auto", v === "moments") }) +
      `<div class="grid" style="--cols:2;--gap:4px 12px;${auto ? "" : "opacity:.45"}">` +
      moment("asleep", "Nightcap", "A nightcap while it sleeps and at bedtime") + moment("music", "Headphones", "Headphones while music plays") +
      moment("typing", "Monocle typing", "A monocle while you type (needs the Typing reaction)") + moment("coding", "Glasses coding", "Glasses while a code editor is in front") +
      moment("strained", "Sweatband", "A headband when the CPU is strained") + moment("focus", "Focus band", "A headband during a focus session") +
      moment("seasonal", "Seasonal hats", "Santa, witch and party hats on their days") + `</div>`);
  }
  out += `<div class="row center">${button({ glyph: I.reset, text: "Take everything off", bordered: false, tip: "Nothing on at all. Moments still apply",
    act: on(() => h.saveMany({ wearHead: "", wearFace: "", wearNeck: "", wearEars: "", wearHand: "" })) })}</div>`;
  return out;
}

// --- Reactions (SettingsTab's first page) --------------------------------------------------
const TILE_DRESS = { asleep: true, music: true, strained: true, typing: true, performance: true, focus: true };
function reaction(h, { key, label, tip, sample, fallback = true, cols = 4, lean = 0 }) {
  const feels = Platform.feels(key);
  const isOn = h.groupValue("reactions", key, fallback) === true;
  const m = Mood.resolve(Object.assign({ now: 100000, toggles: { typing: true, breaks: true, bedtime: true, eyes: true, water: true }, dress: TILE_DRESS,
    outfit: tileOutfit(h) }, sample || {}));
  const svg = still({ seed: h.seed, look: Object.assign({}, h.look, { background: "none" }), accent: h.accent, size: 60, fit: true, gazeEnabled: false,
    tilt: lean, mood: Object.assign({}, m, { mild: false }), foreground: h.fg });
  return `<div class="ftile ${isOn && feels ? "on" : ""} ${feels ? "" : "disabled"}" style="--cols:${cols}" ${feels ? `data-act="${on(() => h.saveIn("reactions", key, !isOn))}"` : ""}` +
    ` data-tip="${esc(feels ? tip : tip + ". Not on " + Platform.NAME + " yet")}"><div class="art" style="height:52px">${svg}</div><div class="name">${esc(label)}</div>` +
    `<span class="badge">${onBadge(isOn && feels)}</span></div>`;
}
export function reactionsPage(h) {
  const R = (o) => reaction(h, o);
  const num = (key, group, fallback, from, to, label) => numberField({ label, from, to,
    value: group ? h.groupValue(group, key, fallback) : h.setting(key, fallback),
    change: (v) => (group ? h.saveIn(group, key, v) : h.save(key, v)) });
  return card({ title: "Reacts to", info: "Click a reaction to switch it on or off." }, grid(4,
      R({ key: "music", label: "Music", tip: "Grooves while something plays", sample: { music: { playing: true } } }) +
      R({ key: "workload", label: "Workload", tip: "Thinks when busy, sweats when strained", sample: { load: { cpu: 96, strainedSince: 1 } } }) +
      R({ key: "sleep", label: "Sleep", tip: "Dozes off when you are away", sample: { asleep: true } }) +
      R({ key: "battery", label: "Battery", tip: "Happy charging, tired when low", sample: { battery: { present: true, percent: 5 } } }) +
      R({ key: "poke", label: "Pokes", tip: "Click it", sample: { events: [{ kind: "poke", at: 100000, n: 2 }] } }) +
      R({ key: "gaze", label: "Eyes follow", tip: "Watches your mouse anywhere on screen", lean: 8, sample: {} }) +
      R({ key: "notifications", label: "Notifications", tip: "Jumps when one pops up", sample: { events: [{ kind: "notify", at: 100000 }] } }) +
      R({ key: "windows", label: "Windows", tip: "Glances at new windows, winks at closed ones", sample: { events: [{ kind: "windowClose", at: 100000 }] } }))) +
    card({ title: "Keeps an eye on", info: "Click a reaction to switch it on or off." }, grid(4,
      R({ key: "network", label: "Network", tip: "Unsure while you are offline", sample: { network: { online: false } } }) +
      R({ key: "disk", label: "Disk", tip: "Worries when the disk is almost full", sample: { disk: { percent: 97 } } }) +
      R({ key: "downloads", label: "Downloads", tip: "Cheers when a download lands. Click the pet right after for the file", sample: { events: [{ kind: "downloaded", at: 100000 }] } }) +
      R({ key: "theme", label: "Theme", tip: "A spin and a sparkle when the accent or light/dark changes", sample: { events: [{ kind: "themeChanged", at: 100000 }] } }) +
      R({ key: "attention", label: "Wants you", tip: "A question mark when a window wants you", sample: { attention: { urgent: true } } }) +
      R({ key: "updates", label: "Updates", tip: "A parcel when updates are ready", sample: { updates: { available: true } } }) +
      R({ key: "privacy", label: "Mic & cam", tip: "A red dot while the mic or a camera is on", sample: { privacy: { mic: true } } }) +
      R({ key: "commands", label: "Commands", tip: "Cheers or sulks when a long command ends", sample: { events: [{ kind: "commandOk", at: 100000 }] } }))) +
    card({ title: "Your day", info: "Gentle nudges, off by default. Being away counts as a break." }, grid(3,
      R({ cols: 3, key: "breaks", fallback: false, label: "Breaks", tip: "Sleepy after a long stretch", sample: { breakDue: true } }) +
      R({ cols: 3, key: "eyes", fallback: false, label: "Rest your eyes", tip: "Looks far away for 20 seconds, every 20 minutes", sample: { eyeBreak: true } }) +
      R({ cols: 3, key: "water", fallback: false, label: "Water", tip: "Holds up a glass now and then", sample: { waterDue: true } }) +
      R({ cols: 3, key: "bedtime", fallback: false, label: "Bedtime", tip: "Sleepy and in its nightcap when it gets late", sample: { bedtime: true } }) +
      R({ cols: 3, key: "typing", fallback: false, label: "Typing", tip: "Glances at your keyboard. No keys are read", sample: { typing: true, typedRecently: true } }))) +
    card({ title: "When" }, grid(2,
      num("idleTimeout", "", 120, 10, 3600, "Sleep after (seconds)") + num("lowBattery", "thresholds", 20, 5, 50, "Low battery %") +
      num("busy", "thresholds", 60, 10, 100, "Busy at CPU %") + num("strained", "thresholds", 85, 10, 100, "Strained at CPU %") +
      num("diskFull", "thresholds", 90, 50, 99, "Disk full at %") + num("breakAfter", "", 50, 10, 240, "Break after (minutes)") +
      num("eyesEvery", "", 20, 5, 120, "Rest eyes every (minutes)") + num("waterEvery", "", 60, 10, 240, "Water every (minutes)") +
      num("bedtimeHour", "", 23, 0, 23, "Bedtime (hour)") + num("bedtimeMinute", "", 0, 0, 59, "Bedtime (minute)"), 8)) +
    `<div class="row center">${button({ glyph: I.reset, text: "Reset reactions", bordered: false, tip: "Every reaction on and the default thresholds",
      act: on(() => h.saveMany({ reactions: {}, thresholds: {}, idleTimeout: 120, breakAfter: 50, eyesEvery: 20, waterEvery: 60, bedtimeHour: 23, bedtimeMinute: 0 })) })}</div>`;
}

// --- the editor: Live and Studio ------------------------------------------------------------
const STATES = [
  { key: "music", label: "Music", input: { music: { playing: true } } },
  { key: "busy", label: "Busy", input: { load: { cpu: 70 } } },
  { key: "strained", label: "Strained", input: { load: { cpu: 96, strainedSince: 1 } } },
  { key: "hot", label: "Hot", input: { load: { cpu: 20, temp: 97 } } },
  { key: "typing", label: "Typing", input: { typing: true, typedRecently: true } },
  { key: "charging", label: "Charging", input: { battery: { present: true, percent: 60, charging: true } } },
  { key: "lowbattery", label: "Battery", input: { battery: { present: true, percent: 15 } } },
  { key: "critical", label: "Empty", input: { battery: { present: true, percent: 5 } } },
  { key: "asleep", label: "Asleep", input: { asleep: true } },
  { key: "asking", label: "Wants you", input: { attention: { urgent: true } } },
  { key: "focus", label: "Focusing", input: { focus: { phase: "work", left: 600000 } } },
  { key: "pomobreak", label: "Break", input: { focus: { phase: "short", left: 240000 } } },
  { key: "break", label: "Tired", input: { breakDue: true } },
  { key: "offline", label: "Offline", input: { network: { online: false } } },
  { key: "updates", label: "Updates", input: { updates: { available: true } } },
  { key: "mic", label: "Listening", input: { privacy: { mic: true } } },
  { key: "eyes", label: "Eye rest", input: { eyeBreak: true } },
  { key: "water", label: "Water", input: { waterDue: true } },
  { key: "bedtime", label: "Bedtime", input: { bedtime: true } },
  { key: "download", label: "Download", input: { events: [{ kind: "downloaded", at: 100000 }] } },
];
const ALL_DRESS = { asleep: true, music: true, strained: true, typing: true, coding: true, performance: true, focus: true, seasonal: false };
const SYMBOLS = ["heart", "notes", "zzz", "sweat", "alert", "question", "check", "coffee", "charging", "leaf", "package", "offline",
  "rec", "mic", "camera", "download", "sparkle", "eye", "water", "moon"];

export function studioTint(h) { const s = h.data; return s.wearColour === "theme" ? h.accent : (s.wearColour || "auto"); }
export function studioMood(h) {
  const s = h.data;
  return { face: s.restingFace || "idle", mild: false, motion: { breath: 1, bob: 0, shake: 0, droop: 0, hop: 0, type: 0 },
    accessories: s.symbols || [], reasons: [],
    wear: { head: s.wearHead || "", face: s.wearFace || "", neck: s.wearNeck || "", ears: s.wearEars || "", hand: s.wearHand || "", tint: studioTint(h) } };
}
function stateMood(h, keys) {
  const s = h.data;
  const input = { now: 100000, toggles: { typing: true, breaks: true, bedtime: true, eyes: true, water: true }, dress: ALL_DRESS,
    outfit: { head: s.wearHead || "", face: s.wearFace || "", neck: s.wearNeck || "", ears: s.wearEars || "", hand: s.wearHand || "", tint: studioTint(h) } };
  STATES.forEach((x) => { if (keys.indexOf(x.key) !== -1) Object.assign(input, x.input); });
  return Mood.resolve(input);
}

export function editorPage(h, studioHost) {
  const studio = h.page === "studio";
  const sh = studio ? studioHost : h;
  const tab = h.ui.editorTab || "look";
  const moments = { asleep: "while it sleeps or at bedtime", music: "while music plays", strained: "while the CPU is strained",
    typing: "while you type", coding: "while you code", performance: "in performance mode", focus: "while you focus", seasonal: "for the season" };
  let note = "";
  if (!studio) {
    const m = h.st.mood, by = m.dressedBy || {};
    const notes = [];
    ["head", "face"].forEach((slot) => {
      if (!by[slot]) return;
      const pick = h.setting(slot === "head" ? "wearHead" : "wearFace", "");
      if (pick === m.wear[slot]) return;
      notes.push("Wearing " + (Wear.LABELS[m.wear[slot]] || m.wear[slot]) + " " + (moments[by[slot]] || "for now") + (pick ? ". Your " + (Wear.LABELS[pick] || pick) + " comes back after" : ""));
    });
    note = notes.join(". ");
  }
  const head = h.st.mood.reasons && h.st.mood.reasons.length ? h.st.mood.reasons[0] : { label: "", detail: "" };
  const last = h.ui.lastExport;
  const rail = studio ? `<div class="rail">` + [
    { mode: "copy", glyph: I.copy, label: "Copy", tip: "Copy a picture, ready to paste into a chat or a comment" },
    { mode: "png", glyph: I.image, label: "PNG", tip: "Save a PNG" },
    { mode: "gif", glyph: I.gif, label: "GIF", tip: "Animated GIF" },
    { mode: "sticker", glyph: I.sticker, label: "Sticker", tip: "512 px WebP sticker" },
    { mode: "folder", glyph: I.folder, label: "Folder", tip: "Open the folder with your saved pictures" },
  ].map((r) => button({ glyph: r.glyph, text: r.label, tip: r.tip, bordered: false, disabled: r.mode !== "folder" && h.ui.exporting,
    act: on(() => h.exportStudio(r.mode)) })).join("") + `</div>` : "";
  let top = `<div class="editor-top">` +
    segmented({ options: [{ value: "appearance", label: "Live", tooltip: "Change your real blob" }, { value: "studio", label: "Studio", tooltip: "Pose a copy and export pictures" }],
      value: studio ? "studio" : "appearance", change: (v) => h.go(v) }) +
    `<div class="preview"><div class="blob"${studio ? ` data-tip="${sh.data.fill !== false
      ? "Picture background: exports get this colour behind the blob. Switch it off in Mood > Picture"
      : "See-through: exports have no background. Switch it on in Mood > Picture"}"` : ""}>` +
    `${studio ? `<span class="plate ${sh.data.fill !== false ? "" : "clear"}"></span>` : ""}<div class="art" id="preview"></div></div>` +
    `<div class="words"><div class="head">${esc(studio ? (h.ui.exporting ? "Working on it..." : "A copy to pose") : (head.label || "Calm"))}</div>` +
    (studio && last && !h.ui.exporting
      ? `<div class="dragtile" data-drag="1" data-tip="Drag it into a chat or a folder. It is on the clipboard too">` +
        `<img src="${h.ui.lastThumb || ""}" alt=""><span>Drag the ${/\.gif$/i.test(last) ? "GIF" : /\.webp$/i.test(last) ? "sticker" : "PNG"}</span></div>`
      : `<div class="sub">${esc(studio ? "Nothing here changes your blob." : (note || head.detail || "Changes show on the pet and in the " + Platform.word("home") + "."))}</div>`) +
    `</div>${rail}</div>` +
    tabStrip({ options: [{ value: "look", label: "Look" }, { value: "colour", label: "Colour" }, { value: "face", label: "Face" }, { value: "outfit", label: "Outfit" }, { value: "mood", label: "Mood" }],
      value: tab, change: (v) => { h.ui.editorTab = v; h.render(true); } }) + `</div>`;

  let body = "";
  if (!studio) {
    if (tab === "look") body = namePage(h) + shapePage(h) + backdropPage(h) + sharePage(h);
    else if (tab === "colour") body = colourPage(h);
    else if (tab === "face") body = card({ title: "When moods come", info: "Keep: moods still show with symbols, motion and clothes." },
      buttonGroup({ options: [{ value: "keep", label: "Keep my face" }, { value: "moods", label: "Let moods change it" }],
        value: h.setting("keepFace", false) === true ? "keep" : "moods", change: (v) => h.save("keepFace", v === "keep") })) + facePage(h);
    else if (tab === "outfit") body = wardrobePage(h);
    else body = card({ title: "Right now", info: "Pose any mood in the Studio without changing your blob." },
      (h.st.mood.reasons || []).map((r) => `<div>${esc(r.label + (r.detail ? ": " + r.detail : ""))}</div>`).join("")) + reactionsPage(h);
  } else {
    const s = sh.data;
    if (tab === "look") body = card({ title: "Start from", info: "Your last Studio pose is kept between sessions." }, `<div class="row">` +
        button({ glyph: I.history, text: "last Studio pose", selected: h.setting("studioStart", "last") === "last", act: on(() => { h.save("studioStart", "last"); h.studioFrom("last"); }) }) +
        button({ glyph: I.emoticon, text: "my blob now", selected: h.setting("studioStart", "last") === "live", act: on(() => { h.save("studioStart", "live"); h.studioFrom("live"); }) }) + `</div>`) +
      namePage(sh) + shapePage(sh) + backdropPage(sh) + sharePage(sh);
    else if (tab === "colour") body = colourPage(sh);
    else if (tab === "face") body = facePage(sh, "Face", "");
    else if (tab === "outfit") body = wardrobePage(sh, false);
    else {
      const states = s.states || [];
      const toggleState = (key) => {
        const list = states.slice();
        const i = list.indexOf(key);
        if (i !== -1) list.splice(i, 1); else list.push(key);
        const m = stateMood(sh, list);
        const changes = { states: list, symbols: m.accessories, wearHead: m.wear.head, wearFace: m.wear.face,
          motion: m.motion.bob > 0 ? "groove" : (s.motion === "groove" ? "still" : s.motion) };
        if (!m.mild) changes.restingFace = m.face;
        sh.saveMany(changes);
      };
      const toggleSymbol = (name) => {
        const list = (s.symbols || []).slice();
        const i = list.indexOf(name);
        if (i !== -1) list.splice(i, 1); else { list.push(name); if (list.length > 3) list.shift(); }
        sh.save("symbols", list);
      };
      const tile = (label, mood, sel, act, cols, motionName) => choice({ label, cols, selected: sel, act: on(act),
        svg: still({ seed: sh.seed, look: Object.assign({}, sh.look, { background: "none" }), accent: sh.accent, size: 48, fit: true, gazeEnabled: false, mood,
          foreground: h.fg }) });
      body = card({ title: "States", info: "Pick a few. They set the face, symbols and clothes.", trailing: states.length ? states.length + " on" : "" },
          grid(5, STATES.map((x) => { const m = stateMood(sh, [x.key]); return tile(x.label, Object.assign({}, m, { mild: false, face: m.mild ? (s.restingFace || "idle") : m.face }),
            states.indexOf(x.key) !== -1, () => toggleState(x.key), 5); }).join(""))) +
        card({ title: "Symbols", trailing: "up to 3" }, grid(4, SYMBOLS.map((name) => tile(name, Object.assign({}, studioMood(sh), { accessories: [name], wear: {} }),
          (s.symbols || []).indexOf(name) !== -1, () => toggleSymbol(name), 4)).join(""))) +
        card({ title: "Motion", info: "For GIFs and stickers.", trailingHtml: button({ text: "still", small: true, selected: (s.motion || "still") === "still", act: on(() => sh.save("motion", "still")) }) },
          grid(3, Render.MOTIONS.filter((m) => m !== "still").map((name) => `<div class="choice ${(s.motion || "still") === name ? "selected" : ""}" style="--cols:3" data-act="${on(() => sh.save("motion", name))}">` +
            `<div class="pic" data-motion="${name}"></div><div class="name">${cap(name)}</div>${(s.motion || "still") === name ? `<span class="badge">${onBadge(true)}</span>` : ""}</div>`).join(""))) +
        card({ title: "Picture" }, buttonGroup({ options: [{ value: "256", label: "256 px" }, { value: "512", label: "512 px" }, { value: "1024", label: "1024 px" }],
          value: String(s.size || 512), change: (v) => sh.save("size", Number(v)) }) +
          smallSwitch({ label: "Background colour behind it", tip: "Off: see-through. Stickers always are", checked: s.fill !== false, act: on(() => sh.save("fill", s.fill === false)) }));
    }
  }
  return top + `<div class="page">${body}</div>`;
}

// --- the Desktop pet page ---------------------------------------------------------------------
export function petPage(h) {
  const pet = h.group("pet");
  const enabled = h.st.petEnabled;
  const sz = Number(pet.size) || 96;
  const home = pet.home || Platform.defaultHome();
  const winTaskbar = desktop.taskbarHome;   // only Windows has a taskbar to sit on
  const showBar = desktop.mapBar;           // the strip on the map: Windows's taskbar, Omarchy's bar
  const sub = h.ui.petSub || "place";
  const ringIds = Platform.ring(pet.ring).map((a) => a.id);
  const toggleAction = (id) => {
    const list = ringIds.slice();
    const i = list.indexOf(id);
    if (i !== -1) { if (list.length > 1) list.splice(i, 1); } else if (list.length < Actions.MAX_RING) list.push(id);
    h.saveIn("pet", "ring", list);
  };
  const art = (props, badge) => `<div style="position:relative;width:52px;height:46px;display:grid;place-items:center">` +
    pic(h, Object.assign({ size: 40, showAccessories: false }, props)) +
    (badge ? `<span style="position:absolute;right:-2px;bottom:-2px;font-size:15px;filter:drop-shadow(0 0 2px var(--popup))">${icon(badge)}</span>` : "") + `</div>`;
  const tile = (key, label, tip, props, badge, fallback = true) => featureTile({ label, tip, cols: 3, on: h.groupValue("pet", key, fallback) === true,
    art: art(props, badge), act: on(() => h.saveIn("pet", key, !(h.groupValue("pet", key, fallback) === true))) });

  let out = card({}, `<div class="row" style="flex-wrap:nowrap;gap:12px"><div style="width:52px;height:52px;flex:none;${enabled ? "" : "opacity:.45"}">` +
    pic(h, { size: 52, mood: h.st.mood, showAccessories: false }) + `</div><div class="col" style="flex:1;gap:2px;min-width:0">` +
    `<div style="font-size:14px;font-weight:700">${enabled ? "On your desktop" : "Not on your desktop"}</div>` +
    ["Click to poke, drag to move", "Right click or hold for its ring", "Drop files on it"].map((t) => `<div class="caption">${t}</div>`).join("") +
    `</div>${toggle({ checked: enabled, act: on(() => h.cmd("togglePet")) })}</div>`);
  out += tabStrip({ options: [{ value: "place", label: "Size and place" }, { value: "behaviour", label: "Behaviour" }, { value: "menu", label: "Menu" }],
    value: sub, change: (v) => { h.ui.petSub = v; h.render(); } });

  if (sub === "place") {
    out += card({ title: "Size", trailing: sz + " px" },
      sizePicker({ options: previews(h, [{ value: 64, label: "S" }, { value: 96, label: "M" }, { value: 144, label: "L" }, { value: 200, label: "XL" }, { value: 280, label: "XXL" }]),
        value: sz, change: (v) => h.saveIn("pet", "size", Number(v)) }) +
      slider({ min: 48, max: 400, step: 4, value: sz, change: (v) => h.saveIn("pet", "size", Math.round(v)) }));
    // The map shows your screen: the taskbar where yours is, the spots in the space left.
    const bar = h.st.taskbarEdge || "bottom";
    const T = 0.075, Tw = 0.045;   // the taskbar's thickness on the map, across and along
    const area = !showBar ? { x0: 0, x1: 1, y0: 0, y1: 1 } : { x0: bar === "left" ? Tw : 0, x1: bar === "right" ? 1 - Tw : 1, y0: bar === "top" ? T : 0, y1: bar === "bottom" ? 1 - T : 1 };
    const at = (fx, fy) => ({ x: area.x0 + (area.x1 - area.x0) * fx, y: area.y0 + (area.y1 - area.y0) * fy });
    const barSpot = bar === "top" ? { x: 0.72, y: T / 2 + 0.06 } : bar === "left" ? { x: Tw / 2 + 0.04, y: 0.78 }
      : bar === "right" ? { x: 1 - Tw / 2 - 0.04, y: 0.78 } : { x: 0.72, y: 1 - T / 2 - 0.06 };
    // Only Windows has a taskbar to sit on: elsewhere the map is the screen and its corners.
    const spots = [
      Object.assign({ key: "top-left" }, at(0.13, 0.2)), Object.assign({ key: "top-right" }, at(0.87, 0.2)),
      Object.assign({ key: "center" }, at(0.5, 0.5)),
      Object.assign({ key: "bottom-left" }, at(0.13, 0.8)), Object.assign({ key: "bottom-right" }, at(0.87, 0.8)),
    ].concat(winTaskbar ? [Object.assign({ key: "taskbar" }, barSpot)] : []);
    out += card({ title: "Home", info: "Where it starts and goes back to. Where you drop it is remembered." + (winTaskbar ? " Taskbar sits it on the taskbar." : ""), trailing: home.replace("-", " ") },
      `<div class="map">${showBar ? `<div class="bar ${bar}"></div>` : ""}` + spots.map((s) => `<div class="spot" style="left:${s.x * 100}%;top:${s.y * 100}%" data-tip="${cap(s.key.replace("-", " "))}"` +
        ` data-act="${on(() => h.saveIn("pet", "home", s.key))}">${home === s.key ? pic(h, { size: 30, showAccessories: false }) : "<i></i>"}</div>`).join("") + `</div>` +
      `<div class="row center">${button({ glyph: I.home, text: "Move it home now", act: on(() => h.cmd("resetPet")) })}</div>`);
  } else if (sub === "behaviour") {
    out += card({ title: "Behaviour", info: "Click one to switch it." }, grid(3,
      tile("carryReactions", "Carried", "Gasps, leans into the drag and lands with a bounce", { lift: 1, tilt: -14, faceOverride: "surprised" }, I.carry) +
      tile("wander", "Wanders", "Strolls near its spot now and then", { walk: 1 }, I.walk) +
      tile("acceptFiles", "Takes files", "Drop files on it to convert, shrink, zip or copy them", { faceOverride: "happy" }, I.file) +
      featureTile({ label: "Above windows", tip: "Off keeps it on the desktop, behind your windows", cols: 3, on: (pet.layer || "top") === "top",
        art: art({}, I.layers), act: on(() => h.saveIn("pet", "layer", (pet.layer || "top") === "top" ? "bottom" : "top")) }) +
      tile("longPress", "Long press menu", "Hold it to open its menu", {}, I.press) +
      tile("barTrip", Platform.word("trip"), Platform.word("tripTip"), { lift: 1 }, I.bar)));
    out += card({ title: "In fullscreen", info: "When a video, a game or slides go fullscreen." },
      buttonGroup({ options: [{ value: "duck", label: "Duck to the edge" }, { value: "fade", label: "Fade away" }, { value: "stay", label: "Stay" }],
        value: String(pet.fullscreen || "duck"), change: (v) => h.saveIn("pet", "fullscreen", v) }));
  } else {
    const style = pet.menu || "ring";
    const ringArt = `<svg viewBox="0 0 50 46" width="50" height="46">` + [0, 1, 2, 3, 4, 5].map((i) => {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      return `<circle cx="${25 + 16 * Math.cos(a)}" cy="${23 + 16 * Math.sin(a)}" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
    }).join("") + `<circle cx="25" cy="23" r="6" fill="currentColor"/></svg>`;
    const listArt = `<svg viewBox="0 0 50 46" width="50" height="46">` + [0, 1, 2, 3].map((i) => `<rect x="5" y="${8 + i * 8}" width="40" height="5" rx="2.5" fill="currentColor"/>`).join("") + `</svg>`;
    out += card({ title: "Style" }, grid(3,
      featureTile({ label: "Ring", tip: "Buttons fan out around it", cols: 3, on: style === "ring", art: ringArt, act: on(() => h.saveIn("pet", "menu", "ring")) }) +
      featureTile({ label: "List", tip: "A plain list beside it", cols: 3, on: style === "list", art: listArt, act: on(() => h.saveIn("pet", "menu", "list")) }) +
      featureTile({ label: "Ring turns", tip: "The ring turns slowly while open", glyph: I.turn, cols: 3, on: style === "ring" && pet.ringDrift === true,
        act: on(() => { if (style === "ring") h.saveIn("pet", "ringDrift", !(pet.ringDrift === true)); }) })));
    const n = ringIds.length;
    const prev = `<div class="ringprev"><div class="me">${pic(h, { size: 54, showAccessories: false })}</div>` + ringIds.map((id, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, n);
      const act = Platform.action(id) || {};
      return `<div class="slot" style="left:calc(50% + ${64 * Math.cos(a)}px);top:calc(50% + ${64 * Math.sin(a)}px)" data-tip="${esc(act.label)}. Click to take out"` +
        ` data-act="${on(() => toggleAction(id))}">${act.drawn === "tomato" ? icon("tomato") : icon(act.icon)}<span class="n">${i + 1}</span></div>`;
    }).join("") + `</div>`;
    out += card({ title: "What it holds", info: "Click an action to add or take it out. They go around in this order, starting at the top.", trailing: n + " of " + Actions.MAX_RING },
      prev + grid(4, Platform.ACTIONS.map((a) => {
        const at = ringIds.indexOf(a.id);
        return `<div class="pick ${at !== -1 ? "on" : ""}" data-tip="${esc(a.label)}" data-act="${on(() => toggleAction(a.id))}">${a.drawn === "tomato" ? icon("tomato") : icon(a.icon)}` +
          `<span class="l">${esc(a.label)}</span>${at !== -1 ? `<span class="n">${at + 1}</span>` : ""}</div>`;
      }).join("")) + `<div>${button({ glyph: I.reset2, text: "Back to the default set", act: on(() => h.saveIn("pet", "ring", Actions.DEFAULT_RING)) })}</div>`);
  }
  return out;
}

// --- Settings ---------------------------------------------------------------------------------
export function settingsPage(h) {
  const tab = h.ui.settingsTab || "reactions";
  let out = tabStrip({ options: [{ value: "reactions", label: "Reactions" }, { value: "features", label: "Features" }, { value: "taskbar", label: desktop.settingsTab.label }, { value: "about", label: "About" }],
    value: tab, change: (v) => { h.ui.settingsTab = v; h.render(); } });
  const flip = (group, key, fallback) => {
    const cur = (group ? h.groupValue(group, key, fallback) : h.setting(key, fallback)) === true;
    group ? h.saveIn(group, key, !cur) : h.save(key, !cur);
  };
  const isOn = (group, key, fallback) => (group ? h.groupValue(group, key, fallback) : h.setting(key, fallback)) === true;
  const ft = (o) => featureTile(Object.assign({ cols: 3 }, o));
  if (tab === "reactions") out += reactionsPage(h);
  else if (tab === "taskbar") out += desktop.settingsTab.page(h, { ft, isOn, flip, pic: (props) => pic(h, props), previews: (options) => previews(h, options) });
  else if (tab === "features") {
    // What only this desktop has (OmaBlob's Long commands and Shortcuts on Omarchy): tiles in the list, and cards under it.
    const kit = { ft, isOn, flip, pic: (props) => pic(h, props), previews: (options) => previews(h, options) };
    const extra = desktop.features ? desktop.features(h, kit) : {};
    out += card({ title: "Features", info: "Click one to switch it on or off. The corner button opens or tries it." }, grid(3,
      ft({ glyph: "tomato", art: `<span style="font-size:28px">${icon("tomato")}</span>`, label: "Pomodoro", tip: "Focus and break rounds, with their own button", on: isOn("features", "pomodoro", true),
        act: on(() => flip("features", "pomodoro", true)), extraGlyph: I.open, extraTip: "Open", extraAct: on(() => h.go("pomodoro")) }) +
      ft({ glyph: I.timer, label: "Timer", tip: "A plain countdown, with its own button", on: isOn("features", "timer", true),
        act: on(() => flip("features", "timer", true)), extraGlyph: I.open, extraTip: "Open", extraAct: on(() => h.go("timer")) }) +
      (extra.afterTimer || "") +
      ft({ glyph: I.eye, label: "Eyes follow", tip: "Watches your mouse anywhere on screen", on: isOn("reactions", "gaze", true), act: on(() => flip("reactions", "gaze", true)) }) +
      ft({ glyph: I.trick, label: "Idle antics", tip: "Little tricks when nothing is going on", on: isOn("features", "antics", true),
        act: on(() => flip("features", "antics", true)), extraGlyph: I.play, extraTip: "Do a trick now", extraAct: on(() => h.cmd("antic")) }) +
      (extra.afterAntics || "") +
      ft({ glyph: I.bell, label: "Nudge alerts", tip: "Notifications for breaks, eyes, water and bedtime", on: isOn("features", "breakNotify", true), act: on(() => flip("features", "breakNotify", true)) }) +
      ft({ glyph: I.pause, label: "Less motion", tip: "No bobbing, shaking, breathing, walking or antics", on: isOn("", "reduceMotion", false), act: on(() => flip("", "reduceMotion", false)) }) +
      (desktop.startLabel ? ft({ glyph: I.power, label: desktop.startLabel, tip: Platform.word("autostartTip"), on: !!h.st.autostart, act: on(() => h.cmd("autostart", !h.st.autostart)) }) : "")));
    out += extra.cards || "";
    out += card({ title: "Desktop pet", info: "The same switches as on the Pet page." }, grid(3,
      ft({ glyph: I.carry, label: "Carried", tip: "Gasps, leans into the drag and lands with a bounce", on: isOn("pet", "carryReactions", true), act: on(() => flip("pet", "carryReactions", true)) }) +
      ft({ glyph: I.walk, label: "Wanders", tip: "Strolls near its spot now and then", on: isOn("pet", "wander", true), act: on(() => flip("pet", "wander", true)) }) +
      ft({ glyph: I.file, label: "Takes files", tip: "Drop files on it to convert, shrink, zip or copy them", on: isOn("pet", "acceptFiles", true), act: on(() => flip("pet", "acceptFiles", true)) }) +
      ft({ glyph: I.layers, label: "Above windows", tip: "Off keeps it on the desktop, behind your windows", on: (h.group("pet").layer || "top") === "top",
        act: on(() => h.saveIn("pet", "layer", (h.group("pet").layer || "top") === "top" ? "bottom" : "top")) }) +
      ft({ glyph: I.press, label: "Long press menu", tip: "Hold it to open its menu", on: isOn("pet", "longPress", true), act: on(() => flip("pet", "longPress", true)) }) +
      ft({ glyph: I.bar, label: Platform.word("trip"), tip: Platform.word("tripTip"), on: isOn("pet", "barTrip", true), act: on(() => flip("pet", "barTrip", true)) })));
    out += card({ title: "Panel", info: "What this panel shows. Hover a tile for more." }, grid(3,
      ft({ glyph: I.why, label: "Why it feels", tip: "The reasons behind its mood", on: isOn("sections", "reasons", true), act: on(() => flip("sections", "reasons", true)) }) +
      ft({ glyph: I.gauge, label: "Right now", tip: "CPU, memory and battery", on: isOn("sections", "stats", true), act: on(() => flip("sections", "stats", true)) }) +
      ft({ glyph: I.music, label: "Now playing", tip: "The current track, with controls", on: isOn("sections", "media", true), act: on(() => flip("sections", "media", true)) }) +
      ft({ glyph: I.calendar, label: "Today", tip: "Today's stats", on: isOn("sections", "daily", true), act: on(() => flip("sections", "daily", true)) }) +
      ft({ glyph: I.flash, label: "Quick buttons", tip: "A button to open " + desktop.monitorName, on: isOn("", "quickActions", true), act: on(() => flip("", "quickActions", true)) })));
  } else {
    out += card({ title: "Blobble", trailing: "version " + h.st.version },
      caption("A blob made from your name that " + desktop.aboutLine + " and reacts to what you are doing. Drawn with blobatar (MIT) and Material Design Icons (Apache 2.0)."));
    out += updateCard(h);
    out += card({ title: "Support" }, caption("Found a bug or have an idea? Open an issue:") + linkBlock(h, REPO + "/issues") +
      caption("Enjoying Blobble? A star helps others find it:") + linkBlock(h, REPO));
    const armed = h.ui.resetArmed;
    out += `<div class="row center">` + button({ glyph: I.help, text: "Welcome guide", tip: "Show the tour from the first start again", bordered: false,
      act: on(() => { h.ui.welcomeStep = 0; h.go("welcome"); }) }) + button({ glyph: I.reset, text: armed ? "Click again to reset" : "Reset everything", urgent: true, bordered: false,
      tip: "Back to defaults. Keeps your name and stats", act: on(() => {
        if (!armed) { h.ui.resetArmed = true; h.render(); setTimeout(() => { h.ui.resetArmed = false; h.render(); }, 4000); return; }
        h.ui.resetArmed = false;
        h.saveMany(Object.assign({}, Blob.DEFAULT_LOOK, { active: true, reduceMotion: false, quickActions: true, idleTimeout: 120, reactions: {}, thresholds: {},
          sections: {}, features: {}, dress: {}, wearHead: "", wearFace: "", wearNeck: "", wearEars: "", wearHand: "", wearColour: "auto", accentColour: "", breakAfter: 50,
          pet: { enabled: true, size: 96, home: Platform.defaultHome(), layer: "top", carryReactions: true, wander: true, acceptFiles: true, menu: "ring", ringDrift: false } }));
      }) }) + `</div>`;
  }
  return out;
}

// A line to copy, with a button that opens it in the browser.
const linkBlock = (h, url) => commandBlock(url, action({ glyph: I.open, tip: "Open in the browser", size: 24, act: on(() => h.openUrl(url)) }), url.replace(/^https:\/\//, ""));

// "Update": Blobble is a download, not a git checkout, so this asks GitHub for the newest release and
// points at it (the installer on Windows, the package or AppImage on Linux).
const newer = (a, b) => {
  const n = (v) => String(v).replace(/^v/, "").split(".").map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function checkUpdate(h) {
  h.ui.update = { state: "checking" };
  h.render();
  try {
    const text = await window.__TAURI__.core.invoke("latest_release");
    const r = JSON.parse(text);
    if (!r.tag_name) h.ui.update = { state: "none" };
    else h.ui.update = { state: newer(r.tag_name, h.st.version) ? "newer" : "latest", tag: r.tag_name, url: r.html_url || REPO + "/releases" };
  } catch (e) { h.ui.update = { state: "error", note: String(e) }; }
  h.render();
}
function updateCard(h) {
  const u = h.ui.update || { state: "idle" };
  const check = button({ glyph: I.reset, text: u.state === "checking" ? "Checking..." : "Check for updates", disabled: u.state === "checking", act: on(() => checkUpdate(h)) });
  const msg = { idle: "You have version " + h.st.version + ".", checking: "Asking GitHub for the newest version...",
    latest: "You have the newest version (" + h.st.version + ").", none: "No release is published yet.",
    error: "Could not check: " + (u.note || "no answer") + ".", newer: "Version " + String(u.tag || "").replace(/^v/, "") + " is out. You have " + h.st.version + "." }[u.state];
  return card({ title: "Update" }, caption(msg) +
    `<div class="row">${check}` + (u.state === "newer" ? button({ glyph: I.open, text: "Download", selected: true, act: on(() => h.openUrl(u.url)) }) : "") + `</div>`);
}

// --- Welcome ---------------------------------------------------------------------------------------
// The tour from the first start, after OmaBlob's welcome guide: eight steps, each with its own demo
// of the live blob (panel.js mounts it), and a star on GitHub on the last.
export const WELCOME_LAST = 7;
export function welcomePage(h) {
  const home = desktop.words.home;
  const titles = ["Hi, I'm yours", "I feel what you do", "Poke me", "Dress me up", "Let me out", "Focus with me", "Stickers of me", "Make me yours"];
  const lines = [`Made from "${h.seed}". No one else has me.`, "", "Click me. Go on.", "Hats, glasses, ears and more.", "The paw puts me on your desktop.",
    "Pomodoro timer, with my headband on.", "The sparkles make PNGs, GIFs and stickers.", "Click me in the " + home + " anytime."];
  const i = Math.max(0, Math.min(WELCOME_LAST, h.ui.welcomeStep || 0));
  const last = i === WELCOME_LAST;
  const finish = on(() => { h.ui.welcomeStep = 0; h.go("blob"); });
  const to = (n) => on(() => { h.ui.welcomeStep = n; h.render(true); });
  const dots = titles.map((_, k) => `<span class="wdot${k === i ? " on" : ""}"></span>`).join("");
  return `<div class="welcome">` +
    `<div class="wstage"><div id="wblob" class="wblob"></div><div id="wclock" class="wclock"></div></div>` +
    `<div id="wlabel" class="wlabel"></div>` +
    `<div class="wtitle">${esc(titles[i])}</div>` + (lines[i] ? `<div class="wline">${esc(lines[i])}</div>` : "") +
    (last ? `<div class="row center">${button({ glyph: I.settings, text: "Open settings", act: on(() => { h.ui.welcomeStep = 0; h.go("settings"); }) })}</div>` +
      `<div class="wstar">${icon(I.sparkle, 26, "accent")}<div class="grow"><b>Enjoying Blobble?</b><div class="caption">A star on GitHub helps others find it.</div></div>` +
      button({ text: "Star", act: on(() => h.openUrl(REPO)) }) + `</div>` : "") +
    `<div class="wdots">${dots}</div>` +
    `<div class="wnav">${i < WELCOME_LAST ? button({ text: "Skip", bordered: false, act: finish }) : "<span></span>"}` +
    `<span class="row">${i > 0 ? button({ text: "Back", act: to(i - 1) }) : ""}${button({ text: last ? "Done" : "Next", selected: true, act: last ? finish : to(i + 1) })}</span></div>` +
    `</div>`;
}

// --- Pomodoro and Timer ------------------------------------------------------------------------
export function pomodoroPage(h) {
  const p = h.st.pomo;
  const running = p.focusing;
  const minutes = (key, fallback, from, to, label) => numberField({ label, from, to, value: h.groupValue("features", key, fallback), change: (v) => h.saveIn("features", key, v) });
  const sw = (key, label, tip) => smallSwitch({ label, tip, checked: h.groupValue("features", key, true) === true, act: on(() => h.saveIn("features", key, !(h.groupValue("features", key, true) === true))) });
  const every = p.longBreakEvery;
  const round = p.done % every + (p.phase === "work" || !running ? 1 : 0);
  return card({}, `<div class="clock" id="pomoclock">` + pomoClockHtml(h) + `</div>` +
      `<div class="row center">` +
      button({ glyph: !running || p.paused ? I.play : I.pause, text: !running ? "Start" : p.paused ? "Resume" : "Pause", act: on(() => h.cmd(running ? "pauseFocus" : "startFocus")) }) +
      (running ? button({ glyph: I.next, text: p.onBreak ? "Skip break" : "Skip", act: on(() => h.cmd("skipPhase")) }) + button({ glyph: I.stop, text: "Stop", act: on(() => h.cmd("stopFocus")) }) : "") +
      `</div><div class="clock"><div class="note">Round ${Math.max(1, Math.min(every, round))} of ${every}. Long break after round ${every}.</div></div>`) +
    card({ title: "Minutes" }, grid(2, minutes("focusMinutes", 25, 1, 180, "Focus") + minutes("shortBreak", 5, 1, 60, "Break") +
      minutes("longBreak", 15, 1, 90, "Long break") + minutes("longBreakEvery", 4, 2, 12, "Rounds per cycle"), 8)) +
    card({ title: "While it runs", info: "Headband while you focus, coffee on breaks. Click the time under the pet to come back here.",
      trailing: (h.st.today.pomodoros || 0) > 0 ? h.st.today.pomodoros + " today" : "" },
      `<div class="grid" style="--cols:2;--gap:4px 12px">` + sw("pomodoroNotify", "Notifications", "A notification when focus or a break starts") +
      sw("pomodoroTime", "Show the time", "Under the pet") + `</div>`);
}
export function pomoClockHtml(h) {
  const p = h.st.pomo;
  const running = p.focusing;
  return `<div class="what">${running ? esc(p.label + (p.paused ? ", paused" : "")) : "Ready when you are"}</div>` +
    `<div class="time ${running && p.paused ? "paused" : ""}">${running ? p.clock : (p.focusMinutes < 10 ? "0" : "") + p.focusMinutes + ":00"}</div>` +
    `<div class="progress"><span style="width:${running ? Math.max(0, Math.min(1, p.progress)) * 100 : 0}%"></span></div>`;
}

export function timerPage(h) {
  const t = h.st.timer;
  const running = t.timing;
  const mins = t.minutes;
  return card({}, `<div class="clock" id="timerclock">` + timerClockHtml(h) + `</div><div class="row center">` +
      button({ glyph: !running || t.paused ? I.play : I.pause, text: !running ? "Start" : t.paused ? "Resume" : "Pause",
        act: on(() => (running ? h.cmd("pauseTimer") : h.cmd("startTimer", mins * 60))) }) +
      (running ? button({ glyph: I.plus, text: "1 min", act: on(() => h.cmd("addTimer", 60)) }) + button({ glyph: I.stop, text: "Stop", act: on(() => h.cmd("stopTimer")) }) : "") +
      `</div>`) +
    card({ title: "Length", info: "Click a length to start right away." },
      grid(4, [1, 3, 5, 10, 15, 20, 30, 60].map((m) => button({ text: m < 60 ? m + " min" : "1 hour", selected: mins === m,
        act: on(() => { h.saveIn("features", "timerMinutes", m); h.cmd("startTimer", m * 60); }) })).join("")) +
      `<div style="width:50%">${numberField({ label: "Other (minutes)", from: 1, to: 600, value: mins, change: (v) => h.saveIn("features", "timerMinutes", v) })}</div>`) +
    card({ title: "While it runs" }, `<div style="width:50%">${smallSwitch({ label: "Show the time", tip: "Under the pet",
      checked: h.groupValue("features", "timerTime", true) === true, act: on(() => h.saveIn("features", "timerTime", !(h.groupValue("features", "timerTime", true) === true))) })}</div>`);
}
export function timerClockHtml(h) {
  const t = h.st.timer;
  const running = t.timing;
  return `<div class="what">${!running ? "Set a time" : t.paused ? "Paused" : "Counting down"}</div>` +
    `<div class="time ${running && t.paused ? "paused" : ""}">${running ? t.clock : (t.minutes < 10 ? "0" : "") + t.minutes + ":00"}</div>` +
    `<div class="progress"><span style="width:${running ? Math.max(0, Math.min(1, t.progress)) * 100 : 0}%"></span></div>`;
}

export { STATES, SYMBOLS };
