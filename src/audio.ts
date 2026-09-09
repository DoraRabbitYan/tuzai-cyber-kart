type Sound = 'confirm'|'select'|'pause'|'count'|'go'|'pickup'|'hit'|'boost'|'lap'|'finish';
export class GameAudio {
  context:AudioContext|null=null;
  private master:GainNode|null=null;
  private engineGain:GainNode|null=null;
  private engine:OscillatorNode[]=[];
  private skid:AudioBufferSourceNode|null=null;
  private skidGain:GainNode|null=null;
  private loops:AudioBufferSourceNode[]=[];
  private loopGains:GainNode[]=[];
  private buffers=new Map<string,AudioBuffer>();
  private loading:Promise<void>|null=null;
  private muted=false;
  private volume=.65;
  private active=false;
  private counts:Record<string,number>={};
  errors:string[]=[];
  async unlock(){
    if(!this.context){
      const AudioCtor=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
      this.context=new AudioCtor();this.master=this.context.createGain();
      const compressor=this.context.createDynamicsCompressor();
      compressor.threshold.value=-14;compressor.ratio.value=5;compressor.attack.value=.003;
      this.master.connect(compressor).connect(this.context.destination);
      this.setVolume(this.volume);this.setMuted(this.muted);
      const ctx=this.context;
      this.engineGain=ctx.createGain();this.engineGain.gain.value=0;
      const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=900;
      this.engineGain.connect(lowpass).connect(this.master);
      for(const ratio of [1,2.008]){const oscillator=ctx.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=45*ratio;oscillator.connect(this.engineGain);oscillator.start();this.engine.push(oscillator);}
      this.loading=Promise.all(['confirm','select','pause','count','go','pickup','hit','boost','lap','finish','ambience','music','skid'].map(async id=>{
        try{const response=await fetch(`${import.meta.env.BASE_URL}audio/${id}.wav`,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error(`${id}: ${response.status}`);this.buffers.set(id,await ctx.decodeAudioData(await response.arrayBuffer()));}
        catch(error){this.errors.push(String(error));console.warn('Audio asset:',error);}
      })).then(()=>{});
    }
    if(this.context.state==='suspended')await this.context.resume();
    await this.loading;
  }
  setVolume(volume:number){this.volume=volume;if(this.master)this.master.gain.value=this.muted?0:volume*.7;}
  setMuted(muted:boolean){this.muted=muted;this.setVolume(this.volume);}
  play(id:Sound){
    const ctx=this.context,buffer=this.buffers.get(id);if(!ctx||!buffer||ctx.state!=='running')return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
    gain.gain.value=['select','confirm','pause'].includes(id)?.28:.55;
    source.connect(gain).connect(this.master!);source.start();
    source.onended=()=>{source.disconnect();gain.disconnect();};
    this.counts[id]=(this.counts[id]||0)+1;
  }
  start(){
    if(!this.context||this.active)return;
    this.active=true;
    for(const [id,volume] of [['ambience',.20],['music',.20]] as const){
      const buffer=this.buffers.get(id);if(!buffer)continue;
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=buffer;source.loop=true;gain.gain.value=volume;source.connect(gain).connect(this.master!);source.start();this.loops.push(source);this.loopGains.push(gain);
    }
    const buffer=this.buffers.get('skid');
    if(buffer){this.skid=this.context.createBufferSource();this.skid.buffer=buffer;this.skid.loop=true;this.skidGain=this.context.createGain();this.skidGain.gain.value=0;this.skid.connect(this.skidGain).connect(this.master!);this.skid.start();}
  }
  update(speed:number,drifting:boolean,boosting:boolean){
    if(!this.context)return;const now=this.context.currentTime;
    this.engine.forEach((osc,index)=>osc.frequency.setTargetAtTime((38+speed*2.5)*(index?2.008:1),now,.08));
    this.engineGain?.gain.setTargetAtTime(this.active?.035+speed*.0008:0,now,.08);
    this.skidGain?.gain.setTargetAtTime(this.active&&drifting?.10:0,now,.06);
    if(this.loopGains[1])this.loopGains[1].gain.setTargetAtTime(boosting?.27:.2,now,.2);
  }
  stop(){
    this.active=false;
    for(const source of this.loops){source.stop();source.disconnect();}this.loops=[];
    for(const gain of this.loopGains)gain.disconnect();this.loopGains=[];
    if(this.skid){this.skid.stop();this.skid.disconnect();this.skid=null;this.skidGain?.disconnect();this.skidGain=null;}
    this.engineGain?.gain.setTargetAtTime(0,this.context!.currentTime,.05);
  }
  diagnostics(){return {state:this.context?.state??'locked',active:this.active,loops:this.loops.length,loaded:this.buffers.size,events:{...this.counts},muted:this.muted,volume:this.volume,errors:this.errors};}
}
