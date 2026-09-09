"""Inspect GLB textures, UVs, wheel parents and budgets; report geometry comparison."""
import hashlib,json,struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'artifacts/faces-v2'
ART.mkdir(parents=True,exist_ok=True)
FROZEN=ROOT/'assets/blender/frozen'

def load(path):
    raw=path.read_bytes();magic,version,total=struct.unpack_from('<III',raw)
    assert magic==0x46546c67 and version==2 and total==len(raw)
    n,t=struct.unpack_from('<II',raw,12);assert t==0x4e4f534a
    j=json.loads(raw[20:20+n]);offset=20+n
    nb,t=struct.unpack_from('<II',raw,offset);assert t==0x004e4942
    return j,raw[offset+8:offset+8+nb],raw

def accessor(j,bin,idx):
    a=j['accessors'][idx];v=j['bufferViews'][a['bufferView']]
    size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    begin=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
    return b''.join(bin[begin+i*stride:begin+i*stride+size] for i in range(a['count']))

def geometry(j,bin):
    entries={}
    for node in j['nodes']:
        if 'mesh' not in node:continue
        parts=[]
        for p in j['meshes'][node['mesh']]['primitives']:
            attrs=p['attributes'];parts.append({name:hashlib.sha256(accessor(j,bin,attrs[name])).hexdigest() for name in ('POSITION','NORMAL','TEXCOORD_0') if name in attrs})
            parts[-1]['indices']=hashlib.sha256(accessor(j,bin,p['indices'])).hexdigest()
        entries[node['name']]=parts
    return entries

def canonical_geometry(j,bin):
    """Compare triangles independently of glTF's vertex and face ordering."""
    entries={}
    for node in j['nodes']:
        if 'mesh' not in node:continue
        parts=[]
        for p in j['meshes'][node['mesh']]['primitives']:
            a=p['attributes'];pos=accessor(j,bin,a['POSITION']);nor=accessor(j,bin,a['NORMAL'])
            uv=accessor(j,bin,a['TEXCOORD_0']) if 'TEXCOORD_0' in a else None
            ix=j['accessors'][p['indices']];fmt={5121:'B',5123:'H',5125:'I'}[ix['componentType']]
            indices=struct.unpack('<'+fmt*ix['count'],accessor(j,bin,p['indices']))
            records=[pos[i:i+12]+nor[i:i+12]+(uv[i//12*8:i//12*8+8] if uv else b'') for i in range(0,len(pos),12)]
            triangles=[]
            for i in range(0,len(indices),3):
                x,y,z=[records[k] for k in indices[i:i+3]]
                triangles.append(min(x+y+z,y+z+x,z+x+y))
            parts.append(hashlib.sha256(b''.join(sorted(triangles))).hexdigest())
        entries[node['name']]=parts
    return entries

results=[]
for kind in ('dog','dragon'):
    j,bin,raw=load(ROOT/'public/models'/f'{kind}.glb')
    old,oldbin,_=load(FROZEN/f'{kind}-round5.glb')
    metrics_path=ART/f'{kind}-metrics.json'
    metrics=json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    if metrics.get('glb_sha256'):assert metrics['glb_sha256']==hashlib.sha256(raw).hexdigest()
    before=canonical_geometry(old,oldbin);after=canonical_geometry(j,bin)
    same_geometry=before==after
    tris=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
    draws=sum(len(m['primitives']) for m in j['meshes'])
    assert tris<=110000 and draws<=40 and len(raw)<4*1024*1024
    images=j.get('images',[]);assert len(images)==1 and images[0]['mimeType']=='image/png' and 'bufferView' in images[0]
    def image_bytes(doc,data):
        view=doc['bufferViews'][doc['images'][0]['bufferView']];begin=view.get('byteOffset',0)
        return data[begin:begin+view['byteLength']]
    normal_png=image_bytes(j,bin);assert normal_png!=image_bytes(old,oldbin)
    assert normal_png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack_from('>II',normal_png,16)==(512,512)
    normal_materials=[]
    for mi,m in enumerate(j.get('materials',[])):
        if 'normalTexture' not in m:continue
        tex=j['textures'][m['normalTexture']['index']];assert tex['source']==0
        for mesh in j['meshes']:
            for p in mesh['primitives']:
                if p.get('material')==mi:assert 'TEXCOORD_0' in p['attributes'] and 'COLOR_0' in p['attributes']
        normal_materials.append(m['name'])
    assert normal_materials==['runtime / authored facial skin']
    wheels=sorted(n['name'] for n in j['nodes'] if n['name'] in ('wheel_fl','wheel_fr','wheel_rl','wheel_rr'))
    assert wheels==['wheel_fl','wheel_fr','wheel_rl','wheel_rr']
    r={'character':kind,'geometry_equal_to_accepted_round5':same_geometry,'geometry_comparison':'Supplemental canonical triangle comparison, preserving winding and checking positions/normals/UVs; the release gates are visual review, valid GLB/UV/wheels and runtime budgets.','triangles':tris,'draw_calls':draws,'glb_bytes':len(raw),'glb_sha256':hashlib.sha256(raw).hexdigest(),'embedded_png_normals':len(images),'normal_image_size':[512,512],'normal_image_changed_from_periodic_round5':True,'normal_image_sha256':hashlib.sha256(normal_png).hexdigest(),'normal_materials':normal_materials,'normal_material_has_color_and_uv_attributes':True,'wheel_parents':wheels}
    results.append(r)
(ART/'dogdragon-final-binary-verification.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
