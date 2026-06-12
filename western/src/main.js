// =============================================================
//  MAIN — bootstraps the Western village, FPS player, remotes, net
// =============================================================
import * as THREE from "three";
import { buildVillage } from "./world.js";
import { makeCharacter, animateCharacter, paletteFor, triggerOneShot, triggerEmote, EMOTES } from "./character.js";
import { createPlayerController } from "./player.js";
import { createCar } from "./car.js";
import { createNet } from "./net.js";
import { createSky } from "./textures.js";
import { createMic } from "./voice.js";
import * as CANNON from "cannon-es";
import { createRagdoll, createPhysicsWorld } from "./ragdoll.js";

const mic = createMic();
const physWorld = createPhysicsWorld(CANNON, 0);

// ---- renderer / scene / camera ----
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // smooth, creamy gradients
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8b878); // fallback sky tint
scene.fog = new THREE.Fog(0xe6bd84, 70, 320);
scene.add(createSky());

const camera = new THREE.PerspectiveCamera(
  72, window.innerWidth / window.innerHeight, 0.1, 600
);
camera.rotation.order = "YXZ";
camera.position.set(0, 1.7, 45);

// ---- lights: soft, bright "toy" lighting ----
scene.add(new THREE.AmbientLight(0xfff0d8, 0.85));
const sun = new THREE.DirectionalLight(0xfff0cc, 1.25);
sun.position.set(-40, 55, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5;            // soft shadow edges
sun.shadow.bias = -0.0004;
const d = 70;
sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0xb08a52, 0.65)); // sky/ground fill

// ---- world ----
const { colliders, spawnPoints, bounds } = buildVillage(scene);

// ---- player (first person) ----
const player = createPlayerController({ camera, domElement: canvas, colliders, bounds });

// ---- first-person pointing arm (only the local player sees this) ----
// A simple arm + finger fixed to the camera, pointing forward (down -Z = where we
// look). Shown only while the right mouse button is held.
scene.add(camera); // needed so the camera's children actually render
const fpArm = (() => {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.85, metalness: 0 });
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.55, 14), skin);
  forearm.rotation.x = -Math.PI / 2;        // +Y cylinder → points -Z (forward)
  forearm.position.set(0, 0, -0.3);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), skin);
  fist.position.set(0, 0, -0.56);
  const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.2, 12), skin);
  finger.rotation.x = -Math.PI / 2;
  finger.position.set(0, 0.01, -0.74);
  g.add(forearm, fist, finger);
  g.position.set(0.32, -0.34, -0.15);       // lower-right of the view
  g.rotation.set(-0.05, 0.12, 0);           // angle slightly inward → reads as pointing ahead
  g.visible = false;
  g.renderOrder = 2;
  camera.add(g);
  return g;
})();

// ---- drivable car (shared, fixed spawn on the main street) ----
const car = createCar(scene, { x: 4, z: 34, heading: 0, colliders, bounds });
let mySeat = null; // null | "driver" | "passenger"
// is a seat taken by a REMOTE player right now?
function seatTakenByRemote(code) {
  for (const r of remotes.values()) if (r.target.inCar === code) return true;
  return false;
}

