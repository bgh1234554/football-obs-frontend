const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let count=0, now=0, id=0, advanced=0;
const timers=new Map(), frames=new Map(), listeners=new Map();
const list={scrollHeight:1300,clientHeight:300,scrollTop:0,
  querySelectorAll(selector){assert.equal(selector,'.ev-row[data-ev-key]'); return Array.from({length:count});},
  addEventListener(type,cb){listeners.set(type,cb);},removeEventListener(type){listeners.delete(type);}};
const settings={statsAutoSwipeSec:10,statCycleAuto:'on'};
const context=vm.createContext({console,performance:{now:()=>now},
  document:{addEventListener(){},querySelectorAll(){return [];},querySelector(){return {querySelector:()=>list};}},
  getSetting:key=>settings[key],
  setTimeout:(cb,delay)=>{timers.set(++id,{cb,delay});return id;}, clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:cb=>{frames.set(++id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id),
});
context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../js/panels/stat-cycle.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
run("_lpAutoCycleModes=()=>['events','stats']; lpStatAutoAdvance=()=>recordAdvance(); _lpStatCycle.mode='events';");
context.recordAdvance=()=>advanced++;
const frame=()=>{const [key,cb]=frames.entries().next().value; frames.delete(key); cb(now);};
const fire=key=>{const timer=timers.get(key);assert(timer);timers.delete(key);timer.cb();return timer.delay;};
const start=(rows,seconds=10,newEvent=false)=>{
  run('_lpAutoClear()'); count=rows; settings.statsAutoSwipeSec=seconds; now=0; advanced=0;
  run(newEvent?'lpStatResumeAfterNewEventRendered()':'_lpAutoStart()');
  frame();frame();
};
for(const [rows,sec,hold,travel,end] of [[0,10,1000,6500,2500],[14,10,1000,6500,2500],[15,10,1000,10000,2500],[30,10,1000,20000,2500],[60,10,1000,40000,2500],[29,20,2000,13000,5000],[30,20,2000,20000,5000]]){
  start(rows,sec);
  assert.equal(list.scrollTop,1000);
  assert.equal(fire(run('_lpAuto.scrollTimer')),hold);
  now=travel/2;frame();assert.equal(list.scrollTop,500);
  now=travel;frame();assert.equal(list.scrollTop,0);
  assert.equal(advanced,0);
  assert.equal(fire(run('_lpAuto.scrollTimer')),end);
  assert.equal(advanced,1);
}
start(30,10,true);
assert.equal(fire(run('_lpAuto.scrollTimer')),5000,'new event holds exactly five seconds');
now=20000;frame();assert.equal(list.scrollTop,0);
assert.equal(fire(run('_lpAuto.scrollTimer')),2500);
start(30);
listeners.get('wheel')();
assert.equal(frames.size,0,'user scroll cancels animation');
assert.equal(fire(run('_lpAuto.timer')),10000,'user scroll restores ordinary timer');
start(30);run('lpStatTogglePause()');assert.equal(frames.size,0);assert.equal(timers.size,0);
for(const invalid of [0,-1,NaN,Infinity]) assert.equal(Object.keys(context._lpEventScrollOptions(invalid)).length,0);
console.log('PASS: 0/14/15/30/60 rows, custom interval threshold, actual scroll progress and advance timing, five-second new-event hold, manual interruption and pause.');

