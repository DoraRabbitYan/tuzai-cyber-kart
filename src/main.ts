import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GameUI } from './ui';
import { TrackWorld } from './world';
import { GameAudio } from './audio';
import { CHARACTERS, type CharacterId, type TrackId, type RaceView, type InputState } from './data';
import { EMPTY_INPUT, makeCar, drive, driveAI, wrapAngle, type CarState } from './simulation';

const LAPS=3, FIXED_DT=1/60;
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
const audio=new GameAudio();
const input=EMPTY_INPUT();
const keyboardDown=new Set<string>();
const touchInput=EMPTY_INPUT();
const models=new Map<CharacterId,THREE.Group>();
const lodModels=new Map<CharacterId,THREE.Group>();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.15,1600);
let renderer:THREE.WebGLRenderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}
catch{document.querySelector('#ui')!.innerHTML='<div style="padding:10%;color:white;background:#07101a;font:20px sans-serif">此浏览器未能启动 WebGL。请开启硬件加速后刷新页面，或使用支持 WebGL 2 的浏览器。</div>';throw Error('WebGL initialization failed');}
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.info.autoReset=false;
const pmrem=new THREE.PMREMGenerator(renderer);
const environment=new RoomEnvironment();
const envTarget=pmrem.fromScene(environment,.04);
scene.environment=envTarget.texture;scene.environmentIntensity=.6;
environment.dispose();pmrem.dispose();
const hemi=new THREE.HemisphereLight(0xbbeeff,0x272037,1.15);scene.add(hemi);
const keyLight=new THREE.DirectionalLight(0xd8eaff,1.7);keyLight.castShadow=true;
keyLight.shadow.camera.left=-22;keyLight.shadow.camera.right=22;keyLight.shadow.camera.top=22;keyLight.shadow.camera.bottom=-22;
keyLight.shadow.camera.near=1;keyLight.shadow.camera.far=120;keyLight.shadow.bias=-.0005;keyLight.shadow.normalBias=.05;
scene.add(keyLight,keyLight.target);
const rim=new THREE.DirectionalLight(0xfc6cc9,.55);rim.position.set(-30,15,-20);scene.add(rim);
const postTarget=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:Math.min(2,renderer.capabilities.maxSamples)});
const composer=new EffectComposer(renderer,postTarget);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.18,.22,1.7);
composer.addPass(bloom);composer.addPass(new OutputPass());
let world:TrackWorld;
let cars:CarState[]=[];
let carObjects:THREE.Group[]=[];
let carVisuals:Array<{high:THREE.Group;low:THREE.Group}>=[];
let wheelNodes:THREE.Object3D[][]=[];
let shadowPlanes:THREE.Mesh[]=[];
let bestRecords:Record<string,number>={};
try{bestRecords=JSON.parse(localStorage.getItem('cyber-kart-best-v1')||'{}');}catch{/* Local records are optional. */}
const view:RaceView={
  phase:'loading',character:'rabbit',track:'city',loading:0,loadingText:'正在准备赛道与车手…',
  speed:0,lap:1,laps:LAPS,position:4,time:0,best:null,energy:25,drift:0,boosting:false,
  countdown:3,muted:false,volume:.65,quality:'auto',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,autoAccelerate:false,
  message:'',messageKind:'normal',standings:[],minimap:[],markers:[],resultPosition:1,newBest:false,finishTimes:[],
};
let raceTime=0,countdownTime=3.4,menuTime=0,animationTime=0,frame=0;
let messageUntil=0,previousLap=1,screenshotPaused=false,accumulator=0,lastTimestamp=0;
let actualDpr=1,usePost=true,ready=false;
let seedValue=42,frameTimes:number[]=[];
let shake=0,lastPad=-1;
const pickupCooldowns=new Map<number,number>();
const cameraDesired=new THREE.Vector3(),lookDesired=new THREE.Vector3(),cameraLook=new THREE.Vector3();
const dummy=new THREE.Object3D();
const particleGeometry=new THREE.OctahedronGeometry(.10,0);
const particles=new THREE.InstancedMesh(particleGeometry,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),100);
particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;scene.add(particles);
const particleData=Array.from({length:100},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),life:0,max:1,color:new THREE.Color()}));
let particleCursor=0;
function random(){seedValue=(Math.imul(seedValue,1664525)+1013904223)>>>0;return seedValue/4294967296;}

const shadowTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,8,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(.65,'rgba(0,0,0,.35)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const shadowGeometry=new THREE.PlaneGeometry(4,5);
const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});

function clearInput(){keyboardDown.clear();Object.assign(touchInput,EMPTY_INPUT());Object.assign(input,EMPTY_INPUT());}
function mergeInput(){
  Object.assign(input,touchInput);
  for(const code of keyboardDown){const action=keyMap[code];if(action)input[action]=true;}
}
function notify(text:string,kind:RaceView['messageKind']='normal',duration=1.7){view.message=text;view.messageKind=kind;messageUntil=animationTime+duration;}
function applyQuality(){
  const mobile=matchMedia('(pointer: coarse)').matches||innerWidth<700;
  const low=view.quality==='low'||(view.quality==='auto'&&mobile);
  usePost=!low;
  keyLight.castShadow=!low;
  actualDpr=Math.min(devicePixelRatio,low?1.25:1.6);
  renderer.setPixelRatio(actualDpr);renderer.setSize(innerWidth,innerHeight,false);
  composer.setPixelRatio(actualDpr);composer.setSize(innerWidth,innerHeight);
  const mapSize=low?1024:2048;
  if(keyLight.shadow.mapSize.x!==mapSize){keyLight.shadow.mapSize.set(mapSize,mapSize);keyLight.shadow.map?.dispose();keyLight.shadow.map=null;}
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
}

function setTrack(id:TrackId){
  if(world){scene.remove(world.root);world.dispose();}
  world=new TrackWorld(id);scene.add(world.root);view.track=id;
  scene.background=new THREE.Color(world.theme.background);
  scene.fog=new THREE.Fog(world.theme.fog,120,id==='dock'?850:570);
  hemi.color.setHex(world.theme.ambient);keyLight.color.setHex(world.theme.sun);
  hemi.intensity=id==='city'?1.15:id==='canyon'?1.35:1.1;
  keyLight.intensity=id==='canyon'?2.0:1.7;
  rim.color.setHex(id==='canyon'?0xff9955:0xef68d8);
  view.minimap=Array.from({length:180},(_,i)=>{const p=world.sample(i/179*world.length).position;return {x:p.x,y:p.z};});
  view.best=bestRecords[id]??null;pickupCooldowns.clear();lastPad=-1;
}
function setupCars(){
  for(const car of carObjects)scene.remove(car);
  for(const shadow of shadowPlanes)scene.remove(shadow);
  const ids=[view.character,...CHARACTERS.map(c=>c.id).filter(id=>id!==view.character)];
  cars=ids.map((id,i)=>makeCar(id,[ -14,-8,-8,-14 ][i],i===0||i===1?-2.5:2.5));
  carVisuals=[];
  carObjects=ids.map((id,index)=>{
    const root=new THREE.Group(),high=models.get(id)!.clone(true),low=lodModels.get(id)!.clone(true);
    high.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=index===0;object.receiveShadow=false;}});
    root.add(high,low);low.visible=false;carVisuals.push({high,low});scene.add(root);return root;
  });
  wheelNodes=carObjects.map(root=>{const nodes:THREE.Object3D[]=[];root.traverse(object=>{if(/^wheel_(fl|fr|rl|rr)$/.test(object.name))nodes.push(object);});return nodes;});
  shadowPlanes=cars.map(()=>{const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;scene.add(shadow);return shadow;});
  updateObjects(0);updateCamera(1,true);
}
function resetRace(){
  clearInput();audio.stop();raceTime=0;view.time=0;view.lap=1;previousLap=1;
  view.position=4;view.resultPosition=1;view.newBest=false;view.finishTimes=[];
  view.message='';pickupCooldowns.clear();lastPad=-1;shake=0;accumulator=0;
  for(const item of world.pickups)item.object.visible=true;
  for(const p of particleData)p.life=0;
  setupCars();
}
function startRace(){
  if(!ready||!['menu','paused','results'].includes(view.phase))return;
  // The audio context must be constructed directly from this user gesture.
  const unlocking=audio.unlock();
  resetRace();view.phase='countdown';countdownTime=3.4;view.countdown=3;
  updateCamera(1,true);
  void unlocking.then(()=>{
    if(view.phase==='countdown'||view.phase==='racing'){audio.play('confirm');audio.play('count');audio.start();}
  }).catch(()=>notify('声音暂不可用，比赛继续','warning',3));
}
function pause(){if(view.phase!=='racing'&&view.phase!=='countdown')return;pausedPhase=view.phase;view.phase='paused';clearInput();audio.play('pause');audio.stop();}
let pausedPhase:'countdown'|'racing'='racing';
function resume(){if(view.phase!=='paused')return;view.phase=pausedPhase;clearInput();void audio.unlock().then(()=>{if(view.phase==='racing'||view.phase==='countdown')audio.start();}).catch(()=>notify('声音暂不可用，比赛继续','warning',3));}
function toMenu(){if(!ready)return;clearInput();audio.stop();view.phase='menu';view.message='';resetRace();}
const ui=new GameUI({
  selectCharacter(id){if(view.phase!=='menu')return;view.character=id;setupCars();audio.play('select');},
  selectTrack(id){if(view.phase!=='menu')return;setTrack(id);setupCars();audio.play('select');},
  start:()=>void startRace(),pause,resume,retry:()=>void startRace(),menu:toMenu,
  mute(){view.muted=!view.muted;audio.setMuted(view.muted);},
  setVolume(value){view.volume=value;audio.setVolume(value);},
  setQuality(value){view.quality=value;applyQuality();},
  setReducedMotion(value){view.reducedMotion=value;},
  setAutoAccelerate(value){view.autoAccelerate=value;},
  input(key,pressed){touchInput[key]=pressed;mergeInput();},
  fullscreen(){if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen?.().catch(()=>notify('浏览器暂不支持全屏'));},
});
ui.update(view);applyQuality();

