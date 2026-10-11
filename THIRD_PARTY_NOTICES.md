# Third-party notices

Blobble itself is MIT licensed (see `LICENSE`). It includes the following work by others.

| Component | Where | License | Copyright |
|---|---|---|---|
| [blobatar](https://github.com/Alain00/blobatar) | `core/vendor/blobatar.mjs` | MIT, `core/vendor/BLOBATAR_LICENSE` | 2026 Alain |
| [Material Design Icons](https://pictogrammers.com/library/mdi/) 7.4.47 | icon paths in `core/Glyphs.mjs`, made by `scripts/make-glyphs.mjs` | Apache 2.0, `core/vendor/MDI_LICENSE` | Pictogrammers |
| [gifenc](https://github.com/mattdesl/gifenc) | `desktop/ui/vendor/gifenc.js` | MIT, `desktop/ui/vendor/GIFENC_LICENSE.md` | 2017 Matt DesLauriers |

The Material Design Icons paths were converted to JavaScript data without
other changes.

The desktop app is built with [Tauri](https://tauri.app) and other Rust
crates and npm packages, each under its own license (mostly MIT or
Apache 2.0). Their licenses are listed in `desktop/src-tauri/Cargo.lock` and
`desktop/package-lock.json`, and `cargo about` or `license-checker` can print
them in full.
