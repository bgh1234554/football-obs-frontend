const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('node:path');
/** 저장소 루트 기준 경로의 파일 내용을 읽는다. */
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
// 이전 기본 배율은 한 번만 전환하며, 다른 배율과 전환 후 수동 선택은 보존한다.
{
 for(const saved of [null,{boardScale:75},{boardScale:90},{boardScale:75,boardScaleDefault85Migrated:true}]){
  let stored=JSON.stringify(saved);
  const load=()=>{
   const context={console,$:()=>null,clampNum:(v,min,max,fallback)=>Math.min(max,Math.max(min,Number(v)||fallback)),expireStalePkState(){},localStorage:{getItem:()=>stored,setItem:(key,value)=>{stored=value;}}};
   vm.runInNewContext(read('js/core/state.js')+'\nrestore();globalThis.result=state;',context);
   return context;
  };
  const context=load();
  assert.equal(context.result.boardScale,saved?.boardScaleDefault85Migrated?75:saved?.boardScale===90?90:85);
  assert.equal(context.result.boardScaleDefault85Migrated,true);
  assert.equal(context.result.boardScaleFullscreen,saved?.boardScaleDefault85Migrated?75:saved?.boardScale===90?90:100);
  // 사용자가 75%로 되돌려 저장한 뒤 새로고침해도 재전환하지 않는다.
  context.result.boardScale=75;
  context.result.boardScaleFullscreen=110;
  context.persist();
  assert.equal(load().result.boardScale,75);
  assert.equal(load().result.boardScaleFullscreen,110);
 }
 // 모드별 기본값도 저장 당시 기본값과 같은 값만 새 기본값으로 이전한다.
 for (const fullscreen of [85,95]) {
  const stored={boardScale:85,boardScaleFullscreen:fullscreen,boardScaleDefault85Migrated:true,boardScaleDefaults:{windowed:85,fullscreen:85}};
  const context={console,$:()=>null,clampNum:(v,min,max,fallback)=>Math.min(max,Math.max(min,Number(v)||fallback)),expireStalePkState(){},localStorage:{getItem:()=>JSON.stringify(stored),setItem(){}}};
  vm.runInNewContext(read('js/core/state.js')+'\nrestore();globalThis.result=state;',context);
  assert.equal(context.result.boardScale,85);
  assert.equal(context.result.boardScaleFullscreen,fullscreen===85?100:95);
 }
}
// 누적 퇴장 추정은 카드 종류만 바꾸며, 사유와 API 원본은 그대로 보존한다.
{
 const api={window:{},document:{addEventListener(){},querySelectorAll(){return[];}},localStorage:{getItem(){return null;}}};
 vm.runInNewContext(read('js/panels/events-panel.js'),api);
 const yellow={type:'Card',detail:'Yellow Card',playerId:1,elapsed:30,comments:'Dissent'};
 const red={type:'Card',detail:'Red Card',playerId:1,elapsed:70};
 for(const comments of [null,'Foul','Violent conduct']){
  const events=[yellow,{...yellow,elapsed:70},{...red,comments}];const original=JSON.stringify(events);
  const result=api.evProcess(events).find(event=>event.elapsed===70);
  assert.equal(api.evLabelKo(result),'경고 누적 퇴장');
  assert.equal(api.evStyle(result).icon,'cumulative-red');
  assert.equal(result.comments,comments);assert.equal(JSON.stringify(events),original);
 }
 for(const events of [[yellow,red],[red],[yellow,{...red,_evEdited:true}],[{...yellow,playerId:0},{...red,playerId:0}]]){
  assert.equal(api.evLabelKo(api.evProcess(events)[0]),'퇴장');
 }
 for (const events of [[yellow,red,{...yellow,elapsed:70}], [yellow,{...yellow,elapsed:60},red]]) {
  const result=api.evProcess(events);
  assert.equal(api.evLabelKo(result[0]),'경고 누적 퇴장');
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
 const defaults=source.slice(0,source.indexOf('function isDashboardFullscreen()'));
 const load=extract('js/settings/settings-popup.js','loadSettings','function saveSettings()');
 for(const key of ['current','legacy']) for(const presets of [null,{}, {bgPreset:'charcoal'}, {lightBgPreset:'sky-glass'}, {bgPreset:'team'}, {bgPreset:'off',lightBgPreset:'off'}, {bgImageUrl:'https://example.com/background.jpg'}, {bgImageData:'data:image/png;base64,example'}, {bgPreset:'stadium',lightBgPreset:'stadium-day'}]){
  let stored=presets===null?null:{...presets};let current=key==='current'?stored:null,legacy=key==='legacy'?stored:null;
  const context={SETTINGS_STORAGE_KEY:'current',SETTINGS_LEGACY_STORAGE_KEYS:['legacy'],applyLayoutSettings(){},clampPercent:n=>Number(n),isValidSetting:(category,value)=>value!==undefined,
   localStorage:{getItem:k=>JSON.stringify(k==='obs.settings.v3'?current:legacy),removeItem:k=>{if(k==='obs.settings.v2')legacy=null;}},getSetting:category=>context.state[category],saveSettings:()=>{current={...context.state,_defaults:context.settingsDefaultSnapshot()};return true;}};
  vm.runInNewContext(defaults+';globalThis.state=settingsState;'+load,context);
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
// 매 배포의 기본값을 저장하고, 저장값이 직전 기본값과 같을 때만 다음 기본값으로 이동한다.
{
 const source=read('js/settings/settings-popup.js');
 const core=source.slice(0,source.indexOf('/**\n * category 하나가 바뀌었을 때'));
 function session(payload) {
  let stored=payload==null?null:JSON.stringify(payload), fail=false;
  const context={console:{warn(){}},fullscreen:false,requestAnimationFrame(){},
   CustomEvent:class{},document:{dispatchEvent(){},querySelector(){return null;}},
   applyLayoutSettings(){},applySettingSideEffects(){},emitSettingsChange(){},
   localStorage:{getItem(){return stored;},setItem(key,value){if(fail)throw Error('quota');stored=value;},removeItem(){stored=null;}}};
  vm.createContext(context);
  vm.runInContext(core+'\nsyncSettingUi=()=>{};isDashboardFullscreen=()=>fullscreen;globalThis.values=settingsState;globalThis.defaults=SETTINGS_DEFAULTS;globalThis.fullDefaults=DASHBOARD_FULLSCREEN_DEFAULTS;loadSettings();',context);
  return {context,stored:()=>JSON.parse(stored),fail:value=>{fail=value;}};
 }
 for(const value of [100,110,125,200]) {
  const s=session({eventSpotlightScale:value});
  assert.equal(s.context.values.eventSpotlightScale,value===100?125:value);
  assert.equal(s.stored()._defaults.eventSpotlightScale,125);
  s.context.defaults.eventSpotlightScale=150;s.context.loadSettings();
  assert.equal(s.context.values.eventSpotlightScale,[100,125].includes(value)?150:value);
  s.context.defaults.eventSpotlightScale=175;s.context.loadSettings();
  assert.equal(s.context.values.eventSpotlightScale,[100,125].includes(value)?175:value);
 }
 // 중간 버전을 건너뛰어도 최초 이력이 없는 100은 당시 기본값으로 판별한다.
 const skipped=session({eventSpotlightScale:100});
 skipped.context.defaults.eventSpotlightScale=200;
 const legacy={eventSpotlightScale:100};
 skipped.context.localStorage.setItem('obs.settings.v3',JSON.stringify(legacy));skipped.context.loadSettings();
 assert.equal(skipped.context.values.eventSpotlightScale,200);
 // 기본값 이력이 있는 사용자도 중간 배포를 거치지 않고 최신 기본값으로 바로 이동한다.
 for (const value of [125,110]) {
  const tracked=session(null);tracked.context.setSetting('eventSpotlightScale',value);
  tracked.context.defaults.eventSpotlightScale=200;tracked.context.loadSettings();
  assert.equal(tracked.context.values.eventSpotlightScale,value===125?200:110);
 }
 // 수동 선택 기록 대신 값만 비교하므로 새 기본값과 같아진 값은 그 다음 기본값 변경을 따른다.
 const converged=session(null);converged.context.setSetting('eventSpotlightScale',110);
 converged.context.defaults.eventSpotlightScale=110;converged.context.loadSettings();
 converged.context.defaults.eventSpotlightScale=150;converged.context.loadSettings();
 assert.equal(converged.context.values.eventSpotlightScale,150);
 // 100으로 직접 되돌렸더라도 직전 기본값 125와 다르면 이후 업데이트에서 유지한다.
 const s=session({eventSpotlightScale:100});
 s.context.setSetting('eventSpotlightScale',100);
 s.context.defaults.eventSpotlightScale=150;s.context.loadSettings();
 assert.equal(s.context.values.eventSpotlightScale,100);
 s.context.resetPanelFontSetting('eventSpotlightScale');
 s.context.defaults.eventSpotlightScale=175;s.context.loadSettings();
 assert.equal(s.context.values.eventSpotlightScale,175);
 // 다른 항목의 저장도 기본값 이력을 보존하며 숫자/선택값/색상에 동일한 규칙을 적용한다.
 const generic=session(null);generic.context.setSetting('scorer','short');
 Object.assign(generic.context.defaults,{bgAlpha:30,lineupShowRating:'off',panelColor:'#112233'});
 generic.context.loadSettings();
 assert.equal(generic.context.values.bgAlpha,30);
 assert.equal(generic.context.values.lineupShowRating,'off');
 assert.equal(generic.context.values.panelColor,'#112233');
 assert.equal(generic.context.values.scorer,'short');
 generic.context.setSetting('bgAlpha',10);
 generic.context.defaults.bgAlpha=40;generic.context.loadSettings();
 assert.equal(generic.context.values.bgAlpha,10);
 // 일반/라이트 모드와 전체화면 기본값은 각각 비교한다.
 const modes=session(null);modes.context.setSetting('panelAlpha',45);
 modes.context.setSetting('uiMode','light');modes.context.setSetting('panelAlpha',25);
 modes.context.defaults.panelAlpha=35;modes.context.defaults.lightPanelAlpha=30;modes.context.loadSettings();
 assert.equal(modes.context.values.panelAlpha,45);assert.equal(modes.context.values.lightPanelAlpha,30);
 modes.context.fullscreen=true;modes.context.resetPanelFontSetting('lineupNameSize');
 modes.context.fullDefaults.lineupNameSize=18;modes.context.loadSettings();
 assert.equal(modes.context.getSetting('lineupNameSize'),18);
 modes.context.setSetting('lineupNameSize',17);
 modes.context.fullDefaults.lineupNameSize=20;modes.context.loadSettings();
 assert.equal(modes.context.getSetting('lineupNameSize'),17);
 // 대시보드 전체화면 경기 스탯은 16px가 기본이고, 일반 화면에서 직접 바꾼 크기는 그대로 이어 쓴다.
 const stats=session(null);
 assert.equal(stats.context.getSetting('statsNameSize'),12);
 stats.context.fullscreen=true;assert.equal(stats.context.getSetting('statsNameSize'),16);
 stats.context.fullscreen=false;stats.context.setSetting('statsNameSize',14);
 stats.context.fullscreen=true;assert.equal(stats.context.getSetting('statsNameSize'),14);
 stats.context.resetPanelFontSetting('statsNameSize');assert.equal(stats.context.getSetting('statsNameSize'),16);
 stats.context.fullscreen=false;assert.equal(stats.context.getSetting('statsNameSize'),14);
 // 저장 실패는 이전 저장값/이력을 지키며, 다음 로드에서 이전을 다시 시도한다.
 const before=s.stored();s.fail(true);s.context.defaults.eventSpotlightScale=200;s.context.loadSettings();
 assert.deepEqual(s.stored(),before);s.fail(false);s.context.loadSettings();
 assert.equal(s.stored().eventSpotlightScale,200);
 console.log('PASS settings default migration: legacy, successive/skipped updates, custom values, resets, modes and save failure');
}
// 목차 링크와 실제 중계 화면 제목은 같은 slug로 연결되어야 한다.
{
 const context={};vm.runInNewContext(extract('js/core/init.js','aboutSlug','function buildAboutTabs('),context);
 const markdown=read('guide/about.md');
 // 안내서의 상대 경로 이미지는 같은 배포 폴더 안에 실제로 있어야 합니다.
 const guideRoot=path.resolve(__dirname,'../../guide');
 for(const [,image] of markdown.matchAll(/(?:\]\(|src=")(images\/[^)" ]+)/g)) {
  assert(fs.existsSync(path.join(guideRoot,image)), `missing guide image: ${image}`);
 }
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
// 경고 한 장 뒤 직접 퇴장과 경고 두 장 뒤 누적 퇴장은 라인업에서도 구분한다.
for (const count of [1,2]) {
 const cards=Array.from({length:count},(_,i)=>({type:'Card',detail:'Yellow Card',playerId:367637,side:'home',elapsed:66+i}));
 cards.push({type:'Card',detail:'Red Card',playerId:367637,side:'home',elapsed:77});
 const info=Array.from(c.lpAggregatePlayerEvents(cards).values())[0];
 assert.equal(info.red.isCumulative,count===2);
 assert.equal(c.lpCardKind(info),count===2?'cumulative':'red');
}
for(const side of ['home','away']){const other=side==='home'?'away':'home';const name='Player';const events=[{type:'Goal',detail:'Own Goal',side,playerId:0,playerName:name},{type:'Goal',detail:'Normal Goal',side,playerId:0,playerName:name},{type:'Goal',detail:'Own Goal',side,playerId:42,playerName:name}];const m=c.window.lpAggregatePlayerEvents(events);assert.equal(m.get(c.window.lpEventPersonKey(0,other,name)).ownGoals.length,1);assert.equal(m.get(c.window.lpEventPersonKey(0,side,name)).goals.length,1);assert.equal(m.get('42').ownGoals.length,1);}
// 저장 예산 이내의 로고 파일은 FileReader로 읽은 원본 데이터 URL을 유지합니다.
const logo=extract('js/theme/theme.js','readLogoFile','  // [이벤트 등록]');
(async()=>{for(const size of [100,1800,1801]){let compressed=0,result;class FileReader{readAsDataURL(){this.result='original';this.onload();}}const c={BG_IMAGE_SAFE_PERSIST_BYTES:1800,FileReader,compressBackgroundImage:async()=>{compressed++;return 'compressed';},file:{type:'image/png',size},cb:v=>result=v};vm.runInNewContext(logo+';readLogoFile(file,cb)',c);await new Promise(r=>setImmediate(r));assert.equal(compressed,size>1800?1:0);assert.equal(result,size>1800?'compressed':'original');}
// Escape의 기본 동작이 취소되면 닫지 않고, 기존 닫기 지연을 유지합니다.
const s=read('js/core/popout.js'),start=s.indexOf("window.addEventListener('keydown', event => {");const listener=s.slice(start,s.indexOf('\n    });',start)+8);let handler,closes=0;vm.runInNewContext(listener,{window:{addEventListener:(t,h)=>handler=h,close:()=>closes++},setTimeout:(cb,delay)=>{assert.equal(delay,50);cb();}});handler({key:'Enter'});handler({key:'Escape',defaultPrevented:true});assert.equal(closes,0);handler({key:'Escape',defaultPrevented:false});assert.equal(closes,1);console.log('PASS quota ordering, suppressed nicknames, own-goal identity, logo budget and Escape handling');})().catch(e=>{console.error(e);process.exitCode=1});
