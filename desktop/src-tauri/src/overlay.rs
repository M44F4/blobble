// The pet's overlay on Linux. On Wayland a window cannot place itself, so where the desktop
// has the layer shell (Hyprland, Sway, KDE, most wlroots desktops) the overlay becomes a layer
// over the whole screen, like OmaBlob's Pet.qml, and the page places the blob inside it as on
// Windows. gtk-layer-shell is loaded when it is there rather than linked, so Blobble still
// starts without it: on X11 the window places itself, and elsewhere it stays a plain window.
use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use libloading::{Library, Symbol};
use std::ffi::{c_char, c_int, c_void};
use std::sync::OnceLock;

type Win = *mut c_void;

struct LayerShell {
    lib: Library,
}

// The few calls used, from gtk-layer-shell.h.
const LAYER_TOP: c_int = 2;
const LAYER_OVERLAY: c_int = 3;
const EDGES: [c_int; 4] = [0, 1, 2, 3]; // left, right, top, bottom
const KEYS_NONE: c_int = 0;
const KEYS_ON_DEMAND: c_int = 2;

impl LayerShell {
    fn get() -> Option<&'static LayerShell> {
        static SHELL: OnceLock<Option<LayerShell>> = OnceLock::new();
        SHELL
            .get_or_init(|| {
                if std::env::var_os("WAYLAND_DISPLAY").is_none() || std::env::var("GDK_BACKEND").is_ok_and(|b| b == "x11") {
                    return None;
                }
                let lib = ["libgtk-layer-shell.so.0", "libgtk-layer-shell.so"]
                    .iter()
                    .find_map(|name| unsafe { Library::new(name) }.ok())?;
                let shell = LayerShell { lib };
                let supported: Symbol<unsafe extern "C" fn() -> c_int> = unsafe { shell.lib.get(b"gtk_layer_is_supported\0") }.ok()?;
                (unsafe { supported() } != 0).then_some(shell)
            })
            .as_ref()
    }

    fn call(&self, name: &[u8], win: Win) {
        if let Ok(f) = unsafe { self.lib.get::<unsafe extern "C" fn(Win)>(name) } {
            unsafe { f(win) }
        }
    }

    fn call_int(&self, name: &[u8], win: Win, a: c_int) {
        if let Ok(f) = unsafe { self.lib.get::<unsafe extern "C" fn(Win, c_int)>(name) } {
            unsafe { f(win, a) }
        }
    }

    fn call_int2(&self, name: &[u8], win: Win, a: c_int, b: c_int) {
        if let Ok(f) = unsafe { self.lib.get::<unsafe extern "C" fn(Win, c_int, c_int)>(name) } {
            unsafe { f(win, a, b) }
        }
    }

    fn set_namespace(&self, win: Win, name: &std::ffi::CStr) {
        if let Ok(f) = unsafe { self.lib.get::<unsafe extern "C" fn(Win, *const c_char)>(b"gtk_layer_set_namespace\0") } {
            unsafe { f(win, name.as_ptr()) }
        }
    }
}

fn raw(window: &gtk::ApplicationWindow) -> Win {
    let ptr: *mut gtk::ffi::GtkWindow = window.upcast_ref::<gtk::Window>().to_glib_none().0;
    ptr as Win
}

// Before the pet window is first shown: make it a layer over the whole screen where the
// desktop allows, then realize it so it can be made click-through straight away.
pub fn prepare(pet: &tauri::WebviewWindow) {
    let Ok(window) = pet.gtk_window() else { return };
    if let Some(shell) = LayerShell::get() {
        if !window.is_realized() {
            let w = raw(&window);
            shell.call(b"gtk_layer_init_for_window\0", w);
            shell.set_namespace(w, c"blobble");
            shell.call_int(b"gtk_layer_set_layer\0", w, LAYER_OVERLAY);
            for edge in EDGES {
                shell.call_int2(b"gtk_layer_set_anchor\0", w, edge, 1);
            }
            // Over the bars too (-1: ignore the room they reserve), so the pet can sit in one.
            shell.call_int(b"gtk_layer_set_exclusive_zone\0", w, -1);
            shell.call_int(b"gtk_layer_set_keyboard_mode\0", w, KEYS_NONE);
        }
    } else if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        eprintln!("[pet] no layer shell (install gtk-layer-shell): the pet is a plain window on this desktop");
    }
    window.realize();
}

// The panel: a layer in the corner by the bar, like OmaBlob's popup, under the bar rather than
// over it (exclusive zone 0 keeps it out of the room bars reserve). It takes the keyboard when
// clicked, and the page closes it when that focus goes.
pub fn prepare_panel(panel: &tauri::WebviewWindow) {
    let Ok(window) = panel.gtk_window() else { return };
    let Some(shell) = LayerShell::get() else { return };
    if window.is_realized() {
        return;
    }
    let w = raw(&window);
    shell.call(b"gtk_layer_init_for_window\0", w);
    shell.set_namespace(w, c"blobble-panel");
    shell.call_int(b"gtk_layer_set_layer\0", w, LAYER_OVERLAY);   // above the pet's overlay, which catches clicks outside
    // Opened from the tray, before any bar's side is known: the free height, on the right.
    for edge in [1, 2, 3] {
        shell.call_int2(b"gtk_layer_set_anchor\0", w, edge, 1);
        shell.call_int2(b"gtk_layer_set_margin\0", w, edge, 6);
    }
    shell.call_int(b"gtk_layer_set_exclusive_zone\0", w, 0);
    shell.call_int(b"gtk_layer_set_keyboard_mode\0", w, KEYS_ON_DEMAND);
    window.realize();
}

