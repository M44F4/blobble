import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "../core/MoodEngine.mjs";

const NOW = 100000;
const strainedLoad = { cpu: 95, strainedSince: NOW - 20000 };

test("calm when nothing happens", () => {
  const m = resolve({ now: NOW });
  assert.equal(m.face, "idle");
  assert.deepEqual(m.accessories, []);
  assert.equal(m.reasons[0].key, "calm");
});

test("music and heavy load layer instead of competing", () => {
  const m = resolve({ now: NOW, music: { playing: true, artist: "Daft Punk", title: "Voyager" }, load: strainedLoad });
  assert.equal(m.face, "unsure");                 // strained face wins
  assert.equal(m.motion.bob, 1);                  // still bobbing to music
  assert.ok(m.motion.shake > 0);                  // and shaking from load
  assert.deepEqual(m.accessories, ["sweat", "notes"]);
  assert.deepEqual(m.reasons.map((r) => r.key), ["strained", "music"]);
  const charging = resolve({ now: NOW, music: { playing: true }, load: strainedLoad, battery: { present: true, percent: 45, charging: true } });
  assert.deepEqual(charging.reasons.map((r) => r.key), ["strained", "music", "charging"]);
  assert.equal(m.reasons[1].detail, "Daft Punk, Voyager");
});

test("load must last before it counts as strained", () => {
  const m = resolve({ now: NOW, load: { cpu: 95, strainedSince: NOW - 2000 } });
  assert.equal(m.face, "thinking");
  assert.equal(m.motion.shake, 0);
});

test("sleep wins the face and quiets music", () => {
  const m = resolve({ now: NOW, asleep: true, music: { playing: true } });
  assert.equal(m.face, "sleepy");
  assert.equal(m.eyesClosed, true);
  assert.equal(m.motion.bob, 0);
  assert.deepEqual(m.accessories, ["zzz"]);
});

test("notifications get a short surprised hop, then fade", () => {
  const ev = [{ kind: "notify", at: NOW - 500 }];
  const m = resolve({ now: NOW, events: ev, music: { playing: true } });
  assert.equal(m.face, "surprised");
  assert.equal(m.motion.hop, 1);
  assert.equal(m.accessories[0], "alert");
  assert.equal(resolve({ now: NOW + 5000, events: ev }).face, "idle");
});

test("notifications do not wake a sleeping blob", () => {
  const m = resolve({ now: NOW, asleep: true, events: [{ kind: "notify", at: NOW }] });
  assert.equal(m.face, "sleepy");
});

test("turning a reaction off removes it completely", () => {
  const m = resolve({
    now: NOW, toggles: { music: false, workload: false },
    music: { playing: true }, load: strainedLoad,
  });
  assert.equal(m.face, "idle");
  assert.deepEqual(m.accessories, []);
});

test("battery: charging is happy, critical is sick and pale", () => {
  assert.equal(resolve({ now: NOW, battery: { present: true, percent: 50, charging: true } }).face, "happy");
  const c = resolve({ now: NOW, battery: { present: true, percent: 5, charging: false } });
  assert.equal(c.face, "sick");
  assert.equal(c.tint, "pale");
  assert.equal(resolve({ now: NOW, battery: { present: true, percent: 15 } }).face, "sad");
});

test("critical battery wins the face while motion still layers", () => {
  const m = resolve({ now: NOW, battery: { present: true, percent: 5 }, load: strainedLoad, music: { playing: true } });
  assert.equal(m.face, "sick");
  assert.ok(m.motion.shake > 0 && m.motion.bob === 1 && m.motion.droop === 1);
});

test("workspace switch glances in its direction", () => {
  assert.deepEqual(resolve({ now: NOW, events: [{ kind: "workspace", at: NOW, dir: -1 }] }).gaze, { x: -1, y: 0 });
  assert.equal(resolve({ now: NOW, toggles: { workspaces: false }, events: [{ kind: "workspace", at: NOW, dir: 1 }] }).gaze, null);
});

test("many pokes make it mad", () => {
  assert.notEqual(resolve({ now: NOW, events: [{ kind: "poke", at: NOW, n: 1 }] }).face, "mad");
  assert.equal(resolve({ now: NOW, events: [{ kind: "poke", at: NOW, n: 6 }] }).face, "mad");
});

test("never more than three accessories", () => {
  const m = resolve({
    now: NOW, events: [{ kind: "notify", at: NOW }], music: { playing: true },
    load: { cpu: 95, strainedSince: NOW - 20000, temp: 95 }, battery: { present: true, percent: 50, charging: true },
  });
  assert.equal(m.accessories.length, 3);
  assert.equal(m.accessories[0], "alert");
});

test("small moods keep the resting face, big ones replace it", () => {
  assert.equal(resolve({ now: NOW }).mild, true);
  assert.equal(resolve({ now: NOW, battery: { present: true, percent: 50, charging: true } }).mild, true);
  assert.equal(resolve({ now: NOW, battery: { present: true, percent: 15 } }).mild, true);
  assert.equal(resolve({ now: NOW, load: { cpu: 70 } }).mild, true);
  assert.equal(resolve({ now: NOW, music: { playing: true } }).mild, false);
  assert.equal(resolve({ now: NOW, asleep: true }).mild, false);
  assert.equal(resolve({ now: NOW, events: [{ kind: "notify", at: NOW }] }).mild, false);
});

test("typing is opt-in and only glances down", () => {
  assert.equal(resolve({ now: NOW, typing: true }).gaze, null);
  const m = resolve({ now: NOW, typing: true, toggles: { typing: true } });
  assert.equal(m.mild, true);
  assert.deepEqual(m.gaze, { x: 0, y: 1 });
  assert.deepEqual(m.accessories, []);
  assert.equal(m.motion.type, 0);
  assert.equal(resolve({ now: NOW, typing: true, toggles: { typing: true }, asleep: true }).gaze, null);
});

