// =============================================================
//  CHARACTER — Meshy "Marshmallow" GLB, one per remote player.
//  Loaded once, cloned (skeleton-aware) per player, tinted by colour,
//  walk animation driven by movement, bouncy squash & stretch on top.
//  (The local player is first-person, so this is only used for REMOTES.)
// =============================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const MODEL_URL = "assets/marshmallow.glb";        // mesh + walk (merged file)
const IDLE_URL = "assets/marshmallow_idle.glb";    // dedicated calm idle clip
const RUN_URL = "assets/marshmallow_run.glb";      // dedicated running clip

// ---- EMOTES: full-body one-shot animations (e.g. made with NVIDIA Kimodo) ----
// EMOTES_HOWTO:
//   1. Generate a motion in Kimodo, retarget it onto our rig and export a GLB
//      (see tools/kimodo/README.md). Drop it in assets/.
//   2. Add an entry below: { key, name, url, dur } where `key` is the keyboard
//      key that triggers it (1-9), `name` is a unique id, `url` the GLB path,
//      `dur` the clip length in seconds (so we know when to blend back to idle).
//   3. That's it — in game the key plays the emote and other players see it.
// Example (uncomment once you have the GLB):
//   { key: "1", name: "tiphat",  url: "assets/marshmallow_tiphat.glb",  dur: 2.0 },
//   { key: "2", name: "dance",   url: "assets/marshmallow_dance.glb",   dur: 3.5 },
export const EMOTES = [
  { key: "1", name: "wave", url: "assets/marshmallow_wave.glb", dur: 3.8 }, // généré avec Kimodo
];
const TARGET_HEIGHT = 1.7;      // world units
const FACE_OFFSET = Math.PI;    // so yaw=0 (looking north, -Z) shows the player's back

// Foot-slide calibration: the walk clip's natural ground speed at timeScale 1
// (measured ~1.15 u/s). We scale the walk playback to the real move speed so
// the feet stay planted (no floating). Speeds mirror player.js.
const STRIDE_SPEED = 1.15;
const RUN_STRIDE = 2.1; // the running clip's natural ground speed at timeScale 1 (measured)
const WALK_SPEED = 3.0, RUN_GROUND = 5.0, CROUCH_GROUND = 1.6;

// reusable temps for head-look rotation
const _Q = new THREE.Quaternion();
const _Qinv = new THREE.Quaternion();
const _R = new THREE.Quaternion();
const _base = new THREE.Quaternion();
const _pure = new THREE.Quaternion();
const _eu = new THREE.Euler();
const HEAD_IDLE_DELAY = 5; // seconds of no head input before the idle look-around plays

// procedural jab rotations (radians at full extension), in the upright body frame
const JAB_UPPER = [-1.5, 0.2, 0];   // upper arm swings up/forward
const JAB_FORE = [-1.1, 0, 0];      // forearm extends
// procedural hit recoil: torso snaps backward (+ slight twist) when punched
const HIT_TORSO = [0.7, 0, 0.25];   // lean back about X, small twist about Z

// apply a body-frame rotation (euler * amt) on top of `rest` into bone-local space
function applyBodyRot(bone, chain, rest, e, amt) {
  _Q.identity();
  for (let i = 0; i < chain.length; i++) _Q.multiply(chain[i].quaternion);
  _Qinv.copy(_Q).invert();
  _eu.set(e[0] * amt, e[1] * amt, e[2] * amt, "XYZ");
  _R.setFromEuler(_eu);
  bone.quaternion.copy(_Qinv).multiply(_R).multiply(_Q).multiply(rest);
}

// Aim a bone so its local bone-axis points along a WORLD direction (used to point
// the right arm exactly where the player looks). Eased by `amt` (0..1).
function aimBoneAt(bone, axisLocal, worldDir, amt) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_Q);
  _Qinv.copy(_Q).invert();
  _R.setFromUnitVectors(axisLocal, worldDir); // world quat: _R · axisLocal = worldDir
  _base.copy(_Qinv).multiply(_R);             // → bone-local target
  bone.quaternion.slerp(_base, amt);
}

