/* global THREE, Peer */
// =============================================================
//  SHEPA JOUER — Three.js 3rd-person + PeerJS invitations
// =============================================================

// ---- Scene setup ----
const canvas = document.getElementById("canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
scene.fog = new THREE.Fog(0x101018, 30, 110);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 300
);
camera.position.set(0, 6, 10);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---- Lights ----
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const d = 30;
sun.shadow.camera.left = -d;
sun.shadow.camera.right = d;
sun.shadow.camera.top = d;
sun.shadow.camera.bottom = -d;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
scene.add(sun);

const fill = new THREE.HemisphereLight(0x8090ff, 0x402030, 0.35);
scene.add(fill);

// ---- Ground ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x252530, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(200, 80, 0x3a3a48, 0x202028);
grid.position.y = 0.01;
scene.add(grid);

// A few decorative props so the world doesn't feel empty
function spawnProps() {
  const colors = [0xd94a3a, 0x7ad94a, 0xd9c44a, 0x3a8ad9, 0xa04ad9, 0xd94aa0];
  for (let i = 0; i < 24; i++) {
    const w = 0.6 + Math.random() * 1.4;
    const h = 0.6 + Math.random() * 2.4;
    const dpt = 0.6 + Math.random() * 1.4;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, dpt),
      new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.85,
      })
    );
    const ang = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 28;
    box.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
    box.rotation.y = Math.random() * Math.PI;
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }
}
spawnProps();

// =============================================================
// CHARACTER — procedural blocky humanoid with limb pivots
// =============================================================
function makeCharacter(opts = {}) {
  const skin = opts.skin || 0xe6b88a;
  const shirt = opts.shirt || 0xd94a3a;
  const pants = opts.pants || 0x2a2a35;
  const hair = opts.hair || 0x1a1410;

  const root = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c });

  // Torso pivot (whole-body wobble)
  const torso = new THREE.Group();
  root.add(torso);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.45), shirtMat);
  body.position.y = 1.55;
  body.castShadow = true;
  torso.add(body);

  // Head (with hair + eyes)
  const headPivot = new THREE.Group();
  headPivot.position.y = 2.2;
  torso.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMat);
  head.castShadow = true;
  headPivot.add(head);
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.65), hairMat);
  hairCap.position.y = 0.32;
  headPivot.add(hairCap);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat);
  eyeL.position.set(-0.13, 0.05, 0.31);
  headPivot.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.13;
  headPivot.add(eyeR);

  // Arms (pivot at shoulder)
  function makeArm(side) {
    const piv = new THREE.Group();
    piv.position.set(side * 0.52, 2.0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), skinMat);
    arm.position.y = -0.45;
    arm.castShadow = true;
    piv.add(arm);
    torso.add(piv);
    return piv;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Legs (pivot at hip)
  function makeLeg(side) {
    const piv = new THREE.Group();
    piv.position.set(side * 0.2, 1.05, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.27, 1.0, 0.27), pantsMat);
    leg.position.y = -0.5;
    leg.castShadow = true;
    piv.add(leg);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c })
    );
    shoe.position.set(0, -1.05, 0.04);
    shoe.castShadow = true;
    piv.add(shoe);
    root.add(piv);
    return piv;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  root.userData.parts = { torso, head: headPivot, armL, armR, legL, legR };
  root.userData.animPhase = 0;
  return root;
}

function animateCharacter(char, dt, isMoving, isAirborne) {
  const u = char.userData;
  const speedHz = isMoving ? 10 : 2;
  u.animPhase += dt * speedHz;
  const t = u.animPhase;
  const amp = isMoving ? 0.7 : 0.05;
  const { torso, head, armL, armR, legL, legR } = u.parts;

  if (isAirborne) {
    // Tuck pose
    armL.rotation.x = -1.2;
    armR.rotation.x = -1.2;
    legL.rotation.x = 0.6;
    legR.rotation.x = 0.6;
  } else {
    armL.rotation.x = Math.sin(t) * amp;
    armR.rotation.x = -Math.sin(t) * amp;
    legL.rotation.x = -Math.sin(t) * amp;
    legR.rotation.x = Math.sin(t) * amp;
  }

  // Subtle body bob & head bob when walking
  const bob = isMoving ? Math.abs(Math.sin(t)) * 0.08 : Math.sin(t * 0.5) * 0.02;
  torso.position.y = bob;
  head.rotation.z = Math.sin(t * 0.5) * 0.04;
}

// ---- Player ----
const player = {
  mesh: makeCharacter({ shirt: 0xd94a3a, pants: 0x2a2a35, hair: 0x1a1410 }),
  vy: 0,
  onGround: true,
  yaw: 0,
};
player.mesh.position.set(0, 0, 0);
scene.add(player.mesh);

