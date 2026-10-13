const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




await page.setViewportSize({width:1920,height:1000});await page.locator('[data-page="theme"]').evaluate(n=>n.click());
assert((await page.locator('.theme-shortcut-hint').textContent()).includes('105:00'));
for(const [key,seconds] of [['r',0],['e',2700],['Shift+r',5400],['Shift+e',6300]]){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>state.seconds),seconds);}
await page.locator('#settingsGearBtn').evaluate(n=>n.click());await page.locator('[data-sp-tab="general"]').click();
const ys=await page.locator('.sp-row-manual-reset:has(#mrResetLineup) .sp-mini-toggle-item').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.equal(ys.length,6);assert(Math.max(...ys)-Math.min(...ys)<1,JSON.stringify(ys));
assert.deepEqual(errors,[]);console.log('PASS all four reset shortcuts and six reset toggles on a single row');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
