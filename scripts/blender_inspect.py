import bpy, json
from mathutils import Vector
from pathlib import Path

rows=[]
for o in bpy.context.scene.objects:
    if o.type not in {'MESH','CURVE'}: continue
    cs=[c.name for c in o.users_collection]
    vs=[o.matrix_world@Vector(p) for p in o.bound_box]
    bounds=[[round(min(v[i] for v in vs),4) for i in range(3)],[round(max(v[i] for v in vs),4) for i in range(3)]]
    rows.append(dict(name=o.name,type=o.type,collections=cs,bounds=bounds,materials=[m.name if m else None for m in o.data.materials],vertices=len(o.data.vertices) if o.type=='MESH' else 0,polys=len(o.data.polygons) if o.type=='MESH' else 0,modifiers=[dict(type=m.type,**({'levels':m.levels} if m.type=='SUBSURF' else {})) for m in o.modifiers]))
p=Path(__file__).resolve().parents[1]/'artifacts'/'blender-source-inspection.json'
p.parent.mkdir(parents=True,exist_ok=True)
p.write_text(json.dumps(rows,indent=2))
print('INSPECTION',len(rows),str(p),flush=True)
for c in bpy.data.collections:
    print('COLLECTION',c.name,len(c.objects),flush=True)
for r in rows:
    if 'wheel' in r['name'].lower() or 'ear' in r['name'].lower() or 'head' in r['name'].lower(): print(json.dumps(r),flush=True)