// Remote players (peer.id → mesh)
const remotes = new Map();
function ensureRemote(id, cfg) {
  let r = remotes.get(id);
  if (!r) {
    const palette = [
      { shirt: 0x7ad94a, pants: 0x1f3a5c, hair: 0xff70a0 },
      { shirt: 0x3a8ad9, pants: 0x3d3530, hair: 0xc69b50 },
      { shirt: 0xd9c44a, pants: 0x5c2a4a, hair: 0xe0e0e0 },
      { shirt: 0xa04ad9, pants: 0x2a2a35, hair: 0x30a050 },
    ];
    const p = palette[remotes.size % palette.length];
    const mesh = makeCharacter(Object.assign({}, p, cfg || {}));
    scene.add(mesh);
    r = { mesh, target: { x: 0, y: 0, z: 0, yaw: 0, moving: false, airborne: false } };
    remotes.set(id, r);
    updatePlayerCount();
  }
  return r;
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (r) {
    scene.remove(r.mesh);
    remotes.delete(id);
    updatePlayerCount();
  }
}

// =============================================================
// CONTROLS — ZQSD/WASD + Space jump
// =============================================================
const keys = {};
const TRACKED = new Set(["z","q","s","d","w","a","arrowup","arrowdown","arrowleft","arrowright"," "]);

window.addEventListener("keydown", (e) => {
  if (uiInputFocused()) return;
  const k = e.key.toLowerCase();
  if (TRACKED.has(k)) {
    e.preventDefault();
    keys[k] = true;
  }
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (TRACKED.has(k)) keys[k] = false;
});

function uiInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

// ---- Movement physics ----
const SPEED = 5.5;       // units/sec
const JUMP_VEL = 9.5;    // m/s
const GRAVITY = 26;      // m/s²

function updatePlayer(dt) {
  let dx = 0, dz = 0;
  if (keys.z || keys.w || keys.arrowup) dz -= 1;
  if (keys.s || keys.arrowdown) dz += 1;
  if (keys.q || keys.a || keys.arrowleft) dx -= 1;
  if (keys.d || keys.arrowright) dx += 1;

  const moving = !!(dx || dz);
  if (moving) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    player.mesh.position.x += dx * SPEED * dt;
    player.mesh.position.z += dz * SPEED * dt;

    // Smooth face-towards-movement
    const targetYaw = Math.atan2(dx, dz) + Math.PI;
    let d = targetYaw - player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.yaw += d * Math.min(1, 12 * dt);
    player.mesh.rotation.y = player.yaw;
  }

  // Jump
  if (keys[" "] && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
  }
  if (!player.onGround) {
    player.vy -= GRAVITY * dt;
    player.mesh.position.y += player.vy * dt;
    if (player.mesh.position.y <= 0) {
      player.mesh.position.y = 0;
      player.vy = 0;
      player.onGround = true;
    }
  }

  // World bounds — soft clamp inside the playground area
  const W = 60;
  player.mesh.position.x = Math.max(-W, Math.min(W, player.mesh.position.x));
  player.mesh.position.z = Math.max(-W, Math.min(W, player.mesh.position.z));

  animateCharacter(player.mesh, dt, moving, !player.onGround);
}

// =============================================================
// 3rd-PERSON CAMERA — trailing offset that lerps to player
// =============================================================
const camOffset = new THREE.Vector3(0, 5.5, 8);
const lookOffset = new THREE.Vector3(0, 1.6, 0);
function updateCamera(dt) {
  const tgt = player.mesh.position.clone().add(camOffset);
  camera.position.lerp(tgt, Math.min(1, 6 * dt));
  const look = player.mesh.position.clone().add(lookOffset);
  camera.lookAt(look);
}

// =============================================================
// REMOTE INTERPOLATION
// =============================================================
function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const m = r.mesh;
    const t = r.target;
    m.position.x += (t.x - m.position.x) * Math.min(1, 12 * dt);
    m.position.y += (t.y - m.position.y) * Math.min(1, 18 * dt);
    m.position.z += (t.z - m.position.z) * Math.min(1, 12 * dt);
    let dy = t.yaw - m.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    m.rotation.y += dy * Math.min(1, 10 * dt);
    animateCharacter(m, dt, t.moving, t.airborne);
  }
}

// =============================================================
// MAIN LOOP
// =============================================================
let last = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (running) {
    updatePlayer(dt);
    updateRemotes(dt);
    updateCamera(dt);
    maybeSendPosition();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
let running = false;
tick();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================
// PEERJS — invitation flow + position sync
// =============================================================
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += CHARS[(Math.random() * CHARS.length) | 0];
  return s;
}
const APP_PREFIX = "shepa-"; // namespace so peer IDs don't collide with other apps

let peer = null;
const connections = new Map(); // peerId → DataConnection
let roomCode = null;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of connections.values()) {
    if (c.open) c.send(data);
  }
}
function sendTo(c, msg) { if (c.open) c.send(JSON.stringify(msg)); }

let lastSendT = 0;
function maybeSendPosition() {
  const now = performance.now();
  if (now - lastSendT < 50) return; // 20Hz
  lastSendT = now;
  if (connections.size === 0) return;
  const p = player.mesh.position;
  broadcast({
    t: "pos",
    x: +p.x.toFixed(3),
    y: +p.y.toFixed(3),
    z: +p.z.toFixed(3),
    yaw: +player.yaw.toFixed(3),
    m: !!(keys.z || keys.s || keys.q || keys.d || keys.w || keys.a || keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright),
    a: !player.onGround,
  });
}

