// A blob's look as a short text code, to share it, like
// "blobble:n=pebble;s=sun;f=happy;wh=crown".
// Codes made by OmaBlob ("omablob:...") decode too.

export const KEYS = [
  "seed", "shape", "hue", "tone", "background", "backdropColour", "themeMode", "bodyColour", "restingFace",
  "accentColour", "wearHead", "wearFace", "wearNeck", "wearEars", "wearHand", "wearColour",
];
const SHORT = {
  seed: "n", shape: "s", hue: "h", tone: "t", background: "b", backdropColour: "bc", themeMode: "m", bodyColour: "c",
  restingFace: "f", accentColour: "a", wearHead: "wh", wearFace: "wf", wearNeck: "wn", wearEars: "we", wearHand: "wd", wearColour: "wc",
};
const NUMERIC = ["hue", "tone"];
const DEFAULTS = {
  shape: "seed", hue: "seed", tone: "seed", background: "none", backdropColour: "auto",
  themeMode: "tinted", restingFace: "idle", wearColour: "auto",
};

export function pick(settings) {
  const out = {};
  KEYS.forEach((k) => {
    const v = settings ? settings[k] : undefined;
    if (typeof v === "number" && isFinite(v)) out[k] = v;
    else if (v !== undefined && v !== null && v !== "" && String(v) !== DEFAULTS[k]) out[k] = String(v);
  });
  return out;
}

export function encode(settings) {
  const look = pick(settings);
  return "blobble:" + Object.keys(look).map((k) => SHORT[k] + "=" + encodeURIComponent(look[k])).join(";");
}

export function decode(text) {
  const m = String(text || "").match(/(?:blobble|omablob):([A-Za-z0-9_.~%=;!*-]+)/);
  if (!m || m[1].length > 1000) return null;
  const out = {};
  m[1].split(";").forEach((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 1) return;
    const key = KEYS.find((k) => SHORT[k] === pair.slice(0, eq));
    if (!key) return;
    let v;
    try { v = decodeURIComponent(pair.slice(eq + 1)); } catch (e) { return; }
    if (!v || v.length > 64) return;
    out[key] = NUMERIC.indexOf(key) !== -1 && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  });
  return Object.keys(out).length ? out : null;
}

export function apply(look) {
  const out = {};
  KEYS.forEach((k) => { out[k] = look && look[k] !== undefined ? look[k] : (DEFAULTS[k] || ""); });
  return out;
}