const keyMap:Record<string,keyof InputState>={ArrowUp:'throttle',KeyW:'throttle',ArrowDown:'brake',KeyS:'brake',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'drift',ShiftLeft:'boost',ShiftRight:'boost',KeyN:'boost'};
addEventListener('keydown',event=>{
  if((event.target as HTMLElement)?.matches('input,select,textarea'))return;
  if(event.code==='Escape'){event.preventDefault();if(event.repeat)return;if(view.phase==='paused')resume();else pause();return;}
  if(event.code==='KeyM'&&!event.repeat){view.muted=!view.muted;audio.setMuted(view.muted);return;}
  if(keyMap[event.code]&&(view.phase==='racing'||view.phase==='countdown')){event.preventDefault();keyboardDown.add(event.code);mergeInput();}
});
addEventListener('keyup',event=>{if(keyMap[event.code]){keyboardDown.delete(event.code);mergeInput();}});
addEventListener('blur',()=>{clearInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
addEventListener('resize',()=>{applyQuality();if(ready)updateCamera(1,true);});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();pause();notify('图形上下文暂时中断，请刷新恢复', 'warning',100);});

function emit(position:THREE.Vector3,color:number,count=12,power=3){
  for(let i=0;i<count;i++){
    const p=particleData[particleCursor++%particleData.length];p.position.copy(position);
    p.velocity.set((random()-.5)*power,random()*power*.8,(random()-.5)*power);
    p.max=p.life=.25+random()*.4;p.color.setHex(color);
  }
}
function drivingEvent(event:string){
  const p=world.sample(cars[0].distance,cars[0].lateral).position.clone().add(new THREE.Vector3(0,.5,0));
  if(event==='hit'){audio.play('hit');shake=.24;emit(p,0xffa141,16,5);notify('擦碰护栏 · 提前入弯', 'warning',1);}
  if(event==='boost'){audio.play('boost');emit(p,0x55f5ff,24,4);notify('氮气加速', 'boost',1.25);}
  if(event==='drift-release'){audio.play('boost');emit(p,0xffbc50,20,4);notify('漂移小喷', 'boost',1.0);}
}
function finishRace(){
  const player=cars[0];player.finished??=raceTime;raceTime=player.finished;
  const order=[...cars].sort((a,b)=>(a.finished??Infinity)-(b.finished??Infinity)||b.distance-a.distance);
  view.resultPosition=order.indexOf(player)+1;
  view.finishTimes=order.map(car=>({name:CHARACTERS.find(c=>c.id===car.id)!.name,time:car.finished,player:car===player}));
  view.newBest=!bestRecords[view.track]||raceTime<bestRecords[view.track];
  if(view.newBest){bestRecords[view.track]=raceTime;view.best=raceTime;try{localStorage.setItem('cyber-kart-best-v1',JSON.stringify(bestRecords));}catch{/* Records can be disabled in private browsing. */}}
  for(const car of cars){car.speed=0;car.boostTime=0;car.drift=0;car.driftSide=0;}
  view.phase='results';clearInput();audio.stop();audio.play('finish');
  emit(carObjects[0].position,0x66ffff,55,9);
}

