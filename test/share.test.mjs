import test from "node:test";
import assert from "node:assert/strict";
import * as Share from "../core/Share.mjs";

test("a code gives back the same look", () => {
  const look = { seed: "zuzu ü 🌙", shape: "cloud", themeMode: "tinted", wearHead: "beanie", hue: 120 };
  const code = Share.encode(Object.assign({ pet: { size: 96 }, reactions: { music: false } }, look));
  assert.match(code, /^blobble:[A-Za-z0-9_.~%=;!*-]+$/);
  assert.ok(code.length < 80, code);
  // Defaults (tinted) are left out of the code.
  assert.deepEqual(Share.decode("look at this: " + code + " nice"), { seed: look.seed, shape: "cloud", wearHead: "beanie", hue: 120 });
});

test("only look keys come back, and junk is refused", () => {
  const sneaky = "omablob:s=sun;active=false;pet=1;n=" + "x".repeat(200);
  assert.deepEqual(Share.decode(sneaky), { shape: "sun" });
  assert.equal(Share.decode("hello"), null);
  assert.equal(Share.decode("omablob:!!!"), null);
  assert.equal(Share.decode("omablob:n=%E0%A4%A"), null);
});

test("applying resets what the code leaves out", () => {
  const s = Share.apply({ shape: "sun" });
  assert.equal(s.shape, "sun");
  assert.equal(s.wearHead, "");
  assert.equal(s.hue, "seed");
  assert.equal(Object.keys(s).length, Share.KEYS.length);
});

test("codes shared from OmaBlob still decode", () => {
  assert.deepEqual(Share.decode("omablob:n=pebble;s=sun"), { seed: "pebble", shape: "sun" });
  assert.deepEqual(Share.decode("blobble:n=pebble;s=sun"), { seed: "pebble", shape: "sun" });
});