// pointing finger: a small tapered nub that extends from the right hand along the
// arm while the player holds right-click (world-space units, ~13cm long).
const FINGER_GEO = new THREE.CylinderGeometry(0.016, 0.032, 0.13, 12);
FINGER_GEO.translate(0, 0.065, 0); // base at origin, tip at +Y so we can aim +Y along the look dir
const _fwp = new THREE.Vector3();  // temps for the per-frame finger placement
const _ffore = new THREE.Vector3();
const _fdir = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _fqi = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0); // finger's local axis to aim along the look dir

// ---- face (eyes + animated mouth), shared geometry/materials ----
const EYE_GEO = new THREE.SphereGeometry(0.045, 20, 20);
const EYE_MAT = new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 0.55 });
const EYE_SCALE = [1, 1.25, 0.7];           // slightly oval, flattened against the face
const MOUTH_GEO = new THREE.SphereGeometry(0.05, 20, 16);
const MOUTH_MAT = new THREE.MeshStandardMaterial({ color: 0x2a120e, roughness: 0.6 });
const MOUTH_BASE = [1.6, 0.35, 0.5];         // closed mouth = thin line; opens by scaling Y
// face-anchor transform in the head bone's local space (calibrated once on the rig)
const FACE_POS = [-0.539, 28.563, 10.041];
const FACE_QUAT = [-0.2886, -0.0011, 0.0011, 0.9574];
const FACE_SCALE = 100;

// Per-player tint colours (the marshmallow is white, so colour multiplies cleanly).
const PALETTES = [
  { color: 0xe85d4a }, // red
  { color: 0x4aa6e8 }, // blue
  { color: 0x6bd06b }, // green
  { color: 0xe8c14a }, // yellow
  { color: 0xb46be8 }, // purple
  { color: 0xe88f4a }, // orange
  { color: 0xe86bb0 }, // pink
  { color: 0x6be8d0 }, // teal
];
export function paletteFor(index) {
  return PALETTES[index % PALETTES.length];
}

// one-shot actions: {hold = seconds the action owns the body, rate = playback}
const ONESHOT = {
  punch: { hold: 0.7, rate: 1.7 },
  hit: { hold: 0.9, rate: 1.3 },
};
// trigger a full-body EMOTE clip (plays once, then blends back to idle/walk)
export function triggerEmote(char, name) {
  const u = char.userData;
  if (!u || !u.actions || !u.actions[name]) return;
  const def = EMOTES.find((e) => e.name === name);
  u.emote = { name, t: (def && def.dur) || 2 };
  const a = u.actions[name];
  a.reset();
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.timeScale = 1;
  a.play();
}

// trigger a one-shot action (punch / hit) on a character. The motion is PROCEDURAL
// (driven in animateCharacter), so this works even when no baked GLB clip exists.
export function triggerOneShot(char, name) {
  const u = char.userData;
  if (!u || !ONESHOT[name]) return;
  u.oneShot = { name, t: ONESHOT[name].hold };
  const a = u.actions && u.actions[name];
  if (a) { // play the baked clip too, if this model happens to ship one
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = ONESHOT[name].rate;
    a.play();
  }
}

