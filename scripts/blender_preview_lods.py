"""Render actual imported distant GLBs in their near-source studio, read-only."""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts/face-review').mkdir(parents=True,exist_ok=True)
kinds=[s for s in sys.argv[sys.argv.index('--')+1:] if s in ('rabbit','sheep','dog','dragon')] if '--' in sys.argv else ['rabbit','sheep','dog','dragon']
for kind in kinds:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender'/(kind+'.blend')))
    root=bpy.data.objects['kart_'+kind]
    for obj in list(root.children_recursive)+[root]:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/(kind+'-lod.glb')))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.threads_mode='FIXED';scene.render.threads=6;scene.render.film_transparent=True
    scene.render.filepath=str(ROOT/'artifacts/face-review'/(kind+'-lod.png'))
    bpy.ops.render.render(write_still=True)
print('ACTUAL GLB LOD PREVIEWS READY',flush=True)
