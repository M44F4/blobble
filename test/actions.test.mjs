import { test } from "node:test";
import assert from "node:assert/strict";
import * as Actions from "../core/Actions.mjs";

test("the ring keeps known actions, in the saved order, within the limit", () => {
  assert.deepEqual(Actions.ring([]).map((a) => a.id), Actions.DEFAULT_RING);
  assert.deepEqual(Actions.ring(["home", "nonsense", "poke"]).map((a) => a.id), ["home", "poke"]);
  const all = Actions.ACTIONS.map((a) => a.id);
  assert.equal(Actions.ring(all).length, Actions.MAX_RING);
  assert.deepEqual(Actions.ring(["nonsense"]).map((a) => a.id), Actions.DEFAULT_RING);
});

test("dropped files get fitting actions", () => {
  const ids = (paths) => Actions.fileActions(paths).map((a) => a.id);
  assert.deepEqual(ids(["/a/b.png"]), ["openFile", "copyImage", "jpg", "shrink", "zip", "copyPath", "folder"]);
  assert.ok(ids(["/a/b.jpg", "/a/c.webp"]).includes("png"));
  assert.ok(!ids(["/a/b.jpg", "/a/c.webp"]).includes("copyImage"));
  assert.deepEqual(ids(["/a/clip.mp4"]), ["openFile", "gif", "zip", "copyPath", "folder"]);
  assert.deepEqual(ids(["/a/notes.txt"]), ["openFile", "zip", "copyPath", "folder"]);
});

test("file commands quote paths and never overwrite", () => {
  const cmd = Actions.fileCommand("png", ["/tmp/it's here/a b.jpg"]);
  assert.ok(cmd.includes(`'/tmp/it'\\''s here/a b.jpg'`));
  assert.ok(cmd.includes("freename"));
  assert.match(Actions.fileCommand("zip", ["/a/b c.png"]), /'\/a\/b c\.zip'/);
  assert.match(Actions.fileCommand("zip", ["/a/folder"]), /'\/a\/folder\.zip'/);
  assert.match(Actions.fileCommand("zip", ["/a/x", "/a/y"]), /'\/a\/files\.zip'/);
  assert.equal(Actions.fileCommand("nonsense", ["/a"]), "");
});

test("the keyboard button exists but is not in the default ring", () => {
  assert.ok(Actions.byId("keyboard"));
  assert.ok(!Actions.DEFAULT_RING.includes("keyboard"));
});
