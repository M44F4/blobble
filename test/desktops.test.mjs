// What every desktop module (desktop/ui/desktop/*.js) has to provide: the shared pages and the pet
// ask it for words, reactions and ring actions, so a new desktop starts by passing these.
// The modules reach for `window` when they load; there is no page here, so give them a stub.
import test from "node:test";
import assert from "node:assert/strict";
import { REACTIONS } from "../core/MoodEngine.mjs";
import { ACTIONS } from "../core/Actions.mjs";

globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
const modules = {
  windows: (await import("../desktop/ui/desktop/windows.js")).default,
  omarchy: (await import("../desktop/ui/desktop/omarchy.js")).default,
  linux: (await import("../desktop/ui/desktop/linux.js")).default,
  macos: (await import("../desktop/ui/desktop/macos.js")).default,
};
const actionIds = new Set(ACTIONS.map((a) => a.id));
const WORDS = ["home", "back", "trip", "tripTip", "autostartTip"];

for (const [key, d] of Object.entries(modules)) {
  test(`${key}: identifies itself`, () => {
    assert.equal(d.id, key);
    assert.ok(["windows", "linux", "macos"].includes(d.os));
    assert.ok(typeof d.name === "string" && d.name.length > 0);
    assert.ok(typeof d.aboutLine === "string" && d.aboutLine.length > 0);
  });

  test(`${key}: has the words the pages use`, () => {
    for (const w of WORDS) assert.ok(typeof d.words[w] === "string" && d.words[w].length > 0, `words.${w}`);
  });

  test(`${key}: only reacts to reactions that exist`, () => {
    assert.ok(Array.isArray(d.reactions) && d.reactions.length > 0);
    const known = new Set(REACTIONS.map((r) => r.id || r));
    for (const r of d.reactions) assert.ok(known.has(r), `unknown reaction "${r}"`);
  });

  test(`${key}: only names ring actions that exist`, () => {
    for (const id of d.missingActions || []) assert.ok(actionIds.has(id), `missingActions: unknown "${id}"`);
    for (const id of Object.keys(d.actionLabels || {})) assert.ok(actionIds.has(id), `actionLabels: unknown "${id}"`);
  });
}

test("Omarchy has a host for the bar widget", () => {
  assert.equal(typeof modules.omarchy.host, "function");
});

test("the desktops are told apart", () => {
  const ids = Object.values(modules).map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});
