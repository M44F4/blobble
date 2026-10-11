// Windows. There is no way to add a widget to the taskbar, so the blob lives in the tray by the
// clock, and the desktop pet can sit on the taskbar's edge (the pet page places it, see pet.js).
import { card, button, grid, caption } from "../panel/ui.js";
import { on } from "../panel/ui.js";
import { I } from "../shared/icons.js";
import { createTaskbar } from "./taskbar.js";

// OmaBlob's Bar tab, the Windows way: the tray icon and the pet on the taskbar.
function taskbarPage(h, kit) {
  const { ft, isOn, flip } = kit;
  const pet = h.group("pet");
  const perched = (pet.home || "taskbar") === "taskbar";
  const trayPic = (props) => `<div style="width:30px;height:30px">${kit.pic(Object.assign({ size: 30, showAccessories: false }, props))}</div>`;
  return card({ title: "Tray icon", info: "Your blob by the clock. Click it for this panel, right click for its menu." }, grid(3,
      ft({ label: "Live", tip: "Blinks, bobs to music and watches your cursor. Keeps still while the pet sits on the taskbar", on: isOn("", "trayLive", true), art: trayPic({ faceOverride: "happy" }),
        act: on(() => flip("", "trayLive", true)) }) +
      ft({ label: "Moods", tip: "Shows its mood's face. Off keeps its resting face", on: isOn("", "trayMood", true), art: trayPic({ faceOverride: "surprised" }),
        act: on(() => flip("", "trayMood", true)) }) +
      ft({ label: "Outfits", tip: "Hats, headphones and glasses on the tray blob", on: isOn("", "trayWear", true), art: trayPic({ wear: { head: "tophat" } }),
        act: on(() => flip("", "trayWear", true)) })) +
      caption("While the pet sits on the taskbar, the tray blob keeps still, so only one blob moves on screen.")) +
    card({ title: "On the taskbar", info: "The desktop pet can sit on the taskbar's edge, by the tray. Drag it off to put it anywhere; its size is on the Pet page." }, grid(3,
      ft({ glyph: I.paw, label: "Shown", tip: "The pet on your screen. Off: only the tray blob", on: !!h.st.petEnabled, act: on(() => h.cmd("togglePet")) }) +
      ft({ glyph: I.bar, label: "Sits on it", tip: "Its home is the taskbar. Off: the bottom right corner", on: perched,
        act: on(() => h.saveIn("pet", "home", perched ? "bottom-right" : "taskbar")) }) +
      ft({ glyph: I.walk, label: "Walks along it", tip: "Strolls along the taskbar now and then", on: isOn("pet", "wander", true), act: on(() => flip("pet", "wander", true)) })) +
      `<div class="row center">${button({ glyph: I.home, text: "Back on the taskbar now", act: on(() => { if (!perched) h.saveIn("pet", "home", "taskbar"); h.cmd("resetPet"); }) })}</div>`) +
    caption("Why no bar blob like Omarchy's? Windows has no supported way for apps to add widgets to the taskbar, so Blobble lives in the tray and the pet can sit on the taskbar's edge.");
}

export default {
  id: "windows",
  os: "windows",
  name: "Windows",
  words: { home: "tray", back: "Back to the tray", trip: "Trips to the tray", tripTip: "Flies into the tray and back out", autostartTip: "Starts quietly in the tray when you sign in" },
  // The desktop pet's starting spot, and whether the map of the screen shows a taskbar to sit on.
  defaultHome: "taskbar",
  taskbarHome: true,
  mapBar: true,
  startLabel: "Start with Windows",
  monitorName: "Task Manager",
  aboutLine: "sits on your taskbar",
  actionLabels: { open: "Open Blobble", bar: "Back to the tray", btop: "Task Manager", dnd: "Notifications", power: "Power mode", nightlight: "Night light" },
  // Ring actions not done yet here.
  missingActions: ["ocr"],
  // Reactions it can feel; the rest are shown as "not on Windows yet".
  reactions: ["music", "workload", "sleep", "battery", "gaze", "poke", "typing", "disk", "network",
    "breaks", "downloads", "theme", "bedtime", "eyes", "water"],
  // Windows reads the pixel under the cursor itself (Chromium's eyedropper can lock the screen).
  nativeColourPicker: true,
  sizePreviews: false,
  // The taskbar and the tray as the pet page asks for them (see taskbar.js).
  taskbar: createTaskbar,
  settingsTab: { label: "Taskbar", page: taskbarPage },
  panelWidth: 404,
  // Nothing around the pet page: Windows closes its panel when it loses the focus, and the pet's
  // window is click-through by the cursor's position.
  host: null,
};
