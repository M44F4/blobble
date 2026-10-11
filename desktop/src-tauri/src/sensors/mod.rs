// What the pet can feel. Slow sensors run on their own thread and the pet page polls a
// snapshot; the cursor has its own quick command because the page asks for it often.
// How each OS reads things lives in its own file: win.rs, linux.rs, fallback.rs (not done yet).
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};
#[cfg(target_os = "linux")]
use tauri::Manager;

#[cfg(windows)]
mod win;
#[cfg(windows)]
use win as os;
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "linux")]
use linux as os;
#[cfg(not(any(windows, target_os = "linux")))]
mod fallback;
#[cfg(not(any(windows, target_os = "linux")))]
use fallback as os;

#[derive(Serialize, Clone, Default)]
pub struct Music {
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub player: String,
}

#[derive(Serialize, Clone, Default)]
pub struct Download {
    path: String,
    at: f64,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Slow {
    cpu: f64,
    ram: f64,
    music: Music,
    online: bool,
    disk_percent: f64,
    // CPU temperature in degrees, and the power profile ("performance", "balanced", "power-saver"); none where the OS gives neither.
    temp: Option<f64>,
    power_profile: String,
    coding: bool,
    fullscreen: bool,
    accent: String,
    dark: bool,
    download: Download,
}

#[derive(Serialize)]
pub struct Battery {
    pub present: bool,
    pub percent: u8,
    pub charging: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sensors {
    idle_ms: u32,
    battery: Option<Battery>,
    #[serde(flatten)]
    slow: Slow,
}

pub type Shared = Arc<Mutex<Slow>>;

#[tauri::command]
pub fn sensors(shared: State<Shared>) -> Sensors {
    let slow = shared.lock().map(|s| s.clone()).unwrap_or_default();
    Sensors { idle_ms: os::idle_ms(), battery: os::battery(), slow }
}

// The cursor in physical screen pixels, and whether the main mouse button is down. Read from
// the OS itself where it can, so dragging the pet keeps working over the taskbar and at screen edges.
// Wayland gives no cursor outside our own windows, so Hyprland is asked; the button is then
// unknown (reported as down) and the page lets go on its own mouseup.
#[tauri::command]
pub fn cursor(app: AppHandle) -> Option<(f64, f64, bool)> {
    #[cfg(target_os = "linux")]
    if let Some((x, y)) = linux::hypr_cursor() {
        let (x, y) = from_logical(&app, x, y)?;
        return Some((x, y, true));
    }
    let p = app.cursor_position().ok()?;
    Some((p.x, p.y, os::main_button_down()))
}

// Logical pixels relative to the screen (as Hyprland gives them) to the physical pixels the
// page gets from the OS everywhere else, using the same monitor the page measures.
#[cfg(target_os = "linux")]
fn from_logical(app: &AppHandle, x: f64, y: f64) -> Option<(f64, f64)> {
    // Wayland has no primary monitor: then the one the pet's overlay is on.
    let m = match app.primary_monitor().ok().flatten() {
        Some(m) => m,
        None => app.get_webview_window("pet")?.current_monitor().ok()??,
    };
    let sf = m.scale_factor();
    Some((m.position().x as f64 + x * sf, m.position().y as f64 + y * sf))
}

// The Downloads folder, where the pet looks for new files.
pub fn downloads_dir() -> Option<std::path::PathBuf> {
    os::downloads_dir()
}

// Where the taskbar and its notification area (tray icons and clock) are, in physical pixels:
// [x, y, width, height] each, so the pet can sit in the taskbar beside the tray. None where
// the OS does not say.
#[tauri::command]
pub fn taskbar(app: AppHandle) -> Option<((i32, i32, i32, i32), Option<(i32, i32, i32, i32)>)> {
    #[cfg(target_os = "linux")]
    if let Some((x, y, w, h)) = linux::hypr_bar() {
        let (x0, y0) = from_logical(&app, x, y)?;
        let (x1, y1) = from_logical(&app, x + w, y + h)?;
        return Some(((x0 as i32, y0 as i32, (x1 - x0) as i32, (y1 - y0) as i32), None));
    }
    let _ = app;
    os::taskbar()
}

// Omarchy's look (see linux::shell_style); nothing on any other desktop.
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn shell_style() -> Option<serde_json::Value> {
    linux::shell_style()
}
#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub fn shell_style() -> Option<String> {
    None
}

pub fn start() -> Shared {
    let shared: Shared = Arc::new(Mutex::new(Slow { online: true, ..Default::default() }));
    let out = shared.clone();
    std::thread::spawn(move || {
        os::init_thread();
        let mut cpu = os::Cpu::default();
        let mut music = os::MusicReader::default();
        let downloads = os::downloads_dir();
        let mut tick: u64 = 0;
        loop {
            let load = cpu.sample();
            let track = music.read();
            let (accent, dark) = os::theme();
            let mut next = out.lock().map(|s| s.clone()).unwrap_or_default();
            next.cpu = load;
            next.ram = os::ram();
            next.music = track;
            let (fullscreen, coding) = os::focus();
            next.coding = coding;
            next.fullscreen = fullscreen;
            next.accent = accent;
            next.dark = dark;
            if tick % 2 == 0 {
                if let Some(d) = newest_download(&downloads) {
                    next.download = d;
                }
            }
            if tick % 5 == 0 {
                next.online = os::online();
                next.temp = os::temp();
            }
            if tick % 10 == 0 {
                next.power_profile = os::power_profile();
            }
            if tick % 60 == 0 {
                next.disk_percent = os::disk_percent();
            }
            if let Ok(mut s) = out.lock() {
                *s = next;
            }
            tick += 1;
            std::thread::sleep(Duration::from_secs(1));
        }
    });
    shared
}

// The newest finished file in Downloads, so the pet can cheer when one lands.
fn newest_download(dir: &Option<std::path::PathBuf>) -> Option<Download> {
    let dir = dir.as_ref()?;
    let mut best: Option<(SystemTime, std::path::PathBuf)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.starts_with('.') || [".crdownload", ".part", ".tmp", ".partial", ".download"].iter().any(|s| name.ends_with(s)) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let Ok(when) = meta.created().or_else(|_| meta.modified()) else { continue };
        if best.as_ref().map_or(true, |(t, _)| when > *t) {
            best = Some((when, path));
        }
    }
    best.map(|(t, p)| Download {
        path: p.to_string_lossy().into_owned(),
        at: t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0),
    })
}

// "Spotify.exe" or "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" -> "Spotify".
pub(crate) fn player_name(id: &str) -> String {
    let tail = id.rsplit(['!', '\\']).next().unwrap_or(id);
    let name = tail.trim_end_matches(".exe").trim_end_matches(".EXE");
    let name = name.split('.').last().unwrap_or(name);
    if name.eq_ignore_ascii_case("msedge") { "Edge".into() }
    else if name.eq_ignore_ascii_case("chrome") { "Chrome".into() }
    else if name.eq_ignore_ascii_case("firefox") { "Firefox".into() }
    else { name.to_string() }
}
