// The touch pad: a see-through window the pet keeps over the blob (see touch_pad in main.rs).
// It only passes what lands on it to the pet, which does the rest, so that a finger can drag the
// blob and hold it for the ring even though the pet's own window is click-through.
const { emitTo } = window.__TAURI__.event;

const send = (e) => emitTo("pet", "tp", {
  type: e.type, id: e.pointerId, kind: e.pointerType, button: e.button, primary: e.isPrimary, x: e.clientX, y: e.clientY,
}).catch(() => {});

document.addEventListener("pointerdown", (e) => {
  try { document.body.setPointerCapture(e.pointerId); } catch (err) { /* the finger is already gone */ }
  send(e);
});
// Moves only count while something is pressed (a mouse just passing over is not news).
document.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse" || e.buttons) send(e); });
document.addEventListener("pointerup", send);
document.addEventListener("pointercancel", send);
document.addEventListener("contextmenu", (e) => e.preventDefault());
