"""Derive compact AI/distance GLBs without changing the full-resolution sources."""
import bpy, bmesh, json, struct, hashlib, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
(ROOT/'artifacts').mkdir(parents=True,exist_ok=True)
TARGET=37000
KINDS=[s for s in sys.argv[sys.argv.index('--')+1:] if s in ('rabbit','sheep','dog','dragon')] if '--' in sys.argv else ['rabbit','sheep','dog','dragon']

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def tri_count(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def topology_hash(obj):
    result=hashlib.sha256()
    for v in obj.data.vertices:result.update(struct.pack('<3f',*v.co))
    for p in obj.data.polygons:result.update(struct.pack('<I',len(p.vertices))+struct.pack('<'+'I'*len(p.vertices),*p.vertices))
    return result.hexdigest()


def separate_integrated_collar(meshes,root):
    """Dog/dragon store their closed collar in a shared facial material group."""
    added=[]
    for obj in meshes:
        if obj.name!='body_face_matte':continue
        bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.verts.index_update();seen=set();keep=set()
        for vertex in bm.verts:
            if vertex in seen:continue
            stack=[vertex];seen.add(vertex);part=[]
            while stack:
                v=stack.pop();part.append(v)
                for edge in v.link_edges:
                    other=edge.other_vert(v)
                    if other not in seen:seen.add(other);stack.append(other)
            if max((obj.matrix_world@v.co).z for v in part)<1.50:keep.update(v.index for v in part)
        bm.free()
        if not keep:continue
        data=obj.data.copy();collar=bpy.data.objects.new('LOD preserved collar',data);bpy.context.scene.collection.objects.link(collar)
        collar.parent=root;collar.matrix_world=obj.matrix_world.copy()
        for target,remove_kept in ((obj,True),(collar,False)):
            bm=bmesh.new();bm.from_mesh(target.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
            erase=[v for v in bm.verts if (v.index in keep)==remove_kept]
            bmesh.ops.delete(bm,geom=erase,context='VERTS');bm.to_mesh(target.data);bm.free();target.data.update()
        added.append(collar)
    return meshes+added


def bake_distant_materials(meshes,root):
    """Bake material colors to vertices and strip micro-normal maps coherently.

    Each wheel keeps its three mesh children. Static head/body pieces are merged
    into a few PBR roles. No texture survives this pass, so UV-less export is safe.
    """
    roles={}
    for name,metal,rough,emission in [('soft',0,.67,None),('paint',.18,.32,None),('metal',.70,.34,None),('rubber',0,.82,None),('cyan',.1,.30,(.005,.68,.95)),('magenta',.1,.30,(1,.005,.19)),('amber',.1,.30,(1,.3,.012)),('lime',.1,.30,(.24,.82,.015))]:
        m=bpy.data.materials.new('LOD / '+name);m.use_nodes=True
        bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
        vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='LODColor'
        m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
        if emission:
            # glTF does not multiply vertex colors into emissiveFactor. Keep
            # separate emissive roles instead of silently exporting white glow.
            bs.inputs['Emission Color'].default_value=(*emission,1);bs.inputs['Emission Strength'].default_value=1.3
        roles[name]=m
    static={}
    for obj in meshes:
        data=obj.data;old_slots=list(data.materials);info=[]
        for mat in old_slots:
            bs=mat.node_tree.nodes.get('Principled BSDF') if mat and mat.use_nodes else None
            base=tuple(bs.inputs['Base Color'].default_value) if bs else tuple(mat.diffuse_color)
            attr=None
            if bs and bs.inputs['Base Color'].is_linked:
                node=bs.inputs['Base Color'].links[0].from_node
                if node.type=='VERTEX_COLOR':attr=data.color_attributes.get(node.layer_name)
                elif node.type=='ATTRIBUTE':attr=data.color_attributes.get(node.attribute_name)
            metal=bs.inputs['Metallic'].default_value if bs else 0;rough=bs.inputs['Roughness'].default_value if bs else .5
            emit=bs.inputs['Emission Strength'].default_value if bs else 0
            role='metal' if metal>.5 else 'paint' if rough<.45 else 'rubber' if rough>.76 else 'soft'
            if emit>.1:
                base=tuple(bs.inputs['Emission Color'].default_value);attr=None
                r,g,b=base[:3]
                role='magenta' if r>.4 and b>.1 and g<.2 else 'amber' if r>.6 and b<.15 else 'lime' if g>r*1.5 and g>b*1.5 else 'cyan'
            info.append((base,attr,roles[role]))
        color=data.color_attributes.new(name='LODColor',type='FLOAT_COLOR',domain='CORNER')
        used=[]
        for poly in data.polygons:
            base,old_attr,material=info[poly.material_index]
            if material not in used:used.append(material)
            for index in poly.loop_indices:
                value=old_attr.data[index if old_attr.domain=='CORNER' else data.loops[index].vertex_index].color if old_attr else base
                color.data[index].color=value
            poly.material_index=used.index(material)
        for attr in list(data.color_attributes):
            if attr.name!='LODColor':data.color_attributes.remove(attr)
        data.color_attributes.active_color=data.color_attributes.get('LODColor')
        data.materials.clear()
        for mat in used:data.materials.append(mat)
        if not obj.parent or not obj.parent.name.startswith('wheel_'):
            # Current source meshes each use one material; retain an explicit
            # fallback group if future edits add multiple materials to a mesh.
            key=tuple(m.name for m in used);static.setdefault(key,[]).append(obj)
    return meshes,static


def merge_static(static,root):
    for group in static.values():
        if len(group)==1:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:obj.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
        obj=bpy.context.object;matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_parent_inverse=root.matrix_world.inverted();obj.matrix_world=matrix
    return [o for o in root.children_recursive if o.type=='MESH']


def importance(obj):
    if obj.parent and obj.parent.name.startswith('wheel_'):return 3.0
    name=obj.name.lower()
    if name=='body_metal':return 2.5
    if name=='body_matte':return 3.0
    if name=='body_face_eye':return 3.2
    if name.startswith('body_') and not name.startswith('body_face_'):return 1.8
    if 'underlying fleece' in name:return .22
    if any(word in name for word in ('iris','sclera','visor','lens','horn','face_eye','face_glass')):return 1.8
    if any(word in name for word in ('continuous forehead','ear','face_skin')):return 1.0
    return .7


def remove_subpixel_face_details(meshes):
    removed=0
    for obj in meshes:
        if obj.name not in ('body_face_eye','body_face_matte'):continue
        bm=bmesh.new();bm.from_mesh(obj.data);seen=set();erase=[]
        for vertex in bm.verts:
            if vertex in seen:continue
            stack=[vertex];seen.add(vertex);part=[]
            while stack:
                v=stack.pop();part.append(v)
                for edge in v.link_edges:
                    other=edge.other_vert(v)
                    if other not in seen:seen.add(other);stack.append(other)
            extent=max(max(v.co[a] for v in part)-min(v.co[a] for v in part) for a in range(3))
            if extent<.027:erase.extend(part)
        removed+=len(erase);bmesh.ops.delete(bm,geom=erase,context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    return removed

rows=[]
for kind in KINDS:
    source=ROOT/'assets/blender'/(kind+'.blend')
    full=ROOT/'public/models'/(kind+'.glb')
    original_hashes={'blend':sha(source),'glb':sha(full)}
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root=bpy.data.objects['kart_'+kind]
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    meshes=separate_integrated_collar(meshes,root)
    before=sum(tri_count(o) for o in meshes)
    # Only the facial sculpt is simplified. Vehicle, tires and clothing retain
    # their complete near-model topology, independently hashed below.
    for obj in meshes:
        if obj.name=='body_face_skin':
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0002)
            bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
            bm.to_mesh(obj.data);bm.free();obj.data.update()
    removed_details=remove_subpixel_face_details(meshes)
    fixed={o for o in meshes if o.name.startswith(('wheel_','Suit /','LOD preserved collar')) or (o.name.startswith('body_') and not o.name.startswith('body_face_')) or any(m.use_nodes and m.node_tree.nodes.get('Principled BSDF') and m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value>.1 for m in o.data.materials)}
    protected={o:topology_hash(o) for o in fixed}
    fixed_tris=sum(tri_count(o) for o in fixed)
    weights={o:importance(o) for o in meshes}
    weighted=sum(tri_count(o)*weights[o] for o in meshes if o not in fixed)
    target=TARGET
    meshes,static=bake_distant_materials(meshes,root);bpy.context.view_layer.update()
    projected=0;max_projection=0
    for o in meshes:
        if o in fixed:continue
        # QEM can overshoot the ends of the source's thin metal struts. Project
        # back to the original surface rather than clamping world-space bounds.
        surface=BVHTree.FromPolygons([v.co.copy() for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons])
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Distant AI silhouette reduction','DECIMATE')
        mod.ratio=min(1,(target-fixed_tris)*weights[o]/weighted);mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if o.name!='body_face_eye':
            # Eyes contain intentionally close iris/sclera layers. A nearest
            # surface query across that group can snap the iris onto the sclera.
            for vertex in o.data.vertices:
                nearest,normal,index,distance=surface.find_nearest(vertex.co)
                if nearest is not None and distance>.00001:
                    vertex.co=nearest;projected+=1;max_projection=max(max_projection,distance)
        o.data.update()
    assert all(topology_hash(obj)==digest for obj,digest in protected.items()),'Protected vehicle geometry changed'
    protected_names=sorted(obj.name for obj in protected)
    meshes=merge_static(static,root);bpy.context.view_layer.update()
    root['detailLevel']='distant';root['fullResolutionModel']=kind+'.glb'
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    path=ROOT/'public/models'/(kind+'-lod.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_attributes=False)
    raw=path.read_bytes()
    magic,version,size=struct.unpack_from('<III',raw)
    assert magic==0x46546c67 and version==2 and size==len(raw)
    jsize,jtype=struct.unpack_from('<II',raw,12)
    assert jtype==0x4e4f534a
    gltf=json.loads(raw[20:20+jsize])
    triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
    draw_calls=sum(len(m['primitives']) for m in gltf['meshes'])
    wheel_names={'wheel_fl','wheel_fr','wheel_rl','wheel_rr'}
    wheel_nodes=[n for n in gltf['nodes'] if n.get('name') in wheel_names]
    assert {n['name'] for n in wheel_nodes}==wheel_names
    assert all(len(n.get('children',[]))==3 for n in wheel_nodes)
    assert 25000<=triangles<=45000 and draw_calls<=24 and len(raw)<1_600_000,(kind,triangles,draw_calls,len(raw))
    assert not gltf.get('images') and not gltf.get('animations')
    assert not gltf.get('textures')
    assert all(not n.get('name','').startswith(('Preview /','Studio |')) for n in gltf['nodes'])
    source_unchanged=original_hashes=={'blend':sha(source),'glb':sha(full)}
    assert source_unchanged
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    coords=[o.matrix_world@Vector(v) for o in bpy.context.scene.objects if o.type=='MESH' for v in o.bound_box]
    lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)]
    print('LOD BOUNDS',kind,lo,hi,flush=True)
    assert abs(lo[2])<.0001 and 2.0<hi[0]-lo[0]<2.5 and 3.2<hi[1]-lo[1]<4.1
    for name in wheel_names:
        axis=(bpy.data.objects[name].matrix_world.to_3x3()@Vector((1,0,0))).normalized();assert abs(axis.x)>.9999
    row=dict(character=kind,model=kind+'-lod.glb',valid_glb=True,reimport_verified=True,triangles=triangles,draw_calls=draw_calls,materials=len(gltf['materials']),bytes=len(raw),full_triangles=before,reduction_percent=round((1-triangles/before)*100,2),wheel_pivots={n['name']:n['translation'] for n in wheel_nodes},source_unchanged=source_unchanged,source_sha256=original_hashes,sha256=sha(path),forward='+Z',up='+Y',ground_y=round(lo[2],5),textures_removed=True,protected_topology_unchanged=True,protected_triangles=fixed_tris,protected_meshes=protected_names,subpixel_vertices_removed=removed_details,surface_projection=dict(vertices=projected,max_distance=round(max_projection,5)))
    rows.append(row)
    print('LOD VERIFIED',json.dumps(row),flush=True)

report=ROOT/'artifacts/blender-lod-validation.json'
if len(KINDS)<4 and report.exists():rows=[r for r in json.loads(report.read_text()) if r['character'] not in KINDS]+rows
report.write_text(json.dumps(rows,indent=2))
validation_path=ROOT/'artifacts/blender-assets-validation.json'
validation=json.loads(validation_path.read_text())
for full_row in validation:
    lod=next(row for row in rows if row['character']==full_row['character'])
    full_row['lod']={k:v for k,v in lod.items() if k not in ('character','source_sha256','full_triangles')}
validation_path.write_text(json.dumps(validation,indent=2))
print('ALL LODS COMPLETE',flush=True)
