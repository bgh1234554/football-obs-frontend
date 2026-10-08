const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





await page.addStyleTag({content:'* { transition:none !important;animation:none !important; }'});

await page.setViewportSize({width:1920,height:1080});
for(const theme of ['kleague','seriea']){
await page.evaluate(theme=>{state.fsmTheme=theme;state.homeName='로디나 모스크바';state.awayName='루빈 카잔';state.homeScore=1;state.awayScore=1;autoApplyTemplateByLeagueId(39,null);render();},theme);
await page.waitForFunction(()=>!pendingThemeLink);await page.waitForTimeout(200);
const edges=await page.evaluate(()=>['home','away'].map(side=>{
 const score=document.getElementById(side==='home'?'team-score-left':'team-score-right');
 const box=score.getBoundingClientRect();const scale=box.height/score.offsetHeight;
 // ?곗긽?⑥뿉???媛곸꽑 ?앹씠 ?紐??⑤꼸 ?꾩뿉 蹂댁씠?붿? hit-test?쒕떎.
 const text=score.querySelector('span').getBoundingClientRect();
 const hit=document.elementFromPoint(text.x+text.width/2,text.y+text.height/2);
 const diagonalHit=document.elementFromPoint(box.right-2*scale,box.top+2*scale);
 return {transform:getComputedStyle(score).transform,visible:score.contains(hit),diagonalVisible:score.contains(diagonalHit)};
}));
assert.equal(edges[0].transform,edges[1].transform);assert(edges.every(edge=>edge.visible),JSON.stringify(edges));
if(theme==='kleague'){
 assert(edges.every(edge=>edge.diagonalVisible));
 const gap=await page.evaluate(()=>{const card=document.getElementById('awayCard');const edge=getComputedStyle(card,'::after');const score=document.getElementById('team-score-right');const scale=score.getBoundingClientRect().height/score.offsetHeight;const expected=score.offsetHeight/2*Math.tan(10*Math.PI/180);return {extension:parseFloat(edge.width),expected,background:edge.backgroundColor};});
 assert(gap.extension>gap.expected);
 const stripeEnds=await page.evaluate(()=>['home','away'].map(side=>{const style=getComputedStyle(document.getElementById(side+'Card'),'::after');return {left:style.left,right:style.right};}));
 assert.equal(stripeEnds[0].right,'4px');assert.equal(stripeEnds[1].left,'-4px');assert.notEqual(gap.background,'rgba(0, 0, 0, 0)');
}
await page.locator('.scoreboard-main').screenshot({path:'tests/display/'+theme+'-score-edge.png'});
}
assert.deepEqual(errors,[]);console.log('PASS K League and Serie A score diagonal edges visible on both teams');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

