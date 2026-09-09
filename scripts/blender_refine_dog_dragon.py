"""Reference-driven dog/dragon facial sculpt, isolated Blender background build.

The chassis/suit are recovered from the editable source. Facial volumes are
voxel fused and smoothed before authored eyelids/irises are fitted to the skin.
No source reference or another character output is modified.
"""
import bpy, math, random, json, sys, hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[1]
NS={'__file__':str(ROOT/'scripts/blender_build_assets.py'),'__name__':'dogdragon_helpers'}
exec((ROOT/'scripts/blender_build_assets.py').read_text().rsplit('\nmain()',1)[0],NS)
mat=NS['material']; ell=NS['ell']; mesh=NS['mesh']; tapered=NS['tapered']; point_at=NS['point_at']
ART=ROOT/'artifacts/faces-v2'; ART.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/models'
HEAD_COLOR={}
SCRIPT_HASH=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

def apply(o,mod):
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=mod.name)

def rgba(o, fn):
    ca=o.data.color_attributes.get('Color') or o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for p in o.data.polygons:
        for li in p.loop_indices:
            v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
            ca.data[li].color=(*fn(v)[:3],1)

def mark(o,role='face_skin'):
    o['face_v2']=True;o['face_role']=role
    return o

def ball(name,pos,scale,m):return mark(ell(name,pos,scale,m,48,32))

def line(name,pts,r,m,sides=8):
    rs=r if isinstance(r,list) else [r]*len(pts)
    return mark(tapered(name,pts,rs,m,sides),'face_matte')

