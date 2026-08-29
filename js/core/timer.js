  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [타이머] 200ms 인터벌로 경기 시간을 증가시키고 시계 텍스트를 갱신
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * running 중인 시계를 "현재 벽시계 시각"까지 한 번 당겨온다.
   * - background 탭에서도 Date.now() 기준 실제 경과 시간이 보존되도록 wall clock을 기준으로 계산
   * - tick 주기가 늦어져도 다음 sync에서 누락분을 한 번에 따라잡는다
   */
  function syncRunningClockToNow(nowWall = Date.now()) {
    if (!state.running) return;
    const lastWall = Number(state.lastRunningTickMs) || nowWall;
    const deltaSec = Math.max(0, nowWall - lastWall) / 1000;
    if (deltaSec > 0) state.seconds += deltaSec * state.secPerTick;
    el.clock.textContent = fmtClock(state.seconds);
    // 새로고침 시 끊김 없이 이어가기 위해 매 틱마다 wallclock 시각 기록.
    // (persist는 매 틱마다 안 함 — beforeunload + visibilitychange에서 한꺼번에 저장)
    state.lastRunningTickMs = nowWall;
  }

  function startClockTimer() {
    if (state.running) return;
    state.running = true;
    state.lastRunningTickMs = Date.now();
    el.clock.textContent = fmtClock(state.seconds);
  }

  function pauseClockTimer() {
    if (state.running) syncRunningClockToNow();
    state.running = false;
    state.lastRunningTickMs = 0;
    el.clock.textContent = fmtClock(state.seconds);
  }

  function toggleClockRunning() {
    if (state.running) pauseClockTimer();
    else startClockTimer();
  }

  function setClockSeconds(nextSeconds, { autoStart = false } = {}) {
    if (state.running) syncRunningClockToNow();
    state.seconds = Math.max(0, Number(nextSeconds) || 0);
    if (autoStart) startClockTimer();
    else {
      state.running = false;
      state.lastRunningTickMs = 0;
      el.clock.textContent = fmtClock(state.seconds);
    }
  }

  window.syncRunningClockToNow = syncRunningClockToNow;
  window.startClockTimer = startClockTimer;
  window.pauseClockTimer = pauseClockTimer;
  window.toggleClockRunning = toggleClockRunning;
  window.setClockSeconds = setClockSeconds;

  /** 200ms마다 호출되는 타이머 틱 — 실제 경과 시간(delta)을 계산해 seconds에 반영 */
  function tick(){
    syncRunningClockToNow();
  }
  // 200ms 인터벌로 tick 호출 (1초당 5회 → secPerTick 배율로 속도 조절)
  let timer = setInterval(tick, 200);

  // 페이지 unload 직전(새로고침/탭 닫기) 또는 background 전환 시 최신 시각 한 번 더 기록 후 persist.
  // restore에서 이 값과 현재 Date.now() 차이만큼 state.seconds에 더해줘서 끊김 없이 이어감.
  function _saveTimerCheckpoint() {
    if (state.running) {
      syncRunningClockToNow();
      try { persist(); } catch {}
    }
  }
  window.addEventListener('beforeunload', _saveTimerCheckpoint);
  window.addEventListener('pagehide', _saveTimerCheckpoint);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _saveTimerCheckpoint();
  });

  // 브라우저 탭이 background로 갔다가 visible 복귀 시 표시 시계를 즉시 현재 시각까지 당겨온다.
  // 이전 구현처럼 _lastTick을 null로 리셋하면 background 동안 누적돼야 할 delta가 통째로 사라질 수 있다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [타이머 - 인라인 시간 편집기] 시계를 더블클릭하면 분/초를 직접 입력할 수 있는 인라인 편집 UI
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const clockEl      = $('clock');
  const clockEditor  = $('clockEditor');
  const ceMin        = $('ceMin');
  const ceSec        = $('ceSec');
  const ceConfirm    = $('ceConfirm');
  const ceColon      = $('ceColon');
  const cePresets    = $('cePresets');

  // ── 시간 프리셋 드롭다운 (":" hover 시 표시) ──
  // 콜론에서 드롭다운으로 마우스를 옮기는 동안 시각적 공백(스코어박스 하단 패딩)을
  // 지나가므로, 즉시 닫지 않고 250ms 유예 후 닫음. 둘 중 하나에 다시 들어오면 취소.
  // 추가로 콜론<->프리셋 사이 공백을 이동하는 동안에는 mousemove로 "안전 영역"(둘의
  // bounding rect를 합친 사각형 + 여백) 안에 있는지 계속 확인해 hide 타이머를 취소한다.
  // (하프 화면 캠 작은 페이지 등에서 두 요소 사이 간격이 커 250ms 안에 못 넘어가면
  // 버튼에 도달하기 전에 패널이 닫혀버리는 문제 대응)
  let _cePresetHideTimer = null;
  let _ceSafeZoneMoveHandler = null;

  function ceGetSafeZoneRect() {
    if (!ceColon || !cePresets) return null;
    const a = ceColon.getBoundingClientRect();
    const b = cePresets.getBoundingClientRect();
    const pad = 12;
    return {
      left: Math.min(a.left, b.left) - pad,
      right: Math.max(a.right, b.right) + pad,
      top: a.top - pad,
      bottom: b.bottom + pad,
    };
  }

  function ceStartSafeZoneTracking() {
    if (_ceSafeZoneMoveHandler) return;
    _ceSafeZoneMoveHandler = (e) => {
      const rect = ceGetSafeZoneRect();
      if (!rect) return;
      const inside = e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside) clearTimeout(_cePresetHideTimer);
      else ceScheduleHidePresets();
    };
    document.addEventListener('mousemove', _ceSafeZoneMoveHandler);
  }

  function ceStopSafeZoneTracking() {
    if (!_ceSafeZoneMoveHandler) return;
    document.removeEventListener('mousemove', _ceSafeZoneMoveHandler);
    _ceSafeZoneMoveHandler = null;
  }

  function ceShowPresets() {
    if (!cePresets) return;
    clearTimeout(_cePresetHideTimer);
    cePresets.classList.add('open');
    ceStartSafeZoneTracking();
  }
  function ceScheduleHidePresets() {
    clearTimeout(_cePresetHideTimer);
    _cePresetHideTimer = setTimeout(() => {
      cePresets?.classList.remove('open');
      ceStopSafeZoneTracking();
    }, 250);
  }
  function ceHidePresetsNow() {
    clearTimeout(_cePresetHideTimer);
    cePresets?.classList.remove('open');
    ceStopSafeZoneTracking();
  }
  ceColon?.addEventListener('mouseenter', ceShowPresets);
  ceColon?.addEventListener('mouseleave', ceScheduleHidePresets);
  cePresets?.addEventListener('mouseenter', ceShowPresets);
  cePresets?.addEventListener('mouseleave', ceScheduleHidePresets);

  /**
   * 시계 더블클릭 시 인라인 편집기를 열고, 확인/취소/외부클릭을 처리하는 편집 세션을 시작.
   * 편집 중에는 타이머가 정지되고, 확인 후 입력된 시각으로 재개됨.
   */
  function openClockEditor() {
    // 1. 타이머 정지 및 현재 시간 분/초 분해
    const wasRunning = state.running;
    pauseClockTimer();

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
      // 편집 확정 시 항상 재생 시작. (이전엔 wasRunning 복원이라 00:00 정지 상태에서
      // 편집 후 체크 눌러도 멈춰있었음 — '시간을 정했으니 돌리자'가 자연스러움)
      setClockSeconds(mm * 60 + ss, { autoStart: true });
      closeClockEditor();
      cleanup();
      render();
      persist();
    }

    function closeClockEditor() {
      clockEditor.classList.remove('active');
      clockEl.style.display = '';
      ceHidePresetsNow();
    }

    // 체크 버튼 클릭 — applyTime + cleanup 묶어 호출.
    // (이전엔 cleanup 누락으로 keydown/mousedown 리스너가 다음 편집 세션에 중복 등록되어,
    // state.running=false 상태(스페이스 안 눌러 멈춰있을 때)에서 체크 버튼이 정상 동작 안 함)
    ceConfirm.onclick = () => { applyTime(); cleanup(); };

    // 프리셋(00:00/45:00/90:00/105:00) 클릭 — 입력값을 프리셋으로 채운 뒤
    // 수동 입력 + 체크 버튼과 완전히 동일한 경로(applyTime)로 적용 + 자동 재생
    if (cePresets) cePresets.onclick = (e) => {
      const btn = e.target.closest('.ce-preset-btn');
      if (!btn) return;
      ceMin.value = Math.max(0, parseInt(btn.dataset.min, 10) || 0);
      ceSec.value = 0;
      applyTime();
    };

    // 4. Enter로 확인, Escape로 취소 (편집 세션 키보드 이벤트)
    function onKeyDown(e) {
      if (e.key === 'Enter') { e.preventDefault(); applyTime(); cleanup(); }
      if (e.key === 'Escape') {
        if (wasRunning) startClockTimer();
        else pauseClockTimer();
        closeClockEditor();
        cleanup();
      }
    }

    // 5. 편집기 외부 클릭 시 취소
    function onOutsideClick(e) {
      if (!clockEditor.contains(e.target) && e.target !== clockEl) {
        if (wasRunning) startClockTimer();
        else pauseClockTimer();
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


