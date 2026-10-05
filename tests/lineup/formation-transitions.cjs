const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const context=vm.createContext({console}); context.window=context;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tactics=read('js/tactics/tactics.js');
vm.runInContext(tactics.slice(0,tactics.indexOf('  // ---------------------------------------------------------------')),context);
vm.runInContext('function getTacticsFormationMap(){return TACTICS_FM;} function getTacticsLabelMap(){return TACTICS_LABELS;}',context);
vm.runInContext(read('js/lineup/lineup-data.js'),context);
vm.runInContext(read('js/lineup/lineup-formation-match.js'),context);
const run=code=>vm.runInContext(code,context);
const formations=run('Object.keys(TACTICS_FM)');
const source=Array.from({length:11},(_,i)=>`p${i}`);
let cases=0;
for(const from of formations)for(const to of formations){
  const mapping=Array.from(context.getLineupFormationSlotMapping(from,to));
  if(from!==to) assert(context.getLineupFormationTransitionPath(from,to),`${from} -> ${to}: documented route`);
  assert.equal(mapping.length,11);assert.equal(new Set(mapping).size,11);
  assert.equal(mapping[0],0,`${from} -> ${to}: GK`);
  const output=Array.from(context.remapLineupFormationSlots(from,to,source));
  assert.deepEqual(output.slice().sort(),source.slice().sort());
  assert.deepEqual(Array.from(context.remapLineupFormationSlots(to,from,output)),source,`${from} -> ${to} -> ${from}`);
  const repeat=Array.from(context.remapLineupFormationSlots(from,to,source));assert.deepEqual(repeat,output);
  const vacancies=source.map((p,i)=>[0,3,9].includes(i)?null:p);
  assert.deepEqual(Array.from(context.remapLineupFormationSlots(from,to,vacancies)).sort(),vacancies.slice().sort());
  if(from===to)assert.deepEqual(output,source);
  // 문서에 정의한 유사군 안에서는 대응하는 역할과 좌우를 유지해야 한다.
  const a=context.getLineupTransitionSlots(from),b=context.getLineupTransitionSlots(to);
  // 경유 전환에서도 공통 수비 자리를 미드필더로 대체하지 않아야 한다.
  for(const role of ['GK','RB','LB','RCB','CB','LCB','RWB','LWB']) {
    const src=a.findIndex(p=>p.role===role),dst=b.findIndex(p=>p.role===role);
    if(src>=0&&dst>=0)assert.equal(mapping[dst],src,`${from} -> ${to}: shared ${role}`);
  }
  if(a.filter(p=>p.kind==='ST').length===b.filter(p=>p.kind==='ST').length) {
    b.forEach((slot,dst)=>{if(slot.kind==='ST')assert.equal(a[mapping[dst]].kind,'ST',`${from} -> ${to}: existing striker`);});
  }
  mapping.forEach((src,dst)=>assert((a[src].y-50)*(b[dst].y-50)>=0,`${from} -> ${to}: no opposite-side move`));
  const family=context.getRelatedLineupSlotMapping(from,to,a,b);
  if(family){
    mapping.forEach((src,dst)=>assert((a[src].y-50)*(b[dst].y-50)>=0,`${from} -> ${to}: side`));
    assert.deepEqual(Array.from(context.remapLineupFormationSlots(to,from,output)),source);
  }
  cases++;
}
// 역할 매칭 구현과 독립적으로 정한 예상 대응: 목적 슬롯 → 출발 슬롯.
for(const [from,to,expected] of [
 ['4-3-1-2','4-1-2-1-2',[0,1,2,3,4,6,5,7,8,9,10]],
 ['3-5-2','5-3-2',[0,4,1,2,3,8,5,6,7,9,10]],
 ['3-4-3','3-4-2-1',[0,1,2,3,4,5,6,7,8,10,9]],
 ['3-4-3','5-4-1',[0,4,1,2,3,7,8,5,6,10,9]],
 ['4-3-3','4-1-4-1',[0,1,2,3,4,6,8,5,7,10,9]],
 ['4-2-3-1','4-2-1-3',[0,1,2,3,4,5,6,8,7,10,9]],
 ['4-4-2','4-2-2-2',[0,1,2,3,4,6,7,5,8,9,10]],
 ['4-2-2-2','4-4-2',[0,1,2,3,4,7,5,6,8,9,10]],
 ['4-2-3-1','4-4-2',[0,1,2,3,4,7,5,6,9,8,10]],
 ['4-4-2','4-2-3-1',[0,1,2,3,4,6,7,5,9,8,10]],
 ['4-4-2','4-4-1-1',[0,1,2,3,4,5,6,7,8,9,10]],
 ['4-1-3-2','4-3-3',[0,1,2,3,4,7,5,8,6,9,10]],
 ['4-3-3','4-1-3-2',[0,1,2,3,4,6,8,5,7,9,10]],
 ['4-4-2','4-3-1-2',[0,1,2,3,4,5,6,8,7,9,10]],
 ['4-4-2','4-1-3-2',[0,1,2,3,4,6,5,7,8,9,10]],
 ['4-4-2','3-5-2',[0,2,6,3,1,5,7,8,4,9,10]],
 ['4-1-3-2','4-2-3-1',[0,1,2,3,4,5,7,6,9,8,10]],
 ['4-3-3','4-4-2',[0,1,2,3,4,8,6,7,10,5,9]],
 ['4-3-3','4-2-3-1',[0,1,2,3,4,6,7,8,5,10,9]],
 ['3-4-3','3-3-1-3',[0,1,2,3,4,6,7,5,8,9,10]],
 ['4-2-2-2','3-4-1-2',[0,2,5,3,1,7,6,4,8,9,10]],
 ['4-2-3-1','4-2-2-2',[0,1,2,3,4,5,6,7,9,8,10]],
 ['4-2-2-2','4-2-3-1',[0,1,2,3,4,5,6,7,9,8,10]],
 ['4-2-1-3','4-4-2',[0,1,2,3,4,8,5,6,10,7,9]],
 ['4-4-1-1','4-2-2-2',[0,1,2,3,4,6,7,5,8,9,10]]
])assert.deepEqual(Array.from(context.getLineupFormationSlotMapping(from,to)),expected,`${from} -> ${to}`);
assert.deepEqual(Array.from(context.remapLineupFormationSlots('unknown','4-3-3',source)),source);
// 검토한 이동을 합성해도 직접 선택과 같은 선수 배치가 되어야 한다.
// 4-3-3 → 3-4-3 → 5-2-3에서는 DM이 백3 중앙으로 내려가는 흐름도 유지한다.
for(const [from,to,path,expected] of [
 ['4-3-3','4-1-4-1',['4-3-3','4-1-4-1'],[0,1,2,3,4,6,8,5,7,10,9]],
 ['4-3-3','3-4-3',['4-3-3','3-4-3'],[0,2,6,3,1,5,7,4,8,9,10]],
 ['3-4-3','5-2-3',['3-4-3','5-2-3'],[0,4,1,2,3,7,5,6,8,9,10]],
 ['4-3-3','5-2-3',['4-3-3','3-4-3','5-2-3'],[0,1,2,6,3,4,5,7,8,9,10]],
 ['4-3-1-2','3-4-1-2',['4-3-1-2','3-4-1-2'],[0,2,6,3,1,5,7,4,8,9,10]],
 ['4-3-2-1','3-4-2-1',['4-3-2-1','3-4-2-1'],[0,2,6,3,1,5,7,4,8,9,10]],
 ['4-5-1','4-4-1-1',['4-5-1','4-4-1-1'],[0,1,2,3,4,5,7,8,9,6,10]],
 ['4-2-3-1','3-5-2',['4-2-3-1','3-5-2'],[0,2,5,3,1,7,6,9,4,8,10]],
 ['4-3-3','4-3-1-2',['4-3-3','4-3-1-2'],[0,1,2,3,4,5,6,7,9,8,10]],
 ['4-1-3-2','4-3-3',['4-1-3-2','4-3-3'],[0,1,2,3,4,7,5,8,6,9,10]],
 ['4-4-2','5-4-1',['4-4-2','4-3-3','3-4-3','5-4-1'],[0,1,2,6,3,4,5,9,7,8,10]],
 ['3-4-1-2','5-3-2',['3-4-1-2','3-5-2','5-3-2'],[0,4,1,2,3,7,5,6,8,9,10]],
 ['3-3-1-3','5-2-3',['3-3-1-3','3-4-3','5-2-3'],[0,4,1,2,3,6,7,5,8,9,10]],
]) {
  assert.deepEqual(Array.from(context.getLineupFormationTransitionPath(from,to).path),path);
  assert.deepEqual(Array.from(context.getLineupFormationSlotMapping(from,to)),expected,`${from} -> ${to}`);
  const direct=Array.from(context.remapLineupFormationSlots(from,to,source));
  const stepwise=path.slice(1).reduce((values,next,index)=>
    Array.from(context.remapLineupFormationSlots(path[index],next,values)),source);
  assert.deepEqual(direct,stepwise,`${from} -> ${to}: composed movement`);
}
assert(context.getLineupFormationTransitionPath('4-4-2','5-4-1'));
// 다른 유사군으로 전환해도 변경할 필요가 없는 라인은 유지해야 한다.
for(const [from,to,kept] of [
 ['4-3-3','3-4-3',['GK','RCB','LCB','RCM','LCM','RW','ST','LW']],
 ['4-1-2-3','3-4-3',['GK','RCB','LCB','RCM','LCM','RW','ST','LW']],
 ['4-2-1-3','3-3-1-3',['GK','RCB','LCB','CAM','RW','ST','LW']],
 ['3-4-3','3-3-1-3',['GK','RCB','CB','LCB','RWB','LWB','RW','ST','LW']],
 ['3-5-2','3-4-1-2',['GK','RCB','CB','LCB','RWB','LWB','RS','LS']],
 ['3-4-1-2','3-4-2-1',['GK','RCB','CB','LCB','RWB','LWB','RCM','LCM']],
 ['3-5-2','3-5-1-1',['GK','RCB','CB','LCB','RWB','LWB','RCM','CDM','LCM']],
 ['4-3-3','4-2-3-1',['GK','RB','RCB','LCB','LB','RW','ST','LW']],
 ['4-2-3-1','4-3-2-1',['GK','RB','RCB','LCB','LB','ST']],
 ['4-3-1-2','3-4-1-2',['GK','RCB','LCB','RCM','LCM','CAM','RS','LS']],
 ['4-3-2-1','3-4-2-1',['GK','RCB','LCB','RCM','LCM','RAM','LAM','ST']],
 ['4-5-1','4-4-1-1',['GK','RB','RCB','LCB','LB','RM','LCM','LM','ST']],
 ['4-2-3-1','3-5-2',['GK','RCB','LCB']],
 ['4-3-3','4-3-1-2',['GK','RB','RCB','LCB','LB','RCM','CDM','LCM']],
 ['4-1-3-2','4-3-3',['GK','RB','RCB','LCB','LB','CDM','RW']],
 ['4-1-4-1','4-4-2',['GK','RB','RCB','LCB','LB','RM','LM']],
]) {
  const a=context.getLineupTransitionSlots(from),b=context.getLineupTransitionSlots(to);
  assert.equal(context.getRelatedLineupSlotMapping(from,to,a,b),null,'must cross a family boundary');
  const map=context.getLineupFormationSlotMapping(from,to);
  for(const role of kept) assert.equal(a[map[b.findIndex(p=>p.role===role)]].role,role,`${from} -> ${to}: ${role}`);
}
// 작은 가상 사례의 모든 순열을 독립적으로 계산해 일반 배정의 최적성을 확인한다.
run("TACTICS_FM['test-a']=[{x:5,y:50},{x:14,y:10},{x:26,y:50},{x:40,y:70}]; TACTICS_FM['test-b']=[{x:5,y:50},{x:14,y:30},{x:32,y:15},{x:42,y:50}]; TACTICS_LABELS['test-a']=['GK','RB','CM','ST']; TACTICS_LABELS['test-b']=['GK','CB','RW','ST'];");
const a=context.getLineupTransitionSlots('test-a'),b=context.getLineupTransitionSlots('test-b');
function permutations(xs){return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(rest=>[x,...rest])):[[]];}
const cost=p=>p.reduce((sum,src,dst)=>sum+context.lineupFormationMoveCost(a[src],b[dst]),0);
const optimal=Math.min(...permutations([0,1,2,3]).map(cost));
assert.equal(cost(Array.from(context.getLineupFormationSlotMapping('test-a','test-b'))),optimal);
console.log(`PASS: ${cases} formation pairs; all players/vacancies/GKs preserved; documented family round trips; explicit role mappings; deterministic global optimum.`);
