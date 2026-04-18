  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [타이머] 200ms 인터벌로 경기 시간을 증가시키고 시계 텍스트를 갱신
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 200ms마다 호출되는 타이머 틱 — running 상태일 때만 seconds를 증가시켜 시계를 업데이트 */
  function tick(){ if(!state.running) return; state.seconds += 0.2*state.secPerTick; el.clock.textContent = fmtClock(state.seconds); }
  // 200ms 인터벌로 tick 호출 (1초당 5회 → secPerTick 배율로 속도 조절)
  let timer = setInterval(tick, 200);

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
      state.running = true;
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

    ceConfirm.onclick = applyTime;

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
    if (s < 0) { s = 59; ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) - 1); }
    ceSec.value = s;
  });

  // 마우스 휠로도 분/초 조정 가능 (passive:false로 스크롤 기본 동작 방지)
  ceMin?.addEventListener('wheel', e => { e.preventDefault(); ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  ceSec?.addEventListener('wheel', e => {
    e.preventDefault();
    let s = (parseInt(ceSec.value)||0) + (e.deltaY < 0 ? 1 : -1);
    if (s > 59) { s = 0; ceMin.value = (parseInt(ceMin.value)||0) + 1; }
    else if (s < 0) { s = 59; ceMin.value = Math.max(0, (parseInt(ceMin.value)||0) - 1); }
    ceSec.value = s;
  }, { passive: false });

  // [이벤트 등록] 시계 더블클릭 → 인라인 편집기 열기
  clockEl?.addEventListener('dblclick', openClockEditor);


