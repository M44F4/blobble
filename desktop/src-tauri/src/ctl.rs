// The side door for Omarchy's bar plugin (omarchy/m44f4.blobble). The plugin is a real bar
// widget, so it owns the blob's slot, moves with the bar's layout and follows the bar to any
// side. It runs `blobble --bar <command> [args]`, which hands the command to the running app
// over a socket; the app answers by drawing the blob into a file the widget shows.
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

fn dir() -> PathBuf {
    let base = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(base).join("blobble")
}

// First thing in main. `blobble --bar panel 120` passes "panel 120" to the running app and
// exits (starting the app when a panel is asked for and none runs). A plain start while
// another Blobble answers on the socket exits, so there is only ever one.
pub fn client() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let sock = dir().join("ctl.sock");
    if args.first().map(String::as_str) == Some("--install-widget") {
        println!("{}", if crate::widget::install() { "Installed Blobble's bar widget" } else { "Blobble's bar widget is up to date (or this is not Omarchy)" });
        std::process::exit(0);
    }
    if args.first().map(String::as_str) == Some("--bar") {
        let line = args[1..].join(" ");
        let sent = UnixStream::connect(&sock).and_then(|mut s| writeln!(s, "{line}")).is_ok();
        if !sent && (line.starts_with("panel") || line.starts_with("open")) {
            if let Ok(exe) = std::env::current_exe() {
                let _ = std::process::Command::new(exe).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).process_group(0).spawn();
            }
        }
        std::process::exit(0);
    }
    if UnixStream::connect(&sock).is_ok() {
        eprintln!("Blobble is already running");
        std::process::exit(0);
    }
}

// Listens for the widget's commands and passes each one to the pet's page, which owns the brain.
pub fn serve(app: AppHandle) {
    let dir = dir();
    let _ = std::fs::create_dir_all(&dir);
    let sock = dir.join("ctl.sock");
    let _ = std::fs::remove_file(&sock);
    let Ok(listener) = UnixListener::bind(&sock) else { return };
    // One thread for each connection: the widget keeps its own open, so a command is a write on a
    // socket (no process to start), and a `blobble --bar ...` from elsewhere is not kept waiting.
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    let _ = app.emit_to("pet", "bar:ctl", line);
                }
            });
        }
    });
}

// What the widget shows and reads, written whole and then moved into place, so it is never half
// read: the blob (bar.svg) and the size it is shown at (bar.json).
#[tauri::command]
pub fn write_bar_file(name: String, text: String) {
    if name != "bar.svg" && name != "bar.json" {
        return;
    }
    let dir = dir();
    let _ = std::fs::create_dir_all(&dir);
    let tmp = dir.join(format!("{name}.tmp"));
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join(&name));
    }
}
