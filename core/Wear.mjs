// Things the blob can wear: hats, headphones, glasses and the like.
import * as Blob from "./Blob.mjs";

// Slots: one item each, all worn together.
export const HEAD = [
  "tophat", "beanie", "party", "crown", "cap", "bow", "flower",
  "headphones", "headband", "nightcap", "santa", "witch", "cowboy", "chef",
];
export const HATS_GROUP = ["tophat", "beanie", "party", "crown", "cap", "nightcap", "santa", "witch", "cowboy", "chef"];
export const HEADWEAR_GROUP = ["headphones", "headband", "bow", "flower"];
export const EARS = ["cat", "bunny", "bear", "antennae", "horns", "halo"];
export const FACE = ["glasses", "sunglasses", "monocle", "hearts", "stars", "eyepatch"];
export const NECK = ["bowtie", "scarf", "necktie"];
export const HAND = ["broom", "pan", "hammer", "brush", "wand", "umbrella"];

export const LABELS = {
  none: "none", tophat: "top hat", beanie: "beanie", party: "party hat", crown: "crown",
  cap: "cap", bow: "bow", flower: "flower", headphones: "headphones", headband: "headband",
  nightcap: "nightcap", santa: "santa hat", witch: "witch hat",
  glasses: "glasses", sunglasses: "sunglasses", monocle: "monocle",
  cowboy: "cowboy", chef: "chef hat", cat: "cat ears", bunny: "bunny ears", bear: "bear ears",
  antennae: "antennae", horns: "horns", halo: "halo",
  hearts: "heart glasses", stars: "star glasses", eyepatch: "eye patch",
  bowtie: "bow tie", scarf: "scarf", necktie: "necktie",
  broom: "broom", pan: "frying pan", hammer: "hammer", brush: "paintbrush", wand: "magic wand", umbrella: "umbrella",
};

export function slotOf(name) {
  if (HEAD.indexOf(name) !== -1) return "head";
  if (FACE.indexOf(name) !== -1) return "face";
  if (NECK.indexOf(name) !== -1) return "neck";
  if (EARS.indexOf(name) !== -1) return "ears";
  if (HAND.indexOf(name) !== -1) return "hand";
  return "";
}


function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export function resolveFill(fill, bodyHex) {
  if (typeof fill !== "string" || fill.charAt(0) !== "@") return fill;
  const hex = /^#[0-9a-f]{6}/i.test(String(bodyHex || "")) ? String(bodyHex).slice(0, 7) : "#8899aa";
  if (fill === "@bodyLight") return lighten(hex, 0.42);
  if (fill === "@bodyDark") return shade(hex, 0.72);
  return hex;
}

function lighten(hex, k) {
  const h = String(hex).replace("#", "");
  return "#" + [0, 2, 4].map(function (i) {
    const v = parseInt(h.slice(i, i + 2), 16);
    const n = Math.round(v + (255 - v) * k).toString(16);
    return n.length < 2 ? "0" + n : n;
  }).join("");
}

function shade(hex, k) {
  const h = String(hex).replace("#", "");
  return "#" + [0, 2, 4].map(function (i) {
    const v = Math.round(clamp(parseInt(h.slice(i, i + 2), 16) * k, 0, 255)).toString(16);
    return v.length < 2 ? "0" + v : v;
  }).join("");
}

export function hexFromOklch(l, c, h) {
  const r = h * Math.PI / 180;
  const a = c * Math.cos(r), b = c * Math.sin(r);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return "#" + lin.map(function (v) {
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    const n = Math.round(clamp(g, 0, 1) * 255).toString(16);
    return n.length < 2 ? "0" + n : n;
  }).join("");
}

// Colours that read on any blob: the main colour sits opposite the body's hue, so a hat never
// melts into the head, and the dark ones get a light rim so they still show against a dark
// bar.
export function palette(bodyHex, tint) {
  const body = Blob.oklch(bodyHex || "#8899aa");
  let hue = body.c > 0.03 ? (body.h + 180) % 360 : 20, l = 0.7, ch = 0.16;
  if (tint === "match") { hue = body.h; ch = Math.max(0.06, Math.min(0.16, body.c)); l = body.l > 0.6 ? 0.52 : 0.78; }
  else if (/^#?[0-9a-f]{6}$/i.test(String(tint || ""))) {
    const t = Blob.oklch("#" + String(tint).replace("#", ""));
    hue = t.h; ch = Math.max(0.02, t.c); l = Math.max(0.45, Math.min(0.82, t.l));
  }
  return {
    main: hexFromOklch(l, ch, hue),
    mainDark: hexFromOklch(Math.max(0.3, l - 0.18), ch * 0.85, hue),
    mainLight: hexFromOklch(Math.min(0.94, l + 0.16), ch * 0.45, hue),
    dark: "#2a2d34",
    darkRim: "#5d626e",
    gold: "#e8b64c",
    goldDark: "#a87a1f",
    white: "#f5f2ea",
    lens: "#171a20",
    leather: "#9a6a3c",
    leatherDark: "#6b4524",
    whiteRim: "#cfc8b8",
    horn: "#d8433f",
    hornDark: "#8f2422",
    heart: "#ff5c8a",
    heartDark: "#c2185b",
    pink: "#f4a7b9",
    collar: "#d23b3b",
    glint: "#ffffff",
    red: "#d9434b",
    redDark: "#9c2a31",
    purple: "#5b4a8a",
    purpleDark: "#3a2f5c",
    blue: "#6d86c9",
    blueDark: "#4a5f99",
  };
}


function flatten(d) {
  const tokens = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const polys = [];
  let poly = [];
  let i = 0, cmd = "M", x = 0, y = 0, sx = 0, sy = 0;
  const num = function () { return Number(tokens[i++]); };
  const curve = function (pts, steps) {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      let px, py;
      if (pts.length === 4) {
        px = u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0];
        py = u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1];
      } else {
        px = u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0];
        py = u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1];
      }
      poly.push([px, py]);
    }
  };
  const arc = function (rx, ry, phi, large, sweep, x2, y2) {
    const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
    const dx = (x - x2) / 2, dy = (y - y2) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (large === sweep) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cp * cxp - sp * cyp + (x + x2) / 2, cy = sp * cxp + cp * cyp + (y + y2) / 2;
    const ang = function (ux, uy, vx, vy) {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
    for (let k = 1; k <= steps; k++) {
      const t = t1 + dt * k / steps;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      poly.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
    }
  };
  const close = function () { if (poly.length > 2) polys.push(poly); poly = []; };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M":
        close();
        x = ox + num(); y = oy + num(); sx = x; sy = y;
        poly.push([x, y]);
        cmd = rel ? "l" : "L";
        break;
      case "L": x = ox + num(); y = oy + num(); poly.push([x, y]); break;
      case "H": x = ox + num(); poly.push([x, y]); break;
      case "V": y = oy + num(); poly.push([x, y]); break;
      case "C": {
        const c1 = [ox + num(), oy + num()], c2 = [ox + num(), oy + num()], e = [ox + num(), oy + num()];
        curve([[x, y], c1, c2, e], 10);
        x = e[0]; y = e[1];
        break;
      }
      case "Q": {
        const c1 = [ox + num(), oy + num()], e = [ox + num(), oy + num()];
        curve([[x, y], c1, e], 8);
        x = e[0]; y = e[1];
        break;
      }
      case "A": {
        const rx = num(), ry = num(), phi = num(), large = num(), sweep = num();
        const ex = ox + num(), ey = oy + num();
        arc(rx, ry, phi, !!large, !!sweep, ex, ey);
        x = ex; y = ey;
        break;
      }
      case "Z":
        x = sx; y = sy;
        close();
        break;
      default:
        i++;
    }
    if (cmd.toUpperCase() === "Z") cmd = "M";
  }
  close();
  return polys;
}

