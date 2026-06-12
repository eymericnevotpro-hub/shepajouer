// =============================================================
//  CAR — a drivable open-top buggy with a driver + passenger seat.
//  Arcade physics (accelerate / brake / steer); heading 0 faces -Z (north),
//  so it matches the player's yaw convention. The owner (driver) streams the
//  transform over the network; everyone renders occupants in the seats.
// =============================================================
import * as THREE from "three";

const ACCEL = 13;          // forward acceleration (u/s²)
const REVERSE_ACCEL = 7;
const MAX_SPEED = 15;
const MAX_REVERSE = 5;
const FRICTION = 7;        // coast deceleration
const BRAKE = 22;
const TURN_RATE = 1.7;     // rad/s at full steer & speed
const CAR_RADIUS = 1.1;    // for building collision

function mat(c, r = 0.7, m = 0.05) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
}

export function createCar(scene, opts = {}) {
  const colliders = opts.colliders || [];
  const bounds = opts.bounds || 70;

  const tint = opts.color ?? 0x9c2b2b;
  const bodyMat = mat(tint), trimMat = mat(0x2c1a10, 0.85), wheelMat = mat(0x141414, 0.95);
  const seatMat = mat(0x6b4a2a, 0.85), metalMat = mat(0xcdb774, 0.5, 0.3), glassMat =
    new THREE.MeshStandardMaterial({ color: 0xbfe0ee, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.35 });

  const car = new THREE.Group();

  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    car.add(mesh);
    return mesh;
  };

  // chassis (front = -Z)
  add(new THREE.BoxGeometry(1.7, 0.45, 3.5), bodyMat, 0, 0.6, 0);
  add(new THREE.BoxGeometry(1.75, 0.18, 3.6), trimMat, 0, 0.38, 0);     // running board / underframe
  add(new THREE.BoxGeometry(1.55, 0.32, 1.15), bodyMat, 0, 0.52, -1.45); // hood (front)
  add(new THREE.BoxGeometry(1.0, 0.28, 0.2), metalMat, 0, 0.58, -2.08);  // front grille
  // open tub sides (so the seats/occupants stay visible)
  add(new THREE.BoxGeometry(0.18, 0.5, 1.9), bodyMat, -0.78, 1.02, 0.35);
  add(new THREE.BoxGeometry(0.18, 0.5, 1.9), bodyMat, 0.78, 1.02, 0.35);
  add(new THREE.BoxGeometry(1.7, 0.5, 0.18), bodyMat, 0, 1.02, 1.25);    // rear wall
  add(new THREE.BoxGeometry(1.7, 0.12, 1.9), trimMat, 0, 0.8, 0.35);     // interior floor
  // bench seats
  add(new THREE.BoxGeometry(0.62, 0.18, 0.62), seatMat, -0.42, 0.95, 0.55);
  add(new THREE.BoxGeometry(0.62, 0.55, 0.16), seatMat, -0.42, 1.2, 0.92);
  add(new THREE.BoxGeometry(0.62, 0.18, 0.62), seatMat, 0.42, 0.95, 0.55);
  add(new THREE.BoxGeometry(0.62, 0.55, 0.16), seatMat, 0.42, 1.2, 0.92);
  // windshield frame + glass
  add(new THREE.BoxGeometry(1.6, 0.7, 0.06), glassMat, 0, 1.35, -0.55);
  add(new THREE.BoxGeometry(1.66, 0.08, 0.08), metalMat, 0, 1.72, -0.55);
  // steering wheel hint
  const sw = add(new THREE.TorusGeometry(0.16, 0.04, 8, 16), trimMat, -0.42, 1.15, -0.35);
  sw.rotation.x = 1.2;

  // wheels (cylinder axis along X)
  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16);
  for (const [wx, wz] of [[-0.92, -1.15], [0.92, -1.15], [-0.92, 1.2], [0.92, 1.2]]) {
    const w = add(wheelGeo, wheelMat, wx, 0.46, wz);
    w.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10), metalMat, wx, 0.46, wz).rotation.z = Math.PI / 2;
  }

  scene.add(car);

  const state = { x: opts.x || 0, z: opts.z || 0, heading: opts.heading || 0, speed: 0 };

  // seat anchors in car-local space: eye = camera height, body = where the avatar sits
  const SEAT = {
    driver: { eye: new THREE.Vector3(-0.42, 1.5, 0.2), body: new THREE.Vector3(-0.42, 0.55, 0.5) },
    passenger: { eye: new THREE.Vector3(0.42, 1.5, 0.2), body: new THREE.Vector3(0.42, 0.55, 0.5) },
  };

  function apply() {
    car.position.set(state.x, 0, state.z);
    car.rotation.y = state.heading;
  }
  apply();

  function blocked(nx, nz) {
    if (nx < -bounds || nx > bounds || nz < -bounds || nz > bounds) return true;
    for (const c of colliders) {
      if (nx > c.minX - CAR_RADIUS && nx < c.maxX + CAR_RADIUS &&
          nz > c.minZ - CAR_RADIUS && nz < c.maxZ + CAR_RADIUS) return true;
    }
    return false;
  }

  // input: { fwd:-1..1, turn:-1..1, brake:bool }
  function update(dt, input) {
    const { fwd = 0, turn = 0, brake = false } = input || {};
    if (brake) {
      state.speed -= Math.sign(state.speed) * BRAKE * dt;
      if (Math.abs(state.speed) < 0.4) state.speed = 0;
    } else if (fwd > 0) {
      state.speed += ACCEL * dt;
    } else if (fwd < 0) {
      state.speed -= REVERSE_ACCEL * dt;
    } else {
      state.speed -= Math.sign(state.speed) * FRICTION * dt;
      if (Math.abs(state.speed) < 0.2) state.speed = 0;
    }
    state.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, state.speed));
    // steering scales with speed (and reverses going backwards), like a real car
    const sf = Math.max(-1, Math.min(1, state.speed / 4));
    state.heading -= turn * TURN_RATE * dt * sf;

    const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
    const nx = state.x + fx * state.speed * dt;
    const nz = state.z + fz * state.speed * dt;
    if (blocked(nx, nz)) { state.speed *= -0.2; } // bump: stop & tiny bounce
    else { state.x = nx; state.z = nz; }
    apply();
  }

  function setState(s) {
    if (s.x != null) state.x = s.x;
    if (s.z != null) state.z = s.z;
    if (s.heading != null) state.heading = s.heading;
    apply();
  }

  const _w = new THREE.Vector3();
  function seatEyeWorld(which) { return car.localToWorld(_w.copy(SEAT[which].eye)); }
  function seatBodyWorld(which) { return car.localToWorld(_w.copy(SEAT[which].body)); }
  // a ground point beside the car to step out onto (left of driver / right of passenger)
  function exitWorld(which) {
    const side = which === "driver" ? -1.6 : 1.6;
    car.localToWorld(_w.set(side, 0, 0.4));
    return { x: _w.x, z: _w.z };
  }

  return { group: car, state, update, setState, seatEyeWorld, seatBodyWorld, exitWorld };
}
