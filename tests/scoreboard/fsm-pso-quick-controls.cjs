const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async()=>{
const browser=await chromium.launch();
try {
const page=await openPage(browser,{dpr:1,viewport:{width:1920,height:1080}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const themes=process.env.PSO_THEMES?.split(',') || await page.evaluate(()=>Object.keys(FSM_THEMES));
for(const theme of themes) for(const scale of [50,75,100,150]) {
await page.evaluate(({theme,scale})=>{state.manualMode=true;state.half='PK';state.pk={home:[],away:[]};state.fsmTheme=theme;autoApplyTemplateByLeagueId(39,null);state.boardScale=scale;render();applyBoardScale(scale)}, {theme,scale});
await page.waitForFunction(()=>!pendingThemeLink);
await page.locator('.pso-main').click();
assert(await page.locator('#boardPsoControls').isVisible(),theme);
assert(await page.locator('#boardPsoControls .kbd').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).color==='rgb(255, 255, 255)')),theme+' keycap color');
assert(await page.locator('#boardPsoControls').evaluate(n=>{const p=getComputedStyle(document.querySelector('.pso-main')),m=getComputedStyle(n);return m.backgroundColor===p.color && m.color===p.backgroundColor}),theme+' inverted palette');
for(const id of ['pkHomeGoal','pkHomeMiss','pkAwayGoal','pkAwayMiss'])await page.locator(`[data-pso-action=${id}]`).click();
assert.deepEqual(await page.evaluate(()=>state.pk),{home:['G','M'],away:['G','M']});
const geometry=await page.evaluate(()=>{
const rect=s=>document.querySelector(s).getBoundingClientRect();
const home=rect('#pso-left'),away=rect('#pso-right'),buttons=[...document.querySelectorAll('.pso-quick-team')].map(n=>n.getBoundingClientRect());
return Math.max(Math.abs(home.left-buttons[0].left),Math.abs(home.width-buttons[0].width),Math.abs(away.left-buttons[1].left),Math.abs(away.width-buttons[1].width));
});assert(geometry<2,theme+' geometry '+geometry);
await page.locator('[data-pso-action=pkUndo]').click();
assert.equal(await page.evaluate(()=>state.pk.home.length+state.pk.away.length),3);
await page.locator('[data-pso-action=pkReset]').click();
assert.equal(await page.evaluate(()=>state.pk.home.length+state.pk.away.length),0);
await page.evaluate(()=>{state.pk={home:Array(9).fill('G'),away:Array(8).fill('M')};render()});
assert(await page.locator('#boardPsoControls').isVisible());
await page.waitForFunction(()=>document.querySelector('.pso-status').offsetWidth>360);
assert(await page.locator('#pso-left ul').evaluate(n=>new Set([...n.children].map(c=>c.offsetTop)).size===1),theme+' wrap');
console.log('PASS',theme,scale);
await page.keyboard.press('Escape');assert(!(await page.locator('#boardPsoControls').isVisible()));
}
assert.deepEqual(errors,[]);console.log('PASS PSO quick actions, alignment, sudden death, dismissal: '+themes.length+' themes x four scales');
await page.evaluate(()=>{state.pk={home:[],away:[]};state.boardScale=75;render();applyBoardScale(75)});
await page.locator('.pso-main').click();await page.screenshot({path:'screenshots/tests/pso-quick-controls.png'});
} finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});