test("a window asking for you gets a questioning look until you go", () => {
  const a = resolve({ now: NOW, attention: { urgent: true }, music: { playing: true } });
  assert.equal(a.face, "surprised");
  assert.ok(a.accessories.includes("question"));
  assert.equal(a.reasons[0].key, "asking");
  assert.equal(resolve({ now: NOW, toggles: { attention: false }, attention: { urgent: true } }).face, "idle");
  assert.equal(resolve({ now: NOW, attention: { urgent: true }, asleep: true }).face, "sleepy");
  assert.equal(resolve({ now: NOW, attention: {} }).face, "idle");
});

test("long commands cheer or sulk", () => {
  assert.equal(resolve({ now: NOW, events: [{ kind: "commandOk", at: NOW }] }).face, "happy");
  assert.equal(resolve({ now: NOW, events: [{ kind: "commandFail", at: NOW }] }).face, "sad");
  assert.equal(resolve({ now: NOW, toggles: { commands: false }, events: [{ kind: "commandFail", at: NOW }] }).face, "idle");
});

test("windows: a glance when one opens, a wink when one closes", () => {
  assert.deepEqual(resolve({ now: NOW, events: [{ kind: "windowOpen", at: NOW, dir: 1 }] }).gaze, { x: 1, y: -0.4 });
  assert.equal(resolve({ now: NOW, events: [{ kind: "windowClose", at: NOW }] }).face, "wink");
  assert.equal(resolve({ now: NOW, toggles: { windows: false }, events: [{ kind: "windowClose", at: NOW }] }).face, "idle");
});

test("breaks are opt-in", () => {
  assert.equal(resolve({ now: NOW, breakDue: true }).face, "idle");
  const m = resolve({ now: NOW, breakDue: true, toggles: { breaks: true } });
  assert.equal(m.face, "sleepy");
  assert.ok(m.accessories.includes("coffee"));
});

test("system: offline, full disk and updates", () => {
  assert.ok(resolve({ now: NOW, network: { online: false } }).accessories.includes("offline"));
  assert.equal(resolve({ now: NOW, network: { online: true } }).reasons[0].key, "calm");
  assert.equal(resolve({ now: NOW, disk: { percent: 95 } }).reasons[0].key, "disk");
  assert.equal(resolve({ now: NOW, disk: { percent: 50 } }).reasons[0].key, "calm");
  assert.ok(resolve({ now: NOW, updates: { available: true } }).accessories.includes("package"));
});

test("outfits: your pick, unless the moment calls for something", () => {
  const all = { asleep: true, music: true, strained: true, typing: true, coding: true, performance: true, focus: true, seasonal: true };
  const outfit = { head: "tophat", face: "glasses" };
  assert.deepEqual(resolve({ now: NOW, outfit }).wear, { head: "tophat", face: "glasses", neck: "", ears: "", hand: "", tint: "auto" });
  assert.deepEqual(resolve({ now: NOW, outfit, dress: all, music: { playing: true } }).wear, { head: "headphones", face: "glasses", neck: "", ears: "", hand: "", tint: "auto" });
  assert.equal(resolve({ now: NOW, outfit, dress: all, asleep: true, music: { playing: true } }).wear.head, "nightcap");
  assert.equal(resolve({ now: NOW, dress: all, toggles: { typing: true }, typedRecently: true }).wear.face, "monocle");
  assert.equal(resolve({ now: NOW, dress: all, typedRecently: true }).wear.face, "");
  assert.equal(resolve({ now: NOW, dress: all, coding: true }).wear.face, "glasses");
  assert.equal(resolve({ now: NOW, dress: all, power: { profile: "performance" } }).wear.face, "sunglasses");
  assert.equal(resolve({ now: NOW, dress: all, date: { month: 12, day: 24 } }).wear.head, "santa");
  assert.equal(resolve({ now: NOW, dress: { music: false }, music: { playing: true } }).wear.head, "");
  assert.equal(resolve({ now: NOW, dress: all, focus: { phase: "work", left: 60000 } }).wear.head, "headband");
});

test("pomodoro: headband while focusing, coffee on a break", () => {
  const dress = { focus: true };
  const w = resolve({ now: NOW, dress, focus: { phase: "work", left: 600000 } });
  assert.equal(w.wear.head, "headband");
  assert.equal(w.reasons[0].key, "focus");
  assert.equal(w.reasons[0].detail, "10 min left");
  const p = resolve({ now: NOW, dress, focus: { phase: "work", left: 60000, paused: true } });
  assert.equal(p.reasons[0].label, "Focus paused");
  const b = resolve({ now: NOW, dress, focus: { phase: "short", left: 240000 } });
  assert.equal(b.wear.head, "");
  assert.ok(b.accessories.includes("coffee"));
  assert.equal(b.reasons[0].key, "pomoBreak");
  assert.equal(b.mild, true);
  assert.equal(resolve({ now: NOW, dress, focus: { phase: "" } }).wear.head, "");
});

test("dressedBy names the moment that put each item on", () => {
  const m = resolve({ now: NOW, dress: { music: true }, music: { playing: true }, outfit: { head: "tophat", face: "glasses" } });
  assert.equal(m.wear.head, "headphones");
  assert.deepEqual(m.dressedBy, { head: "music", face: "" });
});

test("the neck is always your pick", () => {
  const outfit = { head: "tophat", face: "", neck: "scarf" };
  assert.equal(resolve({ now: NOW, outfit, dress: { asleep: true }, asleep: true }).wear.neck, "scarf");
  assert.equal(resolve({ now: NOW, outfit: { neck: "none" } }).wear.neck, "");
});
