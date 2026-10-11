// Any Linux desktop that is not Omarchy (GNOME, KDE, Sway, XFCE...). The blob is a tray icon (which
// needs libayatana-appindicator, and the AppIndicator extension on plain GNOME) and the desktop
// pet is a layer where the compositor has the layer shell, else a plain window.
import { trayPage } from "./tray-page.js";
import { layerHost } from "./layer.js";
import { createTaskbar } from "./taskbar.js";

export default {
  id: "linux",
  os: "linux",
  name: "Linux",
  words: { home: "tray", back: "Back to the tray", trip: "Trips to the tray", tripTip: "Flies into the tray and back out", autostartTip: "Starts quietly in the tray when you sign in" },
  defaultHome: "bottom-right",
  taskbarHome: false,
  mapBar: false,
  startLabel: "Start on login",
  monitorName: "the system monitor",
  aboutLine: "sits on your desktop",
  actionLabels: { open: "Open Blobble", bar: "Back to the tray", btop: "System monitor", dnd: "Do not disturb", power: "Power mode", nightlight: "Night light" },
  missingActions: ["ocr", "keyboard"],
  reactions: ["music", "workload", "sleep", "battery", "gaze", "poke", "disk", "network",
    "breaks", "downloads", "theme", "bedtime", "eyes", "water"],
  nativeColourPicker: false,
  sizePreviews: false,
  // The taskbar and the tray as the pet page asks for them (see taskbar.js).
  taskbar: createTaskbar,
  settingsTab: { label: "Tray", page: trayPage("Your blob in the tray. Click it for this panel, right click for its menu.", "tray") },
  panelWidth: 404,
  host: layerHost,
};
