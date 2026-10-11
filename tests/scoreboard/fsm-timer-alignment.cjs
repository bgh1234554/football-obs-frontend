const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);


for(const [theme,file] of Object.entries({default:'default',pl:'EPL',cl:'CL',uel:'UEL',acle:'ACLE',unl:'UNL',er24:'EURO24',ligue1:'LIGUE1',seriea:'SERIEA',kleague:'KLEAGUE',wc26:'WC26'})){
 await page.evaluate(theme=>applyTheme(theme,null),theme);await page.waitForFunction(file=>document.querySelector('#fsm-theme-link').href.endsWith('result_style_'+file+'.css')&&!pendingThemeLink,file);await page.evaluate(()=>document.fonts.ready);
 for(const seconds of [0,5400,6300,7540]){
 const metrics=await page.evaluate(seconds=>{setClockSeconds(seconds,{autoStart:false});state.extra=7;state.extraShown=true;render();fsmBoardRender();return [...document.querySelectorAll('.time,.extra-time')].map(e=>{const r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();const s=getComputedStyle(e),ctx=document.createElement('canvas').getContext('2d');ctx.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;const m=ctx.measureText('0123456789');const scale=r.height/e.offsetHeight;const ink=t.top+(m.fontBoundingBoxAscent+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2)*scale;return {baseline:t.top+m.fontBoundingBoxAscent*scale,text:e.textContent,center:r.y+r.height/2,ink,error:ink-r.y-r.height/2};});},seconds);
 metrics.forEach(m=>assert(Number.isFinite(m.error)&&Math.abs(m.error)<=0.5,JSON.stringify({theme,seconds,m})));assert.equal(metrics[0].text,seconds===0?'00:00':seconds===5400?'90:00':seconds===6300?'105:00':'125:40');assert.equal(metrics[1].text,'+7');assert(Math.abs(metrics[0].baseline-metrics[1].baseline)<=0.3,JSON.stringify({theme,metrics}));const gap=await page.evaluate(()=>document.querySelector('.extra-time').getBoundingClientRect().left-document.querySelector('.time').getBoundingClientRect().right);assert(Math.abs(gap)<0.1,JSON.stringify({theme,gap}));
 }
if(theme==='default'){await page.evaluate(()=>{setClockSeconds(5400,{autoStart:false});fsmBoardRender();});await page.locator('#boardStageInner').screenshot({path:path.join(root,'screenshots','fsm-clock-editor','default-timer-extra.png')});}
console.log('PASS',theme,'timer and +7 glyph centers at 00:00 / 90:00 / 105:00 / 125:40');
}
await page.evaluate(async()=>{
 const original=window.fsmBoardRender;window.fontCompletionRenders=0;
 window.fsmBoardRender=()=>{window.fontCompletionRenders++;original();};
 const font=new FontFace('FSMDelayedTimerFont','url(http://localhost/resources/fonts/Pretendard-Medium.woff)');
 document.fonts.add(font);
 document.querySelector('.scoreboard-timer').style.fontFamily='FSMDelayedTimerFont';
 original();
 await font.load();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 window.fsmBoardRender=original;
});
assert(await page.evaluate(()=>window.fontCompletionRenders>0),'Font completion must recalculate timer alignment');
console.log('PASS late timer font completion recalculates alignment');
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
