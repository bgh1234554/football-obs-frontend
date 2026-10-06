const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const extract=(p,name,end)=>{const s=read(p);return s.slice(s.indexOf('function '+name+'('),s.indexOf(end,s.indexOf('function '+name+'(')));};
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
