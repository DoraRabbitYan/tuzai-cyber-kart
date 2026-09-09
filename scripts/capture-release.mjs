import {chromium,devices} from '@playwright/test';
import {inspectPage} from './inspect-threejs-canvas.mjs';
import fs from 'node:fs/promises';

const runId=process.argv[2];
if(!runId||!/^[a-z0-9-]+$/i.test(runId))throw Error('Provide a fresh run ID');
const target=new URL(process.env.TEST_URL||'http://127.0.0.1:5189/');
target.searchParams.set('qa','1');
const url=target.href;
const out=`artifacts/${runId}`;
const states=['menu','active-play','canyon-play','dock-play','drifting','paused','results'];
const captures=['desktop','mobile'].flatMap(mode=>states.map(state=>({mode,state,report:`${out}/${mode}-${state}.json`})));
await fs.mkdir(out,{recursive:true});
const characters=['rabbit','sheep','dog','dragon'];
await fs.writeFile('artifacts/evidence.json',JSON.stringify({version:1,runId,captures,artifacts:['dist/index.html','artifacts/playtest/keyboard-race.webm','artifacts/playtest/keyboard-race.json','artifacts/mobile/input-evidence.json','artifacts/core-suite-results.json','artifacts/test-results.json','artifacts/audio-validation.json','artifacts/static-host-check.json','artifacts/performance.json','artifacts/blender-assets-validation.json',...characters.flatMap(id=>[`public/models/${id}.glb`,`public/models/${id}-lod.glb`,`${out}/character-${id}.png`])]},null,2));
const browser=await chromium.launch({channel:'chromium',headless:true});
let failures=0;
try{
  for(const mode of ['desktop','mobile']){
    const context=await browser.newContext(mode==='mobile'?{...devices['iPhone 13'],userAgent:undefined}:{viewport:{width:1440,height:900},deviceScaleFactor:1});
    for(const state of states){
      const page=await context.newPage();
      const report=await inspectPage(page,{url,out,mobile:mode==='mobile',wait:750,state,seed:42,runId});
      await fs.writeFile(`${out}/${mode}-${state}.json`,JSON.stringify(report,null,2));
      const measured=report.result.renderBudget?.rows.every(row=>typeof row.actual==='number');
      const ok=report.result.ok&&measured&&!report.consoleErrors.length&&!report.pageErrors.length;
      if(!ok)failures++;
      console.log(JSON.stringify({mode,state,ok,render:report.result.diagnostics?.renderer?.render,budget:report.result.renderBudget}));
      await page.close();
    }
    if(mode==='desktop'){
      const page=await context.newPage();await page.goto(url,{waitUntil:'networkidle'});
      await page.locator('#start-race').waitFor({state:'visible'});
      for(const id of characters){
        await page.locator(`[data-character="${id}"]`).click();await page.waitForTimeout(600);
        const actual=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.state.player.id);
        if(actual!==id)throw Error(`Character selection failed: ${id}`);
        await page.screenshot({path:`${out}/character-${id}.png`});
      }
      await page.close();
    }
    await context.close();
  }
}finally{await browser.close();}
if(failures)throw Error(`${failures} capture(s) failed`);
