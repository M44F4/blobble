// Everything the pet's ring menu can hold, and what a dropped file can become.

export const ACTIONS = [
  { id: "poke", icon: "\u{f0cfd}", label: "Poke it" },
  { id: "trick", icon: "\u{f0068}", label: "Do a trick" },
  { id: "studio", icon: "\u{f0674}", label: "Studio" },
  { id: "wardrobe", icon: "\u{f0a7b}", label: "Outfit" },
  { id: "moods", icon: "\u{f01f5}", label: "Pose a mood" },
  { id: "open", icon: "\u{f0493}", label: "Open Blobble" },
  { id: "focus", icon: "\u{f13ab}", drawn: "tomato", label: "Pomodoro" },
  { id: "timer", icon: "\u{f051b}", label: "Timer" },
  { id: "power", icon: "\u{f04c5}", label: "Power profile" },
  { id: "screenshot", icon: "\u{f0104}", label: "Screenshot" },
  { id: "ocr", icon: "\u{f113d}", label: "Copy text from screen" },
  { id: "picker", icon: "\u{f020a}", label: "Colour picker" },
  { id: "nightlight", icon: "\u{f0594}", label: "Night light" },
  { id: "keyboard", icon: "\u{f030c}", label: "Keyboard" },
  { id: "lock", icon: "\u{f033e}", label: "Lock the screen" },
  { id: "dnd", icon: "\u{f009b}", label: "Do not disturb" },
  { id: "btop", icon: "\u{f0128}", label: "btop" },
  { id: "home", icon: "\u{f02dc}", label: "Send it home" },
  { id: "petSettings", icon: "\u{f03e9}", label: "Pet settings" },
  { id: "bar", icon: "\u{f1513}", label: "Back to the bar" },
  { id: "hide", icon: "\u{f0209}", label: "Hide the pet" },
];

// Poking is a click away, so it is not here by default.
export const DEFAULT_RING = ["trick", "studio", "wardrobe", "focus", "screenshot", "ocr", "home", "bar"];
export const MAX_RING = 10;

export function byId(id) {
  for (const a of ACTIONS) if (a.id === id) return a;
  return null;
}

// The ring's actions from a saved list, keeping only known ones.
export function ring(saved) {
  const ids = Array.isArray(saved) && saved.length ? saved : DEFAULT_RING;
  const out = [];
  ids.forEach((id) => {
    const a = byId(id);
    if (a && out.indexOf(a) === -1 && out.length < MAX_RING) out.push(a);
  });
  return out.length ? out : DEFAULT_RING.map(byId);
}

const IMAGE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|svg)$/i;
const VIDEO = /\.(mp4|mkv|webm|mov|avi)$/i;

export function fileActions(paths) {
  const list = paths || [];
  const images = list.length > 0 && list.every((p) => IMAGE.test(p));
  const video = list.length === 1 && VIDEO.test(list[0]);
  const out = [];
  if (list.length === 1) out.push({ id: "openFile", icon: "\u{f0214}", label: "Open it" });
  if (images && list.length === 1) out.push({ id: "copyImage", icon: "\u{f018f}", label: "Copy the image" });
  if (images) {
    if (!list.every((p) => /\.png$/i.test(p))) out.push({ id: "png", icon: "\u{f0e2d}", label: list.length > 1 ? "Make them PNG" : "Make it a PNG" });
    if (!list.every((p) => /\.jpe?g$/i.test(p))) out.push({ id: "jpg", icon: "\u{f02e9}", label: list.length > 1 ? "Make them JPG" : "Make it a JPG" });
    out.push({ id: "shrink", icon: "\u{f0a68}", label: "Shrink by half" });
  }
  if (video) out.push({ id: "gif", icon: "\u{f0567}", label: "Make a GIF" });
  out.push({ id: "zip", icon: "\u{f05c4}", label: list.length > 1 ? "Zip them" : "Zip it" });
  out.push({ id: "copyPath", icon: "\u{f0337}", label: list.length > 1 ? "Copy the paths" : "Copy the path" });
  out.push({ id: "folder", icon: "\u{f0770}", label: "Show in folder" });
  return out;
}

function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

// Platform specific: builds a Linux shell command (magick, wl-copy, notify-send, xdg-open).
// Each app should provide its own runner for these ids.
export function fileCommand(id, paths) {
  const list = (paths || []).map(q).join(" ");
  const each = (body) => `for f in ${list}; do ${body}; done`;
  const free = `freename() { n="$1"; i=1; while [ -e "$n" ]; do n="\${1%.*}-$i.\${1##*.}"; i=$((i+1)); done; printf '%s' "$n"; }; `;
  const note = (title, body) => `notify-send -a Blobble -t 3000 ${q(title)} "${body}"`;
  switch (id) {
    case "copyImage":
      return `magick ${list} png:- | wl-copy --type image/png && ${note("Copied", "The image is on the clipboard")}`;
    case "png":
    case "jpg":
      return free + each(`out=$(freename "\${f%.*}.${id}"); magick "$f" "$out"`) + ` && ${note("Done", "Saved next to the original")}`;
    case "shrink":
      return free + each(`out=$(freename "\${f%.*}-small.\${f##*.}"); magick "$f" -resize 50% "$out"`) + ` && ${note("Done", "Smaller copies saved next to the originals")}`;
    case "gif":
      return free + each(`out=$(freename "\${f%.*}.gif"); ffmpeg -loglevel error -i "$f" -vf "fps=12,scale=480:-1:flags=lanczos" "$out"`) +
        ` && ${note("GIF made", "Saved next to the video")}`;
    case "zip": {
      const first = (paths || [])[0] || "files";
      const base = (paths || []).length > 1 ? first.replace(/\/[^/]*$/, "") + "/files.zip"
        : first.replace(/\/$/, "").replace(/(\/[^/]+)\.[^./]+$/, "$1") + ".zip";
      return free + `out=$(freename ${q(base)}); cd ${q(first.replace(/\/[^/]*$/, "") || "/")} && python3 -m zipfile -c "$out" ` +
        (paths || []).map((p) => q(p.replace(/^.*\//, ""))).join(" ") + ` && ${note("Zipped", "$out")}`;
    }
    case "copyPath":
      return `printf '%s' ${q((paths || []).join("\n"))} | wl-copy && ${note("Copied", "The path is on the clipboard")}`;
    case "openFile":
      return `xdg-open ${list}`;
    case "folder":
      return `xdg-open ${q(((paths || [])[0] || "/").replace(/\/[^/]*$/, "") || "/")}`;
  }
  return "";
}
