const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);

// 같은 URL을 유지해야 수동 조회 결과가 브라우저 캐시에도 덮어써진다.
const refreshRequests=[];
await page.route('https://football-obs-backend.onrender.com/api/fixtures/987654321',async route=>{
 const request=route.request();
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'x-force-refresh,x-caller'};
 if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
 refreshRequests.push({url:request.url(),refresh:request.headers()['x-force-refresh']||null,caller:request.headers()['x-caller']||null});
 return route.fulfill({status:200,headers,contentType:'application/json',body:'{}'});
});
await page.evaluate(async()=>{
 await fetchFixture(987654321);
 await fetchFixture(987654321,{cache:'reload'});
 await fetchFixture(987654321);
});
assert.deepEqual(refreshRequests.map(r=>r.refresh),[null,'true',null]);
assert.equal(new Set(refreshRequests.map(r=>r.url)).size,1);
console.log('PASS manual refresh sends backend cache bypass while normal polling keeps the same URL without bypass');

const callerHeaders=await page.evaluate(async()=>{
 const headers=new Headers({'X-Caller':'preserved','X-Force-Refresh':'false'});
 await fetchFixture(987654321,{cache:'reload',headers});
 await fetchFixture(987654321,{cache:'reload',headers:[['X-Caller','tuple']]});
 await fetchFixture(987654321,{cache:'reload',headers:{'X-Caller':'object'}});
 return {caller:headers.get('X-Caller'),refresh:headers.get('X-Force-Refresh')};
});
assert.deepEqual(refreshRequests.slice(3).map(r=>[r.caller,r.refresh]),[['preserved','true'],['tuple','true'],['object','true']]);
assert.deepEqual(callerHeaders,{caller:'preserved',refresh:'false'});
console.log('PASS forced refresh preserves supported caller headers without mutating them');





