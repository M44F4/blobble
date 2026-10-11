// One blob drawn into an element, like OmaBlob's BlobView.qml: expressions ease into each other,
// it blinks, breathes, bobs, hops, looks at the cursor and does little antics. Still views
// (previews and tiles) draw once; live ones join one shared animation loop.
import * as Blob from "../core/Blob.mjs";
import * as Wear from "../core/Wear.mjs";
import * as Render from "../core/Render.mjs";

const live = new Set();
let looping = false;
function loop(now) {
  for (const v of live) v.frame(now);
  if (live.size) requestAnimationFrame(loop);
  else looping = false;
}
function join(view) {
  live.add(view);
  if (!looping) { looping = true; requestAnimationFrame(loop); }
}

const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

// Antics as keyframes over time (ms): each returns the pose bits for time t, or null when done.
function tween(steps) {
  // steps: [[duration, {prop: to}, easing]], values start from the previous step.
  return (t, set) => {
    let at = 0;
    let from = {};
    for (const [d, to, e] of steps) {
      if (t <= at + d) {
        const k = (e || ease.outQuad)(d ? (t - at) / d : 1);
        for (const p in to) set[p] = (from[p] !== undefined ? from[p] : set[p]) + ((to[p]) - (from[p] !== undefined ? from[p] : set[p])) * k;
        for (const p in from) if (!(p in to)) set[p] = from[p];
        return true;
      }
      at += d;
      from = Object.assign({}, from, to);
    }
    return false;
  };
}
const ANTICS = {
  look: { face: "", run: (t, s) => {
    s.look = true;
    if (t < 750) { s.gx = -1; s.gy = 0; } else if (t < 1500) { s.gx = 1; s.gy = 0; } else if (t < 2100) { s.gx = 0.2; s.gy = -1; } else return false;
    return true;
  } },
  yawn: { face: "sleepy", run: (t, s) => {
    if (t > 650 && t < 1350) s.closed = true; else s.closed = false;
    return tween([[650, { sy: 1.12, sx: 0.94 }], [700, {}], [420, { sy: 1, sx: 1 }, ease.outBack], [250, {}]])(t, s);
  } },
  stretch: { face: "", run: tween([[420, { sy: 1.16, sx: 0.9 }], [180, { sy: 0.9, sx: 1.08 }, ease.inQuad], [380, { sy: 1, sx: 1 }, ease.outBack]]) },
  wiggle: { face: "happy", run: tween([[130, { rot: -9 }], [200, { rot: 9 }, ease.inOut], [200, { rot: -7 }, ease.inOut], [200, { rot: 6 }, ease.inOut], [160, { rot: 0 }], [200, {}]]) },
  spin: { face: "happy", run: (t, s, v) => {
    if (t < 750) { s.spin = 360 * ease.inOut(t / 750); return true; }
    if (!s.hopped) { s.hopped = true; s.spin = 0; v.hop(); }
    return t < 1150;
  } },
  peek: { face: "surprised", run: (t, s) => { s.look = true; s.gx = 0.7; s.gy = -1; return tween([[220, { dy: -4 }], [700, {}], [260, { dy: 0 }, ease.inQuad]])(t, s); } },
  nod: { face: "", run: (t, s) => { s.look = true; s.gx = 0; s.gy = 0.8; return tween([[160, { dy: 3 }], [160, { dy: 0 }], [160, { dy: 3 }], [160, { dy: 0 }], [200, {}]])(t, s); } },
  shiver: { face: "unsure", run: (t, s) => {
    if (t < 540) { s.dx = Math.floor(t / 45) % 2 ? 1.4 : -1.4; return true; }
    s.dx = 0;
    return t < 850;
  } },
  hop2: { face: "happy", run: (t, s, v) => {
    if (!s.h1) { s.h1 = true; v.hop(); }
    if (t > 420 && !s.h2) { s.h2 = true; v.hop(); }
    return t < 870;
  } },
  blink2: { face: "", run: (t, s) => {
    const b = [[0, 90, 0, 1], [90, 230, 1, 0], [230, 370, 0, 0], [370, 460, 0, 1], [460, 620, 1, 0]];
    for (const [a, z, f, to] of b) if (t < z) { s.blink = f + (to - f) * ((t - a) / (z - a)); return true; }
    return false;
  } },
};
export const ANTIC_NAMES = Object.keys(ANTICS);

