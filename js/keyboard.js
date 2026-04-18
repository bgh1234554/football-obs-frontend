  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전역 키보드 단축키]
  // - Ctrl+Z/Y: Undo/Redo (전술판)
  // - Space: 타이머 시작/정지
  // - R: 타이머 리셋
  // - [ / ]: 전/후반 이동
  // - PK 하프 중 q/a (홈 골/미스), w/s (어웨이 골/미스), z Undo, x 초기화
  // - 수동 모드: q/a 홈 +/-, w/s 어웨이 +/-, F 점수 초기화, T 추가시간 토글
  // - H: 탭바 숨기기 토글
  // - \: 전술판 전체화면 (전술판 탭 활성화 시에만)
  // - 1~6: 탭 전환, 7: 경기 ID 오버레이, 8: Buy me a coffee
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  window.addEventListener('keydown', e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    // Ctrl+Z/Y: 전술판 탭이 활성화된 경우에만 undo/redo 실행
    if(e.ctrlKey && (e.key==='z'||e.key==='Z')){ if(document.getElementById('page-tactics')?.classList.contains('active')){ e.preventDefault(); tdUndo(); } return; }
    if(e.ctrlKey && (e.key==='y'||e.key==='Y')){ if(document.getElementById('page-tactics')?.classList.contains('active')){ e.preventDefault(); tdRedo(); } return; }
    if(e.code==='Space'){ e.preventDefault(); state.running=!state.running; render(); persist(); }
    if(e.key==='r'||e.key==='R'){ state.seconds=0; state.running=false; el.clock.textContent='00:00'; render(); persist(); }
    if(state.manualMode && (e.key==='f'||e.key==='F')){ resetManualScore(); }
    if(state.manualMode && (e.key==='t'||e.key==='T')){ toggleManualExtra(); }
    if(e.key==='['){ const i=Math.max(0,halfOrder.indexOf(state.half)-1); setMatchHalf(halfOrder[i]); render(); persist(); }
    if(e.key===']'){ const i=Math.min(halfOrder.length-1,halfOrder.indexOf(state.half)+1); setMatchHalf(halfOrder[i]); render(); persist(); }
    // q/a → 홈 점수 +/-, w/s → 원정 점수 +/- (수동 모드에서만 동작)
    // PSO 상태에서는 같은 키가 PK 득점/실축으로 동작 (점수 변경 없음)
    // z/x(PK undo/reset)는 PSO 상태에서만 동작
    if(state.manualMode){
      if(state.half==='PK'){
        if(e.key==='q'||e.key==='Q') pkPush('home','G');
        if(e.key==='a'||e.key==='A') pkPush('home','M');
        if(e.key==='w'||e.key==='W') pkPush('away','G');
        if(e.key==='s'||e.key==='S') pkPush('away','M');
        if(e.key==='z'||e.key==='Z') pkUndo();
        if(e.key==='x'||e.key==='X') pkReset();
      } else {
        if(e.key==='q'||e.key==='Q'){ state.homeScore++; syncManualInputs(); render(); persist(); }
        if(e.key==='a'||e.key==='A'){ state.homeScore=Math.max(0,state.homeScore-1); syncManualInputs(); render(); persist(); }
        if(e.key==='w'||e.key==='W'){ state.awayScore++; syncManualInputs(); render(); persist(); }
        if(e.key==='s'||e.key==='S'){ state.awayScore=Math.max(0,state.awayScore-1); syncManualInputs(); render(); persist(); }
      }
    }
    if(e.key==='h'||e.key==='H'){ toggleTabsAndPages(); }
    // \: 전술판 전체화면 토글 (전술판 탭 활성화 시에만)
    if(e.key==='\\' && document.getElementById('page-tactics')?.classList.contains('active')){
      tacticsToggleFullscreen();
    }
    // 1~6: 탭 전환, 7: 경기ID 입력, 8: Buy me a coffee
    const tabPages = ['main-big','main-small','theme','schedule','tactics','about'];
    if(e.key>='1'&&e.key<='6'){ activatePage(tabPages[+e.key-1]); }
    if(e.key==='7'){ document.getElementById('open-fixture-overlay')?.click(); }
    if(e.key==='8'){ window.open('https://www.buymeacoffee.com/bgh1234554','_blank'); }
  });