const STEP = 0.5;
const outlineCache = {};

export function outline(model) {
  const key = model.body.map(function (b) { return b.d; }).join("|");
  if (outlineCache[key]) return outlineCache[key];
  const polys = [];
  model.body.forEach(function (b) { flatten(b.d).forEach(function (p) { polys.push(p); }); });
  const y0 = Math.floor(model.box.y0) - 1, y1 = Math.ceil(model.box.y1) + 1;
  const rows = [];
  for (let y = y0; y <= y1; y += STEP) {
    let spans = [];
    polys.forEach(function (p) {
      const xs = [];
      for (let k = 0; k < p.length; k++) {
        const a = p[k], b = p[(k + 1) % p.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      xs.sort(function (m, n) { return m - n; });
      for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]]);
    });
    spans.sort(function (m, n) { return m[0] - n[0]; });
    const merged = [];
    spans.forEach(function (s) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 0.01) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    });
    rows.push({ y: y, spans: merged });
  }
  const shape = { rows: rows, y0: y0 };
  const keys = Object.keys(outlineCache);
  if (keys.length > 40) delete outlineCache[keys[0]];
  outlineCache[key] = shape;
  return shape;
}

function rowAt(shape, y) {
  const k = Math.round((y - shape.y0) / STEP);
  return shape.rows[clamp(k, 0, shape.rows.length - 1)];
}

function spanNear(row, x, reach) {
  let best = null, dist = Infinity;
  row.spans.forEach(function (s) {
    const d = x < s[0] ? s[0] - x : (x > s[1] ? x - s[1] : 0);
    if (d < dist) { dist = d; best = s; }
  });
  return dist <= (reach || 0) ? best : null;
}

function topAt(shape, x) {
  for (let k = 0; k < shape.rows.length; k++) {
    if (spanNear(shape.rows[k], x, 0)) return shape.rows[k].y;
  }
  return null;
}

export function anchors(model) {
  const shape = outline(model);
  const m = Blob.eyeMatrices(model.frames, model.pose, 0, 0, 0);
  const eyes = model.frames.map(function (f, i) {
    const t = m.eyes[i];
    return {
      x: t[0] * f.cx + t[2] * f.cy + t[4],
      y: t[1] * f.cx + t[3] * f.cy + t[5],
      r: Math.max(f.rx, f.ry),
      hh: f.ry * Math.hypot(t[2], t[3]),
    };
  }).sort(function (a, b) { return a.x - b.x; });
  const cx = (eyes[0].x + eyes[eyes.length - 1].x) / 2;
  const eyeY = eyes.reduce(function (s, e) { return s + e.y; }, 0) / eyes.length;
  const eyeR = eyes.reduce(function (s, e) { return Math.max(s, e.r); }, 0);
  const eyeRow = spanNear(rowAt(shape, eyeY), cx, 30) || [model.box.x0, model.box.x1];
  return {
    shape: shape,
    eyes: eyes,
    cx: cx,
    eyeY: eyeY,
    eyeR: eyeR,
    eyeHH: eyes.reduce(function (s, e) { return Math.max(s, e.hh); }, 0),
    eyeGap: eyes.length > 1 ? eyes[eyes.length - 1].x - eyes[0].x : eyeR * 4,
    headW: eyeRow[1] - eyeRow[0],
    headL: eyeRow[0],
    headR: eyeRow[1],
    top: topAt(shape, cx) === null ? model.box.y0 : topAt(shape, cx),
  };
}

function rest(a, x, w, need) {
  const rows = a.shape.rows;
  for (let k = 0; k < rows.length; k++) {
    const s = spanNear(rows[k], x, 1.5);
    if (s && s[1] - s[0] >= need) return { x: (s[0] + s[1]) / 2, y: rows[k].y, span: s };
  }
  return { x: x, y: a.top, span: [x - w / 2, x + w / 2] };
}


function pen(tx, ty, deg, scale) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), k = scale || 1;
  const pts = [];
  const p = function (x, y) {
    const X = tx + k * (c * x - s * y), Y = ty + k * (s * x + c * y);
    pts.push([X, Y]);
    return X.toFixed(2) + " " + Y.toFixed(2);
  };
  return {
    pts: pts,
    M: function (x, y) { return "M" + p(x, y); },
    L: function (x, y) { return "L" + p(x, y); },
    Q: function (x1, y1, x, y) { return "Q" + p(x1, y1) + " " + p(x, y); },
    C: function (x1, y1, x2, y2, x, y) { return "C" + p(x1, y1) + " " + p(x2, y2) + " " + p(x, y); },
    // Ellipse as four cubics, so it survives the transform.
    ellipse: function (cx, cy, rx, ry) {
      const kx = rx * 0.5523, ky = ry * 0.5523;
      return "M" + p(cx - rx, cy) +
        "C" + p(cx - rx, cy - ky) + " " + p(cx - kx, cy - ry) + " " + p(cx, cy - ry) +
        "C" + p(cx + kx, cy - ry) + " " + p(cx + rx, cy - ky) + " " + p(cx + rx, cy) +
        "C" + p(cx + rx, cy + ky) + " " + p(cx + kx, cy + ry) + " " + p(cx, cy + ry) +
        "C" + p(cx - kx, cy + ry) + " " + p(cx - rx, cy + ky) + " " + p(cx - rx, cy) + "Z";
    },
    rect: function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      const q = r * 0.5523;
      return "M" + p(x + r, y) + "L" + p(x + w - r, y) +
        "C" + p(x + w - r + q, y) + " " + p(x + w, y + r - q) + " " + p(x + w, y + r) +
        "L" + p(x + w, y + h - r) +
        "C" + p(x + w, y + h - r + q) + " " + p(x + w - r + q, y + h) + " " + p(x + w - r, y + h) +
        "L" + p(x + r, y + h) +
        "C" + p(x + r - q, y + h) + " " + p(x, y + h - r + q) + " " + p(x, y + h - r) +
        "L" + p(x, y + r) +
        "C" + p(x, y + r - q) + " " + p(x + r - q, y) + " " + p(x + r, y) + "Z";
    },
  };
}

function fill(d, colour, extra) { return Object.assign({ d: d, fill: colour }, extra || {}); }
function line(d, colour, width, extra) {
  return Object.assign({ d: d, fill: "transparent", stroke: colour, width: width }, extra || {});
}