function step(dt:number){
  if(view.phase==='countdown'){
    countdownTime-=dt;
    const count=Math.ceil(countdownTime-.4);
    if(count!==view.countdown){view.countdown=Math.max(0,count);audio.play(count>0?'count':'go');}
    if(countdownTime<=0){view.phase='racing';notify('抢占内线 · 出弯加速','normal',2.3);}
    return;
  }
  if(view.phase!=='racing')return;
  raceTime+=dt;
  const player=cars[0],course={length:world.length,width:world.width,yaw:(distance:number)=>world.sample(distance).yaw};
  const playerPreviousDistance=player.distance;
  const effective=view.autoAccelerate?{...input,throttle:true}:input;
  drive(player,effective,course,dt,drivingEvent);
  cars.slice(1).forEach((car,i)=>{
    if(car.finished!==null)return;
    const previousDistance=car.distance;
    driveAI(car,course,dt,raceTime,i);
    if(car.distance>=world.length*LAPS)car.finished=raceTime-dt+dt*(world.length*LAPS-previousDistance)/(car.distance-previousDistance);
    if(car.hitCooldown<=0&&player.hitCooldown<=0&&Math.abs(wrapDistance(car.distance-player.distance))<2.6&&Math.abs(car.lateral-player.lateral)<1.85){
      player.hitCooldown=.7;car.hitCooldown=.7;player.collisions++;
      const side=player.lateral<car.lateral?-1:1;
      player.lateral+=side*.5;car.lateral-=side*.5;player.speed*=.85;car.speed*=.89;
      emit(carObjects[0].position,0xffa45e,12,4);audio.play('hit');shake=.15;notify('车身接触', 'warning',.7);
    }
  });
  const local=((player.distance%world.length)+world.length)%world.length;
  world.boosts.forEach((pad,index)=>{
    const d=Math.abs(wrapDistance(local-pad.distance));
    if(d<pad.length/2&&Math.abs(player.lateral-pad.lateral)<pad.width/2&&player.padCooldown<=0){
      player.boostTime=Math.max(player.boostTime,1.15);player.padCooldown=1.8;lastPad=index;
      audio.play('boost');emit(carObjects[0].position,0xffaa39,18,4);notify('磁能加速带','boost',1.0);
    }
  });
  world.pickups.forEach((item,index)=>{
    const cooldown=pickupCooldowns.get(index)||0;item.object.visible=raceTime>cooldown;
    if(item.object.visible&&Math.abs(wrapDistance(local-item.distance))<2.0&&Math.abs(player.lateral-item.lateral)<1.65){
      pickupCooldowns.set(index,raceTime+8);item.object.visible=false;player.energy=Math.min(100,player.energy+20);player.pickups++;
      emit(item.object.getWorldPosition(new THREE.Vector3()),0xff5ae4,16,3);audio.play('pickup');notify('+20 能量','normal',.85);
    }
  });
  for(const obstacle of world.obstacles){
    if(player.hitCooldown<=0&&Math.abs(wrapDistance(local-obstacle.distance))<2&&Math.abs(player.lateral-obstacle.lateral)<obstacle.width/2+1){
      player.speed*=.54;player.hitCooldown=1;player.collisions++;shake=.30;
      audio.play('hit');emit(carObjects[0].position,0xffa041,20,6);notify('撞击障碍 · 留意警示灯','warning',1.3);
    }
  }
  const lap=Math.max(1,Math.min(LAPS,Math.floor(player.distance/world.length)+1));
  if(lap>previousLap){previousLap=lap;audio.play('lap');notify(lap===LAPS?'最后一圈':'第 '+lap+' 圈','boost',2);}
  if(player.distance>=world.length*LAPS){player.finished=raceTime-dt+dt*(world.length*LAPS-playerPreviousDistance)/(player.distance-playerPreviousDistance);finishRace();}
}
function wrapDistance(value:number){return (value+world.length*1.5)%world.length-world.length/2;}

