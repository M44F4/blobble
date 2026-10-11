// Draws a blob as SVG, the same way BlobView draws it in the shell: body, eyes, what it wears
// and its little symbols.
import * as Blob from "./Blob.mjs";
import * as Wear from "./Wear.mjs";
import * as Glyphs from "./Glyphs.mjs";

// The symbols that pulse (the rest float, drip, tap or stand still).
const PULSING = ["charging", "question", "check", "leaf", "package", "offline", "rec", "download", "eye", "water", "moon"];

// Symbol glyphs and spots, as in BlobView.
export const SYMBOLS = {
  alert: ["!", "#e06c75", -1, 0.3],
  zzz: ["\u{f04b2}", "fg", 1, 0.4],
  sweat: ["\u{f058c}", "#7dcfff", -1, 0.55],
  notes: ["\u{f075a}", "fg", 1, 0.4],
  charging: ["\u{f140b}", "#e0af68", 1, 0.8],
  keys: ["\u{f030c}", "fg", -1, 0.85],
  question: ["?", "#e0af68", 1, 0.2],
  check: ["\u{f012c}", "#9ece6a", 1, 0.2],
  coffee: ["\u{f0176}", "#c8a27a", 1, 0.75],
  offline: ["\u{f05aa}", "fg", -1, 0.25],
  leaf: ["\u{f032a}", "#9ece6a", 1, 0.8],
  package: ["\u{f03d7}", "#e0af68", -1, 0.7],
  heart: ["\u{f02d1}", "#f7768e", 1, 0.3],
  rec: ["\u{f044a}", "#f7768e", 1, 0.05],
  mic: ["\u{f036c}", "fg", 1, 0.55],
  camera: ["\u{f0567}", "fg", 1, 0.55],
  screen: ["\u{f0379}", "fg", -1, 0.55],
  download: ["\u{f01da}", "#9ece6a", -1, 0.3],
  sparkle: ["\u{f0674}", "#e0af68", 1, 0.15],
  eye: ["\u{f0208}", "#7dcfff", 1, 0.3],
  water: ["\u{f01ab}", "#7dcfff", 1, 0.7],
  moon: ["\u{f0594}", "#e0af68", 1, 0.2],
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function partSvg(p, model, colours, clipId) {
  if (p.band) {
    return `<g clip-path="url(#${p.clipId || clipId})">` +
      model.body.map((b) => `<path d="${b.d}" fill="${Wear.resolveFill(p.fill, colours && colours.head)}"/>`).join("") + `</g>`;
  }
  const fill = Wear.resolveFill(p.fill, colours && colours.head);
  const attrs = [`d="${p.d}"`, `fill="${fill === "transparent" ? "none" : fill}"`];
  if (p.stroke) {
    attrs.push(`stroke="${p.stroke}"`, `stroke-width="${p.width.toFixed(2)}"`, `stroke-linejoin="round"`);
    if (p.cap) attrs.push(`stroke-linecap="${p.cap}"`);
  }
  if (p.opacity !== undefined) attrs.push(`opacity="${p.opacity}"`);
  return `<path ${attrs.join(" ")}/>`;
}

// Where each symbol goes, top-left corner in viewBox units, `g` wide.
export function symbolSpots(names, box, g) {
  const placed = [];
  const h = box.y1 - box.y0;
  const xFor = (side) => side > 0 ? box.x1 - g * 0.2 : box.x0 - g * 0.8;
  const free = (side, y) => placed.every((p) => p.side !== side || Math.abs(p.y - y) >= g * 0.95);
  (names || []).forEach((name) => {
    const spot = SYMBOLS[name] || ["?", "fg", 1, 0.4];
    const want = box.y0 + h * spot[3] - g / 2;
    let side = spot[2] > 0 ? 1 : -1, y = want;
    if (!free(side, y)) {
      if (free(-side, y)) side = -side;
      else {
        for (let k = 1; k < 6; k++) {
          if (free(side, want + g * k)) { y = want + g * k; break; }
          if (free(side, want - g * k)) { y = want - g * k; break; }
        }
      }
    }
    placed.push({ name: name, side: side, x: xFor(side), y: y });
  });
  return placed;
}

export function frameBox(model, worn, symbols, glyphScale) {
  const b = Object.assign({}, model.box);
  const grow = (o) => {
    if (!o) return;
    b.x0 = Math.min(b.x0, o.x0); b.y0 = Math.min(b.y0, o.y0);
    b.x1 = Math.max(b.x1, o.x1); b.y1 = Math.max(b.y1, o.y1);
  };
  grow(worn && worn.box);
  const g = 100 * (glyphScale || 0.26);
  symbolSpots(symbols, model.box, g).forEach((p) => grow({ x0: p.x, y0: p.y - 8, x1: p.x + g, y1: p.y + g }));
  return b;
}

// The frame grown so the body and outfit stay in the picture through the whole loop of a
// motion (a bounce goes up, a spin turns the hat around).
export function motionFrame(box, model, worn, motion) {
  if (!motion || motion === "still") return box;
  const b = Object.assign({}, box);
  const src = Object.assign({}, model.box);
  if (worn && worn.box) {
    src.x0 = Math.min(src.x0, worn.box.x0); src.y0 = Math.min(src.y0, worn.box.y0);
    src.x1 = Math.max(src.x1, worn.box.x1); src.y1 = Math.max(src.y1, worn.box.y1);
  }
  const mx = (model.box.x0 + model.box.x1) / 2, my = (model.box.y0 + model.box.y1) / 2;
  const turn = (x, y, cx, cy, deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    return [cx + c * (x - cx) - sn * (y - cy), cy + sn * (x - cx) + c * (y - cy)];
  };
  const corners = [[src.x0, src.y0], [src.x1, src.y0], [src.x0, src.y1], [src.x1, src.y1],
    [(src.x0 + src.x1) / 2, src.y0], [(src.x0 + src.x1) / 2, src.y1], [src.x0, (src.y0 + src.y1) / 2], [src.x1, (src.y0 + src.y1) / 2]];
  for (let k = 0; k < 48; k++) {
    const p = Object.assign({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, spin: 0 }, motionPose(motion, k / 48));
    corners.forEach(([x, y]) => {
      let q = [50 + (x - 50) * p.sx, 92 + (y - 92) * p.sy];
      q = turn(q[0], q[1], 50, 92, p.rot);
      q = turn(q[0], q[1], mx, my, p.spin);
      q = [q[0] + p.dx, q[1] + p.dy];
      b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]);
      b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]);
    });
  }
  return b;
}

