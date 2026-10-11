// The desktop this runs on, as one object: the words it uses, where the blob lives, which
// reactions and ring actions work, its settings tab, and its host (what it does around the
// pet page). The shared code asks this object; it never checks the OS itself.
import { SHELL } from "./detect.js";
import windows from "./windows.js";
import omarchy from "./omarchy.js";
import linux from "./linux.js";
import macos from "./macos.js";

export const desktop = { windows, omarchy, linux, macos }[SHELL];
