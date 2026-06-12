# =============================================================
#  retarget_marshmallow.py
#  Retarget a Kimodo SOMA motion (BVH, somaskel77) onto the Shepa Jouer
#  marshmallow rig and export a game-ready GLB clip.
#
#  BEFORE this script (see README.md):
#    kimodo_gen "..." --model Kimodo-SOMA-RP-v1 --bvh --bvh_standard_tpose --output out
#    -> gives out_00.bvh (a standard BVH animation).
#
#  This script:
#    - imports the BVH (SOURCE armature) and our rig marshmallow_rigged.glb (TARGET),
#    - copies the source bone world-rotations onto the target using
#      soma_to_marshmallow.json (with a rest-pose offset), bakes, exports GLB.
#
#  RUN
#    GUI : Blender > Scripting > open this file > set CONFIG > Run.
#    CLI : blender --background --python retarget_marshmallow.py -- <input.bvh> <output.glb>
#
#  Easiest alternative if a clip looks off: the free "Rokoko" Blender add-on
#  (GUI retargeting) — most names already match so it auto-maps. See README.
# =============================================================
import bpy, json, os, sys
from mathutils import Matrix, Euler

# Extra corrective rotation (radians, XYZ, in the target bone's local frame) to push
# the marshmallow's arms forward/down — its bind pose has the arms back & high vs SOMA.
ARM_FIX = {
    "RightArm": (-0.5, 0.0, 1.0),
    "LeftArm": (-0.9, 0.0, 1.4),
}
if os.environ.get("NO_ARM_FIX"):   # raw export (no correction) for the live tuner
    ARM_FIX = {}

# ----------------------------- CONFIG ------------------------------
HERE = os.path.dirname(bpy.data.filepath) or os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
BONE_MAP_JSON = os.path.join(HERE, "soma_to_marshmallow.json")
TARGET_GLB    = os.path.join(PROJECT, "assets", "marshmallow_rigged.glb")
# CLI args after "--" override input/output:
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
INPUT_BVH  = argv[0] if len(argv) > 0 else os.path.join(HERE, "out_00.bvh")
OUTPUT_GLB = argv[1] if len(argv) > 1 else os.path.join(PROJECT, "assets", "marshmallow_kimodo.glb")
COPY_ROOT_TRANSLATION = False   # True = move with the clip; False = in-place (game moves us)
# -------------------------------------------------------------------

def log(*a): print("[retarget]", *a)
with open(BONE_MAP_JSON, "r", encoding="utf-8") as f:
    BONE_MAP = json.load(f)["map"]

# fresh scene
bpy.ops.wm.read_factory_settings(use_empty=True)

log("import BVH:", INPUT_BVH)
bpy.ops.import_anim.bvh(filepath=INPUT_BVH, global_scale=0.01, rotate_mode="NATIVE")  # cm->m
source = bpy.context.selected_objects[0]

log("import target rig:", TARGET_GLB)
bpy.ops.import_scene.gltf(filepath=TARGET_GLB)
target = next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")
# drop any animation already embedded in the rig (e.g. a static "clip0") so the
# exported GLB ends up with ONLY our retargeted motion as animations[0].
if target.animation_data:
    target.animation_data_clear()
log("source =", source.name, " target =", target.name)

# frame range from the BVH action
act = source.animation_data.action
fstart, fend = int(act.frame_range[0]), int(act.frame_range[1])
bpy.context.scene.frame_start, bpy.context.scene.frame_end = fstart, fend
log("frames", fstart, "->", fend)

pairs = [(s, t) for s, t in BONE_MAP.items()
         if s in source.data.bones and t in target.data.bones]
log("mapped bones:", len(pairs), "/", len(BONE_MAP))

# Retarget in each armature's OWN (armature-local) space, NOT world: the BVH and
# glTF imports give the two armatures different world orientations, so world-space
# copying adds a bogus ~90deg offset to the arms. We transfer each bone's pose as a
# RIGHT-multiplied rest offset in armature-local space, which preserves each rig's
# own rest pose (T-pose source -> our bind pose) and only carries the motion.
corr = {}
for s, t in pairs:
    rsa = source.data.bones[s].matrix_local.to_quaternion()   # source rest, armature-local
    rta = target.data.bones[t].matrix_local.to_quaternion()   # target rest, armature-local
    corr[t] = rsa.inverted() @ rta
    if t in ARM_FIX:
        corr[t] = corr[t] @ Euler(ARM_FIX[t], "XYZ").to_quaternion()

# process parent-first so children see posed parents
order, seen, tgt_set = [], set(), {t for _, t in pairs}
def walk(b):
    if b.name in seen: return
    seen.add(b.name)
    if b.name in tgt_set: order.append(b.name)
    for c in b.children: walk(c)
for rb in [b for b in target.data.bones if b.parent is None]:
    walk(rb)
src_of = {t: s for s, t in pairs}
root_tgt = BONE_MAP.get("Hips")

bpy.context.view_layer.objects.active = target
bpy.ops.object.mode_set(mode="POSE")
for f in range(fstart, fend + 1):
    bpy.context.scene.frame_set(f)
    for tname in order:
        spb = source.pose.bones[src_of[tname]]
        tpb = target.pose.bones[tname]
        psa = spb.matrix.to_quaternion()        # posed source, armature-local
        arm_rot = psa @ corr[tname]             # -> target armature-local pose
        loc = tpb.matrix.translation
        if COPY_ROOT_TRANSLATION and tname == root_tgt:
            loc = spb.matrix.translation
        tpb.matrix = Matrix.LocRotScale(loc, arm_rot, tpb.matrix.to_scale())
        bpy.context.view_layer.update()
        tpb.keyframe_insert("rotation_quaternion")
        if COPY_ROOT_TRANSLATION and tname == root_tgt:
            tpb.keyframe_insert("location")

bpy.ops.object.mode_set(mode="OBJECT")
# keep ONLY our baked action so the GLB has a single, correct animation[0]
keep = target.animation_data.action if target.animation_data else None
if keep:
    keep.name = "kimodo"
for a in list(bpy.data.actions):
    if a is not keep:
        try: bpy.data.actions.remove(a)
        except Exception: pass
os.makedirs(os.path.dirname(os.path.abspath(OUTPUT_GLB)), exist_ok=True)
log("baked, exporting GLB:", OUTPUT_GLB)
bpy.ops.object.select_all(action="DESELECT")
target.select_set(True)
for c in target.children_recursive: c.select_set(True)
bpy.context.view_layer.objects.active = target
bpy.ops.export_scene.gltf(filepath=OUTPUT_GLB, export_format="GLB",
                          use_selection=True, export_animations=True,
                          export_force_sampling=True)
log("done ->", OUTPUT_GLB)
