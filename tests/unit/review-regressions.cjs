const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('node:path');
/** 저장소 루트 기준 경로의 파일 내용을 읽는다. */
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
// 누적 퇴장 추정은 카드 종류만 바꾸며, 사유와 API 원본은 그대로 보존한다.
{
 const api={window:{},document:{addEventListener(){},querySelectorAll(){return[];}},localStorage:{getItem(){return null;}}};
 vm.runInNewContext(read('js/panels/events-panel.js'),api);
 const yellow={type:'Card',detail:'Yellow Card',playerId:1,elapsed:30,comments:'Dissent'};
 const red={type:'Card',detail:'Red Card',playerId:1,elapsed:70};
 for(const comments of [null,'Foul','Violent conduct']){
  const events=[yellow,{...red,comments}];const original=JSON.stringify(events);
  const result=api.evProcess(events).find(event=>event.elapsed===70);
  assert.equal(api.evLabelKo(result),'경고 누적 퇴장');
  assert.equal(api.evStyle(result).icon,'cumulative-red');
  assert.equal(result.comments,comments);assert.equal(JSON.stringify(events),original);
 }
 for(const events of [[red],[yellow,{...red,_evEdited:true}],[{...yellow,playerId:0},{...red,playerId:0}]]){
  assert.equal(api.evLabelKo(api.evProcess(events)[0]),'퇴장');
 }
 assert.equal(api.evLabelKo(api.evProcess([{...red,detail:'Second Yellow Card',_evEdited:true}])[0]),'경고 누적 퇴장');
}
/** 파일 p에서 function name( 부터 end 문자열 직전까지의 소스를 잘라낸다. */
const extract=(p,name,end)=>{const s=read(p);return s.slice(s.indexOf('function '+name+'('),s.indexOf(end,s.indexOf('function '+name+'(')));};
// 실제 선발·백업 명단에 있는 선수의 미등록·차출 정보는 제외하고, 명단 밖 정보는 유지한다.
{
 const context={};
 vm.runInNewContext(read('js/data/injury-reason.js')+'\n'+read('js/lineup/lineup-data.js')+'\n'+extract('js/lineup/lineup-render.js','getInjuryCategoryRank','/** 미출전 선수'),context);
 for(const side of ['home','away']) for(const reason of ['Off the roster','  OFF THE ROSTER  ','National Team','International duty']){
  const injuries=[1,2,3,0].map(playerId=>({playerId,reason,type:'Missing Fixture'}));
  const data={[side+'Lineup']:{startXi:[{playerId:'1'}],substitutes:[{playerId:2}]},[side+'Injuries']:injuries};
  context.reconcileInjuriesAgainstLineup(data);
  assert.deepEqual(Array.from(data[side+'Injuries'],p=>p.playerId),[3,0]);
  const missing={[side+'Injuries']:injuries};
  context.reconcileInjuriesAgainstLineup(missing);
  assert.equal(missing[side+'Injuries'],injuries);
 }
}
// 기존 설정에 배경 선택이 없으면 새 기본값을 쓰되, 직접 고른 값과 팀 무드 이전은 유지한다.
{
 const source=read('js/settings/settings-popup.js');
 const start=source.indexOf('const SETTINGS_DEFAULTS =');
 const defaults=source.slice(start,source.indexOf('\n};',start)+3);
 const load=extract('js/settings/settings-popup.js','loadSettings','function saveSettings()');
 for(const key of ['current','legacy']) for(const presets of [null,{}, {bgPreset:'charcoal'}, {lightBgPreset:'sky-glass'}, {bgPreset:'team'}, {bgPreset:'off',lightBgPreset:'off'}, {bgImageUrl:'https://example.com/background.jpg'}, {bgImageData:'data:image/png;base64,example'}, {bgPreset:'stadium',lightBgPreset:'stadium-day'}]){
  let stored=presets===null?null:{...presets};let current=key==='current'?stored:null,legacy=key==='legacy'?stored:null;
  const context={SETTINGS_STORAGE_KEY:'current',SETTINGS_LEGACY_STORAGE_KEYS:['legacy'],applyLayoutSettings(){},clampPercent:n=>Number(n),isValidSetting:(category,value)=>value!==undefined,
   localStorage:{getItem:k=>JSON.stringify(k==='current'?current:legacy),removeItem:k=>{if(k==='legacy')legacy=null;}},getSetting:category=>context.state[category],saveSettings:()=>{current={...context.state};return true;}};
  vm.runInNewContext(defaults+';globalThis.state={...SETTINGS_DEFAULTS};globalThis.settingsState=state;'+load,context);
  const fresh={bgPreset:context.state.bgPreset,lightBgPreset:context.state.lightBgPreset};
  for(let reload=0;reload<2;reload++){
   vm.runInNewContext('Object.assign(settingsState, SETTINGS_DEFAULTS);loadSettings();',context);
   assert.equal(context.state.bgPreset,presets===null?fresh.bgPreset:presets.bgPreset==='team'?'off':presets.bgPreset??fresh.bgPreset);
   assert.equal(context.state.lightBgPreset,presets===null?fresh.lightBgPreset:presets.lightBgPreset??fresh.lightBgPreset);
   if(presets?.bgPreset==='team')assert.equal(context.state.bgTeamDirection,'mood');
   for(const category of ['bgImageUrl','bgImageData'])if(presets?.[category])assert.equal(context.state[category],presets[category]);
  }
 }
}
// 목차 링크와 실제 중계 화면 제목은 같은 slug로 연결되어야 한다.
{
 const context={};vm.runInNewContext(extract('js/core/init.js','aboutSlug','function buildAboutTabs('),context);
 const markdown=read('about.md');
 const heading=markdown.match(/^### (.*중계 화면.*)$/m)[1];
 const target=markdown.match(/\[.*중계 화면.*\]\(#([^\)]+)\)/)[1];
 assert.equal(context.aboutSlug(heading),target);
 assert.equal(heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/ /g,'-'),target, 'GitHub에서도 같은 목차 앵커를 사용합니다.');
}
// 저장 용량 초과 시 직렬화 크기가 큰 로고부터 제외하고, 양쪽 제외는 마지막에 시도합니다.
const persist=extract('js/core/state.js','persist','  /**');
for(const larger of ['home','away'])for(const combined of [false,true]){
 const state={homeLogo:'h',homeLogoManual:'',awayLogo:'a',awayLogoManual:'',score:3};state[larger+'LogoManual']='x'.repeat(100);
 const attempts=[];const c={state,SKEY:'state',console:{warn(){}},localStorage:{setItem(k,v){const s=JSON.parse(v);attempts.push(s);if(attempts.length< (combined?4:2)){const e=new Error();e.name='QuotaExceededError';throw e;}}}};
 vm.runInNewContext(persist+';persist()',c);assert.equal(attempts[1][larger+'Logo'],'');assert.equal(attempts[1].score,3);assert.equal(state[larger+'LogoManual'].length,100);
 if(combined){const smaller=larger==='home'?'away':'home';assert.equal(attempts[2][smaller+'Logo'],'');assert.equal(attempts[3].homeLogo,'');assert.equal(attempts[3].awayLogo,'');}
}
// 닉네임 삭제 표시가 있으면 두 localStorage 맵을 모두 변경하지 않습니다.
const demote=extract('js/player/player-menu.js','demotePromotedNickname','window.demotePromotedNickname');
for(const suppressed of [false,true]){const writes=[];const promoted={'42':suppressed?'!deleted':'n:Player'};const c={PLAYER_NICKNAME_SUPPRESSED:'!deleted',PLAYER_NICKNAME_KEY:'nick',readPromotedNicknames:()=>promoted,writePromotedNicknames:m=>writes.push({...m}),localStorage:{getItem:()=>'{"42":"Nick"}',setItem:(k,v)=>writes.push(JSON.parse(v))}};vm.runInNewContext(demote+';demotePromotedNickname(42)',c);assert.equal(writes.length,suppressed?0:2);if(suppressed)assert.equal(promoted['42'],'!deleted');}
// ID가 0인 자책골은 득점자의 팀으로 집계하고, 숫자 ID 키는 유지합니다.
const c={window:{}};vm.runInNewContext(read('js/lineup/lineup-events.js'),c);
for(const side of ['home','away']){const other=side==='home'?'away':'home';const name='Player';const events=[{type:'Goal',detail:'Own Goal',side,playerId:0,playerName:name},{type:'Goal',detail:'Normal Goal',side,playerId:0,playerName:name},{type:'Goal',detail:'Own Goal',side,playerId:42,playerName:name}];const m=c.window.lpAggregatePlayerEvents(events);assert.equal(m.get(c.window.lpEventPersonKey(0,other,name)).ownGoals.length,1);assert.equal(m.get(c.window.lpEventPersonKey(0,side,name)).goals.length,1);assert.equal(m.get('42').ownGoals.length,1);}
// 저장 예산 이내의 로고 파일은 FileReader로 읽은 원본 데이터 URL을 유지합니다.
const logo=extract('js/theme/theme.js','readLogoFile','  // [이벤트 등록]');
(async()=>{for(const size of [100,1800,1801]){let compressed=0,result;class FileReader{readAsDataURL(){this.result='original';this.onload();}}const c={BG_IMAGE_SAFE_PERSIST_BYTES:1800,FileReader,compressBackgroundImage:async()=>{compressed++;return 'compressed';},file:{type:'image/png',size},cb:v=>result=v};vm.runInNewContext(logo+';readLogoFile(file,cb)',c);await new Promise(r=>setImmediate(r));assert.equal(compressed,size>1800?1:0);assert.equal(result,size>1800?'compressed':'original');}
// Escape의 기본 동작이 취소되면 닫지 않고, 기존 닫기 지연을 유지합니다.
const s=read('js/core/popout.js'),start=s.indexOf("window.addEventListener('keydown', event => {");const listener=s.slice(start,s.indexOf('\n    });',start)+8);let handler,closes=0;vm.runInNewContext(listener,{window:{addEventListener:(t,h)=>handler=h,close:()=>closes++},setTimeout:(cb,delay)=>{assert.equal(delay,50);cb();}});handler({key:'Enter'});handler({key:'Escape',defaultPrevented:true});assert.equal(closes,0);handler({key:'Escape',defaultPrevented:false});assert.equal(closes,1);console.log('PASS quota ordering, suppressed nicknames, own-goal identity, logo budget and Escape handling');})().catch(e=>{console.error(e);process.exitCode=1});
