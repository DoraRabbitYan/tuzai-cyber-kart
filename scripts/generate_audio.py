"""Original, deterministic PCM sound assets. No recordings or external services."""
import math, wave, random, array
from pathlib import Path
RATE=22050
OUT=Path(__file__).resolve().parents[1]/'public'/'audio'
OUT.mkdir(parents=True,exist_ok=True)
rng=random.Random(42)
def write(name,samples):
    peak=max(max(abs(v) for v in samples),.001)
    data=array.array('h',(int(max(-1,min(1,v/peak*.74))*32767) for v in samples))
    with wave.open(str(OUT/(name+'.wav')),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(data.tobytes())
def sfx(name,duration,notes,noise=0):
    data=[]
    for i in range(int(RATE*duration)):
        t=i/RATE;p=t/duration
        env=min(t/.008,1)*(1-p)**2
        tone=sum(math.sin(2*math.pi*(frequency*t+sweep*t*t))*strength for frequency,sweep,strength in notes)
        data.append((tone+noise*rng.uniform(-1,1))*env)
    write(name,data)
sfx('select',.10,[(720,200,.6),(1440,0,.15)])
sfx('confirm',.24,[(520,850,.65),(1040,1200,.2)])
sfx('pause',.21,[(530,-650,.5)])
sfx('count',.18,[(660,0,.7)])
sfx('go',.6,[(880,0,.6),(1320,0,.3),(1760,0,.15)])
sfx('pickup',.33,[(1100,2100,.5),(1650,2100,.25)])
sfx('hit',.32,[(75,-90,.65),(155,-140,.3)],.7)
sfx('boost',1.2,[(80,300,.4),(190,700,.25)],.35)
sfx('lap',.7,[(523.25,200,.4),(659.25,200,.35),(783.99,200,.3)])
sfx('finish',2.1,[(523.25,0,.45),(659.25,0,.4),(783.99,0,.35),(1046.5,0,.2)])
for name in ['ambience','skid']:
    duration=4;data=[];smooth=0
    for i in range(RATE*duration):
        t=i/RATE;white=rng.uniform(-1,1);smooth=smooth*.94+white*.06
        value=smooth*.6+math.sin(2*math.pi*55*t)*.035 if name=='ambience' else white*.18+math.sin(2*math.pi*1400*t)*.045
        edge=min(1,t/.025,(duration-t)/.025)
        data.append(value*edge)
    write(name,data)
# 8 bars at 120 BPM: bass, arpeggio, kick and soft percussion. Loop is sample-exact.
duration=16;data=[0.]*(RATE*duration)
def add_note(start,duration,freq,level,kind='sine'):
    for i in range(int(duration*RATE)):
        t=i/RATE;env=min(t/.006,1)*math.exp(-t/(duration*.27))
        if kind=='kick':v=math.sin(2*math.pi*(48*t+6*(1-math.exp(-t*35))))
        elif kind=='hat':v=rng.uniform(-1,1)
        else:v=math.sin(2*math.pi*freq*t)+.2*math.sin(2*math.pi*freq*2*t)
        index=int(start*RATE)+i
        if index<len(data):data[index]+=v*env*level
chords=[[130.81,164.81,196],[103.83,130.81,155.56],[116.54,146.83,174.61],[98,123.47,146.83]]
for beat in range(32):
    start=beat*.5;chord=chords[(beat//8)%4]
    add_note(start,.28,48,.55,'kick');add_note(start+.25,.065,0,.095,'hat')
    if beat%2:add_note(start,.16,0,.14,'hat')
    add_note(start,.38,chord[0]/2,.22)
    for step in range(2):add_note(start+step*.25,.22,chord[(beat*2+step)%3]*2,.15)
write('music',data)
print(f'Generated {len(list(OUT.glob("*.wav")))} original WAV assets in {OUT}')
