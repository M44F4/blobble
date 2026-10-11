// What the pet can feel on Linux. Everything here works the same on every distro: the
// kernel's files, and the standard D-Bus services (MPRIS, NetworkManager, the XDG portal).
// Desktop specific bits (Hyprland for now) are marked as such.
use super::{player_name, Battery, Music};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::OwnedValue;

fn session() -> Option<&'static Connection> {
    static BUS: OnceLock<Option<Connection>> = OnceLock::new();
    BUS.get_or_init(|| Connection::session().ok()).as_ref()
}

fn system_bus() -> Option<&'static Connection> {
    static BUS: OnceLock<Option<Connection>> = OnceLock::new();
    BUS.get_or_init(|| Connection::system().ok()).as_ref()
}

// Linux has no common way to ask, so "down": the page lets go on its own mouseup, which the
// overlay gets because it holds the pointer while the blob is held.
pub(super) fn main_button_down() -> bool {
    true
}

// The bar is known on Hyprland only (see hypr_bar); elsewhere the pet uses the work area.
pub(super) fn taskbar() -> Option<((i32, i32, i32, i32), Option<(i32, i32, i32, i32)>)> {
    None
}

pub(super) fn init_thread() {
    idle_watch();
}

// --- Hyprland (desktop specific) -----------------------------------------------------------

// One request on Hyprland's socket, the same thing `hyprctl` does without starting a process,
// so the cursor can be asked for many times a second.
pub fn hypr_raw(request: &str) -> Option<String> {
    let sig = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;
    let dir = std::env::var("XDG_RUNTIME_DIR").ok()?;
    let mut sock = UnixStream::connect(format!("{dir}/hypr/{sig}/.socket.sock")).ok()?;
    sock.set_read_timeout(Some(Duration::from_millis(500))).ok()?;
    sock.write_all(request.as_bytes()).ok()?;
    let mut out = String::new();
    sock.read_to_string(&mut out).ok()?;
    Some(out)
}

pub fn hypr(request: &str) -> Option<serde_json::Value> {
    serde_json::from_str(&hypr_raw(&format!("j/{request}"))?).ok()
}

// The focused monitor: origin and size in Hyprland's logical pixels, and the space bars
// reserve on it as [left, top, right, bottom].
pub struct HyprMonitor {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub reserved: [f64; 4],
}

pub fn hypr_monitor() -> Option<HyprMonitor> {
    monitor_from(&hypr("monitors")?)
}

// The focused one of Hyprland's `monitors` list.
fn monitor_from(list: &serde_json::Value) -> Option<HyprMonitor> {
    let m = list.as_array()?.iter().find(|m| m["focused"].as_bool() == Some(true))?;
    let num = |v: &serde_json::Value| v.as_f64().unwrap_or(0.0);
    let scale = m["scale"].as_f64().filter(|s| *s > 0.0).unwrap_or(1.0);
    // Rotated monitors swap width and height.
    let turned = m["transform"].as_i64().unwrap_or(0) % 2 == 1;
    let (pw, ph) = (num(&m["width"]), num(&m["height"]));
    let (pw, ph) = if turned { (ph, pw) } else { (pw, ph) };
    let r = m["reserved"].as_array().map(|r| r.iter().map(num).collect::<Vec<_>>()).unwrap_or_default();
    Some(HyprMonitor {
        x: num(&m["x"]),
        y: num(&m["y"]),
        w: (pw / scale).round(),
        h: (ph / scale).round(),
        reserved: [0, 1, 2, 3].map(|i| r.get(i).copied().unwrap_or(0.0)),
    })
}

// The cursor, relative to the focused monitor, in logical pixels.
pub fn hypr_cursor() -> Option<(f64, f64)> {
    let c = hypr("cursorpos")?;
    let m = hypr_monitor()?;
    Some((c["x"].as_f64()? - m.x, c["y"].as_f64()? - m.y))
}