export class BlobView {
  constructor(el, props) {
    this.el = el;
    this.p = Object.assign({
      seed: "blob", look: {}, accent: "", mood: null, size: 96, still: false, fit: false,
      showAccessories: true, showWear: true, wear: null, accessoryScale: 0.26, frameSymbols: false,
      gazeEnabled: true, reduceMotion: false, lift: 0, tilt: 0, walk: 0, walkDir: 1, foreground: "#e4e4e4",
      hopHeight: 10, faceOverride: "",
    }, props || {});
    this.clock = 0;
    this.last = 0;
    this.blink = 0;
    this.blinkAt = 2500 + Math.random() * 3000;
    this.blinkStart = -1;
    this.gaze = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.hopT = 1; this.hopStart = -1; this.hopSize = 1; this.hopLean = 0;
    this.antic = null;
    this.morph = 1; this.morphStart = -1; this.morphDur = 320;
    this.fromPose = null; this.toPose = null; this.fromColours = null; this.toColours = null;
    this.frameNow = null; this.frameFrom = null; this.frameTo = null; this.frameStart = -1;
    this.lifted = this.p.lift || 0; this.tilted = this.p.tilt || 0;
    this.key = "";
    this.retarget(true);
    this.render(performance.now());
    if (!this.p.still) join(this);
  }

  set(props) {
    const before = this.targetKey();
    Object.assign(this.p, props);
    if (this.targetKey() !== before) this.retarget(false);
    if (this.p.still) { live.delete(this); this.render(performance.now()); } else join(this);
  }

  destroy() { live.delete(this); }

  get mood() { return this.p.mood || null; }
  get motion() { return (this.mood && this.mood.motion) || { breath: 1, bob: 0, shake: 0, droop: 0, hop: 0, type: 0 }; }
  get restingFace() { return (this.p.look && this.p.look.restingFace) || "idle"; }
  get expression() {
    if (this.p.faceOverride) return this.p.faceOverride;
    if (this.antic && this.antic.face) return this.antic.face;
    const m = this.mood;
    return m && m.face && m.face !== "idle" && m.mild !== true ? m.face : this.restingFace;
  }
  get eyesClosed() { return !!(this.mood && this.mood.eyesClosed) || !!(this.antic && this.antic.s.closed); }
  get accessories() { return this.p.showAccessories && this.mood && this.mood.accessories ? this.mood.accessories : []; }
  get outfit() {
    if (!this.p.showWear) return {};
    return this.p.wear || (this.mood && this.mood.wear) || {};
  }

  targetKey() {
    return [this.p.seed, JSON.stringify(this.p.look), this.p.accent, this.expression].join("|");
  }

  model() {
    const key = this.targetKey();
    if (this.key !== key) {
      this.key = key;
      this.target = Blob.model(this.p.seed, Blob.options(this.p.look, this.p.accent), this.expression);
      this.base = Blob.colours(Blob.model(this.p.seed, Blob.options(this.p.look, this.p.accent), "idle")).head;
    }
    return this.target;
  }

  retarget(first) {
    const prevPose = this.currentPose();
    const prevColours = this.currentColours();
    const m = this.model();
    this.toPose = m.pose;
    this.toColours = Blob.colours(m);
    if (first || this.p.reduceMotion || this.p.still) {
      this.fromPose = this.toPose; this.fromColours = this.toColours; this.morph = 1; return;
    }
    this.fromPose = prevPose; this.fromColours = prevColours;
    this.morph = 0; this.morphStart = -1;
    this.morphDur = this.expression === "idle" ? 560 : 320;
  }

  currentPose() {
    if (!this.toPose && !this.fromPose) return undefined;
    return Blob.lerpPose(this.fromPose || undefined, this.toPose || undefined, this.morph);
  }
  currentColours() {
    if (!this.fromColours || !this.toColours) return this.toColours || null;
    return { head: Blob.fadeHex(this.fromColours.head, this.toColours.head, this.morph),
      eye: Blob.fadeHex(this.fromColours.eye, this.toColours.eye, this.morph) };
  }

  hop(size, lean) {
    if (this.p.reduceMotion || this.p.still) return;
    const s = size === undefined ? 1 : size;
    if (this.hopT < 1 && s < this.hopSize) return;
    this.hopSize = s; this.hopLean = lean || 0; this.hopStart = -1; this.hopT = 0;
    join(this);
  }

  doAntic(name) {
    if (this.p.reduceMotion || this.p.still || !ANTICS[name]) return;
    this.antic = { name, face: ANTICS[name].face, start: -1, s: { sx: 1, sy: 1, rot: 0, spin: 0, dx: 0, dy: 0 } };
    this.retarget(false);
  }
  get anticRunning() { return !!this.antic; }