function updateObjects(dt:number){
  if(!cars.length)return;
  cars.forEach((car,i)=>{
    const pose=world.sample(car.distance,car.lateral),mesh=carObjects[i];
    mesh.visible=i===0||view.phase!=='menu';shadowPlanes[i].visible=mesh.visible;
    mesh.position.copy(pose.position);
    const distant=i>0&&mesh.position.distanceTo(carObjects[0].position)>(usePost?48:12);
    carVisuals[i].high.visible=!distant;carVisuals[i].low.visible=distant;
    const bounce=view.reducedMotion?0:Math.sin(animationTime*(car.speed>.5?20:2)+i)*Math.min(.025,car.speed*.0006);
    mesh.position.y+=.06+bounce;
    mesh.rotation.order='YXZ';
    mesh.rotation.set(-Math.asin(pose.tangent.y),pose.yaw+car.heading+(car.driftSide?car.driftSide*car.drift*.25:0),-car.steer*Math.min(.035,car.speed*.001));
    if(view.phase==='menu'){mesh.rotation.y=pose.yaw+Math.sin(menuTime*.27)*.12;}
    for(const wheel of wheelNodes[i])wheel.rotation.x+=car.speed*dt/.42;
    shadowPlanes[i].position.copy(pose.position).y+=.035;shadowPlanes[i].rotation.z=-pose.yaw;
    if(i===0&&view.phase==='racing'&&car.speed>8&&dt>0){
      if(car.boostTime>0){
        const rear=pose.position.clone().addScaledVector(pose.tangent,-1.7);rear.y+=.6;
        emit(rear,frame%2?0x4de9ff:0xff66e9,2,1.8);
      }else if(car.driftSide&&frame%2===0){
        const rear=pose.position.clone().addScaledVector(pose.tangent,-1.4).addScaledVector(pose.right,-car.driftSide*.9);rear.y+=.12;
        emit(rear,car.drift>.6?0xffc558:0x62deff,2,2.0);
      }
    }
  });
}
function updateParticles(dt:number){
  particleData.forEach((p,i)=>{
    p.life=Math.max(0,p.life-dt);
    if(p.life>0){p.position.addScaledVector(p.velocity,dt);p.velocity.y-=dt*5;dummy.position.copy(p.position);dummy.scale.setScalar(Math.max(.05,p.life/p.max));}
    else{dummy.position.set(0,-1000,0);dummy.scale.setScalar(0);}
    dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);particles.setColorAt(i,p.color);
  });
  particles.instanceMatrix.needsUpdate=true;if(particles.instanceColor)particles.instanceColor.needsUpdate=true;
}
function updateCamera(dt:number,snap=false){
  if(!cars.length)return;
  const car=cars[0],pose=world.sample(car.distance,car.lateral),portrait=innerHeight>innerWidth;
  const menu=view.phase==='menu'||view.phase==='loading';
  if(menu){
    cameraDesired.copy(pose.position).addScaledVector(pose.tangent,portrait?11.5:7.5).addScaledVector(pose.right,portrait?-7:-6.8);cameraDesired.y+=portrait?5:3.5;
    lookDesired.copy(pose.position).y+=1.2;
    // Shift the hero into the open region of the authored lobby UI.
    const cameraRight=new THREE.Vector3().subVectors(lookDesired,cameraDesired).cross(camera.up).normalize();
    lookDesired.addScaledVector(cameraRight,portrait?0:-2.0);
    if(portrait)lookDesired.y-=1.0;
  }else{
    const follow=world.sample(car.distance-7.8,car.lateral*(portrait?1:.85));
    cameraDesired.copy(follow.position).addScaledVector(pose.tangent,portrait?-3.5:-1.8);cameraDesired.y+=portrait?6.7:4.5;
    lookDesired.copy(world.sample(car.distance+(portrait?6:18),car.lateral*(portrait?.85:.6)).position);lookDesired.y+=.7;
  }
  const rate=snap?1:1-Math.exp(-dt*(menu?3:7));
  camera.position.lerp(cameraDesired,rate);cameraLook.lerp(lookDesired,rate);
  if(shake>.001&&!view.reducedMotion){camera.position.x+=Math.sin(animationTime*57)*shake;camera.position.y+=Math.cos(animationTime*63)*shake*.45;}
  camera.lookAt(cameraLook);
  const fov=menu?40:(portrait?64:57)+(car.boostTime>0&&!view.reducedMotion?7:car.speed/43*2);
  camera.fov+=(fov-camera.fov)*(snap?1:1-Math.exp(-dt*4));camera.updateProjectionMatrix();
  keyLight.position.copy(pose.position).add(new THREE.Vector3(-18,35,15));keyLight.target.position.copy(pose.position);
}
function updateView(){
  if(!cars.length)return;const player=cars[0];
  view.speed=Math.round(player.speed*3.6);view.lap=Math.max(1,Math.min(LAPS,Math.floor(player.distance/world.length)+1));
  view.time=raceTime;view.energy=player.energy;view.drift=player.drift;view.boosting=player.boostTime>0;
  view.position=view.phase==='results'?view.resultPosition:1+cars.slice(1).filter(car=>car.distance>player.distance).length;
  view.standings=[...cars].sort((a,b)=>b.distance-a.distance).map(car=>{const c=CHARACTERS.find(c=>c.id===car.id)!;return {id:car.id,name:c.name,color:c.color,progress:car.distance/(world.length*LAPS),time:car.finished};});
  view.markers=cars.map((car,i)=>{const p=world.sample(car.distance).position;return {x:p.x,y:p.z,color:CHARACTERS.find(c=>c.id===car.id)!.color,player:i===0};});
  if(animationTime>messageUntil)view.message='';
}

