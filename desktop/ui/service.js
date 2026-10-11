// The blob's brain, like OmaBlob's Service.qml: settings, mood, today's stats, the Pomodoro,
// the timer and the gentle nudges. It runs in the pet's page; the panel sees it through
// "state" events and talks back with "cmd" events.
import * as Mood from "./core/MoodEngine.mjs";

const { invoke } = window.__TAURI__.core;
const { listen, emitTo } = window.__TAURI__.event;


function dateKey() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
function freshDay() {
  return { date: dateKey(), awake: 0, asleep: 0, songs: 0, workspaces: 0, pokes: 0, notifications: 0,
    commands: 0, focus: 0, pomodoros: 0, fed: 0, downloads: 0 };
}
function nightKey() {
  const d = new Date(Date.now() - 5 * 3600000);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
export function clockText(ms) {
  const sec = Math.ceil(ms / 1000);
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, r = sec % 60;
  return (h ? h + ":" : "") + (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

export class Service {
  constructor() {
    this.settings = {};
    this.mood = Mood.resolve({ now: Date.now() });
    this.events = [];
    this.attention = {};
    this.sim = {};
    this.priv = {};   // the microphone, a camera, a screen recording: what the desktop says is in use
    this.updates = {};
    this.today = freshDay();
    this.s = { cpu: 0, ram: 0, music: {}, online: true, diskPercent: 0, coding: false, fullscreen: false,
      accent: "#7aa2f7", dark: true, download: {}, idleMs: 0, battery: null };
    this.strainedSince = 0;
    this.lastSong = "";
    this.listeners = {};
    this.dragging = false;
    this.lastPointerMove = Date.now();
    this.typing = false;
    this.typedRecently = false;
    this.startedUp = false;
    this.themeKey = "";
    this.downloadSeen = null;
    this.lastDownload = "";
    this.lastDownloadAt = 0;
    this.awakeStreak = 0;
    this.eyeMinutes = 0; this.waterMinutes = 0;
    this.eyeBreak = false; this.waterDue = false;
    this.bedtimeSnoozed = ""; this.bedtimeTold = ""; this.lateNow = false;
    this.lastAntic = "";
    this.anticsDone = 0;
    this.pomo = { phase: "", length: 0, endsAt: 0, paused: false, leftWhenPaused: 0, done: 0 };
    this.timer = { endsAt: 0, length: 0, paused: false, leftWhenPaused: 0 };
    this.lastStudio = {};
    this.autostart = false;
  }

  // --- events for the pet page ---------------------------------------------------------
  on(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
  fire(name, ...args) { (this.listeners[name] || []).forEach((fn) => fn(...args)); }

  // --- settings ------------------------------------------------------------------------
  group(name) {
    const v = this.settings[name];
    return v && typeof v === "object" ? v : {};
  }
  setting(name, fallback) {
    const v = this.settings[name];
    return v === undefined || v === null ? fallback : v;
  }
  groupValue(g, name, fallback) {
    const v = this.group(g)[name];
    return v === undefined || v === null ? fallback : v;
  }
  get active() { return this.settings.active !== false; }
  reacts(key) {
    if (!this.active) return false;
    const r = this.group("reactions");
    return Mood.OPT_IN.indexOf(key) !== -1 ? r[key] === true : r[key] !== false;
  }
  feature(key, fallback) {
    const v = this.group("features")[key];
    return this.active && (v === undefined ? fallback !== false : v === true);
  }
  get seed() { return this.settings.seed || this.username || "blob"; }
  get look() {
    const s = this.settings;
    return {
      shape: s.shape || "seed", hue: s.hue === undefined ? "seed" : s.hue, tone: s.tone === undefined ? "seed" : s.tone,
      background: s.background || "none", backdropColour: s.backdropColour || "auto",
      themeMode: s.themeMode || "tinted", bodyColour: s.bodyColour || "", restingFace: s.restingFace || "idle",
    };
  }
  get themeAccent() { return this.s.accent || "#7aa2f7"; }
  get accent() { return /^#[0-9a-fA-F]{6}$/.test(this.settings.accentColour || "") ? this.settings.accentColour : this.themeAccent; }
  get reduceMotion() { return this.settings.reduceMotion === true; }
  get idleTimeout() { return Math.max(10, Number(this.settings.idleTimeout) || 120); }
  get petEnabled() { return this.group("pet").enabled !== false; }
  get dress() {
    const g = this.group("dress");
    const auto = this.active && g.auto !== false;
    const out = {};
    Mood.DRESS.forEach((k) => { out[k] = auto && (Mood.DRESS_OPT_IN.indexOf(k) !== -1 ? g[k] === true : g[k] !== false); });
    return out;
  }
  get outfit() {
    const s = this.settings;
    return { head: s.wearHead || "", face: s.wearFace || "", neck: s.wearNeck || "", ears: s.wearEars || "", hand: s.wearHand || "",
      tint: s.wearColour === "theme" ? this.accent : (s.wearColour || "auto") };
  }

  save(name, value) { const c = {}; c[name] = value; this.saveMany(c); }
  saveIn(g, name, value) {
    const o = Object.assign({}, this.group(g));
    o[name] = value;
    this.save(g, o);
  }
  saveMany(changes) {
    const before = this.settings;
    this.settings = Object.assign({}, this.settings, changes);
    clearTimeout(this.saveSettingsSoon);
    this.saveSettingsSoon = setTimeout(() => invoke("save_state", { name: "settings", text: JSON.stringify(this.settings) }), 300);
    if (!this.pomodoroOn && this.focusing) this.stopFocus();
    if (!this.timerOn && this.timing) this.stopTimer();
    this.checkBedtime();
    this.fire("settings", this.settings, before);
    this.refresh();
  }

  // --- mood ----------------------------------------------------------------------------
  push(kind, extra) {
    const now = Date.now();
    const kept = this.events.filter((e) => now - e.at < 8000);
    const e = Object.assign({ kind, at: now }, extra || {});
    if (kind === "poke") {
      const last = kept.filter((x) => x.kind === "poke" && now - x.at < 2500);
      e.n = last.length ? last[last.length - 1].n + 1 : 1;
    }
    kept.push(e);
    this.events = kept;
    this.count({ poke: "pokes", workspace: "workspaces", notify: "notifications", critical: "notifications",
      commandOk: "commands", commandFail: "commands", fed: "fed", downloaded: "downloads" }[kind]);
    if (kind === "windowOpen" || kind === "windowClose") this.fire("hop", 0.4, 0);
    else this.fire("hop", 1, 0);
    this.refresh();
  }
  poke() { if (this.reacts("poke")) this.push("poke"); }
  // A long command ended (see the shell snippet): cheers if it worked, sulks if not.
  commandDone(status, seconds) {
    if (!this.reacts("commands") || this.asleep) return;
    this.push(Number(status) === 0 ? "commandOk" : "commandFail", { seconds: Number(seconds) || 0 });
  }
  get privacy() { const p = this.priv; return { mic: !!p.mic, camera: !!p.camera, screen: !!(p.screencast || p.recorder) }; }

  // Things the desktop tells it ("blob:event", from the Rust side, whichever OS): a notification,
  // a workspace change, a window opening or closing, one asking for you, a screen recording, updates.
  system(ev) {
    const awake = !this.asleep;
    switch (ev.kind) {
      case "notify": case "critical": if (this.reacts("notifications")) this.push(ev.kind); break;
      case "workspace": if (this.reacts("workspaces") && awake) this.push("workspace", { dir: ev.dir }); break;
      case "windowOpen": case "windowClose": if (this.reacts("windows") && awake) this.push(ev.kind, { dir: ev.dir || 0 }); break;
      case "attention": this.attention = ev.on ? { urgent: true } : {}; this.refresh(); break;
      case "screencast": this.priv.screencast = !!ev.on; this.refresh(); break;
      case "privacy": Object.assign(this.priv, { mic: !!ev.mic, camera: !!ev.camera, recorder: !!ev.recorder }); this.refresh(); break;
      case "configreloaded": this.fire("keys"); break;
      case "updates": this.updates = ev.on ? { available: true, detail: ev.detail || "" } : {}; this.refresh(); break;
    }
  }
  fed() { this.push("fed"); }

  get asleep() { return (this.reacts("sleep") && this.s.idleMs >= this.idleTimeout * 1000) || this.sim.asleep === true; }

  // Puts it in a state, to see how it looks (`blobble --bar simulate asleep,charging`; nothing clears: `simulate`).
  simulate(list) {
    this.sim = {};
    String(list || "").split(",").forEach((k) => {
      const key = k.trim();
      if (key === "notify") this.push("notify");   // a moment, not a state
      else if (key) this.sim[key] = true;
    });
    this.refresh();
  }
  get hasBattery() { return !!(this.s.battery && this.s.battery.present); }
  get batteryPercent() { return this.s.battery ? this.s.battery.percent : 100; }
  get charging() { return !!(this.s.battery && this.s.battery.charging); }

  input() {
    const now = Date.now();
    const d = new Date();
    const m = this.s.music || {};
    return {
      now,
      toggles: this.active ? this.group("reactions") : Object.fromEntries(Mood.REACTIONS.map((k) => [k, false])),
      thresholds: this.group("thresholds"),
      asleep: this.asleep,
      typing: this.typing,
      typedRecently: this.typedRecently,
      coding: this.s.coding,
      music: { playing: !!m.playing || this.sim.music === true, title: m.title || "", artist: m.artist || "", player: m.player || "" },
      load: { cpu: this.sim.strained ? 96 : this.s.cpu, ram: this.s.ram, temp: this.s.temp == null ? undefined : this.s.temp, strainedSince: this.sim.strained ? Date.now() - 60000 : this.strainedSince },
      attention: this.attention,
      privacy: this.privacy,
      updates: this.updates,
      power: { profile: this.s.powerProfile || "" },
      battery: this.sim.charging ? { present: true, percent: 60, charging: true } : { present: this.hasBattery, percent: this.batteryPercent, charging: this.charging },
      events: this.events,
      disk: { percent: this.s.diskPercent },
      network: { online: this.sim.offline ? false : this.s.online },
      focus: { phase: this.pomo.phase, left: this.pomoLeft, paused: this.pomo.paused },
      breakDue: this.breakDue,
      bedtime: this.bedtimeDue,
      eyeBreak: this.eyeBreak,
      waterDue: this.waterDue,
      outfit: this.outfit,
      dress: this.dress,
      date: { month: d.getMonth() + 1, day: d.getDate() },
    };
  }

  refresh() {
    const next = Mood.resolve(this.input());
    const now = Date.now();
    const direct = this.events.some((e) => (e.kind === "poke" || e.kind === "fed") && now - e.at < (Mood.EVENT_MS[e.kind] || 1000));
    if (this.settings.keepFace === true && !direct) { next.face = "idle"; next.mild = true; }
    if (JSON.stringify(next) !== JSON.stringify(this.mood)) {
      this.mood = next;
      this.fire("mood", next);
    }
    this.scheduleExpiry();
    this.broadcast();
  }

  scheduleExpiry() {
    const now = Date.now();
    let due = Infinity;
    for (const e of this.events) {
      const end = e.at + (Mood.EVENT_MS[e.kind] || 1000);
      if (end > now) due = Math.min(due, end);
    }
    if (this.strainedSince) {
      const t = Object.assign({}, Mood.DEFAULT_THRESHOLDS, this.group("thresholds"));
      const at = this.strainedSince + t.strainedFor * 1000;
      if (at > now) due = Math.min(due, at);
    }
    clearTimeout(this.expiry);
    if (due !== Infinity) this.expiry = setTimeout(() => this.refresh(), Math.max(30, due - now + 20));
  }

  // --- today ---------------------------------------------------------------------------
  count(key, amount) {
    if (!key) return;
    const day = this.today.date === dateKey() ? Object.assign({}, this.today) : freshDay();
    day[key] = (day[key] || 0) + (amount === undefined ? 1 : amount);
    this.today = day;
    clearTimeout(this.saveStatsSoon);
    this.saveStatsSoon = setTimeout(() => invoke("save_state", { name: "stats", text: JSON.stringify(this.today) }), 5000);
  }

  // --- sensors -------------------------------------------------------------------------
  async poll() {
    let s;
    try { s = await invoke("sensors"); } catch (e) { return; }
    const was = { asleep: this.asleep, title: (this.s.music || {}).title, playing: (this.s.music || {}).playing };
    Object.assign(this.s, s);
    const now = Date.now();
    const t = Object.assign({}, Mood.DEFAULT_THRESHOLDS, this.group("thresholds"));
    if (this.reacts("workload") && this.s.cpu >= t.strained) { if (!this.strainedSince) this.strainedSince = now; }
    else this.strainedSince = 0;

    const m = this.s.music || {};
    if (m.playing && m.title && m.title !== this.lastSong) { this.lastSong = m.title; this.count("songs"); }

    // Typing: input is coming in but the pointer has not moved.
    const typingNow = this.reacts("typing") && !this.asleep && this.s.idleMs < 700 && now - this.lastPointerMove > 1500;
    if (typingNow !== this.typing) {
      this.typing = typingNow;
      if (typingNow) { this.typedRecently = true; clearTimeout(this.typedLinger); }
      else this.typedLinger = setTimeout(() => { this.typedRecently = false; this.refresh(); }, 8000);
    }

    if (was.asleep !== this.asleep) {
      if (!this.asleep) this.push("wake");
      else { this.awakeStreak = 0; this.fire("asleep"); }
    }

    // A new file in Downloads.
    const d = this.s.download || {};
    // What is there in the first seconds is not new: only later files make it cheer.
    if (!this.startedUp || this.downloadSeen === null) this.downloadSeen = Math.max(this.downloadSeen || 0, d.at || 0);
    else if (d.at && d.at > this.downloadSeen) {
      this.downloadSeen = d.at;
      if (this.reacts("downloads") && !this.asleep) {
        this.lastDownload = d.path;
        this.lastDownloadAt = now;
        this.push("downloaded");
      }
    }

    // A new accent colour or light/dark switch.
    const key = this.s.accent + (this.s.dark ? "d" : "l");
    if (this.themeKey && key !== this.themeKey && this.startedUp && this.reacts("theme")) {
      this.push("themeChanged");
      if (!this.reduceMotion) this.doAntic("spin");
    }
    this.themeKey = key;
    this.refresh();
  }
  freshDownload() { return Date.now() - this.lastDownloadAt < 10000 ? this.lastDownload : ""; }

  // --- Pomodoro --------------------------------------------------------------------------
  get pomodoroOn() { return this.feature("pomodoro", true); }
  get focusing() { return this.pomo.phase !== ""; }
  get onBreak() { return this.pomo.phase === "short" || this.pomo.phase === "long"; }
  get focusMinutes() { return Math.max(1, Number(this.group("features").focusMinutes) || 25); }
  get shortBreakMinutes() { return Math.max(1, Number(this.group("features").shortBreak) || 5); }
  get longBreakMinutes() { return Math.max(1, Number(this.group("features").longBreak) || 15); }
  get longBreakEvery() { return Math.max(2, Number(this.group("features").longBreakEvery) || 4); }
  get pomoLeft() {
    if (!this.focusing) return 0;
    return this.pomo.paused ? this.pomo.leftWhenPaused : Math.max(0, this.pomo.endsAt - Date.now());
  }
  get pomoProgress() { return this.pomo.length > 0 ? 1 - this.pomoLeft / (this.pomo.length * 60000) : 0; }
  get pomoClock() {
    const sec = Math.ceil(this.pomoLeft / 1000);
    const m = Math.floor(sec / 60), r = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }
  get pomoLabel() { return { work: "Focus", long: "Long break", short: "Break" }[this.pomo.phase] || ""; }
  phaseMinutes(p) { return p === "work" ? this.focusMinutes : p === "long" ? this.longBreakMinutes : this.shortBreakMinutes; }
  startPhase(phase, minutes) {
    this.pomo.phase = phase;
    this.pomo.length = Math.max(1, Number(minutes) || this.phaseMinutes(phase));
    this.pomo.paused = false;
    this.pomo.endsAt = Date.now() + this.pomo.length * 60000;
    this.refresh();
  }
  startFocus(minutes) {
    if (!this.pomodoroOn) return;
    this.pomo.done = 0;
    this.startPhase("work", minutes);
    this.pomoSay("Focus", this.pomo.length + " minutes. You've got this.");
  }
  stopFocus() { if (!this.focusing) return; this.pomo.phase = ""; this.pomo.paused = false; this.refresh(); }
  pauseFocus() {
    if (!this.focusing) return;
    if (this.pomo.paused) { this.pomo.endsAt = Date.now() + this.pomo.leftWhenPaused; this.pomo.paused = false; }
    else { this.pomo.leftWhenPaused = Math.max(0, this.pomo.endsAt - Date.now()); this.pomo.paused = true; }
    this.refresh();
  }
  skipPhase() { if (this.focusing) this.finishPhase(true); }
  finishPhase(skipped) {
    if (this.pomo.phase === "work") {
      if (!skipped) { this.count("focus", this.pomo.length); this.count("pomodoros"); this.push("focusDone"); }
      this.pomo.done++;
      const long = this.pomo.done % this.longBreakEvery === 0;
      this.startPhase(long ? "long" : "short");
      this.pomoSay(long ? "Long break" : "Break time", this.pomo.length + " minutes. Stand up, stretch, get a drink.");
      if (!this.reduceMotion) this.doAntic("stretch");
    } else {
      this.startPhase("work");
      this.pomoSay("Back to focus", this.pomo.length + " minutes.");
    }
  }
  pomoSay(title, body) { if (this.feature("pomodoroNotify", true)) this.say(title, body); }
  get showPomoTime() { return this.focusing && this.pomodoroOn && this.feature("pomodoroTime", true); }

  // --- Timer -----------------------------------------------------------------------------
  get timerOn() { return this.feature("timer", true); }
  get timing() { return this.timer.length > 0; }
  get timerLeft() {
    if (!this.timing) return 0;
    return this.timer.paused ? this.timer.leftWhenPaused : Math.max(0, this.timer.endsAt - Date.now());
  }
  get timerProgress() { return this.timing ? 1 - this.timerLeft / (this.timer.length * 1000) : 0; }
  get timerClock() { return clockText(this.timerLeft); }
  get timerMinutes() { return Math.max(1, Number(this.group("features").timerMinutes) || 5); }
  get showTimerTime() { return this.timing && this.timerOn && this.feature("timerTime", true); }
  startTimer(seconds) {
    if (!this.timerOn) return;
    this.timer.length = Math.max(1, Math.round(Number(seconds) || this.timerMinutes * 60));
    this.timer.paused = false;
    this.timer.endsAt = Date.now() + this.timer.length * 1000;
    this.broadcast();
  }
  pauseTimer() {
    if (!this.timing) return;
    if (this.timer.paused) { this.timer.endsAt = Date.now() + this.timer.leftWhenPaused; this.timer.paused = false; }
    else { this.timer.leftWhenPaused = Math.max(0, this.timer.endsAt - Date.now()); this.timer.paused = true; }
    this.broadcast();
  }
  addTimer(seconds) {
    if (!this.timing) return this.startTimer(seconds);
    this.timer.length += seconds;
    if (this.timer.paused) this.timer.leftWhenPaused += seconds * 1000;
    else this.timer.endsAt += seconds * 1000;
    this.broadcast();
  }
  stopTimer() { this.timer.length = 0; this.timer.paused = false; this.broadcast(); }

  everySecond() {
    const now = Date.now();
    if (this.focusing && !this.pomo.paused && now >= this.pomo.endsAt) this.finishPhase(false);
    if (this.timing && !this.timer.paused && now >= this.timer.endsAt) {
      const len = this.timer.length;
      this.stopTimer();
      this.push("timerDone");
      this.say("Time is up", clockText(len * 1000) + " timer");
    }
    if (this.focusing || this.timing) { this.fire("tick"); this.broadcast(); }
  }

  // --- breaks, eyes, water, bedtime ---------------------------------------------------
  get breakAfter() { return Math.max(10, Number(this.settings.breakAfter) || 50); }
  get breakDue() { return this.reacts("breaks") && !this.focusing && this.awakeStreak >= this.breakAfter; }
  get eyesEvery() { return Math.max(5, Number(this.settings.eyesEvery) || 20); }
  get waterEvery() { return Math.max(10, Number(this.settings.waterEvery) || 60); }
  get bedtimeHour() { return Math.max(0, Math.min(23, Number(this.settings.bedtimeHour === undefined ? 23 : this.settings.bedtimeHour))); }
  get bedtimeMinute() { return Math.max(0, Math.min(59, Number(this.settings.bedtimeMinute) || 0)); }
  get bedtimeDue() { return this.reacts("bedtime") && this.lateNow && this.bedtimeSnoozed !== nightKey(); }
  checkBedtime() {
    const d = new Date();
    const m = d.getHours() * 60 + d.getMinutes();
    const bed = this.bedtimeHour * 60 + this.bedtimeMinute;
    const was = this.bedtimeDue;
    this.lateNow = bed >= 5 * 60 ? (m >= bed || m < 5 * 60) : (m >= bed && m < 5 * 60);
    if (this.bedtimeDue && !was && this.bedtimeTold !== nightKey()) {
      this.bedtimeTold = nightKey();
      if (this.feature("breakNotify", true)) this.say("Bedtime", "It's getting late. Time to wind down.");
    }
  }
  snoozeBedtime() { this.bedtimeSnoozed = nightKey(); this.refresh(); }
  everyMinute() {
    this.count(this.asleep ? "asleep" : "awake", 1);
    this.awakeStreak = this.asleep ? 0 : this.awakeStreak + 1;
    if (this.asleep) this.eyeMinutes = 0;
    else if (!(this.onBreak || this.s.fullscreen)) {
      if (this.reacts("eyes") && ++this.eyeMinutes >= this.eyesEvery) {
        this.eyeMinutes = 0;
        this.eyeBreak = true;
        setTimeout(() => { this.eyeBreak = false; this.refresh(); }, 20000);
        if (this.feature("breakNotify", true)) this.say("Rest your eyes", "Look at something far away for 20 seconds.");
      }
      if (this.reacts("water") && ++this.waterMinutes >= this.waterEvery) {
        this.waterMinutes = 0;
        this.waterDue = true;
        setTimeout(() => { this.waterDue = false; this.refresh(); }, 60000);
        if (this.feature("breakNotify", true)) this.say("Have a drink", "A sip of water.");
      }
    }
    this.checkBedtime();
    this.refresh();
  }

  // --- antics ----------------------------------------------------------------------------
  doAntic(name) {
    const list = ["look", "look", "blink2", "stretch", "wiggle", "peek", "nod", "hop2", "spin", "yawn", "shiver"];
    if (!name) {
      if (this.breakDue && Math.random() < 0.5) name = "yawn";
      else do name = list[Math.floor(Math.random() * list.length)]; while (name === this.lastAntic);
    }
    this.lastAntic = name;
    this.fire("antic", name);
  }
  scheduleAntic() {
    clearTimeout(this.anticTimer);
    this.anticTimer = setTimeout(() => {
      if (this.feature("antics", true) && !this.asleep && !this.reduceMotion && this.mood && this.mood.mild && !this.dragging) this.doAntic("");
      this.scheduleAntic();
    }, this.anticsDone++ ? 20000 + Math.random() * 35000 : 8000);
  }

  // --- actions ---------------------------------------------------------------------------
  say(title, body) { invoke("notify", { title: String(title), body: String(body || "") }).catch(() => {}); }
  // A desktop whose panel sits at a bar widget places it first (see desktop/omarchy.js).
  openPanel(page) {
    if (this.panelOpener) this.panelOpener(page || "blob");
    else emitTo("panel", "panel:toggle", "open:" + (page || "blob"));
  }
  runAction(id) {
    switch (id) {
      case "poke": this.poke(); break;
      case "open": this.openPanel("blob"); break;
      case "studio": this.openPanel("studio"); break;
      case "moods": this.openPanel("appearance/mood"); break;
      case "wardrobe": this.openPanel("appearance/outfit"); break;
      case "petSettings": this.openPanel("pet"); break;
      case "focus": this.openPanel("pomodoro"); break;
      case "timer": this.openPanel("timer"); break;
      case "trick": this.doAntic(""); break;
      case "home": this.fire("home"); break;
      case "bar": this.fire("toTray"); break;
      case "hide": this.togglePet(); break;
      case "picker": this.fire("picker"); break;
      default: invoke("run_action", { id }).catch((e) => this.say("Could not do that", String(e)));
    }
  }
  togglePet() { this.saveIn("pet", "enabled", !this.petEnabled); }
  media(action) { invoke("media", { action }); setTimeout(() => this.poll(), 400); }

  // --- talking to the panel ------------------------------------------------------------
  state() {
    const m = this.s.music || {};
    return {
      version: this.version, settings: this.settings, seed: this.seed, look: this.look, accent: this.accent,
      themeAccent: this.themeAccent, dark: this.s.dark, mood: this.mood, username: this.username,
      cpu: this.s.cpu, ram: this.s.ram, temp: this.s.temp == null ? null : this.s.temp, hasBattery: this.hasBattery, batteryPercent: this.batteryPercent, charging: this.charging,
      player: m.title || m.playing ? { identity: m.player, trackTitle: m.title, trackArtist: m.artist, isPlaying: !!m.playing } : null,
      today: this.today.date === dateKey() ? this.today : freshDay(),
      pomo: { focusing: this.focusing, onBreak: this.onBreak, phase: this.pomo.phase, label: this.pomoLabel, clock: this.pomoClock,
        progress: this.pomoProgress, paused: this.pomo.paused, done: this.pomo.done, focusMinutes: this.focusMinutes,
        longBreakEvery: this.longBreakEvery, on: this.pomodoroOn },
      timer: { timing: this.timing, clock: this.timerClock, progress: this.timerProgress, paused: this.timer.paused,
        minutes: this.timerMinutes, on: this.timerOn },
      bedtimeDue: this.bedtimeDue, petEnabled: this.petEnabled, taskbarEdge: this.taskbarEdge || "bottom", lastStudio: this.lastStudio, autostart: this.autostart,
    };
  }
  broadcast() {
    if (this.broadcastSoon) return;
    this.broadcastSoon = setTimeout(() => {
      this.broadcastSoon = null;
      emitTo("panel", "state", this.state()).catch(() => {});
    }, 120);
  }
  command({ name, args }) {
    const a = args || [];
    const fns = {
      hello: () => this.broadcast(),
      save: () => this.save(a[0], a[1]),
      saveIn: () => this.saveIn(a[0], a[1], a[2]),
      saveMany: () => this.saveMany(a[0]),
      poke: () => this.poke(),
      action: () => this.runAction(a[0]),
      media: () => this.media(a[0]),
      startFocus: () => this.startFocus(a[0]),
      pauseFocus: () => this.pauseFocus(),
      skipPhase: () => this.skipPhase(),
      stopFocus: () => this.stopFocus(),
      startTimer: () => this.startTimer(a[0]),
      pauseTimer: () => this.pauseTimer(),
      addTimer: () => this.addTimer(a[0]),
      stopTimer: () => this.stopTimer(),
      togglePet: () => this.togglePet(),
      resetPet: () => this.fire("home"),
      snoozeBedtime: () => this.snoozeBedtime(),
      antic: () => this.doAntic(a[0] || ""),
      keepStudio: () => {
        this.lastStudio = a[0] || {};
        clearTimeout(this.saveStudioSoon);
        this.saveStudioSoon = setTimeout(() => invoke("save_state", { name: "studio", text: JSON.stringify(this.lastStudio) }), 1500);
      },
      autostart: async () => { this.autostart = await invoke("autostart", { on: a[0] }); this.broadcast(); },
    };
    if (fns[name]) fns[name]();
    this.broadcast();
  }

  // --- start -----------------------------------------------------------------------------
  async start() {
    this.username = await invoke("username").catch(() => "blob");
    this.version = await window.__TAURI__.app.getVersion().catch(() => "");
    const load = async (name) => { try { return JSON.parse(await invoke("load_state", { name }) || "null"); } catch (e) { return null; } };
    this.settings = (await load("settings")) || {};
    const saved = await load("stats");
    if (saved && saved.date === dateKey()) this.today = Object.assign(freshDay(), saved);
    this.lastStudio = (await load("studio")) || {};
    this.autostart = await invoke("autostart", {}).catch(() => false);
    await this.poll();
    this.checkBedtime();
    listen("cmd", (e) => this.command(e.payload));
    listen("blob:event", (e) => this.system(e.payload));
    setInterval(() => this.poll(), this.pollMs || 500);
    setInterval(() => this.everySecond(), 1000);
    setInterval(() => this.everyMinute(), 60000);
    setTimeout(() => { this.startedUp = true; }, 4000);
    this.scheduleAntic();
    this.refresh();
    // The first time, a little tour (once: it is marked as seen as it opens).
    if (this.settings.welcomed !== true) setTimeout(() => { this.save("welcomed", true); this.openPanel("welcome"); }, 6000);
  }
}

