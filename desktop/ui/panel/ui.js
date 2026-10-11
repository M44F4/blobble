// The panel's building blocks, after OmaBlob's QML ones (Card, Button, PanelActionButton,
// ToggleSwitch, SmallSwitch, Segmented, TabStrip, ButtonGroup, FeatureTile, OnBadge, NumberField,
// SizePicker, CommandBlock...). Each returns HTML; handlers are registered with on() and found
// again by one delegated listener, so a page can be rebuilt as plain text.
import { icon, I } from "../shared/icons.js";

let handlers = {};
let next = 0;
let scope = "";
export function resetHandlers() { handlers = {}; next = 0; }
export function on(fn) { const id = (scope ? scope + ":" : "") + "h" + (next++); handlers[id] = fn; return id; }
export function handler(id) { return handlers[id]; }
// Builds a region that is rebuilt on its own (a ticking clock, the music card): its handlers
// from the last build go, so they do not pile up between full redraws.
export function withScope(name, build) {
  for (const id of Object.keys(handlers)) if (id.startsWith(name + ":")) delete handlers[id];
  const outer = scope;
  scope = name;
  try { return build(); } finally { scope = outer; }
}

export const esc = (s) => String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const cap = (t) => { t = String(t || ""); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };
const tipAttr = (tip) => (tip ? ` data-tip="${esc(tip)}"` : "");

// A softly filled, rounded section with an optional title, info dot and a value on the right.
export function card({ title = "", info = "", trailing = "", trailingHtml = "", cls = "", style = "" }, body) {
  const head = title || trailing || trailingHtml
    ? `<div class="card-head"><span class="card-title">${esc(title)}</span>` +
      (info ? `<span class="info"${tipAttr(info)}>${icon(I.info)}</span>` : "") +
      `<span class="grow"></span>${trailing ? `<span class="trailing">${esc(trailing)}</span>` : ""}${trailingHtml}</div>`
    : "";
  return `<section class="card ${cls}" style="${style}">${head}<div class="card-body">${body}</div></section>`;
}

export function button({ text = "", glyph = "", tip = "", selected = false, bordered = true, act, cls = "", disabled = false, urgent = false, small = false }) {
  return `<button class="btn ${bordered ? "bordered" : ""} ${selected ? "selected" : ""} ${urgent ? "urgent" : ""} ${small ? "small" : ""} ${cls}"` +
    `${act ? ` data-act="${act}"` : ""}${tipAttr(tip)}${disabled ? " disabled" : ""}>` +
    (glyph ? icon(glyph) : "") + (text ? `<span>${esc(text)}</span>` : "") + `</button>`;
}

// An icon-only round button, like PanelActionButton.
export function action({ glyph, tip = "", lit = false, bordered = false, act, size = 28, cls = "", html = "" }) {
  return `<button class="iconbtn ${lit ? "lit" : ""} ${bordered ? "bordered" : ""} ${cls}" style="--s:${size}px"` +
    `${act ? ` data-act="${act}"` : ""}${tipAttr(tip)}>${html || icon(glyph)}</button>`;
}

export function toggle({ checked, act, tip = "", small = false }) {
  return `<button class="toggle ${checked ? "on" : ""} ${small ? "small" : ""}" role="switch" aria-checked="${checked}"${act ? ` data-act="${act}"` : ""}${tipAttr(tip)}><span></span></button>`;
}

// A small switch with its name.
export function smallSwitch({ label, tip = "", checked, act, width = "" }) {
  return `<div class="smallswitch ${checked ? "on" : ""}" data-act="${act}"${tipAttr(tip)} style="${width ? `width:${width}` : ""}">` +
    `<span class="name">${esc(label)}</span>${toggle({ checked, small: true })}</div>`;
}

export function onBadge(on) {
  return `<span class="onbadge ${on ? "on" : ""}">${on ? icon(I.check) : ""}</span>`;
}

// A switch between a few modes: a soft track with the picked one on a sliding pill.
export function segmented({ options, value, change, width = 84 }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return `<div class="segmented" style="--w:${width}px;--n:${options.length};--i:${i}"><span class="pill"></span>` +
    options.map((o) => `<button class="${o.value === value ? "on" : ""}" data-act="${on(() => change(o.value))}"${tipAttr(o.tooltip)}>${esc(o.label)}</button>`).join("") +
    `</div>`;
}

// Tabs that read as tabs: names over a thin line, the open one in the accent with a bar.
export function tabStrip({ options, value, change }) {
  return `<div class="tabstrip">` + options.map((o) =>
    `<button class="${o.value === value ? "on" : ""}" data-act="${on(() => change(o.value))}">${esc(o.label)}</button>`).join("") + `</div>`;
}

