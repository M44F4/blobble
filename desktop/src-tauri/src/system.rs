// The things a page cannot do on its own: run Windows' tools for the ring, control the music,
// show notifications, and keep files (settings, stats, Studio pictures).
use base64::Engine;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;

// Opens a program, file or URI the way Explorer does (ShellExecute), so tools that want admin
// rights, like Task Manager, show the usual prompt instead of failing with error 740.
#[cfg(windows)]
pub fn shell_open(target: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (verb, file) = (wide("open"), wide(target));
    let code = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
    // Above 32 is success; 1223 is "you said no" to the admin prompt, which is fine too.
    if code as isize > 32 || code as isize == 1223 { Ok(()) } else { Err(format!("could not open {target} ({})", code as isize)) }
}

#[cfg(not(windows))]
pub fn shell_open(target: &str) -> Result<(), String> {
    Command::new("xdg-open").arg(target).spawn().map(|_| ()).map_err(|e| e.to_string())
}

// A command that runs without flashing a console window.
#[cfg_attr(not(windows), allow(unused_mut))]
pub fn quiet(mut cmd: Command) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// Ring actions that need the desktop itself. Only these fixed ids run anything.
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn run_action(id: &str) -> Result<(), String> {
    // The first of these that is installed: Omarchy's own commands, then GNOME and KDE.
    let choices: &[&[&str]] = match id {
        "screenshot" => &[&["omarchy-capture-screenshot"], &["gnome-screenshot", "-i"], &["spectacle"], &["flameshot", "gui"]],
        "nightlight" => &[&["omarchy-toggle-nightlight"]],
        "dnd" => &[&["omarchy-toggle-notification-silencing"], &["makoctl", "mode", "-t", "do-not-disturb"], &["swaync-client", "-d"]],
        "power" => &[&["sh", "-c", POWER_CYCLE]],
        "btop" => &[&["omarchy-launch-or-focus-tui", "btop"], &["gnome-system-monitor"], &["plasma-systemmonitor"], &["xdg-terminal-exec", "btop"]],
        "lock" => &[&["omarchy-system-lock"], &["loginctl", "lock-session"]],
        _ => return Err(format!("unknown action {id}")),
    };
    for cmd in choices {
        if which(cmd[0]) {
            return Command::new(cmd[0]).args(&cmd[1..]).spawn().map(|_| ()).map_err(|e| e.to_string());
        }
    }
    Err("not on this desktop yet".into())
}

// The next power profile, round and round (power-profiles-daemon, which most distros have).
#[cfg(target_os = "linux")]
const POWER_CYCLE: &str = r#"set -e
cur=$(powerprofilesctl get)
list=$(powerprofilesctl list | sed -n 's/^[* ]*\([a-z-]*\):$/\1/p')
next=$(printf '%s\n%s\n' "$list" "$list" | awk -v c="$cur" 'f{print;exit} $0==c{f=1}')
powerprofilesctl set "$next"
notify-send -a Blobble "Power mode" "$next" || true"#;

#[cfg(target_os = "linux")]
fn which(cmd: &str) -> bool {
    std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).any(|dir| dir.join(cmd).is_file()))
        .unwrap_or(false)
}

