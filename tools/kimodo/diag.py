import bpy, math
from mathutils import Vector
ROOT = "/mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_anim.bvh(filepath=ROOT + "/tools/kimodo/out/wave.bvh", global_scale=0.01, rotate_mode="NATIVE")
src = [o for o in bpy.context.selected_objects if o.type == "ARMATURE"][0]
bpy.ops.import_scene.gltf(filepath=ROOT + "/assets/marshmallow_wave.glb")
tgt = [o for o in bpy.context.selected_objects if o.type == "ARMATURE"][0]

def vec(arm, bone, f):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    return (arm.matrix_world @ pb.tail) - (arm.matrix_world @ pb.head)

def updown(arm, f):  # body 'down' direction = hips -> ground
    bpy.context.scene.frame_set(f)
    h = (arm.matrix_world @ arm.pose.bones["Head"].head)
    hip = (arm.matrix_world @ arm.pose.bones["Hips"].head)
    return (hip - h).normalized()  # points down

# RightArm elevation = angle vs body-down (0 = arm hanging down, 90 = horizontal, 180 = straight up)
print("=== RightArm elevation (deg): 0=down 90=out 180=up ===")
for f in [1, 23, 45, 68, 90]:
    es = math.degrees(vec(src, "RightArm", f).angle(updown(src, f)))
    et = math.degrees(vec(tgt, "RightArm", f).angle(updown(tgt, f)))
    print(f"f{f:>3}  SRC {es:6.1f}   TGT {et:6.1f}")
print("=== RightForeArm elevation ===")
for f in [1, 45, 90]:
    es = math.degrees(vec(src, "RightForeArm", f).angle(updown(src, f)))
    et = math.degrees(vec(tgt, "RightForeArm", f).angle(updown(tgt, f)))
    print(f"f{f:>3}  SRC {es:6.1f}   TGT {et:6.1f}")
print("DIAG_DONE")
