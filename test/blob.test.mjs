import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blob from "../core/Blob.mjs";

test("same seed gives the same blob", () => {
  const a = Blob.model("blobby", Blob.options({}, "#7aa2f7"), "happy");
  const b = Blob.model("blobby", Blob.options({}, "#7aa2f7"), "happy");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Blob.model("someone else", Blob.options({}, "#7aa2f7"), "happy"));
});

test("every expression renders two eyes", () => {
  for (const e of Blob.EXPRESSIONS) {
    const m = Blob.model("blobby", {}, e);
    assert.equal(m.eyes.length, 2, e);
    assert.ok(m.body.length >= 1, e);
    for (const p of [...m.body, ...m.eyes]) assert.match(p.d, /^M/);
  }
});

test("tinted mode takes the hue of the theme accent", () => {
  const red = Blob.model("blobby", Blob.options({ themeMode: "tinted" }, "#e06c75"));
  const blue = Blob.model("blobby", Blob.options({ themeMode: "tinted" }, "#61afef"));
  assert.ok(Math.abs(Blob.oklch(red.fill.head).h - Blob.oklch("#e06c75").h) < 25);
  assert.ok(Math.abs(Blob.oklch(blue.fill.head).h - Blob.oklch("#61afef").h) < 25);
});

test("follow mode paints the body with the accent", () => {
  const m = Blob.model("blobby", Blob.options({ themeMode: "follow" }, "#e0af68"));
  assert.equal(m.fill.head, "#e0af68");
});

test("seed mode ignores the theme", () => {
  const a = Blob.model("blobby", Blob.options({ themeMode: "seed" }, "#e06c75"));
  const b = Blob.model("blobby", Blob.options({ themeMode: "seed" }, "#61afef"));
  assert.deepEqual(a.fill, b.fill);
});

test("shape lock changes the silhouette but keeps it per seed", () => {
  const sun = Blob.model("blobby", Blob.options({ shape: "sun" }));
  const round = Blob.model("blobby", Blob.options({ shape: "round" }));
  assert.ok(sun.body.length > round.body.length); // sun rays are extra marks
});

test("eye matrices match blobatar's own transforms", () => {
  const m = Blob.model("blobby", {}, "happy");
  const { eyes } = Blob.eyeMatrices(m.frames, m.pose, 0, 0, 0);
  const f = m.frames[0];
  // The eye centre moves exactly by the pose's translate for the left eye.
  const [a, b, c, d, e, g] = eyes[0];
  const x = a * f.cx + c * f.cy + e, y = b * f.cx + d * f.cy + g;
  assert.ok(Math.abs(x - (f.cx - m.pose.edx)) < 0.01);
  assert.ok(Math.abs(y - (f.cy + m.pose.edy)) < 0.01);
});

test("blink squashes and gaze shifts", () => {
  const m = Blob.model("blobby", {});
  const open = Blob.eyeMatrices(m.frames, m.pose, 0, 0, 0).eyes[0];
  const shut = Blob.eyeMatrices(m.frames, m.pose, 1, 0, 0).eyes[0];
  const look = Blob.eyeMatrices(m.frames, m.pose, 0, 3, -2).eyes[0];
  assert.ok(Math.abs(shut[3]) < Math.abs(open[3]));
  assert.ok(Math.abs(look[4] - open[4] - 3) < 1e-9 && Math.abs(look[5] - open[5] + 2) < 1e-9);
});

test("body bounds sit inside the drawing and differ by shape", () => {
  const box = (shape) => Blob.model("blobby", Blob.options({ shape })).box;
  for (const s of Blob.SHAPES) {
    const b = box(s.key);
    assert.ok(b.x0 >= -5 && b.y0 >= -5 && b.x1 <= 105 && b.y1 <= 105, s.key);
    assert.ok(b.x1 - b.x0 > 30 && b.y1 - b.y0 > 30, s.key);
  }
  const width = (b) => Math.max(b.x1 - b.x0, b.y1 - b.y0);
  assert.ok(width(box("sun")) < width(box("round")));
});

test("backdrop colour overrides the plate only", () => {
  const plain = Blob.model("blobby", Blob.options({ background: "circle" }));
  const tinted = Blob.model("blobby", Blob.options({ background: "circle", backdropColour: "#123456" }));
  assert.equal(tinted.bg.fill, "#123456");
  assert.equal(tinted.fill.head, plain.fill.head);
  assert.equal(Blob.backdropTints("blobby").length, 8);
});

test("an exact colour paints the body that colour", async () => {
  const Blob = await import("../core/Blob.mjs");
  assert.equal(Blob.bodyColour("Om", { themeMode: "exact", bodyColour: "#12ab34" }, "#7aa2f7").toLowerCase(), "#12ab34");
});