// A row of joined choices, like Omarchy's ButtonGroup.
export function buttonGroup({ options, value, change }) {
  return `<div class="btngroup">` + options.map((o) =>
    `<button class="${o.value === value ? "on" : ""}" data-act="${on(() => change(o.value))}"${tipAttr(o.tooltip)}>${esc(o.label)}</button>`).join("") + `</div>`;
}

// A switch as a tile: an icon (or art), its name and whether it is on.
export function featureTile({ label, tip = "", glyph = "", art = "", on: isOn, act, extraGlyph = "", extraTip = "", extraAct = "", cols = 3, disabled = false }) {
  return `<div class="ftile ${isOn ? "on" : ""} ${disabled ? "disabled" : ""}" style="--cols:${cols}"${act && !disabled ? ` data-act="${act}"` : ""}${tipAttr(tip)}>` +
    `<div class="art">${art || (glyph ? icon(glyph) : "")}</div><div class="name">${esc(label)}</div>` +
    `<span class="badge">${onBadge(isOn)}</span>` +
    (extraGlyph && isOn ? `<button class="extra" data-act="${extraAct}"${tipAttr(extraTip)}>${icon(extraGlyph)}</button>` : "") +
    `</div>`;
}

// A tile with your blob wearing one option.
export function choice({ label, svg, selected, act, cols = 4, tip = "", dim = false }) {
  return `<div class="choice ${selected ? "selected" : ""} ${dim ? "dim" : ""}" style="--cols:${cols}" data-act="${act}"${tipAttr(tip)}>` +
    `<div class="pic">${svg}</div><div class="name">${esc(cap(label))}</div>` +
    (selected ? `<span class="badge">${onBadge(true)}</span>` : "") + `</div>`;
}

export function grid(cols, body, gap = 6) {
  return `<div class="grid" style="--cols:${cols};--gap:${gap}px">${body}</div>`;
}

export function caption(text) { return `<p class="caption">${esc(text)}</p>`; }

// A number with its label, and buttons to nudge it.
export function numberField({ label, value, from, to, change }) {
  const set = (v) => change(Math.max(from, Math.min(to, Math.round(v))));
  return `<label class="numfield"><span class="name">${esc(label)}</span><span class="box">` +
    `<button data-act="${on(() => set(value - 1))}">${icon(I.minus)}</button>` +
    `<input type="number" min="${from}" max="${to}" value="${value}" data-change="${on((e) => set(Number(e.target.value) || from))}">` +
    `<button data-act="${on(() => set(value + 1))}">${icon(I.plus)}</button></span></label>`;
}

export function textField({ value = "", placeholder = "", input, change, id = "", width = "" }) {
  return `<input class="textfield" type="text" ${id ? `data-keep="${id}"` : ""} value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false"` +
    `${input ? ` data-input="${on(input)}"` : ""}${change ? ` data-change="${on(change)}"` : ""} style="${width ? `width:${width}` : ""}">`;
}

export function slider({ min, max, step, value, change }) {
  const p = max > min ? Math.round((value - min) / (max - min) * 1000) / 10 : 0;
  return `<input class="slider" type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="--p:${p}%" data-change="${on((e) => change(Number(e.target.value)))}">`;
}

// Sizes as a row of buttons; an option with `art` is a tile with that picture over its label, like
// OmaBlob's size picker (the blob drawn at a growing size so the choice reads at a glance).
export function sizePicker({ options, value, change }) {
  const art = options.some((o) => o.art);
  return `<div class="sizepicker${art ? " art" : ""}">` + options.map((o) =>
    `<button class="${String(o.value) === String(value) ? "on" : ""}" data-act="${on(() => change(o.value))}">` +
    `${o.art ? `<span class="a">${o.art}</span>` : ""}${esc(o.label)}</button>`).join("") + `</div>`;
}

// A line of text to copy, like CommandBlock.
export function commandBlock(text, before = "", shown = text) {
  return `<div class="cmdblock"><code>${esc(shown)}</code>${before}${action({ glyph: I.copy, tip: "Copy", size: 24,
    act: on((e) => { navigator.clipboard.writeText(text); const b = e.target.closest("button"); b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1500); }) })}</div>`;
}

export function stat({ label, value, fraction = -1, warn, html = "" }) {
  const w = warn === undefined ? fraction >= 0.85 : warn;
  return `<div class="stat ${w ? "warn" : ""}"><div class="label">${html || esc(label)}</div><div class="value">${esc(value)}</div>` +
    (fraction >= 0 ? `<div class="bar"><span style="width:${Math.max(0, Math.min(1, fraction)) * 100}%"></span></div>` : "") + `</div>`;
}

export function swatch({ hex, tip = "", selected, act, cols = 8 }) {
  return `<button class="swatch ${selected ? "selected" : ""}" style="--c:${hex};--cols:${cols}" data-act="${act}"${tipAttr(tip)}>${selected ? icon(I.check) : ""}</button>`;
}
