// =============================================================
//  RAGDOLL — physics-driven limp body (cannon-es).
//  Builds one rigid body per skeleton segment, links them with ball joints,
//  simulates under gravity/collision, then maps the bodies back onto the
//  character's bones each frame (rotation via parent-frame conversion, the
//  pelvis also drives the Hips world position).
// =============================================================
import * as THREE from "three";

// segment: a=start bone, b=end bone (defines the body's extent + orientation),
// drive = the bone whose rotation this body sets, r=half-thickness, m=mass.
const SEGMENTS = [
  { name: "pelvis", a: "Hips", b: "Spine01", drive: "Hips", r: 0.22, m: 3.0, root: true },
  { name: "chest", a: "Spine01", b: "neck", drive: "Spine01", r: 0.22, m: 3.0 },
  { name: "head", a: "Head", b: "head_end", drive: "Head", r: 0.18, m: 1.4 },
  { name: "uarmL", a: "LeftArm", b: "LeftForeArm", drive: "LeftArm", r: 0.08, m: 0.6 },
  { name: "larmL", a: "LeftForeArm", b: "LeftHand", drive: "LeftForeArm", r: 0.07, m: 0.4 },
  { name: "uarmR", a: "RightArm", b: "RightForeArm", drive: "RightArm", r: 0.08, m: 0.6 },
  { name: "larmR", a: "RightForeArm", b: "RightHand", drive: "RightForeArm", r: 0.07, m: 0.4 },
  { name: "thighL", a: "LeftUpLeg", b: "LeftLeg", drive: "LeftUpLeg", r: 0.1, m: 1.1 },
  { name: "shinL", a: "LeftLeg", b: "LeftFoot", drive: "LeftLeg", r: 0.09, m: 0.8 },
  { name: "thighR", a: "RightUpLeg", b: "RightLeg", drive: "RightUpLeg", r: 0.1, m: 1.1 },
  { name: "shinR", a: "RightLeg", b: "RightFoot", drive: "RightLeg", r: 0.09, m: 0.8 },
];
// ball joints at the shared bone point: [bodyA, bodyB, pivotBone]
const JOINTS = [
  ["pelvis", "chest", "Spine01"], ["chest", "head", "Head"],
  ["chest", "uarmL", "LeftArm"], ["uarmL", "larmL", "LeftForeArm"],
  ["chest", "uarmR", "RightArm"], ["uarmR", "larmR", "RightForeArm"],
  ["pelvis", "thighL", "LeftUpLeg"], ["thighL", "shinL", "LeftLeg"],
  ["pelvis", "thighR", "RightUpLeg"], ["thighR", "shinR", "RightLeg"],
];

const _v = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _bq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _pinv = new THREE.Quaternion();
const _des = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export function createRagdoll(CANNON, world, character, group) {
  const bones = {};
  character.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  character.updateWorldMatrix(true, true);
  const wp = (n) => (bones[n] ? bones[n].getWorldPosition(new THREE.Vector3()) : null);

  const bodies = {};
  const constraints = [];
  const segDrive = {};   // body name -> { bone, offset }

  for (const s of SEGMENTS) {
    const pa = wp(s.a), pb = wp(s.b);
    if (!pa || !pb || !bones[s.drive]) continue;
    const mid = _pa.copy(pa).add(pb).multiplyScalar(0.5);
    const len = Math.max(0.1, pa.distanceTo(pb));
    const dir = _pb.copy(pb).sub(pa).normalize();
    _q.setFromUnitVectors(_up, dir); // body local +Y aligned to the segment

    const body = new CANNON.Body({
      mass: s.m,
      position: new CANNON.Vec3(mid.x, mid.y, mid.z),
      linearDamping: 0.05,
      angularDamping: 0.4,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(s.r, len / 2, s.r)));
    body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
    world.addBody(body);
    bodies[s.name] = body;

    // boneWorldQuat = bodyQuat * offset  ⇒  offset = bodyQuat⁻¹ * boneWorldQuat
    const bwq = new THREE.Quaternion();
    bones[s.drive].getWorldQuaternion(bwq);
    const offset = new THREE.Quaternion(_q.x, _q.y, _q.z, _q.w).invert().multiply(bwq);
    segDrive[s.name] = { bone: bones[s.drive], offset, root: !!s.root };
  }

  for (const [aN, bN, pivotBone] of JOINTS) {
    const A = bodies[aN], B = bodies[bN], pv = wp(pivotBone);
    if (!A || !B || !pv) continue;
    const c = new CANNON.PointToPointConstraint(
      A, A.pointToLocalFrame(new CANNON.Vec3(pv.x, pv.y, pv.z)),
      B, B.pointToLocalFrame(new CANNON.Vec3(pv.x, pv.y, pv.z))
    );
    world.addConstraint(c);
    constraints.push(c);
  }

  // give a little initial outward impulse so it flops rather than folding
  function kick(vx, vy, vz) {
    for (const n in bodies) bodies[n].velocity.set(vx, vy, vz);
  }

  // shift the whole ragdoll horizontally (used to follow the owner's networked
  // position so the flop travels in sync rather than each client diverging)
  function translate(dx, dz) {
    if (!dx && !dz) return;
    for (const n in bodies) { bodies[n].position.x += dx; bodies[n].position.z += dz; }
  }

  function sync() {
    const pelvis = bodies.pelvis;
    if (pelvis && bones.Hips && bones.Hips.parent) {
      const p = bones.Hips.parent;
      p.updateWorldMatrix(true, false);
      _v.set(pelvis.position.x, pelvis.position.y, pelvis.position.z);
      bones.Hips.position.copy(p.worldToLocal(_v));
    }
    for (const name in segDrive) {
      const body = bodies[name];
      const d = segDrive[name];
      _bq.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      _des.copy(_bq).multiply(d.offset);                 // desired bone WORLD quat
      const par = d.bone.parent;
      par.updateWorldMatrix(true, false);
      par.getWorldQuaternion(_pq);
      _pinv.copy(_pq).invert();
      d.bone.quaternion.copy(_pinv).multiply(_des);
    }
  }

  function dispose() {
    for (const c of constraints) world.removeConstraint(c);
    for (const n in bodies) world.removeBody(bodies[n]);
  }

  return { bodies, sync, kick, translate, dispose };
}

// shared physics world + ground
export function createPhysicsWorld(CANNON, groundY = 0) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0) });
  world.allowSleep = true;
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.position.set(0, groundY, 0);
  world.addBody(ground);
  return world;
}
