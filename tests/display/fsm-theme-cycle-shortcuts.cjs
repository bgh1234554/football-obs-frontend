const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





await page.evaluate(()=>{state.fsmTheme='auto';state.leagueId=237;autoApplyTemplateByLeagueId(237,null);render();});await page.waitForFunction(()=>!pendingThemeLink);
assert((await page.locator('#themeCycleShortcutHint').textContent()).includes('Shift + ['));
const values=await page.locator('#fsmThemeSelect option').evaluateAll(ns=>ns.map(n=>n.value));
async function press(key,value){await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press(key);await page.waitForFunction(v=>state.fsmTheme===v&&!pendingThemeLink,value);assert.equal(await page.locator('#fsmThemeSelect').inputValue(),value);assert(await page.locator('#copy-toast').evaluate(n=>n.classList.contains('show')));const label=await page.locator('#fsmThemeSelect option:checked').textContent();assert((await page.locator('#copy-toast').textContent()).includes(label));}
await press('Shift+BracketLeft',values.at(-1));await press('Shift+BracketRight','auto');await press('Shift+BracketRight',values[1]);
const extra=await page.evaluate(()=>state.extra);await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code:'Unidentified',key:'{',keyCode:219,shiftKey:true})));await page.waitForFunction(()=>state.fsmTheme==='auto'&&!pendingThemeLink);assert.equal(await page.evaluate(()=>state.extra),extra);
await page.evaluate(()=>{activatePage('theme');document.getElementById('fsmThemeSelect').focus();});await page.keyboard.press('Shift+BracketRight');assert.equal(await page.evaluate(()=>state.fsmTheme),'auto');await page.evaluate(()=>document.activeElement.blur());
const colors=await page.locator('#copy-toast').evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color]);assert.deepEqual(colors,['rgb(96, 165, 250)','rgb(11, 18, 32)']);
await page.locator('#settingsGearBtn').evaluate(n=>n.click());await page.locator('[data-sp-tab="general"]').click();await page.locator('#shortcutManageBtn').click();
const label=await page.evaluate(()=>shortcutActions.find(a=>a[0]==='themeNext')[2]);const row=page.locator('.sc-row').filter({has:page.locator('span').filter({hasText:label})});await row.locator('.sc-key').click();await page.keyboard.press('Control+Alt+n');assert.equal(await row.locator('.sc-key').textContent(),'Ctrl + Alt + N');assert((await page.locator('#themeCycleShortcutHint').textContent()).includes('Ctrl + Alt + N'));await page.locator('#shortcutBackBtn').click();await page.locator('#settingsCloseBtn').click();
await press('Control+Alt+n',values[1]);await page.keyboard.press('Shift+BracketRight');assert.equal(await page.evaluate(()=>state.fsmTheme),values[1]);
await page.reload();await page.waitForFunction(()=>!pendingThemeLink);assert.equal(await page.evaluate(()=>shortcutBinding(shortcutActions.find(a=>a[0]==='themeNext'))),'Ctrl+Alt+KeyN');await press('Control+Alt+n',values[2]);
await page.waitForTimeout(1900);assert.equal(await page.locator('#copy-toast').evaluate(n=>n.classList.contains('show')),false);
assert.deepEqual(errors,[]);console.log('PASS previous/next theme cycle including auto, blue toast, OBS brackets, focus guard, settings rebinding and reload persistence');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