const HATS = {
  tophat: function (P, w, c) {
    const h = w * 0.62, cw = w * 0.66;
    return [
      fill(P.rect(-cw / 2, -h, cw, h, w * 0.05), c.dark, { stroke: c.darkRim, width: w * 0.025 }),
      fill(P.rect(-cw / 2, -h * 0.34, cw, h * 0.16, 0), c.main),
      fill(P.rect(-w * 0.62, -w * 0.07, w * 1.24, w * 0.11, w * 0.05), c.dark, { stroke: c.darkRim, width: w * 0.025 }),
    ];
  },
  beanie: function (P, w, c, tall) {
    const h = tall ? tall / 0.975 : w * 0.5;
    return [
      fill(P.M(-w * 0.52, 0) + P.C(-w * 0.52, -h * 1.3, w * 0.52, -h * 1.3, w * 0.52, 0) + "Z", c.main),
      fill(P.rect(-w * 0.56, -w * 0.14, w * 1.12, w * 0.2, w * 0.08), c.mainDark),
      fill(P.ellipse(0, -h * 0.975 - w * 0.06, w * 0.13, w * 0.13), c.white),
    ];
  },
  party: function (P, w, c) {
    const h = w * 0.92, b = w * 0.38;
    return [
      fill(P.M(-b, 0) + P.L(0, -h) + P.L(b, 0) + P.Q(0, w * 0.08, -b, 0) + "Z", c.main),
      fill(P.M(-b * 0.62, -h * 0.38) + P.L(b * 0.62, -h * 0.38) + P.L(b * 0.5, -h * 0.5) + P.L(-b * 0.5, -h * 0.5) + "Z", c.gold),
      fill(P.M(-b * 0.28, -h * 0.7) + P.L(b * 0.28, -h * 0.7) + P.L(b * 0.2, -h * 0.79) + P.L(-b * 0.2, -h * 0.79) + "Z", c.gold),
      fill(P.ellipse(0, -h, w * 0.09, w * 0.09), c.gold),
    ];
  },
  crown: function (P, w, c) {
    const h = w * 0.42, b = w * 0.42;
    return [
      fill(P.M(-b, 0) + P.L(-b, -h) + P.L(-b * 0.5, -h * 0.55) + P.L(0, -h * 1.12) + P.L(b * 0.5, -h * 0.55) +
        P.L(b, -h) + P.L(b, 0) + P.Q(0, w * 0.06, -b, 0) + "Z", c.gold, { stroke: c.goldDark, width: w * 0.025 }),
      fill(P.ellipse(0, -h * 0.3, w * 0.06, w * 0.06), c.red),
      fill(P.ellipse(-b * 0.6, -h * 0.26, w * 0.04, w * 0.04), c.main),
      fill(P.ellipse(b * 0.6, -h * 0.26, w * 0.04, w * 0.04), c.main),
    ];
  },
  cap: function (P, w, c, tall) {
    const h = tall ? tall / 0.975 : w * 0.42;
    return [
      fill(P.M(-w * 0.5, w * 0.05) + P.C(-w * 0.52, -h * 1.3, w * 0.52, -h * 1.3, w * 0.5, w * 0.05) +
        P.Q(0, -w * 0.05, -w * 0.5, w * 0.05) + "Z", c.main),
      fill(P.M(w * 0.3, -w * 0.02) + P.Q(w * 0.75, -w * 0.08, w * 0.92, w * 0.04) + P.Q(w * 0.6, w * 0.08, w * 0.3, w * 0.06) + "Z", c.mainDark),
      fill(P.ellipse(0, -h * 0.975, w * 0.06, w * 0.04), c.mainDark),
    ];
  },
  cowboy: function (P, w, c) {
    return [
      fill(P.M(-w * 0.38, -w * 0.02) + P.C(-w * 0.42, -w * 0.3, -w * 0.36, -w * 0.56, -w * 0.2, -w * 0.6) +
        P.Q(0, -w * 0.47, w * 0.2, -w * 0.6) + P.C(w * 0.36, -w * 0.56, w * 0.42, -w * 0.3, w * 0.38, -w * 0.02) + "Z",
        c.leather, { stroke: c.leatherDark, width: w * 0.025 }),
      fill(P.M(-w * 0.395, -w * 0.18) + P.L(w * 0.395, -w * 0.18) + P.L(w * 0.385, -w * 0.07) + P.L(-w * 0.385, -w * 0.07) + "Z", c.leatherDark),
      fill(P.M(-w * 0.98, -w * 0.26) + P.C(-w * 0.94, -w * 0.02, -w * 0.6, w * 0.05, 0, w * 0.05) +
        P.C(w * 0.6, w * 0.05, w * 0.94, -w * 0.02, w * 0.98, -w * 0.26) +
        P.C(w * 0.82, -w * 0.08, w * 0.5, -w * 0.06, 0, -w * 0.06) +
        P.C(-w * 0.5, -w * 0.06, -w * 0.82, -w * 0.08, -w * 0.98, -w * 0.26) + "Z",
        c.leather, { stroke: c.leatherDark, width: w * 0.03 }),
    ];
  },
  chef: function (P, w, c) {
    const rim = { stroke: c.whiteRim, width: w * 0.03 };
    return [
      fill(P.ellipse(-w * 0.3, -w * 0.52, w * 0.28, w * 0.28), c.white, rim),
      fill(P.ellipse(w * 0.3, -w * 0.52, w * 0.28, w * 0.28), c.white, rim),
      fill(P.ellipse(0, -w * 0.7, w * 0.34, w * 0.34), c.white, rim),
      fill(P.rect(-w * 0.42, -w * 0.4, w * 0.84, w * 0.4, w * 0.05), c.white, rim),
    ];
  },
  nightcap: function (P, w, c) {
    const h = w * 0.62;
    return [
      fill(P.M(-w * 0.5, 0) + P.C(-w * 0.45, -h * 1.1, w * 0.25, -h * 1.3, w * 0.78, -h * 0.55) +
        P.C(w * 0.4, -h * 0.75, w * 0.42, -h * 0.3, w * 0.5, 0) + "Z", c.main),
      fill(P.rect(-w * 0.55, -w * 0.13, w * 1.1, w * 0.18, w * 0.08), c.white),
      fill(P.ellipse(w * 0.8, -h * 0.52, w * 0.12, w * 0.12), c.white),
    ];
  },
  santa: function (P, w, c) {
    const h = w * 0.62;
    return [
      fill(P.M(-w * 0.5, 0) + P.C(-w * 0.45, -h * 1.1, w * 0.25, -h * 1.3, w * 0.78, -h * 0.55) +
        P.C(w * 0.4, -h * 0.75, w * 0.42, -h * 0.3, w * 0.5, 0) + "Z", c.red),
      fill(P.rect(-w * 0.56, -w * 0.14, w * 1.12, w * 0.2, w * 0.1), c.white),
      fill(P.ellipse(w * 0.8, -h * 0.52, w * 0.13, w * 0.13), c.white),
    ];
  },
  witch: function (P, w, c) {
    const h = w * 0.95;
    return [
      fill(P.M(-w * 0.34, -w * 0.02) + P.Q(-w * 0.1, -h * 0.6, w * 0.02, -h) + P.Q(w * 0.18, -h * 0.82, w * 0.3, -h * 0.75) +
        P.Q(w * 0.14, -h * 0.6, w * 0.34, -w * 0.02) + "Z", c.purple),
      fill(P.rect(-w * 0.31, -w * 0.17, w * 0.62, w * 0.11, 0), c.gold),
      fill(P.ellipse(0, -w * 0.02, w * 0.68, w * 0.08), c.purpleDark),
    ];
  },
  bow: function (P, w, c) {
    return [
      fill(P.M(0, 0) + P.C(-w * 0.15, -w * 0.32, -w * 0.62, -w * 0.18, -w * 0.4, w * 0.08) + P.Q(-w * 0.2, w * 0.14, 0, 0) + "Z", c.main),
      fill(P.M(0, 0) + P.C(w * 0.15, -w * 0.32, w * 0.62, -w * 0.18, w * 0.4, w * 0.08) + P.Q(w * 0.2, w * 0.14, 0, 0) + "Z", c.main),
      fill(P.ellipse(0, 0, w * 0.1, w * 0.09), c.mainDark),
    ];
  },
  flower: function (P, w, c) {
    const out = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 2 * Math.PI - Math.PI / 2;
      out.push(fill(P.ellipse(Math.cos(a) * w * 0.2, Math.sin(a) * w * 0.2, w * 0.15, w * 0.15), c.white, { stroke: c.mainLight, width: w * 0.02 }));
    }
    out.push(fill(P.ellipse(0, 0, w * 0.12, w * 0.12), c.gold));
    return out;
  },
};

