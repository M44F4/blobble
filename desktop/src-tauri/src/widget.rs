// Puts Omarchy's bar widget (omarchy/m44f4.blobble) in the plugin folder, from a copy built into the
// app, so installing the app is all it takes: the widget then shows in Omarchy's plugin list. It runs
// at every start, so an update brings the new widget too, and `blobble --install-widget` does it by
// hand. Nothing happens off Omarchy, and a plugin folder that is a link (a developer's checkout) is left alone.
use std::path::PathBuf;

const FILES: [(&str, &str); 3] = [
    ("BarWidget.qml", include_str!("../../omarchy/m44f4.blobble/BarWidget.qml")),
    ("manifest.json", include_str!("../../omarchy/m44f4.blobble/manifest.json")),
    ("bin/blobble.bash", include_str!("../../omarchy/m44f4.blobble/bin/blobble.bash")),
];

fn config() -> Option<PathBuf> {
    std::env::var("XDG_CONFIG_HOME").map(PathBuf::from).ok().or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".config")))
}

// Returns whether anything was written.
pub fn install() -> bool {
    let Some(omarchy) = config().map(|c| c.join("omarchy")) else { return false };
    if !omarchy.is_dir() {
        return false;
    }
    let dest = omarchy.join("plugins/m44f4.blobble");
    if dest.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return false;
    }
    let mut wrote = false;
    for (name, text) in FILES {
        let file = dest.join(name);
        if std::fs::read_to_string(&file).map(|old| old == text).unwrap_or(false) {
            continue;
        }
        if let Some(dir) = file.parent() {
            if std::fs::create_dir_all(dir).is_err() {
                return wrote;
            }
        }
        wrote |= std::fs::write(&file, text).is_ok();
    }
    wrote
}
