import {test,expect} from '@playwright/test';
import {makeCar,drive,EMPTY_INPUT} from '../src/simulation';
const course={length:700,width:15,yaw:()=>0};
test('input accelerates, brakes, and steering changes the racing line',()=>{
  const car=makeCar('rabbit'),input=EMPTY_INPUT();input.throttle=true;
  for(let i=0;i<180;i++)drive(car,input,course,1/60,()=>{});
  expect(car.distance).toBeGreaterThan(60);expect(car.speed).toBeGreaterThan(35);
  input.right=true;for(let i=0;i<30;i++)drive(car,input,course,1/60,()=>{});
  expect(car.lateral).toBeLessThan(-2);
  input.right=false;input.throttle=false;input.brake=true;
  for(let i=0;i<120;i++)drive(car,input,course,1/60,()=>{});
  expect(car.speed).toBe(0);
});
test('drift earns expendable boost, and empty energy cannot retrigger it',()=>{
  const car=makeCar('rabbit');car.speed=30;car.energy=0;
  const input={...EMPTY_INPUT(),throttle:true,right:true,drift:true};
  const wide={...course,width:1000};
  const events:string[]=[];
  for(let i=0;i<90;i++)drive(car,input,wide,1/60,event=>events.push(event));
  expect(car.energy).toBeGreaterThan(8);expect(car.drift).toBeGreaterThan(.4);
  input.drift=false;drive(car,input,wide,1/60,event=>events.push(event));
  expect(events).toContain('drift-release');expect(car.boostTime).toBeGreaterThan(.5);
  car.energy=45;car.boostTime=0;input.boost=true;
  drive(car,input,wide,1/60,event=>events.push(event));
  expect(car.energy).toBe(5);expect(car.boosts).toBe(1);
  car.boostTime=0;drive(car,input,wide,1/60,event=>events.push(event));expect(car.boosts).toBe(1);
});
test('road curvature demands steering and barrier contact has a recoverable cost',()=>{
  const car=makeCar('dog');car.speed=40;
  const curved={...course,yaw:(distance:number)=>distance*.025};
  let hits=0;
  for(let i=0;i<240;i++)drive(car,{...EMPTY_INPUT(),throttle:true},curved,1/60,event=>{if(event==='hit')hits++;});
  expect(hits).toBeGreaterThan(0);expect(Math.abs(car.lateral)).toBeLessThanOrEqual(course.width/2-1.25);
  expect(car.speed).toBeLessThan(35);expect(car.distance).toBeGreaterThan(30);
  car.heading=0;car.lateral=0;
  for(let i=0;i<120;i++)drive(car,{...EMPTY_INPUT(),throttle:true},course,1/60,()=>{});
  expect(car.speed).toBeGreaterThan(35);
});
