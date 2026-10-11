// What the pet can feel on Windows.
use super::{Battery, Music, player_name};

pub(super) fn main_button_down() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
    // This reads the physical buttons, so follow the left-handed setting.
    let key = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
    (unsafe { GetAsyncKeyState(key as i32) } as u16 & 0x8000) != 0
}

pub(super) fn idle_ms() -> u32 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return 0;
        }
        GetTickCount().wrapping_sub(info.dwTime)
    }
}

pub(super) fn battery() -> Option<Battery> {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemPowerStatus(&mut s) } == 0 || s.BatteryFlag & 128 != 0 || s.BatteryFlag == 255 {
        return None; // no battery, or Windows does not know
    }
    Some(Battery {
        present: true,
        percent: if s.BatteryLifePercent > 100 { 100 } else { s.BatteryLifePercent },
        charging: s.BatteryFlag & 8 != 0 || s.ACLineStatus == 1,
    })
}

pub(super) fn ram() -> f64 {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut m: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut m) } == 0 {
        return 0.0;
    }
    m.dwMemoryLoad as f64
}

// CPU use from the change in system times between two samples.
#[derive(Default)]
pub(super) struct Cpu {
    last: Option<(u64, u64)>, // (idle, total)
}

impl Cpu {
        pub(super) fn sample(&mut self) -> f64 {
        use windows_sys::Win32::Foundation::FILETIME;
        use windows_sys::Win32::System::Threading::GetSystemTimes;
        let ft = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
        let (mut idle, mut kernel, mut user) = unsafe { std::mem::zeroed::<(FILETIME, FILETIME, FILETIME)>() };
        if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
            return 0.0;
        }
        let now = (ft(idle), ft(kernel) + ft(user)); // kernel time includes idle time
        let pct = match self.last {
            Some((i0, t0)) if now.1 > t0 => 100.0 * (1.0 - (now.0 - i0) as f64 / (now.1 - t0) as f64),
            _ => 0.0,
        };
        self.last = Some(now);
        pct.clamp(0.0, 100.0)
    }
}


// What is playing, from the media controls Windows shows on the volume flyout.
#[derive(Default)]
pub(super) struct MusicReader {
        manager: Option<windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager>,
}

impl MusicReader {
        pub(super) fn read(&mut self) -> Music {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        };
        if self.manager.is_none() {
            self.manager = Manager::RequestAsync().and_then(|op| op.get()).ok();
        }
        let read = || -> windows::core::Result<Music> {
            let session = self.manager.as_ref().ok_or(windows::core::Error::empty())?.GetCurrentSession()?;
            let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;
            let props = session.TryGetMediaPropertiesAsync()?.get()?;
            Ok(Music {
                playing,
                title: props.Title()?.to_string(),
                artist: props.Artist()?.to_string(),
                player: player_name(&session.SourceAppUserModelId()?.to_string()),
            })
        };
        read().unwrap_or_default()
    }
}


pub(super) fn online() -> bool {
    use windows::Networking::Connectivity::{NetworkConnectivityLevel as Level, NetworkInformation};
    NetworkInformation::GetInternetConnectionProfile()
        .and_then(|p| p.GetNetworkConnectivityLevel())
        .map(|l| l == Level::InternetAccess || l == Level::ConstrainedInternetAccess)
        .unwrap_or(false)
}

// How full the system drive is, in percent.
// Nothing to say about the CPU's temperature or the power profile here yet.
pub(super) fn temp() -> Option<f64> { None }
pub(super) fn power_profile() -> String { String::new() }

pub(super) fn disk_percent() -> f64 {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()) + "\\";
    let wide: Vec<u16> = drive.encode_utf16().chain(std::iter::once(0)).collect();
    let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
    if unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut free) } == 0 || total == 0 {
        return 0.0;
    }
    100.0 * (1.0 - free as f64 / total as f64)
}

