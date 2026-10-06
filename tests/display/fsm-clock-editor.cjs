const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);

for(const theme of fs.readdirSync(path.join(root,'css/theme')).filter(name=>name.startsWith('result_style_'))) {
 await page.evaluate(theme=>{const key={default:'default',EPL:'pl',CL:'cl',UEL:'uel',ACLE:'acle',UNL:'unl',EURO24:'er24',LIGUE1:'ligue1',SERIEA:'seriea',KLEAGUE:'kleague',WC26:'wc26'}[theme.replace('result_style_','').replace('.css','')];applyTheme(key,null);},theme);await page.waitForFunction(theme=>document.getElementById('fsm-theme-link').href.endsWith(theme),theme);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>{state.half='2H';state.seconds=123;state.running=false;render();fsmBoardRender();});await page.waitForTimeout(100);
 const before=await page.locator('#board').boundingBox();
 await page.locator('#clock').dblclick();
 assert(await page.locator('#clockEditor').isVisible());
 await page.mouse.move(0,0);assert.equal(await page.locator('#ceConfirm').evaluate(e=>getComputedStyle(e).color),'rgb(134, 239, 172)');
 await page.locator('#ceConfirm').hover();assert.equal(await page.locator('#ceConfirm').evaluate(e=>getComputedStyle(e).color),'rgb(220, 252, 231)');
 assert(await page.locator('.scoreboard-main').isVisible());
 const during=await page.locator('#board').boundingBox();assert(Math.abs(before.height-during.height)<1);assert(Math.abs(before.width-during.width)<1);
 const styles=await page.locator('#clock').evaluate(e=>({display:getComputedStyle(e).display,background:getComputedStyle(e).backgroundColor,editorBackground:getComputedStyle(document.querySelector('#clockEditor')).backgroundColor,margin:getComputedStyle(document.querySelector('#clockEditor')).marginTop}));
 assert.notEqual(styles.display,'none');assert.equal(styles.background,styles.editorBackground);assert.equal(styles.margin,'0px');
 await page.locator('#ceColon').hover();assert(await page.locator('#cePresets').isVisible());
 if(theme==='result_style_CL.css'){fs.mkdirSync(path.join(root,'screenshots','fsm-clock-editor'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots','fsm-clock-editor','cl-editing.png')});}
 await page.locator('.ce-preset-btn[data-min="45"]').click();
 assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),2700);assert(await page.evaluate(()=>state.running));assert(!await page.locator('#clockEditor').isVisible());
 for(const min of [0,90,105]){await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.locator('#ceColon').hover();await page.locator('.ce-preset-btn[data-min="'+min+'"]').click();assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),min*60);}
 await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.locator('#ceMin').fill('12');await page.locator('#ceSec').fill('34');await page.locator('#ceConfirm').click();assert.equal(await page.evaluate(()=>Math.floor(state.seconds)),754);
 await page.evaluate(()=>pauseClockTimer());await page.locator('#clock').dblclick();await page.keyboard.press('Escape');assert(!await page.locator('#clockEditor').isVisible());assert.equal(await page.locator('#clock').evaluate(e=>e.classList.contains('is-editing')),false);
 console.log('PASS',theme,'stable board/timer background, colon hover, 4 presets, manual edit, cancel');
}
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