  // Where the cursor is from the blob's middle, in CSS pixels; null when unknown.
  setCursor(dx, dy) { this.cursor = dx === null ? null : { dx, dy }; }

  updateGaze() {
    const a = this.antic;
    let g = null;
    if (a && a.s.look) g = { x: a.s.gx || 0, y: a.s.gy || 0 };
    else if (this.p.walk > 0.5) g = { x: this.p.walkDir, y: 0.15 };
    else if (this.mood && this.mood.gaze) g = this.mood.gaze;
    if (!g && this.p.gazeEnabled && !this.p.still && this.cursor && !this.eyesClosed) {
      const { dx, dy } = this.cursor;
      const dist = Math.hypot(dx, dy);
      const reach = Math.min(1, dist / 120);
      g = dist > 0 ? { x: dx / dist * reach, y: dy / dist * reach } : { x: 0, y: 0 };
    }
    const tx = this.p.size < 48 ? 9 : 6, ty = this.p.size < 48 ? 7 : 4.5;
    this.gazeTarget = g ? { x: g.x * tx, y: g.y * ty } : { x: 0, y: 0 };
    this.travelX = tx;
  }

  frame(now) {
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    this.last = now;
    const m = this.motion;
    const moving = !this.p.reduceMotion && !this.p.still;
    if (moving && !this.eyesClosed) this.clock += dt / 1000;
    else if (moving && this.eyesClosed) this.clock += dt / 2000;

    // Morph between faces.
    if (this.morph < 1) {
      if (this.morphStart < 0) this.morphStart = now;
      this.morph = Math.min(1, ease.outCubic((now - this.morphStart) / this.morphDur));
    }
    // Blinks every few seconds.
    if (!this.eyesClosed && moving) {
      this.blinkAt -= dt;
      if (this.blinkAt <= 0) { this.blinkStart = now; this.blinkAt = 2500 + Math.random() * 4000; }
      if (this.blinkStart >= 0) {
        const t = now - this.blinkStart;
        this.blink = t < 70 ? t / 70 : t < 190 ? 1 - (t - 70) / 120 : 0;
        if (t >= 190) this.blinkStart = -1;
      }
    }
    // Hops.
    if (this.hopT < 1) {
      if (this.hopStart < 0) this.hopStart = now;
      this.hopT = Math.min(1, (now - this.hopStart) / 380);
    }
    // Antics.
    if (this.antic) {
      const a = this.antic;
      if (a.start < 0) a.start = now;
      const keep = ANTICS[a.name].run(now - a.start, a.s, this);
      if (!keep) { this.antic = null; this.retarget(false); }
    }
    // Lift and tilt ease like Behaviors.
    this.lifted += ((this.p.lift || 0) - this.lifted) * Math.min(1, dt / 90);
    this.tilted += ((this.p.tilt || 0) - this.tilted) * Math.min(1, dt / 80);
    // Gaze eases towards its target.
    this.updateGaze();
    const k = Math.min(1, dt / 70);
    this.gaze.x += (this.gazeTarget.x - this.gaze.x) * k;
    this.gaze.y += (this.gazeTarget.y - this.gaze.y) * k;

    this.render(now);

    const busy = this.morph < 1 || this.hopT < 1 || this.antic || m.bob || m.shake || m.type || this.p.walk
      || this.accessories.length || this.p.size >= 48 || Math.abs(this.gaze.x - this.gazeTarget.x) > 0.01 || this.blinkStart >= 0
      || Math.abs(this.lifted - (this.p.lift || 0)) > 0.01 || Math.abs(this.tilted - (this.p.tilt || 0)) > 0.05;
    if (this.p.still || (!busy && !this.p.gazeEnabled)) live.delete(this);
  }