// ---- remote players ----
const remotes = new Map(); // peerId → { mesh, target }
let paletteCursor = 0;
function ensureRemote(id) {
  let r = remotes.get(id);
  if (!r) {
    const mesh = makeCharacter(paletteFor(paletteCursor++));
    scene.add(mesh);
    r = { mesh, target: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, moving: false, airborne: false, running: false, crouching: false, speaking: 0, pointing: false, inCar: 0 } };
    remotes.set(id, r);
  }
  return r;
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (r) { scene.remove(r.mesh); remotes.delete(id); }
}
function updateRemotes(dt) {
  // a remote DRIVER streams the car's transform — move the shared car to match
  // (unless WE are driving, in which case our own physics owns it).
  if (mySeat !== "driver") {
    for (const r of remotes.values()) {
      const t = r.target;
      if (t.inCar === 1 && t.cx != null) { car.setState({ x: t.cx, z: t.cz, heading: t.ch }); break; }
    }
  }
  for (const r of remotes.values()) {
    const m = r.mesh, t = r.target;
    // ---- seated in the car: park the avatar in its seat, facing forward ----
    if (t.inCar) {
      if (r.doll) { r.doll.dispose(); r.doll = null; }
      const seat = t.inCar === 1 ? "driver" : "passenger";
      m.position.copy(car.seatBodyWorld(seat));
      m.rotation.y = car.state.heading;
      m.userData.headYaw += (0 - (m.userData.headYaw || 0)) * Math.min(1, 10 * dt);
      m.userData.headPitch += (0 - (m.userData.headPitch || 0)) * Math.min(1, 10 * dt);
      m.userData.speaking = t.speaking || 0;
      animateCharacter(m, dt, false, false, false, false, false);
      continue;
    }
    // ---- ragdoll: physics takes over the body ----
    if (t.ragdoll) {
      if (!r.doll && m.userData.headBone) {
        m.scale.set(1, 1, 1);
        r.doll = createRagdoll(CANNON, physWorld, m);
        r.doll.kick(0, 0.6, 0);          // gentle upward pop → it flops, doesn't fold
        r.ragX = t.x; r.ragZ = t.z;      // anchor: horizontal travel comes from the network
      }
      if (r.doll) {
        // follow the owner's networked position horizontally (gravity handles the
        // fall + flop locally) so the body travels in sync — same spot as the owner
        const nx = r.ragX + (t.x - r.ragX) * Math.min(1, 12 * dt);
        const nz = r.ragZ + (t.z - r.ragZ) * Math.min(1, 12 * dt);
        r.doll.translate(nx - r.ragX, nz - r.ragZ);
        r.ragX = nx; r.ragZ = nz;
        r.doll.sync();
      }
      continue; // skip normal interpolation + animation while limp
    }
    if (r.doll) {
      const pv = r.doll.bodies.pelvis;       // stand up where the ragdoll rolled to
      if (pv) m.position.set(pv.position.x, 0, pv.position.z);
      r.doll.dispose(); r.doll = null;
    }
    m.position.x += (t.x - m.position.x) * Math.min(1, 12 * dt);
    m.position.y += (t.y - m.position.y) * Math.min(1, 18 * dt);
    m.position.z += (t.z - m.position.z) * Math.min(1, 12 * dt);
    // body yaw vs head yaw: when moving, the body turns toward the look
    // direction (head leads, body catches up). When idle, the body stays put
    // and ONLY the head swivels — until the look exceeds the head's limit.
    const MAX_HEAD = 1.15; // ~66° head turn before the body follows
    let dy = t.yaw - m.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    if (t.moving) {
      m.rotation.y += dy * Math.min(1, 8 * dt);
    } else {
      if (dy > MAX_HEAD) m.rotation.y += dy - MAX_HEAD;
      else if (dy < -MAX_HEAD) m.rotation.y += dy + MAX_HEAD;
    }
    let hy = t.yaw - m.rotation.y;
    while (hy > Math.PI) hy -= Math.PI * 2;
    while (hy < -Math.PI) hy += Math.PI * 2;
    const tHeadYaw = Math.max(-MAX_HEAD, Math.min(MAX_HEAD, hy));
    const tHeadPitch = Math.max(-0.7, Math.min(0.7, t.pitch || 0));
    // smooth toward the 20Hz network targets so the head glides, not steps
    m.userData.headYaw += (tHeadYaw - (m.userData.headYaw || 0)) * Math.min(1, 12 * dt);
    m.userData.headPitch += (tHeadPitch - (m.userData.headPitch || 0)) * Math.min(1, 12 * dt);
    m.userData.speaking = t.speaking || 0;
    animateCharacter(m, dt, t.moving, t.airborne, t.running, t.crouching, t.pointing);
  }
}

// =============================================================
//  UI WIRING
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
const lockHint = document.getElementById("lock-hint");

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
function updatePlayerCount(n) { playersCount.textContent = String(n); }

let running = false;
function enterGame(code) {
  codePill.textContent = code;
  homeEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  const sp = spawnPoints[net.playerCount() % spawnPoints.length] || spawnPoints[0];
  player.spawn(sp);
  running = true;
  showLockHint(true);
  // open mic (proximity chat) — the click that got us here is the user gesture
  mic.start().then((ok) => { if (micBtn) micBtn.classList.toggle("hidden", !ok); });
}
function exitGame() {
  gameEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  joinForm.classList.add("hidden");
  homeActions.classList.remove("hidden");
  setStatus("", "");
  running = false;
}
function showLockHint(show) {
  if (lockHint) lockHint.classList.toggle("hidden", !show);
}