// How each head item sits: base width as a share of the head, how much of that width the head
// must reach before it rests, its tilt, and where along the head it goes (0 is the middle, +/-
// a share of the head's width).
const FIT = {
  cowboy: { w: 0.6, need: 0.62, tilt: -4, at: 0, sink: 0.12 },
  chef: { w: 0.6, need: 0.58, tilt: -3, at: 0, sink: 0.07 },
  tophat: { w: 0.62, need: 0.6, tilt: -7, at: 0.04, sink: 0.08 },
  beanie: { w: 0.8, need: 0.82, tilt: -4, at: 0, sink: 0.16 },
  party: { w: 0.52, need: 0.55, tilt: 10, at: 0.05, sink: 0.06 },
  crown: { w: 0.62, need: 0.7, tilt: -5, at: 0, sink: 0.08 },
  cap: { w: 0.72, need: 0.8, tilt: -3, at: -0.02, sink: 0.14 },
  nightcap: { w: 0.66, need: 0.78, tilt: -5, at: -0.03, sink: 0.14 },
  santa: { w: 0.66, need: 0.78, tilt: -5, at: -0.03, sink: 0.14 },
  witch: { w: 0.62, need: 0.6, tilt: 6, at: 0, sink: 0.08 },
  bow: { w: 0.5, need: 0, tilt: 18, at: 0.25, sink: 0.1, side: true },
  flower: { w: 0.42, need: 0, tilt: 0, at: -0.25, sink: 0.12, side: true },
};

// Hats that pull down over the head (a beanie, a cap) would hang off a pointed head like a
// lampshade.
function hugTip(a, x, y, w) {
  const near = spanNear(rowAt(a.shape, a.top + a.headW * 0.12), x, 2);
  if (!near || near[1] - near[0] >= a.headW * 0.45) return null;
  const lower = spanNear(rowAt(a.shape, a.top + a.headW * 0.25), x, 2);
  if (!lower || lower[1] - lower[0] >= a.headW * 0.72) return null;
  const lowest = a.eyeY - a.eyeR * 2.2;
  for (let k = 0; k < a.shape.rows.length; k++) {
    const row = a.shape.rows[k];
    if (row.y > lowest) break;
    const sp = spanNear(row, x, 2);
    if (!sp || sp[1] - sp[0] < w * 0.72) continue;
    const cx = (sp[0] + sp[1]) / 2;
    const top = topAt(a.shape, cx);
    const tip = top === null ? a.top : top;
    return { x: cx, y: row.y, w: Math.min(w, (sp[1] - sp[0]) * 1.02), tall: (row.y - tip) + w * 0.12 };
  }
  return null;
}

function hat(a, name, c, scale) {
  const f = FIT[name];
  let w = clamp(a.headW, 30, 90) * f.w * (scale || 1);
  let x = a.cx + a.headW * f.at, y, tall = 0, tilt = f.tilt;
  if (f.side && a.earsOn) x = a.cx + Math.sign(f.at) * a.headW * 0.05;
  if (f.side) {
    const t = topAt(a.shape, x);
    y = t === null ? a.top : t;
  } else {
    const r = rest(a, x, w, w * f.need);
    x = r.x + a.headW * f.at;
    y = r.y;
    // A cap is never wider than the head where it sits (its corners would hang in the air past
    // the head's edge).
    if (name === "cap") {
      const sp = spanNear(rowAt(a.shape, y + w * f.sink), x, 2);
      if (sp) w = Math.max(w * 0.6, Math.min(w, (sp[1] - sp[0]) * 1.02));
    }
    const hug = name === "beanie" || name === "cap" ? hugTip(a, x, y + w * f.sink, w) : null;
    if (hug) {
      x = hug.x; y = hug.y - w * f.sink * 0.3; w = hug.w; tall = hug.tall; tilt = f.tilt * 0.3;
    }
  }
  const base = y + w * f.sink * (tall ? 0.3 : 1);
  const P = pen(x, base, tilt);
  const parts = HATS[name](P, w, c, tall);
  const top = P.pts.reduce(function (m, p) { return Math.min(m, p[1]); }, Infinity);
  return { parts: parts, pts: P.pts, base: f.side ? null : base,
    hat: f.side ? null : { name: name, x: x, w: w, half: w * 0.46, base: base, top: top, tilt: tilt } };
}

function headphones(a, c) {
  const yc = a.eyeY - a.eyeR * 0.2;
  let L = Infinity, R = -Infinity;
  const pts = [];
  a.shape.rows.forEach(function (row) {
    if (row.y > yc) return;
    row.spans.forEach(function (s) {
      L = Math.min(L, s[0]); R = Math.max(R, s[1]);
      pts.push([s[0], row.y], [s[1], row.y]);
    });
  });
  if (!pts.length) return { parts: [], pts: [] };
  const cx = (L + R) / 2;
  let rx = (R - L) / 2, ry = Math.max(4, yc - a.top);
  let s = 1;
  pts.forEach(function (p) {
    s = Math.max(s, Math.hypot((p[0] - cx) / rx, (p[1] - yc) / ry));
  });
  const gap = a.headW * 0.05;
  rx = rx * s + gap; ry = ry * s + gap;
  const band = Math.max(2.2, a.headW * 0.065);
  const P = pen(cx, yc, 0);
  const k = 0.5523;
  const arc = P.M(-rx, 0) + P.C(-rx, -ry * k, -rx * k, -ry, 0, -ry) + P.C(rx * k, -ry, rx, -ry * k, rx, 0);
  const cw = Math.max(5, a.headW * 0.16), ch = Math.max(9, a.headW * 0.3);
  return {
    parts: [
      line(arc, c.dark, band, { cap: "round" }),
      line(arc, c.darkRim, band * 0.3, { cap: "round", opacity: 0.6 }),
      fill(P.rect(-rx - cw / 2, -ch * 0.5, cw, ch, cw * 0.45), c.main, { stroke: c.dark, width: band * 0.5 }),
      fill(P.rect(rx - cw / 2, -ch * 0.5, cw, ch, cw * 0.45), c.main, { stroke: c.dark, width: band * 0.5 }),
    ],
    pts: P.pts.concat([[cx - rx - cw, yc + ch], [cx + rx + cw, yc + ch]]),
  };
}

