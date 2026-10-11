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
    config().map(|c| install_in(&c)).unwrap_or(false)
}

fn install_in(config: &std::path::Path) -> bool {
    let omarchy = config.join("omarchy");
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

#[cfg(test)]
mod tests {
    use super::*;

    // A fresh config folder for a test, removed at the end.
    struct Home(PathBuf);
    impl Home {
        fn new(name: &str) -> Home {
            let dir = std::env::temp_dir().join(format!("blobble-test-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Home(dir)
        }
    }
    impl Drop for Home {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn does_nothing_off_omarchy() {
        let home = Home::new("off");
        assert!(!install_in(&home.0));
        assert!(!home.0.join("omarchy").exists());
    }

    #[test]
    fn installs_every_file_then_leaves_it_alone() {
        let home = Home::new("on");
        std::fs::create_dir_all(home.0.join("omarchy")).unwrap();
        assert!(install_in(&home.0));
        let dest = home.0.join("omarchy/plugins/m44f4.blobble");
        for (name, text) in FILES {
            assert_eq!(std::fs::read_to_string(dest.join(name)).unwrap(), text);
        }
        assert!(!install_in(&home.0), "a second run changes nothing");
    }

    #[test]
    fn brings_an_old_widget_up_to_date() {
        let home = Home::new("old");
        let dest = home.0.join("omarchy/plugins/m44f4.blobble");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("BarWidget.qml"), "old").unwrap();
        assert!(install_in(&home.0));
        assert_eq!(std::fs::read_to_string(dest.join("BarWidget.qml")).unwrap(), FILES[0].1);
    }

    #[test]
    fn leaves_a_linked_plugin_folder_alone() {
        let home = Home::new("link");
        let checkout = home.0.join("checkout");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::create_dir_all(home.0.join("omarchy/plugins")).unwrap();
        std::os::unix::fs::symlink(&checkout, home.0.join("omarchy/plugins/m44f4.blobble")).unwrap();
        assert!(!install_in(&home.0));
        assert!(std::fs::read_dir(&checkout).unwrap().next().is_none());
    }
}