// ---- net ----
const net = createNet({
  onStatus: setStatus,
  onToast: showToast,
  onEnter: enterGame,
  onPeerUpdate: updatePlayerCount,
  onPeerJoin: (id) => ensureRemote(id),
  onPeerLeave: (id) => removeRemote(id),
  onRemoteState: (id, s) => { ensureRemote(id).target = s; },
  getLocalState: () => {
    const s = { ...player.getState(), speaking: mic.getLevel() };
    if (mySeat === "driver") { s.inCar = 1; s.cx = car.state.x; s.cz = car.state.z; s.ch = car.state.heading; }
    else if (mySeat === "passenger") s.inCar = 2;
    else s.inCar = 0;
    return s;
  },
  onEvent: (peerId, msg) => {
    if (msg.act === "punch") {
      // the sender threw a punch — play it on their avatar
      const r = remotes.get(peerId);
      if (r) triggerOneShot(r.mesh, "punch");
    } else if (msg.act === "hit") {
      // someone got punched — play the recoil on that victim's avatar
      const r = remotes.get(msg.victim);
      if (r) triggerOneShot(r.mesh, "hit");
      if (msg.victim === net.getMyId()) hitFeedback(); // it was me
    } else if (msg.act === "emote") {
      // a player played an emote — show it on their avatar
      const r = remotes.get(peerId);
      if (r) triggerEmote(r.mesh, msg.name);
    }
  },
});

player.setLockChange((locked) => showLockHint(!locked && running));

// buttons
document.getElementById("btn-host").onclick = () => net.host();
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
  if (code.length < 4) { setStatus("Code trop court.", "error"); return; }
  net.join(code);
};
codeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-join-go").click();
});
document.getElementById("btn-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(net.getCode() || ""); showToast("Code copié"); }
  catch { showToast("Impossible de copier"); }
};
document.getElementById("btn-leave").onclick = () => {
  net.leave();
  for (const id of [...remotes.keys()]) removeRemote(id);
  mic.stop();
  exitGame();
};

// mic mute toggle
const micBtn = document.getElementById("btn-mic");
if (micBtn) {
  micBtn.onclick = () => {
    mic.setMuted(!mic.isMuted());
    micBtn.classList.toggle("muted", mic.isMuted());
    micBtn.textContent = mic.isMuted() ? "🔇 Muet" : "🎤 Micro";
  };
}

// click the canvas: capture the mouse first, then left-clicks throw a punch
let lastPunch = 0;
canvas.addEventListener("click", () => {
  if (!running) return;
  if (!player.isLocked()) { player.requestLock(); return; }
  if (player.isRagdoll() || mySeat) return;       // can't punch while limp or driving
  const now = performance.now();
  if (now - lastPunch < 450) return;              // cooldown between jabs
  lastPunch = now;
  punch();
});

// throw a punch: others see our jab; nearby players in front take the hit
function punch() {
  net.sendEvent({ act: "punch" });
  const s = player.getState();
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  for (const [id, r] of remotes) {
    const dx = r.mesh.position.x - s.x, dz = r.mesh.position.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001 || dist > 2.2) continue;          // punch reach
    if ((dx / dist) * fx + (dz / dist) * fz > 0.5) {   // within ~60° in front
      net.sendEvent({ act: "hit", victim: id });
      triggerOneShot(r.mesh, "hit");                    // see them recoil right away
    }
  }
}

// ---- car: enter / drive / exit (E key) ----
function enterCar(seat) {
  mySeat = seat;
  player.setSeated(true);
  player.setLook(0, 0);           // look offset starts at 0 → facing the car's forward
  showToast(seat === "driver" ? "Au volant — ZQSD conduire · ␣ frein · E descendre" : "Passager — E descendre");
}
function exitCar() {
  const p = car.exitWorld(mySeat);
  player.setSeated(false);
  player.setGround(p.x, p.z);
  player.setLook(car.state.heading, 0); // keep facing the way the car points
  mySeat = null;
}
function toggleCar() {
  if (!running || !player.isLocked() || player.isRagdoll()) return;
  if (mySeat) { exitCar(); return; }
  // must be close to the car
  const pos = player.getPos();
  if (Math.hypot(pos.x - car.state.x, pos.z - car.state.z) > 4) {
    showToast("Approche-toi de la voiture (E)");
    return;
  }
  if (!seatTakenByRemote(1)) enterCar("driver");
  else if (!seatTakenByRemote(2)) enterCar("passenger");
  else showToast("La voiture est pleine");
}
window.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
  const k = e.key && e.key.toLowerCase();
  if (k === "e") { toggleCar(); return; }
  // number keys 1-9 → play the matching emote (others see it on our avatar)
  const emote = EMOTES.find((em) => em.key === e.key);
  if (emote && running && player.isLocked() && !player.isRagdoll() && !mySeat) {
    net.sendEvent({ act: "emote", name: emote.name });
    showToast("Emote : " + emote.name);
  }
});

// drive the car + ride the camera in the seat (called each frame while seated)
function updateCar(dt) {
  if (!mySeat) return;
  if (mySeat === "driver") car.update(dt, player.getDriveInput());
  const eye = car.seatEyeWorld(mySeat);
  camera.position.copy(eye);
  const yp = player.getYawPitch();
  const offY = Math.max(-2.1, Math.min(2.1, yp.yaw)); // glance around, can't fully spin
  camera.rotation.set(0, 0, 0, "YXZ");
  camera.rotation.y = car.state.heading + offY;
  camera.rotation.x = yp.pitch;
}

