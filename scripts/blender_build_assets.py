"""Offline Blender asset build. Run with blender --background --python this_file.

Loads an isolated copy of the supplied editable white rabbit kart, adapts the
four characters to their supplied references, and exports browser-ready GLBs.
No paid API, network access, or interaction with an open Blender window.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/blender/source-reference.blend'
OUT = ROOT / 'public/models'
ART = ROOT / 'artifacts'
OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
if not SOURCE.exists():raise FileNotFoundError('Required tracked source is missing: assets/blender/source-reference.blend')
KINDS = [x for x in sys.argv[sys.argv.index('--')+1:] if x in ('rabbit','sheep','dog','dragon')] if '--' in sys.argv else ['rabbit','sheep','dog','dragon']

def material(name, color, metal=0., rough=.45, emission=0.):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color[:3],1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color[:3],1); p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color[:3],1)
    return m

def mesh(name, verts, faces, mat):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    o['authored_variant']=True
    return o

def ell(name, pos, scale, mat, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);o['authored_variant']=True
    for p in o.data.polygons:p.use_smooth=True
    return o

def tapered(name, points, radii, mat, sides=10):
    vv=[];ff=[]
    ps=[Vector(p) for p in points]
    for i,p in enumerate(ps):
        d=(ps[min(i+1,len(ps)-1)]-ps[max(0,i-1)]).normalized()
        u=d.cross(Vector((0,1,0)))
        if u.length<.01:u=d.cross(Vector((1,0,0)))
        u.normalize(); v=d.cross(u).normalized()
        for j in range(sides):vv.append(p+radii[i]*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides)))
        if i:
            for j in range(sides):ff.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    ff.extend([tuple(reversed(range(sides))),tuple((len(ps)-1)*sides+j for j in range(sides))])
    return mesh(name,vv,ff,mat)

def ear(name, base, tip, width, mat, inner):
    b=Vector(base);t=Vector(tip);d=(t-b).normalized();side=Vector((d.z,0,-d.x)).normalized()
    vv=[];ff=[];rows=13;sides=10
    for i in range(rows):
        f=i/(rows-1);c=b.lerp(t,f);c.y-=.14*math.sin(math.pi*f)
        w=.025+width*math.sin(math.pi*f)**.65
        for j in range(sides):
            a=j*math.tau/sides;vv.append(c+side*w*math.cos(a)+Vector((0,.065*math.sin(a),0)))
        if i:
            for j in range(sides):ff.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    ff.extend([tuple(reversed(range(sides))),tuple((rows-1)*sides+j for j in range(sides))])
    mesh(name,vv,ff,mat)
    # Separate broad inset ribbon makes the inside visible at gameplay scale.
    vv=[];ff=[]
    for i in range(11):
        f=.10+i*.075;c=b.lerp(t,f);c.y-=.075+.14*math.sin(math.pi*f)
        w=width*.68*math.sin(math.pi*f)**.65
        vv.extend([c-side*w,c+side*w])
        if i:ff.append(((i-1)*2,(i-1)*2+1,i*2+1,i*2))
    o=mesh(name+' inner',vv,ff,inner)
    so=o.modifiers.new('Inner ear thickness','SOLIDIFY');so.thickness=.012

def remove(o):bpy.data.objects.remove(o,do_unlink=True)

def adapt_character(kind):
    if kind=='rabbit':return
    # Preserve the detailed fitted racing suit, hands, expression, and goggles.
    for o in list(bpy.context.scene.objects):
        if any(s in o.name.lower() for s in ('swept ear','upright ear','cotton tail','silken cheek whisker','fine ivory fur','swept sculpted cheek lock','small front tooth')):remove(o)
    if kind=='sheep':
        wool=material('Variant / cream wool',(.91,.77,.60),rough=.7)
        horn=material('Variant / gold ram horn',(.46,.20,.052),.56,.28)
        pink=material('Variant / inner sheep ear',(.57,.25,.22),rough=.6)
        for s in (-1,1):
            ear('Sheep / pendulous ear',(s*.64,.20,3.53),(s*1.14,-.04,3.22),.23,wool,pink)
            ps=[];rs=[]
            for i in range(38):
                t=i/37;a=.5+t*math.pi*1.85;r=.52*(1-.70*t)
                ps.append((s*(.94+r*math.cos(a)),-.12+.06*math.sin(t*math.pi),3.88+r*math.sin(a)))
                rs.append((.155*(1-.80*t)+.009)*(1+.055*math.sin(i*1.6)))
            tapered('Sheep / sculpted spiral horn',ps,rs,horn,12)
        # Large overlapping curls, deliberately readable from a chase camera.
        for row,(z,r,n) in enumerate(((4.02,.60,12),(4.18,.46,10),(4.28,.24,7),(3.45,.70,12),(3.11,.54,9))):
            for i in range(n):
                a=i*math.tau/n
                # Keep the central face open; frame it with curls.
                if row>=3 and math.sin(a)<-.28:continue
                ell('Sheep / sculpted wool curl',(r*math.cos(a),.16+r*.7*math.sin(a),z),(.17,.14,.16),wool,12,8)
    elif kind=='dog':
        fur=material('Variant / caramel dog fur',(.55,.22,.06),rough=.69)
        inner=material('Variant / russet ear',(.28,.075,.025),rough=.66)
        cream=material('Variant / dog cream muzzle',(.86,.68,.42),rough=.6)
        black=material('Variant / wet dog nose',(.024,.012,.007),rough=.28)
        tongue=material('Variant / cheerful tongue',(.76,.18,.25),rough=.42)
        for s in (-1,1):
            ear('Dog / long floppy spaniel ear',(s*.56,.14,3.86),(s*1.05,-.05,2.95),.33,fur,inner)
            ell('Dog / cream snout pad',(s*.20,-.60,2.99),(.24,.16,.18),cream)
        for o in list(bpy.context.scene.objects):
            if 'Soft triangular rose nose' in o.name or 'Nose soft highlight' in o.name:remove(o)
        ell('Dog / broad black nose',(0,-.76,3.10),(.145,.11,.105),black)
        ell('Dog / visible happy tongue',(0,-.62,2.73),(.095,.08,.125),tongue)
        tapered('Dog / curled tail',[(0,.92,1.7),(.20,1.45,1.7),(.45,1.6,2.05),(.56,1.43,2.26)],[.19,.16,.10,.015],fur)
        # A compact antenna gives this scout kart a different rear silhouette.
        tapered('Dog / scout antenna',[(.70,1.52,1.62),(.70,1.52,2.08),(.70,1.52,2.39)],[.025,.025,.012],black)
        ell('Dog / antenna signal',(.70,1.52,2.40),(.09,.09,.09),material('Variant / lime beacon',(.40,.95,.015),.2,.25,1.4),12,8)
    else:
        scale=material('Variant / teal dragon scales',(.038,.29,.27),.08,.48)
        cream=material('Variant / warm dragon muzzle',(.53,.64,.43),rough=.58)
        horn=material('Variant / dragon horn',(.14,.11,.095),.45,.31)
        gold=material('Variant / amber membrane',(.78,.34,.045),.1,.44)
        amber=material('Variant / amber signal',(1,.23,.012),.25,.25,1.6)
        for o in list(bpy.context.scene.objects):
            if 'Goggle' in o.name or 'Lens reflected' in o.name or 'Nose soft highlight' in o.name or 'Soft triangular rose nose' in o.name:remove(o)
        for s in (-1,1):
            tapered('Dragon / swept horn',[(s*.48,.15,3.88),(s*.59,.22,4.10),(s*.57,.36,4.35),(s*.42,.48,4.56)],[.145,.12,.085,.009],horn,12)
            tapered('Dragon / horn amber ring',[(s*.585,.25,4.16),(s*.58,.28,4.20)],[.113,.105],amber,12)
            # Frilled fin with a scalloped membrane and explicit support ribs.
            center=(s*.61,.25,3.51)
            tips=[(s*1.18,.40,4.06),(s*1.00,.12,3.69),(s*1.25,.16,3.59),(s*.94,.05,3.34),(s*1.07,.18,3.13),(s*.68,.09,3.18)]
            verts=[center]+tips
            o=mesh('Dragon / ear fin amber membrane',verts,[(0,i,i+1) for i in range(1,len(verts)-1)],gold)
            so=o.modifiers.new('Fin thickness','SOLIDIFY');so.thickness=.025
            for j in (0,2,4):tapered('Dragon / fin support',[center,tips[j]],[.10,.013],scale,8)
            ell('Dragon / brow scale',(s*.39,-.16,3.67),(.30,.12,.095),scale,16,10)
            ell('Dragon / nostril',(s*.16,-.795,3.10),(.035,.026,.038),horn,12,8)
        ell('Dragon / broad scaled muzzle',(0,-.52,3.08),(.42,.28,.24),scale,24,14)
        ell('Dragon / cream lower muzzle',(0,-.49,2.89),(.37,.22,.17),cream,20,12)
        tapered('Dragon / curved smile',[(-.27,-.665,2.93),(-.15,-.712,2.86),(0,-.72,2.85),(.15,-.712,2.86),(.27,-.665,2.93)],[.006,.010,.012,.010,.006],horn,6)
        # Long lifted tail is visible from the rear; no body-plane animation needed.
        tail=[(0,.83,1.48),(-.2,1.25,1.76),(-.36,1.52,2.28),(-.54,1.77,2.78),(-.85,1.82,3.02),(-1.22,1.72,3.12)]
        tapered('Dragon / curling long tail',tail,[.28,.26,.21,.17,.105,.009],scale,12)
        for i,p in enumerate(tail[1:-1]):
            q=(p[0],p[1]-.015,p[2]+.28)
            tapered('Dragon / tail amber dorsal spine',[p,q],[.095,.003],gold,8)
        for i,(y,z) in enumerate(((.22,4.00),(.43,3.97),(.61,3.80),(.71,3.54),(.67,3.29))):
            tapered('Dragon / head crest',[(0,y,z),(0,y+.14,z+.32)],[.135,.007],scale,8)

def source_color(o, kind):
    m=o.data.materials[0] if o.data.materials else None
    n=m.name.lower() if m else ''; name=o.name.lower()
    p=m.node_tree.nodes.get('Principled BSDF') if m and m.use_nodes else None
    color=list(p.inputs['Base Color'].default_value) if p else [.2,.2,.2,1]
    metallic=p.inputs['Metallic'].default_value if p else 0
    emit=p.inputs['Emission Strength'].default_value if p else 0
    if 'aqua-tipped' in n:color=[.83,.87,.91,1]
    if kind=='sheep':
        if any(s in n for s in ('brushed titanium','porcelain alloy','satin titanium')):color=[.66,.36,.07,1]
        if any(s in n for s in ('harness','raspberry')):color=[.75,.39,.03,1]
        if 'polarized' in n:color=[.83,.41,.01,1]
        if 'violet iris' in n:color=[.36,.12,.009,1]
        if any(s in n for s in ('ivory','warm muzzle')):color=[.91,.79,.65,1]
    elif kind=='dog':
        if any(s in n for s in ('porcelain alloy','harness','raspberry')):color=[.38,.72,.018,1]
        if 'polarized' in n:color=[.45,.8,.018,1]
        if 'ivory' in n:color=[.59,.26,.075,1]
        if 'warm muzzle' in n or 'lower jaw' in name:color=[.88,.72,.46,1]
        if 'violet iris' in n:color=[.23,.065,.008,1]
        if 'eyelashes' in n:color=[.10,.036,.014,1]
    elif kind=='dragon':
        if any(s in n for s in ('ivory','warm muzzle')):color=[.04,.33,.31,1]
        if 'lower jaw' in name:color=[.52,.63,.40,1]
        if 'violet iris' in n:color=[.74,.22,.017,1]
        if any(s in n for s in ('harness','raspberry')):color=[.34,.15,.045,1]
        if 'porcelain alloy' in n:color=[.20,.25,.26,1]
    # Wheels use one signal role to retain only three draw calls per wheel.
    if 'wheel' in name and (emit>.3 or any(s in n for s in ('cyan','magenta','pink'))):return 'signal', [1,1,1,1]
    if emit>.3 or any(s in n for s in ('ion cyan','electric cyan','polarized','luminous inlay','amber signal','lime beacon')):
        return ('accent' if ('magenta' in n or 'pink' in n) and kind!='dragon' else 'signal'),[1,1,1,1]
    if any(s in n for s in ('fur','muzzle','sclera','wool','ear interior','sheep ear','dog cream','dragon scales','membrane')):return 'skin',color
    return ('metal' if metallic>.43 else 'matte'),color

def cleanup(kind):
    deleted=0
    for o in list(bpy.context.scene.objects):
        if o.type not in {'MESH','CURVE'} or o.name.startswith('Studio |') or any('Studio' in c.name for c in o.users_collection):
            remove(o);continue
        if any(s in o.name.lower() for s in ('rotor port','whisker follicle','iris tonal fibers','fine silhouette fur','fine ivory fur','lug recess','rim bolt','fastener','harness edge stitching','rotor machining','sleeve cuff rib')):
            remove(o);deleted+=1;continue
        mw=o.matrix_world.copy();o.parent=None;o.matrix_world=mw
        if o.type=='CURVE':
            o.data.resolution_u=2;o.data.render_resolution_u=2;o.data.bevel_resolution=0
        for mod in o.modifiers:
            if mod.type=='SUBSURF':mod.levels=min(mod.levels,1);mod.render_levels=mod.levels
            if mod.type=='BEVEL':mod.segments=1
    adapt_character(kind)
    bpy.context.view_layer.update()
    print('CLEAN',kind,deleted,len(bpy.context.scene.objects),flush=True)

def triangulate_count(o):
    o.data.calc_loop_triangles();return len(o.data.loop_triangles)

def build_runtime(kind):
    cleanup(kind)
    roles={
        'matte':material('runtime / matte vertex colors',(1,1,1),.05,.42),
        'metal':material('runtime / alloy vertex colors',(1,1,1),.65,.29),
        'skin':material('runtime / skin vertex colors',(1,1,1),0,.63),
        'signal':material('runtime / cyan signal' if kind!='dragon' else 'runtime / amber signal',(1,1,1),.25,.23,0),
        'accent':material('runtime / magenta signal',(1,1,1),.15,.25,0),
    }
    sig=(1,.22,.012,1) if kind=='dragon' else ((.7,.33,.025,1) if kind=='sheep' else ((.32,.85,.005,1) if kind=='dog' else (.005,.68,.95,1)))
    # Preserve cyan kart energy identity for the sheep and dog; body panels carry their gold/lime colors.
    if kind in ('sheep','dog'):sig=(.005,.68,.95,1)
    for role,col in [('signal',sig),('accent',(1,.005,.19,1))]:
        p=roles[role].node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=col;p.inputs['Emission Color'].default_value=col;p.inputs['Emission Strength'].default_value=1.6
    for role in ('matte','metal','skin'):
        nt=roles[role].node_tree;n=nt.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';nt.links.new(n.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color'])
    groups={}; original_tris=0
    for o in list(bpy.context.scene.objects):
        role,col=source_color(o,kind)
        wheel=''
        if o.name.startswith('Wheel '):
            wheel='wheel_'+('f' if 'Front' in o.name else 'r')+('l' if ' L ' in o.name else 'r')
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH')
        n=triangulate_count(o);original_tris+=n
        # Retain contours and facial geometry; remove invisible high-frequency detail.
        goal=2000 if 'continuous curved-groove tire' in o.name else (1500 if 'Sculpted rabbit head' in o.name else (850 if 'sculpted outer ear' in o.name else (520 if o.get('authored_variant') else 350)))
        if n>goal:
            mod=o.modifiers.new('Mobile silhouette reduction','DECIMATE');mod.ratio=goal/n;mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        me=o.data
        me.materials.clear();me.materials.append(roles[role])
        for old in list(me.color_attributes):me.color_attributes.remove(old)
        ca=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for item in ca.data:item.color=col
        for uv in list(me.uv_layers):me.uv_layers.remove(uv)
        # Exporter maps Blender -Y to glTF +Z, and Z up to Y up.
        transform=Matrix.Diagonal((.55,.72,.55,1))
        me.transform(transform@o.matrix_world);o.matrix_world=Matrix.Identity(4)
        groups.setdefault((wheel,role),[]).append(o)
    merged=[]
    for (wheel,role),objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join();o=bpy.context.object;o.name=(wheel or 'body')+'_'+role
        merged.append((wheel,o))
    before=sum(triangulate_count(o) for _,o in merged)
    if before>32500:
        ratio=32500/before
        for wheel,o in merged:
            bpy.context.view_layer.objects.active=o
            mod=o.modifiers.new('Global browser triangle budget','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Place the tyre contact plane at zero after evaluation, without a wrapper scale.
    minz=min(v.co.z for _,o in merged for v in o.data.vertices)
    for _,o in merged:
        for v in o.data.vertices:v.co.z-=minz
    root=bpy.data.objects.new('kart_'+kind,None);bpy.context.scene.collection.objects.link(root)
    root['character']=kind;root['forward']='+Z in glTF';root['wheelSpinAxis']='X';root['visualOnly']=True
    wheels={}
    for wheel,o in merged:
        if wheel:
            if wheel not in wheels:
                coords=[v.co for w,ob in merged if w==wheel for v in ob.data.vertices]
                center=Vector(tuple((min(v[i] for v in coords)+max(v[i] for v in coords))/2 for i in range(3)))
                parent=bpy.data.objects.new(wheel,None);bpy.context.scene.collection.objects.link(parent);parent.location=center;parent.parent=root
                wheels[wheel]=parent
            par=wheels[wheel]
            for v in o.data.vertices:v.co-=par.location
            o.parent=par
        else:o.parent=root
    bpy.context.view_layer.update()
    vs=[o.matrix_world@v.co for _,o in merged for v in o.data.vertices]
    lo=[min(v[i] for v in vs) for i in range(3)];hi=[max(v[i] for v in vs) for i in range(3)]
    result=dict(character=kind,source_triangles_before_decimation=original_tris,triangles=sum(triangulate_count(o) for _,o in merged),mesh_count=len(merged),draw_calls=len(merged),materials=len(set(m.name for _,o in merged for m in o.data.materials)),textures=0,wheels=sorted(wheels),bounds_gltf=dict(min=[lo[0],lo[2],-hi[1]],max=[hi[0],hi[2],-lo[1]]),forward='+Z',up='+Y',wheel_spin_axis='X')
    bpy.ops.object.select_all(action='SELECT')
    path=OUT/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_attributes=False)
    result['glb_bytes']=path.stat().st_size
    print('EXPORTED',json.dumps(result),flush=True)
    return result

def point_at(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

def studio(kind):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=4;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.45
    scene.compositing_node_group=None
    world=bpy.data.worlds.new('Preview / soft neutral studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.31,.4,.55,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
    for name,loc,power,col,size in [('key',(-3,-5,7),650,(.84,.91,1),4),('fill',(4,-2,4),450,(1,.83,.71),4),('rim',(0,4,5),900,(.20,.8,1),3)]:
        d=bpy.data.lights.new('Preview / '+name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size
        o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=loc;point_at(o,(0,0,1.3))
    d=bpy.data.cameras.new('Preview / hero camera');o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=(-4.5,-7,4.1);point_at(o,(0,-.10,1.44));d.type='ORTHO';d.ortho_scale=4.3;scene.camera=o
    scene.render.filepath=str(OUT/(kind+'.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender'/(kind+'.blend')),compress=True)
    bpy.ops.render.render(write_still=True)

def main():
    results=[]
    for kind in KINDS:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
        result=build_runtime(kind);results.append(result)
        (ART/('blender-'+kind+'.json')).write_text(json.dumps(result,indent=2))
        studio(kind)
    print('BUILD COMPLETE',json.dumps(results),flush=True)

main()
