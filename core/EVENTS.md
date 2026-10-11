# Sensor contract

Every Blobble app (Omarchy, Wayland, GNOME, Windows, macOS) does two jobs:

1. Gather what is going on (its *sensors*, platform specific).
2. Feed it to `MoodEngine.resolve(input)` and draw the result with `Render.svg()` (shared).

Sensors only need to fill this object. Missing fields simply mean "unknown".

| Field | Shape | Linux source | Windows source |
|---|---|---|---|
| `now` | ms, monotonic | | |
| `date` | `Date` | | |
| `toggles` | `{ music: true, ... }` see `REACTIONS` | settings | settings |
| `thresholds` | see `DEFAULT_THRESHOLDS` | settings | settings |
| `asleep` | bool | idle-notify / Mutter IdleMonitor / XScreenSaver | GetLastInputInfo |
| `music` | `{ playing, title, artist, player }` | MPRIS (D-Bus) | GlobalSystemMediaTransportControls |
| `load` | `{ cpu, temp, strainedSince }` | /proc/stat, hwmon | PDH, WMI |
| `battery` | `{ present, percent, charging }` | UPower | GetSystemPowerStatus |
| `network` | `{ online }` | NetworkManager | NetworkListManager |
| `disk` | root disk use | statvfs | GetDiskFreeSpaceEx |
| `power` | power profile | power-profiles-daemon | power mode |
| `privacy` | mic, camera, screen in use | PipeWire | CapabilityAccessManager registry |
| `updates` | updates pending | PackageKit, flatpak | winget |
| `attention` | `{ urgent, detail }` | compositor IPC | SetWinEventHook (flash) |
| `typing`, `typedRecently` | bool | optional, /dev/input | optional |
| `events` | `[{ kind, at }]` kinds in `EVENT_MS` | | |

Event kinds: `notify`, `critical`, `poke`, `workspace`, `wake`, `windowOpen`, `windowClose`,
`commandOk`, `commandFail`, `focusDone`, `timerDone`, `fed`, `downloaded`, `themeChanged`.

The exact semantics live in `MoodEngine.mjs`; read `resolve()` when adding a sensor.
The playground (`playground/index.html`) is a fake sensor set and the reference for wiring.
