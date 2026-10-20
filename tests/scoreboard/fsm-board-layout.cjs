const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
const limits=await page.evaluate(()=>FSM_WIDTH_LIMITS);
for(const theme of await page.evaluate(()=>Object.keys(FSM_THEMES))){
 await page.evaluate(theme=>applyTheme(theme,null),theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);
 for(const agg of [false,true])for(const names of [['A','B'],['Medium Football Club','B'],['Very Long Football Club Name That Needs To Shrink','B'],['본머스','리버풀'],['러시아','나이지리아'],['야기엘로니아 비아위스토크','맨체스터 유나이티드'],['야기엘로니아 비아위스토크','보되/글림트'],['FC 미트윌란','페렌츠바로시 TC'],['Jagiellonia Białystok','Manchester United'],['A Very Long Football Club Name','Another Long Football Club Name'],['A','B']]){
 const result=await page.evaluate(({names,agg})=>{state.homeName=names[0];state.awayName=names[1];state.aggEnabled=agg;state.homeScore=3;state.awayScore=2;render();fsmBoardRender();const board=document.querySelector('.scoreboard-main');return {width:board.offsetWidth,aggregateWidth:document.querySelector('.fsm-board').dataset.fsmAggregate==='true'?[...board.querySelectorAll('.total-score')].reduce((sum,n)=>sum+n.offsetWidth,0):0,cards:[el.homeCard.offsetWidth,el.awayCard.offsetWidth],fonts:[...document.querySelectorAll('.team-name .text')].map(e=>parseFloat(getComputedStyle(e).fontSize)),fits:[...document.querySelectorAll('.team-name')].map(e=>{const t=e.querySelector('.text'),s=getComputedStyle(e);return t.scrollWidth<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1}),scores:[el.homeScore.textContent,el.awayScore.textContent]};},{names,agg});
 assert(result.width>=limits.minBoard&&result.width<=limits.maxBoard+result.aggregateWidth,JSON.stringify({theme,result}));assert.equal(result.cards[0],result.cards[1]);assert(result.fits.every(Boolean),JSON.stringify({theme,result}));assert.deepEqual(result.scores,['3','2']);assert(result.fonts.every(font=>font>0&&font<=limits.maxFont),JSON.stringify({theme,names,agg,result}));if(names[0]==='A')assert.deepEqual(result.fonts,[33,33]);
 // 컬러 칩을 제외한 실제 팀명 영역의 중앙에 짧고 긴 이름이 모두 놓여야 합니다.
 if(theme==='kazakh'){
  const errors=await page.evaluate(()=>['home','away'].map((side,index)=>{
   const card=document.getElementById(side+'Card').getBoundingClientRect();
   const chip=document.getElementById(side+'Color').getBoundingClientRect();
   const text=document.querySelector('#'+side+'Card .text').getBoundingClientRect();
   const left=index?chip.right:card.left,right=index?card.right:chip.left;
   return text.left+text.width/2-(left+right)/2;
  }));
  assert(errors.every(error=>Math.abs(error)<.2),JSON.stringify({theme,names,agg,errors}));
 }
 }
 console.log('PASS FSM width, equal cards, long-name fit, short-name recovery, scores:',theme);
}
await page.evaluate(()=>{state.half='PK';state.pk.home=['G','M','G','G','M','G','G'];state.pk.away=['M','G'];state.redHome=2;state.redAway=1;render();fsmBoardRender();});
assert.equal(await page.locator('#pso-left .pso-circle').count(),7);assert.equal(await page.locator('#pso-right .pso-circle').count(),5);assert.equal(await page.locator('#rcHome').count(),1);assert.equal(await page.locator('#rcHome .rc-card').count(),2);
await page.evaluate(()=>{state.pk.home=['M'];state.pk.away=[];render();fsmBoardRender();});assert.equal(await page.locator('#pso-left .pso-circle').count(),5);assert.equal(await page.locator('#pso-right .pso-circle').first().evaluate(e=>e.style.background),'');
console.log('PASS asymmetric PSO attempts, sudden death, reset, red cards and unique IDs');
await page.evaluate(()=>{activatePage('schedule');document.querySelector('#games-list').innerHTML='<div style="height:3000px">matches</div>';});await page.locator('#games-list').hover();await page.mouse.wheel(0,500);await page.waitForTimeout(200);assert(await page.locator('#games-list').evaluate(e=>e.scrollTop>0));assert.deepEqual(errors,[]);console.log('PASS schedule wheel scrolling and no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
