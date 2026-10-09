const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://localhost')return route.abort();const f=path.join(root,u.pathname==='/'?'overlay_dashboard.html':decodeURIComponent(u.pathname));if(!fs.existsSync(f)||fs.statSync(f).isDirectory())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(f),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff'}[path.extname(f)]||'application/octet-stream'});});
await page.goto('http://localhost/');await page.addStyleTag({content:'* { transition: none !important; animation: none !important; }'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);





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
  schedulePoll(finished);now+=180001;resumeOverduePolling();await Promise.resolve();await Promise.resolve();
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
assert.deepEqual(errors,[]);console.log('PASS polling recovery, duplicate prevention, selection/manual/terminal/popout guards and stalled response body timeout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
