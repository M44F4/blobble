// Systems without their own sensors yet (macOS): a calm blob that feels nothing.
use super::{Battery, Music};

pub(super) fn main_button_down() -> bool { false }
pub(super) fn taskbar() -> Option<((i32, i32, i32, i32), Option<(i32, i32, i32, i32)>)> { None }
pub(super) fn init_thread() {}
pub(super) fn idle_ms() -> u32 { 0 }
pub(super) fn battery() -> Option<Battery> { None }
pub(super) fn ram() -> f64 { 0.0 }
pub(super) fn online() -> bool { true }
// Nothing to say about the CPU's temperature or the power profile here yet.
pub(super) fn temp() -> Option<f64> { None }
pub(super) fn power_profile() -> String { String::new() }

pub(super) fn disk_percent() -> f64 { 0.0 }
pub(super) fn theme() -> (String, bool) { ("#7aa2f7".into(), true) }
pub(super) fn focus() -> (bool, bool) { (false, false) }
pub(super) fn downloads_dir() -> Option<std::path::PathBuf> {
    std::env::var("HOME").ok().map(|h| std::path::Path::new(&h).join("Downloads"))
}

#[derive(Default)]
pub(super) struct Cpu;
impl Cpu {
    pub(super) fn sample(&mut self) -> f64 { 0.0 }
}

#[derive(Default)]
pub(super) struct MusicReader;
impl MusicReader {
    pub(super) fn read(&mut self) -> Music { Music::default() }
}