function headband(a, c) {
  // The body itself, cut to a strip across the forehead: it fits any shape because it is the
  // shape.
  const y1 = a.eyeY - a.eyeR * 1.35;
  const y0 = Math.max(a.top + 1, y1 - Math.max(4, a.headW * 0.12));
  const row = spanNear(rowAt(a.shape, (y0 + y1) / 2), a.cx, 20) || [a.headL, a.headR];
  const P = pen(row[1] - 0.5, (y0 + y1) / 2, 0);
  const k = Math.max(3, a.headW * 0.09);
  return {
    parts: [
      { band: true, y0: y0, y1: y1, fill: c.main },
      fill(P.M(0, 0) + P.Q(k * 1.2, -k * 1.1, k * 1.6, -k * 0.2) + P.Q(k, 0, 0, 0) + "Z", c.mainDark),
      fill(P.M(0, 0) + P.Q(k * 1.3, k * 0.4, k * 1.3, k * 1.3) + P.Q(k * 0.6, k * 0.7, 0, 0) + "Z", c.mainDark),
    ],
    pts: P.pts.concat([[row[0], y0], [row[1], y1]]),
  };
}


// The top of the main body at x: the first row where the body is at least `minW` wide there,
// so a sun's rays and a pointed tip are passed over.
function coreTop(a, x, minW) {
  const rows = a.shape.rows;
  for (let k = 0; k < rows.length; k++) {
    const sp = spanNear(rows[k], x, 0);
    if (sp && sp[1] - sp[0] >= minW) return rows[k].y;
  }
  return null;
}

// A pair of things on top of the head (ears, horns, antennae), each set where the body is at
// `spread` of the head's width from the middle and tilted with the outline there.
function onTop(a, spread, sink, draw, lean, half) {
  const parts = [], pts = [];
  const minW = a.headW * 0.3;
  let base = -Infinity;
  [-1, 1].forEach(function (side) {
    let x = a.cx + side * a.headW * spread;
    let t = coreTop(a, x, minW);
    if (t === null) { x = a.cx + side * a.headW * spread * 0.5; t = coreTop(a, x, minW); }
    if (t === null) t = a.top;
    // The slope over a good stretch, so a cloud's bumps do not jerk it.
    const d = Math.max(4, a.headW * 0.12);
    const l = coreTop(a, x - d, minW), r = coreTop(a, x + d, minW);
    const slope = l !== null && r !== null ? Math.atan2(r - l, 2 * d) * 180 / Math.PI : 0;
    const tilt = clamp(slope, -26, 26) * (lean === undefined ? 1 : lean) + side * 6;
    const left = Math.min(70, Math.abs(slope - tilt)) * Math.PI / 180;
    const deeper = half ? half * Math.tan(left) : 0;
    const P = pen(x, t + sink + deeper, tilt);
    draw(P, side).forEach(function (p) { parts.push(p); });
    P.pts.forEach(function (p) { pts.push(p); });
    base = Math.max(base, t + sink + deeper);
  });
  return { parts: parts, pts: pts, base: base };
}

function rays(model) {
  const out = [];
  if (model.body.length < 5) return out;
  model.body.forEach(function (b, i) {
    const m = /^M(-?[\d.]+) (-?[\d.]+)a([\d.]+) /.exec(String(b.d || ""));
    if (m && Number(m[3]) < 9) out.push({ i: i, x: Number(m[1]) + Number(m[3]), y: Number(m[2]), r: Number(m[3]) });
  });
  if (out.length < 4) return [];
  const r0 = out[0].r;
  return out.every(function (r) { return Math.abs(r.r - r0) < 0.5; }) ? out : [];
}

function ears(a, model, name, c, hat) {
  const s = clamp(a.headW, 30, 90);
  if (name === "halo") return halo(a, c, hat);
  if (name === "antennae") {
    const k = s * 0.3;
    const w = Math.max(1.2, s * 0.03);
    const parts = [], pts = [];
    [-1, 1].forEach(function (side) {
      const x = hat ? hat.x + side * hat.half * 0.35 : a.cx + side * a.headW * 0.12;
      const t = hat ? hat.top + 1.5 : topAt(a.shape, x);
      const P = pen(x, (t === null ? a.top : t) + w, side * 6);
      parts.push(line(P.M(0, 0) + P.Q(0, -k * 0.6, side * k * 0.32, -k * 0.95), c.dark, w, { cap: "round" }));
      parts.push(fill(P.ellipse(side * k * 0.34, -k * 1.0, k * 0.13, k * 0.13), c.dark, { stroke: c.darkRim, width: w * 0.5 }));
      P.pts.forEach(function (p) { pts.push(p); });
    });
    return { parts: parts, pts: pts, hide: [] };
  }
  let k, spread, sink, draw, half;
  const col = c;
  if (name === "cat") {
    k = s * 0.22; spread = 0.27; sink = k * 0.3; half = k * 0.6;
    draw = function (P) {
      return [
        fill(P.M(-k * 0.6, 0) + P.Q(-k * 0.38, -k * 0.62, -k * 0.1, -k * 1.02) + P.Q(0, -k * 1.12, k * 0.1, -k * 1.02) +
          P.Q(k * 0.38, -k * 0.62, k * 0.6, 0) + "Z", col.body),
        fill(P.M(-k * 0.3, -k * 0.12) + P.Q(-k * 0.16, -k * 0.5, -k * 0.04, -k * 0.74) + P.Q(k * 0.16, -k * 0.5, k * 0.3, -k * 0.12) + "Z", col.bodyLight),
      ];
    };
  } else if (name === "bunny") {
    k = s * 0.36; spread = 0.16; sink = k * 0.15; half = k * 0.26;
    draw = function (P, side) {
      return [
        fill(P.ellipse(side * k * 0.08, -k * 0.5, k * 0.17, k * 0.55), col.body),
        fill(P.ellipse(side * k * 0.08, -k * 0.48, k * 0.08, k * 0.4), col.bodyLight),
      ];
    };
  } else if (name === "bear") {
    k = s * 0.13; spread = 0.3; sink = k * 0.55; half = k;
    draw = function (P) {
      return [
        fill(P.ellipse(0, -k * 0.55, k, k), col.body),
        fill(P.ellipse(0, -k * 0.55, k * 0.55, k * 0.55), col.bodyDark),
      ];
    };
  } else {
    k = s * 0.2; spread = 0.22; sink = k * 0.25; half = k * 0.35;
    draw = function (P, side) {
      return [
        fill(P.M(-k * 0.32, 0) + P.Q(-k * 0.28, -k * 0.6, side * k * 0.42, -k * 1.05) + P.Q(k * 0.05 * side, -k * 0.5, k * 0.32, 0) + "Z",
          c.horn, { stroke: c.hornDark, width: Math.max(0.8, k * 0.06) }),
      ];
    };
  }
  const cx = (model.box.x0 + model.box.x1) / 2, cy = (model.box.y0 + model.box.y1) / 2;
  const diag = rays(model).filter(function (r) { return r.y < cy - 2 && Math.abs(r.x - cx) > 3; });
  if (diag.length >= 2) {
    const pick = [-1, 1].map(function (side) {
      const mine = diag.filter(function (r) { return (r.x - cx) * side > 0; });
      const off = function (r) { return Math.abs(Math.atan2(Math.abs(r.x - cx), cy - r.y) - Math.PI / 4); };
      mine.sort(function (p, q) { return off(p) - off(q); });
      return mine[0];
    });
    if (pick[0] && pick[1]) {
      const parts = [], pts = [];
      pick.forEach(function (r, n) {
        const side = n ? 1 : -1;
        const ang = Math.atan2(r.x - cx, cy - r.y) * 180 / Math.PI * 0.5;
        const rad = Math.atan2(r.y - cy, r.x - cx);
        const d = Math.hypot(r.x - cx, r.y - cy) - r.r * 0.6;
        const P = pen(cx + d * Math.cos(rad), cy + d * Math.sin(rad), ang);
        draw(P, side).forEach(function (p) { parts.push(p); });
        P.pts.forEach(function (p) { pts.push(p); });
      });
      return { parts: parts, pts: pts, hide: [pick[0].i, pick[1].i] };
    }
  }
  const r = onTop(a, spread, sink, draw, 1, half);
  return { parts: r.parts, pts: r.pts, hide: [] };
}

