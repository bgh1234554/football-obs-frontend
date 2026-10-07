const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




console.log('TAB');await page.locator('[data-page="theme"]').evaluate(n=>n.click());
assert.equal(await page.locator('#templateSelect, #homeLogoScale, #homeOutlineOn, #rcSize, #inBoardA, #inOutline').count(),0);
assert(await page.locator('#inHomeBg').isVisible());assert(await page.locator('#noteOn').isVisible());assert(await page.locator('#extraInput').isVisible());
const position=await page.evaluate(()=>{const e=document.querySelector('#extraInput').closest('.pgroup'),a=document.querySelector('#aggToggle').closest('.pgroup');return !!(e.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING)&&!document.querySelector('#manual-section').contains(e);});assert(position);
await page.locator('#extraInput').fill('4');await page.locator('#extraPlus').click();assert.equal(await page.evaluate(()=>state.extra),5);assert.equal(await page.evaluate(()=>state.extraManualOverride),true);await page.locator('#toggleExtra').click();assert.equal(await page.evaluate(()=>state.extraShown),false);
const themes=await page.locator('#fsmThemeSelect option').evaluateAll(ns=>ns.map(n=>n.value));assert.equal(themes.length,15);
console.log('THEMES',themes);for(const theme of themes.filter(t=>t!=='auto')){console.log('SELECT',theme);await page.locator('#fsmThemeSelect').selectOption(theme);await page.waitForFunction(t=>!pendingThemeLink&&_currentTheme===t,theme);}
await page.locator('#fsmThemeSelect').selectOption('rpl');await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='rpl');
await page.evaluate(()=>{state.leagueId=39;autoApplyTemplateByLeagueId(39,null);persist();});assert.equal(await page.evaluate(()=>_currentTheme),'rpl');
console.log('RELOAD');await page.reload();await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='rpl');assert.equal(await page.locator('#fsmThemeSelect').inputValue(),'rpl');
console.log('TAB');await page.locator('[data-page="theme"]').evaluate(n=>n.click());await page.locator('#fsmThemeSelect').selectOption('auto');await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='pl');
assert.equal(await page.locator('#halfSelect, #prevHalf, #nextHalf').count(),0);assert(!(await page.locator('.theme-shortcut-hint').textContent()).includes('[/]'));
await page.evaluate(()=>{state.half='2';render();});await page.locator('#manualPsoMode').evaluate(n=>{n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.evaluate(()=>state.half),'PK');await page.locator('#manualPsoMode').evaluate(n=>{n.checked=false;n.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(await page.evaluate(()=>state.half),'2');

const centered=await page.locator('#themePanel button').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().height).every(n=>{const s=getComputedStyle(n);return ['inline-flex','flex'].includes(s.display)&&s.alignItems==='center'&&s.justifyContent==='center'&&parseFloat(s.paddingTop)===0&&parseFloat(s.paddingBottom)===0;}));assert(centered,'Button labels must use centered alignment');
for(const width of [1920,1280,900,640]){await page.setViewportSize({width,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));const over=await page.locator('#themePanel').evaluate(n=>n.scrollWidth>n.clientWidth+1);assert(!over,'Horizontal overflow at '+width);fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots/fsm-theme-panel-'+width+'.png')});}
await page.setViewportSize({width:760,height:700});await page.goto('http://localhost/?popout=theme');await page.waitForFunction(()=>document.querySelector('#page-theme').classList.contains('active'));assert(await page.locator('#fontCssUrl').isVisible());assert(await page.locator('#fontFile').isVisible());assert.equal(await page.locator('details.theme-font-advanced').count(),0);
await page.locator('#fsmThemeSelect').selectOption('rpl');await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='rpl');
assert.equal(await page.locator('#resetApiTeamColors').isDisabled(),true);
await page.evaluate(()=>{sessionStorage.setItem('cached_fixture_data',JSON.stringify({matchInfo:{fixtureId:123,homePrimaryColor:'#112233',homeNumberColor:'#ffffff',awayPrimaryColor:'#aa0000',awayNumberColor:'#000000'}}));state.teamColorOverride=true;state.teamColorOverrideFixtureId='123';state.colors.homeBg='#ff00ff';render();});
await page.locator('#resetApiTeamColors').click();assert.deepEqual(await page.evaluate(()=>[state.colors.homeBg,state.colors.homeText,state.colors.awayBg,state.colors.awayText,state.teamColorOverride,state.teamColorOverrideFixtureId]),['#112233','#ffffff','#aa0000','#000000',false,null]);
const aligned=await page.locator('#themePanel .pgroup:has(input[type="color"])').evaluateAll(ns=>ns.every(n=>{const a=n.querySelector('input[type="color"]').getBoundingClientRect(),b=n.querySelector('input[type="text"]').getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)<1;}));assert(aligned,'Color swatches and hex fields must align');
const narrow=await page.locator('#themePanel').evaluate(n=>n.scrollWidth>n.clientWidth+1);assert(!narrow,'Popup horizontal overflow');
await page.locator('#applyFont').scrollIntoViewIfNeeded();assert(await page.locator('#applyFont').isVisible());const bw=await page.locator('#applyFont').evaluate(n=>n.getBoundingClientRect().width);assert(bw<140,'Button should fit its label');await page.screenshot({path:path.join(root,'screenshots/fsm-theme-popup.png')});
await page.evaluate(()=>syncScoreboardStateFromStorage(JSON.stringify({...state,fsmTheme:'uel'})));await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='uel');assert.equal(await page.locator('#fsmThemeSelect').inputValue(),'uel');
fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots/fsm-theme-panel.png')});assert.deepEqual(errors,[]);console.log('PASS legacy controls removed; 14 FSM themes; persistence; automatic league theme; extra controls outside manual mode');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