function wireConnection(c, isHost) {
  c.on("open", () => {
    connections.set(c.peer, c);
    showToast(isHost ? "Un·e pote rejoint" : "Connecté·e à l'hôte");
    updatePlayerCount();
    ensureRemote(c.peer);
    // Send hello with our current pose
    sendTo(c, { t: "hello" });
  });
  c.on("data", (raw) => {
    let msg;
    try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!msg || !msg.t) return;
    if (msg.t === "pos") {
      const r = ensureRemote(c.peer);
      r.target.x = msg.x;
      r.target.y = msg.y;
      r.target.z = msg.z;
      r.target.yaw = msg.yaw;
      r.target.moving = !!msg.m;
      r.target.airborne = !!msg.a;
    }
    if (msg.t === "hello") {
      // Acknowledge — peer just confirmed it can receive
    }
  });
  c.on("close", () => {
    connections.delete(c.peer);
    removeRemote(c.peer);
    showToast("Un·e pote est parti·e");
  });
  c.on("error", (err) => console.warn("peer conn error", err));
}

function host() {
  const code = makeCode();
  setStatus("Création du salon…", "");
  peer = new Peer(APP_PREFIX + code);
  peer.on("open", () => {
    roomCode = code;
    enterGame(code);
  });
  peer.on("connection", (conn) => wireConnection(conn, true));
  peer.on("error", (err) => {
    console.warn("peer host error", err);
    setStatus("Erreur de salon. Réessaie.", "error");
  });
}

function join(code) {
  setStatus("Connexion en cours…", "");
  peer = new Peer();
  peer.on("open", () => {
    const conn = peer.connect(APP_PREFIX + code, { reliable: false });
    let opened = false;
    const timeout = setTimeout(() => {
      if (!opened) {
        setStatus("Aucun salon trouvé avec ce code.", "error");
        try { conn.close(); } catch {}
        try { peer.destroy(); } catch {}
        peer = null;
      }
    }, 6000);
    conn.on("open", () => {
      opened = true;
      clearTimeout(timeout);
      roomCode = code;
      enterGame(code);
      wireConnection(conn, false);
    });
    conn.on("error", (err) => {
      console.warn("join conn error", err);
      if (!opened) setStatus("Connexion échouée. Vérifie le code.", "error");
    });
  });
  peer.on("error", (err) => {
    console.warn("peer join error", err);
    if (err.type === "peer-unavailable") setStatus("Aucun salon trouvé avec ce code.", "error");
    else setStatus("Erreur réseau. Réessaie.", "error");
  });
}

function leaveRoom() {
  for (const c of connections.values()) try { c.close(); } catch {}
  connections.clear();
  for (const id of [...remotes.keys()]) removeRemote(id);
  if (peer) { try { peer.destroy(); } catch {} peer = null; }
  roomCode = null;
  exitGame();
}

// =============================================================
// UI WIRING
// =============================================================
const homeEl = document.getElementById("home");
const gameEl = document.getElementById("game");
const homeActions = document.getElementById("home-actions");
const joinForm = document.getElementById("join-form");
const codeInput = document.getElementById("code-input");
const statusEl = document.getElementById("connect-status");
const codePill = document.getElementById("code-pill");
const playersCount = document.getElementById("players-count");
const toastEl = document.getElementById("toast");

document.getElementById("btn-host").onclick = () => host();
document.getElementById("btn-join").onclick = () => {
  homeActions.classList.add("hidden");
  joinForm.classList.remove("hidden");
  codeInput.focus();
};
document.getElementById("btn-join-back").onclick = () => {
  joinForm.classList.add("hidden");
  homeActions.classList.remove("hidden");
  setStatus("", "");
};
document.getElementById("btn-join-go").onclick = () => {
  const code = (codeInput.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) {
    setStatus("Code trop court.", "error");
    return;
  }
  join(code);
};
codeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-join-go").click();
});

document.getElementById("btn-copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(roomCode || "");
    showToast("Code copié");
  } catch {
    showToast("Impossible de copier");
  }
};

document.getElementById("btn-leave").onclick = () => leaveRoom();

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = "status " + (cls || "");
  statusEl.classList.toggle("hidden", !text);
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2000);
}

function updatePlayerCount() {
  playersCount.textContent = String(1 + remotes.size);
}

function enterGame(code) {
  codePill.textContent = code;
  homeEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  running = true;
  // Reset player
  player.mesh.position.set(0, 0, 0);
  player.vy = 0;
  player.onGround = true;
  player.yaw = 0;
  player.mesh.rotation.y = 0;
}

function exitGame() {
  gameEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  joinForm.classList.add("hidden");
  homeActions.classList.remove("hidden");
  setStatus("", "");
  running = false;
  updatePlayerCount();
}
