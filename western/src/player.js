// =============================================================
//  PLAYER — first-person controller
//  Pointer-lock mouse look + ZQSD/WASD + jump + AABB collisions.
//  Position is stored at FEET (ground = y 0); camera sits at eye height.
// =============================================================
import * as THREE from "three";

const EYE_HEIGHT = 1.5;   // matches the marshmallow's eye height (~1.49) so you're
                          // at the same level as the other players
const CROUCH_EYE = 0.95;  // lower camera while crouching (Control)
const RADIUS = 0.45;
const SPEED = 3.0;        // calmer pace so the walk cycle keeps up (no foot slide)
const RUN_SPEED = 5.0;    // Shift to sprint
const CROUCH_SPEED = 1.6; // Control to sneak
const JUMP_VEL = 7.5;
const GRAVITY = 22;

export function createPlayerController({ camera, domElement, colliders, bounds = 70 }) {
  const pos = new THREE.Vector3(0, 0, 0);
  const vel = { x: 0, z: 0 }; // current horizontal velocity (kept through ragdoll start)
  let yaw = 0;   // yaw 0 = camera faces -Z (north, toward town)
  let pitch = 0;
  let vy = 0;
  let onGround = true;
  let locked = false;
  let bob = 0;       // head-bob phase
  let bobAmt = 0;    // eased bob amplitude
  let eyeH = EYE_HEIGHT; // eased eye height (drops when crouching)
  let ragdoll = false;   // R toggles limp ragdoll
  let rHeld = false;
  let pointing = false;  // holding right mouse → point the right hand where we look
  let seated = false;    // riding the car: no walking, camera driven externally

  const keys = {};
  const TRACKED = new Set([
    "z", "q", "s", "d", "w", "a",
    "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift", "control",
  ]);

  function uiInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  function onKeyDown(e) {
    if (uiInputFocused()) return;
    const k = e.key.toLowerCase();
    if (k === "r") { if (!rHeld && !seated) { ragdoll = !ragdoll; } rHeld = true; e.preventDefault(); return; }
    if (TRACKED.has(k)) { e.preventDefault(); keys[k] = true; }
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === "r") rHeld = false;
    if (TRACKED.has(k)) keys[k] = false;
  }
  // releasing the mouse / tabbing away can drop the keyup event → clear held
  // keys on blur so the avatar never drifts. The game loop keeps running either way.
  function clearKeys() { for (const k in keys) keys[k] = false; pointing = false; }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);

  // right mouse button held = pointing gesture (only meaningful once pointer-locked)
  function onMouseDown(e) { if (e.button === 2 && locked) { pointing = true; } }
  function onMouseUp(e) { if (e.button === 2) pointing = false; }
  function onContextMenu(e) { if (locked) e.preventDefault(); }
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("contextmenu", onContextMenu);

  // ---- pointer lock mouse look ----
  function onMouseMove(e) {
    if (!locked) return;
    const sens = 0.0022;
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.05;
    pitch = Math.max(-lim, Math.min(lim, pitch));
  }
  document.addEventListener("mousemove", onMouseMove);

  function requestLock() {
    if (domElement.requestPointerLock) domElement.requestPointerLock();
  }
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === domElement;
    if (onLockChange) onLockChange(locked);
  });
  let onLockChange = null;

  // ---- collision: separate-axis AABB push-out (allows sliding) ----
  function collideAxis(axis) {
    for (const c of colliders) {
      const minX = c.minX - RADIUS, maxX = c.maxX + RADIUS;
      const minZ = c.minZ - RADIUS, maxZ = c.maxZ + RADIUS;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        if (axis === "x") {
          // push out on X toward nearest edge
          pos.x = (pos.x - c.minX < c.maxX - pos.x) ? minX : maxX;
        } else {
          pos.z = (pos.z - c.minZ < c.maxZ - pos.z) ? minZ : maxZ;
        }
      }
    }
  }

  function update(dt) {
    // while ragdolled (limp) or seated in the car, movement + camera are driven
    // externally by main.js — so bail out of the normal walk/look here.
    if (ragdoll || seated) return false;
    // movement input relative to look yaw
    let fwd = 0, strafe = 0;
    if (keys.z || keys.w || keys.arrowup) fwd += 1;
    if (keys.s || keys.arrowdown) fwd -= 1;
    if (keys.d || keys.arrowright) strafe += 1;
    if (keys.q || keys.a || keys.arrowleft) strafe -= 1;

    const moving = !!(fwd || strafe);
    const crouching = !!keys.control && onGround;
    const running = moving && !!keys.shift && onGround && !crouching;
    if (moving) {
      const len = Math.hypot(fwd, strafe);
      fwd /= len; strafe /= len;
      // forward = -Z rotated by yaw; right = +X rotated by yaw
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      const fX = -sinY, fZ = -cosY;
      const rX = cosY, rZ = -sinY;
      const speed = crouching ? CROUCH_SPEED : (running ? RUN_SPEED : SPEED);
      vel.x = (fX * fwd + rX * strafe) * speed;   // world velocity (units/sec)
      vel.z = (fZ * fwd + rZ * strafe) * speed;
      pos.x += vel.x * dt; collideAxis("x");
      pos.z += vel.z * dt; collideAxis("z");
    } else {
      vel.x = 0; vel.z = 0;
    }

    // jump + gravity
    if (keys[" "] && onGround) { vy = JUMP_VEL; onGround = false; }
    if (!onGround) {
      vy -= GRAVITY * dt;
      pos.y += vy * dt;
      if (pos.y <= 0) { pos.y = 0; vy = 0; onGround = true; }
    }

    // world bounds
    pos.x = Math.max(-bounds, Math.min(bounds, pos.x));
    pos.z = Math.max(-bounds, Math.min(bounds, pos.z));

    // bouncy head-bob while walking/running on the ground (stronger when running)
    const wantBob = moving && onGround ? (running ? 1.5 : 1) : 0;
    bobAmt += (wantBob - bobAmt) * Math.min(1, 8 * dt);
    bob += dt * (running ? 16 : 11);
    const bobY = Math.sin(bob) * 0.06 * bobAmt;
    const bobX = Math.cos(bob * 0.5) * 0.04 * bobAmt;

    // eye height eases down while crouching
    eyeH += ((crouching ? CROUCH_EYE : EYE_HEIGHT) - eyeH) * Math.min(1, 10 * dt);

    // place camera at eye height, apply yaw + pitch
    camera.position.set(pos.x, pos.y + eyeH + bobY, pos.z);
    camera.rotation.set(0, 0, 0, "YXZ");
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = bobX * 0.25; // subtle walking sway

    return moving;
  }

  function spawn(p) {
    pos.set(p.x, 0, p.z);
    yaw = p.yaw ?? Math.PI;
    pitch = 0;
    vy = 0;
    onGround = true;
  }

  function getState() {
    const moving = !!(keys.z || keys.s || keys.q || keys.d || keys.w || keys.a ||
      keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright);
    const crouching = !!keys.control && onGround;
    return {
      x: pos.x, y: pos.y, z: pos.z,
      yaw, pitch,
      moving: moving && !ragdoll,
      crouching: crouching && !ragdoll,
      running: moving && !!keys.shift && onGround && !crouching && !ragdoll,
      airborne: !onGround,
      ragdoll,
      vx: vel.x, vz: vel.z,
      pointing: pointing && !ragdoll && !seated,
    };
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearKeys);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("contextmenu", onContextMenu);
  }

  return {
    update, spawn, getState, requestLock, dispose,
    isLocked: () => locked,
    setLockChange: (fn) => { onLockChange = fn; },
    isRagdoll: () => ragdoll,
    setRagdoll: (v) => { ragdoll = !!v; },
    getVelocity: () => vel,
    getPos: () => pos,
    setGround: (x, z) => { pos.x = x; pos.z = z; pos.y = 0; vy = 0; onGround = true; },
    getYawPitch: () => ({ yaw, pitch }),
    setSeated: (v) => { seated = !!v; },
    isSeated: () => seated,
    setLook: (y, p) => { yaw = y; pitch = p; },
    // raw drive input (read while seated, since update() bails out then)
    getDriveInput: () => {
      let fwd = 0, turn = 0;
      if (keys.z || keys.w || keys.arrowup) fwd += 1;
      if (keys.s || keys.arrowdown) fwd -= 1;
      if (keys.d || keys.arrowright) turn += 1;
      if (keys.q || keys.a || keys.arrowleft) turn -= 1;
      return { fwd, turn, brake: !!keys[" "] };
    },
  };
}
