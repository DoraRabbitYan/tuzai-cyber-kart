"""Rabbit and sheep custom-topology heads, based on the supplied turnarounds.

The v1 vehicle/body is preserved in an immutable backup. Facial surfaces are
continuous authored meshes with real almond apertures, flush inset eye patches,
eyelid ribbons, shaped muzzle/chin contours, and curved sports optics.
Run: blender -b --python scripts/blender_refine_faces.py -- rabbit [sheep]
"""
import bpy, bmesh, math, json, shutil, sys
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
BACK=ROOT/'assets/blender/v1'
REVIEW=ROOT/'artifacts/face-review'
BACK.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
KINDS=[s for s in sys.argv[sys.argv.index('--')+1:] if s in ('rabbit','sheep')] if '--' in sys.argv else ['rabbit','sheep']
HEAD=[]
M={}
KIND='rabbit'

def material(name,color,metal=0,rough=.45,vertex=False):
    m=bpy.data.materials.new('face v2 / '+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if vertex:
        n=m.node_tree.nodes.new('ShaderNodeVertexColor');n.layer_name='Color'
        m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
    return m

def mesh(name,verts,faces,mat,colors=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    if colors:
        attr=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
        for i,value in enumerate(attr.data):value.color=colors[i]
    HEAD.append(obj)
    return obj

def tube(name,points,radii,mat,sides=10,colors=None):
    ps=[Vector(p) for p in points];verts=[];faces=[];vc=[]
    for i,p in enumerate(ps):
        d=(ps[min(i+1,len(ps)-1)]-ps[max(0,i-1)]).normalized()
        u=d.cross(Vector((0,1,0)))
        if u.length<.001:u=d.cross(Vector((1,0,0)))
        u.normalize();v=d.cross(u).normalized()
        r=radii[i] if hasattr(radii,'__len__') else radii
        for j in range(sides):
            a=j*math.tau/sides;verts.append(p+r*(u*math.cos(a)+v*math.sin(a)))
            if colors:vc.append(colors[i])
        if i:
            for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(ps)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,mat,vc if colors else None)

def gauss(x,z,cx,cz,sx,sz):return math.exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)

def profile(z):
    # Turnaround landmarks, interpolated with continuous Hermite tangents.
    # A short chin, wide cheekbone, and broad forehead avoid the old egg silhouette.
    rows=[(1.66,.004,.010,.068),(1.69,.122,.128,.068),(1.73,.224,.193,.070),
          (1.79,.305,.232,.075),(1.88,.345,.252,.080),(1.98,.341,.252,.086),
          (2.08,.316,.230,.092),(2.16,.267,.190,.098),(2.20,.180,.134,.102),
          (2.23,.002,.006,.105)]
    z=max(rows[0][0],min(rows[-1][0],z));i=next((i for i in range(len(rows)-1) if z<=rows[i+1][0]),len(rows)-2)
    a,b=rows[i],rows[i+1];prev=rows[max(0,i-1)];nxt=rows[min(len(rows)-1,i+2)]
    h=b[0]-a[0];t=(z-a[0])/h;values=[]
    for k in (1,2,3):
        m0=(b[k]-prev[k])/(b[0]-prev[0]);m1=(nxt[k]-a[k])/(nxt[0]-a[0])
        value=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*m1
        values.append(value)
    values[0]*=.96 if KIND=='sheep' else 1
    return max(.002,values[0]),max(.004,values[1]),values[2]

def front(x,z):
    width,depth,cy=profile(z)
    q=max(0,1-(x/max(width,.0001))**2)
    y=cy-depth*math.sqrt(q)
    # Continuous muzzle pads and bridge. No attached cheek or muzzle spheres.
    y-=.048*gauss(x,z,0,1.738,.200,.089)
    y-=.040*(gauss(x,z,-.080,1.765,.065,.046)+gauss(x,z,.080,1.765,.065,.046))
    y-=.032*gauss(x,z,0,1.857,.073,.14)
    y-=.027*(gauss(x,z,-.19,1.800,.11,.095)+gauss(x,z,.19,1.800,.11,.095))
    # Smooth brow and actual shallow eye sockets in the same skin surface.
    for side in (-1,1):
        y+=.018*gauss(x,z,side*.168,1.925,.11,.082)
        y-=.021*gauss(x,z,side*.16,2.020,.15,.06)
    return y

