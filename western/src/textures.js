// =============================================================
//  TEXTURES — procedural pixel-art / voxel-style surfaces.
//  All canvas-generated, NearestFilter for crisp voxel pixels.
//  buildMaterials() returns the shared material palette used by world.js.
// =============================================================
import * as THREE from "three";

// clamp a channel
const cl = (v) => Math.max(0, Math.min(255, v | 0));
// shade a hex color by delta (per channel), returns css rgb()
function shade(hex, d, a = 1) {
  const r = cl((hex >> 16) + d), g = cl(((hex >> 8) & 255) + d), b = cl((hex & 255) + d);
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}
const hexCss = (hex) => "#" + hex.toString(16).padStart(6, "0");

function makeTexture(size, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- individual surface painters ----
function woodPlanks(base, S, plankH = 16) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += plankH) {
      // plank seam (dark groove + light highlight under it)
      ctx.fillStyle = shade(base, -45);
      ctx.fillRect(0, y, S, 2);
      ctx.fillStyle = shade(base, 22);
      ctx.fillRect(0, y + 2, S, 1);
      // wood grain streaks
      for (let i = 0; i < 26; i++) {
        const x = (Math.random() * S) | 0;
        const gy = y + 3 + Math.random() * (plankH - 4);
        const len = 2 + Math.random() * 6;
        ctx.fillStyle = shade(base, (Math.random() * 36 - 20) | 0, 0.5);
        ctx.fillRect(x, gy | 0, 1, len | 0);
      }
      // nail heads at plank ends
      ctx.fillStyle = shade(base, -60);
      ctx.fillRect(3, y + (plankH >> 1) - 1, 2, 2);
      ctx.fillRect(S - 5, y + (plankH >> 1) - 1, 2, 2);
    }
  };
}

function woodVertical(base, S, plankW = 12) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += plankW) {
      ctx.fillStyle = shade(base, -40);
      ctx.fillRect(x, 0, 2, S);
      ctx.fillStyle = shade(base, 18);
      ctx.fillRect(x + 2, 0, 1, S);
      for (let i = 0; i < 14; i++) {
        const y = (Math.random() * S) | 0;
        ctx.fillStyle = shade(base, (Math.random() * 30 - 18) | 0, 0.45);
        ctx.fillRect(x + 3 + Math.random() * (plankW - 5), y, 1, 2 + Math.random() * 5);
      }
    }
  };
}

function adobe(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    // mottled stucco
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 40 - 22) | 0, 0.4);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 2, 2);
    }
    // a few cracks
    ctx.strokeStyle = shade(base, -50, 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += Math.random() * 14 - 7; y += Math.random() * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // darker base line
    ctx.fillStyle = shade(base, -30, 0.5);
    ctx.fillRect(0, S - 4, S, 4);
  };
}

function whitewash(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 16) {
      ctx.fillStyle = shade(base, -22);
      ctx.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 24 - 16) | 0, 0.35);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1);
    }
    ctx.fillStyle = shade(base, -28, 0.4);
    ctx.fillRect(0, S - 5, S, 5);
  };
}

function shingles(base, S, rowH = 12) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += rowH) {
      const off = ((y / rowH) % 2) * 8;
      for (let x = -8; x < S; x += 16) {
        const v = (Math.random() * 24 - 12) | 0;
        ctx.fillStyle = shade(base, v);
        ctx.fillRect(x + off + 1, y + 1, 14, rowH - 1);
        // bottom shadow lip
        ctx.fillStyle = shade(base, -40);
        ctx.fillRect(x + off, y + rowH - 2, 16, 2);
      }
    }
  };
}

function glass(S) {
  return (ctx) => {
    ctx.fillStyle = "#243038";
    ctx.fillRect(0, 0, S, S);
    // sky reflection gradient
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "rgba(180,200,220,0.5)");
    g.addColorStop(0.5, "rgba(80,100,120,0.15)");
    g.addColorStop(1, "rgba(40,50,60,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // diagonal highlight streaks
    ctx.strokeStyle = "rgba(220,235,250,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, S); ctx.lineTo(S * 0.5, S * 0.2); ctx.stroke();
    // muntins (window cross frame)
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(S / 2 - 2, 0, 4, S);
    ctx.fillRect(0, S / 2 - 2, S, 4);
    ctx.strokeStyle = "#5a4226";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, S - 4, S - 4);
  };
}

function metal(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 6) {
      ctx.fillStyle = shade(base, (Math.random() * 30 - 15) | 0, 0.4);
      ctx.fillRect(0, y, S, 2);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 50 - 25) | 0, 0.5);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1);
    }
  };
}

function sandTex(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 44 - 22) | 0, 0.5);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1);
    }
    // occasional pebbles
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = shade(base, -(20 + Math.random() * 30) | 0);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 2, 2);
    }
  };
}

function roadTex(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 40 - 22) | 0, 0.5);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1);
    }
    // wheel ruts running vertically (along the street length)
    for (const x of [S * 0.32, S * 0.68]) {
      ctx.fillStyle = shade(base, -28, 0.5);
      ctx.fillRect((x | 0) - 1, 0, 3, S);
    }
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = shade(base, -(25 + Math.random() * 25) | 0);
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 2, 2);
    }
  };
}