function render(timestamp:number){
  requestAnimationFrame(render);
  const elapsed=lastTimestamp?(timestamp-lastTimestamp)/1000:0,dt=Math.min(.1,elapsed);lastTimestamp=timestamp;frame++;
  if(elapsed>0){frameTimes.push(elapsed*1000);if(frameTimes.length>180)frameTimes.shift();}
  const frozen=screenshotPaused||view.phase==='paused';
  if(!frozen){
    animationTime+=dt;menuTime+=dt;shake*=Math.exp(-dt*8);
    if(ready){accumulator+=dt;while(accumulator>=FIXED_DT){step(FIXED_DT);accumulator-=FIXED_DT;}}
  }
  if(ready){
    world.update(animationTime,cars[0].distance);
    updateObjects(frozen?0:dt);updateParticles(frozen?0:dt);if(!screenshotPaused)updateCamera(dt);
    updateView();audio.update(cars[0].speed,cars[0].driftSide!==0,cars[0].boostTime>0);
  }
  ui.update(view);renderer.info.reset();
  if(usePost)composer.render();else renderer.render(scene,camera);
}

let assetError:unknown=null;
const readyPromise=(async()=>{
  const loader=new GLTFLoader();
  let loaded=0;
  await Promise.all(CHARACTERS.flatMap(character=>[false,true].map(async lod=>{
    const url=`${import.meta.env.BASE_URL}models/${character.id}${lod?'-lod':''}.glb`;
    const gltf=await loader.loadAsync(url).catch(error=>{if(!lod)throw error;console.warn('远景模型不可用，将使用完整模型',character.id);return null;});
    if(gltf)(lod?lodModels:models).set(character.id,gltf.scene);loaded++;
    if(!assetError){view.loading=loaded/8;view.loadingText=`装配车手资源 ${loaded} / 8`;}
  })));
  for(const character of CHARACTERS)if(!lodModels.has(character.id))lodModels.set(character.id,models.get(character.id)!);
  setTrack('city');ready=true;view.phase='menu';setupCars();
})().catch(error=>{
  assetError=error;view.loadingText='资源加载失败，请刷新重试。'+String(error);console.error('Game asset loading failed:',error);
});
requestAnimationFrame(render);

