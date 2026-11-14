const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/panels/events-panel.js'),'utf8');let stored={};const c={window:{},SUBST_OVERRIDE_STORAGE_KEY:'subst',localStorage:{getItem:()=>JSON.stringify(stored),setItem:(_,s)=>stored=JSON.parse(s)}};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function evSubstEventKey('),source.indexOf('window.evPatchSubstEvents = evPatchSubstEvents;')),c);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../js/core/event-time.js'),'utf8'),c);
const editSource=fs.readFileSync(path.resolve(__dirname,'../../js/panels/event-hide.js'),'utf8');
vm.runInContext(editSource.slice(editSource.indexOf('function evEditTimeKey('),editSource.indexOf('\n/**',editSource.indexOf('function evEditTimeKey('))),c);
vm.runInContext(editSource.slice(editSource.indexOf('function evSubstMinute('),editSource.indexOf('window.evSubstCluster = evSubstCluster;')),c);
const fixture={matchInfo:{fixtureId:1490540},homeLineup:{startXi:[{playerId:265898,name:'Alejandro Alvarado'}],substitutes:[{playerId:0,name:'D. Mimbang',nameKoLong:'David Mimbang',number:36}]},awayLineup:{startXi:[],substitutes:[]},events:[{type:'subst',side:'home',elapsed:58,playerId:265898,playerName:'Alejandro Alvarado',assistId:null,assistName:null}]};
const run=d=>c.evPatchSubstEvents(d.events,1490540,d);const original=JSON.stringify(fixture);let patched=run(fixture)[0];assert.equal(patched.assistName,'D. Mimbang');assert.equal(patched.assistNameKoLong,'David Mimbang');assert.equal(patched.assistId,null);assert(c.evSubstHasUnlinkedId(patched,'assist'));assert.equal(c.evSubstEventKey(patched),c.evSubstEventKey(fixture.events[0]));assert.equal(JSON.stringify(fixture),original);
for(const change of [d=>d.homeLineup.substitutes.push({playerId:0,name:'Another'}),d=>d.events.push({...d.events[0],elapsed:70}),d=>d.homeLineup.startXi.push(d.homeLineup.substitutes.pop()),d=>d.matchInfo.fixtureId=2,d=>d.homeLineup.substitutes=[]]){const d=JSON.parse(original);change(d);assert.equal(run(d)[0].assistName,null)}
const named=JSON.parse(original);named.events[0].assistName='API name';assert.equal(run(named)[0].assistName,'API name');
stored={1490540:{[c.evSubstEventKey(fixture.events[0])]:{assist:{playerId:12,name:'Manual'}}}};patched=run(fixture)[0];assert.equal(patched.assistName,'Manual');assert.equal(patched.assistId,12);stored={};
const out=JSON.parse(original);out.events[0]={type:'subst',side:'home',elapsed:58,playerId:0,assistId:12,assistName:'Known'};out.homeLineup={startXi:[{playerId:0,name:'Out player'}],substitutes:[]};assert.equal(run(out)[0].playerName,'Out player');
console.log('PASS unique zero-ID substitution fallback, retained editable ID/key, ambiguity, role, fixture isolation, existing names, manual precedence and immutable source');

// 전체 벤치에 ID 0 선수가 여럿이어도 실제 출전한 미연결 후보가 유일하면 보완한다.
{
 const data=JSON.parse(original);
 data.matchInfo.elapsed=79;
 data.homeLineup.startXi=[{playerId:1,name:'Starter'}];
 data.homeLineup.substitutes=[{playerId:0,name:'S. Kadida',nameKoLong:'Sadok Kadida'},{playerId:0,name:'S. Chouchane'},{playerId:2,name:'Known sub'}];
 data.playerStats=[{side:'home',playerId:1,minutes:77,rating:'6.2'}, {side:'home',playerId:0,playerName:'S. Kadida',minutes:6,rating:'6.3'}, {side:'home',playerId:0,playerName:'S. Chouchane',minutes:0,rating:'0'}, {side:'home',playerId:2,minutes:6,rating:'6.1'}];
 data.events=[{type:'subst',side:'home',elapsed:71,playerId:1,assistId:null}, {type:'subst',side:'home',elapsed:71,playerId:3,assistId:2,assistName:'Known sub'}];
 const before=JSON.stringify(data);
 // 이전 응답에 스탯이 없으면 미해결로 남고, 다음 응답에 들어오면 새로 연결한다.
 const earlier=JSON.parse(before);earlier.playerStats=[];
 assert.equal(run(earlier)[0].assistName,undefined);
 const resolved=run(data)[0];
 assert.equal(resolved.assistName,'S. Kadida');
 assert.equal(resolved.assistId,null);
 assert.equal(c.evSubstEventKey(resolved),c.evSubstEventKey(data.events[0]));
 assert.equal(JSON.stringify(data),before);
 for(const mutate of [
  d=>d.events.push({...d.events[0],playerId:4}),
  d=>d.playerStats[2]={...d.playerStats[2],minutes:6,rating:'6.1'},
  d=>d.playerStats[1].minutes=40,
  d=>d.playerStats[1].side='away',
 ]) { const copy=JSON.parse(before);mutate(copy);assert.equal(run(copy)[0].assistName,undefined); }
 stored={1490540:{[c.evSubstEventKey(data.events[0])]:{assist:{playerId:42,name:'Manual'}}}};
 assert.equal(run(data)[0].assistName,'Manual');stored={};
 console.log('PASS played-bench substitution inference: polling lag, existing links, ambiguity, timing, sides and manual precedence');
}

