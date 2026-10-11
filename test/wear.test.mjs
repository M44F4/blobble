import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blob from "../core/Blob.mjs";
import * as Wear from "../core/Wear.mjs";

const seeds = ["blobby", "quattro", "Om", "pickle-otter-7"];

test("the outline matches the body's bounds", () => {
  for (const s of Blob.SHAPES) {
    const m = Blob.model("blobby", Blob.options({ shape: s.key }));
    const rows = Wear.outline(m).rows.filter((r) => r.spans.length);
    const x0 = Math.min(...rows.map((r) => r.spans[0][0]));
    const x1 = Math.max(...rows.map((r) => r.spans[r.spans.length - 1][1]));
    // bounds() counts control points, so it can only be wider.
    assert.ok(x0 >= m.box.x0 - 0.5 && x1 <= m.box.x1 + 0.5, s.key);
    assert.ok(x1 - x0 > (m.box.x1 - m.box.x0) * 0.8, s.key);
  }
});

test("every item fits every shape: on the head, never floating", () => {
  for (const seed of seeds) {
    for (const s of Blob.SHAPES) {
      const m = Blob.model(seed, Blob.options({ shape: s.key }), "idle");
      const a = Wear.anchors(m);
      for (const item of Wear.HEAD.concat(Wear.EARS, Wear.FACE, Wear.NECK, Wear.HAND)) {
        const wear = {};
        wear[Wear.slotOf(item)] = item;
        const p = Wear.parts(m, wear, Blob.colours(m));
        const label = `${seed} ${s.key} ${item}`;
        assert.ok(p.box, label);
        // Nothing runs off far: within half a body of the blob.
        const w = m.box.x1 - m.box.x0, h = m.box.y1 - m.box.y0;
        assert.ok(p.box.x0 > m.box.x0 - w * 0.45 && p.box.x1 < m.box.x1 + w * 0.45, label);
        assert.ok(p.box.y0 > m.box.y0 - Math.max(w, h) * 0.95 && p.box.y1 < m.box.y1 + h * 0.3, label);
        // Hats reach down onto the head (their bottom is at or below its top);
        // a halo floats on purpose.
        if (["head", "ears"].indexOf(Wear.slotOf(item)) !== -1 && item !== "headphones" && item !== "halo") assert.ok(p.box.y1 >= a.top, label);
        // Neck things sit on the lower body, below the eyes.
        if (Wear.slotOf(item) === "neck") assert.ok(p.box.y0 > a.eyeY && p.box.y1 <= m.box.y1 + 6, label);
        for (const part of p.head.concat(p.face, p.neck)) {
          if (part.band) assert.ok(part.y1 > part.y0, label);
          else assert.match(part.d, /^M[-\d.]+ [-\d.]+/, label);
        }
      }
    }
  }
});

test("glasses sit on the eyes", () => {
  for (const s of Blob.SHAPES) {
    const m = Blob.model("blobby", Blob.options({ shape: s.key }), "idle");
    const a = Wear.anchors(m);
    const p = Wear.parts(m, { face: "glasses" }, Blob.colours(m));
    for (const e of a.eyes) {
      assert.ok(e.x > p.box.x0 && e.x < p.box.x1 && e.y > p.box.y0 && e.y < p.box.y1, s.key);
    }
  }
});

test("no outfit draws nothing", () => {
  const m = Blob.model("blobby", {}, "idle");
  assert.deepEqual(Wear.parts(m, {}, Blob.colours(m)), { head: [], face: [], neck: [], box: null, hide: [] });
  assert.deepEqual(Wear.parts(m, { head: "none", face: "nonsense" }, Blob.colours(m)).box, null);
});

test("hat colours stand apart from the body", () => {
  for (const hue of Blob.HUES) {
    const m = Blob.model("blobby", Blob.options({ hue, themeMode: "seed" }), "idle");
    const body = Blob.oklch(Blob.colours(m).head);
    const main = Blob.oklch(Wear.palette(Blob.colours(m).head).main);
    const apart = 180 - Math.abs((((main.h - body.h) % 360) + 360) % 360 - 180);
    assert.ok(apart > 120, `hue ${hue}`); // roughly opposite
  }
});

test("symbols never sit on each other", async () => {
  const { symbolSpots } = await import("../core/Render.mjs");
  const box = { x0: 20, y0: 20, x1: 80, y1: 80 };
  const g = 26;
  const spots = symbolSpots(["coffee", "charging", "leaf", "package"], box, g);
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i], b = spots[j];
      assert.ok(a.side !== b.side || Math.abs(a.y - b.y) >= g * 0.95, `${a.name} overlaps ${b.name}`);
    }
});

test("a hat hides the sun's rays it covers, and only those", () => {
  const m = Blob.model("quattro", Blob.options({ shape: "sun" }), "idle");
  const hid = Wear.parts(m, { head: "beanie" }, Blob.colours(m)).hide;
  assert.ok(hid.length > 0 && hid.length < m.body.length - 1);
  assert.deepEqual(Wear.parts(m, { face: "glasses" }, Blob.colours(m)).hide, []);
});