// brief red flash when the local player gets hit
const hitFlash = document.getElementById("hit-flash");
function hitFeedback() {
  if (!hitFlash) return;
  hitFlash.classList.remove("hidden");
  hitFlash.classList.add("flash");
  clearTimeout(hitFeedback._t);
  hitFeedback._t = setTimeout(() => {
    hitFlash.classList.add("hidden");
    hitFlash.classList.remove("flash");
  }, 320);
}

// ---- local ragdoll: the camera RIDES a physics body's position (so it falls +
//  carries momentum) but the orientation is a controlled tilt toward "lying down"
//  — NOT the body's rotation, which would spin like a rolling ball (nauseating).
let localRag = null;
function updateLocalRagdoll(dt) {
  const want = player.isRagdoll();
  if (want && !localRag) {
    const body = new CANNON.Body({
      mass: 1, shape: new CANNON.Sphere(0.28),
      position: new CANNON.Vec3(camera.position.x, camera.position.y, camera.position.z),
      linearDamping: 0.85, // high → a short lunge, then friction settles us (no endless slide)
    });
    const v = player.getVelocity();
    body.velocity.set(v.x * 1.25, 0.8, v.z * 1.25); // keep (and slightly boost) momentum
    physWorld.addBody(body);
    const yp = player.getYawPitch();
    // tilt the view in the ACTUAL direction we fall (matches what others see):
    // running forward → faceplant forward → look DOWN; sideways → roll. Defaults to
    // a forward crumple when stationary.
    const spd = Math.hypot(v.x, v.z);
    let fComp = 1, rComp = 0;
    if (spd > 0.1) {
      const fX = -Math.sin(yp.yaw), fZ = -Math.cos(yp.yaw); // look-forward dir
      const rX = Math.cos(yp.yaw), rZ = -Math.sin(yp.yaw);  // look-right dir
      fComp = (v.x * fX + v.z * fZ) / spd;                  // forward share (-1..1)
      rComp = (v.x * rX + v.z * rZ) / spd;                  // lateral share
    }
    localRag = {
      body, t: 0, yaw: yp.yaw, pitch: yp.pitch,
      targPitch: -1.35 * fComp, // forward fall → negative pitch = look at the ground
      targRoll: 0.5 * rComp,    // lateral fall → roll toward that side
    };
  } else if (!want && localRag) {
    player.setGround(localRag.body.position.x, localRag.body.position.z); // get up where we landed
    physWorld.removeBody(localRag.body);
    localRag = null;
  }
  if (localRag) {
    const b = localRag.body;
    localRag.t += dt;
    // once we've slowed to a crawl, kill the residual velocity so we fully STOP
    // (a frictionless sphere would otherwise drift forever at low speed).
    if (Math.hypot(b.velocity.x, b.velocity.z) < 0.35) { b.velocity.x = 0; b.velocity.z = 0; }
    // keep our NETWORKED position glued to the travelling body, so others see us
    // slide forward in real time (no teleport when we finally get up).
    const p = player.getPos();
    p.x = b.position.x; p.z = b.position.z;
    camera.position.set(b.position.x, b.position.y, b.position.z);
    // ease the view from where we were looking toward the fallen orientation
    const k = Math.min(1, localRag.t / 0.7);
    const ease = 1 - (1 - k) * (1 - k);
    camera.rotation.set(0, 0, 0, "YXZ");
    camera.rotation.y = localRag.yaw;
    camera.rotation.x = localRag.pitch + (localRag.targPitch - localRag.pitch) * ease;
    camera.rotation.z = localRag.targRoll * ease;
  }
}

// =============================================================
//  MAIN LOOP
// =============================================================
let last = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // never let a single bad frame freeze the whole game: catch, log, keep looping
  try {
    if (running) {
      mic.sample();
      physWorld.step(1 / 60, dt, 3);
      player.update(dt);
      updateLocalRagdoll(dt);
      updateRemotes(dt);
      updateCar(dt);
      fpArm.visible = player.getState().pointing; // pointing is false when ragdolled/seated
      net.maybeSendPosition(now);
    }
    renderer.render(scene, camera);
  } catch (err) {
    console.error("tick error (loop continues):", err);
  }
  requestAnimationFrame(tick);
}
tick();

// debug hook for inspection during development
window.__game = { scene, camera, renderer, player, remotes, colliders, car, enterCar, exitCar, getSeat: () => mySeat };

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