// ---- load the template once (shared promise) ----
let templatePromise = null;
function loadGLB(url) {
  return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
}
// Only the SHOULDER bones are stripped from clips: the Meshy auto-rig bleeds
// head skin-weight onto them, so their motion squashes the round head. Head/neck
// are kept so the clips' "look around" plays; the mouse-look is layered on top.
const CLIP_SKIP_BONES = new Set(["LeftShoulder", "RightShoulder"]);
// Keep every bone's POSITION track (Meshy bakes them on all 24 bones and they're
// needed to keep the feet planted) and the body QUATERNIONs (minus head/neck/
// shoulders). Only the HIPS root translation is neutralized: freeze X/Z (no
// horizontal drift) and, unless keepHipsY, freeze Y too (jump/punch driven in-game).
function bodyPose(clip, keepHipsY = false) {
  if (!clip) return null;
  const out = [];
  for (const t of clip.tracks) {
    const bone = t.name.split(".")[0].split("/").pop();
    if (t.name.endsWith(".quaternion")) {
      if (!CLIP_SKIP_BONES.has(bone)) out.push(t);
    } else if (t.name.endsWith(".position")) {
      if (bone === "Hips") {
        const v = t.values.slice();
        const x0 = v[0], y0 = v[1], z0 = v[2]; // first-frame, anti-drift
        for (let i = 0; i < v.length; i += 3) {
          v[i] = x0; v[i + 2] = z0;
          if (!keepHipsY) v[i + 1] = y0;
        }
        out.push(new THREE.VectorKeyframeTrack(t.name, t.times.slice(), v));
      } else {
        out.push(t); // other bones' positions keep the pose / feet planted
      }
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, out);
}
function loadTemplate() {
  if (templatePromise) return templatePromise;
  templatePromise = Promise.all([loadGLB(MODEL_URL), loadGLB(IDLE_URL), loadGLB(RUN_URL),
                                 ...EMOTES.map((e) => loadGLB(e.url).catch(() => null))])
    .then(([gltf, idleGltf, runGltf, ...emoteGltfs]) => {
      const root = gltf.scene;
      // normalise scale (height) and drop feet to y=0, centred on x/z
      root.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3(); box.getSize(size);
      root.scale.setScalar(TARGET_HEIGHT / size.y);
      root.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(root);
      const ctr = box.getCenter(new THREE.Vector3());
      root.position.x -= ctr.x;
      root.position.z -= ctr.z;
      root.position.y -= box.min.y;
      root.position.y -= 0.015; // tiny extra so BOTH feet stay firmly planted (no float)
      // material fixes (Meshy ships metalness=1; make it matte, no texture)
      root.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.castShadow = true;
          o.frustumCulled = false;
          if (o.material) {
            o.material.metalness = 0;
            o.material.roughness = 0.9;
            if (o.material.emissive) o.material.emissiveIntensity = 0;
          }
        }
      });
      const byName = (n) => gltf.animations.find((a) => a.name === n) || null;
      // both are dedicated exports with a single clip (raw name like
      // "Armature|walking_man|baselayer"), so take animations[0] directly.
      const idleClip = idleGltf.animations[0] || byName("Long_Breathe_and_Look_Around");
      const walkClip = gltf.animations[0] || byName("Walking");
      const runClip = (runGltf && runGltf.animations[0]) || byName("Running");
      // emote clips (Kimodo-made etc.): keep full body, neutralize Hips drift
      const emotes = {};
      EMOTES.forEach((e, i) => {
        const g = emoteGltfs[i];
        const clip = g && g.animations && g.animations[0];
        if (clip) emotes[e.name] = bodyPose(clip, true);
        else console.warn("emote clip missing:", e.name, e.url);
      });
      return {
        root, emotes,
        idleClip: bodyPose(idleClip, true),
        walkClip: bodyPose(walkClip, true),
        runClip: bodyPose(runClip, true),
        jumpClip: bodyPose(byName("Regular_Jump")),          // physics drives height
        crouchIdleClip: bodyPose(byName("CrouchLookAroundBow"), true),
        crouchWalkClip: bodyPose(byName("Cautious_Crouch_Walk_Right_inplace"), true),
        // punch/hit: keep the FULL clip (shoulders + lunge) so the jab/recoil actually show
        punchClip: byName("Left_Jab_from_Guard"),
        hitClip: byName("Face_Punch_Reaction"),
      };
    })
    .catch((err) => { console.error("Failed to load character model", err); throw err; });
  return templatePromise;
}

// kick off loading immediately so the first player appears fast
loadTemplate().catch(() => {});

