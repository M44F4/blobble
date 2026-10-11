// What happens on a Linux desktop that the blob reacts to, sent to the pet's page as "blob:event":
// Hyprland's event socket (a workspace change, a window opening or closing, one asking for you,
// a screen recording) and Omarchy's notification toasts. Only Hyprland and Omarchy are read so
// far; on another desktop nothing is sent and those reactions are marked "not on Linux yet".
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

fn emit(app: &AppHandle, event: Value) {
    let _ = app.emit_to("pet", "blob:event", event);
}

pub fn start(app: AppHandle) {
    let a = app.clone();
    std::thread::spawn(move || hyprland(a));
    let a = app.clone();
    std::thread::spawn(move || privacy(a));
    let a = app.clone();
    std::thread::spawn(move || toasts(a));
    std::thread::spawn(move || updates(app));
}

fn home() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

fn hyprland(app: AppHandle) {
    let (Ok(sig), Ok(dir)) = (std::env::var("HYPRLAND_INSTANCE_SIGNATURE"), std::env::var("XDG_RUNTIME_DIR")) else { return };
    let path = format!("{dir}/hypr/{sig}/.socket2.sock");
    let mut workspace: i64 = 0;
    let mut last_window = Instant::now() - Duration::from_secs(10);
    let mut urgent: HashSet<String> = HashSet::new();
    loop {
        if let Ok(stream) = UnixStream::connect(&path) {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                let Some((name, data)) = line.split_once(">>") else { continue };
                match name {
                    "workspacev2" => {
                        let id: i64 = data.split(',').next().and_then(|v| v.parse().ok()).unwrap_or(0);
                        if id > 0 {
                            if workspace > 0 && id != workspace {
                                emit(&app, json!({ "kind": "workspace", "dir": if id < workspace { -1 } else { 1 } }));
                            }
                            workspace = id;
                        }
                    }
                    "openwindow" | "closewindow" => {
                        if name == "closewindow" && urgent.remove(data) {
                            emit(&app, json!({ "kind": "attention", "on": !urgent.is_empty() }));
                        }
                        // A glance for a window opening, a wink for one closing, at most every 2.5 s.
                        if last_window.elapsed() < Duration::from_millis(2500) {
                            continue;
                        }
                        last_window = Instant::now();
                        if name == "closewindow" {
                            emit(&app, json!({ "kind": "windowClose" }));
                        } else {
                            let app = app.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(150));
                                emit(&app, json!({ "kind": "windowOpen", "dir": landed() }));
                            });
                        }
                    }
                    // A window asks for you (a terminal bell, a finished download, a dialog behind).
                    "urgent" => {
                        urgent.insert(data.to_string());
                        emit(&app, json!({ "kind": "attention", "on": true }));
                    }
                    "activewindowv2" => {
                        if urgent.remove(data) {
                            emit(&app, json!({ "kind": "attention", "on": !urgent.is_empty() }));
                        }
                    }
                    "screencast" => emit(&app, json!({ "kind": "screencast", "on": data.starts_with('1') })),
                    // Hyprland dropped the shortcuts we added: the page binds them again.
                    "configreloaded" => emit(&app, json!({ "kind": "configreloaded" })),
                    _ => {}
                }
            }
        }
        std::thread::sleep(Duration::from_secs(3));
    }
}

// Which way the window that just opened landed: -1 (left) to 1 (right) across the monitor.
fn landed() -> f64 {
    let (Some(w), Some(m)) = (crate::sensors::linux::hypr("activewindow"), crate::sensors::linux::hypr_monitor()) else { return 0.0 };
    let (at, size) = (w["at"].as_array(), w["size"].as_array());
    match (at, size) {
        (Some(at), Some(size)) => {
            let mid = at[0].as_f64().unwrap_or(0.0) + size[0].as_f64().unwrap_or(0.0) / 2.0 - m.x;
            ((mid - m.w / 2.0) / (m.w / 3.0)).clamp(-1.0, 1.0)
        }
        _ => 0.0,
    }
}

// Omarchy writes one file per toast on screen and none during Do Not Disturb, so a new file in
// its folder is exactly "a notification just popped up".
fn toasts(app: AppHandle) {
    let Some(dir) = home().map(|h| h.join(".local/state/omarchy/notifications")) else { return };
    let list = |dir: &PathBuf| -> HashSet<PathBuf> {
        std::fs::read_dir(dir).map(|d| d.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "json")).collect()).unwrap_or_default()
    };
    let mut seen = list(&dir);
    let started = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(400));
        let now = list(&dir);
        let fresh: Vec<&PathBuf> = now.iter().filter(|p| !seen.contains(*p)).collect();
        if started.elapsed() > Duration::from_secs(3) && !fresh.is_empty() {
            let newest = fresh.iter().max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
            let urgency = newest
                .and_then(|p| std::fs::read_to_string(p).ok())
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                .and_then(|v| v["urgency"].as_i64())
                .unwrap_or(1);
            emit(&app, json!({ "kind": if urgency == 2 { "critical" } else { "notify" } }));
        }
        seen = now;
    }
}

// Omarchy's own check for updates, now and every six hours: a parcel when some are ready.
fn updates(app: AppHandle) {
    std::thread::sleep(Duration::from_secs(20));
    loop {
        let out = std::process::Command::new("omarchy-update-available").output();
        if let Ok(o) = out {
            let ok = o.status.success();
            let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let detail = text.split_once(' ').map(|(_, rest)| rest.to_string()).unwrap_or_default();
            emit(&app, json!({ "kind": "updates", "on": ok, "detail": if ok { detail } else { String::new() } }));
        }
        std::thread::sleep(Duration::from_secs(6 * 3600));
    }
}

// The microphone or a camera in use, or a screen recorder running: the blob wears a red dot. Read
// from PipeWire (a running capture stream that is not a monitor or a level meter) every few
// seconds; the screen is also Hyprland's screencast event and gpu-screen-recorder.
fn privacy(app: AppHandle) {
    let mut last = (false, false, false);
    loop {
        std::thread::sleep(Duration::from_secs(3));
        let Ok(out) = std::process::Command::new("pw-dump").output() else { continue };
        let Ok(nodes) = serde_json::from_slice::<Vec<Value>>(&out.stdout) else { continue };
        let (mut mic, mut camera) = (false, false);
        for n in &nodes {
            if n["type"] != "PipeWire:Interface:Node" || n["info"]["state"] != "running" {
                continue;
            }
            let props = &n["info"]["props"];
            let class = props["media.class"].as_str().unwrap_or("");
            let listens = props["stream.capture.sink"] != "true"
                && props["stream.monitor"] != "true"
                && !props["media.name"].as_str().unwrap_or("").to_lowercase().contains("peak detect");
            if !listens {
                continue;
            }
            if class == "Stream/Input/Audio" {
                mic = true;
            } else if class == "Stream/Input/Video" {
                camera = true;
            }
        }
        // A muted microphone is not listening.
        if mic {
            let muted = std::process::Command::new("wpctl").args(["get-volume", "@DEFAULT_AUDIO_SOURCE@"]).output()
                .map(|o| String::from_utf8_lossy(&o.stdout).contains("MUTED")).unwrap_or(false);
            mic = !muted;
        }
        let recorder = std::process::Command::new("pgrep").args(["--quiet", "-f", "^gpu-screen-recorder"]).status().map(|s| s.success()).unwrap_or(false);
        let now = (mic, camera, recorder);
        if now != last {
            last = now;
            emit(&app, json!({ "kind": "privacy", "mic": mic, "camera": camera, "recorder": recorder }));
        }
    }
}
