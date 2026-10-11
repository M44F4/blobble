# Blobble desktop app

The Windows and Linux app: a [Tauri](https://tauri.app) shell around the shared `core/`. For what it
does, see the [main README](../README.md).

## Requirements

- Node 22 or newer
- Rust, from [rustup](https://rustup.rs)
- Windows: Visual Studio 2022 (or its Build Tools) with the C++ workload; WebView2 comes with Windows
- Linux: the Tauri prerequisites (WebKitGTK 4.1, GTK 3, libayatana-appindicator), `gtk-layer-shell` for the pet's overlay on Wayland

## Run and build

```bash
npm install
npm run dev     # copies core/ in, builds and starts the app, rebuilds on Rust changes
npm run build   # the Windows installer, in src-tauri/target/release/bundle/nsis/
npm run build:linux   # a .deb, .rpm and AppImage, in src-tauri/target/release/bundle/
npm run icon    # redraws the app icons from the core
```

`npm run dev` only watches the Rust side; restart it after changing files in `ui/`.
Page errors and notes are printed in the terminal that runs it.

From the repository root:

```bash
npm test        # the core's tests
npm run glyphs  # rebuilds core/Glyphs.mjs after using a new icon
npm run play    # the core in a browser with fake sensors, at http://localhost:8080/playground/
```

## How it is built

| Part | Files | What it does |
|---|---|---|
| Pet | `ui/index.html`, `ui/pet.js` | A see-through overlay over the screen. Only the blob, its time pill and its menu catch the mouse. Also draws the live tray icon |
| Brain | `ui/service.js` | OmaBlob's Service: settings, mood, today's stats, Pomodoro, timer and nudges. Runs in the pet's page |
| Panel | `ui/panel.html`, `ui/panel.js`, `ui/panel/*` | The flyout above the tray. Shows the brain's `state` events and sends `cmd` events back |
| Shared | `ui/shared/*` | `BlobView` (drawing and animation), icons, theme, the accent palette and Omarchy's look (`shellstyle.js`) |
| Desktops | `ui/desktop/*` | One module per desktop (`windows.js`, `omarchy.js`, `linux.js`, `macos.js`): its words, Settings tab, reactions, ring actions and host. Shared code asks the module, never the OS. `taskbar.js` models the taskbar and the tray |
| Omarchy widget | `omarchy/` | The Quickshell bar widget and its install script, see [omarchy/README.md](omarchy/README.md) |
| Native side | `src-tauri/src/main.rs` | Windows, tray icon, autostart, keeping the pet above the taskbar |
| | `src-tauri/src/sensors/*` | One file per OS (`win.rs`, `linux.rs`, `fallback.rs`): idle time, battery, CPU, memory, music, network, disk, fullscreen, code editor, accent colour, taskbar and tray position |
| | `src-tauri/src/{ctl,overlay,events,keys}.rs` | Linux only: the widget's socket, the layer windows, Hyprland and notification events, shortcuts |
| | `src-tauri/src/system.rs` | Ring actions, music controls, notifications, saved state, Studio pictures |
| | `src-tauri/src/files.rs` | Files dropped on the pet |

`scripts/sync-core.mjs` copies `../core/` into `ui/core/` before each run and build, so the
core is never edited here.

State lives in `%APPDATA%\app.blobble.desktop\` on Windows and `~/.config/app.blobble.desktop/`
on Linux (`settings.json`, `stats.json`, `pet.json`, `studio.json`), and Studio pictures in
`Pictures\Blobble`.

## Adding a platform

Every app reuses `core/` unchanged and fills the sensor object described in
[core/EVENTS.md](../core/EVENTS.md). Give the new app its own folder and README, and add it to
the platform table in the main README.
