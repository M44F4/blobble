// The taskbar and the tray: where the blob sits when its home is the taskbar (Windows), where its
// tray icon is, and where it flies when it goes back to the tray. This is the model of those places,
// moved here from the pet page (pet.js) so it is not mixed with the pet's own behaviour; the page
// asks it. Desktops that have a taskbar or tray (Windows, other Linux, macOS) use it as it is; where
// the OS gives no taskbar it falls back to the edge of the screen's work area.
//
// ctx: { invoke, screen() -> { mon, work, edge }, home() -> the pet's home spot,
//        atHome() -> whether it sits at home (not moved by hand), layout() }
export function createTaskbar(ctx) {
  const { invoke, screen } = ctx;
  let tray = null;                 // where our tray icon is, in overlay CSS px: { x, y, w, h }
  let taskbarRect = null;          // the taskbar, and
  let notifyArea = null;           // its tray area (icons and clock)

  function barRect() {
    const { mon, work, edge } = screen();
    if (taskbarRect) return taskbarRect;
    const W = mon ? mon.w : 1920, H = mon ? mon.h : 1080;
    if (edge === "top") return { x: 0, y: 0, w: W, h: work.y };
    if (edge === "left") return { x: 0, y: 0, w: work.x, h: H };
    if (edge === "right") return { x: work.x + work.w, y: 0, w: W - work.x - work.w, h: H };
    return { x: 0, y: work.y + work.h, w: W, h: H - work.y - work.h };
  }
  // Our tray icon, but only when it is really on the taskbar: tucked behind the ^ arrow, Windows
  // reports a spot in the hidden overflow menu. Then the tray area stands in for it.
  function trayIcon() {
    if (!tray) return null;
    const b = barRect();
    const cx = tray.x + tray.w / 2, cy = tray.y + tray.h / 2;
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h ? tray : null;
  }
  function trayTarget() {
    const { edge } = screen();
    const t = trayIcon();
    if (t) return t;
    const n = notifyRect();
    // The ^ arrow sits at the start of the tray area.
    return edge === "left" || edge === "right" ? { x: n.x, y: n.y, w: n.w, h: Math.min(n.h, 32) } : { x: n.x, y: n.y, w: Math.min(n.w, 32), h: n.h };
  }
  function notifyRect() {
    const { edge } = screen();
    if (notifyArea) return notifyArea;
    if (trayIcon()) return tray;
    const b = barRect();
    return edge === "left" || edge === "right" ? { x: b.x, y: b.y + b.h - 220, w: b.w, h: 220 } : { x: b.x + b.w - 220, y: b.y, w: 220, h: b.h };
  }

  // In the taskbar, sitting on its outer edge (a big pet pokes out over the screen), just before the
  // tray area. s is the blob's size and p its padding.
  function homeSpot(s, p) {
    const { edge } = screen();
    const bar = barRect(), tr = notifyRect(), gap = 8;
    if (edge === "left" || edge === "right") {
      const x = edge === "left" ? bar.x + 2 : bar.x + bar.w - 2 - s;
      return { x: x - p, y: tr.y - gap - s - p };
    }
    const y = edge === "top" ? bar.y + 2 : bar.y + bar.h - 2 - s;
    return { x: tr.x - gap - s - p, y: y - p };
  }
  const inTaskbar = () => ctx.home() === "taskbar" && ctx.atHome();
  // It walks along the taskbar: up and down when the taskbar stands on the left or right.
  const upright = () => inTaskbar() && (screen().edge === "left" || screen().edge === "right");
  // Pills go above the blob when it sits on a taskbar at the bottom.
  const perched = () => inTaskbar() && screen().edge === "bottom";

  // How far it may walk from its spot (x0, y0): in the taskbar away from the tray and back, never
  // over it. Undefined when it is not in the taskbar (the page then uses the whole screen).
  function walkTarget(offset, x0, y0) {
    const bar = barRect();
    if (upright()) return Math.max(bar.y + 40 - y0, Math.min(0, offset));
    if (inTaskbar()) return Math.max(bar.x + 40 - x0, Math.min(0, offset));
    return undefined;
  }

  // Dropped (its centre at cx, cy) on the taskbar: back into it.
  function droppedOn(cx, cy) {
    const { work, edge } = screen();
    return edge === "bottom" ? cy > work.y + work.h : edge === "top" ? cy < work.y : edge === "left" ? cx < work.x : cx > work.x + work.w;
  }

  // Where the blob flies to when it goes back to the tray (s its size, p its padding).
  function flightSpot(s, p) {
    const { mon, work, edge } = screen();
    const t = trayTarget();
    if (t) return { x: t.x + t.w / 2 - p - s / 2, y: t.y + t.h / 2 - p - s / 2 };
    if (edge === "bottom") return { x: work.x + work.w - 120 - p - s / 2, y: (mon ? mon.h : 1080) - (mon.h - work.h) / 2 - p - s / 2 };
    if (edge === "top") return { x: work.x + work.w - 120 - p - s / 2, y: work.y / 2 - p - s / 2 };
    return { x: edge === "left" ? work.x / 2 - p - s / 2 : work.x + work.w + (mon.w - work.w - work.x) / 2 - p - s / 2, y: work.y + work.h - 60 - p - s / 2 };
  }

  // Asks the OS where the tray icon and the taskbar are (physical pixels), and keeps them in CSS px.
  async function find() {
    const { mon } = screen();
    const css = (r) => ({ x: (r[0] - mon.x) / mon.sf, y: (r[1] - mon.y) / mon.sf, w: r[2] / mon.sf, h: r[3] / mon.sf });
    try {
      const r = await invoke("tray_rect");
      if (r && mon) tray = css(r);
      const t = await invoke("taskbar");
      if (t && mon) {
        taskbarRect = css(t[0]);
        notifyArea = t[1] ? css(t[1]) : null;
      }
      ctx.layout();
    } catch (e) { /* no taskbar yet */ }
  }

  return { barRect, trayIcon, trayTarget, notifyRect, homeSpot, inTaskbar, upright, perched, walkTarget, droppedOn, flightSpot, find };
}
