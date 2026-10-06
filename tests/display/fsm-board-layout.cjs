const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
for(const theme of fs.readdirSync(path.join(root,'css/theme')).filter(n=>n.startsWith('result_style_'))){
 await page.evaluate(theme=>changeCSS('css/theme/'+theme),theme);await page.waitForFunction(theme=>document.getElementById('fsm-theme-link').href.endsWith(theme),theme);await page.evaluate(()=>document.fonts.ready);
 for(const agg of [false,true])for(const names of [['A','B'],['Medium Football Club','B'],['Very Long Football Club Name That Needs To Shrink','B'],['A','B']]){
 const result=await page.evaluate(({names,agg})=>{state.homeName=names[0];state.awayName=names[1];state.aggEnabled=agg;state.homeScore=3;state.awayScore=2;render();fsmBoardRender();const board=document.querySelector('.scoreboard-main');return {width:board.offsetWidth,cards:[el.homeCard.offsetWidth,el.awayCard.offsetWidth],fonts:[...document.querySelectorAll('.team-name .text')].map(e=>parseFloat(getComputedStyle(e).fontSize)),fits:[...document.querySelectorAll('.team-name')].map(e=>{const t=e.querySelector('.text'),s=getComputedStyle(e);return t.scrollWidth<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1}),scores:[el.homeScore.textContent,el.awayScore.textContent]};},{names,agg});
 assert(result.width>=656&&result.width<=984,JSON.stringify({theme,result}));assert.equal(result.cards[0],result.cards[1]);assert(result.fits.every(Boolean),JSON.stringify({theme,result}));assert.deepEqual(result.scores,['3','2']);if(names[0]==='A')assert.deepEqual(result.fonts,[33,33]);
 }
 console.log('PASS FSM width, equal cards, long-name fit, short-name recovery, scores:',theme);
}
await page.evaluate(()=>{state.half='PK';state.pk.home=['G','M','G','G','M','G','G'];state.pk.away=['M','G'];state.redHome=2;state.redAway=1;render();fsmBoardRender();});
assert.equal(await page.locator('#pso-left .pso-circle').count(),7);assert.equal(await page.locator('#pso-right .pso-circle').count(),5);assert.equal(await page.locator('#rcHome').count(),1);assert.equal(await page.locator('#rcHome .rc-card').count(),2);
await page.evaluate(()=>{state.pk.home=['M'];state.pk.away=[];render();fsmBoardRender();});assert.equal(await page.locator('#pso-left .pso-circle').count(),5);assert.equal(await page.locator('#pso-right .pso-circle').first().evaluate(e=>e.style.background),'');
console.log('PASS asymmetric PSO attempts, sudden death, reset, red cards and unique IDs');
await page.evaluate(()=>{activatePage('schedule');document.querySelector('#games-list').innerHTML='<div style="height:3000px">matches</div>';});await page.locator('#games-list').hover();await page.mouse.wheel(0,500);await page.waitForTimeout(200);assert(await page.locator('#games-list').evaluate(e=>e.scrollTop>0));assert.deepEqual(errors,[]);console.log('PASS schedule wheel scrolling and no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
