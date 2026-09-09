import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',timeout:180_000,expect:{timeout:15_000},workers:1,
  reporter:[['list'],['json',{outputFile:'artifacts/test-results.json'}]],
  use:{baseURL:process.env.TEST_URL||'http://127.0.0.1:5188',channel:'chromium',headless:true,viewport:{width:1440,height:900},screenshot:'only-on-failure',trace:'retain-on-failure'},
});