  // The picture's frame in the blob's 100-unit space: the body (when fitting) and what it wears.
  computeFrame(model, worn) {
    const fitting = this.p.fit && !model.bg;
    let b = fitting ? Object.assign({}, model.box) : { x0: 0, y0: 0, x1: 100, y1: 100 };
    if (worn && worn.box && !this.p.tight) b = { x0: Math.min(b.x0, worn.box.x0), y0: Math.min(b.y0, worn.box.y0), x1: Math.max(b.x1, worn.box.x1), y1: Math.max(b.y1, worn.box.y1) };
    if (this.p.frameSymbols) {
      const g = 100 * this.p.accessoryScale;
      Render.symbolSpots(this.accessories, model.box, g).forEach((p) => {
        b = { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y - 8), x1: Math.max(b.x1, p.x + g), y1: Math.max(b.y1, p.y + g) };
      });
    }
    // zoom > 1 crops in, so the body fills more of a small picture (the tray icon).
    const side = Math.max(1, b.x1 - b.x0, b.y1 - b.y0) / (this.p.zoom || 1);
    return [(b.x0 + b.x1) / 2 - side / 2, (b.y0 + b.y1) / 2 - side / 2, side];
  }

  render(now) {
    const model = this.model();
    const colours = this.currentColours() || Blob.colours(model);
    const outfit = this.outfit;
    const worn = Wear.parts(model, Object.assign({}, outfit, { base: this.base }), Blob.colours(model));
    const want = this.computeFrame(model, worn);
    if (!this.frameNow || this.p.still || this.p.reduceMotion) this.frameNow = want;
    else if (want.join() !== (this.frameTo || []).join()) { this.frameFrom = this.frameNow; this.frameTo = want; this.frameStart = now; }
    if (this.frameTo && this.frameStart >= 0) {
      const k = ease.outCubic(Math.min(1, (now - this.frameStart) / 260));
      this.frameNow = this.frameFrom.map((v, i) => v + (this.frameTo[i] - v) * k);
      if (k >= 1) this.frameStart = -1;
    }

    const m = this.motion;
    const a = this.antic ? this.antic.s : { sx: 1, sy: 1, rot: 0, spin: 0, dx: 0, dy: 0 };
    const c = this.clock;
    const breathing = this.p.size >= 48 && !this.p.still && !this.p.reduceMotion;
    const breath = breathing ? 1 + 0.03 * (m.breath || 1) * Math.sin(2 * Math.PI * c / 3.4) : 1;
    const bobPhase = Math.PI * c * 1.9, stepPhase = Math.PI * c * 4;
    const hs = this.hopSize, ht = this.hopT;
    const walk = this.p.walk || 0;
    const hopOn = ht < 1 ? 1 : 0;
    const offX = (m.shake || 0) * 0.9 * Math.sin(2 * Math.PI * c * 5) + this.hopLean * 3 * Math.sin(Math.PI * ht) * hopOn;
    const offY = -(m.bob || 0) * 4 * Math.abs(Math.sin(bobPhase)) + (m.droop || 0) * 4
      - (m.type || 0) * 1.6 * Math.abs(Math.sin(Math.PI * c * 5))
      - walk * 3 * Math.abs(Math.sin(stepPhase))
      - this.p.hopHeight * hs * Math.sin(Math.PI * ht) * hopOn;
    const sway = (m.bob || 0) * 5 * Math.sin(bobPhase) + walk * (this.p.walkDir * 5 + 4 * Math.sin(stepPhase));
    const lean = this.p.still ? 0 : this.gaze.x / (this.travelX || 6) * 6;
    const blink = this.antic && this.antic.s.blink !== undefined ? this.antic.s.blink : this.blink;
    const pose = {
      dx: offX + (a.dx || 0),
      dy: offY + (a.dy || 0),
      sx: breath * (1 - 0.08 * hs * Math.sin(2 * Math.PI * ht) * hopOn) * (a.sx || 1),
      sy: breath * (1 - 0.06 * (m.droop || 0)) * (1 + 0.12 * hs * Math.sin(2 * Math.PI * ht) * hopOn) * (1 + 0.1 * this.lifted) * (a.sy || 1),
      rot: sway + lean + this.tilted + (a.rot || 0) + this.hopLean * 9 * Math.sin(Math.PI * ht) * hopOn,
      spin: a.spin || 0,
      blink: this.eyesClosed ? Math.max(0.6, blink) : blink,
      gazeX: this.p.still ? 0 : this.gaze.x,
      gazeY: this.p.still ? 0 : this.gaze.y,
      symbolPhase: (c * 0.8) % 1,
      clock: c,
    };
    this.el.innerHTML = Render.svg({
      seed: this.p.seed, look: this.p.look, accent: this.p.accent, face: this.expression,
      facePose: this.currentPose(), colours, wear: outfit, symbols: this.accessories, pose,
      size: this.p.size, view: this.frameNow, overflow: true, foreground: this.p.foreground,
      opacity: this.mood && this.mood.tint === "pale" ? 0.72 : 1,
    });
  }
}

// A one-off picture: a still blob as an SVG string.
export function still(props) {
  const div = document.createElement("div");
  const v = new BlobView(div, Object.assign({ still: true }, props));
  v.destroy();
  return div.innerHTML;
}
