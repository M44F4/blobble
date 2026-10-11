// The README preview: rows of unique blobs, a big winking blob with its ring.
// Run: node scripts/preview.mjs > preview.svg && rsvg-convert -o preview.png preview.svg (needs JetBrainsMono Nerd Font).
import { svg } from "../core/Render.mjs";
import { ACTIONS } from "../core/Actions.mjs";

const W = 1280, H = 720, BG = "#15161e", FONT = "JetBrainsMono Nerd Font";
const cx = 640, cy = 400;
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const inner = (s) => ({ vb: s.match(/viewBox="([^"]+)"/)[1], body: s.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") });
const place = (s, x, y, size) => { const p = inner(s); return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${p.vb}">${p.body}</svg>`; };

const names = "ava,ben,cleo,dax,eli,fern,gus,hana,ivo,jade,kai,luna,milo,nia,otto,pia,quin,rex,sol,tess,uma,vic,wren,xan,yuki,zed,ari,bo,cyd,dot,ezra,flo,gil,hux,iris,jojo,kit,lea,max,neo,ola,pax,rio,sky,tao,ugo,vera,wes,yan,zoe,amir,bea,cole,dina,emil,faye,gray,hugo,ines,jack,kira,leo,mae,noor,omar,pip,remy,sami,tara,vlad,wynn,yara,zia,alba,bram,cami,dex,elle,fox,gem".split(",");
const faces = ["idle", "idle", "happy", "happy", "wink", "love", "surprised", "sleepy", "smug", "shy", "thinking", "unsure"];
const wears = [{ head: "tophat" }, { head: "beanie" }, { head: "party" }, { head: "crown" }, { head: "cap" }, { head: "headphones" },
  { head: "flower" }, { head: "bow" }, { ears: "cat" }, { ears: "bunny" }, { ears: "bear" }, { ears: "halo" },
  { face: "glasses" }, { face: "sunglasses" }, { neck: "bowtie" }, { neck: "scarf" }];
const syms = [["notes"], ["heart"], ["zzz"], ["sparkle"], ["coffee"]];

let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${BG}"/>`;

// Background rows: one blob per cell, never touching, at full colour.
const cell = 80, size = 62, cols = W / cell, rows = Math.ceil(H / cell);
let n = 0;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = c * cell + (r % 2 ? cell / 2 : 0) - cell / 4, y = r * cell - 16;
  const mx = x + cell / 2, my = y + cell / 2;
  if (Math.hypot(mx - cx, (my - cy) * 1.05) < 300) continue;          // keep the centre clear
  if (my < 120 && Math.abs(mx - cx) < 470) continue;                   // and the tagline
  const name = names[n++ % names.length] + r + c;
  const roll = rnd();
  const opts = { seed: name, look: { themeMode: "seed" }, face: pick(faces), size, padding: 0.1, font: FONT };
  if (roll < 0.3) opts.wear = pick(wears);
  else if (roll < 0.42) opts.symbols = pick(syms);
  out += place(svg(opts), x + (cell - size) / 2, y + (cell - size) / 2, size);
}

// Soft dark pool behind the centre so the hero reads first (one flat layer).
out += `<defs><radialGradient id="pool"><stop offset="0.62" stop-color="${BG}" stop-opacity="1"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient></defs>`;
out += `<circle cx="${cx}" cy="${cy}" r="330" fill="url(#pool)"/>`;

// The ring: eight useful actions around the big blob.
const ring = ["focus", "studio", "wardrobe", "screenshot", "ocr", "picker", "nightlight", "dnd"];
const R = 200, btn = 32;
out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#7aa2f7" stroke-opacity="0.18" stroke-width="2"/>`;
ring.forEach((id, i) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / ring.length;
  const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
  const act = ACTIONS.find((q) => q.id === id);
  const col = id === "focus" ? "#f7768e" : "#c0caf5";
  out += `<circle cx="${x}" cy="${y}" r="${btn}" fill="#1f2335" stroke="#7aa2f7" stroke-width="2"/>`;
  out += `<text x="${x}" y="${y}" dominant-baseline="central" font-family="${FONT}" font-size="28" text-anchor="middle" fill="${col}">${act.icon}</text>`;
});

// The hero: "blobble", winking, nothing worn.
const hero = 270;
out += place(svg({ seed: "blobble", look: { themeMode: "seed" }, face: "wink", size: hero, padding: 0.04 }), cx - hero / 2, cy - hero / 2, hero);

// Tagline.
out += `<text x="${cx}" y="72" font-family="${FONT}" font-weight="bold" font-size="40" text-anchor="middle" fill="#c0caf5">One name. One blob. Your companion.</text>`;
console.log(out + "</svg>");
