const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);







await page.evaluate(()=>activatePage('lineup'));

for (const scale of [75,100]) {
 await page.evaluate(scale=>{state.boardScale=scale;reapplyBoardScale();},scale);
 let previous=null;
 for(const theme of ['pl','russiancup','romanian','pl']){
  await page.evaluate(t=>{state.fsmTheme=t;autoApplyTemplateByLeagueId(39,null);render();},theme);
  await page.waitForFunction(()=>!pendingThemeLink);
  await page.waitForTimeout(1200);
  const m=await page.evaluate(()=>{const wrap=document.getElementById('boardStageWrap');const inner=document.getElementById('boardStageInner');const layout=document.querySelector('.layout-big');return {wrap:parseFloat(wrap.style.height),expected:inner.scrollHeight*state.boardScale/100,room:layout.clientHeight};});
  assert(Math.abs(m.wrap-m.expected)<0.1,JSON.stringify({theme,scale,...m}));
  if(previous && Math.abs(m.wrap-previous.wrap)>1)assert(Math.abs((m.wrap-previous.wrap)+(m.room-previous.room))<2,JSON.stringify({previous,current:m}));
  previous=m;
 }
}
assert.deepEqual(errors,[]);
console.log('PASS theme height transitions update scoreboard wrapper and remaining lineup panel height without reload');
await browser.close();}catch(e){await browser.close();throw e;}})();
