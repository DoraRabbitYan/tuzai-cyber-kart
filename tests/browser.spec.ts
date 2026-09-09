import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

declare global {
  interface Window {
    __THREE_GAME_DIAGNOSTICS__:any;
    __THREE_GAME_TEST_HOOKS__:any;
  }
}
async function ready(page:Page){
  await page.goto('/?qa=1',{waitUntil:'domcontentloaded',timeout:60_000});
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length===4,null,{timeout:60_000});
  await expect(page.locator('#start-race')).toBeVisible();
}
async function state(page:Page){return page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.state);}
async function press(page:Page,key:string,value:boolean,held:Set<string>){
  if(value&&!held.has(key)){await page.keyboard.down(key);held.add(key);}
  if(!value&&held.has(key)){await page.keyboard.up(key);held.delete(key);}
}
test('four drivers and all three real circuit worlds load through menu selection',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  for(const character of ['rabbit','sheep','dog','dragon']){
    await page.locator(`[data-character="${character}"]`).click();
    await expect(page.locator(`[data-character="${character}"]`)).toHaveAttribute('aria-pressed','true');
    expect((await state(page)).player.id).toBe(character);
  }
  for(const track of ['city','canyon','dock']){
    await page.locator(`[data-track="${track}"]`).click();
    expect((await state(page)).track).toBe(track);
    expect((await state(page)).trackLength).toBeGreaterThan(700);
  }
  expect(errors).toEqual([]);
});

test('compact phone and tablet menus keep all choices and the start button reachable',async({page})=>{
  await ready(page);
  for(const [width,height] of [[320,568],[375,667],[768,1024],[1024,768]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    const controls=await page.locator('.driver-option,[data-track],#start-race').evaluateAll(elements=>elements.map(element=>{
      const rect=element.getBoundingClientRect();const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {id:element.getAttribute('data-character')||element.getAttribute('data-track')||element.id,inside:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,reachable:!!hit&&element.contains(hit)};
    }));
    expect(controls.filter(control=>!control.inside||!control.reachable),`${width}x${height}`).toEqual([]);
  }
});

test('an unavailable audio context does not prevent racing or retry',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{value:class {constructor(){throw Error('Audio unavailable in test');}}});});
  await ready(page);await page.locator('#start-race').click();
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.state.phase==='racing',null,{timeout:10_000});
  await page.keyboard.press('Escape');await page.locator('#pause-screen [data-action="retry"]').click();
  expect((await state(page)).phase).toBe('countdown');
});

test('a failed required model leaves a stable actionable loading message',async({page})=>{
  await page.route('**/models/*.glb',async route=>{
    if(route.request().url().endsWith('/rabbit.glb'))return route.fulfill({status:503,body:'Unavailable'});
    await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();
  });
  await page.goto('/?qa=1',{waitUntil:'domcontentloaded'});
  await expect(page.getByText(/资源加载失败/)).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByText(/资源加载失败/)).toBeVisible();
  await expect(page.locator('#start-race')).not.toBeVisible();
});

test('missing distant models and stalled audio downloads still allow driving',async({page})=>{
  await page.route('**/models/*-lod.glb',route=>route.fulfill({status:404,body:'Optional LOD absent'}));
  await page.route('**/audio/*.wav',async route=>{await new Promise(resolve=>setTimeout(resolve,9000));await route.abort().catch(()=>{});});
  await ready(page);await page.locator('#start-race').click();
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.state.phase==='racing',null,{timeout:6500});
  await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
  expect((await state(page)).player.speed).toBeGreaterThan(3);
  expect((await state(page)).audio.loaded).toBe(0);
});

test('keyboard aliases, pause key repeat, audio pause/resume, and retry keep a clean lifecycle',async({page})=>{
  await ready(page);await page.locator('#start-race').click();
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.state.phase==='racing');
  await page.keyboard.down('w');await page.keyboard.down('ArrowUp');await page.keyboard.up('ArrowUp');
  expect((await state(page)).input.throttle).toBe(true);
  await page.waitForTimeout(700);expect((await state(page)).player.speed).toBeGreaterThan(5);
  await page.keyboard.down('Escape');await page.keyboard.down('Escape');
  expect((await state(page)).phase).toBe('paused');
  const paused=await state(page);await page.waitForTimeout(500);
  expect((await state(page)).time).toBe(paused.time);expect((await state(page)).audio.loops).toBe(0);
  expect(Object.values((await state(page)).input).some(Boolean)).toBe(false);
  await page.keyboard.up('Escape');await page.keyboard.up('w');await page.locator('#resume-race').click();
  await page.waitForTimeout(200);expect((await state(page)).audio.loops).toBe(2);
  expect((await state(page)).audio.loaded).toBe(13);expect((await state(page)).audio.errors).toEqual([]);
  await page.keyboard.press('Escape');await page.locator('#pause-screen [data-action="retry"]').click();
  expect((await state(page)).phase).toBe('countdown');expect((await state(page)).time).toBe(0);
  expect((await state(page)).player.speed).toBe(0);expect((await state(page)).audio.loops).toBe(2);
});