function halo(a, c, hat) {
  const rx = clamp(a.headW, 30, 90) * 0.3;
  const top = hat ? hat.top + (hat.base - hat.top) * 0.18 : a.top;
  const P = pen(hat ? hat.x : a.cx, top - rx * 0.38, 0);
  const w = Math.max(1.6, rx * 0.17);
  return {
    parts: [
      line(P.ellipse(0, 0, rx, rx * 0.26), c.goldDark, w * 1.5, { opacity: 0.35 }),
      line(P.ellipse(0, 0, rx, rx * 0.26), c.gold, w),
    ],
    pts: P.pts,
    hide: [],
  };
}


// Where something worn low goes: well below the eyes, so a knot or a band never reads as a
// mouth.
function neckAt(a, share) {
  let bottom = a.eyeY;
  a.shape.rows.forEach(function (row) { if (spanNear(row, a.cx, 0)) bottom = Math.max(bottom, row.y); });
  const y = a.eyeY + (bottom - a.eyeY) * share;
  const row = spanNear(rowAt(a.shape, y), a.cx, 20) || [a.headL, a.headR];
  const eyeBottom = a.eyeY + a.eyeHH;
  return { y: y, row: row, bottom: bottom, eyeBottom: eyeBottom, room: Math.max(2, bottom - eyeBottom) };
}

// Everything worn low shrinks to the room there is below the eyes (a capsule has little), so
// it never reaches the eyes or hangs off the body.
function neck(a, name, c) {
  const s = clamp(a.headW, 30, 90);
  if (name === "bowtie") {
    const n = neckAt(a, 1);
    const k = Math.min(s * 0.12, n.room * 0.3);
    const P = pen(a.cx, Math.max(n.eyeBottom + k * 1.2, n.bottom - k * 0.85), 0);
    return {
      parts: [
        fill(P.M(0, 0) + P.L(-k * 1.1, -k * 0.62) + P.Q(-k * 1.3, 0, -k * 1.1, k * 0.62) + "Z", c.main, { stroke: c.mainDark, width: k * 0.08 }),
        fill(P.M(0, 0) + P.L(k * 1.1, -k * 0.62) + P.Q(k * 1.3, 0, k * 1.1, k * 0.62) + "Z", c.main, { stroke: c.mainDark, width: k * 0.08 }),
        fill(P.ellipse(0, 0, k * 0.3, k * 0.34), c.mainDark),
      ],
      pts: P.pts,
    };
  }
  if (name === "necktie") {
    const n = neckAt(a, 0.55);
    const knot = n.eyeBottom + n.room * 0.5;
    const len = Math.max(3, n.bottom - knot + 3);
    const k = Math.min(s * 0.11, len / 2.0);
    const P = pen(a.cx, knot, 0);
    const top = k * 0.62, wide = k * 0.62, shoulder = len - k * 0.55;
    const parts = [
      fill(P.M(-k * 0.24, top) + P.L(-wide, shoulder) + P.L(0, len) + P.L(wide, shoulder) + P.L(k * 0.24, top) + "Z",
        c.main, { stroke: c.mainDark, width: k * 0.1 }),
    ];
    [0.38, 0.66].forEach(function (f) {
      const y = top + (shoulder - top) * f;
      const hw = (k * 0.24 + (wide - k * 0.24) * f) * 0.78;
      parts.push(line(P.M(-hw, y + hw * 0.55) + P.L(hw, y - hw * 0.55), c.mainLight, k * 0.14, { cap: "round" }));
    });
    parts.push(fill(P.M(-k * 0.42, -k * 0.05) + P.L(k * 0.42, -k * 0.05) + P.L(k * 0.27, top) + P.L(-k * 0.27, top) + "Z",
      c.mainDark, { stroke: c.mainDark, width: k * 0.06 }));
    return { parts: parts, pts: P.pts };
  }
  const n = neckAt(a, 1);
  const h = Math.min(Math.max(4, s * 0.11), n.room * 0.32);
  const y1 = n.bottom - 1.2, y0 = Math.max(y1 - h, n.eyeBottom + n.room * 0.5);
  const row = spanNear(rowAt(a.shape, (y0 + y1) / 2), a.cx, 20) || n.row;
  const P = pen(a.cx + (row[1] - a.cx) * 0.55, y0 + h * 0.4, 8);
  const tail = Math.max(h * 0.5, Math.min(h * 1.2, (n.bottom - y0 - h * 0.4 - 0.5) / 1.02));
  return {
    parts: [
      { band: true, y0: y0, y1: y1, fill: c.main },
      fill(P.rect(-h * 0.42, 0, h * 0.84, tail, h * 0.18), c.mainDark),
      fill(P.rect(-h * 0.42, tail - h * 0.2, h * 0.84, h * 0.2, 0), c.mainLight),
    ],
    pts: P.pts.concat([[row[0], y0], [row[1], y1]]),
  };
}


