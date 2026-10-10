const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);







await page.evaluate(()=>{activatePage('main-small');resetAllLayoutSizes();});
for(const [width,height] of [[1920,900],[1920,1080],[1920,900],[2560,1440],[1280,720]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(200);
 const result=await page.evaluate(()=>{const layout=document.querySelector('.layout-small').getBoundingClientRect();const lineup=document.querySelector('.layout-small .lp-lineup-s').getBoundingClientRect();const bench=document.querySelector('.layout-small .lp-col-bench').getBoundingClientRect();const chat=document.querySelector('.layout-small .lp-cam-chat').getBoundingClientRect();return {middle:(lineup.right+bench.left)/2,right:chat.right,layoutRight:layout.right};});
 assert(Math.abs(result.middle-width/2)<2,JSON.stringify({width,height,result}));
 assert(result.right<=result.layoutRight+1,JSON.stringify({width,height,result}));
}
// Height-only fullscreen changes stretch the bench downward without widening it or chat.
for (const custom of [false, true]) {
 await page.setViewportSize({width:1920,height:900});await page.waitForTimeout(250);
 await page.evaluate(custom=>{resetAllLayoutSizes();if(custom){const l=document.querySelector('.layout-small');const w=applySmallLayoutWidths(l,350,360);localStorage.setItem('obs.smallLayout.columnWidths.v2',JSON.stringify(w));}},custom);
 const sizes=()=>page.evaluate(()=>['.lp-col-bench','.lp-cam-chat'].map(sel=>{const r=document.querySelector('.layout-small '+sel).getBoundingClientRect();return {width:r.width,height:r.height,top:r.top};}));
 const initial=await sizes();
 await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(250);
 const full=await sizes();
 full.forEach((r,i)=>{assert(Math.abs(r.width-initial[i].width)<2,JSON.stringify({custom,initial,full}));assert(Math.abs(r.top-initial[i].top)<2);assert(r.height>initial[i].height+170);});
 await page.setViewportSize({width:1920,height:900});await page.waitForTimeout(250);
 const restored=await sizes();restored.forEach((r,i)=>assert(Math.abs(r.width-initial[i].width)<2));
}
await page.evaluate(()=>resetAllLayoutSizes());
// Both existing boundaries resize the bench without adding a middle handle.
await page.setViewportSize({width:1920,height:900});await page.waitForTimeout(200);
const measure=()=>page.evaluate(()=>Object.fromEntries(['.lp-col-events-stat','.lp-lineup-s','.lp-col-bench','.lp-cam-chat'].map(sel=>{const r=document.querySelector('.layout-small '+sel).getBoundingClientRect();return [sel,{width:r.width,left:r.left,right:r.right}];})));
const close=(a,b)=>assert(Math.abs(a-b)<2,JSON.stringify({a,b}));
const drag=async(sel,delta)=>{const h=await page.locator('.layout-small '+sel).boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+delta,h.y+h.height/2,{steps:8});await page.mouse.up();};
let before=await measure();
await drag('.lp-small-col-resize',60);let after=await measure();
close(after['.lp-col-events-stat'].width,before['.lp-col-events-stat'].width+60);
close(after['.lp-col-bench'].width,before['.lp-col-bench'].width-60);
close(after['.lp-lineup-s'].width,before['.lp-lineup-s'].width);
close(after['.lp-cam-chat'].width,before['.lp-cam-chat'].width);
before=after;await drag('.lp-small-col-resize-end',70);after=await measure();
close(after['.lp-col-bench'].width,before['.lp-col-bench'].width+70);
close(after['.lp-cam-chat'].width,before['.lp-cam-chat'].width-70);
close(after['.lp-col-events-stat'].width,before['.lp-col-events-stat'].width);
close(after['.lp-lineup-s'].left,before['.lp-lineup-s'].left);
await page.reload();await page.evaluate(()=>{activatePage('main-small');});await page.waitForTimeout(250);
let restored=await measure();for(const key of Object.keys(after))close(restored[key].width,after[key].width);
await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(200);
const bounds=await page.evaluate(()=>{const l=document.querySelector('.layout-small').getBoundingClientRect();const c=document.querySelector('.layout-small .lp-cam-chat').getBoundingClientRect();return {right:c.right,limit:l.right};});assert(bounds.right<=bounds.limit+1);
await page.locator('.layout-small .lp-small-col-resize-end').dblclick();
assert.equal(await page.evaluate(()=>localStorage.getItem('obs.smallLayout.columnWidths.v2')),null);
// A legacy setting remains usable until the user makes a new adjustment.
await page.evaluate(()=>{localStorage.setItem('obs.smallLayout.eventsStatRatio.v1','0.45');applyStoredSmallLayoutResize();});
await drag('.lp-small-col-resize-end',-25);
assert(await page.evaluate(()=>localStorage.getItem('obs.smallLayout.columnWidths.v2')));
await page.evaluate(()=>resetAllLayoutSizes());
assert.equal(await page.evaluate(()=>localStorage.getItem('obs.smallLayout.columnWidths.v2')),null);
assert.deepEqual(errors,[]);console.log('PASS small layout independent boundary resizing, persistence, migration and centered reset');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
