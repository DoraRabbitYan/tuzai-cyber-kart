import {chromium,devices} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const target=new URL(process.env.TEST_URL||'http://127.0.0.1:5189/');
target.searchParams.set('qa','1');
const url=target.href;
const out=process.argv[2]||'artifacts/performance.json';
await fs.mkdir(path.dirname(out),{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
const reports=[];
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext(mobile?{...devices['iPhone 13'],userAgent:undefined}:{viewport:{width:1440,height:900},deviceScaleFactor:1});
    const page=await context.newPage();
    await page.goto(url,{waitUntil:'networkidle'});
    for(const state of ['active-play','canyon-play','dock-play']){
      await page.evaluate(async state=>{await window.__THREE_GAME_TEST_HOOKS__.setState(state);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);},state);
      const initial=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getDriving());
      const held=new Set(),motion=[];
      const pendingFrames=page.evaluate(()=>new Promise(resolve=>{
        const values=[];let last=performance.now(),start=last;
        function tick(now){values.push(now-last);last=now;if(now-start<8000)requestAnimationFrame(tick);else resolve(values.slice(12));}
        requestAnimationFrame(tick);
      }));
      const start=Date.now();
      while(Date.now()-start<8000){
        const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getDriving());
        const targetHeading=Math.max(-.40,Math.min(.40,-d.lateral*.10));
        const command=d.curvature*d.speed+(targetHeading-d.heading)*4;
        const brake=Math.abs(d.curvature)>.031&&d.speed>34;
        for(const [key,down] of [['ArrowLeft',command>.12],['ArrowRight',command<-.12],['w',!brake],['s',brake],['Space',Math.abs(d.curvature)>.016&&d.speed>26]]){
          if(down&&!held.has(key)){await page.keyboard.down(key);held.add(key);}
          if(!down&&held.has(key)){await page.keyboard.up(key);held.delete(key);}
        }
        motion.push({distance:d.distance,speed:d.speed,lateral:d.lateral});
        await page.waitForTimeout(85);
      }
      for(const key of held)await page.keyboard.up(key);
      const frames=await pendingFrames;
      const diagnostics=await page.evaluate(()=>{
        const d=window.__THREE_GAME_DIAGNOSTICS__,gl=document.querySelector('#game').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,state:d.state,render:d.renderer.render,memory:d.renderer.memory,graphics:d.graphics,physics:d.physics};
      });
      const sorted=frames.toSorted((a,b)=>a-b),mean=frames.reduce((a,b)=>a+b,0)/frames.length;
      const distanceTravelled=diagnostics.state.player.distance-initial.distance;
      if(distanceTravelled<100)throw Error(`Performance sample did not keep driving: ${state}, ${distanceTravelled}m`);
      const report={mode:mobile?'mobile-emulation':'desktop',state,unpaused:true,actualInput:'Real throttle, steering, brake and drift keys; road-following controller',distanceTravelled,motion,frames:frames.length,meanMs:mean,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],fps:1000/mean,diagnostics};
      reports.push(report);console.log(JSON.stringify({mode:report.mode,state,fps:report.fps,p95Ms:report.p95Ms,render:diagnostics.render}));
    }
    await context.close();
  }
}finally{await browser.close();}
await fs.writeFile(out,JSON.stringify({capturedAt:new Date().toISOString(),url,limitation:'Mobile viewport and touch emulation on the desktop GPU; not physical phone GPU certification.',reports},null,2));
