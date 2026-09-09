"""Replace the dragon normal image on the accepted mesh, without new booleans."""
import bpy,hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'artifacts/faces-v2'
ART.mkdir(parents=True,exist_ok=True)
FROZEN=ROOT/'assets/blender/frozen'
main_script=ROOT/'scripts/blender_refine_dog_dragon.py'
ns={'__file__':str(main_script),'__name__':'surface_studio_helpers'}
exec(main_script.read_text().rsplit('\nmain()',1)[0],ns)

bpy.ops.wm.open_mainfile(filepath=str(FROZEN/'dragon-round5.blend'))
new_image=bpy.data.images.load(str(FROZEN/'dragon-normal.png'),check_existing=False)
new_image.colorspace_settings.name='Non-Color';new_image.pack()
m=bpy.data.materials['runtime / authored facial skin']
tex=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
tex.image=new_image
for o in list(bpy.context.scene.objects):
    if o.type in {'LIGHT','CAMERA'}:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
glb=ROOT/'public/models/dragon.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
metrics_path=ART/'dragon-metrics.json'
metrics=json.loads(metrics_path.read_text()) if metrics_path.exists() else {'character':'dragon'}
metrics.update(glb_bytes=glb.stat().st_size,glb_sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),surface_patch_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),accepted_geometry_source='assets/blender/frozen/dragon-round5.blend')
(ART/'dragon-metrics.json').write_text(json.dumps(metrics,indent=2))
print('FROZEN GEOMETRY SURFACE PATCH',json.dumps(metrics),flush=True)
ns['studio']('dragon',.0275)
print('FROZEN DRAGON COMPLETE',flush=True)