export function makeCharacter(opts = {}) {
  const tint = opts.color ?? opts.shirt ?? 0xffffff;

  // outer group: positioned/rotated by the game (network pose), scaled for squash
  const outer = new THREE.Group();
  outer.userData.animPhase = Math.random() * 6;
  outer.userData.land = 0;
  outer.userData.prevAir = false;
  outer.userData.mixer = null;
  outer.userData.actions = null;
  outer.userData.weights = { idle: 1, walk: 0, run: 0, crouchIdle: 0, crouchWalk: 0, jump: 0, punch: 0, hit: 0 };
  outer.userData.oneShot = null;   // { name, t } one-shot action (punch / hit)
  outer.userData.emote = null;     // { name, t } full-body emote clip (Kimodo etc.)
  outer.userData.point = 0;        // 0..1 eased weight of the right-hand pointing gesture
  outer.userData.headBone = null;
  outer.userData.headRest = null;
  outer.userData.headYaw = 0;
  outer.userData.headPitch = 0;
  outer.userData.headIdleT = 0;   // time since the player last moved their head
  outer.userData.lookOverride = 1; // 1 = player controls head, 0 = idle look-around
  outer.userData.prevHY = 0;
  outer.userData.prevHP = 0;
  outer.userData.mouth = null;
  outer.userData.speaking = 0; // 0..1 voice level, drives the mouth open amount

  loadTemplate().then(({ root, emotes, idleClip, walkClip, runClip, jumpClip, crouchIdleClip, crouchWalkClip, punchClip, hitClip }) => {
    const inst = cloneSkinned(root);
    // tint a per-instance copy of the material (texture stays shared)
    inst.traverse((o) => {
      if ((o.isMesh || o.isSkinnedMesh) && o.material) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(tint);
        // drop the baked texture (painted eyes/mouth + shading) for a clean,
        // smooth solid-colour marshmallow — our geometry face replaces it.
        o.material.map = null;
        o.material.emissiveMap = null;
        o.material.needsUpdate = true;
      }
    });
    // helpers to locate a bone and build its outer→parent chain (top-down),
    // used to convert a body-frame rotation into the bone's local space.
    const findBone = (name) => { let b = null; inst.traverse((o) => { if (o.isBone && o.name === name) b = o; }); return b; };
    const buildChain = (bone) => { const ch = []; let n = bone.parent; while (n && n !== outer) { ch.unshift(n); n = n.parent; } return ch; };

    // head bone (at bind pose) so we can swivel it toward the look direction
    const headBone = findBone("Head") || findBone("neck");
    outer.userData.headBone = headBone;
    outer.userData.headRest = headBone ? headBone.quaternion.clone() : null;
    outer.userData.headChain = headBone ? buildChain(headBone) : [];

    // arm bones: LEFT drives the procedural jab, RIGHT drives the pointing gesture
    const upper = findBone("LeftArm"), fore = findBone("LeftForeArm");
    const upperR = findBone("RightArm"), foreR = findBone("RightForeArm");
    outer.userData.arm = upper ? {
      upper, fore,
      upperRest: upper.quaternion.clone(),
      foreRest: fore ? fore.quaternion.clone() : null,
      upperChain: buildChain(upper),
      foreChain: fore ? buildChain(fore) : null,
      upperR, foreR,
      upperRRest: upperR ? upperR.quaternion.clone() : null,
      foreRRest: foreR ? foreR.quaternion.clone() : null,
      upperRChain: upperR ? buildChain(upperR) : [],
      foreRChain: foreR ? buildChain(foreR) : [],
      // bone-axis directions (shoulder→elbow, elbow→wrist) for direction-based aim
      armAxisR: foreR && foreR.position.lengthSq() > 1e-6 ? foreR.position.clone().normalize() : null,
      foreAxisR: null, // filled once the hand bone is found below
    } : null;

    // pointing finger: extends from the right hand along the forearm→hand axis.
    // Parented to `outer` and placed in world each frame (no bone-frame calibration).
    outer.userData.handBone = findBone("RightHand");
    outer.userData.foreRBone = foreR;
    if (outer.userData.arm && outer.userData.handBone && outer.userData.handBone.position.lengthSq() > 1e-6) {
      outer.userData.arm.foreAxisR = outer.userData.handBone.position.clone().normalize();
    }
    if (outer.userData.handBone) {
      const finger = new THREE.Mesh(FINGER_GEO, new THREE.MeshStandardMaterial({
        color: tint, roughness: 0.85, metalness: 0,
      }));
      finger.visible = false;
      finger.frustumCulled = false;
      finger.castShadow = true;
      outer.add(finger);
      outer.userData.finger = finger;
    }

    // torso bone for the procedural hit recoil (chest leans back when punched)
    const chest = findBone("Spine02") || findBone("Spine01") || findBone("Spine");
    outer.userData.torso = chest ? {
      chest, chestRest: chest.quaternion.clone(), chestChain: buildChain(chest),
    } : null;

    // build the face (eyes + mouth) anchored to the head bone so it follows the
    // head's look rotation. Transform was calibrated once against the rig.
    if (headBone) {
      const anchor = new THREE.Group();
      anchor.position.fromArray(FACE_POS);
      anchor.quaternion.fromArray(FACE_QUAT);
      anchor.scale.setScalar(FACE_SCALE);
      headBone.add(anchor);
      const eyeL = new THREE.Mesh(EYE_GEO, EYE_MAT);
      eyeL.position.set(-0.085, 0, 0.03); eyeL.scale.fromArray(EYE_SCALE);
      const eyeR = new THREE.Mesh(EYE_GEO, EYE_MAT);
      eyeR.position.set(0.085, 0, 0.03); eyeR.scale.fromArray(EYE_SCALE);
      const mouth = new THREE.Mesh(MOUTH_GEO, MOUTH_MAT);
      mouth.position.set(0, -0.115, 0.03); mouth.scale.fromArray(MOUTH_BASE);
      anchor.add(eyeL, eyeR, mouth);
      outer.userData.mouth = mouth;
    }
    // facing wrapper so the model's front lines up with our +Z convention
    const facer = new THREE.Group();
    facer.rotation.y = FACE_OFFSET;
    facer.add(inst);
    outer.add(facer);

    const mixer = new THREE.AnimationMixer(inst);
    outer.userData.mixer = mixer;
    const mk = (clip, w) => {
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setEffectiveWeight(w);
      a.play();
      return a;
    };
    outer.userData.actions = {
      idle: mk(idleClip, 1),
      walk: mk(walkClip, 0),
      run: mk(runClip, 0),
      crouchIdle: mk(crouchIdleClip, 0),
      crouchWalk: mk(crouchWalkClip, 0),
      jump: mk(jumpClip, 0),
      punch: mk(punchClip, 0),
      hit: mk(hitClip, 0),
    };
    // emote clips → one action each, weight 0 until triggered
    for (const name in (emotes || {})) {
      const a = mk(emotes[name], 0);
      if (a) { outer.userData.actions[name] = a; outer.userData.weights[name] = 0; }
    }
    // idle = a FROZEN neutral standing pose (no clip motion). The only idle
    // movement is the subtle breathing applied via scale below.
    if (outer.userData.actions.idle) { outer.userData.actions.idle.timeScale = 0; outer.userData.actions.idle.time = 0; }
  }).catch(() => {});

  return outer;
}

