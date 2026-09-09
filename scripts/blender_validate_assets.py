"""Independent GLB, texture/UV, wheel-axis and Blender reimport validation.

Add -- --include-lods to verify distant GLBs and their source hashes as well.
Character IDs after -- limit the validation scope.
"""
import bpy, json, struct, hashlib, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts').mkdir(parents=True,exist_ok=True)
WHEELS={'wheel_fl','wheel_fr','wheel_rl','wheel_rr'}
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
kinds=[s for s in args if s in ('rabbit','sheep','dog','dragon')] or ['rabbit','sheep','dog','dragon']

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def validate(kind,lod=False):
    path=ROOT/'public/models'/(kind+('-lod' if lod else '')+'.glb')
    raw=path.read_bytes();magic,version,length=struct.unpack_from('<III',raw)
    assert magic==0x46546C67 and version==2 and length==len(raw),path
    size,chunk_type=struct.unpack_from('<II',raw,12)
    assert chunk_type==0x4E4F534A
    doc=json.loads(raw[20:20+size])
    bin_size,bin_type=struct.unpack_from('<II',raw,20+size)
    assert bin_type==0x004E4942 and 28+size+bin_size==len(raw)
    assert len(doc['buffers'])==1 and doc['buffers'][0]['byteLength']<=bin_size
    assert not doc['buffers'][0].get('uri') and not doc.get('animations')
    for view in doc.get('bufferViews',[]):
        assert view['buffer']==0 and view.get('byteOffset',0)+view['byteLength']<=bin_size
    for image in doc.get('images',[]):
        assert image.get('mimeType') in ('image/png','image/jpeg') and 'bufferView' in image and not image.get('uri')
    tris=0;draws=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            draws+=1;assert primitive.get('mode',4)==4
            index=doc['accessors'][primitive['indices']];assert index['count']%3==0
            tris+=index['count']//3
            attrs=primitive['attributes'];assert 'POSITION' in attrs and 'NORMAL' in attrs
            pos=doc['accessors'][attrs['POSITION']]
            assert pos['count']>0 and all(x==x for x in pos['min']+pos['max'])
            mat=doc['materials'][primitive['material']]
            textures=[mat[k] for k in ('normalTexture','occlusionTexture','emissiveTexture') if k in mat]
            pbr=mat.get('pbrMetallicRoughness',{})
            textures += [pbr[k] for k in ('baseColorTexture','metallicRoughnessTexture') if k in pbr]
            for texture in textures:
                uv='TEXCOORD_'+str(texture.get('texCoord',0));assert uv in attrs,(path,mat['name'],'missing UV')
                assert doc['accessors'][attrs[uv]]['count']==pos['count']
                tex=doc['textures'][texture['index']];assert 0<=tex['source']<len(doc['images'])
    if lod:
        assert 25000<=tris<=45000 and draws<=24 and len(raw)<1_600_000,(kind,tris,draws,len(raw))
        assert not doc.get('images') and not doc.get('textures')
    else:
        assert tris<=110000 and draws<=40 and len(raw)<4_000_000,(kind,tris,draws,len(raw))
    wheels=[n for n in doc['nodes'] if n.get('name') in WHEELS]
    assert {n['name'] for n in wheels}==WHEELS and len(wheels)==4
    assert all(len(n.get('children',[]))==3 for n in wheels)
    assert all(not n.get('name','').startswith(('Preview /','Studio |','Review ')) for n in doc['nodes'])
    assert any(n.get('name')=='kart_'+kind for n in doc['nodes'])
    for n in wheels:
        p=n['translation'];assert .24<p[1]<.5
        assert (p[2]>0) if n['name'].startswith('wheel_f') else (p[2]<0)
        assert all(abs(a-b)<1e-5 for a,b in zip(n.get('scale',[1,1,1]),[1,1,1]))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    coords=[o.matrix_world@Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box]
    lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)]
    # Blender importer restores native Z up, -Y forward.
    size=[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]
    assert abs(lo[2])<.0001
    assert 2.0<size[0]<2.5 and 3.2<size[2]<4.1 and 1.8<size[1]<3.6,size
    axes={}
    for name in sorted(WHEELS):
        obj=bpy.data.objects[name];axis=(obj.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
        assert abs(axis.x)>.9999,(name,tuple(axis))
        axes[name]=[round(v,6) for v in axis]
    row=dict(character=kind,valid_glb=True,reimport_verified=True,triangles=tris,draw_calls=draws,materials=len(doc['materials']),embedded_images=len(doc.get('images',[])),texture_uv_verified=True,bytes=len(raw),size_gltf_xyz=[round(x,4) for x in size],wheel_pivots={n['name']:n['translation'] for n in wheels},wheel_local_x_in_blender_world=axes,sha256=sha(path),thumbnail=(ROOT/'public/models'/(kind+'.png')).exists(),editable_source=(ROOT/'assets/blender'/(kind+'.blend')).exists())
    assert row['thumbnail'] and row['editable_source']
    print('VERIFIED',json.dumps(row),flush=True)
    return row

rows=[]
lod_report={r['character']:r for r in json.loads((ROOT/'artifacts/blender-lod-validation.json').read_text())} if '--include-lods' in args else {}
for kind in kinds:
    row=validate(kind)
    if '--include-lods' in args:
        source=lod_report[kind]['source_sha256']
        assert source=={'blend':sha(ROOT/'assets/blender'/(kind+'.blend')),'glb':row['sha256']},'LOD source is stale: '+kind
        row['lod']=validate(kind,True)
    rows.append(row)
out=ROOT/'artifacts/blender-assets-validation.json'
if len(kinds)<4 and out.exists():
    previous=json.loads(out.read_text());rows=[r for r in previous if r['character'] not in kinds]+rows
out.write_text(json.dumps(rows,indent=2))