// Shows or hides Windows' touch keyboard, through the same COM object the taskbar button uses.
#[cfg(windows)]
#[allow(non_snake_case)]
fn touch_keyboard() -> bool {
    use windows::core::{interface, IUnknown, IUnknown_Vtbl, GUID, HRESULT};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::WindowsAndMessaging::GetDesktopWindow;

    #[interface("37c994e7-432b-4834-a2f7-dce1f13b834b")]
    unsafe trait ITipInvocation: IUnknown {
        unsafe fn Toggle(&self, wnd: HWND) -> HRESULT;
    }
    const TIP_INVOCATION: GUID = GUID::from_u128(0x4ce576fa_83dc_4f88_951c_9d0782b4e376);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let Ok(tip) = CoCreateInstance::<_, ITipInvocation>(&TIP_INVOCATION, None, CLSCTX_LOCAL_SERVER) else { return false };
        tip.Toggle(GetDesktopWindow()).is_ok()
    }
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub fn run_action(id: &str) -> Result<(), String> {
    match id {
        "screenshot" => shell_open("ms-screenclip:"),
        "nightlight" => shell_open("ms-settings:nightlight"),
        "dnd" => shell_open("ms-settings:notifications"),
        "power" => shell_open("ms-settings:powersleep"),
        "btop" => shell_open("taskmgr.exe"),
        #[cfg(windows)]
        "keyboard" => {
            // The touch keyboard is shown by asking its service to, not by starting TabTip.exe:
            // starting it alone does nothing visible on current Windows.
            let toggle = || std::thread::spawn(touch_keyboard).join().unwrap_or(false);
            if toggle() {
                return Ok(());
            }
            // The service may not be running yet: start it, give it a moment, ask again.
            let tabtip = PathBuf::from(std::env::var("CommonProgramFiles").unwrap_or_else(|_| r"C:\Program Files\Common Files".into()))
                .join(r"microsoft shared\ink\TabTip.exe");
            if tabtip.exists() {
                let _ = shell_open(&tabtip.to_string_lossy());
                std::thread::sleep(std::time::Duration::from_millis(700));
                if toggle() {
                    return Ok(());
                }
            }
            shell_open("osk.exe")
        }
        "lock" => {
            #[cfg(windows)]
            unsafe {
                windows_sys::Win32::System::Shutdown::LockWorkStation();
            }
            #[cfg(not(windows))]
            Command::new("loginctl").arg("lock-session").spawn().map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err(format!("unknown action {id}")),
    }
}

// Previous, play/pause and next on whatever Windows says is playing.
#[tauri::command]
pub fn media(action: String) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        {
            use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
            unsafe {
                let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
            }
            let run = || -> windows::core::Result<()> {
                let session = Manager::RequestAsync()?.get()?.GetCurrentSession()?;
                match action.as_str() {
                    "prev" => { session.TrySkipPreviousAsync()?.get()?; }
                    "next" => { session.TrySkipNextAsync()?.get()?; }
                    _ => { session.TryTogglePlayPauseAsync()?.get()?; }
                }
                Ok(())
            };
            let _ = run();
        }
        #[cfg(target_os = "linux")]
        crate::sensors::linux::media(&action);
    });
}

// The colour under the cursor as #rrggbb. Chromium's own eyedropper grabs the screen and needs
// the window's focus to end, which the pet overlay does not have: it could leave every window
// unclickable. These only look at the screen and take nothing over.
#[cfg(windows)]
fn pixel_hex() -> Option<String> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    unsafe {
        let mut p = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut p) == 0 {
            return None;
        }
        let dc = GetDC(std::ptr::null_mut());
        let c = GetPixel(dc, p.x, p.y);
        ReleaseDC(std::ptr::null_mut(), dc);
        (c != 0xFFFF_FFFF).then(|| format!("#{:02x}{:02x}{:02x}", c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff))
    }
}

#[tauri::command]
pub fn pixel_under_cursor() -> Option<String> {
    #[cfg(windows)]
    return pixel_hex();
    #[cfg(not(windows))]
    None
}

// The pick, like the native pickers: a click takes the colour under the cursor and does not
// reach the app below; Esc or a right click cancels (and neither reaches it). It is two
// low-level hooks that live only for this call and are removed after 20 seconds at most, so
// nothing can stay grabbed.
#[cfg(windows)]
mod pick {
    use std::sync::atomic::{AtomicI32, Ordering};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG,
        PM_REMOVE, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };
    const VK_ESCAPE: u32 = 0x1B;
    static STATE: AtomicI32 = AtomicI32::new(0); // 0 looking, 1 picked, 2 cancelled

    unsafe extern "system" fn mouse(code: i32, w: usize, l: isize) -> isize {
        if code >= 0 {
            match w as u32 {
                WM_LBUTTONDOWN => {
                    STATE.compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst).ok();
                    return 1;
                }
                WM_RBUTTONDOWN => {
                    STATE.compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst).ok();
                    return 1;
                }
                // The matching releases, so the app below never sees half a click.
                WM_LBUTTONUP | WM_RBUTTONUP if STATE.load(Ordering::SeqCst) != 0 => return 1,
                _ => {}
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, w, l)
    }

    unsafe extern "system" fn keys(code: i32, w: usize, l: isize) -> isize {
        if code >= 0 && (*(l as *const KBDLLHOOKSTRUCT)).vkCode == VK_ESCAPE {
            match w as u32 {
                WM_KEYDOWN | WM_SYSKEYDOWN => {
                    STATE.compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst).ok();
                    return 1;
                }
                WM_KEYUP | WM_SYSKEYUP => return 1,
                _ => {}
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, w, l)
    }

    // True if a colour was picked, false if cancelled or timed out.
    pub fn run() -> bool {
        STATE.store(0, Ordering::SeqCst);
        unsafe {
            let module = GetModuleHandleW(std::ptr::null());
            let m = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse), module, 0);
            let k = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keys), module, 0);
            if m.is_null() {
                if !k.is_null() {
                    UnhookWindowsHookEx(k);
                }
                return false;
            }
            let started = std::time::Instant::now();
            let mut decided_at = None;
            let mut msg: MSG = std::mem::zeroed();
            loop {
                // Low-level hooks run while this thread pumps messages.
                while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                if STATE.load(Ordering::SeqCst) != 0 {
                    // Stay a moment longer to swallow the release that matches the press.
                    let at = *decided_at.get_or_insert_with(std::time::Instant::now);
                    if at.elapsed() > std::time::Duration::from_millis(250) {
                        break;
                    }
                } else if started.elapsed() > std::time::Duration::from_secs(20) {
                    STATE.store(2, Ordering::SeqCst);
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(4));
            }
            UnhookWindowsHookEx(m);
            if !k.is_null() {
                UnhookWindowsHookEx(k);
            }
        }
        STATE.load(Ordering::SeqCst) == 1
    }
}

