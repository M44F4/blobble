# Blobble on Linux

How the Linux version is built, what works where, and what is left. The code is the
same as on Windows; only the parts below are Linux specific.

## What is shared

| Part | Used by |
|---|---|
| `core/` (blob, moods, drawing, share codes) | every OS, and OmaBlob |
| `desktop/ui/` (pet, panel, brain) | every OS; `desktop/ui/desktop/*.js` holds what differs per desktop |
| Rust plumbing (setup, state files, sensor loop, drops) | every OS |
| OS specific Rust | `sensors/win.rs`, `sensors/linux.rs`, `sensors/fallback.rs`, and the Linux only `overlay.rs`, `ctl.rs`, `events.rs`, `keys.rs` |

Distros barely differ. The desktop and X11 versus Wayland are what matter.

## Layers

1. **Every Linux** (`sensors/linux.rs`): CPU and RAM (`/proc`), battery
   (`/sys/class/power_supply`), disk (`statvfs`), music and controls (MPRIS), online
   (NetworkManager), dark mode and accent (XDG portal), downloads folder, notifications,
   `xdg-open`, zip, lock, temperature, power profile.
2. **Wayland layer shell** (`overlay.rs`): the pet is a `gtk-layer-shell` layer over the
   screen, loaded at runtime so it stays optional. It takes input only over the blob, so
   the desktop under it keeps working. X11 places a plain window itself.
3. **Per desktop**: Hyprland gives the cursor, the bar's size and window, workspace and
   screen recording events (`events.rs`). Omarchy adds its notifications, theme and the
   bar widget (`desktop/omarchy/`).

## Omarchy

On Omarchy, Blobble is a Quickshell bar widget (`desktop/omarchy/m44f4.blobble`). The
widget draws the blob in its slot, walks along the bar, and opens the panel; the app does
the thinking and talks to the widget over `$XDG_RUNTIME_DIR/blobble/ctl.sock`. See
[desktop/omarchy/README.md](../desktop/omarchy/README.md).

## What is left

- **Cursor and gaze:** Hyprland, and X11 through GTK. Missing on GNOME, KDE and Sway Wayland.
- **Pet on GNOME Wayland:** it has no layer shell, so the pet needs another way.
- **Workspace, window and notification reactions:** Hyprland (and Omarchy toasts) only.
- **Typing reaction:** off on Linux.
- **Tray icon:** needs `libayatana-appindicator`; plain GNOME needs the AppIndicator extension.
- **Packaging:** `npm run build:linux` makes a `.deb`, `.rpm` and AppImage, and the release
  workflow attaches them. The app installs the Omarchy widget itself (`widget.rs`). `packaging/arch/` has the `blobble-bin` PKGBUILD for Arch and Omarchy (not on the AUR yet).
  The `Install check` workflow installs the release packages in clean Debian, Ubuntu, Fedora and Arch containers.
- **Testing:** only Omarchy has been tried. Sway, niri, KDE, GNOME and X11 are untested.
- **Multi monitor.**
