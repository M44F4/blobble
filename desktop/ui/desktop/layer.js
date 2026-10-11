// What Linux desktops with a layer shell (Hyprland, Sway, KDE and the like) need around the pet
// page: the panel is a layer, which gets no click when you click elsewhere, so while it is open
// the pet's overlay window takes the whole screen for one click (the one that closes it) and is
// hidden again when it closes. Used by Omarchy and by the other Linux desktops.
export function layerHost(ctx) {
  const { win, invoke, listen, emitTo, log } = ctx;
  let open = false;

  listen("panel:open", (e) => {
    open = !!e.payload;
    if (open) {
      // Over the bar's layer but under the panel (an overlay) while it only catches the click.
      invoke("pet_layer", { over: false }).catch(() => {});
      // The window's input region only counts once it is up: say it again, so the first press closes.
      win.show().then(() => { ctx.fitScreen(); ctx.refresh(); setTimeout(ctx.refresh, 120); }).catch(() => {});
    } else {
      invoke("pet_layer", { over: true }).catch(() => {});
      if (!ctx.petOut()) win.hide().catch(() => {});
    }
    ctx.refresh();
  });

  // A press anywhere outside the blob (a mouse or a finger) closes the panel.
  window.addEventListener("pointerdown", (e) => {
    if (!open || ctx.blobEl.contains(e.target)) return;
    open = false;
    emitTo("panel", "panel:toggle", "");
  }, true);

  return {
    // The window is up only to catch that click: no pet is shown, and it takes input everywhere.
    catching: () => open,
    log,
  };
}
