# Blobble for Omarchy

On Omarchy the blob lives in the bar as a real bar widget (a Quickshell plugin), like OmaBlob's:
the shell places it, you move it with the rest of the bar's layout, and it follows the bar to any
side. The Blobble app draws the blob and the panel; the widget only shows the blob and sends clicks.

    blobble             # the app copies the widget to ~/.config/omarchy/plugins when it starts
    blobble --install-widget   # or just that, without starting the app
    # then add "Blobble" to the bar, like any widget

The widget's files are built into the app (`src-tauri/src/widget.rs`), so the app and the widget
are always the same version. For development, `./install.sh` copies this folder instead, or link
it with `ln -s`: a linked plugin folder is left alone.

How the two talk (`desktop/src-tauri/src/ctl.rs`):

- The widget runs `blobble --bar hello <x>` every few seconds, and `panel <x>`, `poke`, `btop` on
  clicks; `walk <dir>` and `antic <name>` while the blob walks to a neighbour and back. `<x>` is where the widget is along the bar. The command reaches the running app over
  `$XDG_RUNTIME_DIR/blobble/ctl.sock` (`panel` and `open <page>` start the app if it is not running).
- The app writes `$XDG_RUNTIME_DIR/blobble/bar.svg` (the blob, alive or still) and `bar.json`
  (its size, whether it walks, whether it sleeps or plays music) for the widget to show.
- The panel is a layer-shell window against the bar's side. While it is open, the app's overlay
  window catches the click that closes it; otherwise that window is hidden.

Where the Omarchy code lives, apart from the other desktops:

- `ui/desktop/omarchy.js`: the words, the Settings > Bar tab, the host (the widget's commands, the
  blob drawn for it, its eyes following the cursor) and the reactions it can feel.
  `windows.js`, `linux.js` and `macos.js` are the other desktops; `index.js` picks one.
- `src-tauri/src/ctl.rs`, `overlay.rs`, `events.rs` (Linux only): the socket, the layers, and
  Hyprland's workspace/window/urgent/screencast events plus Omarchy's notification toasts.
