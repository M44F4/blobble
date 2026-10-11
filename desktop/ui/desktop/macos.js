// macOS. Little is done yet (see docs): the blob is a menu bar item and the desktop pet.
import { trayPage } from "./tray-page.js";
import { createTaskbar } from "./taskbar.js";

export default {
  id: "macos",
  os: "macos",
  name: "macOS",
  words: { home: "menu bar", back: "Back to the menu bar", trip: "Trips to the menu bar", tripTip: "Flies into the menu bar and back out", autostartTip: "Starts quietly in the menu bar when you sign in" },
  defaultHome: "bottom-right",
  taskbarHome: false,
  mapBar: false,
  startLabel: "Start on login",
  monitorName: "the system monitor",
  aboutLine: "sits on your desktop",
  actionLabels: { open: "Open Blobble", bar: "Back to the menu bar" },
  missingActions: ["ocr", "screenshot", "nightlight", "dnd", "power", "btop", "keyboard", "lock"],
  reactions: ["poke", "breaks", "bedtime", "eyes", "water"],
  nativeColourPicker: false,
  sizePreviews: false,
  // The taskbar and the tray as the pet page asks for them (see taskbar.js).
  taskbar: createTaskbar,
  settingsTab: { label: "Tray", page: trayPage("Your blob in the menu bar. Click it for this panel, right click for its menu.", "menu bar") },
  panelWidth: 404,
  host: null,
};
