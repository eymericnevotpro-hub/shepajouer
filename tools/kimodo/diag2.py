import bpy
from mathutils import Vector
ROOT = "/mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ROOT + "/assets/marshmallow_wave.glb")
tgt = [o for o in bpy.context.selected_objects if o.type == "ARMATURE"][0]

def headw(b, f=None):
    if f is not None:
        bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
    return tgt.matrix_world @ tgt.pose.bones[b].head

# body frame: up = hips->head, forward from foot->toe (projected), side = up x forward
def frame(f):
    bpy.context.scene.frame_set(f); bpy.context.view_layer.update()
    hips = headw("Hips"); head = headw("Head")
    up = (head - hips).normalized()
    fwd0 = (headw("LeftToeBase") - headw("LeftFoot"))
    fwd = (fwd0 - up * fwd0.dot(up)).normalized()
    side = up.cross(fwd)
    return hips, up, fwd, side

for hand in ["RightHand", "LeftHand"]:
    print(f"=== {hand} relative to Hips (fwd+ = devant, up+ = haut) ===")
    for f in [1, 45, 90]:
        hips, up, fwd, side = frame(f)
        h = headw(hand, f) - hips
        print(f"f{f:>3}  fwd {h.dot(fwd):+.2f}   up {h.dot(up):+.2f}   side {h.dot(side):+.2f}")
print("DIAG2_DONE")
