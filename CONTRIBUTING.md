# Contributing to Blobble

Thanks for looking. Blobble is small enough to read in an afternoon, and the most useful
contribution is usually making it work well on the desktop you actually use.

## Try it in five minutes

```bash
git clone https://github.com/M44F4/blobble && cd blobble
npm test                         # the shared core, no setup needed
cd desktop && npm install
npm run dev                      # runs the app (needs the Tauri prerequisites: WebKitGTK 4.1 on Linux)
```

[desktop/README.md](desktop/README.md) lists the prerequisites for each OS.

## Where things live

| You want to change | Look in |
|---|---|
| The blob, its moods, its drawing (every platform) | `core/` |
| The pet, the panel, the brain | `desktop/ui/` (`pet.js`, `service.js`, `panel/`) |
| What differs per desktop (words, pages, taskbar, bar) | `desktop/ui/desktop/` (`windows.js`, `omarchy.js`, `linux.js`, `macos.js`; `detect.js` picks one) |
| Reading the system (CPU, battery, music, cursor, idle) | `desktop/src-tauri/src/sensors/` (`win.rs`, `linux.rs`, `fallback.rs`) |
| The Linux pet overlay, Hyprland events, Omarchy bar widget | `overlay.rs`, `events.rs`, `ctl.rs`, `desktop/omarchy/` |

[core/EVENTS.md](core/EVENTS.md) lists what a new platform has to provide, and
[docs/LINUX.md](docs/LINUX.md) says what works where on Linux.

## Pull requests

- **One platform per PR.** A change for Sway should not touch Windows or Omarchy code, so the
  others stay as they are and review stays short. Shared code in `core/` is fine when it needs to be.
- **Say what you tested on**: desktop, distro, version. Untested platforms are fine, just say so.
- **Show it.** For anything you can see, add a short GIF or screenshot to the PR.
- **Keep it small.** A focused change is reviewed and merged quickly; a big mixed one waits.
- **Run `npm test`** before you push. Add a test when the change is plain logic.
- **Update the docs** when a platform gains something: the tables in the README and `docs/LINUX.md`.
- Keep the code in the style around it: comments say why, not what.

CI builds the app on Windows and Linux for every PR. By contributing you agree that your work is
released under the project's [MIT license](LICENSE).

## Not sure where to start?

- Run Blobble on your desktop and open a
  [works on my desktop](../../issues/new?template=works-on-my-desktop.yml) report. What does not
  work yet is the to-do list.
- Pick an issue labelled `good first issue`, and comment to claim it so two people do not
  do the same work. Ask in the issue if you get stuck, I answer quickly.
- Found a bug? Use the bug template.
