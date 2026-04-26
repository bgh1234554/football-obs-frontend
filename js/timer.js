  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [타이머] 200ms 인터벌로 경기 시간을 증가시키고 시계 텍스트를 갱신
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let _lastTick = null; // performance.now() 기반 drift 방지용 — running 중단 시 null로 리셋

  /** 200ms마다 호출되는 타이머 틱 — 실제 경과 시간(delta)을 계산해 seconds에 반영 */
  function tick(){
    const now = performance.now();
    if(!state.running){ _lastTick = null; return; }
    if(_lastTick !== null){
      const delta = (now - _lastTick) / 1000;
      state.seconds += delta * state.secPerTick;
      el.clock.textContent = fmtClock(state.seconds);
    }
    _lastTick = now;
    // 새로고침 시 끊김 없이 이어가기 위해 매 틱마다 wallclock 시각 기록.
    // (persist는 매 틱마다 안 함 — beforeunload + visibilitychange에서 한꺼번에 저장)
    state.lastRunningTickMs = Date.now();
  }
  // 200ms 인터벌로 tick 호출 (1초당 5회 → secPerTick 배율로 속도 조절)
  let timer = setInterval(tick, 200);

  // 페이지 unload 직전(새로고침/탭 닫기) 또는 background 전환 시 최신 시각 한 번 더 기록 후 persist.
  // restore에서 이 값과 현재 Date.now() 차이만큼 state.seconds에 더해줘서 끊김 없이 이어감.
  function _saveTimerCheckpoint() {
    if (state.running) {
      state.lastRunningTickMs = Date.now();
      try { persist(); } catch {}
    }
  }
  window.addEventListener('beforeunload', _saveTimerCheckpoint);
  window.addEventListener('pagehide', _saveTimerCheckpoint);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _saveTimerCheckpoint();
  });

  // 브라우저 탭이 background로 갔다가 visible 복귀 시 setInterval throttle/freeze 영향으로
  // 표시 시계가 stale할 수 있음. 즉시 1회 sync해서 사용자가 "탭 돌아오니 시간 멈춤"으로
  // 인지하지 않도록 보정. (delta 누적은 performance.now 기반이라 자동 정확)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _lastTick = null;  // delta 0부터 다시 시작
      tick();
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [타이머 - 인라인 시간 편집기] 시계를 더블클릭하면 분/초를 직접 입력할 수 있는 인라인 편집 UI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const clockEl      = $('clock');
  const clockEditor  = $('clockEditor');
  const ceMin        = $('ceMin');
  const ceSec        = $('ceSec');
  const ceConfirm    = $('ceConfirm');

  /**
   * 시계 더블클릭 시 인라인 편집기를 열고, 확인/취소/외부클릭을 처리하는 편집 세션을 시작.
   * 편집 중에는 타이머가 정지되고, 확인 후 입력된 시각으로 재개됨.
   */
  function openClockEditor() {
    // 1. 타이머 정지 및 현재 시간 분/초 분해
    const wasRunning = state.running;
    state.running = false;

    const totalSec = Math.floor(state.seconds);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    ceMin.value = m;
    ceSec.value = s;

    // 2. 시계 텍스트 숨기고 편집 UI 표시
    clockEl.style.display = 'none';
    clockEditor.classList.add('active');
    ceMin.focus();
    ceMin.select();

    // 3. 확인(Enter/버튼) 시 시간 적용 후 편집기 닫기
    function applyTime() {
      const mm = Math.max(0, parseInt(ceMin.value, 10) || 0);
      const ss = Math.min(59, Math.max(0, parseInt(ceSec.value, 10) || 0));
      state.seconds = mm * 60 + ss;
      // 편집 확정 시 항상 재생 시작. (이전엔 wasRunning 복원이라 00:00 정지 상태에서
      // 편집 후 체크 눌러도 멈춰있었음 — '시간을 정했으니 돌리자'가 자연스러움)
      state.running = true;
      _lastTick = null; // delta 누적 초기화 — 다음 tick부터 정확히 시작
      clockEl.textContent = fmtClock(state.seconds);
      closeClockEditor();
      cleanup();
      render();
      persist();
    }

    function closeClockEditor() {
      clockEditor.classList.remove('active');
      clockEl.style.display = '';
    }

    // 체크 버튼 클릭 — applyTime + cleanup 묶어 호출.
    // (이전엔 cleanup 누락으로 keydown/mousedown 리스너가 다음 편집 세션에 중복 등록되어,
    // state.running=false 상태(스페이스 안 눌러 멈춰있을 때)에서 체크 버튼이 정상 동작 안 함)
    ceConfirm.onclick = () => { applyTime(); cleanup(); };

    // 4. Enter로 확인, Escape로 취소 (편집 세션 키보드 이벤트)
    function onKeyDown(e) {
      if (e.key === 'Enter') { e.preventDefault(); applyTime(); cleanup(); }
      if (e.key === 'Escape') { state.running = wasRunning; closeClockEditor(); cleanup(); }
    }

    // 5. 편집기 외부 클릭 시 취소
    function onOutsideClick(e) {
      if (!clockEditor.contains(e.target) && e.target !== clockEl) {
        state.running = wasRunning;
        closeClockEditor();
        cleanup();
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown);
      setTimeout(() => document.removeEventListener('mousedown', onOutsideClick), 0);
    }

    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
  }

  // [이벤트 등록] 시간 편집기 — 분/초 위아래 버튼 및 마우스 휠
  $('ceMinUp')?.addEventListener('click',   () => { ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) + 1); });
  $('ceMinDown')?.addEventListener('click', () => { ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) - 1); });
  $('ceSecUp')?.addEventListener('click',   () => {
    let s = (parseInt(ceSec.value)||0) + 1;
    if (s > 59) { s = 0; ceMin.value = (parseInt(ceMin.value)||0) + 1; }
    ceSec.value = s;
  });
  $('ceSecDown')?.addEventListener('click', () => {
    let s = (parseInt(ceSec.value)||0) - 1;
    const m = parseInt(ceMin.value)||0;
    // 00:00 미만으로 내려가면 wrap이 아닌 clamp — 분이 남아있으면 빌려씀
    if (s < 0) { if (m > 0) { s = 59; ceMin.value = m - 1; } else { s = 0; } }
    ceSec.value = s;
  });

  // 마우스 휠로도 분/초 조정 가능 (passive:false로 스크롤 기본 동작 방지)
  ceMin?.addEventListener('wheel', e => { e.preventDefault(); ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  ceSec?.addEventListener('wheel', e => {
    e.preventDefault();
    let s = (parseInt(ceSec.value)||0) + (e.deltaY < 0 ? 1 : -1);
    const m = parseInt(ceMin.value)||0;
    if (s > 59) { s = 0; ceMin.value = m + 1; }
    // 00:00 미만: wrap 대신 clamp
    else if (s < 0) { if (m > 0) { s = 59; ceMin.value = m - 1; } else { s = 0; } }
    ceSec.value = s;
  }, { passive: false });

  // [이벤트 등록] 시계 더블클릭 → 인라인 편집기 열기
  clockEl?.addEventListener('dblclick', openClockEditor);