function hand(a, name, c) {
  const s = clamp(a.headW, 30, 90);
  const n = neckAt(a, 0.45);
  const L = Math.min(s * 0.62, (n.bottom - a.top) * 0.8);
  const wood = c.leather, w = Math.max(1.4, s * 0.035);
  const hx = n.row[1] - s * 0.02, hy = n.y;
  let P, parts;
  if (name === "broom") {
    P = pen(hx, Math.min(hy, n.bottom - L * 0.55 * Math.cos(14 * Math.PI / 180)), 14);
    parts = [
      line(P.M(0, -L * 0.62) + P.L(0, L * 0.25), wood, w, { cap: "round" }),
      fill(P.M(-L * 0.07, L * 0.22) + P.L(L * 0.07, L * 0.22) + P.L(L * 0.2, L * 0.55) + P.L(-L * 0.2, L * 0.55) + "Z", c.gold, { stroke: c.goldDark, width: w * 0.5 }),
      line(P.M(-L * 0.1, L * 0.3) + P.L(L * 0.1, L * 0.3), c.goldDark, w * 0.6),
    ];
  } else if (name === "pan") {
    P = pen(hx, hy, 32);
    parts = [
      line(P.M(0, L * 0.2) + P.L(0, -L * 0.18), c.dark, w * 1.3, { cap: "round" }),
      fill(P.ellipse(0, -L * 0.42, L * 0.26, L * 0.26), c.dark, { stroke: c.darkRim, width: w * 0.6 }),
      fill(P.ellipse(-L * 0.06, -L * 0.48, L * 0.08, L * 0.06), c.darkRim, { opacity: 0.6 }),
    ];
  } else if (name === "hammer") {
    P = pen(hx, hy, 18);
    parts = [
      line(P.M(0, L * 0.25) + P.L(0, -L * 0.3), wood, w * 1.2, { cap: "round" }),
      fill(P.rect(-L * 0.2, -L * 0.42, L * 0.4, L * 0.15, L * 0.02), "#8b9099", { stroke: c.dark, width: w * 0.4 }),
    ];
  } else if (name === "brush") {
    P = pen(hx, hy, 20);
    parts = [
      line(P.M(0, L * 0.25) + P.L(0, -L * 0.22), wood, w, { cap: "round" }),
      fill(P.rect(-w * 0.9, -L * 0.33, w * 1.8, L * 0.12, 0), "#c9ccd2"),
      fill(P.M(-w * 0.9, -L * 0.33) + P.Q(-w, -L * 0.48, 0, -L * 0.52) + P.Q(w, -L * 0.48, w * 0.9, -L * 0.33) + "Z", c.main),
    ];
  } else if (name === "wand") {
    P = pen(hx, hy, 24);
    const r = L * 0.13;
    let star = "";
    for (let k = 0; k < 10; k++) {
      const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
      star += (k ? P.L : P.M)(rr * Math.cos(ang), -L * 0.4 + rr * Math.sin(ang));
    }
    parts = [
      line(P.M(0, L * 0.22) + P.L(0, -L * 0.3), c.dark, w, { cap: "round" }),
      fill(star + "Z", c.gold, { stroke: c.goldDark, width: w * 0.4 }),
    ];
  } else {
    P = pen(hx, hy, 8);
    const R = L * 0.45;
    parts = [
      line(P.M(0, L * 0.18) + P.L(0, -L * 0.62), c.dark, w, { cap: "round" }),
      line(P.M(0, L * 0.18) + P.Q(0, L * 0.3, -L * 0.1, L * 0.26), c.dark, w, { cap: "round" }),
      fill(P.M(-R, -L * 0.55) + P.Q(-R, -L * 0.55 - R * 1.05, 0, -L * 0.55 - R * 1.05) + P.Q(R, -L * 0.55 - R * 1.05, R, -L * 0.55) +
        P.Q(R * 0.5, -L * 0.62, 0, -L * 0.55) + P.Q(-R * 0.5, -L * 0.62, -R, -L * 0.55) + "Z", c.main, { stroke: c.mainDark, width: w * 0.5 }),
    ];
  }
  return { parts: parts, pts: P.pts };
}


function eyepatch(a, c) {
  const e = a.eyes[0];
  const rx = Math.min(a.eyeR * 1.35 + 2, a.eyeGap * 0.5);
  const ry = Math.max(rx * 0.92, a.eyeHH + 2);
  const w = Math.max(1, rx * 0.16);
  const P = pen(e.x, e.y, 0);
  const parts = [fill(P.ellipse(0, 0, rx, ry), c.dark, { stroke: c.darkRim, width: w * 0.6 })];
  const yl = e.y - ry * 0.55, yr = e.y - ry * 0.55 - a.headW * 0.22;
  const left = spanNear(rowAt(a.shape, yl), e.x, 30), right = spanNear(rowAt(a.shape, yr), a.cx, 30);
  const Q = pen(0, 0, 0);
  if (left) parts.push(line(Q.M(e.x - rx * 0.7, yl) + Q.L(left[0] + 0.5, yl - 1), c.dark, w, { cap: "round" }));
  if (right) parts.push(line(Q.M(e.x + rx * 0.6, e.y - ry * 0.75) + Q.L(right[1] - 0.5, yr), c.dark, w, { cap: "round" }));
  return { parts: parts, pts: P.pts.concat(Q.pts) };
}

function shaped(a, c, kind) {
  const parts = [], pts = [];
  const r = Math.min(a.eyeR * 1.25 + 2.2, a.eyeGap * 0.47);
  const h = Math.max(r * 1.08, a.eyeHH + 2.2);
  const w = Math.max(1.1, r * 0.15);
  const lens = a.eyes.length >= 2 ? [a.eyes[0], a.eyes[a.eyes.length - 1]] : a.eyes;
  lens.forEach(function (e) {
    const P = pen(e.x, e.y, 0);
    let d;
    if (kind === "hearts") {
      const x = r * 1.12, y = h;
      d = P.M(0, y * 0.95) + P.C(-x * 1.15, y * 0.15, -x * 0.95, -y * 1.0, 0, -y * 0.42) +
        P.C(x * 0.95, -y * 1.0, x * 1.15, y * 0.15, 0, y * 0.95) + "Z";
    } else {
      const R = Math.max(r * 1.3, h * 1.15), q = R * 0.5;
      d = "";
      for (let k = 0; k < 10; k++) {
        const ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? q : R;
        d += (k ? P.L : P.M)(rr * Math.cos(ang), rr * Math.sin(ang) + R * 0.08);
      }
      d += "Z";
    }
    const tint = kind === "hearts" ? c.heart : c.gold;
    parts.push(fill(d, tint, { opacity: 0.55 }));
    parts.push(line(d, kind === "hearts" ? c.heartDark : c.goldDark, w));
    P.pts.forEach(function (p) { pts.push(p); });
  });
  if (lens.length === 2) {
    const A = lens[0], B = lens[1];
    const P = pen(0, 0, 0);
    parts.push(line(P.M(A.x + r * 0.8, A.y - h * 0.3) + P.Q((A.x + B.x) / 2, Math.min(A.y, B.y) - h * 0.55, B.x - r * 0.8, B.y - h * 0.3),
      kind === "hearts" ? c.heartDark : c.goldDark, w, { cap: "round" }));
    P.pts.forEach(function (p) { pts.push(p); });
  }
  return { parts: parts, pts: pts };
}

