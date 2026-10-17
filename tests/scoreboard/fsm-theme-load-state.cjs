const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);




// 글꼴은 css/core/fsm-fonts.css에서 한 번만 선언한다. 테마 CSS가 @font-face를 다시 선언하면 테마 교체마다 글꼴 객체가 새로 생겨 전환이 끊긴다.
const themeDir=path.join(root,'css/theme');assert.deepEqual(fs.readdirSync(themeDir).filter(f=>/^result_style_.*\.css$/.test(f)&&fs.readFileSync(path.join(themeDir,f),'utf8').includes('@font-face')),[]);
await page.evaluate(()=>{state.fsmTheme='auto';autoApplyTemplateByLeagueId(39,null);});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='pl');
let resolveRequest;let requested=new Promise(resolve=>resolveRequest=resolve);await page.route('**/result_style_RPL.css',route=>resolveRequest(route));
await page.evaluate(()=>{autoApplyTemplateByLeagueId(235,null);fsmBoardRender();});let held=await requested;
assert.equal(await page.evaluate(()=>_currentTheme),'pl');assert.equal(await page.locator('#board').getAttribute('data-fsm-theme'),'pl');
await held.abort();await page.waitForFunction(()=>!pendingThemeLink);assert.equal(await page.evaluate(()=>_currentTheme),'pl');assert((await page.locator('#fsm-theme-link').getAttribute('href')).endsWith('result_style_EPL.css'));
requested=new Promise(resolve=>resolveRequest=resolve);await page.evaluate(()=>applyTheme('rpl',null));held=await requested;await page.evaluate(()=>applyTheme('pl',null));assert.equal(await page.evaluate(()=>_currentTheme),'pl');await held.abort();await page.unroute('**/result_style_RPL.css');
await page.evaluate(()=>{state.leagueId=39;state.leagueLogoUrl=null;syncScoreboardStateFromStorage(JSON.stringify({...state,leagueId:235,leagueLogoUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}));});await page.waitForFunction(()=>!pendingThemeLink&&_currentTheme==='rpl');assert.equal(await page.evaluate(()=>state.leagueId),235);
const newLogo='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50"/>';
await page.evaluate(logo=>syncScoreboardStateFromStorage(JSON.stringify({...state,leagueLogoUrl:logo})),newLogo);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RPL.svg');assert.equal(await page.evaluate(()=>_currentTheme),'rpl');
// 직접 로고를 바꾼 뒤 저장소 갱신이 지정 로고 우선순위를 다시 적용하는지 확인한다.
await page.evaluate(logo=>applyTheme('rpl',logo),newLogo);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),newLogo);
const changedLogo='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="70"/>';
await page.evaluate(logo=>syncScoreboardStateFromStorage(JSON.stringify({...state,leagueLogoUrl:logo})),changedLogo);
assert.equal(await page.locator('.epl-lion').getAttribute('src'),'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RPL.svg');assert.equal(await page.evaluate(()=>_currentTheme),'rpl');// 이미 로드한 글꼴을 쓰는 테마로 바꿀 때 글꼴을 다시 로딩(loadingdone -> 점수판 재렌더)하지 않는다.
const fontReloads=await page.evaluate(async()=>{let n=0;const count=()=>n++;document.fonts.addEventListener('loadingdone',count);for(const t of ['pl','rpl','pl']){applyTheme(t,null);await new Promise(r=>{const w=()=>pendingThemeLink?requestAnimationFrame(w):setTimeout(r,300);w();});}document.fonts.removeEventListener('loadingdone',count);return n;});
assert.equal(fontReloads,0,'theme switches reuse the shared font faces');assert.deepEqual(errors,[]);
// 배포 화면(localhost가 아닌 주소)은 한가할 때 모든 테마 CSS를 rel=prefetch로 미리 받아 두고 적용하지는 않는다(fsm-board.js prefetchThemeStylesheets).
// 목록은 applyTheme의 changeCSS 경로 전체와 같아야 하고, 로컬(localhost)은 미리 받지 않는다.
assert.equal(await page.locator('link[rel="prefetch"]').count(),0,'localhost skips theme prefetch');
{const themeFiles=[...new Set(fs.readFileSync(path.join(root,'js/core/fsm-board.js'),'utf8').match(/changeCSS\('(css\/theme\/[\w.-]+\.css)'/g).map(s=>s.slice(11,-1)))].sort();
themeFiles.forEach(f=>assert(fs.existsSync(path.join(root,f)),`theme file exists ${f}`));
const remote=await browser.newPage({viewport:{width:1280,height:720}});const remoteErrors=[];remote.on('pageerror',e=>remoteErrors.push(e.message));
await remote.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://obs.test')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2'}[path.extname(f)]||'application/octet-stream'});});
await remote.goto('http://obs.test/');await remote.waitForFunction(()=>document.querySelectorAll('link[rel="prefetch"]').length>0,null,{timeout:15000});
const prefetched=await remote.evaluate(()=>{const theme=document.getElementById('fsm-theme-link').href;return {files:[...document.querySelectorAll('link[rel="prefetch"]')].map(l=>new URL(l.href).pathname.slice(1)).concat(new URL(theme).pathname.slice(1)).sort(),applied:[...document.querySelectorAll('link[rel="prefetch"]')].filter(l=>l.sheet).length,as:[...new Set([...document.querySelectorAll('link[rel="prefetch"]')].map(l=>l.as))]};});
assert.deepEqual(prefetched.files,themeFiles,'every theme stylesheet is prefetched once (current theme already loaded)');assert.equal(prefetched.applied,0,'prefetched stylesheets are not applied');assert.deepEqual(prefetched.as,['style']);
assert.deepEqual(remoteErrors,[]);await remote.close();}
console.log('PASS theme stylesheets prefetched on deployed hosts only, not applied');console.log('PASS committed theme survives loading/failure/cancel; theme switches reuse shared font faces; storage changes reapply registered logo priority');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
