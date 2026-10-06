const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);


for(const test of [
 {colors:['FEEA00','F9DE52'],values:[464,421],divider:true},
 {colors:['#FEEA00','#F9DE52'],values:[88,85],divider:true},
 {colors:['rgb(254, 234, 0)','rgb(249, 222, 82)'],values:[3,9],divider:true},
 {colors:['#fff000','#ffe44d'],values:[464,421],divider:true},
 {colors:['rgb(255, 240, 0)','rgb(255, 228, 77)'],values:[88,85],divider:true},
 {colors:['hsl(56, 100%, 50%)','hsl(51, 100%, 65%)'],values:[3,9],divider:true},
 {colors:['yellow','yellow'],values:[6,1],divider:true},
 {colors:['#ff0000','#0000ff'],values:[6,2],divider:false},
 {colors:['#fff000','#ffe44d'],values:[0,0],divider:false},
 {colors:['#fff000','#ffe44d'],values:[0.41,0.41],divider:true}
]) {
 const result=await page.evaluate(test=>{state.colors.homeBg=test.colors[0];state.colors.awayBg=test.colors[1];const row=stCreateRow({label:'Stat',homeVal:test.values[0],awayVal:test.values[1]},{});document.body.append(row);const divider=row.querySelector('.st-bar-divider');const result={divider:!!divider,color:divider?.style.background,left:divider?.style.left,width:divider?.getBoundingClientRect().width};row.remove();return result;},test);
 assert.equal(result.divider,test.divider,JSON.stringify({test,result}));if(test.divider){assert(result.color.startsWith('rgb('));assert(result.width>0);if(test.colors[0].toUpperCase().includes('FEEA00'))assert.equal(result.color,'rgb(1, 21, 255)');}console.log('PASS stat divider',JSON.stringify(test));
}
const unexpectedErrors=errors.filter(message=>message !== 'jQuery is not defined');
assert.deepEqual(unexpectedErrors,[],`Unexpected page errors: ${unexpectedErrors.join('\n')}`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
