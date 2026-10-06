/**
 * 이벤트 업데이트 효과 — 파일 전체를 점수판 페이지의 Console에 붙여 넣기.
 * 준비: 경기 데이터를 불러오고 이벤트 패널을 화면에 표시하세요. 필터의 '골'도 켜세요.
 * 1. 기준 화면 렌더 → 1.2초 뒤 임시 골 이벤트 추가 → 6초 뒤 최신 실제 데이터로 원복.
 * 정상: 기존 행이 밀려나고 새 행이 약 340ms 동안 진입, 약 900ms 동안 팀 색상으로 강조.
 * 첫 이벤트/다른 경기 전환은 원래 애니메이션 대상이 아닙니다.
 * 그래서 이벤트가 비어 있을 때는 기준용 골 1개를 먼저 넣고 두 번째 골로 검사합니다.
 * applyEventsPanel()의 실제 삽입 애니메이션을 사용합니다. 점수/득점자 문구는 별도 테스트입니다.
 * API-Football을 호출하거나 저장 설정을 수정하지 않습니다. 렌더러의 기존 로고/위젯 로딩은 가능.
 * 테스트 중 일반 폴링/설정 변경이 들어오면 실제 데이터를 우선하여 중단합니다.
 * 중단/원복: window.stopEventsUpdateTest(). 재실행은 파일 전체를 다시 붙여 넣기.
 */
(() => {
  window.stopEventsUpdateTest?.();
  const original = window._eventsLastData;
  if (typeof window.applyEventsPanel !== 'function' || !original?.matchInfo?.fixtureId) {
    throw new Error('경기 데이터를 먼저 불러오세요. 이벤트 패널 데이터가 없습니다.');
  }
  const visiblePanels = [...document.querySelectorAll('[data-events-panel]')]
    .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
  if (!visiblePanels.length) throw new Error('이벤트 패널이 보이는 탭/패널에서 실행하세요.');
  if (typeof evIsFilterEnabled === 'function' && !evIsFilterEnabled('goal')) {
    throw new Error('이벤트 필터에서 골을 표시하도록 켠 뒤 실행하세요.');
  }

  const base = structuredClone(original);
  base.events = Array.isArray(base.events) ? base.events : [];
  const minute = Math.max(1, Number(base.matchInfo.elapsed) || 0,
    ...base.events.map(event => Number(event.elapsed) || 0));
  const marker = `콘솔 테스트 ${Date.now()}`;
  const goal = (side, elapsed, label) => ({
    type: 'Goal', detail: 'Normal Goal', side, elapsed, extra: null,
    playerId: 0, playerName: label, playerNameKoLong: label,
    assistId: null, assistName: null, comments: null,
  });
  // FLIP 비교에 실제 이벤트 행이 최소 1개 필요합니다. 구간 구분자만 있으면 부족합니다.
  if (!visiblePanels.some(panel => panel.querySelector('.ev-row[data-ev-key]'))) {
    base.events.push(goal('home', minute, `${marker} 기준 골`));
  }
  const updated = structuredClone(base);
  updated.events.push(goal('away', minute + 1, `${marker} 새 골`));

  let running = true;
  const timers = [];
  // 화면만 임시 데이터로 렌더하고 전역 캐시는 즉시 되돌립니다.
  // 실제 폴링이 나중에 갱신한 캐시를 원복 과정에서 덮어쓰지 않습니다.
  const draw = (data, options) => {
    const cached = window._eventsLastData;
    try { window.applyEventsPanel(data, options); }
    finally { window._eventsLastData = cached; }
  };
  const stop = () => {
    if (!running) return;
    running = false;
    timers.forEach(clearTimeout);
    try { window.applyEventsPanel(window._eventsLastData, { animate: false }); }
    finally {
      if (window.stopEventsUpdateTest === stop) delete window.stopEventsUpdateTest;
    }
    console.log('[이벤트 업데이트] 최신 실제 데이터로 원복');
  };
  window.stopEventsUpdateTest = stop;
  try {
    draw(base, { animate: false });
    console.log('[이벤트 업데이트] 1.2초 뒤 원정 테스트 골이 추가됩니다.');
    timers.push(setTimeout(() => {
      if (!running) return;
      if (window._eventsLastData !== original) { stop(); return; }
      try {
        draw(updated, { animate: true });
        // 실제 렌더러가 두 번의 requestAnimationFrame 뒤 애니메이션 클래스를 붙입니다.
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!running) return;
          const rows = visiblePanels.flatMap(panel => [...panel.querySelectorAll('.ev-row-new')]);
          console.log(`[이벤트 업데이트] 새 행 강조 ${rows.length}개 감지`, rows);
        })));
      } catch (error) { stop(); console.error(error); }
    }, 1200));
    timers.push(setTimeout(stop, 6000));
  } catch (error) { stop(); throw error; }
})();