def head_surface():
    verts=[];faces=[];colors=[];rows=66;cols=128;lo=1.66;hi=2.230
    for i in range(rows):
        z=lo+(hi-lo)*i/(rows-1);w,d,cy=profile(z)
        for j in range(cols):
            a=j*math.tau/cols;x=w*math.cos(a)
            y=cy+d*math.sin(a)
            if math.sin(a)<0:
                plain=cy-d*math.sqrt(max(0,1-(x/max(w,.0001))**2))
                y+=(front(x,z)-plain)*(-math.sin(a))**1.5
            verts.append((x,y,z))
            warmth=.22*(gauss(x,z,-.255,1.808,.075,.036)+gauss(x,z,.255,1.808,.075,.036))*max(0,-math.sin(a))
            base=(.87,.88,.90) if KIND=='rabbit' else (.91,.81,.68)
            warm=(.81,.55,.57) if KIND=='rabbit' else (.88,.67,.53)
            colors.append(tuple(base[k]*(1-warmth)+warm[k]*warmth for k in range(3))+(1,))
        if i:
            for j in range(cols):faces.append(((i-1)*cols+j,(i-1)*cols+(j+1)%cols,i*cols+(j+1)%cols,i*cols+j))
    faces.extend([tuple(reversed(range(cols))),tuple((rows-1)*cols+j for j in range(cols))])
    return mesh('Head / continuous forehead orbit cheek muzzle chin',verts,faces,M['colorfur'],colors)

def outline(side,f,upper=True):
    # Asymmetric almond; outer canthus lifts into an expressive angled lid.
    x=side*(.089+.175*f)
    z=1.913+.010*f+((.066 if KIND=='rabbit' else .067) if upper else -.050)*math.sin(math.pi*f)**.82
    return x,z

def eye_outline(side,n=32):
    return [outline(side,i/n,True) for i in range(n+1)]+[outline(side,i/n,False) for i in range(n-1,0,-1)]