function glasses(a, c, dark) {
  const parts = [];
  const pts = [];
  const r = Math.min(a.eyeR * 1.25 + 2.2, a.eyeGap * 0.47);
  const ry = Math.max(r, Math.min(a.eyeR * 1.2 + 1.5, r * 1.3), a.eyeHH + 2);
  const sy = Math.max(r, (a.eyeHH + 1.4) / 0.72);
  const w = Math.max(1.1, r * 0.16);
  const lens = a.eyes.length >= 2 ? [a.eyes[0], a.eyes[a.eyes.length - 1]] : a.eyes;
  lens.forEach(function (e) {
    const P = pen(e.x, e.y, 0);
    if (dark) {
      parts.push(fill(P.M(-r, -sy * 0.5) + P.Q(-r, -sy * 0.8, -r * 0.5, -sy * 0.8) + P.L(r * 0.5, -sy * 0.8) +
        P.Q(r, -sy * 0.8, r, -sy * 0.4) + P.Q(r * 0.95, sy * 0.75, 0, sy * 0.75) + P.Q(-r * 0.95, sy * 0.75, -r, -sy * 0.5) + "Z",
        c.lens, { stroke: c.dark, width: w }));
      parts.push(line(P.M(-r * 0.45, -r * 0.35) + P.L(-r * 0.1, -r * 0.55), c.glint, w * 0.9, { cap: "round", opacity: 0.55 }));
    } else {
      parts.push(fill(P.ellipse(0, 0, r - w / 2, ry - w / 2), c.glint, { opacity: 0.1 }));
      parts.push(line(P.ellipse(0, 0, r, ry), c.ink, w));
    }
    P.pts.forEach(function (p) { pts.push(p); });
  });
  if (lens.length === 2) {
    const A = lens[0], B = lens[1];
    const by = dark ? -sy * 0.55 : -ry * 0.3;
    const P = pen(0, 0, 0);
    parts.push(line(P.M(A.x + r * 0.95, A.y + by) + P.Q((A.x + B.x) / 2, Math.min(A.y, B.y) + by - r * 0.35, B.x - r * 0.95, B.y + by),
      dark ? c.dark : c.ink, w, { cap: "round" }));
    [[A, -1], [B, 1]].forEach(function (pair) {
      const e = pair[0], side = pair[1];
      const row = spanNear(rowAt(a.shape, e.y + by), e.x, 30);
      if (!row) return;
      const edge = side < 0 ? row[0] + 0.6 : row[1] - 0.6;
      const from = e.x + side * r;
      if ((edge - from) * side > 0.8) {
        parts.push(line(P.M(from, e.y + by) + P.L(edge, e.y + by - 0.6), dark ? c.dark : c.ink, w, { cap: "round" }));
      }
    });
  }
  return { parts: parts, pts: pts };
}

function monocle(a, c) {
  const e = a.eyes[a.eyes.length - 1];
  const r = Math.min(a.eyeR * 1.3 + 2.4, a.eyeGap * 0.55);
  const ry = Math.max(r, a.eyeHH + 2.2);
  const w = Math.max(1.1, r * 0.15);
  const rim = c.light ? "#b07d1a" : c.gold;
  const P = pen(e.x, e.y, 0);
  let end = [r * 1.2, ry * 1.6];
  for (let dy = ry * 2.2; dy > ry * 0.9; dy -= STEP) {
    const row = spanNear(rowAt(a.shape, e.y + dy), e.x, 0);
    if (row && row[1] - 2 > e.x + r * 0.6) { end = [row[1] - 2 - e.x, dy]; break; }
  }
  return {
    parts: [
      fill(P.ellipse(0, 0, r, ry), c.glint, { opacity: 0.14 }),
      line(P.M(r * 0.5, ry * 0.86) + P.Q(r * 0.45, end[1] * 1.05, end[0], end[1]), rim, w * 0.55, { cap: "round" }),
      // A thin dark edge so it stays crisp on any colour, then the rim.
      line(P.ellipse(0, 0, r, ry), c.dark, w * 1.35, { opacity: 0.35 }),
      line(P.ellipse(0, 0, r, ry), rim, w),
      line(P.M(-r * 0.45, -r * 0.4) + P.Q(-r * 0.3, -r * 0.62, -r * 0.05, -r * 0.66), c.glint, w * 0.7, { cap: "round", opacity: 0.6 }),
    ],
    pts: P.pts,
  };
}

function box(pts) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  pts.forEach(function (p) {
    b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]);
    b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]);
  });
  if (!isFinite(b.x0)) return null;
  b.x0 -= 2; b.y0 -= 2; b.x1 += 2; b.y1 += 2;
  return b;
}

// What to draw for an outfit.
export function parts(model, wear, colours) {
  const w = wear || {};
  const out = { head: [], face: [], neck: [], box: null, hide: [] };
  const head = HEAD.indexOf(w.head) !== -1 ? w.head : "";
  const top = EARS.indexOf(w.ears) !== -1 ? w.ears : EARS.indexOf(w.head) !== -1 ? w.head : "";
  const face = FACE.indexOf(w.face) !== -1 ? w.face : "";
  const low = NECK.indexOf(w.neck) !== -1 ? w.neck : "";
  const held = HAND.indexOf(w.hand) !== -1 ? w.hand : "";
  if (!head && !top && !face && !low && !held) return out;
  const a = Object.assign({}, anchors(model), { earsOn: !!top && top !== "halo" && top !== "antennae" });
  const bodyHex = (colours && colours.head) || "#8899aa";
  const c = Object.assign(palette(w.base || bodyHex, w.tint), {
    ink: (colours && colours.eye) || "#1b1d22",
    body: "@body",
    bodyDark: "@bodyDark",
    bodyLight: "@bodyLight",
    light: Blob.oklch(bodyHex).l > 0.72,
  });
  let pts = [];
  let hatInfo = null, headParts = [];
  if (head) {
    const between = !!top && ["cat", "bunny", "bear", "horns"].indexOf(top) !== -1;
    const r = head === "headphones" ? headphones(a, c) : head === "headband" ? headband(a, c)
      : hat(a, head, c, between && FIT[head] && !FIT[head].side ? 0.72 : 1);
    headParts = r.parts;
    pts = pts.concat(r.pts);
    hatInfo = r.hat || null;
    if (r.base !== undefined && r.base !== null) out.hide = coveredRays(model, r.base);
  }
  if (top) {
    const r = ears(a, model, top, c, hatInfo);
    out.head = top === "halo" ? headParts.concat(r.parts) : r.parts.concat(headParts);
    pts = pts.concat(r.pts);
    r.hide.forEach(function (i) { if (out.hide.indexOf(i) === -1) out.hide.push(i); });
  } else out.head = headParts;
  if (face) {
    const r = face === "monocle" ? monocle(a, c) : face === "eyepatch" ? eyepatch(a, c)
      : face === "hearts" || face === "stars" ? shaped(a, c, face) : glasses(a, c, face === "sunglasses");
    out.face = r.parts;
    pts = pts.concat(r.pts);
  }
  if (low) {
    const r = neck(a, low, c);
    out.neck = r.parts;
    pts = pts.concat(r.pts);
  }
  if (held) {
    const r = hand(a, held, c);
    out.head = out.head.concat(r.parts);
    pts = pts.concat(r.pts);
  }
  out.box = box(pts);
  return out;
}

function coveredRays(model, base) {
  return rays(model).filter(function (r) { return r.y < base + 6; }).map(function (r) { return r.i; });
}

export function bandSpans(model, y0, y1) {
  const shape = outline(model);
  const out = [];
  shape.rows.forEach(function (row) {
    if (row.y >= y0 && row.y <= y1) out.push({ y: row.y, spans: row.spans });
  });
  return out;
}