let svgCount = 0;

export function svg(opts) {
  const o = opts || {};
  const look = Object.assign({}, o.look || {});
  const plate = look.background && look.background !== "none";
  const model = Blob.model(o.seed || "blob", Blob.options(look, o.accent), o.face || "idle");
  const colours = o.colours || Blob.colours(model);
  const base = Blob.colours(Blob.model(o.seed || "blob", Blob.options(look, o.accent), "idle")).head;
  const worn = Wear.parts(model, Object.assign({}, o.wear, { base: base }), colours);
  const pose = Object.assign({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, spin: 0, blink: 0, gazeX: 0, gazeY: 0, symbolPhase: 0 }, o.pose || {});
  // facePose: a pose between two expressions, for apps that ease from one face to the next.
  const eyes = Blob.eyeMatrices(model.frames, o.facePose !== undefined ? o.facePose : model.pose, pose.blink, pose.gazeX, pose.gazeY);
  const size = o.size || 512;
  const fg = o.foreground || "#d8d8d8";

  let view;
  if (o.view) {
    view = o.view; // [x, y, side]: a fixed frame, so the blob does not jump as things come and go
  } else if (plate) {
    const grown = motionFrame(frameBox(model, worn, o.symbols, 0.26), model, worn, o.motion);
    const x0 = Math.min(0, grown.x0), y0 = Math.min(0, grown.y0);
    const x1 = Math.max(100, grown.x1), y1 = Math.max(100, grown.y1);
    const side = Math.max(x1 - x0, y1 - y0);
    view = [(x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side];
  } else {
    const b = motionFrame(frameBox(model, worn, o.symbols, 0.26), model, worn, o.motion);
    const pad = o.padding === undefined ? 0.12 : o.padding;
    const side = Math.max(b.x1 - b.x0, b.y1 - b.y0) * (1 + pad * 2);
    view = [(b.x0 + b.x1) / 2 - side / 2, (b.y0 + b.y1) / 2 - side / 2, side];
  }

  const m = (a) => `matrix(${a.map((v) => +v.toFixed(4)).join(" ")})`;
  // Unique per picture, so pictures placed in one page never share clips.
  const clipId = "band" + (++svgCount) + "_";
  let defs = "";
  worn.head.concat(worn.neck || []).filter((p) => p.band).forEach((band, k) => {
    band.clipId = clipId + k;
    defs += `<clipPath id="${band.clipId}"><rect x="-50" y="${band.y0.toFixed(2)}" width="200" height="${(band.y1 - band.y0).toFixed(2)}"/></clipPath>`;
  });

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${view.concat([view[2]]).map((v) => +v.toFixed(3)).join(" ")}"` +
    (o.overflow ? ` overflow="visible" style="overflow:visible"` : "") + `>`;
  if (defs) out += `<defs>${defs}</defs>`;
  if (/^#[0-9a-f]{6}$/i.test(o.background || "")) {
    out += `<rect x="${view[0]}" y="${view[1]}" width="${view[2]}" height="${view[2]}" fill="${o.background}"/>`;
  }
  if (plate && model.bg) out += `<path d="${model.bg.d}" fill="${model.bg.fill}"/>`;

  const mid = [(model.box.x0 + model.box.x1) / 2, (model.box.y0 + model.box.y1) / 2].map((v) => +v.toFixed(2)).join(" ");
  const body = `translate(${pose.dx} ${pose.dy + eyes.bodyY}) rotate(${pose.spin} ${mid}) rotate(${pose.rot} 50 92) ` +
    `translate(50 92) scale(${pose.sx} ${pose.sy}) translate(-50 -92)`;
  out += `<g transform="${body}"${o.opacity !== undefined && o.opacity < 1 ? ` opacity="${o.opacity}"` : ""}>`;
  out += model.body.filter((p, i) => worn.hide.indexOf(i) === -1).map((p) => `<path d="${p.d}" fill="${colours.head}"/>`).join("");
  out += worn.head.map((p) => partSvg(p, model, colours, clipId)).join("");
  const neck = worn.neck || [];
  out += `<g transform="translate(0 ${(pose.gazeY * 0.35).toFixed(2)})">` +
    neck.filter((p) => p.band).map((p) => partSvg(p, model, colours, clipId)).join("") + `</g>`;
  out += `<g transform="translate(${(pose.gazeX * 0.2).toFixed(2)} ${(pose.gazeY * 0.35).toFixed(2)})">` +
    neck.filter((p) => !p.band).map((p) => partSvg(p, model, colours, clipId)).join("") + `</g>`;
  out += model.eyes.map((p, k) => `<path d="${p.d}" fill="${colours.eye}" transform="${m(eyes.eyes[k])}"/>`).join("");
  out += `<g transform="translate(${(pose.gazeX * 0.5).toFixed(2)} ${(pose.gazeY * 0.5).toFixed(2)})">` +
    worn.face.map((p) => partSvg(p, model, colours, clipId)).join("") + `</g>`;
  out += `</g>`;

  const g = 26;
  // How each symbol moves, as in OmaBlob's BlobView: some float up and fade, sweat drips, the keys
  // tap, and the rest (the charging bolt, a question mark...) pulse in size and opacity. `clk` is
  // the page's clock in seconds; a pose that only has symbolPhase (the Studio's loops) stands in.
  const clk = pose.clock !== undefined ? pose.clock : pose.symbolPhase / 0.8;
  symbolSpots(o.symbols, model.box, g).forEach((p, i) => {
    const s = p.name;
    const spot = SYMBOLS[s];
    const phase = (clk * (s === "keys" ? 2.4 : 0.8) + i * 0.37) % 1;
    const wave = Math.sin(2 * Math.PI * phase);
    const floats = s === "notes" || s === "zzz" || s === "coffee" || s === "sparkle";
    const pulses = PULSING.indexOf(s) !== -1;
    const x = p.x + g / 2 + (s === "notes" ? 2 * wave : 0);
    const y = p.y + g / 2 + (s === "sweat" ? 8 * phase : 0) - (floats ? 7 * phase : 0) - (s === "keys" ? 1.5 * Math.abs(wave) : 0);
    const fade = s === "sweat" ? 1 - 0.7 * phase : floats ? 1 - 0.5 * phase : pulses ? 0.75 + 0.25 * wave : 1;
    const grow = pulses ? 1 + 0.12 * wave : 1;
    const tilt = s === "alert" || s === "question" ? 12 * Math.sin(2 * Math.PI * clk * 3) : 0;
    const fill = spot[1] === "fg" ? fg : spot[1];
    const d = o.glyphFont ? null : Glyphs.path(spot[0]);
    // Grown and tilted about its own centre.
    const about = grow !== 1 || tilt ? `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tilt.toFixed(2)}) scale(${grow.toFixed(3)}) translate(${(-x).toFixed(2)} ${(-y).toFixed(2)})` : "";
    out += about ? `<g transform="${about}">` : "";
    if (d) {
      // Icon glyphs as paths, so they draw without a Nerd Font; set glyphFont to use the font.
      out += `<path d="${d}" fill="${fill}" opacity="${fade.toFixed(2)}" ` +
        `transform="translate(${(x - g / 2).toFixed(2)} ${(y - g / 2).toFixed(2)}) scale(${(g / 24).toFixed(4)})"/>`;
    } else {
      out += `<text x="${x.toFixed(2)}" y="${(y + g * 0.36).toFixed(2)}" font-family="${esc(o.font || "monospace")}" font-size="${g}" ` +
        `font-weight="bold" text-anchor="middle" opacity="${fade.toFixed(2)}" fill="${fill}">${esc(spot[0])}</text>`;
    }
    out += about ? `</g>` : "";
  });
  return out + `</svg>`;
}

export const MOTIONS = ["still", "bounce", "groove", "wiggle", "spin", "look", "blink"];
export const MOTION_SECONDS = { bounce: 1.0, groove: 1.2, wiggle: 1.2, spin: 1.6, look: 2.4, blink: 2.4 };
export const MOTION_FPS = 20;

export function motionPose(name, t) {
  const s = Math.sin(2 * Math.PI * t);
  switch (name) {
    case "bounce": {
      const up = Math.sin(Math.PI * t);
      return { dy: -12 * up, sy: 1 + 0.12 * Math.sin(2 * Math.PI * t), sx: 1 - 0.08 * Math.sin(2 * Math.PI * t), symbolPhase: t };
    }
    case "groove": return { dy: -4 * Math.abs(Math.sin(2 * Math.PI * t)), rot: 6 * s, symbolPhase: t };
    case "wiggle": return { rot: 9 * Math.sin(4 * Math.PI * t), symbolPhase: t };
    case "spin": return { spin: 360 * (1 - Math.pow(1 - t, 2)) % 360, symbolPhase: t };
    case "look": return { gazeX: 6 * s, gazeY: -2 * Math.max(0, Math.cos(2 * Math.PI * t)), rot: 3 * s, symbolPhase: t };
    case "blink": {
      const b = t > 0.42 && t < 0.58 ? Math.sin(Math.PI * (t - 0.42) / 0.16) : 0;
      return { blink: b, sy: 1 + 0.03 * s, sx: 1 + 0.03 * s, symbolPhase: t };
    }
    default: return {};
  }
}
