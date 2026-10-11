// Icons as inline SVG: Material Design Icons by their Nerd Font glyph (as OmaBlob writes them),
// and the Pomodoro's tomato, drawn like OmaBlob's TomatoIcon.
import * as Glyphs from "../core/Glyphs.mjs";

export function icon(glyph, size, cls) {
  if (glyph === "tomato") return tomato(size, cls);
  const d = Glyphs.path(glyph);
  if (!d) return "";
  const s = size ? ` width="${size}" height="${size}"` : "";
  return `<svg class="icon ${cls || ""}" viewBox="0 0 24 24"${s} aria-hidden="true"><path d="${d}"/></svg>`;
}

export function tomato(size, cls) {
  const s = size ? ` width="${size}" height="${size}"` : "";
  return `<svg class="icon ${cls || ""}" viewBox="0 0 100 100"${s} aria-hidden="true"><g transform="translate(0 -6)">` +
    `<path d="M50 28C84 24 95 44 92 60C89 82 70 93 50 93C30 93 11 82 8 60C5 44 16 24 50 28Z" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/>` +
    `<path class="cut" d="M50 16L58 26L78 25L62 34L66 47L50 37L34 47L38 34L22 25L42 26Z"/>` +
    `<path d="M50 24Q50 10 60 4" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></g></svg>`;
}

// OmaBlob's icons, by what they are for.
export const I = {
  back: "\u{f004d}", trick: "\u{f0068}", reset2: "\u{f006f}", bell: "\u{f009a}", calendar: "\u{f00f6}",
  btop: "\u{f0128}", check: "\u{f012c}", coffee: "\u{f0176}", console: "\u{f018d}", copy: "\u{f018f}",
  emoticon: "\u{f01f5}", eye: "\u{f0208}", picker: "\u{f020a}", file: "\u{f0214}", gauge: "\u{f029a}",
  hat: "\u{f02c8}", help: "\u{f02d7}", history: "\u{f02da}", home: "\u{f02dc}", image: "\u{f02e9}",
  info: "\u{f02fd}", keyboard: "\u{f030c}", mouse: "\u{f037d}", symbols: "\u{f0387}", open: "\u{f03cc}",
  pencil: "\u{f03d8}", pause: "\u{f03e4}", paw: "\u{f03e9}", play: "\u{f040a}", plus: "\u{f0415}",
  reset: "\u{f0450}", turn: "\u{f0467}", settings: "\u{f0493}", dice: "\u{f049d}", next: "\u{f04ad}",
  prev: "\u{f04ae}", sleep: "\u{f04b2}", stop: "\u{f04db}", walk: "\u{f0583}", layers: "\u{f05af}",
  launch: "\u{f05b7}", shortcut: "\u{f0633}", sparkle: "\u{f0674}", music: "\u{f075a}", folder: "\u{f0770}",
  press: "\u{f0d77}", gif: "\u{f0d78}", carry: "\u{f0e47}", flash: "\u{f12a8}", why: "\u{f134a}",
  sticker: "\u{f1364}", timer: "\u{f13ab}", charging: "\u{f140b}", bar: "\u{f1513}", out: "\u{f19d0}",
  monitor: "\u{f0379}", power: "\u{f0425}", minus: "\u{f0374}", tray: "\u{f0ac2}",
};