def eye_hole(head,side):
    boundary=eye_outline(side);verts=[(x,y,z) for y in (-.7,.13) for x,z in boundary]
    n=len(boundary);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    cutter=mesh('temporary almond aperture',verts,faces,M['black'])
    bpy.context.view_layer.objects.active=head
    mod=head.modifiers.new('Anatomical almond eye opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    HEAD.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)

def eye_y(x,z,cx):
    # Sclera stays under the eyelid/skin plane, with only 10 mm central convexity.
    return front(x,z)+.018-.027*max(0,1-((x-cx)/.13)**2-((z-1.918)/.085)**2)

def eyes(head):
    for s in (-1,1):
        eye_hole(head,s)
        bound=eye_outline(s);cx=s*.173;cz=1.918;n=len(bound)
        verts=[(cx,eye_y(cx,cz,cx),cz)];faces=[]
        rings=10
        for r in range(1,rings+1):
            t=r/rings
            for x,z in bound:
                xx=cx+(x-cx)*t;zz=cz+(z-cz)*t
                verts.append((xx,eye_y(xx,zz,cx),zz))
        for j in range(n):faces.append((0,1+j,1+(j+1)%n))
        for r in range(1,rings):
            a=1+(r-1)*n;b=1+r*n
            for j in range(n):faces.append((a+j,b+j,b+(j+1)%n,a+(j+1)%n))
        mesh('Eye / inset almond sclera',verts,faces,M['sclera'])
        # Iris is a shallow, layered radial patch, not a sphere attached to the face.
        iv=[];ic=[];iff=[];segs=72;nr=10
        center_x=s*.167;center_z=1.930
        for r in range(nr+1):
            t=max(.0001,r/nr)
            for j in range(segs):
                a=j*math.tau/segs;x=center_x+.052*t*math.cos(a);z=center_z+.060*t*math.sin(a)
                iv.append((x,eye_y(x,z,cx)-.004-.004*(1-t*t),z))
                if r<=6:color=(.008,.003,.014,1)
                elif r==nr:color=(.025,.010,.046,1)
                else:
                    noise=.86+.14*math.sin(j*2.3+r*.7)
                    base=(.115,.026,.345) if KIND=='rabbit' else (.43,.15,.012)
                    color=tuple(v*noise*(1.1-.35*t) for v in base)+(1,)
                ic.append(color)
            if r:
                for j in range(segs):iff.append(((r-1)*segs+j,(r-1)*segs+(j+1)%segs,r*segs+(j+1)%segs,r*segs+j))
        mesh('Eye / radial iris pupil and limbal ring',iv,iff,M['iris'],ic)
        # Two restrained highlights sell the corneal sheen without bulging eyes.
        for dx,dz,rx,rz in [(-.019,.025,.012,.015),(.017,-.028,.005,.006)]:
            x=center_x+dx;z=center_z+dz
            disk('Eye / corneal catchlight',(x,eye_y(x,z,cx)-.010,z),rx,rz,M['white'],20)
        for upper in (True,False):
            vs=[];fs=[];steps=42
            for i in range(steps+1):
                t=i/steps;x,z=outline(s,t,upper)
                dz=(.020 if upper else -.012)*math.sin(math.pi*t)**.4
                for k in range(4):
                    q=k/3;zz=z+dz*q
                    yy=front(x,zz)-.010*math.sin(math.pi*q)
                    vs.append((x,yy,zz))
                if i:
                    for k in range(3):fs.append(((i-1)*4+k,(i-1)*4+k+1,i*4+k+1,i*4+k))
            mesh('Eye / sculpted upper eyelid' if upper else 'Eye / sculpted lower eyelid',vs,fs,M['fur'])
            ps=[];rs=[]
            for i in range(45):
                t=i/44;x,z=outline(s,t,upper)
                ps.append((x,front(x,z)-.007,z));rs.append((.0059 if upper else .0022)*math.sin(math.pi*t)**.4+.0005)
            tube('Eye / tapered lash line' if upper else 'Eye / rose waterline',ps,rs,M['black'] if upper else M['rose'],7)
        for j in range(3):
            f=.82+j*.072;x,z=outline(s,f,True)
            ps=[(x,front(x,z)-.006,z),(x+s*(.016+j*.004),front(x,z)-.012,z+.014),(x+s*(.037+j*.006),front(x,z)-.002,z+.027+j*.003)]
            tube('Eye / swept outer lash',ps,[.0045,.003,.0001],M['black'],6)
        ps=[];rs=[]
        for i in range(32):
            t=i/31;x=s*(.071+.230*t);z=2.008+.038*math.sin(math.pi*t)-.028*t
            ps.append((x,front(x,z)-.014,z));rs.append(.0105*(1-.7*t)*math.sin(math.pi*(.08+.85*t))+.0015)
        tube('Brow / softly arched expression',ps,rs,M['brow'],9)

def disk(name,center,rx,rz,mat,n=40):
    x,y,z=center;v=[center]+[(x+rx*math.cos(j*math.tau/n),y,z+rz*math.sin(j*math.tau/n)) for j in range(n)]
    return mesh(name,v,[(0,1+j,1+(j+1)%n) for j in range(n)],mat)

def nose_mouth():
    # A single rounded triangular nose projects a little from the integrated muzzle.
    outline_pts=[(-.040,1.777),(-.026,1.790),(0,1.785),(.026,1.790),(.040,1.777),(.028,1.759),(0,1.738),(-.028,1.759)]
    verts=[(x,front(x,z)-.006,z) for x,z in outline_pts]+[(0,front(0,1.768)-.035,1.768)]
    faces=[(i,(i+1)%len(outline_pts),8) for i in range(len(outline_pts))]
    o=mesh('Nose / soft triangular pink cartilage',verts,faces,M['nose'])
    so=o.modifiers.new('Nose closed thickness','SOLIDIFY');so.thickness=.008
    sub=o.modifiers.new('Nose cartilage smoothing','SUBSURF');sub.levels=2;sub.render_levels=2
    tube('Mouth / short philtrum',[(0,front(0,z)-.004,z) for z in (1.741,1.726,1.715)],[.0026,.0022,.002],M['mouth'],7)
    for s in (-1,1):
        ps=[];rs=[]
        for i in range(24):
            t=i/23;x=s*.107*t;z=1.718-.008*math.sin(math.pi*t)+.016*t
            ps.append((x,front(x,z)-.006,z));rs.append(.0027*math.sin(math.pi*(.08+.86*t)))
        tube('Mouth / gentle upturned smile',ps,rs,M['mouth'],7)

def rabbit_ear(name,base,tip,width):
    b=Vector(base);t=Vector(tip);axis=(t-b).normalized();side=Vector((axis.z,0,-axis.x)).normalized()
    vs=[];fs=[];cols=24;rows=38;colors=[]
    for i in range(rows):
        q=i/(rows-1);c=b.lerp(t,q);c.y+=.07*math.sin(math.pi*q)
        w=.008+width*math.sin(math.pi*q)**.8
        for j in range(cols):
            a=j*math.tau/cols;vs.append(c+side*w*math.cos(a)+Vector((0,.035*math.sin(a)*math.sin(math.pi*q),0)))
            blend=max(0,(q-.83)/.17)
            colors.append((.9*(1-blend)+.035*blend,.91*(1-blend)+.62*blend,.92*(1-blend)+.75*blend,1))
        if i:
            for j in range(cols):fs.append(((i-1)*cols+j,(i-1)*cols+(j+1)%cols,i*cols+(j+1)%cols,i*cols+j))
    fs.extend([tuple(reversed(range(cols))),tuple((rows-1)*cols+j for j in range(cols))])
    mesh(name+' / smooth leaf silhouette',vs,fs,M['colorfur'],colors)
    vs=[];fs=[]
    for i in range(32):
        q=.08+.84*i/31;c=b.lerp(t,q);c.y+=.07*math.sin(math.pi*q)
        w=width*.70*math.sin(math.pi*q)**.85
        for j in range(13):
            a=-1+j/6;vs.append(c+side*w*a+Vector((0,-.034*math.sin(math.pi*q)-.008*(1-a*a),0)))
        if i:
            for j in range(12):fs.append(((i-1)*13+j,(i-1)*13+j+1,i*13+j+1,i*13+j))
    mesh(name+' / velvet inset',vs,fs,M['inner'])

def fur_lock(name,base,tip,width):
    a=Vector(base);b=Vector(tip);direction=(b-a).normalized();u=Vector((0,1,0));v=direction.cross(u).normalized()
    vs=[];fs=[];rows=10;cols=10
    for i in range(rows):
        t=i/(rows-1);c=a.lerp(b,t);c.y-=.009*math.sin(math.pi*t)
        r=width*(1-t)**.72+.0003
        for j in range(cols):
            q=j*math.tau/cols;vs.append(c+v*r*math.cos(q)+u*r*.20*math.sin(q))
        if i:
            for j in range(cols):fs.append(((i-1)*cols+j,(i-1)*cols+(j+1)%cols,i*cols+(j+1)%cols,i*cols+j))
    fs.append(tuple(reversed(range(cols))));mesh(name,vs,fs,M['fur'])

def rabbit_details():
    rabbit_ear('Rabbit left ear',(-.15,.09,2.18),(-.58,.21,2.98),.153)
    rabbit_ear('Rabbit right ear',(.145,.10,2.19),(.39,.27,3.16),.148)
    for s in (-1,1):
        for i,(z,dz) in enumerate(((1.80,-.035),(1.856,.014),(1.923,.055))):
            x=s*.302;tip=(s*(.407+.007*(i%2)),.090,z+dz)
            fur_lock('Rabbit / swept cheek silhouette',(x,.118,z),tip,.033)
        for i in range(3):
            base=(s*.175,front(s*.175,1.768)-.005,1.768-i*.012)
            tip=(s*(.46+i*.023),-.205,1.765+(i-1)*.038)
            mid=Vector(base).lerp(Vector(tip),.55);mid.y-=.014
            tube('Rabbit / fine cheek whisker',[base,mid,tip],[.0015,.001,.0001],M['fur'],5)
    visor(True)

def visor(single):
    # Wraparound sports strap follows the skull instead of flat floating circles.
    vs=[];fs=[];steps=96
    for i in range(steps):
        a=i*math.tau/steps;x=.308*math.sin(a);y=.087-.235*math.cos(a)
        for z in (2.083,2.136):vs.append((x,y,z))
    for i in range(steps):
        a=(i+.5)*math.tau/steps
        if 1.08<a<math.tau-1.08:fs.append((i*2,(i*2+2)%(steps*2),(i*2+3)%(steps*2),i*2+1))
    o=mesh('Goggles / fitted continuous rear strap',vs,fs,M['frame']);s=o.modifiers.new('Strap thickness','SOLIDIFY');s.thickness=.011
    lens_ranges=[(-1.06,1.06)] if single else [(-1.02,-.08),(.08,1.02)]
    for amin,amax in lens_ranges:
        vs=[];fs=[];vc=[];n=46
        for i in range(n+1):
            t=i/n;a=amin+(amax-amin)*t
            x=.294*math.sin(a)
            edge=math.sin(math.pi*t)**.25
            for row in range(6):
                q=row/5;z=2.120+(q-.5)*(.086 if single else .098)*(.55+.45*edge)+.006*math.cos(a)
                y=front(x,z)-.014
                vs.append((x,y-.002*math.sin(math.pi*q),z))
                if single:
                    f=abs(t-.5)*2;color=(.02+.36*f**5,.53*(1-f**4)+.03*f**4,.72+.10*f,1)
                else:color=(.66+.20*(1-q),.30+.23*(1-q),.013+.025*q,1)
                vc.append(color)
            if i:
                for row in range(5):fs.append(((i-1)*6+row,(i-1)*6+row+1,i*6+row+1,i*6+row))
        lens=mesh('Goggles / one-piece curved sports visor' if single else 'Goggles / amber rounded rectangular lens',vs,fs,M['lens'],vc)
        so=lens.modifiers.new('Lens shell thickness','SOLIDIFY');so.thickness=.007
        for row in (0,5):
            pts=[vs[i*6+row] for i in range(n+1)]
            tube('Goggles / slim graphite lens surround',pts,.010,M['frame'],8)
        for edge in (0,n):tube('Goggles / lens side bridge',[vs[edge*6+j] for j in range(6)],.009,M['frame'],8)
        # Narrow cool reflection; the majority of the visor remains visibly tinted.
        pts=[]
        for i in range(18):
            t=.22+i*.015;a=amin+(amax-amin)*t;x=.294*math.sin(a);z=2.142+.005*math.cos(a);y=front(x,z)-.018
            pts.append((x,y,z))
        tube('Goggles / controlled reflected streak',pts,.0018,M['white'],5)

def sheep_details():
    # Continuous fleece body under the small locks, with an open facial mask.
    # This makes dense wool rather than disconnected telephone-cord spirals.
    vs=[];fs=[];nr=34;ns=64
    for i in range(nr):
        z=1.714+.653*i/(nr-1);t=(z-2.035)/.333;f=math.sqrt(max(.0001,1-t*t))
        for j in range(ns):
            a=j*math.tau/ns
            loft=.012*math.sin(a*11+i*.81)+.008*math.sin(a*17-i*.59)
            zz=z+(.012*math.cos(a*12)+.004*math.sin(a*19) if i==24 and math.sin(a)<-.32 else 0)
            vs.append(((.329*f+loft)*math.cos(a),.09+(.277*f+loft)*math.sin(a),zz))
        if i:
            for j in range(ns):
                a=(j+.5)*math.tau/ns
                if i<=24 and math.sin(a)<-.32:continue
                fs.append(((i-1)*ns+j,(i-1)*ns+(j+1)%ns,i*ns+(j+1)%ns,i*ns+j))
    mesh('Sheep / continuous underlying fleece mass',vs,fs,M['wool'])
    for s in (-1,1):
        # Drooping anatomical ears with an integrated inset.
        b=Vector((s*.278,.063,1.975));t=Vector((s*.521,.014,1.856));d=(t-b).normalized();u=Vector((d.z,0,-d.x)).normalized()
        vs=[];fs=[];rows=20;cols=16
        for i in range(rows):
            f=i/(rows-1);c=b.lerp(t,f);c.y-=.048*math.sin(math.pi*f);w=.074*math.sin(math.pi*f)**.7+.001
            for j in range(cols):a=j*math.tau/cols;vs.append(c+u*w*math.cos(a)+Vector((0,.017*math.sin(a),0)))
            if i:
                for j in range(cols):fs.append(((i-1)*cols+j,(i-1)*cols+(j+1)%cols,i*cols+(j+1)%cols,i*cols+j))
        mesh('Sheep / soft pendulous ear',vs,fs,M['fur'])
        vs=[];fs=[]
        for i in range(18):
            f=.10+.80*i/17;c=b.lerp(t,f);c.y-=.048*math.sin(math.pi*f)+.021;w=.050*math.sin(math.pi*f)**.7
            vs.extend([c-u*w,c+u*w])
            if i:fs.append(((i-1)*2,(i-1)*2+1,i*2+1,i*2))
        mesh('Sheep / pink ear concha',vs,fs,M['inner'])
        ps=[];rs=[];colors=[]
        for i in range(145):
            f=i/144;a=math.pi-math.tau*1.49*f;r=.206*(1-.955*f)
            # Side-oriented spiral starts inside the back of the skull, rises
            # over it, and curls inward. There is no visible cut tube root.
            ps.append((s*(.382+.80*r*math.cos(a)),-.035-.60*r*math.cos(a),2.112+r*math.sin(a)))
            groove=(.5+.5*math.cos(f*math.tau*18))**8
            tip=math.sqrt(max(.001,1-((f-.93)/.07)**2)) if f>.93 else 1
            rs.append((.079*(1-.78*f)+.012)*(1-.028*groove)*tip)
            colors.append((.48*(1-.42*groove),.225*(1-.45*groove),.063*(1-.43*groove),1))
        tube('Sheep / ridged coiled ram horn',ps,rs,M['gold'],14,colors)
    # Short spiraling wool locks sit around the face, never on the eye aperture.
    for row,(z,r,n) in enumerate(((2.205,.235,15),(2.295,.168,12),(2.354,.075,7),(2.067,.302,17),(1.915,.310,17),(1.800,.258,14),(2.140,.28,17),(2.000,.32,17),(1.860,.28,15))):
        for i in range(n):
            a=(i+.22*(row%2))*math.tau/n
            if row>=3 and math.sin(a)<-.32:continue
            cz=z+.009*math.sin(i*2.1+row);latitude=(cz-2.035)/.333;ring=math.sqrt(max(.0001,1-latitude*latitude))
            cx=.329*ring*math.cos(a);cy=.09+.277*ring*math.sin(a)
            normal=Vector((ring*math.cos(a)/.329,ring*math.sin(a)/.277,latitude/.333)).normalized()
            u=normal.cross(Vector((0,0,1))).normalized();v=normal.cross(u).normalized()
            radius=.034+(i%3)*.003
            ps=[];rs=[]
            for k in range(20):
                f=k/19;ang=f*math.tau*1.12;rr=radius*(1-.84*f)
                p=Vector((cx,cy,cz))+u*math.cos(ang)*rr+v*math.sin(ang)*rr+normal*(.009+.015*f)
                ps.append(p);rs.append(.0185*(1-.42*f))
            tube('Sheep / sculpted spiral wool curl',ps,rs,M['wool'],6)
    # The cheek mask is framed with plush short wool, including the lower jaw.
    # Offset, overlapping locks create a soft silhouette instead of a bare face
    # under a regular crown of decoration.
    cheek_locks=[(.286,2.027,.028),(.323,1.998,.031),(.343,1.955,.033),
                 (.351,1.910,.031),(.348,1.866,.034),(.329,1.821,.033),
                 (.302,1.781,.033),(.263,1.749,.029),(.282,1.843,.023),
                 (.308,1.891,.024),(.307,1.936,.023),(.239,1.722,.025)]
    for side in (-1,1):
        for j,(x,z,radius) in enumerate(cheek_locks):
            x*=side;cy=min(front(x,z)-.020,-.054)
            ps=[];rs=[]
            for i in range(23):
                f=i/22;a=side*(f*math.tau*1.11+j*.72);r=radius*(1-.80*f)
                ps.append((x+r*math.cos(a),cy-.012*math.sin(math.pi*f)-.010*f,z+r*.88*math.sin(a)))
                rs.append((.018+.002*(j%3))*(1-.31*f))
            tube('Sheep / soft cheek and jaw wool lock',ps,rs,M['wool'],7)
    # Forelock curls, kept above the eyebrows and between the amber goggles.
    for x,z in ((-.075,2.067),(.002,2.052),(.075,2.060)):
        ps=[];rs=[]
        for i in range(34):
            t=i/33;a=t*math.tau*1.15;r=.027*(1-.84*t)
            xx=x+r*math.cos(a);zz=z+r*math.sin(a)
            ps.append((xx,front(xx,zz)-.025-.007*t,zz));rs.append(.011*(1-.45*t))
        tube('Sheep / fine curled forelock',ps,rs,M['wool'],7)
    visor(False)

def remove_old_head(root):
    removed=0
    for obj in [o for o in root.children_recursive if o.type=='MESH' and o.name.startswith('body_')]:
        bm=bmesh.new();bm.from_mesh(obj.data);seen=set();erase=[]
        for v in bm.verts:
            if v in seen:continue
            stack=[v];seen.add(v);component=[]
            while stack:
                p=stack.pop();component.append(p)
                for edge in p.link_edges:
                    q=edge.other_vert(p)
                    if q not in seen:seen.add(q);stack.append(q)
            minz=min(p.co.z for p in component);maxz=max(p.co.z for p in component)
            if (minz>1.325 and maxz>1.49) or (obj.name=='body_skin' and minz>1.25 and maxz>1.49):erase.extend(component)
        removed+=len(erase);bmesh.ops.delete(bm,geom=erase,context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    print('REMOVED OLD HEAD VERTS',removed,flush=True)


def closed_racing_collar():
    # Close the deep V of the original suit around the new short neck. The
    # yoke fits behind the existing cyan lapels and leaves only a small throat.
    vs=[];fs=[];n=40
    for i,(z,rx,ry,cy) in enumerate(((1.385,.116,.097,.060),(1.535,.120,.112,.065),(1.650,.106,.108,.078))):
        for j in range(n):
            a=j*math.tau/n;vs.append((rx*math.cos(a),cy+ry*math.sin(a),z))
            if i:fs.append(((i-1)*n+j,(i-1)*n+(j+1)%n,i*n+(j+1)%n,i*n+j))
    mesh('Suit / closed charcoal high collar',vs,fs,M['collar'])
    tube('Suit / short silver collar zipper',[(-.004,-.040,1.390),(-.004,-.050,1.535),(-.004,-.033,1.637)],.0038,M['zipper'],8)
    tube('Suit / zipper pull',[(-.004,-.037,1.624),(-.004,-.047,1.603)],[.007,.005],M['zipper'],8)

def setup_materials():
    global M
    fur=(.86,.87,.89) if KIND=='rabbit' else (.91,.79,.64)
    M={
        'fur':material('ivory velvet' if KIND=='rabbit' else 'warm cream skin',fur,rough=.66),
        'colorfur':material('surface color',(1,1,1),rough=.66,vertex=True),
        'sclera':material('warm sclera',(.94,.92,.86),rough=.23),
        'iris':material('iris radial color',(1,1,1),rough=.34,vertex=True),
        'black':material('lash charcoal',(.017,.008,.013),rough=.4),
        'brow':material('soft brow',(.065,.031,.035) if KIND=='rabbit' else (.11,.046,.017),rough=.62),
        'rose':material('pink waterline',(.54,.25,.27),rough=.48),
        'nose':material('rose nose',(.61,.26,.29) if KIND=='rabbit' else (.62,.22,.20),rough=.4),
        'mouth':material('smile crease',(.14,.055,.057),rough=.55),
        'white':material('reflected light',(.99,.98,.95),rough=.2),
        'inner':material('velvet ear interior',(.68,.31,.34) if KIND=='rabbit' else (.72,.30,.24),rough=.64),
        'frame':material('sports graphite',(.012,.014,.023),metal=.35,rough=.3),
        'lens':material('sports mirrored optic',(1,1,1),metal=.85,rough=.16,vertex=True),
        'gold':material('ridged horn gold',(1,1,1),metal=.62,rough=.34,vertex=True),
        'wool':material('cream wool',(.91,.82,.71),rough=.66),
        'collar':material('closed charcoal inner collar',(.016,.026,.038),rough=.55),
        'zipper':material('silver zip teeth',(.22,.28,.31),metal=.70,rough=.32),
    }
    M['iris'].node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.18
    # A small tiled tangent-space micro-fur map is embedded in GLB as well as
    # rendered in Blender, so the reviewed surface is the actual runtime surface.
    n=256;v,u=np.mgrid[0:n,0:n].astype(np.float32)/n
    nx=.105*np.sin(math.tau*(38*u+.20*np.sin(math.tau*3*v)))+.020*np.sin(math.tau*(71*u+13*v))
    ny=.025*np.sin(math.tau*(11*v+9*u));nz=np.sqrt(1-nx*nx-ny*ny)
    pixels=np.stack(((nx+1)*.5,(ny+1)*.5,(nz+1)*.5,np.ones_like(nx)),axis=-1)
    image=bpy.data.images.new('Fur / fine directional micro-normal',width=n,height=n,alpha=True)
    image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels.reshape(-1));image.pack()
    for key in ('fur','colorfur','inner','wool'):
        mat=M[key];tree=mat.node_tree;bs=tree.nodes.get('Principled BSDF')
        tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
        normal=tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.34 if key=='inner' else .48
        tree.links.new(tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
        bs.inputs['Specular IOR Level'].default_value=.22;bs.inputs['Sheen Weight'].default_value=.20

def join_head(root):
    bymat={}
    for o in HEAD:
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH')
        for v in o.data.vertices:v.co.z-=.26
        if not o.data.uv_layers:o.data.uv_layers.new(name='SurfaceUV')
        uv=o.data.uv_layers.active
        for loop in o.data.loops:
            co=o.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(co.x*8,co.z*8)
        bymat.setdefault(o.data.materials[0].name,[]).append(o)
    group=bpy.data.objects.new('driver_head_v2',None);bpy.context.scene.collection.objects.link(group);group.parent=root
    for name,objects in bymat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.parent=group
    root['faceVersion']='v2 custom surface / review pending'
    return group

def point_at(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()

def render_review(kind):
    scene=bpy.context.scene
    for o in list(scene.objects):
        if o.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
    world=bpy.data.worlds.new('Face review / neutral studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.42,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
    for name,loc,power,col,size in [('key',(-2.5,-4,5),220,(1,.94,.86),3),('fill',(3,-3,2.4),150,(.80,.9,1),3),('rim',(0,3,4),270,(.84,.93,1),3)]:
        data=bpy.data.lights.new('Review '+name,'AREA');data.energy=power;data.color=col;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=loc;point_at(obj,(0,0,1.95))
    data=bpy.data.cameras.new('Face review camera');cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam);data.type='ORTHO';scene.camera=cam
    scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
    scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=False
    scene.render.threads_mode='FIXED';scene.render.threads=6;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=0
    scene.compositing_node_group=None
    angles=[('front',(0,-6,1.71),1.06),('side',(-6,0,1.71),1.10),('threequarter',(-4,-6,1.90),1.22)]
    if '--front-only' in sys.argv:angles=angles[:1]
    for view,loc,scale in angles:
        cam.location=loc;point_at(cam,(0,-.03,1.71));data.ortho_scale=scale
        scene.render.filepath=str(REVIEW/(kind+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    cam.location=(0,-7,1.85);point_at(cam,(0,0,1.52));data.ortho_scale=3.65
    scene.render.filepath=str(REVIEW/(kind+'-full-front.png'));bpy.ops.render.render(write_still=True)
    # Store a usable full-vehicle camera in the editable scene.
    cam.location=(-4.5,-7,4.1);point_at(cam,(0,-.10,1.44));data.ortho_scale=4.3
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.cycles.samples=20;scene.render.film_transparent=True
    scene.render.filepath=str(ROOT/'public/models'/(kind+'.png'));bpy.ops.render.render(write_still=True)

def main():
    global HEAD,KIND
    for kind in KINDS:
        KIND=kind;HEAD=[]
        if '--render-only' in sys.argv:
            bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender'/(kind+'.blend')))
            render_review(kind)
            continue
        for sub,suffix in [('assets/blender','.blend'),('public/models','.glb'),('public/models','.png')]:
            src=ROOT/sub/(kind+suffix);dst=BACK/(kind+suffix)
            if not dst.exists():shutil.copy2(src,dst)
        bpy.ops.wm.open_mainfile(filepath=str(BACK/(kind+'.blend')))
        root=bpy.data.objects['kart_'+kind];remove_old_head(root);setup_materials()
        tube('Head / tapered soft neck',[(0,.095,1.45),(0,.075,1.68)],[.082,.098],M['fur'],32)
        head=head_surface();eyes(head);nose_mouth()
        if kind=='rabbit':rabbit_details()
        else:sheep_details()
        closed_racing_collar()
        join_head(root)
        bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
        for o in root.children_recursive:o.select_set(True)
        path=ROOT/'public/models'/(kind+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
        tris=0;meshes=0
        for o in root.children_recursive:
            if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles);meshes+=1
        metrics=dict(character=kind,face_version='v2-review-pending',triangles=tris,mesh_count=meshes,bytes=path.stat().st_size,reference=kind+'-turnaround.png')
        (REVIEW/(kind+'-metrics.json')).write_text(json.dumps(metrics,indent=2));print('FACE EXPORT',json.dumps(metrics),flush=True)
        render_review(kind)
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender'/(kind+'.blend')),compress=True)
    print('FACE REVIEW READY',flush=True)

main()
