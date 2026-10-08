const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





await page.locator('#settingsGearBtn').evaluate(n=>n.click());await page.locator('[data-sp-tab="general"]').click();
await page.locator('#shortcutManageBtn').click();
assert(await page.locator('#shortcutSettings').isVisible());
assert.equal(await page.locator('.sc-key').count(),25);
async function verifySearchHeight(){
  await page.waitForTimeout(150);
  const modal=page.locator('.sp-modal');const baseline=await modal.boundingBox();
  for(const query of ['점수','105:00','없는기능','']){
    await page.locator('#shortcutSearch').fill(query);
    const current=await modal.boundingBox();
    assert(Math.abs(current.height-baseline.height)<1,JSON.stringify({query,baseline,current}));
    assert(Math.abs(current.y-baseline.y)<1);
    if(query==='없는기능')assert.equal(await page.locator('.sc-key').count(),0);
  }
}
await verifySearchHeight();

await page.locator('.sc-key').first().click();await page.keyboard.press('r');
assert((await page.locator('.sc-status').textContent()).includes('이미'));
await page.keyboard.press('Escape');assert(await page.locator('#shortcutSettings').isVisible());
await page.locator('.sc-key').first().click();await page.keyboard.press('Control+k');
assert.equal(await page.locator('.sc-key').first().textContent(),'Ctrl + K');
await page.keyboard.press('Escape');assert(await page.locator('[data-sp-tab-section="general"]').isVisible());
await page.locator('#settingsCloseBtn').click();
const before=await page.evaluate(()=>state.running);await page.keyboard.press('Control+k');assert.equal(await page.evaluate(()=>state.running),!before);
await page.reload();await page.locator('#settingsGearBtn').evaluate(n=>n.click());await page.locator('#shortcutManageBtn').click();assert.equal(await page.locator('.sc-key').first().textContent(),'Ctrl + K');
await page.setViewportSize({width:390,height:844});
assert(await page.locator('#shortcutBackBtn').isVisible());
await verifySearchHeight();
const overflow=await page.locator('.sp-body').evaluate(n=>n.scrollWidth>n.clientWidth+1);assert.equal(overflow,false);
await page.screenshot({path:'tests/display/shortcut-settings-mobile.png'});
await page.setViewportSize({width:1920,height:1080});await verifySearchHeight();await page.screenshot({path:'tests/display/shortcut-settings-desktop.png'});
page.on('dialog',d=>d.accept());await page.locator('#shortcutResetBtn').click();assert.equal(await page.locator('.sc-key').first().textContent(),'Space');
await page.locator('#shortcutUndoBtn').click();assert.equal(await page.locator('.sc-key').first().textContent(),'Ctrl + K');
await page.locator('#shortcutBackBtn').click();assert(await page.locator('[data-sp-tab-section="general"]').isVisible());
assert.deepEqual(errors,[]);console.log('PASS shortcut navigation, conflict, capture, persistence, execution, reset and responsive layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
