// Blobble: the pet on an overlay over the screen, its panel above the tray, and
// the tray icon. The pet's page runs the brain (ui/service.js); this side only reads the OS
// and does the few things a page cannot.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
mod ctl;
#[cfg(target_os = "linux")]
mod widget;
#[cfg(target_os = "linux")]
mod events;
#[cfg(target_os = "linux")]
mod keys;
mod files;
#[cfg(target_os = "linux")]
mod overlay;
mod sensors;
mod system;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[tauri::command]
fn username() -> String {
    std::env::var(if cfg!(windows) { "USERNAME" } else { "USER" }).unwrap_or_else(|_| "blob".into())
}

// The tray icon is the blob itself, redrawn by the pet page whenever its face changes.
#[tauri::command]
fn set_tray(app: AppHandle, rgba: Vec<u8>, size: u32, tooltip: String) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("no tray icon")?;
    tray.set_icon(Some(tauri::image::Image::new_owned(rgba, size, size))).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())
}

// The bar blob stands in for the tray icon where there is one (Omarchy), like OmaBlob.
#[tauri::command]
fn show_tray(app: AppHandle, on: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_visible(on);
    }
}

// Where the tray icon is on screen, in physical pixels: [x, y, width, height].
#[tauri::command]
fn tray_rect(app: AppHandle) -> Option<(f64, f64, f64, f64)> {
    let rect = app.tray_by_id("main")?.rect().ok()??;
    let p = rect.position.to_physical::<f64>(1.0);
    let s = rect.size.to_physical::<f64>(1.0);
    Some((p.x, p.y, s.width, s.height))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn autostart(app: AppHandle, on: Option<bool>) -> bool {
    let launcher = app.autolaunch();
    if let Some(on) = on {
        let _ = if on { launcher.enable() } else { launcher.disable() };
    }
    launcher.is_enabled().unwrap_or(false)
}

// Puts the pet's overlay back above the taskbar (which comes to the front whenever it is
// clicked) without taking the focus.
#[tauri::command]
fn raise_pet(window: tauri::WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOOWNERZORDER};
        unsafe {
            SetWindowPos(hwnd.0 as _, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

// The pet never takes the keyboard from what you are doing, except while its menu is open
// (so the ring can be used with the keys).
#[tauri::command]
fn pet_focus(window: tauri::WebviewWindow, on: bool) {
    #[cfg(target_os = "linux")]
    overlay::keyboard(&window, on);
    // Remember what had the keyboard, to give it back when the menu closes (so the touch
    // keyboard the ring opens types into it).
    #[cfg(windows)]
    let ours = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(windows)]
    if on {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let front = unsafe { GetForegroundWindow() } as isize;
        if front != ours {
            PREVIOUS_FOCUS.store(front, std::sync::atomic::Ordering::Relaxed);
        }
    }
    let _ = window.set_focusable(on);
    if on {
        let _ = window.set_focus();
    }
    #[cfg(windows)]
    if !on {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};
        let front = unsafe { GetForegroundWindow() } as isize;
        let prev = PREVIOUS_FOCUS.swap(0, std::sync::atomic::Ordering::Relaxed);
        if prev != 0 && (front == ours || front == 0) {
            unsafe { SetForegroundWindow(prev as _) };
        }
    }
}

#[cfg(windows)]
static PREVIOUS_FOCUS: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

// The pet's window is as big as the screen. On Windows only these rectangles of it (physical
// pixels: left, top, right, bottom) take the mouse or a finger; None is all of it. A window
// region does what click-through by cursor position cannot: it also catches touch.
// Windows: a small see-through window over the blob that catches fingers (and the mouse over the
// blob), because the pet's own window is click-through and a touch cannot be made to cross
// that. It is owned by the pet window, so it always stays above it. Physical pixels; None hides it.
#[tauri::command]
fn touch_pad(app: AppHandle, rect: Option<[i32; 4]>) {
    #[cfg(windows)]
    if let Some(pad) = app.get_webview_window("touch") {
        if let Ok(hwnd) = pad.hwnd() {
            use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW};
            unsafe {
                match rect {
                    Some([x, y, w, h]) => {
                        SetWindowPos(hwnd.0 as _, HWND_TOPMOST, x, y, w.max(8), h.max(8), SWP_NOACTIVATE | SWP_SHOWWINDOW);
                    }
                    None => {
                        SetWindowPos(hwnd.0 as _, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_HIDEWINDOW);
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    let _ = (app, rect);
}

#[tauri::command]
fn hit_region(window: tauri::WebviewWindow, rects: Option<Vec<[i32; 4]>>) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows_sys::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR};
        unsafe {
            match rects {
                None => {
                    SetWindowRgn(hwnd.0 as _, std::ptr::null_mut(), 0);
                }
                Some(list) => {
                    let all = CreateRectRgn(0, 0, 0, 0);
                    for [l, t, r, b] in list {
                        let one = CreateRectRgn(l, t, r, b);
                        CombineRgn(all, all, one, RGN_OR);
                        DeleteObject(one as _);
                    }
                    SetWindowRgn(hwnd.0 as _, all, 0); // the window owns the region from here
                }
            }
        }
    }
    // A layer window (Linux): its input is exactly these rectangles, in CSS pixels, or all of it.
    // Touch lands on them as well as the mouse, and everything else reaches the desktop.
    #[cfg(target_os = "linux")]
    {
        let w = window.clone();
        let _ = window.run_on_main_thread(move || {
            use gtk::prelude::*;
            let Ok(gtk_window) = w.gtk_window() else { return };
            let Some(gdk) = gtk_window.window() else { return };
            // None is all of it: a rectangle bigger than any screen.
            let list = rects.unwrap_or_else(|| vec![[0, 0, 32767, 32767]]);
            let region = gtk::cairo::Region::create();
            for [l, t, rr, b] in list {
                let _ = region.union_rectangle(&gtk::cairo::RectangleInt::new(l, t, (rr - l).max(0), (b - t).max(0)));
            }
            gdk.input_shape_combine_region(&region, 0, 0);
        });
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    let _ = (window, rects);
}

// Page errors and notes, printed where `npm run dev` runs.
#[tauri::command]
fn log(window: tauri::WebviewWindow, text: String) {
    eprintln!("[{}] {}", window.label(), text);
}

fn panel(app: &AppHandle, page: &str) {
    let _ = app.emit_to("panel", "panel:toggle", page.to_string());
}

fn main() {
    #[cfg(target_os = "linux")]
    ctl::client();
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(sensors::start())
        .manage(files::Dropped::default())
        .invoke_handler(tauri::generate_handler![
            username,
            log,
            raise_pet,
            set_tray,
            tray_rect,
            autostart,
            quit_app,
            sensors::sensors,
            sensors::cursor,
            sensors::taskbar,
            sensors::shell_style,
            system::run_action,
            system::media,
            system::notify,
            system::load_state,
            system::save_state,
            system::save_picture,
            system::open_pictures,
            system::copy_picture,
            system::copy_text,
            system::open_url,
            system::latest_release,
            system::pick_colour,
            system::pixel_under_cursor,
            system::copy_png,
            files::offer_download,
            pet_focus,
            hit_region,
            touch_pad,
            show_tray,
            #[cfg(target_os = "linux")]
            overlay::panel_at,
            #[cfg(target_os = "linux")]
            overlay::panel_info,
            #[cfg(target_os = "linux")]
            overlay::bar_info,
            #[cfg(target_os = "linux")]
            overlay::cursor_logical,
            #[cfg(target_os = "linux")]
            keys::keys_taken,
            #[cfg(target_os = "linux")]
            keys::keys_apply,
            #[cfg(target_os = "linux")]
            overlay::panel_size,
            #[cfg(target_os = "linux")]
            overlay::pet_layer,
            #[cfg(target_os = "linux")]
            ctl::write_bar_file,
            files::file_action,
            files::file_bytes,
            files::write_beside,
        ])
        .on_window_event(files::on_window_event)
        .setup(|app| {
            // The pet's overlay covers the screen: let clicks through from the start, so nothing
            // is ever blocked even if its page fails. The page catches the mouse only over the blob.
            if let Some(pet) = app.get_webview_window("pet") {
                // On Linux the window has to exist on screen first (see overlay.rs).
                #[cfg(target_os = "linux")]
                overlay::prepare(&pet);
                let _ = pet.set_ignore_cursor_events(true);
                let _ = pet.set_focusable(false);
            }
            // The touch pad (see touch_pad): owned by the pet, never taking the focus.
            #[cfg(windows)]
            if let Some(pet) = app.get_webview_window("pet") {
                if let Ok(pad) = tauri::WebviewWindowBuilder::new(app, "touch", tauri::WebviewUrl::App("touch.html".into()))
                    .title("Blobble touch")
                    .inner_size(120.0, 120.0)
                    .decorations(false)
                    .transparent(true)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .shadow(false)
                    .visible(false)
                    .focused(false)
                    .parent(&pet)
                    .and_then(|b| b.build())
                {
                    let _ = pad.set_focusable(false);
                }
            }
            // On Omarchy the app brings its bar widget (see widget.rs).
            #[cfg(target_os = "linux")]
            widget::install();
            #[cfg(target_os = "linux")]
            ctl::serve(app.handle().clone());
            #[cfg(target_os = "linux")]
            events::start(app.handle().clone());
            #[cfg(target_os = "linux")]
            if let Some(panel) = app.get_webview_window("panel") {
                overlay::prepare_panel(&panel);
                // No input until the page says where the card is (see sendRegion in panel.js).
                let _ = panel.set_ignore_cursor_events(true);
            }
            let autostart = app.autolaunch().is_enabled().unwrap_or(false);
            let open = MenuItem::with_id(app, "open", "Open Blobble", true, None::<&str>)?;
            let pet = MenuItem::with_id(app, "pet", "Show or hide the pet", true, None::<&str>)?;
            let ring = MenuItem::with_id(app, "ring", "Open its ring", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let start = CheckMenuItem::with_id(app, "autostart", if cfg!(windows) { "Start with Windows" } else { "Start on login" }, true, autostart, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &pet, &ring, &settings, &sep, &start, &sep2, &quit])?;

            let start_item = start.clone();
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Blobble")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => panel(app, "blob"),
                    "settings" => panel(app, "settings"),
                    "pet" => {
                        let _ = app.emit_to("pet", "pet:toggle", ());
                    }
                    "ring" => {
                        let _ = app.emit_to("pet", "pet:ring", ());
                    }
                    "autostart" => {
                        let launcher = app.autolaunch();
                        let on = start_item.is_checked().unwrap_or(false);
                        let _ = if on { launcher.enable() } else { launcher.disable() };
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        panel(tray.app_handle(), "");
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Blobble");
}
