// Files dropped on the pet. Only paths that were really dropped can be read or acted on.
use base64::Engine;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{DragDropEvent, Manager, Window, WindowEvent};

#[derive(Default)]
pub struct Dropped(Mutex<Vec<PathBuf>>);

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "pet" {
        return;
    }
    if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
        if let Ok(mut list) = window.state::<Dropped>().0.lock() {
            *list = paths.clone();
        }
    }
}

// A file that just landed in Downloads: the pet offers what it can do with it, as if it had been
// dropped on it. Only files directly in the Downloads folder.
#[tauri::command]
pub fn offer_download(state: tauri::State<Dropped>, path: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    let dir = crate::sensors::downloads_dir().ok_or("no Downloads folder")?;
    let inside = file.parent().and_then(|p| p.canonicalize().ok()) == dir.canonicalize().ok();
    if !inside || !file.is_file() {
        return Err("not a download".into());
    }
    *state.0.lock().map_err(|e| e.to_string())? = vec![file];
    Ok(())
}

fn checked(state: &tauri::State<Dropped>, paths: &[String]) -> Result<Vec<PathBuf>, String> {
    let list = state.0.lock().map_err(|e| e.to_string())?;
    let out: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    if out.is_empty() || !out.iter().all(|p| list.contains(p)) {
        return Err("not a dropped file".into());
    }
    Ok(out)
}

// "photo.png" -> "photo-small.png", then "photo-small-1.png" if that is taken.
fn free_name(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut i = 1;
    while path.exists() {
        path = dir.join(format!("{stem}-{i}.{ext}"));
        i += 1;
    }
    path
}

#[tauri::command]
pub fn file_action(state: tauri::State<Dropped>, id: String, paths: Vec<String>) -> Result<String, String> {
    let files = checked(&state, &paths)?;
    let first = &files[0];
    let dir = first.parent().map(Path::to_path_buf).unwrap_or_default();
    match id.as_str() {
        "openFile" => {
            crate::system::shell_open(&first.to_string_lossy())?;
            Ok(String::new())
        }
        "folder" => {
            #[cfg(windows)]
            Command::new("explorer.exe").arg(format!("/select,{}", first.display())).spawn().map_err(|e| e.to_string())?;
            #[cfg(not(windows))]
            crate::system::shell_open(&dir.to_string_lossy())?;
            Ok(String::new())
        }
        "zip" => {
            let stem = if files.len() > 1 { "files".to_string() } else { first.file_stem().unwrap_or_default().to_string_lossy().into_owned() };
            let out = free_name(&dir, &stem, "zip");
            #[cfg(windows)]
            let status = {
                // Paths go in through the environment, never into the script text, so no file name can
                // break out of the command (PowerShell also takes curly quotes as quotes).
                let list = files.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join("\n");
                let script = "Compress-Archive -LiteralPath ($env:BLOBBLE_FILES -split \"`n\") -DestinationPath $env:BLOBBLE_OUT";
                crate::system::quiet(Command::new("powershell.exe"))
                    .args(["-NoProfile", "-NonInteractive", "-Command", script])
                    .env("BLOBBLE_FILES", list).env("BLOBBLE_OUT", &out)
                    .status().map_err(|e| e.to_string())?
            };
            // zip where it is installed, else Python's zipfile (both keep just the file names).
            #[cfg(not(windows))]
            let status = match Command::new("zip").arg("-jq").arg(&out).args(&files).status() {
                Ok(s) => s,
                Err(_) => Command::new("python3").args(["-m", "zipfile", "-c"]).arg(&out).args(&files)
                    .status().map_err(|_| "Zipping needs zip or python3".to_string())?,
            };
            if status.success() { Ok(out.to_string_lossy().into_owned()) } else { Err("zip failed".into()) }
        }
        "gif" => {
            let stem = first.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            let out = free_name(&dir, &stem, "gif");
            let status = crate::system::quiet(Command::new("ffmpeg"))
                .args(["-loglevel", "error", "-i"]).arg(first)
                .args(["-vf", "fps=12,scale=480:-1:flags=lanczos"]).arg(&out)
                .status().map_err(|_| "Making a GIF needs ffmpeg".to_string())?;
            if status.success() { Ok(out.to_string_lossy().into_owned()) } else { Err("ffmpeg failed".into()) }
        }
        _ => Err(format!("unknown file action {id}")),
    }
}

// A dropped image's bytes, so the page can copy or convert it.
#[tauri::command]
pub fn file_bytes(state: tauri::State<Dropped>, path: String) -> Result<String, String> {
    let file = checked(&state, &[path])?.remove(0);
    let bytes = std::fs::read(file).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

// A converted copy saved next to the dropped original. Returns where it went.
#[tauri::command]
pub fn write_beside(state: tauri::State<Dropped>, path: String, suffix: String, ext: String, data: String) -> Result<String, String> {
    let file = checked(&state, &[path])?.remove(0);
    let ok = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !ok(&suffix) || !ok(&ext) || ext.is_empty() {
        return Err("bad name".into());
    }
    let dir = file.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = file.file_stem().unwrap_or_default().to_string_lossy().into_owned() + &suffix;
    let out = free_name(&dir, &stem, &ext);
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(&out, bytes).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().into_owned())
}
