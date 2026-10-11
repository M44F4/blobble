// The Settings tab of a desktop whose blob is a tray (or menu bar) icon and that has no taskbar
// to sit on: the icon's looks, and the desktop pet. Linux and macOS use it.
import { card, grid, on } from "../panel/ui.js";
import { I } from "../shared/icons.js";

export const trayPage = (info, place) => (h, kit) => {
  const { ft, isOn, flip } = kit;
  const trayPic = (props) => `<div style="width:30px;height:30px">${kit.pic(Object.assign({ size: 30, showAccessories: false }, props))}</div>`;
  return card({ title: "Tray icon", info }, grid(3,
      ft({ label: "Live", tip: "Blinks, bobs to music and watches your cursor", on: isOn("", "trayLive", true), art: trayPic({ faceOverride: "happy" }),
        act: on(() => flip("", "trayLive", true)) }) +
      ft({ label: "Moods", tip: "Shows its mood's face. Off keeps its resting face", on: isOn("", "trayMood", true), art: trayPic({ faceOverride: "surprised" }),
        act: on(() => flip("", "trayMood", true)) }) +
      ft({ label: "Outfits", tip: "Hats, headphones and glasses on the " + place + " blob", on: isOn("", "trayWear", true), art: trayPic({ wear: { head: "tophat" } }),
        act: on(() => flip("", "trayWear", true)) }))) +
    card({ title: "On the desktop", info: "The desktop pet. Its size and home are on the Pet page." }, grid(3,
      ft({ glyph: I.paw, label: "Shown", tip: "The pet on your screen. Off: only the " + place + " blob", on: !!h.st.petEnabled, act: on(() => h.cmd("togglePet")) })));
};
