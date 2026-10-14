const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const draftRoot = path.resolve(process.argv[2] || root);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname);
      const draftFile = path.join(draftRoot, relative);
      const file = fs.existsSync(draftFile) ? draftFile : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');

    await page.evaluate(() => {
      activatePage('main-big'); setSetting('statCycleAuto','on'); setSetting('statsAutoSwipeSec',2.5);
      const data={matchInfo:{fixtureId:'scroll-test',status:'1H',elapsed:40,homeTeamId:1,awayTeamId:2},events:Array.from({length:20},(_,i)=>({side:'home',teamId:1,type:'Goal',detail:'Normal Goal',elapsed:i+1,playerId:i+1,playerName:'Player '+i}))};
      applyEventsPanel(data,{animate:false}); _lpAutoClear(); window._lpStatMatchInfoAvailable=true; _lpStatCycle.mode='match_info'; lpStatUpdateVisibility();
    });
    await page.waitForTimeout(100);
    await page.evaluate(()=>{
      const data=structuredClone(window._eventsLastData);
      data.events.push({side:'home',teamId:1,type:'Goal',detail:'Normal Goal',elapsed:40,playerId:999,playerName:'NEW TEST'});
      window._eventsLastData=data;
      const prepared=lpStatPrepareForNewEvent(); applyEventsPanel(data); if(prepared)lpStatResumeAfterNewEventRendered();
    });
    const snapshot=()=>page.evaluate(()=>{
      const el=document.querySelector('.layout-big .lp-stat .ev-list');
      const row=[...el.children].find(row=>row.textContent.includes('NEW TEST'));
      return {mode:_lpStatCycle.mode,top:el.scrollTop,max:el.scrollHeight-el.clientHeight,
        held:row.classList.contains('ev-row-glow-held'),shadow:getComputedStyle(row).boxShadow,
        transition:getComputedStyle(row).transitionProperty,visible:row.getBoundingClientRect().bottom>el.getBoundingClientRect().top && row.getBoundingClientRect().top<el.getBoundingClientRect().bottom};
    });
    await page.waitForTimeout(100);
    let state=await snapshot();
    assert.equal(state.mode,'events'); assert.equal(state.top,0);
    assert(state.visible && state.held); assert(state.transition.includes('transform'));
    assert.notEqual(state.shadow,'none');
    await page.waitForTimeout(4900);
    await page.waitForFunction(()=>{const el=document.querySelector('.layout-big .lp-stat .ev-list');return el.scrollTop>400;});
    const bottom=await snapshot(); assert(bottom.held);
    await page.waitForTimeout(1500);
    const before=await snapshot(); assert(before.top<bottom.top && before.top>0);
    await page.evaluate(()=>applyEventsPanel(window._eventsLastData));
    await page.waitForTimeout(500);
    const after=await snapshot(); assert(after.top<before.top && after.top>0,'polling must keep scrolling the visible list');
    assert(after.held); assert.notEqual(after.shadow,'none');
    await page.waitForFunction(()=>document.querySelector('.layout-big .lp-stat .ev-list').scrollTop===0,{},{timeout:20000});
    assert.equal((await snapshot()).held,true,'glow survives until panel transition');
    await page.waitForFunction(()=>_lpStatCycle.mode==='match_info');
    assert.equal((await snapshot()).held,false);
    assert.deepEqual(errors,[]);
    console.log('PASS: visible top insertion, five-second hold, bottom-to-top scroll, polling continuity, glow through completion and previous-panel return.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });


