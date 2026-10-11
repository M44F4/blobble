// Decides how the blob looks from what is going on.

export const REACTIONS = [
  "music", "workload", "sleep", "workspaces", "notifications", "battery", "gaze", "poke", "typing",
  "windows", "attention", "commands", "updates", "disk", "network", "power", "breaks",
  "privacy", "downloads", "theme", "bedtime", "eyes", "water",
];

export const OPT_IN = ["typing", "breaks", "bedtime", "eyes", "water"];

export const DRESS = ["asleep", "music", "strained", "typing", "coding", "performance", "focus", "seasonal"];
// Off unless switched on: Omarchy runs laptops on performance whenever they are plugged in, so
// the shades would hardly ever come off.
export const DRESS_OPT_IN = ["performance"];

export const DEFAULT_THRESHOLDS = {
  busy: 60,          // CPU % that makes it thoughtful
  strained: 85,      // CPU % that makes it sweat...
  strainedFor: 10,   // ...after this many seconds
  hot: 90,           // degrees C
  lowBattery: 20,
  criticalBattery: 10,
  diskFull: 90,      // % of the root disk
};

export const EVENT_MS = {
  notify: 1600,
  critical: 2600,
  poke: 1300,
  workspace: 900,
  wake: 1800,
  windowOpen: 900,
  windowClose: 1100,
  commandOk: 3500,
  commandFail: 4500,
  focusDone: 5000,
  timerDone: 6000,
  fed: 1600,
  downloaded: 3000,
  themeChanged: 2500,
};

const POKE_FACES = ["happy", "wink", "love", "shy", "smug"];

export const MILD_BELOW = 45;

function on(toggles, key) {
  if (!toggles) return OPT_IN.indexOf(key) === -1;
  return OPT_IN.indexOf(key) !== -1 ? toggles[key] === true : toggles[key] !== false;
}

function recent(events, now, kind) {
  let hit = null;
  for (const e of events || []) {
    if (e.kind !== kind) continue;
    if (now - e.at > (EVENT_MS[kind] || 1000)) continue;
    if (!hit || e.at > hit.at) hit = e;
  }
  return hit;
}

export function seasonal(month, day) {
  if (month === 12 && day >= 1) return "santa";
  if (month === 10 && day === 31) return "witch";
  if (month === 1 && day === 1) return "party";
  return "";
}

function minutes(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m + " min";
}

