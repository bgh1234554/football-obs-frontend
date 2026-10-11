const assert=require('node:assert/strict');const path=require('node:path');const {tmpdir}=require('node:os');const {chromium}=require('playwright');const {openPage,settle}=require('../tactics/helpers');
(async()=>{const browser=await chromium.launch();try{const page=await openPage(browser,{dpr:1,platform:'Win32',viewport:{width:1920,height:1080}});const themes=await page.evaluate(()=>Object.keys(FSM_THEMES));for(const theme of themes){await page.evaluate(theme=>{state.homeName='Home Team';state.awayName='Away Team';state.homeScore=10;state.awayScore=2;applyTheme(theme,null);render();},theme);await page.waitForFunction(()=>!pendingThemeLink);await page.evaluate(()=>document.fonts.ready);for(const scale of [60,75,100,125,150]){await page.evaluate(scale=>{state.boardScale=scale;render();fsmBoardRender();},scale);await settle(page);const m=await page.evaluate(()=>{const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {scores:[rect('#team-score-left'),rect('#team-score-right')],center:rect('.score-div'),card:rect('.teams-left')};});if(theme==='pl'||theme==='seriea'){assert(m.center.height>m.card.height);}else{for(const r of [...m.scores,m.center]){assert(Math.abs(r.top-m.card.top)<.1,JSON.stringify({theme,scale,m}));assert(Math.abs(r.bottom-m.card.bottom)<.1,JSON.stringify({theme,scale,m}));}}}if(['kleague','seriea'].includes(theme)){
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
}
if(['fnl','ligue1','kleague','wc26','cl'].includes(theme)){await page.locator('#board').screenshot({path:path.join(tmpdir(),`fsm-edges-${theme}.png`)});}console.log('PASS',theme);} }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