// Diagnostics and scenario controls are opt-in, never player-facing controls.
if(import.meta.env.DEV||new URLSearchParams(location.search).get('qa')==='1'){
  const diagnostics={
    get renderer(){return {...renderer.info.render,...renderer.info.memory,render:{...renderer.info.render},memory:{...renderer.info.memory}};},
    get state(){return {phase:view.phase,frame,time:raceTime,lap:view.lap,position:view.position,track:view.track,trackLength:world?.length,player:cars[0]?{...cars[0]}:null,cars:cars.map(car=>({...car})),input:{...input},complete:view.phase==='results',lastPad,frames:frame,loadedModels:[...models.keys()],audio:audio.diagnostics(),frameTime:frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length)};},
    get graphics(){return {dpr:actualDpr,postEffects:usePost?'bloom + output':'none',composerStages:usePost?composer.passes.length:0,postSamples:usePost?postTarget.samples:0,shadowLights:keyLight.castShadow?1:0,shadowMap:keyLight.shadow.mapSize.x,quality:view.quality,lodCars:carVisuals.filter(c=>c.low.visible).length};},
    get physics(){return {engine:'arcade-frenet',timestep:FIXED_DT,bodies:4,colliders:4+(world?.obstacles.length??0),sensors:(world?.pickups.length??0)+(world?.boosts.length??0),ccdBodies:0};},
  };
  Object.assign(window,{
    __THREE_GAME_DIAGNOSTICS__:diagnostics,
    __THREE_GAME_TEST_HOOKS__:{
      seed(value:number){seedValue=value>>>0;return {seed:seedValue};},
      async setState(name:string){
        const supported=['menu','active-play','canyon-play','dock-play','drifting','paused','results'];
        if(!supported.includes(name))throw Error(`Unknown test state: ${name}`);
        await readyPromise;if(!ready)throw assetError;screenshotPaused=false;
        setTrack(name==='canyon-play'?'canyon':name==='dock-play'?'dock':'city');
        resetRace();view.phase='racing';raceTime=12;
        const p=cars[0];p.distance=120;p.speed=35;p.energy=65;
        cars.slice(1).forEach((car,i)=>{car.distance=135+i*14;car.speed=33;});
        if(name==='drifting'){p.driftSide=1;p.drift=.75;p.steer=.75;p.heading=.15;emit(world.sample(p.distance).position,0xffb53e,24,4);}
        if(name==='menu')toMenu();
        if(name==='paused'){view.phase='paused';pausedPhase='racing';}
        if(name==='results'){p.distance=world.length*LAPS;raceTime=72.35;cars[1].finished=70.82;finishRace();}
        animationTime=12;menuTime=0;updateObjects(0);updateParticles(0);updateView();updateCamera(1,true);ui.update(view);
        return {state:name};
      },
      setPausedForScreenshot(value:boolean){screenshotPaused=value;accumulator=0;},
      setReducedMotion(value:boolean){view.reducedMotion=value;},
      hideDebugUi(){document.documentElement.dataset.qa='hidden';},
      getCourse(distance:number){return {yaw:world.sample(distance).yaw,width:world.width,length:world.length};},
      getDriving(){const p=cars[0];return {...p,curvature:wrapAngle(world.sample(p.distance+5).yaw-world.sample(p.distance).yaw)/5,phase:view.phase,time:raceTime,length:world.length};},
    },
  });
}