def join(items,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:o.select_set(True)
    bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join()
    o=bpy.context.object;o.name=name;return o

def fuse(items,name,voxel=.022):
    o=join(items,name)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Continuous anatomical volumes','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel;mod.use_smooth_shade=True;apply(o,mod)
    mod=o.modifiers.new('Soften sculpt transitions','SMOOTH');mod.factor=.8;mod.iterations=6;apply(o,mod)
    return mark(o)

def subtract(o,cutter):
    mod=o.modifiers.new('Anatomical opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;apply(o,mod)
    bpy.data.objects.remove(cutter,do_unlink=True)

def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def mix(a,b,t):return tuple(x*(1-t)+y*t for x,y in zip(a,b))

def smile_bounds(x):
    f=(abs(x)/.27)**1.7
    return 3.000+.18*f,3.09+.09*f

def dog_front_surface(x,z):
    zn=(z-3.43)/(.595*.88 if z<3.43 else .595)
    narrow=1-.19*max(0,-zn-.15)/.85
    ny=math.sqrt(max(.005,1-(x/(.595*narrow))**2-zn*zn))
    swell=.34*math.exp(-(x/.40)**4-((z-3.205)/.18)**4)*(1-smoothstep(3.28,3.37,z))*ny
    return .12-.465*ny-swell

def sculpt(kind,M):
    skin=M['skin'];dog=kind=='dog'
    skull=ball(kind+' / continuous skull',(0,.12,3.43),(.595,.465,.595),skin)
    for v in skull.data.vertices:
        z=v.co.z
        if z<-.15:v.co.x*=1-.19*(-z-.15)/.85
        if z<0:v.co.z*=.88 if dog else .80
        if dog and v.co.y<0:
            x=v.co.x*.595;zz=3.43+v.co.z*.595
            swell=.34*math.exp(-(x/.40)**4-((zz-3.205)/.18)**4)*(1-smoothstep(3.28,3.37,zz))*(-v.co.y)
            v.co.y-=swell/.465
    mass=[skull,ball(kind+' / chin',(0,-.08,3.025) if dog else (0,-.20,3.10),(.300,.252,.154) if dog else (.385,.30,.13),skin)]
    if dog:
        # The muzzle is vertex sculpted directly from the cranium. There is
        # no separate snout pillow or cheek sphere to produce a stacked face.
        pass
    else:
        mass.append(ball('Dragon / broad short snout',(0,-.345,3.205),(.453,.300,.204),skin))
        for s in (-1,1):mass.append(ball('Dragon / cheekbone',(s*.40,-.08,3.295),(.20,.13,.17),skin))
    head=fuse(mass,kind+' / sculpted unified facial skin',.020)
    if dog:
        perimeter=[]
        for i in range(49):
            x=-.27+.54*i/48;lo,hi=smile_bounds(x);perimeter.append((x,hi))
        for i in range(47,0,-1):
            x=-.27+.54*i/48;lo,hi=smile_bounds(x);perimeter.append((x,lo))
        n=len(perimeter);vv=[(x,y,z) for y in (-.99,-.24) for x,z in perimeter]
        ff=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
        subtract(head,mesh('Dog smiling mouth cavity cutter',vv,ff,skin))
    def color(v):
        x,y,z=v;front=1-smoothstep(-.08,.15,y)
        if dog:
            base=(.49,.185,.047)
            cream=(.90,.737,.475)
            edge=3.30+.16*smoothstep(.20,.54,abs(x))+.014*math.cos(x*22)
            mask=(1-smoothstep(edge-.035,edge+.027,z))*front
            # Cream eyebrow fur patches, not white eye-sized discs.
            brow=math.exp(-((abs(x)-.30)/.185)**4-((z-3.705)/.087)**4)*front
            return mix(base,cream,max(mask,brow*.58))
        mask=(1-smoothstep(3.155+.045*(abs(x)/.5),3.21+.03*(abs(x)/.5),z))*front
        c=mix((.025,.32,.32),(.68,.705,.46),mask)
        return mix(c,(.02,.24,.265),smoothstep(.0,.5,y)*.35)
    rgba(head,color)
    HEAD_COLOR[kind]=color
    head['face_preserve_color']=True
    return head

def face_y(x,z,dog):
    # Front ellipsoid envelope: eye patches conform to the brow instead of
    # stacking a complete sphere in front of the skull.
    term=max(.07,1-(x/.61)**2-((z-3.43)/.625)**2)
    return .12-.475*math.sqrt(term)+.005

def eyes(kind,M,head):
    dog=kind=='dog';cx=.274 if dog else .286;cz=3.505 if dog else 3.505
    w=.186 if dog else .205;h=.200 if dog else .155
    for s in (-1,1):
        def bounds(x):
            sh=max(0,1-(x/w)**2)**.57
            tilt=s*x*(.10 if dog else .29)
            return -h*(.70 if dog else .78)*sh+tilt,h*(1 if dog else .58)*sh+tilt
        def sy(x,z):
            return face_y(s*cx+x,cz+z,dog)-.022*max(0,1-(x/w)**2)*max(0,1-(z/h)**2)
        # The sclera occupies an actual opening, not a disk mounted on skin.
        boundary=[]
        for i in range(41):
            x=-w+2*w*i/40;lo,hi=bounds(x);boundary.append((s*cx+x,cz+hi))
        for i in range(39,0,-1):
            x=-w+2*w*i/40;lo,hi=bounds(x);boundary.append((s*cx+x,cz+lo))
        bv=[(x,face_y(x,z,dog)-.018,z) for x,z in boundary]+[(x,.10,z) for x,z in boundary];nf=len(boundary)
        bf=[tuple(reversed(range(nf))),tuple(nf+i for i in range(nf))]+[(i,(i+1)%nf,nf+(i+1)%nf,nf+i) for i in range(nf)]
        subtract(head,mesh(kind+' eye socket cutter',bv,bf,M['skin']))
        vv=[];ff=[];nx=42;nz=22
        for i in range(nx+1):
            x=-w+2*w*i/nx;lo,hi=bounds(x)
            for j in range(nz+1):
                z=lo+(hi-lo)*j/nz;vv.append((s*cx+x,sy(x,z),cz+z))
            if i:
                for j in range(nz):ff.append(((i-1)*(nz+1)+j,i*(nz+1)+j,i*(nz+1)+j+1,(i-1)*(nz+1)+j+1))
        mark(mesh(kind+' / inset almond sclera',vv,ff,M['white']),'face_eye')
        # Single curved colored iris with radial fibers and black pupil.
        vv=[];ff=[];cols=[];N=16;K=80
        rx=.144 if dog else .145;rz=.17 if dog else .160
        for i in range(N+1):
            r=i/N
            for k in range(K):
                a=k*math.tau/K;x=(-s*.018 if dog else 0)+rx*r*math.cos(a);z=-.004+rz*r*math.sin(a)
                lo,hi=bounds(x);z=max(lo+.003,min(hi-.003,z))
                vv.append((s*cx+x,sy(x,z)-.004,cz+z))
                fiber=.5+.5*math.sin(a*57+math.sin(a*17)*2+r*13)
                if r<(.68 if dog else .60):c=(.004,.006,.006)
                elif r>.92:c=(.018,.012,.006)
                else:
                    c=mix((.045,.012,.005) if dog else (.44,.13,.01),(.20,.073,.020) if dog else (.99,.52,.033),fiber*.43+.22)
                    c=mix(c,(.24,.094,.030) if dog else (1,.71,.08),max(0,1-abs(r-.72 if dog else r-.64)*9)*(.30 if dog else .58))
                cols.append((*c,1))
                if i:
                    ff.append(((i-1)*K+k,i*K+k,i*K+(k+1)%K,(i-1)*K+(k+1)%K))
        o=mark(mesh(kind+' / living iris pupil fiber surface',vv,ff,M['iris']),'face_eye');o['face_preserve_color']=True
        ca=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for l in o.data.loops:ca.data[l.index].color=cols[l.vertex_index]
        for dx,dz,rxg,rzg in [(-.041,.065,.034,.043),(.054,-.054,.012,.016)]:
            # Catchlight is part of the curved wet surface, not an outer bead.
            dx+=-s*.018 if dog else 0
            gl=mark(ell(kind+' / soft eye reflection',(s*cx+dx,sy(dx,dz)-.008,cz+dz),(rxg,.003,rzg),M['glint'],20,12),'face_eye')
        for upper in (False,True):
            pts=[];N=48
            for i in range(N+1):
                x=-w+2*w*i/N;lo,hi=bounds(x);z=hi if upper else lo
                pts.append((s*cx+x,sy(x,z)-.004,cz+z))
            # A thin skin ribbon blends into the socket; a cylindrical tube
            # here reads as a hard ring even when assigned a skin material.
            rv=[];rf=[];R=4
            for i in range(N+1):
                x=-w+2*w*i/N;lo,hi=bounds(x);z=hi if upper else lo
                for j in range(R+1):
                    f=j/R;zz=cz+z+(.035 if upper else -.035)*f
                    yy=sy(x,z)*(1-f)+(face_y(s*cx+x,zz,dog)+.010)*f
                    rv.append((s*cx+x,yy,zz))
                    if i and j:rf.append(((i-1)*(R+1)+j-1,i*(R+1)+j-1,i*(R+1)+j,(i-1)*(R+1)+j))
            o=mark(mesh(kind+' / integrated orbital skin',rv,rf,M['skin']));rgba(o,HEAD_COLOR[kind]);o['face_preserve_color']=True
            if upper or not dog:line(kind+' / tapered upper lash' if upper else kind+' / subtle lower waterline',pts,[.002+(.013 if upper else .003)*math.sin(i*math.pi/N)**.6 for i in range(N+1)],M['dark'])
        # Thick confident dragon brows, soft fur-colored dog brows.
        pts=[];rs=[]
        for i in range(25):
            t=i/24;x=s*(.10+.365*t)
            if dog:z=3.77+.035*math.sin(math.pi*t)-.035*t
            else:
                xx=abs(x)-cx;sh=max(0,1-(xx/w)**2)**.57
                z=cz+h*.58*sh+xx*.29+.065
            pts.append((x,face_y(x,z,dog)-.022,z));rs.append(.005+(.018 if dog else .033)*math.sin(math.pi*t)**.55)
        line(kind+' / expressive tapered brow',pts,rs,M['brow'],12)

def dog_nose(M):
    # Rounded triangular nose with a convex bridge and indented nostrils.
    vv=[];ff=[];K=48;N=16
    for i in range(N+1):
        v=i/N;a=-math.pi/2+v*math.pi
        z=3.245+.071*math.sin(a);wid=.185*(.36+.64*v)*math.sqrt(max(.001,math.cos(a)))
        for k in range(K):
            q=k*math.tau/K;x=wid*math.cos(q);vv.append((x,dog_front_surface(x,z)+.01-.065*math.cos(a)*math.sin(q),z))
        if i:
            for k in range(K):ff.append(((i-1)*K+k,(i-1)*K+(k+1)%K,i*K+(k+1)%K,i*K+k))
    ff.extend([tuple(reversed(range(K))),tuple(N*K+k for k in range(K))])
    nose=mark(mesh('Dog / sculpted heart-shaped nose',vv,ff,M['nose']),'face_nose')
    for s in (-1,1):
        yy=dog_front_surface(s*.078,3.235)
        c=ell('dog nostril cutter',(s*.078,yy-.045,3.235),(.024,.026,.014),M['dark'],20,12);subtract(nose,c)
        mark(ell('Dog / nostril interior',(s*.078,yy-.025,3.234),(.019,.005,.010),M['dark'],20,12),'face_matte')
    pts=[(0,dog_front_surface(0,z)-.003,z) for z in (3.17,3.13,3.087)]
    line('Dog / nose philtrum',pts,[.005,.006,.002],M['dark'])
    vv=[];ff=[];K=48;N=12
    for i in range(K+1):
        x=-.27+.54*i/K;lo,hi=smile_bounds(x)
        for j in range(N+1):
            t=j/N;z=lo+(hi-lo)*t;vv.append((x,dog_front_surface(x,z)+.014+.055*math.sin(math.pi*t),z))
            if i and j:ff.append(((i-1)*(N+1)+j-1,i*(N+1)+j-1,i*(N+1)+j,(i-1)*(N+1)+j))
    mark(mesh('Dog / concave inner mouth',vv,ff,M['mouth']),'face_matte')
    # Broad rounded tongue descends through an open smile.
    t=mark(ell('Dog / soft smiling tongue',(0,-.445,3.011),(.089,.044,.079),M['tongue'],32,20));t.rotation_euler[0]=math.radians(-17)
    line('Dog / tongue center groove',[(0,-.476,3.057),(0,-.490,3.025),(0,-.484,2.990)],[.001,.002,.001],M['tonguedark'])
    for s in (-1,1):
        pts=[]
        for i in range(20):
            x=s*.29*i/19;z=3.09+.09*(abs(x)/.27)**1.7
            y=dog_front_surface(x,z)-.003
            pts.append((x,y,z))
        line('Dog / upturned smile crease',pts,[.003+.004*math.sin(math.pi*i/19) for i in range(20)],M['dark'])
        for i in range(3):
            x=s*(.21+.026*i);z=3.232-.031*(i%2);y=dog_front_surface(x,z)-.004
            mark(ell('Dog / muzzle follicle',(x,y,z),(.006,.003,.006),M['brow'],10,6),'face_matte')

def floppy_ear(s,M):
    vv=[];ff=[];N=36;K=24
    for i in range(N+1):
        t=i/N;x=s*(.48+.38*math.sin(t*math.pi*.63));z=3.84-.94*t
        cy=.12-.12*math.sin(math.pi*t)
        w=.043+.23*math.sin(math.pi*t)**.68
        dep=.100+.100*math.sin(math.pi*t)
        for k in range(K):
            a=k*math.tau/K;xx=x+s*w*math.cos(a);y=cy+dep*math.sin(a)
            y+=.007*math.sin(t*31+a*7)*math.sin(math.pi*t)
            zz=z+.08*math.cos(a)*math.sin(math.pi*t)
            vv.append((xx,y,zz))
        if i:
            for k in range(K):ff.append(((i-1)*K+k,(i-1)*K+(k+1)%K,i*K+(k+1)%K,i*K+k))
    ff.extend([tuple(reversed(range(K))),tuple(N*K+k for k in range(K))])
    o=mark(mesh('Dog / sculpted flowing spaniel ear',vv,ff,M['ear']))
    rgba(o,lambda v:mix((.37,.11,.022),(.58,.223,.045),smoothstep(2.93,3.9,v.z)*.6+(1-smoothstep(-.10,.05,v.y))*.2));o['face_preserve_color']=True
    # Short tapered groom, combined in a single material mesh at export.
    rng=random.Random(620+s)
    hairs=[];hairfaces=[]
    for k in range(250):
        t=rng.uniform(.07,.96);ang=rng.choice([rng.uniform(2.98,4.9),rng.uniform(-.22,.20)])
        x=s*(.48+.38*math.sin(t*math.pi*.63));z=3.84-.94*t;cy=.12-.12*math.sin(math.pi*t)
        w=.043+.23*math.sin(math.pi*t)**.68;dep=.100+.100*math.sin(math.pi*t)
        p=Vector((x+s*w*math.cos(ang),cy+dep*math.sin(ang),z+.08*math.cos(ang)*math.sin(math.pi*t)))
        flow=Vector((s*.13,-.013,-1)).normalized();le=rng.uniform(.019,.048)
        # Tiny three-sided tapered fibers, batched so the groom remains one mesh.
        u=flow.cross(Vector((0,1,0))).normalized();v=flow.cross(u).normalized();base=len(hairs)
        for pp,rr in [(p,.0018),(p+flow*le*.65+Vector((s*.006,-.003,0)),.001),(p+flow*le,.0001)]:
            for j in range(3):hairs.append(pp+rr*(u*math.cos(j*math.tau/3)+v*math.sin(j*math.tau/3)))
        for i in range(2):
            for j in range(3):hairfaces.append((base+i*3+j,base+i*3+(j+1)%3,base+(i+1)*3+(j+1)%3,base+(i+1)*3+j))
    mark(mesh('Dog / fine flowing ear groom',hairs,hairfaces,M['ear']))

def dog_goggles(M):
    pts=[]
    for i in range(97):
        a=i*math.tau/96;pts.append((.51*math.cos(a),.12+.36*math.sin(a),3.846))
    line('Dog / black fitted goggle band',pts,.048,M['dark'],8)
    for s in (-1,1):
        for name,y,size,ma in [('frame',-.272,(.252,.072,.144),M['dark']),('silver inset',-.324,(.231,.03,.125),M['metal']),('lime lens',-.35,(.207,.020,.105),M['glass'])]:
            o=mark(ell('Dog / goggle '+name,(s*.235,y,3.88),size,ma,32,18));o.rotation_euler[1]=s*.18;o['face_role']='face_glass' if name=='lime lens' else 'face_matte'
            if name=='lime lens':
                bpy.context.view_layer.update()
                rgba(o,lambda v,s=s:mix((.025,.072,.009),(.36,.72,.005),math.exp(-((v.x-s*.235+.055)/.10)**4)))
                o['face_preserve_color']=True
    line('Dog / goggle bridge',[(-.045,-.31,3.865),(0,-.327,3.875),(.045,-.31,3.865)],.034,M['dark'],10)
    for i in range(8):
        x=(i-3.5)*.049
        line('Dog / flowing forehead tuft',[(x,.08,3.93),(x-.025,.06,4.013),(x-.09,.09,4.05+math.sin(i)*.014)],[.068,.044,.001],M['ear'],10)['face_role']='face_skin'

def dragon_features(head,M):
    for s in (-1,1):
        c=ell('Dragon nostril cutter',(s*.20,-.583,3.29),(.047,.038,.030),M['dark'],28,18);c.rotation_euler[2]=s*-.28;subtract(head,c)
        mark(ell('Dragon / inset nostril cavity',(s*.20,-.565,3.284),(.034,.006,.020),M['dark'],20,12),'face_matte')
    pts=[]
    for i in range(49):
        x=-.365+.73*i/48;z=3.055+.085*(abs(x)/.365)**1.8
        y=-.345-.300*math.sqrt(max(.03,1-(x/.453)**2-((z-3.205)/.204)**2))-.004
        pts.append((x,y,z))
    line('Dragon / relaxed broad smile',pts,[.001+.007*math.sin(math.pi*i/48)**.55 for i in range(49)],M['brow'])
    # Unequal narrow scales on the cheek follow the skull, not a dotted mask.
    rng=random.Random(14)
    for s in (-1,1):
        for row in range(5):
            for j in range(5):
                x=s*(.42+j*.036+row*.005);z=3.19+row*.045+rng.uniform(-.008,.008)
                y=face_y(x,z,False)-.020
                if y>.05:continue
                o=mark(ell('Dragon / small cheek scale',(x,y,z),(.016+rng.random()*.005,.005,.011+rng.random()*.005),M['scale'],10,6));o.rotation_euler[1]=s*.25
    for s in (-1,1):
        points=[];r=[]
        for i in range(31):
            t=i/30;points.append((s*(.43+.17*math.sin(t*math.pi*.75)),.19+.28*t,3.875+.66*t));r.append(.15*(1-t)**.76+.002)
        line('Dragon / sculpted backward horn',points,r,M['horn'],16)
        # Raised black growth ridges wrap each curved horn.
        for t in (.10,.26,.43,.62,.77):
            idx=round(t*30);p=Vector(points[idx]);d=(Vector(points[min(idx+1,30)])-Vector(points[max(idx-1,0)])).normalized();u=d.cross(Vector((0,1,0))).normalized();v=d.cross(u).normalized()
            circle=[p+(r[idx]+.004)*(u*math.cos(k*math.tau/48)+v*math.sin(k*math.tau/48)) for k in range(49)]
            line('Dragon / horn ring',circle,.008 if t!=.43 else .012,M['hornridge'] if t!=.43 else M['amber'],6)['face_role']='face_matte' if t!=.43 else 'face_signal'
        dragon_fin(s,M)
    # Three frontal blades plus crown/rear ridge: curved flattened spines.
    for x,y,z,h in [(0,-.075,3.83,.46),(-.155,.025,3.865,.31),(.155,.025,3.865,.31),(0,.31,3.93,.33),(0,.49,3.82,.29),(0,.57,3.62,.23)]:
        o=line('Dragon / sculpted crown blade',[(x,y,z),(x,y+.035,z+h*.58),(x,y+.095,z+h)],[.098,.079,.001],M['skin'],12)
        # Flatten in X about the blade axis; preserves a leaf-shaped crest.
        for v in o.data.vertices:v.co.x=x+(v.co.x-x)*.48
        o['face_role']='face_skin'
    # Scale panels along the visible rear cranium.
    for row in range(8):
        z=3.16+row*.087
        for j in range(9):
            a=.14+(j+(row%2)*.45)*(math.pi-.28)/8
            zn=(z-3.43)/(.60 if z>=3.43 else .53);r=math.sqrt(max(.04,1-zn*zn))
            narrow=1-.19*max(0,-zn-.15)/.85
            x=.595*r*math.cos(a)*narrow;y=.12+.465*r*math.sin(a)
            o=mark(ell('Dragon / rear layered scale',(x,y,z),(.046,.006,.035),M['scale'],12,8));o.rotation_euler[2]=a-math.pi/2

def dragon_fin(s,M):
    # Authored scalloped outline sampled around the closed ear membrane.
    outline=[(.59,3.76),(.79,3.94),(1.07,4.035),(.955,3.865),(.946,3.751),(1.047,3.692),(.887,3.692),(.838,3.585),(.967,3.483),(.819,3.511),(.743,3.39),(.788,3.295),(.625,3.393),(.568,3.565)]
    outline=[(.59+(x-.59)*.84,z) for x,z in outline]
    contour=[]
    for i in range(len(outline)):
        p0,p1,p2,p3=[Vector(outline[j%len(outline)]) for j in (i-1,i,i+1,i+2)]
        for j in range(4):
            t=j/4;contour.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    outline=contour
    center=Vector((s*.716,.11,3.659));vv=[center];ff=[];cols=[(.86,.63,.245,1)];K=len(outline);rings=9
    for i in range(1,rings+1):
        t=i/rings
        for j,(x,z) in enumerate(outline):
            p=center.lerp(Vector((s*x,.12+(x-.6)*.09,z)),t);p.y-=.09*math.sin(math.pi*t)
            vv.append(p);c=mix((.92,.73,.40),(.96,.41,.065),smoothstep(.40,.85,t));c=mix(c,(.025,.27,.285),smoothstep(.85,.99,t));cols.append((*c,1))
    for j in range(K):ff.append((0,1+j,1+(j+1)%K))
    for i in range(1,rings):
        st=1+(i-1)*K;nx=st+K
        for j in range(K):ff.append((st+j,nx+j,nx+(j+1)%K,st+(j+1)%K))
    o=mark(mesh('Dragon / sculpted scalloped ear membrane',vv,ff,M['skin']));o['face_preserve_color']=True
    ca=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for l in o.data.loops:ca.data[l.index].color=cols[l.vertex_index]
    mod=o.modifiers.new('Curved membrane thickness','SOLIDIFY');mod.thickness=.024;apply(o,mod)
    for j in (8,20,32,44):
        x,z=outline[j];line('Dragon / ear supporting ray',[(s*.592,.10,3.59),(s*(.59+x)*.5,.115,(3.59+z)*.5),(s*x,.12+(x-.6)*.09,z)],[.03,.023,.002],M['skin'],8)['face_role']='face_skin'
    pp=[(s*x,.12+(x-.6)*.09,z) for x,z in outline];pp.append(pp[0]);line('Dragon / soft ear rim',pp,.012,M['skin'],8)['face_role']='face_skin'

def materials(kind):
    dog=kind=='dog'
    M={
      'skin':mat(kind+' / facial skin',(.49,.185,.047) if dog else (.025,.32,.32),rough=.70 if dog else .50),
      'ear':mat(kind+' / caramel ear fur',(.50,.176,.041),rough=.78),
      'white':mat(kind+' / ivory sclera',(.90,.94,.89),rough=.21),
      'iris':mat(kind+' / iris vertex shading',(1,1,1),rough=.20),
      'glint':mat(kind+' / reflected softbox',(.95,.99,1),rough=.13),
      'dark':mat(kind+' / soft dark',(.021,.012,.007) if dog else (.008,.035,.034),rough=.48),
      'brow':mat(kind+' / brow',(.22,.078,.021) if dog else (.006,.015,.017),rough=.64),
      'nose':mat(kind+' / nose',(.028,.020,.015),rough=.29),
      'mouth':mat(kind+' / mouth interior',(.066,.012,.018),rough=.80),
      'tongue':mat(kind+' / tongue',(.78,.16,.23),rough=.44),
      'tonguedark':mat(kind+' / tongue crease',(.38,.06,.10),rough=.52),
      'metal':mat(kind+' / goggle metal',(.25,.30,.25),.76,.23),
      'glass':mat(kind+' / lime reflective lens',(.08,.27,.009),.72,.13),
      'scale':mat(kind+' / teal scale detail',(.022,.22,.245),rough=.51),
      'horn':mat(kind+' / graphite horn',(.037,.029,.028),.16,.40),
      'hornridge':mat(kind+' / horn raised ridge',(.095,.068,.052),.12,.39),
      'amber':mat(kind+' / amber horn energy',(1,.33,.012),.12,.28,1.3),
      'jacket':mat(kind+' / closed charcoal inner collar',(.016,.026,.038),rough=.48),
    }
    return M

def recover_body(kind):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/source-reference.blend'))
    body_prefix=('Leather trouser','Reinforced racing boot','Rubber boot sole','Boot ','Tailored one-piece','White neck','Raised angular racing collar','Collar luminous edge','Magenta five-point','Harness ','Shoulder harness adjuster','Adjuster center webbing','Upper leather sleeve','Rolled sleeve','Bare soft forearm','Sleeve cyan racing stripe','Sleeve cuff rib','Black driving wrist cuff','Cyan cuff edge','Rabbit gloved-free palm','Curled driving finger','Opposing soft thumb','Elbow garment seam','Jacket central zip','Zipper pull','Racing waist belt')
    for o in list(bpy.context.scene.objects):
        if any('CHARACTER' in c.name for c in o.users_collection) and not o.name.startswith(body_prefix):bpy.data.objects.remove(o,do_unlink=True)
    # Keep original car cleanup without adding any old variant face.
    old=NS['adapt_character'];NS['adapt_character']=lambda _:None;NS['cleanup'](kind);NS['adapt_character']=old
    neck=bpy.data.objects.get('White neck')
    if neck:
        neck.location=(0,.15,2.70);neck.scale=(.18,.17,.25)

def accessories(kind,M):
    # Zip-up inner yoke closes the original deep V so the visible throat is
    # the short connection immediately beneath the jaw in the reference.
    vv=[];ff=[];N=40
    for i in range(3):
        z=(2.39,2.56,2.68)[i];rx=(.21,.22,.185)[i];ry=(.14,.17,.165)[i]
        for j in range(N):
            a=j*math.tau/N;vv.append((rx*math.cos(a),.115+ry*math.sin(a),z))
            if i:ff.append(((i-1)*N+j,(i-1)*N+(j+1)%N,i*N+(j+1)%N,i*N+j))
    mark(mesh(kind+' / closed collar yoke',vv,ff,M['jacket']),'face_matte')
    line(kind+' / collar zipper',[(-.008,-.043,2.39),(-.008,-.060,2.55),(-.008,-.053,2.66)],.008,M['metal'],8)
    if kind=='dog':
        for s in (-1,1):floppy_ear(s,M)
        dog_goggles(M)
        line('Dog / curled tail',[(0,.92,1.7),(.20,1.45,1.7),(.45,1.6,2.05),(.56,1.43,2.26)],[.19,.16,.10,.001],M['ear'],14)['face_role']='face_skin'
        line('Dog / scout antenna',[(.70,1.52,1.62),(.70,1.52,2.08),(.70,1.52,2.39)],[.025,.025,.012],M['dark'])
        mark(ell('Dog / antenna signal',(.70,1.52,2.40),(.09,.09,.09),M['glass'],16,12),'face_nose')
    else:
        tail=[(0,.83,1.48),(-.2,1.25,1.76),(-.36,1.52,2.28),(-.54,1.77,2.78),(-.85,1.82,3.02),(-1.22,1.72,3.12)]
        line('Dragon / curling long tail',tail,[.28,.26,.21,.17,.105,.001],M['skin'],20)['face_role']='face_skin'
        for p in tail[1:-1]:line('Dragon / tail amber dorsal spine',[p,(p[0],p[1]-.015,p[2]+.28)],[.095,.001],M['amber'],10)['face_role']='face_signal'

def runtime(kind):
    rolem={
      'matte':mat('runtime / matte vertex colors',(1,1,1),.05,.42),
      'metal':mat('runtime / alloy vertex colors',(1,1,1),.65,.29),
      'skin':mat('runtime / skin vertex colors',(1,1,1),0,.63),
      'face_skin':mat('runtime / authored facial skin',(1,1,1),0,.66 if kind=='dog' else .48),
      'face_eye':mat('runtime / inset wet eye',(1,1,1),0,.22),
      'face_matte':mat('runtime / facial dark detail',(1,1,1),0,.58),
      'face_nose':mat('runtime / soft glossy face detail',(1,1,1),.08,.27),
      'face_glass':mat('runtime / green mirror goggles',(1,1,1),.76,.13),
      'face_signal':mat('runtime / amber horn rings',(1,.33,.012),.12,.28,1.3),
      'signal':mat('runtime / cyan signal' if kind=='dog' else 'runtime / amber signal',(.005,.68,.95) if kind=='dog' else (1,.22,.012),.25,.23,1.6),
      'accent':mat('runtime / magenta signal',(1,.005,.19),.15,.25,1.6),
    }
    for role,m in rolem.items():
        if role not in ('signal','accent','face_signal'):
            n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    # A tiny embedded tangent normal adds directional fur / scale grain.
    # It has no external image dependency and does not alter facial color.
    import numpy as np
    size=512;u,v=np.meshgrid(np.arange(size)/size,np.arange(size)/size)
    if kind=='dog':
        rng=np.random.default_rng(37);raw=rng.random((size,size))-.5
        long=sum(np.roll(raw,k,axis=0) for k in range(-5,6))/11
        short=sum(np.roll(raw,k,axis=0) for k in (-1,0,1))/3
        height=.65*long+.35*short
        height=(np.roll(height,1,axis=1)+2*height+np.roll(height,-1,axis=1))/4
        nx=(np.roll(height,1,axis=1)-np.roll(height,-1,axis=1))*.85
        ny=(np.roll(height,1,axis=0)-np.roll(height,-1,axis=0))*.45
    else:
        rng=np.random.default_rng(52);raw=rng.random((size,size))-.5
        height=sum(np.roll(np.roll(raw,i,axis=0),j,axis=1) for i in (-1,0,1) for j in (-1,0,1))/9
        nx=(np.roll(height,1,axis=1)-np.roll(height,-1,axis=1))*.34
        ny=(np.roll(height,1,axis=0)-np.roll(height,-1,axis=0))*.34
    nz=np.sqrt(np.maximum(.01,1-nx*nx-ny*ny));pixels=np.stack([nx*.5+.5,ny*.5+.5,nz*.5+.5,np.ones_like(nx)],axis=-1).astype(np.float32)
    im=bpy.data.images.new(kind+' dogdragon authored micro-normal',width=size,height=size);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pixels.reshape(-1));im.filepath_raw=str(ART/(kind+'-dogdragon-normal.png'));im.file_format='PNG';im.save();im.pack()
    nt=rolem['face_skin'].node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im;normal=nt.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.56 if kind=='dog' else .42;nt.links.new(tex.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],nt.nodes.get('Principled BSDF').inputs['Normal'])
    groups={};original=0
    for o in list(bpy.context.scene.objects):
        if o.type not in {'MESH','CURVE'}:continue
        facial=o.get('face_v2',False);preserve=o.get('face_preserve_color',False)
        role,col=NS['source_color'](o,kind)
        if o.name=='White neck':col=(.90,.737,.475,1) if kind=='dog' else (.68,.705,.46,1)
        if facial:
            role=o.get('face_role','face_skin');m=o.data.materials[0];col=m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:]
        wheel=''
        if o.name.startswith('Wheel '):wheel='wheel_'+('f' if 'Front' in o.name else 'r')+('l' if ' L ' in o.name else 'r')
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
        n=NS['triangulate_count'](o);original+=n
        goal=(12500 if 'unified facial skin' in o.name else 999999) if facial else (2200 if 'continuous curved-groove tire' in o.name else 350)
        if n>goal:
            mod=o.modifiers.new('Preserve contour browser reduction','DECIMATE');mod.ratio=goal/n;mod.use_collapse_triangulate=True;apply(o,mod)
        if not preserve:rgba(o,lambda _,col=col:col)
        me=o.data;me.materials.clear();me.materials.append(rolem[role])
        for uv in list(me.uv_layers):me.uv_layers.remove(uv)
        if role=='face_skin':
            uv=me.uv_layers.new(name='FaceDetailUV')
            for poly in me.polygons:
                coords=[]
                for li in poly.loop_indices:
                    p=o.matrix_world@me.vertices[me.loops[li].vertex_index].co
                    uu=(p.x+1.2)*.8 if 'ear' in o.name.lower() else math.atan2(p.x,p.y-.12)/math.tau+.5
                    coords.append([li,uu,(p.z-2.77)/1.15])
                if max(c[1] for c in coords)-min(c[1] for c in coords)>.5:
                    for c in coords:
                        if c[1]<.5:c[1]+=1
                for li,uu,vv in coords:uv.data[li].uv=(uu,vv)
        me.transform(Matrix.Diagonal((.55,.55 if facial else .72,.55,1))@o.matrix_world);o.matrix_world=Matrix.Identity(4)
        groups.setdefault((wheel,role),[]).append(o)
    merged=[]
    for (wheel,role),items in groups.items():
        o=join(items,(wheel or 'body')+'_'+role);o['runtime_face_group']=role.startswith('face_');merged.append((wheel,o))
    # Car and clothing have a separate budget. Facial sculpt never inherits
    # the former whole-model reduction that flattened the original eyelids.
    body_tris=sum(NS['triangulate_count'](o) for _,o in merged if not o['runtime_face_group'])
    if body_tris>30000:
        ratio=30000/body_tris
        for _,o in merged:
            if o['runtime_face_group']:continue
            mod=o.modifiers.new('Vehicle browser budget, face excluded','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True;apply(o,mod)
    minz=min(v.co.z for _,o in merged for v in o.data.vertices)
    for _,o in merged:
        for v in o.data.vertices:v.co.z-=minz
    root=bpy.data.objects.new('kart_'+kind,None);bpy.context.scene.collection.objects.link(root);root['character']=kind;root['faceVersion']=2;root['forward']='+Z in glTF';root['wheelSpinAxis']='X'
    wheels={}
    for wheel,o in merged:
        if wheel:
            if wheel not in wheels:
                vs=[v.co for w,ob in merged if w==wheel for v in ob.data.vertices];center=Vector(tuple((min(v[i] for v in vs)+max(v[i] for v in vs))/2 for i in range(3)))
                p=bpy.data.objects.new(wheel,None);bpy.context.scene.collection.objects.link(p);p.location=center;p.parent=root;wheels[wheel]=p
            p=wheels[wheel]
            for v in o.data.vertices:v.co-=p.location
            o.parent=p
        else:o.parent=root
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    result={'character':kind,'triangles':sum(NS['triangulate_count'](o) for _,o in merged),'mesh_count':len(merged),'materials':len(set(m.name for _,o in merged for m in o.data.materials)),'glb_bytes':(OUT/(kind+'.glb')).stat().st_size,'glb_sha256':hashlib.sha256((OUT/(kind+'.glb')).read_bytes()).hexdigest(),'script_sha256':SCRIPT_HASH,'wheels':sorted(wheels),'face_v2':True,'sculpt_revision':5,'surface_revision':6,'embedded_normal_textures':1,'source_triangles':original}
    (ART/(kind+'-metrics.json')).write_text(json.dumps(result,indent=2));print('METRICS',json.dumps(result),flush=True)
    return minz

def studio(kind,minz):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.max_bounces=5
    scene.render.threads_mode='FIXED';scene.render.threads=5
    scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.1;scene.compositing_node_group=None
    world=bpy.data.worlds.new('Face review neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.43,.45,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.42;scene.world=world
    for name,loc,power,col,size in [('key',(-3,-4.5,6.5),440,(1,.91,.80),4),('fill',(4,-3,3.5),290,(.79,.88,1),4),('rim',(0,3,5),600,(.86,.93,1),3)]:
        d=bpy.data.lights.new('Review / '+name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=loc;point_at(o,(0,0,1.7))
    d=bpy.data.cameras.new('Review / camera');cam=bpy.data.objects.new(d.name,d);scene.collection.objects.link(cam);d.type='ORTHO';scene.camera=cam
    center=Vector((0,-.06,3.49*.55-minz));scale=1.73 if kind=='dragon' else 1.54
    for view,loc in [('front',(0,-8,center.z+.09)),('side',(-8,0,center.z+.05)),('threequarter',(-5,-7,center.z+.35))]:
        cam.location=loc;point_at(cam,center);d.ortho_scale=scale;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.filepath=str(ART/(kind+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    cam.location=(-4.5,-7,3.9);point_at(cam,(0,-.10,1.40));d.ortho_scale=4.3;scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.filepath=str(ART/(kind+'-full.png'));bpy.ops.render.render(write_still=True)
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.filepath=str(OUT/(kind+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender'/(kind+'.blend')),compress=True)

def main():
    kinds=[x for x in sys.argv[sys.argv.index('--')+1:] if x in ('dog','dragon')] if '--' in sys.argv else ['dog','dragon']
    for kind in kinds:
        recover_body(kind);M=materials(kind);head=sculpt(kind,M);eyes(kind,M,head)
        if kind=='dog':dog_nose(M)
        else:dragon_features(head,M)
        accessories(kind,M)
        for o in bpy.context.scene.objects:
            if o.get('face_v2') and not any(t in o.name.lower() for t in ('tail','antenna','collar')):
                o.location.z-=.13
        # Editable anatomy keeps the same painted irises and fur zones as the
        # merged game export, while every source object remains selectable.
        colored_materials=set()
        for o in bpy.context.scene.objects:
            if o.type!='MESH' or not o.get('face_v2'):continue
            m=o.data.materials[0]
            if not o.data.color_attributes.get('Color'):
                col=m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:]
                rgba(o,lambda _,col=col:col)
            colored_materials.add(m)
        for m in colored_materials:
            n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color';m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        # Save a fully editable unmerged sculpt as well as the game-mesh blend.
        bpy.ops.wm.save_as_mainfile(filepath=str(ART/(kind+'-editable.blend')),compress=True)
        minz=runtime(kind);studio(kind,minz)
        print('FACE COMPLETE',kind,flush=True)

main()
