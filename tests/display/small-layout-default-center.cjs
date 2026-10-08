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
assert.deepEqual(errors,[]);console.log('PASS small layout reset centers middle column boundary');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