// 같은 시각에 들어온 선수 집합이 확정되면 개별 OUT 조합과 무관하게 모두 보완한다.
for (const count of [2, 3]) {
 const data={
  matchInfo:{fixtureId:1490540,elapsed:90},
  awayLineup:{startXi:[{playerId:1,name:'Starter'}],substitutes:[
   ...Array.from({length:count},(_,i)=>({playerId:i === 0 ? 0 : 100+i,name:`Played ${i}`})),
   {playerId:200,name:'Unused'},
  ]},
  playerStats:[{side:'away',playerId:1,minutes:90,rating:'6.5'},
   ...Array.from({length:count},(_,i)=>({side:'away',playerId:i === 0 ? 0 : 100+i,playerName:`Played ${i}`,minutes:23,rating:'6.4'})),
   {side:'away',playerId:200,minutes:0,rating:null},
  ],
  events:Array.from({length:count},(_,i)=>({type:'subst',side:'away',elapsed:67,playerId:10+i,assistId:null})),
 };
 const before=JSON.stringify(data);
 const resolved=run(data);
 assert.deepEqual(Array.from(resolved,ev=>ev.assistName).sort(),Array.from({length:count},(_,i)=>`Played ${i}`));
 resolved.forEach((ev,i)=>{
  assert.equal(ev.assistId,null);
  assert(c.evSubstHasUnlinkedId(ev,'assist'));
  assert.equal(c.evSubstEventKey(ev),c.evSubstEventKey(data.events[i]));
 });
 assert.equal(JSON.stringify(data),before);
 const reversed=JSON.parse(before);
 reversed.events.reverse();reversed.awayLineup.substitutes.reverse();
 const byKey=events=>Object.fromEntries(events.map(ev=>[c.evSubstEventKey(ev),ev.assistName]));
 assert.deepEqual(byKey(run(reversed)),byKey(resolved));
 for (const mutate of [
  d=>d.events[0].elapsed=69,
  d=>d.events[0].extra=2,
  d=>d.events.push({...d.events[0],elapsed:68,playerId:50}),
  d=>d.playerStats[1].minutes=40,
  d=>d.playerStats[1].side='home',
  d=>Object.assign(d.playerStats[d.playerStats.length-1],{minutes:23,rating:'6.0'}),
 ]) {
  const copy=JSON.parse(before);mutate(copy);
  assert(run(copy).every(ev=>!ev.assistName));
 }
 // API나 수동 연결로 한 자리가 확정되면 나머지 후보만 사용한다.
 const known=JSON.parse(before);
 known.events[0].assistName='Played 0';
 assert.equal(run(known)[0].assistName,'Played 0');
 assert.equal(new Set(Array.from(run(known),ev=>ev.assistName)).size,count);
 stored={1490540:{[c.evSubstEventKey(data.events[0])]:{assist:{playerId:0,name:'Played 0'}}}};
 const manual=run(data);
 assert.equal(manual[0].assistName,'Played 0');
 assert.equal(manual[0].assistId,0);
 assert.equal(new Set(Array.from(manual,ev=>ev.assistName)).size,count);
 stored={};
 // 1분 간격과 연쇄 교체도 수동 수정 창과 같은 묶음으로 취급한다.
 const near=JSON.parse(before);
 near.events.forEach((ev,i)=>{ev.elapsed=67+i;});
 assert.equal(new Set(Array.from(run(near),ev=>ev.assistName)).size,count);
 assert(run(near).every(ev=>ev.assistName));
 // 자동 매칭은 이전 화면 데이터가 아닌 현재 응답으로 묶음을 판정한다.
 c.window._eventsLastData={matchInfo:{fixtureId:2},events:[]};
 assert(run(near).every(ev=>ev.assistName));
 c.window._eventsLastData=near;
 assert.equal(c.evSubstCluster(near.events[0]).length,count);
 delete c.window._eventsLastData;
 if (count===3) {
  near.events[1].assistName='Played 1';
  assert(run(near).every(ev=>ev.assistName));
  assert.equal(new Set(Array.from(run(near),ev=>ev.assistName)).size,count);
 }
 const added=JSON.parse(before);
 added.events[0].extra=1;
 assert(run(added).every(ev=>ev.assistName));
 // 분 합계가 가까워도 전반 추가시간과 후반은 합치지 않는다.
 const boundary=JSON.parse(before);
 boundary.events.forEach((ev,i)=>{ev.elapsed=i===0 ? 45 : 46;ev.extra=i===0 ? 1 : null;});
 boundary.playerStats.filter(p=>p.minutes===23).forEach(p=>{p.minutes=45;});
 assert(run(boundary).every(ev=>!ev.assistName));
}
console.log('PASS simultaneous substitution groups: complete played set, stable pairing, timing isolation, candidate counts, existing links and editability');