const cdp=await page.context().newCDPSession(page);
await page.evaluate(()=>{window.freezeWakes=0;schedulePollingWake(()=>freezeWakes++,100);});
await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
await new Promise(resolve=>setTimeout(resolve,250));
await cdp.send('Page.setWebLifecycleState',{state:'active'});
await page.waitForFunction(()=>freezeWakes===1);assert.equal(await page.evaluate(()=>freezeWakes),1);
await cdp.detach();
const scheduler=await page.evaluate(async()=>{
 clearPolling();
 const originals={setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,now:Date.now,fetchAndApplyFixtureData};
 const pending=new Map();let nextId=0,now=100000,wakes=0;
 try{
  window.setTimeout=fn=>{pending.set(++nextId,fn);return nextId;};window.clearTimeout=id=>pending.delete(id);Date.now=()=>now;
  schedulePollingWake(()=>wakes++,15000);
  const firstFallback=[...pending.values()][0];now+=15000;
  resumeOverduePolling();firstFallback();
  const single=wakes===1&&!_pollWake;
  schedulePollingWake(()=>wakes++,15000);const canceled=[...pending.values()][0];clearPolling();now+=15000;canceled();const cancellation=wakes===1;
  for(const target of ['focus','online','resume','pageshow']){
   schedulePollingWake(()=>wakes++,15000);const before=wakes;
   (target==='resume'?document:window).dispatchEvent(new Event(target));if(wakes!==before)throw Error('Early lifecycle wake');
   now+=16000;(target==='resume'?document:window).dispatchEvent(new Event(target));if(wakes!==before+1)throw Error('Missing lifecycle recovery');
  }
  // 화면이 숨겨진 동안 타이머가 실행되지 않아도 다시 표시되면 복구한다.
  schedulePollingWake(()=>wakes++,15000);now+=16000;document.dispatchEvent(new Event('visibilitychange'));const lifecycle=wakes===6;
  const data={matchInfo:{fixtureId:'123',status:'1H'}};let fetches=0;state.manualMode=false;_lastFetchId='123';_lastFixtureData=data;
  fetchAndApplyFixtureData=async()=>{_fetchSeq++;fetches++;return data;};schedulePoll(data);now+=16000;resumeOverduePolling();await Promise.resolve();
  const live=fetches===1;schedulePoll(data);state.manualMode=true;now+=16000;resumeOverduePolling();const manual=fetches===1;
  state.manualMode=false;schedulePoll(data);_lastFetchId='999';now+=16000;resumeOverduePolling();const stale=fetches===1;
  clearPolling();schedulePoll({matchInfo:{fixtureId:'123',status:'CANC'}});const terminal=!_pollWake;
  window.__POPOUT_MODE__='theme';schedulePoll(data);const popout=!_pollWake;window.__POPOUT_MODE__=false;
  schedulePollingWake(()=>wakes++,15);now+=15;[...pending.values()][0]();const fallback=wakes===7;
  // 실패 후 재예약과 종료 유예 시간, 더 최근 조회의 예약 보존을 확인한다.
  _lastFetchId='123';_lastFixtureData=data;
  fetchAndApplyFixtureData=async()=>{_fetchSeq++;return null;};
  schedulePoll(data);now+=16000;resumeOverduePolling();await Promise.resolve();await Promise.resolve();
  const retry=_pollDueAt===now+15000;
  clearPolling();const finished={matchInfo:{fixtureId:'123',status:'FT'}};_lastFixtureData=finished;
  schedulePoll(finished);now+=360001;resumeOverduePolling();await Promise.resolve();await Promise.resolve();
  const finishedStopped=!_pollWake;
  let finish;_lastFixtureData=data;
  fetchAndApplyFixtureData=()=>{_fetchSeq++;return new Promise(resolve=>{finish=resolve;});};
  schedulePoll(data);now+=16000;resumeOverduePolling();_fetchSeq++;schedulePollingWake(()=>{},5000);
  const newerDeadline=_pollDueAt;finish(null);await Promise.resolve();await Promise.resolve();
  const newerRequest=_pollDueAt===newerDeadline;
  return {single,cancellation,lifecycle,live,manual,stale,terminal,popout,fallback,retry,finishedStopped,newerRequest};
 }finally{
  clearPolling();window.setTimeout=originals.setTimeout;window.clearTimeout=originals.clearTimeout;Date.now=originals.now;fetchAndApplyFixtureData=originals.fetchAndApplyFixtureData;
 }
});assert(Object.values(scheduler).every(Boolean),JSON.stringify(scheduler));
const bodyTimeout=await page.evaluate(async()=>{
 const originalFetch=window.fetch;let aborted=false;
 try{
  window.fetch=async(url,{signal})=>({ok:true,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}))});
  try{await apiFetch('/api/test',{timeoutMs:30,rateLimitRetries:0});return {unexpectedSuccess:true};}catch(e){return {code:e.code,aborted};}
 }finally{window.fetch=originalFetch;}
});assert.deepEqual(bodyTimeout,{code:'NETWORK_TIMEOUT',aborted:true});
const manualDuringRequest=await page.evaluate(async()=>{
 const original=fetchFixture;const previous=_lastFixtureData;let finish;
 try{
  state.manualMode=false;fetchFixture=()=>new Promise(resolve=>{finish=resolve;});
  const request=fetchAndApplyFixtureData('123',{silent:true});state.manualMode=true;
  finish({matchInfo:{fixtureId:'123',status:'1H',homeScore:99}});
  return (await request)===null&&_lastFixtureData===previous;
 }finally{fetchFixture=original;state.manualMode=false;clearPolling();}
});assert.equal(manualDuringRequest,true);
const retryHeader=await page.evaluate(()=>readRetryAfterMs({headers:new Headers({'Retry-After':'5'})}));
assert.equal(retryHeader,5000);
// 실제 폴링 예약이 silent 조회와 화면 렌더까지 연결되는 경로를 확인한다.
const fixture=JSON.parse(fs.readFileSync(path.join(root,'json','juveparma.json'),'utf8').replace(/^\uFEFF/,''));
const screen=await page.evaluate(async base=>{
 const original=fetchFixture;let current=structuredClone(base),requests=0;
 const frames=async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);};
 const notes=()=>[el.homeNote.innerHTML,el.awayNote.innerHTML,getComputedStyle(el.homeNote).fontSize];
 try{
  state.manualMode=false;state.teamColorOverride=false;state.noteEnabled=true;state.noteFontSize=32;
  current.matchInfo={...current.matchInfo,fixtureId:'poll-screen',status:'2H',elapsed:70,homeScore:1,awayScore:0,
    homePrimaryColor:'#2563eb',homeNumberColor:'#ffffff',awayPrimaryColor:'#dc2626',awayNumberColor:'#ffffff'};
  current.events=[{elapsed:12,side:'home',teamId:current.matchInfo.homeTeamId,playerId:999991,
    playerName:'폴링화면갱신시이름축소를유지하는검사선수'.repeat(2),type:'Goal',detail:'Normal Goal'}];
  fetchFixture=async()=>{requests++;return structuredClone(current);};
  activatePage('main-small');await fetchAndApplyFixtureData('poll-screen');clearPolling();
  await document.fonts.ready;await frames();
  state.noteEnabled=true;state.noteFontSize=32;state.boardScale=150;render();fsmBoardRender();await frames();
  const before=notes();
  const tick=async()=>{schedulePoll(current);_pollDueAt=Date.now()-1;resumeOverduePolling();await frames();clearPolling();};
  const initialRequests=requests;await tick();const unchanged=JSON.stringify(before)===JSON.stringify(notes());
  const shrunk=parseFloat(before[2])<state.noteFontSize;
  const statsPanel=document.querySelector('.page.active [data-stat-panel]');const oldStats=statsPanel.textContent;
  current.matchInfo.homeScore=2;
  current.events.push({elapsed:71,side:'home',teamId:current.matchInfo.homeTeamId,playerId:999992,
    playerName:'폴링추가선수',type:'Goal',detail:'Normal Goal'});
  current.teamStats[0].totalShots+=5;
  current.homeLineup.startXi[0].number=99;
  await tick();
  const updated=state.homeScore===2&&el.homeNote.textContent.includes('폴링추가선수')
    &&statsPanel.textContent!==oldStats
    &&document.querySelector('.page.active [data-dp-role="lineup"]').textContent.includes('99');
  const latest=notes();noteLayoutStamp=null;render();fsmBoardRender();
  const sameAsFresh=JSON.stringify(latest)===JSON.stringify(notes());
  return {unchanged,shrunk,updated,sameAsFresh,polls:requests-initialRequests,
    font:before[2],configured:state.noteFontSize,label:el.homeNote.textContent.slice(0,140),width:document.getElementById('boardStageWrap').clientWidth};
 }finally{fetchFixture=original;clearPolling();}
},fixture);
assert.equal(screen.polls,2,'scheduler performs both silent polls');
assert.ok(screen.unchanged&&screen.shrunk,`unchanged polling preserves fitted scorer font and layout: ${JSON.stringify(screen)}`);
assert.ok(screen.updated,'poll updates score, scorer, lineup number and stats');
assert.ok(screen.sameAsFresh,'polling result matches full scorer layout');
console.log('PASS scheduled silent polls preserve fitted notes and update scores, scorers, lineup and stats');
assert.deepEqual(errors,[]);console.log('PASS polling recovery, duplicate prevention, selection/manual/terminal/popout guards and stalled response body timeout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
