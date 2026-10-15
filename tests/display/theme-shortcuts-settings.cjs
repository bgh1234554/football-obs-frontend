const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




await page.setViewportSize({width:1920,height:1000});await page.locator('[data-page="theme"]').evaluate(n=>n.click());
assert((await page.locator('.theme-shortcut-hint').textContent()).includes('105:00'));
const heading=page.locator('.theme-notes-heading');
const titleBox=await heading.locator('.section-title').boundingBox();const hintBox=await heading.locator('#noteSizeShortcutHint').boundingBox();
assert(Math.abs(titleBox.y+titleBox.height/2-hintBox.y-hintBox.height/2)<2);
for(const [category,variable] of [['noteOwnGoalColor','--note-own-goal'],['notePenaltyMissColor','--note-pk-miss'],['noteRedCardColor','--note-red-card']]){
  const editors=page.locator(`[data-color-editor="${category}"]`);assert.equal(await editors.count(),2);
  await editors.last().locator('[data-color-hex]').evaluate(n=>{n.value='#123456';n.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.deepEqual(await editors.locator('[data-color-hex]').evaluateAll(ns=>ns.map(n=>n.value)),['#123456','#123456']);
  assert.equal(await page.evaluate(v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim(),variable),'#123456');
}
await page.locator('#themePanel [data-note-colors-reset]').evaluate(n=>n.click());
const labelStyles=await page.locator('.theme-note-controls .pgroup > label').evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.color,s.textAlign,s.lineHeight];}));
assert.equal(labelStyles.length,7);
labelStyles.forEach(style=>assert.deepEqual(style,labelStyles[0]));
for(const group of await page.locator('.theme-note-event-colors .pgroup').all()){
  const label=await group.locator(':scope > label').boundingBox();const editor=await group.locator('.theme-color-editor').boundingBox();
  assert(Math.abs(label.x-editor.x)<1);
}
await page.locator('.theme-notes-card').screenshot({path:'screenshots/tests/theme-note-event-colors.png'});
assert.equal(await page.evaluate(()=>getSetting('noteOwnGoalColor')),'#b6c2d1');
page.once('dialog',d=>d.accept());
await page.locator('#manualModeToggle').evaluate(n=>{n.checked=true;toggleManualMode();});await page.waitForTimeout(100);
const manualTop=await page.locator('.pages').evaluate(n=>n.getBoundingClientRect().top);
await page.locator('[data-page="main-small"]').evaluate(n=>n.click());
assert(Math.abs(manualTop-await page.locator('.pages').evaluate(n=>n.getBoundingClientRect().top))<2);
await page.locator('[data-page="theme"]').evaluate(n=>n.click());
await page.locator('#manualModeToggle').evaluate(n=>{n.checked=false;toggleManualMode();});
const initialSize=await page.evaluate(()=>state.noteFontSize);
await page.keyboard.press('Shift+Equal');assert.equal(await page.evaluate(()=>state.noteFontSize),initialSize+1);
await page.keyboard.press('Shift+Minus');assert.equal(await page.evaluate(()=>state.noteFontSize),initialSize);
await page.keyboard.press('Shift+NumpadAdd');assert.equal(await page.evaluate(()=>state.noteFontSize),initialSize+1);
await page.keyboard.press('Shift+NumpadSubtract');assert.equal(await page.evaluate(()=>state.noteFontSize),initialSize);
await page.evaluate(()=>{state.noteFontSize=10;render();});await page.keyboard.press('Shift+Minus');assert.equal(await page.evaluate(()=>state.noteFontSize),10);
for(const category of ['noteShowPenaltyMisses','noteShowRedCards']){
  const inputs=page.locator(`input[data-settings-cat="${category}"]`);assert.equal(await inputs.count(),2);
  await inputs.last().evaluate(n=>n.click());assert.deepEqual(await inputs.evaluateAll(ns=>ns.map(n=>n.checked)),[false,false]);
  await inputs.first().evaluate(n=>n.click());assert.deepEqual(await inputs.evaluateAll(ns=>ns.map(n=>n.checked)),[true,true]);
}
await page.evaluate(()=>{shortcutBindings.noteSizePlus='Alt+KeyU';saveShortcutBindings();renderShortcutSettings();});
assert((await page.locator('#noteSizeShortcutHint').textContent()).includes('Alt + U'));
await page.keyboard.press('Shift+Equal');assert.equal(await page.evaluate(()=>state.noteFontSize),10);
await page.keyboard.press('Shift+NumpadAdd');assert.equal(await page.evaluate(()=>state.noteFontSize),10);
await page.keyboard.press('Alt+u');assert.equal(await page.evaluate(()=>state.noteFontSize),11);
await page.reload();assert.equal(await page.evaluate(()=>state.noteFontSize),11);
assert((await page.locator('#noteSizeShortcutHint').textContent()).includes('Alt + U'));
await page.locator('[data-page="theme"]').evaluate(n=>n.click());
for(const [key,seconds] of [['r',0],['e',2700],['Shift+r',5400],['Shift+e',6300]]){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>state.seconds),seconds);}
await page.locator('#settingsGearBtn').evaluate(n=>n.click());await page.locator('[data-sp-tab="general"]').click();
const ys=await page.locator('.sp-row-manual-reset:has(#mrResetLineup) .sp-mini-toggle-item').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.equal(ys.length,6);assert(Math.max(...ys)-Math.min(...ys)<1,JSON.stringify(ys));
assert.deepEqual(errors,[]);console.log('PASS all four reset shortcuts and six reset toggles on a single row');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