// A layer takes the keyboard only when asked to: while the ring is open.
pub fn keyboard(pet: &tauri::WebviewWindow, on: bool) {
    let Some(shell) = LayerShell::get() else { return };
    let Ok(window) = pet.gtk_window() else { return };
    shell.call_int(b"gtk_layer_set_keyboard_mode\0", raw(&window), if on { KEYS_ON_DEMAND } else { KEYS_NONE });
}

// Where the panel went last: the bar's side, the room it leaves for the card, and (beside a bar
// on a side) how far down the card starts. The panel's page asks for these when it sizes itself.
static PANEL: std::sync::Mutex<(String, i32, i32)> = std::sync::Mutex::new((String::new(), 0, 0));

#[tauri::command]
pub fn panel_info() -> (String, i32, i32) {
    PANEL.lock().map(|p| p.clone()).unwrap_or_default()
}

// Puts the panel at the bar, like OmaBlob's popup. The layer is as wide as the card and spans the
// free height beside or under the bar, against the bar's side; the card inside it is sized and
// placed by the page (a layer that has grown cannot be made smaller again), and the layer takes
// input only over the card (the page sets that). `along` is where the slot is along the bar, in
// logical pixels from the screen's start.
#[tauri::command]
pub fn panel_at(app: tauri::AppHandle, along: i32, width: i32) -> bool {
    use tauri::Manager;
    let Some(shell) = LayerShell::get() else { return false };
    let Some(panel) = app.get_webview_window("panel") else { return false };
    let Ok(gtk) = panel.gtk_window() else { return false };
    let Some(m) = crate::sensors::linux::hypr_monitor() else { return false };
    let w = raw(&gtk);
    let [l, t, r, b] = m.reserved;
    let most = l.max(t).max(r).max(b);
    // left, right, top, bottom as in EDGES; no bar means the top
    let (edge, name) = if most <= 0.0 || most == t { (2, "top") } else if most == b { (3, "bottom") } else if most == l { (0, "left") } else { (1, "right") };
    let side = edge < 2;
    let gap = 5;   // OmaBlob's popup keeps this far from the bar and the screen's edge
    // Under or over the bar: left edge of the card centred on the slot. Beside it: the card starts level with the slot.
    let slide = if side { (along - 24).clamp(0, (m.h as i32 - 200).max(0)) } else { (along - width / 2).clamp(gap, (m.w as i32 - width - gap).max(gap)) };
    // Top and bottom always (the free height), plus the bar's own side, or the slid-to left edge.
    for e in EDGES {
        let on = e == 2 || e == 3 || (side && e == edge) || (!side && e == 0);
        shell.call_int2(b"gtk_layer_set_anchor\0", w, e, on as c_int);
    }
    shell.call_int2(b"gtk_layer_set_margin\0", w, 2, gap);
    shell.call_int2(b"gtk_layer_set_margin\0", w, 3, gap);
    if side {
        shell.call_int2(b"gtk_layer_set_margin\0", w, edge, gap);
    } else {
        shell.call_int2(b"gtk_layer_set_margin\0", w, 0, slide);
    }
    // The room for the card: the screen less the bars and the gaps (beside a bar: less where the card starts).
    let room = if side { m.h - t - b - 2.0 * gap as f64 - slide as f64 } else { m.h - t - b - 2.0 * gap as f64 };
    if let Ok(mut p) = PANEL.lock() {
        *p = (name.to_string(), room as i32, if side { slide } else { 0 });
    }
    true
}

// The layer is as wide as the card (its height is the free height beside the bar): the web view
// is told, since it has a minimum size of its own.
#[tauri::command]
pub fn panel_size(app: tauri::AppHandle, width: i32) {
    use tauri::Manager;
    let Some(panel) = app.get_webview_window("panel") else { return };
    let Ok(gtk) = panel.gtk_window() else { return };
    let _ = panel.with_webview(move |view| {
        use gtk::prelude::WidgetExt;
        view.inner().set_size_request(width, 100);
    });
    gtk.set_size_request(width, 100);
}

// Below the bar's layer while it only catches a click, so the panel (an overlay) stays above it.
#[tauri::command]
pub fn pet_layer(app: tauri::AppHandle, over: bool) {
    use tauri::Manager;
    let Some(shell) = LayerShell::get() else { return };
    let Some(pet) = app.get_webview_window("pet") else { return };
    let Ok(gtk) = pet.gtk_window() else { return };
    shell.call_int(b"gtk_layer_set_layer\0", raw(&gtk), if over { LAYER_OVERLAY } else { LAYER_TOP });
}

// The cursor in the overlay's CSS pixels (logical, from the monitor's corner), for the pet's eyes and
// for dragging it. The button is not known: reported as down, and the page lets go on its own mouseup.
#[tauri::command]
pub fn cursor_logical() -> Option<(f64, f64, bool)> {
    crate::sensors::linux::hypr_cursor().map(|(x, y)| (x, y, true))
}

// The bar and the cursor as Hyprland has them, in logical pixels from the monitor's corner: how the
// bar blob's eyes follow the mouse, and where the pet flies when it goes back into the bar.
#[tauri::command]
pub fn bar_info() -> Option<serde_json::Value> {
    let m = crate::sensors::linux::hypr_monitor()?;
    let [l, t, r, b] = m.reserved;
    let most = l.max(t).max(r).max(b);
    if most <= 0.0 {
        return None;
    }
    let edge = if most == t { "top" } else if most == b { "bottom" } else if most == l { "left" } else { "right" };
    let cursor = crate::sensors::linux::hypr_cursor().map(|(x, y)| [x, y]);
    Some(serde_json::json!({ "edge": edge, "thickness": most, "w": m.w, "h": m.h, "cursor": cursor }))
}
