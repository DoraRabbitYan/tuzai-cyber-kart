"""Validate delivered PCM assets; browser tests separately exercise mixing/lifecycle."""
import array, json, math, wave
from pathlib import Path

root=Path(__file__).resolve().parents[1]
(root/'artifacts').mkdir(parents=True,exist_ok=True)
expected={'confirm','select','pause','count','go','pickup','hit','boost','lap','finish','ambience','music','skid'}
files=list((root/'public/audio').glob('*.wav'))
assert {p.stem for p in files}==expected
rows=[]
for file in sorted(files):
    with wave.open(str(file)) as stream:
        rate=stream.getframerate(); channels=stream.getnchannels(); width=stream.getsampwidth()
        assert rate==22050 and channels==1 and width==2
        data=array.array('h',stream.readframes(stream.getnframes()))
    peak=max(abs(x) for x in data)/32768
    rms=math.sqrt(sum(x*x for x in data)/len(data))/32768
    boundary=abs(data[-1]-data[0])/32768
    assert .1<peak<.95 and rms>.005
    if file.stem in {'ambience','music','skid'}:assert boundary<.005
    rows.append({'name':file.stem,'seconds':len(data)/rate,'sampleRate':rate,'channels':channels,'peak':round(peak,4),'rms':round(rms,4),'clippedSamples':sum(abs(x)>=32767 for x in data),'loopBoundaryDelta':round(boundary,6),'bytes':file.stat().st_size})
(root/'artifacts/audio-validation.json').write_text(json.dumps({'assets':rows,'note':'Original locally synthesized audio. PCM/loop checks and browser playback tests; no external provider dependency.'},indent=2))
print(f'PASS: {len(rows)} WAV files, no clipping, loop boundaries validated')
