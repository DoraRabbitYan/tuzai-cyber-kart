import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out=process.argv[2]||'artifacts/face-integration';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5189/?qa=1',{waitUntil:'networkidle'});
  await page.locator('#start-race').waitFor({state:'visible'});
  for(const id of ['rabbit','sheep','dog','dragon']){
    await page.locator(`[data-character="${id}"]`).click();await page.waitForTimeout(350);
    await page.screenshot({path:`${out}/${id}.png`});
  }
  await fs.writeFile(`${out}/report.json`,JSON.stringify({capturedAt:new Date().toISOString(),source:'production preview, actual character selection',errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
