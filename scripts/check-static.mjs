import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root=path.resolve('dist');
await fs.mkdir('artifacts',{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wav':'audio/wav','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith('/kart/')){res.writeHead(404);return res.end();}
  const file=path.resolve(root,pathname.slice(6)||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
  const page=await browser.newPage();const errors=[];const responses=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{responses.push({url:r.url(),status:r.status()});if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}/kart/`,{waitUntil:'networkidle'});
  await page.locator('#start-race').waitFor({state:'visible',timeout:60_000});
  const gated=await page.evaluate(()=>!('__THREE_GAME_DIAGNOSTICS__' in window)&&!('__THREE_GAME_TEST_HOOKS__' in window));
  await page.locator('#start-race').click();await page.waitForTimeout(4200);
  const running=await page.locator('#race-hud').isVisible()&&!await page.locator('#countdown').isVisible();
  const fonts=await page.evaluate(()=>document.fonts.check('700 20px "Barlow Condensed"'));
  const report={capturedAt:new Date().toISOString(),root,subpath:'/kart/',gated,running,fonts,responses,errors};
  await fs.writeFile('artifacts/static-host-check.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({gated,running,fonts,requests:responses.length,errors}));
  if(!gated||!running||!fonts||errors.length)throw Error('Static hosting check failed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