function cactusTex(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    // vertical ribs
    for (let x = 4; x < S; x += 10) {
      ctx.fillStyle = shade(base, -26);
      ctx.fillRect(x, 0, 2, S);
      ctx.fillStyle = shade(base, 20);
      ctx.fillRect(x + 2, 0, 1, S);
      // spines
      ctx.fillStyle = "rgba(240,235,200,0.8)";
      for (let y = 4; y < S; y += 8) ctx.fillRect(x, y, 1, 1);
    }
  };
}

function hayTex(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 200; i++) {
      ctx.strokeStyle = shade(base, (Math.random() * 50 - 25) | 0, 0.5);
      ctx.lineWidth = 1;
      const x = Math.random() * S, y = Math.random() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 8 - 4, y + Math.random() * 8); ctx.stroke();
    }
  };
}

function rockTex(base, S) {
  return (ctx) => {
    ctx.fillStyle = hexCss(base);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = shade(base, (Math.random() * 50 - 28) | 0, 0.5);
      const s = 1 + (Math.random() * 3) | 0;
      ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, s, s);
    }
  };
}

// grayscale-ish fabric (near white) so material.color tints it
function fabricTex(S) {
  return (ctx) => {
    ctx.fillStyle = "#d2d2d2";
    ctx.fillRect(0, 0, S, S);
    // plaid lines
    for (let x = 0; x < S; x += 12) { ctx.fillStyle = "rgba(80,80,80,0.4)"; ctx.fillRect(x, 0, 2, S); }
    for (let y = 0; y < S; y += 12) { ctx.fillStyle = "rgba(80,80,80,0.4)"; ctx.fillRect(0, y, S, 2); }
    for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1); }
  };
}
function denimTex(S) {
  return (ctx) => {
    ctx.fillStyle = "#c4c4c4";
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.18})`; ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1); }
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`; ctx.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1); }
    // seams
    ctx.fillStyle = "rgba(255,240,180,0.6)"; ctx.fillRect(S / 2 - 1, 0, 2, S);
  };
}

// =============================================================
//  PUBLIC: build the textured material palette for the village
// =============================================================
export function buildMaterials() {
  const S = 64;
  const mk = (hex, rough, painter, repeat) =>
    new THREE.MeshStandardMaterial({ map: makeTexture(S, painter, repeat), roughness: rough });

  return {
    wood:      mk(0x6b4a2e, 0.9, woodPlanks(0x6b4a2e, S), [2, 2]),
    woodDark:  mk(0x4a3320, 0.95, woodPlanks(0x4a3320, S), [2, 2]),
    woodLight: mk(0x8a6a40, 0.9, woodPlanks(0x8a6a40, S), [2, 2]),
    woodVert:  mk(0x8a6a40, 0.9, woodVertical(0x8a6a40, S), [2, 2]),
    plank:     mk(0x7a5733, 0.92, woodPlanks(0x7a5733, S, 10), [3, 1]),
    roofRed:   mk(0x7a3326, 0.9, shingles(0x7a3326, S), [3, 2]),
    roofGreen: mk(0x3f5740, 0.9, shingles(0x3f5740, S), [3, 2]),
    adobe:     mk(0xc49a6c, 0.95, adobe(0xc49a6c, S), [2, 2]),
    white:     mk(0xd8cdb8, 0.9, whitewash(0xd8cdb8, S), [2, 2]),
    glass:     new THREE.MeshStandardMaterial({ map: makeTexture(S, glass(S)), roughness: 0.35, metalness: 0.2 }),
    metal:     new THREE.MeshStandardMaterial({ map: makeTexture(S, metal(0x555048, S)), roughness: 0.6, metalness: 0.5 }),
    rock:      mk(0xa6643c, 1, rockTex(0xa6643c, S), [1, 1]),
    mesa:      mk(0x9c5a34, 1, rockTex(0x9c5a34, S), [3, 3]),
    cactus:    mk(0x4a6b3a, 0.85, cactusTex(0x4a6b3a, S), [1, 2]),
    dark:      new THREE.MeshStandardMaterial({ color: 0x14110d, roughness: 0.8 }),
    hay:       mk(0xc9a23a, 1, hayTex(0xc9a23a, S), [1, 1]),
    gold:      new THREE.MeshStandardMaterial({ color: 0xd9b84a, metalness: 0.6, roughness: 0.4 }),
    water:     new THREE.MeshStandardMaterial({ color: 0x2f5a6b, roughness: 0.25, metalness: 0.3 }),
    sand:      mk(0xc2a878, 1, sandTex(0xc2a878, 128), [90, 90]),
    road:      mk(0x9c7d52, 1, roadTex(0x9c7d52, 128), [4, 26]),
  };
}

// character fabric textures (grayscale, tinted by material.color)
export function buildCharacterTextures() {
  const S = 48;
  return {
    fabric: makeTexture(S, fabricTex(S)),
    denim: makeTexture(S, denimTex(S)),
  };
}

// =============================================================
//  SKY — gradient dome (warm dusty Western sky)
// =============================================================
export function createSky() {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#3f6fa0");  // high sky (blue)
  g.addColorStop(0.35, "#7a93a8");
  g.addColorStop(0.6, "#e8b878");  // dusty haze
  g.addColorStop(0.8, "#f0c690");  // horizon glow
  g.addColorStop(1.0, "#caa06a");  // ground haze
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  return sky;
}