export function resolve(input) {
  const i = input || {};
  const now = i.now || 0;
  const t = Object.assign({}, DEFAULT_THRESHOLDS, i.thresholds);
  const toggles = i.toggles || {};
  const load = i.load || {};
  const music = i.music || {};
  const battery = i.battery || {};
  const events = i.events || [];
  const attention = i.attention || {};

  const out = {
    face: "idle",
    motion: { breath: 1, bob: 0, shake: 0, droop: 0, hop: 0, type: 0 },
    tint: null,
    accessories: [],
    wear: { head: "", face: "", neck: "", ears: "", hand: "" },
    gaze: null,       // { x, y } override in -1..1, or null to follow the cursor
    eyesClosed: false,
    reasons: [],
    mild: true,
  };

  const faces = [];
  const face = (priority, name) => faces.push({ priority, name });
  const reason = (key, label, detail) => out.reasons.push({ key, label, detail: detail || "" });
  const dressed = { head: null, face: null };
  const dress = (key, slot, item, priority) => {
    if (!i.dress || i.dress[key] !== true) return;
    if (!dressed[slot] || dressed[slot].priority < priority) dressed[slot] = { item, priority, key };
  };

  const asleep = on(toggles, "sleep") && !!i.asleep;
  if (asleep) {
    face(100, "sleepy");
    out.eyesClosed = true;
    out.motion.breath = 0.5;
    out.accessories.push("zzz");
    dress("asleep", "head", "nightcap", 100);
    reason("asleep", "Sleeping", "You are away");
  }

  if (!asleep) {
    if (on(toggles, "notifications")) {
      const crit = recent(events, now, "critical");
      const note = recent(events, now, "notify");
      if (crit) {
        face(90, "scared");
        out.motion.hop = 1;
        out.accessories.push("alert");
        out.gaze = { x: 0.6, y: -0.8 };
      } else if (note) {
        face(90, "surprised");
        out.motion.hop = 1;
        out.accessories.push("alert");
        out.gaze = { x: 0.6, y: -0.8 };
      }
    }
    if (on(toggles, "poke")) {
      const poke = recent(events, now, "poke");
      if (poke) {
        const n = poke.n || 1;
        face(89, n >= 5 ? "mad" : POKE_FACES[n % POKE_FACES.length]);
        out.motion.hop = Math.max(out.motion.hop, 1);
      }
    }
    if (on(toggles, "workspaces")) {
      const ws = recent(events, now, "workspace");
      if (ws && !out.gaze) out.gaze = { x: ws.dir < 0 ? -1 : 1, y: 0 };
    }
    const wake = recent(events, now, "wake");
    if (wake) face(88, "surprised");

    if (on(toggles, "windows")) {
      const open = recent(events, now, "windowOpen");
      const close = recent(events, now, "windowClose");
      if (open && (!close || open.at >= close.at)) {
        if (!out.gaze) out.gaze = { x: open.dir || 0, y: -0.4 };
      } else if (close) {
        face(55, "wink");
      }
    }

    if (on(toggles, "commands")) {
      const ok = recent(events, now, "commandOk");
      const fail = recent(events, now, "commandFail");
      if (fail && (!ok || fail.at >= ok.at)) {
        face(86, "sad");
        out.accessories.push("alert");
      } else if (ok) {
        face(86, "happy");
        out.motion.hop = Math.max(out.motion.hop, 1);
        out.accessories.push("check");
      }
    }
    if (recent(events, now, "focusDone")) {
      face(86, "happy");
      out.motion.hop = Math.max(out.motion.hop, 1);
      out.accessories.push("check");
    }
    if (recent(events, now, "timerDone")) {
      face(91, "surprised");
      out.motion.hop = 1;
      out.accessories.push("alert");
      out.gaze = { x: 0, y: -1 };
    }
    if (on(toggles, "downloads") && recent(events, now, "downloaded")) {
      face(85, "happy");
      out.motion.hop = Math.max(out.motion.hop, 1);
      out.accessories.push("download");
    }
    if (on(toggles, "theme") && recent(events, now, "themeChanged")) {
      face(85, "love");
      out.accessories.push("sparkle");
    }
    if (recent(events, now, "fed")) {
      face(86, "love");
      out.motion.hop = Math.max(out.motion.hop, 1);
    }
  }

  // A window asking for you (Hyprland marks it urgent): it looks up at you with a question
  // until you go and see.
  if (on(toggles, "attention") && attention.urgent && !asleep) {
    face(84, "surprised");
    out.accessories.push("question");
    if (!out.gaze) out.gaze = { x: 0.5, y: -0.9 };
    reason("asking", "Something needs you", attention.detail || "A window is asking for you");
  }

  const privacy = i.privacy || {};
  if (on(toggles, "privacy") && (privacy.mic || privacy.camera || privacy.screen)) {
    out.accessories.push("rec");
    if (privacy.screen) out.accessories.push("screen");
    if (privacy.camera) out.accessories.push("camera");
    if (privacy.mic) out.accessories.push("mic");
    if (!asleep && !out.gaze) out.gaze = { x: 0.8, y: -0.15 };
    const what = [privacy.mic && "Microphone", privacy.camera && "Camera", privacy.screen && "Screen recording"].filter(Boolean);
    reason("privacy", what.length > 1 ? "Listening and watching" : privacy.screen ? "Recording" : privacy.camera ? "Camera on" : "Listening",
      what.join(", ") + " in use");
  }

  if (on(toggles, "battery") && battery.present) {
    const pct = battery.percent;
    if (battery.charging) {
      face(40, "happy");
      out.accessories.push("charging");
      reason("charging", "Charging", Math.round(pct) + "%");
    } else if (pct <= t.criticalBattery) {
      face(80, "sick");
      out.tint = "pale";
      out.motion.droop = 1;
      reason("critical", "Running on empty", Math.round(pct) + "% battery");
    } else if (pct <= t.lowBattery) {
      face(30, "sad");
      out.motion.droop = 0.5;
      reason("low", "Getting tired", Math.round(pct) + "% battery");
    }
  }

  if (on(toggles, "workload")) {
    const cpu = load.cpu || 0;
    const strained = cpu >= t.strained && load.strainedSince &&
      now - load.strainedSince >= t.strainedFor * 1000;
    const hot = typeof load.temp === "number" && load.temp >= t.hot;
    if (hot) {
      face(60, "mad");
      out.tint = out.tint || "hot";
      out.accessories.push("sweat");
      reason("hot", "Overheating", Math.round(load.temp) + "°C");
    }
    if (strained) {
      face(70, "unsure");
      out.motion.shake = Math.min(1, (cpu - t.strained) / Math.max(1, 100 - t.strained) * 0.7 + 0.3);
      if (!hot) out.accessories.push("sweat");
      dress("strained", "head", "headband", 70);
      reason("strained", "Strained", "CPU " + Math.round(cpu) + "%");
    } else if (cpu >= t.busy) {
      face(20, "thinking");
      reason("busy", "Busy", "CPU " + Math.round(cpu) + "%");
    }
  }

  if (on(toggles, "typing") && i.typing && !asleep) {
    face(25, "idle");
    if (!out.gaze) out.gaze = { x: 0, y: 1 };
    reason("typing", "Typing", "Watching you work");
  }
  if (on(toggles, "typing") && (i.typing || i.typedRecently) && !asleep) dress("typing", "face", "monocle", 60);
  if (i.coding && !asleep) dress("coding", "face", "glasses", 40);

  if (on(toggles, "music") && music.playing) {
    face(50, "happy");
    out.motion.bob = asleep ? 0 : 1;
    if (!asleep) {
      out.accessories.push("notes");
      dress("music", "head", "headphones", 60);
    }
    const track = [music.artist, music.title].filter(Boolean).join(", ");
    reason("music", "Grooving", track || music.player || "Music playing");
  }

  if (on(toggles, "power") && i.power && i.power.profile) {
    if (i.power.profile === "performance") {
      dress("performance", "face", "sunglasses", 30);
      reason("performance", "Performance mode", "");
    } else if (i.power.profile === "power-saver") {
      out.accessories.push("leaf");
      reason("saver", "Power saver", "");
    }
  }

  const focus = i.focus || {};
  const focusLeft = focus.left || 0;
  if (focus.phase === "short" || focus.phase === "long") {
    if (!asleep) {
      face(44, "happy");
      out.accessories.push("coffee");
    }
    reason("pomoBreak", focus.phase === "long" ? "Long break" : "Break", minutes(focusLeft) + " left");
  } else if (focus.phase === "work") {
    dress("focus", "head", "headband", 50);
    reason("focus", focus.paused ? "Focus paused" : "Focusing", minutes(focusLeft) + " left");
  }
  if (on(toggles, "eyes") && i.eyeBreak && !asleep) {
    face(47, "idle");
    out.gaze = { x: 1, y: -0.6 };
    out.accessories.push("eye");
    reason("eyes", "Rest your eyes", "Look at something far away for 20 seconds");
  }
  if (on(toggles, "water") && i.waterDue && !asleep) {
    face(46, "happy");
    out.accessories.push("water");
    reason("water", "Have a drink", "A sip of water");
  }
  if (on(toggles, "bedtime") && i.bedtime && !asleep) {
    face(48, "sleepy");
    out.motion.droop = Math.max(out.motion.droop, 0.4);
    out.accessories.push("moon");
    dress("asleep", "head", "nightcap", 90);
    reason("bedtime", "Bedtime", "It's late. Time to wind down");
  }
  if (on(toggles, "breaks") && i.breakDue && !asleep) {
    face(46, "sleepy");
    out.accessories.push("coffee");
    reason("break", "Time for a break", "You have been at it a while");
  }

  if (on(toggles, "network") && i.network && i.network.online === false && !asleep) {
    face(32, "unsure");
    out.accessories.push("offline");
    reason("offline", "Offline", "No network");
  }
  if (on(toggles, "disk") && i.disk && i.disk.percent >= t.diskFull) {
    face(31, "unsure");
    reason("disk", "Disk almost full", Math.round(i.disk.percent) + "% used");
  }
  if (on(toggles, "updates") && i.updates && i.updates.available) {
    out.accessories.push("package");
    reason("updates", "Updates ready", i.updates.detail || "");
  }

  if (i.date) dress("seasonal", "head", seasonal(i.date.month, i.date.day), 10);

  faces.sort((a, b) => b.priority - a.priority);
  out.mild = !faces.length || faces[0].priority < MILD_BELOW;
  // Most important reason first, in the same order the face is chosen.
  const rank = ["asleep", "asking", "privacy", "critical", "strained", "hot", "bedtime", "eyes", "water", "break", "pomoBreak", "music", "focus", "typing",
    "offline", "disk", "charging", "low", "busy", "performance", "saver", "updates"];
  out.reasons.sort((a, b) => rank.indexOf(a.key) - rank.indexOf(b.key));
  if (faces.length) out.face = faces[0].name;
  if (!out.reasons.length) reason("calm", "Calm", "Nothing going on");

  // Asleep wins the face but keeps the music reason; symbols are capped so the blob never
  // drowns in them.
  const order = ["alert", "rec", "question", "download", "sparkle", "eye", "water", "moon", "check", "zzz", "sweat", "notes", "keys", "coffee", "offline", "charging", "leaf", "package", "mic", "camera", "screen"];
  out.accessories = Array.from(new Set(out.accessories))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .slice(0, 3);

  const picked = i.outfit || {};
  out.dressedBy = {
    head: dressed.head && dressed.head.item ? dressed.head.key : "",
    face: dressed.face && dressed.face.item ? dressed.face.key : "",
  };
  out.wear = {
    head: dressed.head && dressed.head.item ? dressed.head.item : (picked.head && picked.head !== "none" ? picked.head : ""),
    face: dressed.face && dressed.face.item ? dressed.face.item : (picked.face && picked.face !== "none" ? picked.face : ""),
    neck: picked.neck && picked.neck !== "none" ? picked.neck : "",
    ears: picked.ears && picked.ears !== "none" ? picked.ears : "",
    hand: picked.hand && picked.hand !== "none" ? picked.hand : "",
    tint: picked.tint || "auto",
  };
  return out;
}