test('a real keyboard controller completes every lap and can restart the race',async({browser})=>{
  test.setTimeout(240_000);
  await fs.mkdir('artifacts/playtest',{recursive:true});
  const context=await browser.newContext({viewport:{width:1100,height:700},recordVideo:{dir:'artifacts/playtest',size:{width:1100,height:700}}});
  const page=await context.newPage(),video=page.video();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await page.locator('#start-race').click();
  await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.state.phase==='racing');
  const initial=await state(page),held=new Set<string>(),samples:any[]=[];
  const start=Date.now();let lastSample=0,maxLap=1;
  try{
    while(Date.now()-start<180_000){
      const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getDriving());
      if(d.phase==='results')break;
      if(d.phase==='paused')throw Error('Unexpected pause during active keyboard test');
      const targetHeading=Math.max(-.40,Math.min(.40,-d.lateral*.10));
      const command=d.curvature*d.speed+(targetHeading-d.heading)*4.0;
      await press(page,'ArrowLeft',command>.12,held);await press(page,'ArrowRight',command<-.12,held);
      const drift=Math.abs(d.curvature)>.016&&d.speed>26;
      await press(page,'Space',drift,held);
      const brake=Math.abs(d.curvature)>.031&&d.speed>34;
      await press(page,'w',!brake,held);await press(page,'s',brake,held);
      await press(page,'Shift',d.energy>=40&&Math.abs(d.curvature)<.014&&Math.abs(d.lateral)<3.8,held);
      maxLap=Math.max(maxLap,Math.floor(d.distance/d.length)+1);
      if(Date.now()-lastSample>950){samples.push({wallTime:(Date.now()-start)/1000,...d});lastSample=Date.now();}
      await page.waitForTimeout(85);
    }
    for(const key of held)await page.keyboard.up(key);
    const final=await state(page);
    await page.screenshot({path:'artifacts/playtest/finish.png'});
    await fs.writeFile('artifacts/playtest/keyboard-race.json',JSON.stringify({initial,final,maxLap,samples,errors},null,2));
    expect(final.phase).toBe('results');expect(maxLap).toBeGreaterThanOrEqual(3);
    expect(final.player.distance).toBeGreaterThanOrEqual(final.trackLength*3);
    expect(final.cars.every((car:{speed:number})=>car.speed===0)).toBe(true);
    expect(final.player.boosts).toBeGreaterThan(0);expect(final.audio.events['lap']).toBe(2);
    expect(final.audio.events['finish']).toBe(1);expect(final.audio.loops).toBe(0);expect(errors).toEqual([]);
    await expect(page.locator('#retry-race')).toBeVisible();await page.locator('#retry-race').click();
    expect((await state(page)).phase).toBe('countdown');expect((await state(page)).time).toBe(0);
    expect((await state(page)).player.distance).toBeLessThan(0);
  }finally{await context.close();if(video)await video.saveAs('artifacts/playtest/keyboard-race.webm');}
});

test('mobile multitouch drives, drifts and cancels, with reachable controls after rotation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await ready(page);await fs.mkdir('artifacts/mobile',{recursive:true});
    await page.screenshot({path:'artifacts/mobile/menu-portrait.png'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#start-race').tap();await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__.state.phase==='racing');
    const cdp=await context.newCDPSession(page);
    const center=async(name:string,id:number)=>{const box=await page.locator(`[data-input="${name}"]`).boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);return {x:box!.x+box!.width/2,y:box!.y+box!.height/2,id,radiusX:5,radiusY:5};};
    const throttle=await center('throttle',1),left=await center('left',2),drift=await center('drift',3);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[throttle]});await page.waitForTimeout(1700);
    expect((await state(page)).player.speed).toBeGreaterThan(15);
    const before=(await state(page)).player.lateral;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[throttle,left,drift]});await page.waitForTimeout(650);
    const during=await state(page);expect(during.input.left).toBe(true);expect(during.input.drift).toBe(true);
    expect(during.player.lateral).toBeGreaterThan(before);expect(during.player.drift).toBeGreaterThan(0);
    await page.screenshot({path:'artifacts/mobile/active-portrait.png'});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    expect(Object.values((await state(page)).input).some(Boolean)).toBe(false);
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);
    for(const key of ['left','right','throttle','brake','drift','boost'])await center(key,1);
    await page.screenshot({path:'artifacts/mobile/active-landscape.png'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await state(page)).audio.loaded).toBe(13);expect((await state(page)).audio.errors).toEqual([]);
    expect(errors).toEqual([]);
    await fs.writeFile('artifacts/mobile/input-evidence.json',JSON.stringify({during,final:await state(page),errors},null,2));
  }finally{await context.close();}
});
