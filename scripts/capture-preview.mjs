import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
await page.goto('http://127.0.0.1:5188/?qa=1',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.state.loadedModels.length===4);
await page.waitForTimeout(800);
await fs.mkdir('artifacts/preview',{recursive:true});
for(const state of ['menu','active-play','canyon-play','dock-play']){
  await page.evaluate(async state=>{await window.__THREE_GAME_TEST_HOOKS__.setState(state);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},state);
  await page.waitForTimeout(450);
  await page.screenshot({path:`artifacts/preview/${state}.png`});
}
await page.evaluate(async()=>{const q=document.querySelector('#setting-quality');q.value='low';q.dispatchEvent(new Event('change',{bubbles:true}));await window.__THREE_GAME_TEST_HOOKS__.setState('active-play');window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);});
await page.waitForTimeout(300);await page.screenshot({path:'artifacts/preview/active-low.png'});
const diagnostics=await page.evaluate(()=>{const d=window.__THREE_GAME_DIAGNOSTICS__,gl=document.querySelector('#game').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {state:d.state,render:d.renderer.render,memory:d.renderer.memory,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
await fs.writeFile('artifacts/preview/diagnostics.json',JSON.stringify({diagnostics,errors},null,2));
console.log(JSON.stringify({render:diagnostics.render,memory:diagnostics.memory,gpu:diagnostics.gpu,errors}));
await browser.close();
