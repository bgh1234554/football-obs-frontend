const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




await page.evaluate(()=>{state.fsmTheme='auto';autoApplyTemplateByLeagueId(39,null);});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='pl');
let resolveRequest;let requested=new Promise(resolve=>resolveRequest=resolve);await page.route('**/result_style_RPL.css',route=>resolveRequest(route));
await page.evaluate(()=>{autoApplyTemplateByLeagueId(235,null);fsmBoardRender();});let held=await requested;
assert.equal(await page.evaluate(()=>_currentTheme),'pl');assert.equal(await page.locator('#board').getAttribute('data-fsm-theme'),'pl');
await held.abort();await page.waitForFunction(()=>!pendingThemeLink);assert.equal(await page.evaluate(()=>_currentTheme),'pl');assert((await page.locator('#fsm-theme-link').getAttribute('href')).endsWith('result_style_EPL.css'));
requested=new Promise(resolve=>resolveRequest=resolve);await page.evaluate(()=>applyTheme('rpl',null));held=await requested;await page.evaluate(()=>applyTheme('pl',null));assert.equal(await page.evaluate(()=>_currentTheme),'pl');await held.abort();await page.unroute('**/result_style_RPL.css');
await page.evaluate(()=>{state.leagueId=39;state.leagueLogoUrl=null;syncScoreboardStateFromStorage(JSON.stringify({...state,leagueId:235,leagueLogoUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}));});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='rpl');assert.equal(await page.evaluate(()=>state.leagueId),235);
const newLogo='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50"/>';
await page.evaluate(logo=>syncScoreboardStateFromStorage(JSON.stringify({...state,leagueLogoUrl:logo})),newLogo);assert.equal(await page.locator('.epl-lion').getAttribute('src'),newLogo);assert.equal(await page.evaluate(()=>_currentTheme),'rpl');assert.deepEqual(errors,[]);console.log('PASS committed theme survives loading/failure/cancel; storage league and logo changes reapply theme');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