export function animateCharacter(char, dt, isMoving, isAirborne, isRunning, isCrouching, isPointing) {
  const u = char.userData;

  if (u.mixer && u.actions) {
    // animations: an active EMOTE wins; else run (sprint) / walk (move) / idle.
    const w = u.weights;
    const tgt = {};
    for (const key in w) tgt[key] = 0;
    if (u.emote && u.actions[u.emote.name]) {
      tgt[u.emote.name] = 1;
      u.emote.t -= dt;
      if (u.emote.t <= 0) u.emote = null;
    } else if (isRunning && u.actions.run) tgt.run = 1;
    else if (isMoving) tgt.walk = 1;
    else tgt.idle = 1;
    const k = Math.min(1, 12 * dt);
    let sum = 0;
    for (const key in w) { w[key] += (tgt[key] - w[key]) * k; sum += w[key]; }
    sum = sum || 1;
    for (const key in w) { if (u.actions[key]) u.actions[key].setEffectiveWeight(w[key] / sum); }
    // calibrate playback speed to the real ground speed → feet stay planted (no slide)
    if (u.actions.walk) {
      const ground = isCrouching ? CROUCH_GROUND : WALK_SPEED;
      u.actions.walk.timeScale = ground / STRIDE_SPEED;
    }
    if (u.actions.run) u.actions.run.timeScale = RUN_GROUND / RUN_STRIDE;
    u.mixer.update(dt);

    // HEAD: always controlled by the player's look (mouse). No animation head
    // motion on top — pure look, built in the upright body frame and converted
    // into the head bone's local space (clean horizontal turn + vertical nod).
    if (u.headBone && u.headRest && u.headChain) {
      _Q.identity();
      for (let i = 0; i < u.headChain.length; i++) _Q.multiply(u.headChain[i].quaternion);
      _Qinv.copy(_Q).invert();
      _eu.set(-(u.headPitch || 0), u.headYaw || 0, 0, "YXZ");
      _R.setFromEuler(_eu);
      u.headBone.quaternion.copy(_Qinv).multiply(_R).multiply(_Q).multiply(u.headRest);
    }

    // procedural melee one-shot: jab the left arm when punching, snap the torso
    // back when hit. The timer is advanced here and cleared when the move ends.
    if (u.oneShot) {
      const cfg = ONESHOT[u.oneShot.name];
      const hold = cfg ? cfg.hold : 0.7;
      const p = 1 - Math.max(0, u.oneShot.t) / hold;            // 0..1 progress
      const amt = Math.sin(Math.min(1, p * 1.25) * Math.PI);    // quick out → back, 0→1→0
      if (u.oneShot.name === "punch" && u.arm) {
        applyBodyRot(u.arm.upper, u.arm.upperChain, u.arm.upperRest, JAB_UPPER, amt);
        if (u.arm.fore) applyBodyRot(u.arm.fore, u.arm.foreChain, u.arm.foreRest, JAB_FORE, amt);
      } else if (u.oneShot.name === "hit" && u.torso) {
        applyBodyRot(u.torso.chest, u.torso.chestChain, u.torso.chestRest, HIT_TORSO, amt);
      }
      u.oneShot.t -= dt;
      if (u.oneShot.t <= 0) u.oneShot = null;
    }

    // ---- pointing: aim the RIGHT arm straight along the player's look direction
    u.point += ((isPointing ? 1 : 0) - u.point) * Math.min(1, 12 * dt);
    if (u.arm && u.arm.upperR && u.arm.armAxisR && u.point > 0.01) {
      // world look direction: body yaw + head yaw (horizontal) and head pitch (vertical)
      const wy = char.rotation.y + (u.headYaw || 0);
      const cp = Math.cos(u.headPitch || 0), sp = Math.sin(u.headPitch || 0);
      _fdir.set(-Math.sin(wy) * cp, sp, -Math.cos(wy) * cp).normalize();
      aimBoneAt(u.arm.upperR, u.arm.armAxisR, _fdir, u.point);                       // upper arm → forward
      if (u.arm.foreR && u.arm.foreAxisR) aimBoneAt(u.arm.foreR, u.arm.foreAxisR, _fdir, u.point); // straighten along the same dir
    }
    // place/aim the finger along the forearm→hand axis (in world, then to outer-local)
    if (u.finger && u.handBone && u.foreRBone) {
      if (u.point > 0.45) {
        char.updateWorldMatrix(true, true); // reflect the arm rotation just applied
        u.handBone.getWorldPosition(_fwp);
        u.foreRBone.getWorldPosition(_ffore);
        _fdir.copy(_fwp).sub(_ffore).normalize();
        _fwp.addScaledVector(_fdir, 0.05);   // start just past the hand
        u.finger.position.copy(char.worldToLocal(_fwp));
        _fq.setFromUnitVectors(_UP, _fdir);  // aim the finger's +Y down the look dir
        char.getWorldQuaternion(_fqi); _fqi.invert();
        u.finger.quaternion.copy(_fqi).multiply(_fq);
        u.finger.visible = true;
      } else {
        u.finger.visible = false;
      }
    }
  }

  // landing squash impulse (airborne -> grounded)
  if (u.prevAir && !isAirborne) u.land = 1;
  u.prevAir = isAirborne;
  u.land = (u.land || 0) * Math.exp(-dt * 9);

  u.animPhase += dt * (isMoving ? 9 : 2.0);
  const t = u.animPhase;

  // bouncy squash & stretch (on the outer group, on top of the model scale)
  let sy = 1, sxz = 1;
  if (isAirborne) { sy = 1.12; sxz = 0.94; }          // slight stretch in the air
  else if (!isMoving) { sy += Math.sin(t) * 0.02; sxz -= Math.sin(t) * 0.02; } // idle breathe
  // crouch: visibly squat down (eased) so others clearly see it
  const wantCrouch = isCrouching && !isAirborne ? 1 : 0;
  u.crouch = (u.crouch || 0) + (wantCrouch - (u.crouch || 0)) * Math.min(1, 10 * dt);
  sy *= 1 - 0.26 * u.crouch;
  sxz *= 1 + 0.12 * u.crouch;
  const land = u.land || 0;
  sy *= 1 - 0.28 * land;                               // landing splat
  sxz *= 1 + 0.22 * land;
  char.scale.set(sxz, sy, sxz);

  // mouth opens with the voice level (smoothed toward the network value),
  // scaling around its closed base shape so it grows into a small "o".
  if (u.mouth) {
    u.mouthOpen = (u.mouthOpen || 0) + ((u.speaking || 0) - (u.mouthOpen || 0)) * Math.min(1, 18 * dt);
    const o = u.mouthOpen;
    u.mouth.scale.set(MOUTH_BASE[0] * (1 - o * 0.25), MOUTH_BASE[1] * (1 + o * 2.4), MOUTH_BASE[2]);
  }
}