// Waits for a click and returns the colour under it; Esc, a right click or 20 seconds cancel.
#[tauri::command]
pub async fn pick_colour() -> Result<String, String> {
    #[cfg(windows)]
    {
        let picked = std::thread::spawn(pick::run).join().unwrap_or(false);
        if !picked {
            return Err("cancelled".into());
        }
        pixel_hex().ok_or_else(|| "could not read that pixel".to_string())
    }
    #[cfg(not(windows))]
    Err("not available here".into())
}

// The clipboard, from the Windows side: a page may only write to it while it has the focus,
// and the pet usually does not.
#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_png(app: AppHandle, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let image = tauri::image::Image::from_bytes(&bytes).map_err(|e| e.to_string())?;
    app.clipboard().write_image(&image).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn state_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_lowercase()) {
        return Err("bad name".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

// Settings, today's stats, the pet's spot and the last Studio pose, as JSON text.
#[tauri::command]
pub fn load_state(app: AppHandle, name: String) -> Option<String> {
    std::fs::read_to_string(state_path(&app, &name).ok()?).ok()
}

#[tauri::command]
pub fn save_state(app: AppHandle, name: String, text: String) -> Result<(), String> {
    let path = state_path(&app, &name)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn pictures(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().picture_dir().map_err(|e| e.to_string())?.join("Blobble");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// A Studio export into Pictures\Blobble. Returns where it went.
#[tauri::command]
pub fn save_picture(app: AppHandle, name: String, data: String) -> Result<String, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') || name.starts_with('.') {
        return Err("bad name".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let path = pictures(&app)?.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// A Studio export onto the clipboard as a file, ready to paste into a chat. Only files in
// Pictures\Blobble.
#[tauri::command]
pub fn copy_picture(app: AppHandle, path: String) -> Result<(), String> {
    let dir = pictures(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let file = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if !file.starts_with(&dir) {
        return Err("not a Studio picture".into());
    }
    #[cfg(windows)]
    let mut cmd = {
        // canonicalize() gives a \\?\ path, which PowerShell does not take.
        let plain = file.display().to_string();
        let plain = plain.strip_prefix(r"\\?\").unwrap_or(&plain).to_string();
        // The path goes in through the environment, never into the script text.
        let mut cmd = quiet(Command::new("powershell.exe"));
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -LiteralPath $env:BLOBBLE_FILE"])
            .env("BLOBBLE_FILE", plain);
        cmd
    };
    // As a file, the way file managers copy one: wl-copy on Wayland, xclip on X11.
    #[cfg(not(windows))]
    let mut cmd = {
        let uri = format!("file://{}", file.display());
        let mut cmd = if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            let mut c = Command::new("wl-copy");
            c.args(["--type", "text/uri-list", &uri]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", "printf '%s' \"$1\" | xclip -selection clipboard -t text/uri-list", "sh", &uri]);
            c
        };
        cmd.stdout(std::process::Stdio::null());
        cmd
    };
    let status = cmd.status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("could not copy".into()) }
}

#[tauri::command]
pub fn open_pictures(app: AppHandle) -> Result<(), String> {
    shell_open(&pictures(&app)?.to_string_lossy())
}

// A web page in the default browser (the star, the issues, a new release).
#[tauri::command]
pub fn open_url(url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = shell_open(&url);
    }
}

// The newest release on GitHub, as the API sends it (the page reads the version and the link).
// curl ships with Windows 10 and later, macOS and Linux, so no network library is needed.
#[tauri::command]
pub fn latest_release() -> Result<String, String> {
    let mut cmd = Command::new(if cfg!(windows) { "curl.exe" } else { "curl" });
    cmd.args(["-sL", "-m", "10", "-H", "Accept: application/vnd.github+json", "-H", "User-Agent: blobble", "https://api.github.com/repos/M44F4/blobble/releases/latest"]);
    let out = quiet(cmd).output().map_err(|e| format!("could not run curl: {e}"))?;
    if !out.status.success() {
        return Err("could not reach GitHub".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