// The bar (Waybar and friends) is whichever side reserves the most room, relative to the
// focused monitor in logical pixels: [x, y, width, height].
pub fn hypr_bar() -> Option<(f64, f64, f64, f64)> {
    let m = hypr_monitor()?;
    let [l, t, r, b] = m.reserved;
    let most = l.max(t).max(r).max(b);
    if most <= 0.0 {
        return None;
    }
    Some(if most == t { (0.0, 0.0, m.w, t) }
        else if most == b { (0.0, m.h - b, m.w, b) }
        else if most == l { (0.0, 0.0, l, m.h) }
        else { (m.w - r, 0.0, r, m.h) })
}

// --- idle --------------------------------------------------------------------------------------

// When input stopped, in ms since the epoch: 0 while active, u64::MAX until Wayland says.
static IDLE_SINCE: AtomicU64 = AtomicU64::new(u64::MAX);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

// Wayland's idle protocol (ext-idle-notify), which Hyprland, Sway, KDE and most wlroots
// desktops have: told once a second of quiet has passed, and again when input comes back.
fn idle_watch() {
    use wayland_client::globals::{registry_queue_init, GlobalListContents};
    use wayland_client::protocol::{wl_registry, wl_seat};
    use wayland_client::{Connection, Dispatch, QueueHandle};
    use wayland_protocols::ext::idle_notify::v1::client::{ext_idle_notification_v1 as note, ext_idle_notifier_v1 as notifier};

    struct Idle;
    impl Dispatch<wl_registry::WlRegistry, GlobalListContents> for Idle {
        fn event(_: &mut Self, _: &wl_registry::WlRegistry, _: wl_registry::Event, _: &GlobalListContents, _: &Connection, _: &QueueHandle<Self>) {}
    }
    impl Dispatch<wl_seat::WlSeat, ()> for Idle {
        fn event(_: &mut Self, _: &wl_seat::WlSeat, _: wl_seat::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
    }
    impl Dispatch<notifier::ExtIdleNotifierV1, ()> for Idle {
        fn event(_: &mut Self, _: &notifier::ExtIdleNotifierV1, _: notifier::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
    }
    impl Dispatch<note::ExtIdleNotificationV1, ()> for Idle {
        fn event(_: &mut Self, _: &note::ExtIdleNotificationV1, event: note::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
            let since = match event {
                note::Event::Idled => now_ms().saturating_sub(1000),
                _ => 0,
            };
            IDLE_SINCE.store(since, Ordering::Relaxed);
        }
    }

    std::thread::spawn(|| {
        let Ok(conn) = Connection::connect_to_env() else { return };
        let Ok((globals, mut queue)) = registry_queue_init::<Idle>(&conn) else { return };
        let qh = queue.handle();
        let (Ok(seat), Ok(watch)) = (
            globals.bind::<wl_seat::WlSeat, _, _>(&qh, 1..=1, ()),
            globals.bind::<notifier::ExtIdleNotifierV1, _, _>(&qh, 1..=1, ()),
        ) else { return };
        watch.get_idle_notification(1000, &seat, &qh, ());
        IDLE_SINCE.store(0, Ordering::Relaxed);
        while queue.blocking_dispatch(&mut Idle).is_ok() {}
        IDLE_SINCE.store(u64::MAX, Ordering::Relaxed);
    });
}

// How long since the last input: from Wayland's idle protocol where there is one, else from
// GNOME (Mutter) or KDE (ScreenSaver) over D-Bus; 0 when nobody says, so the pet stays awake.
pub(super) fn idle_ms() -> u32 {
    match IDLE_SINCE.load(Ordering::Relaxed) {
        u64::MAX => {}
        0 => return 0,
        since => return now_ms().saturating_sub(since).min(u32::MAX as u64) as u32,
    }
    let Some(bus) = session() else { return 0 };
    let mutter = bus
        .call_method(Some("org.gnome.Mutter.IdleMonitor"), "/org/gnome/Mutter/IdleMonitor/Core",
            Some("org.gnome.Mutter.IdleMonitor"), "GetIdletime", &())
        .ok()
        .and_then(|m| m.body().deserialize::<u64>().ok());
    if let Some(ms) = mutter {
        return ms.min(u32::MAX as u64) as u32;
    }
    bus.call_method(Some("org.freedesktop.ScreenSaver"), "/org/freedesktop/ScreenSaver",
            Some("org.freedesktop.ScreenSaver"), "GetSessionIdleTime", &())
        .ok()
        .and_then(|m| m.body().deserialize::<u32>().ok())
        .unwrap_or(0)
}

fn read(path: impl AsRef<std::path::Path>) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

pub(super) fn battery() -> Option<Battery> {
    let mut ac = false;
    let mut found = None;
    for entry in std::fs::read_dir("/sys/class/power_supply").ok()?.flatten() {
        let dir = entry.path();
        match read(dir.join("type")).as_deref() {
            Some("Mains") => ac |= read(dir.join("online")).as_deref() == Some("1"),
            // Skip mice and headsets: they are batteries too, but with scope "Device".
            Some("Battery") if read(dir.join("scope")).as_deref() != Some("Device") => {
                let percent = read(dir.join("capacity")).and_then(|s| s.parse::<u8>().ok()).unwrap_or(0).min(100);
                let status = read(dir.join("status")).unwrap_or_default();
                found.get_or_insert((percent, status));
            }
            _ => {}
        }
    }
    let (percent, status) = found?;
    Some(Battery { present: true, percent, charging: status == "Charging" || status == "Full" || ac })
}

pub(super) fn ram() -> f64 {
    let Some(info) = read("/proc/meminfo") else { return 0.0 };
    let field = |name: &str| info.lines().find(|l| l.starts_with(name))
        .and_then(|l| l.split_whitespace().nth(1)).and_then(|v| v.parse::<f64>().ok());
    match (field("MemTotal:"), field("MemAvailable:")) {
        (Some(total), Some(avail)) if total > 0.0 => 100.0 * (1.0 - avail / total),
        _ => 0.0,
    }
}

// CPU use from the change in /proc/stat between two samples.
#[derive(Default)]
pub(super) struct Cpu {
    last: Option<(u64, u64)>, // (idle, total)
}

impl Cpu {
    pub(super) fn sample(&mut self) -> f64 {
        let Some(stat) = read("/proc/stat") else { return 0.0 };
        let nums: Vec<u64> = stat.lines().next().unwrap_or("").split_whitespace().skip(1)
            .filter_map(|v| v.parse().ok()).collect();
        if nums.len() < 4 {
            return 0.0;
        }
        let idle = nums[3] + nums.get(4).copied().unwrap_or(0); // idle + iowait
        let now = (idle, nums.iter().take(8).sum::<u64>());
        let pct = match self.last {
            Some((i0, t0)) if now.1 > t0 => 100.0 * (1.0 - (now.0 - i0) as f64 / (now.1 - t0) as f64),
            _ => 0.0,
        };
        self.last = Some(now);
        pct.clamp(0.0, 100.0)
    }
}

// Media players on the session bus (MPRIS), the one playing first.
fn players() -> Vec<String> {
    let Some(bus) = session() else { return vec![] };
    let names = bus
        .call_method(Some("org.freedesktop.DBus"), "/org/freedesktop/DBus", Some("org.freedesktop.DBus"), "ListNames", &())
        .ok()
        .and_then(|m| m.body().deserialize::<Vec<String>>().ok())
        .unwrap_or_default();
    let mut list: Vec<String> = names.into_iter().filter(|n| n.starts_with("org.mpris.MediaPlayer2.")).collect();
    list.sort_by_key(|n| status(n) != "Playing");
    list
}

fn player(name: &str, iface: &'static str) -> Option<Proxy<'static>> {
    Proxy::new(session()?, name.to_string(), "/org/mpris/MediaPlayer2", iface).ok()
}

fn status(name: &str) -> String {
    player(name, "org.mpris.MediaPlayer2.Player")
        .and_then(|p| p.get_property::<String>("PlaybackStatus").ok())
        .unwrap_or_default()
}

#[derive(Default)]
pub(super) struct MusicReader;

impl MusicReader {
    pub(super) fn read(&mut self) -> Music {
        let Some(name) = players().into_iter().next() else { return Music::default() };
        let Some(p) = player(&name, "org.mpris.MediaPlayer2.Player") else { return Music::default() };
        let meta: HashMap<String, OwnedValue> = p.get_property("Metadata").unwrap_or_default();
        let text = |key: &str| meta.get(key).and_then(|v| String::try_from(v.try_clone().ok()?).ok()).unwrap_or_default();
        let artist = meta.get("xesam:artist")
            .and_then(|v| Vec::<String>::try_from(v.try_clone().ok()?).ok())
            .map(|a| a.join(", "))
            .unwrap_or_default();
        let identity = player(&name, "org.mpris.MediaPlayer2")
            .and_then(|p| p.get_property::<String>("Identity").ok())
            .unwrap_or_else(|| player_name(name.trim_start_matches("org.mpris.MediaPlayer2.")));
        Music {
            playing: p.get_property::<String>("PlaybackStatus").map(|s| s == "Playing").unwrap_or(false),
            title: text("xesam:title"),
            artist,
            player: identity,
        }
    }
}

// Previous, play/pause and next on the player that is playing (or the first one).
pub fn media(action: &str) {
    let Some(name) = players().into_iter().next() else { return };
    let method = match action { "prev" => "Previous", "next" => "Next", _ => "PlayPause" };
    if let Some(p) = player(&name, "org.mpris.MediaPlayer2.Player") {
        let _ = p.call_method(method, &());
    }
}

// NetworkManager's own connectivity check: 4 is full internet, 3 limited. Without
// NetworkManager, assume online rather than look sad for no reason.
pub(super) fn online() -> bool {
    let Some(bus) = system_bus() else { return true };
    Proxy::new(bus, "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager")
        .and_then(|p| p.get_property::<u32>("Connectivity"))
        .map(|c| c == 0 || c >= 3) // 0: NetworkManager does not know
        .unwrap_or(true)
}

// How full the root disk is, in percent.
// The CPU's temperature in degrees: the first of the usual hwmon chips that has one.
pub(super) fn temp() -> Option<f64> {
    for chip in ["k10temp", "coretemp", "zenpower", "cpu_thermal", "acpitz"] {
        for entry in std::fs::read_dir("/sys/class/hwmon").ok()?.flatten() {
            let dir = entry.path();
            if read(dir.join("name")).map(|n| n.trim() == chip).unwrap_or(false) {
                if let Some(milli) = read(dir.join("temp1_input")).and_then(|t| t.trim().parse::<f64>().ok()) {
                    return Some(milli / 1000.0);
                }
            }
        }
    }
    None
}

// "performance", "balanced" or "power-saver" from power-profiles-daemon; empty without it.
pub(super) fn power_profile() -> String {
    std::process::Command::new("powerprofilesctl").arg("get").output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
}

pub(super) fn disk_percent() -> f64 {
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c"/".as_ptr(), &mut s) } != 0 || s.f_blocks == 0 {
        return 0.0;
    }
    100.0 * (1.0 - s.f_bfree as f64 / s.f_blocks as f64)
}

// Dark mode and accent colour from the XDG desktop portal, which every desktop provides.
pub(super) fn theme() -> (String, bool) {
    if let Some(c) = omarchy_colors() {
        if let Some(accent) = c.get("accent") {
            return (accent.clone(), c.get("mode").map_or(true, |m| m != "light"));
        }
    }
    let fallback = || ("#7aa2f7".to_string(), true);
    let Some(bus) = session() else { return fallback() };
    let setting = |key: &str| -> Option<OwnedValue> {
        bus.call_method(Some("org.freedesktop.portal.Desktop"), "/org/freedesktop/portal/desktop",
                Some("org.freedesktop.portal.Settings"), "ReadOne", &("org.freedesktop.appearance", key))
            .ok()?
            .body()
            .deserialize::<OwnedValue>()
            .ok()
    };
    // 1 dark, 2 light, 0 no preference (treated as dark, like the rest of the app).
    let dark = setting("color-scheme").and_then(|v| u32::try_from(v).ok()).map(|v| v != 2).unwrap_or(true);
    let accent = setting("accent-color")
        .and_then(|v| <(f64, f64, f64)>::try_from(v).ok())
        .filter(|(r, g, b)| [r, g, b].iter().all(|c| (0.0..=1.0).contains(*c)))
        .map(|(r, g, b)| format!("#{:02x}{:02x}{:02x}", (r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8))
        .unwrap_or_else(|| fallback().0);
    (accent, dark)
}

// Omarchy's current theme palette (colors.toml: `key = "value"` lines), None elsewhere.
fn omarchy_colors() -> Option<HashMap<String, String>> {
    let home = PathBuf::from(std::env::var("HOME").ok()?);
    let state = std::env::var("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".local/state"));
    let text = read(state.join("omarchy/current/theme/colors.toml"))?;
    Some(text.lines().filter_map(|l| {
        let (k, v) = l.split_once('=')?;
        Some((k.trim().to_string(), v.trim().trim_matches('"').to_string()))
    }).collect())
}

// `base-size` under [font] in a shell.toml.
fn font_size_in(text: &str) -> Option<f64> {
    let mut in_font = false;
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with('[') {
            in_font = l == "[font]";
        } else if in_font && l.starts_with("base-size") {
            return l.split_once('=')?.1.split('#').next()?.trim().parse::<f64>().ok();
        }
    }
    None
}

// What makes the panel look at home on Omarchy, like OmaBlob's popup: the theme's colours,
// Hyprland's corner rounding and border width, and the system monospace font. None elsewhere.
pub(super) fn shell_style() -> Option<serde_json::Value> {
    let c = omarchy_colors()?;
    let opt = |name: &str| hypr(&format!("getoption {name}")).and_then(|v| v["int"].as_i64());
    let colour = |k: &str| c.get(k).cloned();
    // The shell's text size: `base-size` under [font] in the user's shell.toml, else the theme's, else 12.
    let font_size = {
        let home = PathBuf::from(std::env::var("HOME").ok()?);
        let state = std::env::var("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".local/state"));
        let config = std::env::var("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".config"));
        [config.join("omarchy/shell.toml"), state.join("omarchy/current/theme/shell.toml")]
            .iter()
            .find_map(|f| font_size_in(&read(f.clone())?))
            .unwrap_or(12.0)
    };
    Some(serde_json::json!({
        "background": colour("background"),
        "foreground": colour("foreground"),
        "accent": colour("accent"),
        "urgent": colour("red"),
        "radius": opt("decoration:rounding").unwrap_or(0),
        "border": opt("general:border_size").unwrap_or(2),
        "fontSize": font_size,
    }))
}

// The XDG downloads folder (from user-dirs.dirs), or ~/Downloads.
pub(super) fn downloads_dir() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var("HOME").ok()?);
    let config = std::env::var("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".config"));
    let from_dirs = read(config.join("user-dirs.dirs")).and_then(|text| {
        let line = text.lines().find(|l| l.starts_with("XDG_DOWNLOAD_DIR="))?;
        let value = line.split_once('=')?.1.trim_matches('"');
        Some(PathBuf::from(value.replace("$HOME", &home.to_string_lossy())))
    });
    Some(from_dirs.unwrap_or_else(|| home.join("Downloads")))
}

// Fullscreen and code editor in front. Hyprland only for now (desktop specific).
pub(super) fn focus() -> (bool, bool) {
    let Some(w) = hypr("activewindow") else { return (false, false) };
    let fullscreen = match &w["fullscreen"] {
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0) > 0,
        _ => false,
    };
    let class = w["class"].as_str().unwrap_or("").to_lowercase();
    let title = w["title"].as_str().unwrap_or("").to_lowercase();
    (fullscreen, is_editor(&class, &title))
}

const EDITORS: &[&str] = &[
    "code", "code-oss", "code-insiders", "vscodium", "codium", "cursor", "windsurf", "zed", "dev.zed.zed",
    "sublime_text", "neovide", "emacs", "org.kde.kate", "kate", "gnome-builder", "org.gnome.builder",
    "jetbrains-idea", "jetbrains-pycharm", "jetbrains-webstorm", "jetbrains-clion", "jetbrains-rider",
    "jetbrains-goland", "jetbrains-phpstorm", "jetbrains-rustrover", "jetbrains-studio", "jetbrains-fleet",
];
const TERMINALS: &[&str] = &[
    "alacritty", "kitty", "foot", "ghostty", "com.mitchellh.ghostty", "org.wezfurlong.wezterm", "wezterm",
    "org.gnome.console", "org.gnome.terminal", "gnome-terminal-server", "konsole", "org.kde.konsole",
    "xterm", "tilix", "terminator",
];

// A code editor, or Vim and friends in a terminal (the title says so).
pub(crate) fn is_editor(class: &str, title: &str) -> bool {
    EDITORS.contains(&class)
        || (TERMINALS.contains(&class)
            && title.split(|c: char| !c.is_alphanumeric()).any(|w| ["vim", "nvim", "hx", "helix", "emacs", "nano", "micro"].contains(&w)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editors_and_vim_in_terminals() {
        assert!(is_editor("code", ""));
        assert!(is_editor("alacritty", "nvim ~/notes.md"));
        assert!(!is_editor("alacritty", "btop"));
        assert!(!is_editor("firefox", "vim tips - search"));
    }

    #[test]
    fn font_size_comes_from_the_font_section() {
        let toml = "[bar]\nbase-size = 99\n[font]\nfamily = \"x\"\nbase-size = 13.5   # px\n[other]\nbase-size = 7\n";
        assert_eq!(font_size_in(toml), Some(13.5));
        assert_eq!(font_size_in("[bar]\nbase-size = 9\n"), None);
        assert_eq!(font_size_in("[font]\nbase-size = big\n"), None);
    }

    #[test]
    fn the_focused_monitor_in_logical_pixels() {
        let list = serde_json::json!([
            { "focused": false, "x": 0, "y": 0, "width": 800, "height": 600, "scale": 1.0 },
            { "focused": true, "x": 1280, "y": 0, "width": 1920, "height": 1080, "scale": 1.5, "transform": 0, "reserved": [0, 26, 0, 0] }
        ]);
        let m = monitor_from(&list).unwrap();
        assert_eq!((m.x, m.y, m.w, m.h), (1280.0, 0.0, 1280.0, 720.0));
        assert_eq!(m.reserved, [0.0, 26.0, 0.0, 0.0]);
        assert!(monitor_from(&serde_json::json!([{ "focused": false }])).is_none());
    }

    #[test]
    fn a_turned_monitor_swaps_width_and_height() {
        let list = serde_json::json!([{ "focused": true, "x": 0, "y": 0, "width": 1920, "height": 1080, "scale": 1.0, "transform": 1 }]);
        let m = monitor_from(&list).unwrap();
        assert_eq!((m.w, m.h), (1080.0, 1920.0));
    }

    // Reads this machine; values only need to be in range. Run with --nocapture to see them.
    #[test]
    fn reads_this_machine() {
        let mut cpu = Cpu::default();
        cpu.sample();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let load = cpu.sample();
        let ram = ram();
        let disk = disk_percent();
        assert!((0.0..=100.0).contains(&load) && ram > 0.0 && ram <= 100.0 && disk > 0.0 && disk <= 100.0);
        let music = MusicReader.read();
        println!("cpu {load:.0}% ram {ram:.0}% disk {disk:.0}% idle {}ms online {} theme {:?} focus {:?} downloads {:?}",
            idle_ms(), online(), theme(), focus(), downloads_dir());
        println!("battery {:?}", battery().map(|b| (b.percent, b.charging)));
        println!("music {} {:?} by {:?} on {:?}", music.playing, music.title, music.artist, music.player);
    }
}
