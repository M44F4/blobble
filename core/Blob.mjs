// Turns a seed string plus OmaBlob settings into something QML can draw: plain SVG path
// strings for the body and eyes, and eye matrices for a pose.
import blobatar from "./vendor/blobatar.mjs";

export const expressions = blobatar.expressions;

export const EXPRESSIONS = [
  "idle", "happy", "sad", "mad", "surprised", "wink", "sleepy",
  "smug", "unsure", "scared", "love", "shy", "sick", "thinking",
];

// Middle of each silhouette's band on blobatar's "shape" trait.
export const SHAPES = [
  { key: "round", value: 0.11 },
  { key: "organic", value: 0.35 },
  { key: "boxy", value: 0.54 },
  { key: "capsule", value: 0.65 },
  { key: "nub", value: 0.745 },
  { key: "cloud", value: 0.825 },
  { key: "droplet", value: 0.8875 },
  { key: "hexagon", value: 0.935 },
  { key: "sun", value: 0.9675 },
  { key: "triangle", value: 0.99 },
];

export const BACKGROUNDS = ["none", "circle", "squircle", "square"];

// The hue stops blobatar's own editor offers, in degrees.
export const HUES = [12, 40, 78, 140, 190, 225, 275, 320];

// One position inside each of blobatar's six tone bands, pale to ink.
export const TONES = [
  { value: 0.1, label: "Pastel" },
  { value: 0.28, label: "Mist" },
  { value: 0.49, label: "Soft" },
  { value: 0.71, label: "Vivid" },
  { value: 0.865, label: "Bright" },
  { value: 0.965, label: "Ink" },
];

export const DEFAULT_LOOK = {
  shape: "seed", hue: "seed", tone: "seed", background: "none",
  backdropColour: "auto", themeMode: "tinted", restingFace: "idle",
};
export const THEME_MODES = ["tinted", "follow", "seed"];

// Hex colour to OKLCH, the space blobatar picks its hues in.
export function oklch(hex) {
  const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
  const lin = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = Math.atan2(b, a) * 180 / Math.PI;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, b),
    h: h < 0 ? h + 360 : h,
  };
}

function isHex(v) {
  return typeof v === "string" && /^#?[0-9a-f]{6}/i.test(v);
}

// OmaBlob settings + theme accent -> blobatar options.
export function options(settings, accent) {
  const s = settings || {};
  const opts = {};
  const bg = s.background || "none";
  opts.background = bg === "none" ? false : bg;

  const shape = SHAPES.find((x) => x.key === s.shape);
  if (shape) opts.traits = { shape: shape.value };

  if (typeof s.tone === "number") opts.tone = Math.min(0.999, Math.max(0, s.tone));

  const mode = s.themeMode || "tinted";
  if (typeof s.hue === "number") {
    opts.hue = ((s.hue % 360) + 360) % 360;
  } else if (mode === "tinted" && isHex(accent)) {
    const c = oklch(accent);
    if (c.c > 0.03) opts.hue = c.h;
  }

  // Backdrop colour: "auto" (blobatar's soft tint of the blob) or a hex.
  if (isHex(s.backdropColour)) {
    opts.palette = Object.assign({}, opts.palette, { bg: "#" + String(s.backdropColour).replace("#", "").slice(0, 6) });
  }

  if (mode === "exact" && isHex(s.bodyColour)) {
    const head = "#" + String(s.bodyColour).replace("#", "").slice(0, 6);
    opts.palette = Object.assign({}, opts.palette, { head, eye: oklch(head).l >= 0.6 ? "#14161a" : "#f6f6f4" });
    return opts;
  }

  if (mode === "follow" && isHex(accent)) {
    const head = "#" + String(accent).replace("#", "").slice(0, 6);
    opts.palette = Object.assign({}, opts.palette, { head, eye: oklch(head).l >= 0.6 ? "#14161a" : "#f6f6f4" });
  }
  return opts;
}

// blobatar's own soft backdrop tint for each hue stop, for backdrop swatches.
export function backdropTints(name) {
  return HUES.map((h) => model(name, { hue: h, background: "circle" }, "idle").bg.fill);
}

// The body colour a look would have, for colour swatches.
export function bodyColour(name, look, accent) {
  return model(name, options(look, accent), "idle").fill.head;
}

function circlePath(m) {
  const r = m.r;
  return `M${m.cx - r} ${m.cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

// Bounding box of the body, in viewBox units.
function bounds(marks) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x, y) => {
    box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y);
  };
  for (const m of marks) {
    if (m.kind === "circle") {
      add(m.cx - m.r, m.cy - m.r);
      add(m.cx + m.r, m.cy + m.r);
      continue;
    }
    const tokens = String(m.d).match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let cmd = "M", x = 0, y = 0, nums = [];
    const flush = () => {
      if (cmd === "H") nums.forEach((v) => { x = v; add(x, y); });
      else if (cmd === "V") nums.forEach((v) => { y = v; add(x, y); });
      else for (let i = 0; i + 1 < nums.length; i += 2) { x = nums[i]; y = nums[i + 1]; add(x, y); }
      nums = [];
    };
    for (const t of tokens) {
      if (/[A-Za-z]/.test(t)) { flush(); cmd = t; } else nums.push(Number(t));
    }
    flush();
  }
  return isFinite(box.x0) ? box : { x0: 0, y0: 0, x1: 100, y1: 100 };
}

function toPath(m) {
  return { d: m.kind === "circle" ? circlePath(m) : m.d, fill: m.fill };
}

// Everything needed to draw one blob in one expression.
export function model(name, opts, expression) {
  const e = expression && expression !== "idle" ? expressions[expression] : undefined;
  const p = blobatar._posed(String(name || "blob"), Object.assign({}, opts, { expression: e }));
  return {
    bg: p.bg ? { d: p.bg.d, fill: p.bg.fill } : null,
    body: p.marks.map(toPath),
    box: bounds(p.marks),
    eyes: p.eyes.map(toPath),
    frames: p.eyeFrames,
    pose: p.pose || null,
    fill: p.fill,
    hot: p.hot,
  };
}

export function colours(m) {
  return m.hot ? m.hot : m.fill;
}

export const lerpPose = blobatar.lerpPose;
export const fadeHex = blobatar.fadeHex;

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

// Parses the translate/rotate/scale chains blobatar's poseTransforms emits.
export function parseTransform(str) {
  let m = [1, 0, 0, 1, 0, 0];
  const re = /(translate|rotate|scale)\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(str))) {
    const v = hit[2].trim().split(/[\s,]+/).map(Number);
    let n;
    if (hit[1] === "translate") n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (hit[1] === "scale") n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
    else {
      const r = (v[0] || 0) * Math.PI / 180;
      n = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
    }
    m = multiply(m, n);
  }
  return m;
}

export function eyeMatrices(frames, pose, blink, gazeX, gazeY) {
  const p = Object.assign({}, lerpPose(undefined, pose || undefined, 1));
  p.esy = p.esy * (1 - 0.9 * Math.min(1, Math.max(0, blink || 0)));
  const t = blobatar.poseTransforms({ eyes: frames }, p);
  const shift = [1, 0, 0, 1, gazeX || 0, gazeY || 0];
  return {
    eyes: t.eyes.map((s) => multiply(shift, parseTransform(s))),
    bodyY: p.bdy,
  };
}
