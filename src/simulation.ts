import { CHARACTERS, type CharacterId, type InputState } from './data';

export interface Course { length:number; width:number; yaw(distance:number):number; }
export interface CarState {
  id:CharacterId; distance:number; lateral:number; heading:number; steer:number; speed:number;
  energy:number; drift:number; driftSide:number; boostTime:number; padCooldown:number;
  hitCooldown:number; finished:number|null; collisions:number; boosts:number; pickups:number;
}
export type DrivingEvent = 'drift-start'|'drift-release'|'boost'|'hit';
export const EMPTY_INPUT = ():InputState => ({throttle:false,brake:false,left:false,right:false,drift:false,boost:false});
export const wrapAngle = (value:number) => Math.atan2(Math.sin(value),Math.cos(value));
export const clamp = (x:number,min:number,max:number) => Math.max(min,Math.min(max,x));
export function makeCar(id:CharacterId,distance=0,lateral=0):CarState {
  return {id,distance,lateral,heading:0,steer:0,speed:0,energy:25,drift:0,driftSide:0,boostTime:0,padCooldown:0,hitCooldown:0,finished:null,collisions:0,boosts:0,pickups:0};
}

/** Fixed-step arcade steering in the road's local frame. Curvature is subtracted
 * from vehicle heading; without steering, a car continues toward the barrier. */
export function drive(car:CarState,input:InputState,course:Course,dt:number,onEvent:(event:DrivingEvent)=>void) {
  if(car.finished!==null) return;
  const stats = CHARACTERS.find(c=>c.id===car.id)!;
  car.hitCooldown=Math.max(0,car.hitCooldown-dt);
  car.padCooldown=Math.max(0,car.padCooldown-dt);
  car.boostTime=Math.max(0,car.boostTime-dt);
  if(input.boost&&car.energy>=40&&car.boostTime<=0){
    car.energy-=40; car.boostTime=2.0; car.boosts++; onEvent('boost');
  }
  // With the camera looking toward +Z, screen-right is world -X.
  const steering=Number(input.left)-Number(input.right);
  car.steer+=(steering-car.steer)*(1-Math.exp(-dt*11));
  const drifting=input.drift&&car.speed>12&&Math.abs(car.steer)>0.25;
  if(drifting){
    if(!car.driftSide){car.driftSide=Math.sign(car.steer);onEvent('drift-start');}
    car.drift=Math.min(1,car.drift+dt*.43);
    car.energy=Math.min(100,car.energy+dt*9);
  }else if(car.driftSide){
    if(car.drift>.24){car.boostTime=Math.max(car.boostTime,.45+car.drift*.9);onEvent('drift-release');}
    car.drift=0;car.driftSide=0;
  }
  const maximum=(car.boostTime>0?62:43)*stats.speed;
  const acceleration=car.boostTime>0?27:17*stats.acceleration;
  if(input.throttle||car.boostTime>0) car.speed+=acceleration*dt;
  else car.speed-=7.2*dt;
  if(input.brake) car.speed-=32*dt;
  car.speed-=Math.abs(car.steer)*car.speed*(drifting?.13:.085)*dt;
  if(car.speed>maximum)car.speed=Math.max(maximum,car.speed-24*dt);
  car.speed=clamp(car.speed,0,70);
  const movement=car.speed*dt;
  const steeringRate=(.55+car.speed*.017)*stats.handling*(drifting?1.26:1);
  if(car.speed>0.2) car.heading+=car.steer*steeringRate*dt*Math.min(car.speed/9,1);
  // Tire grip eases extreme sideslip without secretly following the road.
  car.heading=clamp(car.heading,-1.02,1.02);
  const slip=drifting?-car.driftSide*car.drift*.14:0;
  const forward=movement*Math.max(.35,Math.cos(car.heading+slip));
  car.lateral+=movement*Math.sin(car.heading+slip);
  const turn=wrapAngle(course.yaw(car.distance+forward)-course.yaw(car.distance));
  car.distance+=forward;
  car.heading=wrapAngle(car.heading-turn);
  const boundary=course.width/2-1.25;
  if(Math.abs(car.lateral)>boundary){
    car.lateral=clamp(car.lateral,-boundary,boundary);
    car.heading*=.78;
    car.speed=Math.max(0,car.speed-dt*48);
    if(car.hitCooldown<=0&&car.speed>4){
      car.hitCooldown=.65;car.collisions++;car.speed*=stats.id==='sheep'?.87:.78;onEvent('hit');
    }
  }
}

export function driveAI(car:CarState,course:Course,dt:number,time:number,index:number){
  car.hitCooldown=Math.max(0,car.hitCooldown-dt);
  car.boostTime=Math.max(0,car.boostTime-dt);
  const curvature=Math.abs(wrapAngle(course.yaw(car.distance+10)-course.yaw(car.distance)))/10;
  const desired=clamp(36+index*.7-curvature*170,25,39)+(car.boostTime>0?15:0);
  car.speed+=(desired-car.speed)*(1-Math.exp(-dt*.9));
  car.distance+=car.speed*dt;
  const target=Math.sin(time*.38+index*2.5)*2.4;
  car.lateral+=(target-car.lateral)*(1-Math.exp(-dt*1.2));
  car.heading=Math.atan2(Math.cos(time*.38+index*2.5)*.912,car.speed);
  car.steer=clamp(curvature*25,0,.8);
}