// 이름 순서보다 보정된 관측 시점의 정확한 출전 시간을 우선하고, 나머지만 기존 순서로 배정한다.
{
 const make=(times,players,observed=90)=>({
  matchInfo:{fixtureId:1490540,elapsed:90},
  awayLineup:{startXi:[{playerId:1,name:'Starter'}],substitutes:players.map(([name])=>({playerId:0,name}))},
  playerStats:[{side:'away',playerId:1,minutes:observed,rating:'6.5'},
   ...players.map(([name,minutes])=>({side:'away',playerId:0,playerName:name,minutes,rating:'6.4'}))],
  events:times.map((elapsed,i)=>({type:'subst',side:'away',elapsed,playerId:10+i,assistId:null})),
 });
 const incoming=data=>Array.from(run(data),ev=>ev.assistName);
 for (const observed of [90,88]) {
  const data=make([68,69],[['A later',observed-69],['Z earlier',observed-68]],observed);
  const before=JSON.stringify(data);
  assert.deepEqual(incoming(data),['Z earlier','A later']);
  const reversed=JSON.parse(before);reversed.events.reverse();reversed.awayLineup.substitutes.reverse();
  assert.deepEqual(incoming(reversed),['A later','Z earlier']);
  run(data).forEach((ev,i)=>{
   assert.equal(ev.assistId,null);
   assert(c.evSubstHasUnlinkedId(ev,'assist'));
   assert.equal(c.evSubstEventKey(ev),c.evSubstEventKey(data.events[i]));
  });
  assert.equal(JSON.stringify(data),before);
  // 정확히 맞는 후보가 있어도 후보 수와 다른 교체와의 중복 검증은 유지한다.
  const excess=JSON.parse(before);
  excess.awayLineup.substitutes.push({playerId:0,name:'Extra'});
  excess.playerStats.push({side:'away',playerId:0,playerName:'Extra',minutes:observed-68,rating:'6.0'});
  assert(incoming(excess).every(name=>!name));
  const overlap=JSON.parse(before);
  overlap.events.push({type:'subst',side:'away',elapsed:71,playerId:50,assistId:null});
  assert(incoming(overlap).every(name=>!name));
  // API와 수동 연결은 시간상 더 잘 맞는 후보가 있어도 우선한다.
  const named=JSON.parse(before);named.events[0].assistName='A later';
  assert.deepEqual(incoming(named),['A later','Z earlier']);
  stored={1490540:{[c.evSubstEventKey(data.events[0])]:{assist:{playerId:0,name:'A later'}}}};
  assert.deepEqual(incoming(data),['A later','Z earlier']);stored={};
 }
 assert.deepEqual(incoming(make([68,69,69],[['A tied',21],['B tied',21],['Z exact',22]])),['Z exact','A tied','B tied']);
 assert.deepEqual(incoming(make([68,68],[['A tied',22],['Z tied',22]])),['A tied','Z tied']);
 for (const minutes of [null,undefined,0]) {
  assert.deepEqual(incoming(make([89,90],[['A rating only',minutes],['Z played',2]])),['A rating only','Z played']);
 }
 console.log('PASS exact substitution timing: reversed name order, stat lag, ties, rating-only data, candidate guards, manual precedence and editable identity');
}
