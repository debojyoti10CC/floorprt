import {defineConfig} from '@playwright/test';
const positions = process.env.AQRA_E2E_POSITIONS === 'true';
const arc = process.env.AQRA_E2E_ARC === 'true';
const baseURL = arc ? 'http://127.0.0.1:3003' : positions ? 'http://127.0.0.1:3002' : 'http://127.0.0.1:3000';
const command = arc ? 'pnpm dev:arc' : positions ? 'pnpm dev:positions' : 'pnpm dev';
export default defineConfig({testDir:'./e2e',fullyParallel:false,workers:1,timeout:180000,expect:{timeout:30000},use:{baseURL,viewport:{width:1440,height:1050},trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:[['list'],['html',{open:'never'}]],webServer:{command,url:baseURL,reuseExistingServer:!process.env.CI,timeout:180000,env:{NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI:String(!arc)}}});