// Windows' accent colour and whether apps are in dark mode.
pub(super) fn theme() -> (String, bool) {
    use windows::UI::ViewManagement::{UIColorType, UISettings};
    let read = || -> windows::core::Result<(String, bool)> {
        let ui = UISettings::new()?;
        let a = ui.GetColorValue(UIColorType::Accent)?;
        let bg = ui.GetColorValue(UIColorType::Background)?;
        Ok((format!("#{:02x}{:02x}{:02x}", a.R, a.G, a.B), (bg.R as u32 + bg.G as u32 + bg.B as u32) < 384))
    };
    read().unwrap_or_else(|_| ("#7aa2f7".into(), true))
}

// A video, game or slides in fullscreen (Windows' own "busy" states). Not our own overlay:
// it covers the screen too, and becomes the front window when you click the pet.
fn fullscreen() -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    static LAST: AtomicBool = AtomicBool::new(false);
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(GetForegroundWindow(), &mut pid);
        // Clicking the pet makes it the front window, which says nothing about what is behind it:
        // keep the last answer, so the ducked pet does not jump away when it is pressed.
        if pid == std::process::id() {
            return LAST.load(Ordering::Relaxed);
        }
        let mut state = 0;
        let now = SHQueryUserNotificationState(&mut state) >= 0 && (state == 2 || state == 3 || state == 4);
        LAST.store(now, Ordering::Relaxed);
        now
    }
}

// A code editor in front puts its glasses on.
fn coding() -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    const EDITORS: &[&str] = &[
        "code.exe", "code - insiders.exe", "cursor.exe", "codium.exe", "vscodium.exe", "windsurf.exe", "zed.exe",
        "sublime_text.exe", "notepad++.exe", "devenv.exe", "neovide.exe", "nvim-qt.exe", "emacs.exe", "kate.exe",
        "idea64.exe", "pycharm64.exe", "webstorm64.exe", "clion64.exe", "rider64.exe", "goland64.exe",
        "phpstorm64.exe", "rustrover64.exe", "studio64.exe", "fleet.exe",
    ];
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        let mut exe = String::new();
        if !process.is_null() {
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            if QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut len) != 0 {
                exe = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
            }
            CloseHandle(process);
        }
        let name = exe.rsplit('\\').next().unwrap_or("").to_string();
        if EDITORS.contains(&name.as_str()) {
            return true;
        }
        // Vim and friends inside a terminal: the title says so.
        let mut title = [0u16; 512];
        let n = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
        let title = String::from_utf16_lossy(&title[..n.max(0) as usize]).to_lowercase();
        ["windowsterminal.exe", "wezterm-gui.exe", "alacritty.exe", "conhost.exe"].contains(&name.as_str())
            && title.split(|c: char| !c.is_alphanumeric()).any(|w| ["vim", "nvim", "hx", "helix", "emacs", "nano", "micro"].contains(&w))
    }
}

// The taskbar and its notification area (tray icons and clock), as [x, y, width, height].
pub(super) fn taskbar() -> Option<((i32, i32, i32, i32), Option<(i32, i32, i32, i32)>)> {
    unsafe {
        use windows_sys::Win32::Foundation::RECT;
        use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, GetWindowRect};
        let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let bar = FindWindowW(wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
        if bar.is_null() {
            return None;
        }
        let rect = |h| {
            let mut r: RECT = std::mem::zeroed();
            if GetWindowRect(h, &mut r) == 0 || r.right <= r.left { return None; }
            Some((r.left, r.top, r.right - r.left, r.bottom - r.top))
        };
        let notify = FindWindowExW(bar, std::ptr::null_mut(), wide("TrayNotifyWnd").as_ptr(), std::ptr::null());
        rect(bar).map(|b| (b, if notify.is_null() { None } else { rect(notify) }))
    }
}

// The sensor thread talks to WinRT (music, network, theme).
pub(super) fn init_thread() {
    unsafe {
        let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
    }
}

pub(super) fn downloads_dir() -> Option<std::path::PathBuf> {
    std::env::var("USERPROFILE").ok().map(|h| std::path::Path::new(&h).join("Downloads"))
}

// Fullscreen and code editor in front, read together.
pub(super) fn focus() -> (bool, bool) {
    (fullscreen(), coding())
}
