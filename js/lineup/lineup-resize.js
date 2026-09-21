// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업/칼럼 마우스 드래그 리사이즈]
//
// 세 종류의 리사이즈를 한 파일에서 관리한다.
//
// (1) 캠 큼 페이지 라인업 패널 (.layout-big .lp-lineup)
//   - 우상단 핸들(.lp-lineup-resize)을 위/아래로 드래그.
//   - 비율(62:105) 유지한 채 height에 곱해지는 --lp-lineup-scale (50~100%) 변경.
//   - 패널은 align-self:flex-end로 아래쪽 정렬 → 핸들 위로 끌수록 위쪽으로 확장.
//   - 최종 값은 setSetting('lineupScale', n)으로 settings v3 storage에 영속화.
//
// (2) 캠 작음 페이지 좌측 문자중계/스탯 칼럼 (.layout-small .lp-col-events-stat)
//   - 우측 경계 핸들(.lp-small-col-resize)을 좌/우로 드래그.
//   - 좌(events-stat)와 우(cam-chat) 폭 비율을 동시에 조정. 라인업/벤치는 영향 없음.
//   - 더블클릭 시 기본 비율로 복원.
//   - 비율은 별도 키(obs.smallLayout.eventsStatRatio.v1)에 영속화.
//
// (3) 캠 큼 페이지 우측 칼럼(lp-col) — 너비 + 내부 패널 세로 분할
//   (a) 왼쪽 경계 핸들(.lp-big-col-resize): 드래그로 칼럼 폭 자유 조정.
//       --lp-big-col-width CSS 변수(px)로 .layout-big에 적용.
//       더블클릭 → 18% 기본값 복원.  obs.bigLayout.colWidth.v1 에 영속화.
//   (b) 패널별 개별 핸들: lp-chat-big 하단(.lp-big-chat-resize) + lp-stat 상단(.lp-big-stat-resize).
//       각 패널에서 독립적으로 높이 조정. 상대 패널은 남은 공간을 자동 흡수(겹침 불가).
//       더블클릭 → 스탯 9줄 기본 높이 복원.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LINEUP_RESIZE_MIN = 50;
const LINEUP_RESIZE_MAX = 100;
const SMALL_LAYOUT_RESIZE_STORAGE_KEY = 'obs.smallLayout.eventsStatRatio.v1';
const SMALL_LAYOUT_RATIO_MIN = 0.2;
const SMALL_LAYOUT_RATIO_MAX = 0.8;
const SMALL_LAYOUT_LEFT_MIN_PX = 220;
const SMALL_LAYOUT_RIGHT_MIN_PX = 220;
const SMALL_BENCH_HEIGHT_KEY = 'obs.smallLayout.benchHeightRatio.v1';
let smallBenchHeightRatio = (() => {
  try {
    const value = Number(localStorage.getItem(SMALL_BENCH_HEIGHT_KEY));
    return value > 0 && value < 1 ? value : null;
  } catch { return null; }
})();
let smallBenchHeightDrag = null;

/** 교체/미출전 패널은 논리 높이의 비율을 저장해 DPI·해상도 변경에도 분할을 유지한다. */
function getSmallBenchHeightMetrics() {
  const sections = getBenchPanelSections();
  const { benchColumn, benchPanel, injuryPanel } = sections;
  if (!benchColumn || !benchPanel || !injuryPanel || !benchColumn.clientHeight) return null;
  const style = getComputedStyle(benchColumn);
  const gap = parseFloat(style.rowGap) || 0;
  const available = benchColumn.clientHeight - getPanelPaddingY(benchColumn) - gap;
  if (available <= 0) return null;
  const minimum = panel => {
    const title = panel.querySelector('.dp-title');
    const header = panel.querySelector('.dp-side-header');
    const footer = panel.querySelector('.dp-bench-footer');
    const info = panel.querySelector('.dp-bench-info');
    let infoHeight = 0;
    if (info) {
      const infoStyle = getComputedStyle(info);
      infoHeight = Array.from(info.children).reduce((sum, row) => sum + getPanelOuterHeight(row), 0)
        + Math.max(0, info.children.length - 1) * (parseFloat(infoStyle.rowGap) || 0)
        + getPanelPaddingY(info) + (parseFloat(infoStyle.marginTop) || 0)
        + (parseFloat(infoStyle.borderTopWidth) || 0);
    }
    // 제목·경기 정보와 최소 한 줄의 명단을 남겨 핸들이 패널을 완전히 접지 못하게 한다.
    return getPanelPaddingY(panel) + getPanelOuterHeight(title) + getPanelOuterHeight(header)
      + getPanelOuterHeight(footer) + infoHeight + 34;
  };
  const benchMin = minimum(benchPanel);
  const injuryMin = minimum(injuryPanel);
  const fit = Math.min(1, available / (benchMin + injuryMin));
  return { ...sections, available, gap, benchMin: benchMin * fit, injuryMin: injuryMin * fit };
}

/** 자동 균형 계산의 진입점에서 호출한다. 저장값이 없으면 기존 자동 계산을 그대로 사용한다. */
function applySmallBenchHeightOverride() {
  if (smallBenchHeightRatio == null) return false;
  const metrics = getSmallBenchHeightMetrics();
  if (!metrics) return false;
  const benchHeight = Math.max(metrics.benchMin,
    Math.min(metrics.available - metrics.injuryMin, metrics.available * smallBenchHeightRatio));
  for (const [panel, height] of [[metrics.benchSection, benchHeight], [metrics.injurySection, metrics.available - benchHeight]]) {
    panel.style.flex = `0 0 ${height}px`;
    panel.style.height = `${height}px`;
  }
  return true;
}

/** 교체 명단의 실제 하단 위치에 높이 조절 핸들을 맞추고 현재 분할 비율을 접근성 속성에 반영한다. */
function updateSmallBenchHeightHandle() {
  const { benchColumn, benchSection } = getBenchPanelSections();
  const handle = benchColumn?.querySelector('.lp-small-bench-height-resize');
  if (!handle || !benchSection || !benchColumn.clientHeight) return;
  const columnRect = getDisplayLayoutRect(benchColumn);
  const benchRect = getDisplayLayoutRect(benchSection);
  const gap = parseFloat(getComputedStyle(benchColumn).rowGap) || 0;
  handle.style.top = `${benchRect.bottom - columnRect.top + gap / 2}px`;
  handle.setAttribute('aria-valuenow', String(Math.round(benchRect.height / (benchColumn.clientHeight - gap) * 100)));
}

/** 교체·미출전 패널의 저장 비율을 지우고 콘텐츠 기반 자동 높이 계산으로 돌아간다. */
function resetSmallBenchHeight() {
  smallBenchHeightRatio = null;
  try { localStorage.removeItem(SMALL_BENCH_HEIGHT_KEY); } catch {}
  balanceBenchInjuryPanelHeights();
}

/** 교체·미출전 명단 사이에 드래그·키보드 조절 및 자동 높이 복원 핸들을 한 번 생성한다. */
function ensureSmallBenchHeightHandle() {
  // 1) 중복 핸들을 막고 포커스·접근성 정보와 더블클릭 초기화를 설정한다.
  const { benchColumn } = getBenchPanelSections();
  if (!benchColumn || benchColumn.querySelector('.lp-small-bench-height-resize')) return;
  const handle = document.createElement('div');
  handle.className = 'lp-small-bench-height-resize';
  handle.title = '드래그로 높이 조절 · 더블클릭으로 초기화';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', '교체 명단과 미출전 선수 명단 높이 조절');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-controls', 'benchPanel injuryPanel');
  handle.addEventListener('dblclick', event => {
    event.preventDefault();
    resetSmallBenchHeight();
  });
  // 2) 드래그 시작 비율과 좌표를 보관한다. 종료가 취소되면 이 비율로 돌아간다.
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || smallBenchHeightDrag !== null) return;
    const metrics = getSmallBenchHeightMetrics();
    if (!metrics) return;
    event.preventDefault();
    event.stopPropagation();
    const originalRatio = smallBenchHeightRatio;
    const startY = toDisplayLayoutPixels(event.clientY);
    const startHeight = getDisplayLayoutRect(metrics.benchSection).height;
    let moved = false;
    smallBenchHeightDrag = event.pointerId;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('lp-small-bench-height-resizing');
    // 2-a) 양쪽 콘텐츠의 최소 높이를 확보하면서 교체 명단에 배분할 비율을 갱신한다.
    const move = next => {
      if (next.pointerId !== smallBenchHeightDrag) return;
      const current = getSmallBenchHeightMetrics();
      if (!current) return;
      const delta = toDisplayLayoutPixels(next.clientY) - startY;
      if (!moved && Math.abs(delta) < 1) return;
      moved = true;
      const height = Math.max(current.benchMin, Math.min(current.available - current.injuryMin, startHeight + delta));
      smallBenchHeightRatio = height / current.available;
      balanceBenchInjuryPanelHeights();
    };
    // 2-b) 포인터 추적을 정리하고, 실제로 움직인 정상 종료만 저장한다. 취소·캡처 상실은 복원한다.
    const finish = next => {
      if (next.pointerId !== smallBenchHeightDrag) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      handle.removeEventListener('lostpointercapture', finish);
      const pointerId = smallBenchHeightDrag;
      smallBenchHeightDrag = null;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      document.body.classList.remove('lp-small-bench-height-resizing');
      if (next.type !== 'pointerup') smallBenchHeightRatio = originalRatio;
      else if (moved) {
        try { localStorage.setItem(SMALL_BENCH_HEIGHT_KEY, String(smallBenchHeightRatio)); } catch {}
      }
      balanceBenchInjuryPanelHeights();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  });
  // 3) 키보드 조절은 즉시 저장하며, Enter는 자동 높이로 초기화한다.
  handle.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); resetSmallBenchHeight(); return; }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const metrics = getSmallBenchHeightMetrics();
    if (!metrics) return;
    event.preventDefault();
    const height = getDisplayLayoutRect(metrics.benchSection).height + (event.key === 'ArrowUp' ? -10 : 10);
    smallBenchHeightRatio = Math.max(metrics.benchMin, Math.min(metrics.available - metrics.injuryMin, height)) / metrics.available;
    try { localStorage.setItem(SMALL_BENCH_HEIGHT_KEY, String(smallBenchHeightRatio)); } catch {}
    balanceBenchInjuryPanelHeights();
  });
  benchColumn.appendChild(handle);
  // 경기 데이터를 아직 불러오지 않은 상태에서도 창 크기/탭 전환에 분할을 재적용한다.
  initBenchInjuryPanelObserver();
  updateSmallBenchHeightHandle();
}

// 캠 작음 이벤트/스탯 경계: 기본 스탯 9줄, 수동 조절 후에는 화면 높이 비율을 유지한다.
const SMALL_STATS_HEIGHT_KEY = 'obs.smallLayout.statsHeightRatio.v1';
let smallStatsHeightRatio = _bigLoadFraction(SMALL_STATS_HEIGHT_KEY);
let smallStatsHeightDrag = null;

/** 캠 작음 이벤트·스탯 패널의 가용 높이와 최소 높이를 구하며, 측정할 수 없으면 null을 반환한다. */
function getSmallStatsHeightMetrics() {
  const column = document.querySelector('.layout-small .lp-col-events-stat');
  const eventsPanel = column?.querySelector('.lp-events-s');
  const statPanel = column?.querySelector('.lp-stat-s');
  if (!column?.clientHeight || !eventsPanel || !statPanel) return null;
  const gap = parseFloat(getComputedStyle(column).rowGap) || 0;
  const available = column.clientHeight - gap;
  return { column, eventsPanel, statPanel, gap, available, minimum: Math.min(100, available / 2) };
}

/** 저장된 비율 또는 기본 스탯 높이로 두 패널을 배분하고 조절 핸들과 스탯 표시를 갱신한다. */
function applySmallStatsHeight() {
  const metrics = getSmallStatsHeightMetrics();
  if (!metrics) return;
  const { column, eventsPanel, statPanel, available, minimum, gap } = metrics;
  const requested = smallStatsHeightRatio == null ? stDefaultPanelHeight(statPanel) : available * smallStatsHeightRatio;
  const statHeight = Math.max(minimum, Math.min(available - minimum, requested));
  eventsPanel.style.flex = `0 0 ${available - statHeight}px`;
  statPanel.style.flex = `0 0 ${statHeight}px`;
  const handle = column.querySelector('.lp-small-stats-height-resize');
  if (handle) {
    handle.style.top = `${available - statHeight + gap / 2}px`;
    handle.setAttribute('aria-valuenow', String(Math.round(statHeight / available * 100)));
  }
  window.stRerenderActivePanels?.();
}

/** 캠 작음 스탯의 저장된 높이 비율을 지우고 기본 높이를 다시 적용한다. */
function resetSmallStatsHeight() {
  smallStatsHeightRatio = null;
  try { localStorage.removeItem(SMALL_STATS_HEIGHT_KEY); } catch {}
  applySmallStatsHeight();
}

/** 캠 작음 이벤트·스탯 높이 조절 핸들을 한 번 생성하고 드래그·키보드·크기 변경 처리를 연결한다. */
function ensureSmallStatsHeightHandle() {
  // 1) 중복 생성을 막고, 키보드로도 접근할 수 있는 패널 경계 핸들을 준비한다.
  const column = document.querySelector('.layout-small .lp-col-events-stat');
  if (!column || column.querySelector('.lp-small-stats-height-resize')) return;
  const handle = document.createElement('div');
  handle.className = 'lp-small-stats-height-resize';
  handle.title = '드래그로 높이 조절 · 더블클릭으로 초기화';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', '이벤트와 경기 스탯 높이 조절');
  handle.setAttribute('aria-orientation', 'horizontal');
  // 2) 높이는 두 패널의 최소 크기 안으로 제한한다. 저장은 가용 높이에 대한 비율로 한다.
  const save = () => {
    try { localStorage.setItem(SMALL_STATS_HEIGHT_KEY, String(smallStatsHeightRatio)); } catch {}
  };
  const setHeight = height => {
    const metrics = getSmallStatsHeightMetrics();
    if (!metrics) return;
    smallStatsHeightRatio = Math.max(metrics.minimum, Math.min(metrics.available - metrics.minimum, height)) / metrics.available;
    applySmallStatsHeight();
  };
  // 3) 더블클릭은 저장된 비율을 지워 스탯 기본 높이로 복원한다.
  handle.addEventListener('dblclick', event => {
    event.preventDefault();
    resetSmallStatsHeight();
  });
  // 4) 드래그 시작값을 보관하고 포인터를 캡처해 핸들 밖에서도 이동·종료를 받는다.
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || smallStatsHeightDrag !== null) return;
    const metrics = getSmallStatsHeightMetrics();
    if (!metrics) return;
    event.preventDefault();
    event.stopPropagation();
    const originalRatio = smallStatsHeightRatio;
    const startY = toDisplayLayoutPixels(event.clientY);
    const startHeight = getDisplayLayoutRect(metrics.statPanel).height;
    let moved = false;
    smallStatsHeightDrag = event.pointerId;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('lp-small-stats-height-resizing');
    // 4-a) 화면 좌표를 레이아웃 좌표로 환산한다. 경계를 위로 끌면 아래 스탯이 커진다.
    const move = next => {
      if (next.pointerId !== smallStatsHeightDrag) return;
      const delta = toDisplayLayoutPixels(next.clientY) - startY;
      if (!moved && Math.abs(delta) < 1) return;
      moved = true;
      setHeight(startHeight - delta);
    };
    // 4-b) 리스너와 캡처를 해제한다. 정상 종료 시 변경값을 저장하고, 취소 시 시작값으로 되돌린다.
    const finish = next => {
      if (next.pointerId !== smallStatsHeightDrag) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      handle.removeEventListener('lostpointercapture', finish);
      const pointerId = smallStatsHeightDrag;
      smallStatsHeightDrag = null;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      document.body.classList.remove('lp-small-stats-height-resizing');
      if (next.type !== 'pointerup') smallStatsHeightRatio = originalRatio;
      else if (moved) save();
      applySmallStatsHeight();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  });
  // 5) 방향키는 높이를 10씩 조절해 저장하고, Enter는 더블클릭과 같은 초기화를 수행한다.
  handle.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); resetSmallStatsHeight(); return; }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const metrics = getSmallStatsHeightMetrics();
    if (!metrics) return;
    event.preventDefault();
    setHeight(getDisplayLayoutRect(metrics.statPanel).height + (event.key === 'ArrowUp' ? 10 : -10));
    save();
  });
  // 6) 컬럼 크기·페이지·폰트가 바뀌면 다시 측정한다. 숨겨진 페이지나 폰트 로딩 전 측정값을 보정한다.
  column.appendChild(handle);
  if (typeof ResizeObserver === 'function') new ResizeObserver(applySmallStatsHeight).observe(column);
  else window.addEventListener('resize', applySmallStatsHeight);
  document.addEventListener('page:activated', () => requestAnimationFrame(applySmallStatsHeight));
  document.fonts?.ready.then(() => {
    applySmallStatsHeight();
    applyStoredBigPanelHeights();
    window.stRerenderActivePanels?.();
  });
  applySmallStatsHeight();
}

// 윈도우 리사이즈/패널 폭 변화 시 저장된 비율을 다시 적용하기 위한 옵저버.
// ResizeObserver가 없는 구형 환경은 window resize 이벤트로 fallback.
let smallLayoutResizeObserver = null;
let smallLayoutResizeFallbackBound = false;
// layout(.layout-small) → 드래그 중인 pointerId. 한 layout당 세션 1개만 허용해
// (events-stat/cam-chat 핸들 동시 조작이나 멀티터치로) 두 세션이 겹치는 것을 막는다.
const smallLayoutActiveResizePointers = new Map();

/** 큰 캠 라인업 패널마다 우하단 리사이즈 핸들을 한 번만 생성한다. */
function ensureLineupResizeHandles() {
  document.querySelectorAll('.layout-big .lp-lineup').forEach(panel => {
    if (panel.querySelector(':scope > .lp-lineup-resize')) return;
    const handle = document.createElement('div');
    handle.className = 'lp-lineup-resize';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '드래그하여 라인업 크기 조정';
    handle.addEventListener('pointerdown', startLineupResize);
    handle.addEventListener('dblclick', e => resetLineupAllSizes(e, panel));
    panel.appendChild(handle);
  });
}

/** 작은 캠 칼럼 비율을 localStorage에서 읽어 [0.2, 0.8] 범위로 클램프 후 반환. 없으면 null. */
function loadSmallLayoutResizeRatio() {
  try {
    const raw = localStorage.getItem(SMALL_LAYOUT_RESIZE_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.max(SMALL_LAYOUT_RATIO_MIN, Math.min(SMALL_LAYOUT_RATIO_MAX, value));
  } catch {
    return null;
  }
}

/** 사용자가 드래그를 끝낸 시점의 최종 비율을 localStorage에 저장. */
function saveSmallLayoutResizeRatio(ratio) {
  try {
    localStorage.setItem(SMALL_LAYOUT_RESIZE_STORAGE_KEY, String(ratio));
  } catch {}
}

/** 더블클릭으로 기본 비율 복원 시 storage 키를 제거 → 다음 로드에서 default 비율 사용. */
function clearSmallLayoutResizeRatio() {
  try {
    localStorage.removeItem(SMALL_LAYOUT_RESIZE_STORAGE_KEY);
  } catch {}
}

/**
 * 작은 캠 layout의 리사이즈 메트릭 계산.
 * 1) 4개 자식 컬럼(events-stat / lineup / bench / cam-chat) DOM 확보.
 * 2) layout 폭에서 padding/gap/lineup/bench 빼서 좌(events) + 우(chat) 합산 폭(sideWidth) 산출.
 * 3) 좌/우 각각의 최소 폭(SMALL_LAYOUT_LEFT_MIN_PX/RIGHT_MIN_PX)을 sideWidth에 맞게 보정.
 * 4) sideWidth가 left+right 최소 폭보다 작으면 리사이즈 불가능 → null.
 *
 * 반환 객체는 startSmallLayoutResize / clamp / apply에서 공통 사용.
 */
function getSmallLayoutResizeMetrics(layout) {
  if (!layout) return null;
  const eventsCol = layout.querySelector('.lp-col-events-stat');
  const lineup = layout.querySelector('.lp-lineup-s');
  const bench = layout.querySelector('.lp-col-bench');
  const chat = layout.querySelector('.lp-cam-chat');
  if (!eventsCol || !lineup || !bench || !chat) return null;

  const style = window.getComputedStyle(layout);
  const gapPx = parseFloat(style.columnGap || style.gap || '0') || 0;
  const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
  const paddingRight = parseFloat(style.paddingRight || '0') || 0;
  const innerWidth = layout.clientWidth - paddingLeft - paddingRight;
  if (innerWidth <= 0) return null;

  const lineupWidth = getDisplayLayoutRect(lineup).width;
  const benchWidth = getDisplayLayoutRect(bench).width;
  const sideWidth = innerWidth - lineupWidth - benchWidth - (gapPx * 3);
  if (sideWidth <= 0) return null;

  const leftMin = Math.min(SMALL_LAYOUT_LEFT_MIN_PX, Math.max(140, sideWidth - SMALL_LAYOUT_RIGHT_MIN_PX));
  const rightMin = Math.min(SMALL_LAYOUT_RIGHT_MIN_PX, Math.max(140, sideWidth - leftMin));
  if (sideWidth <= leftMin + rightMin) return null;

  return {
    chat,
    eventsCol,
    gapPx,
    layout,
    leftMin,
    rightMin,
    sideWidth
  };
}

/**
 * 좌측(events) 비율을 [minRatio, maxRatio] 범위로 클램프.
 * 메트릭의 left/right 최소 픽셀과 사용자 설정 최소/최대 비율 중 더 보수적인 쪽 채택.
 */
function clampSmallLayoutResizeRatio(metrics, ratio) {
  if (!metrics) return null;
  const minRatio = Math.max(SMALL_LAYOUT_RATIO_MIN, metrics.leftMin / metrics.sideWidth);
  const maxRatio = Math.min(SMALL_LAYOUT_RATIO_MAX, (metrics.sideWidth - metrics.rightMin) / metrics.sideWidth);
  return Math.max(minRatio, Math.min(maxRatio, ratio));
}

/**
 * 좌(events) 비율을 받아 layout에 좌/우 폭 CSS 변수로 적용.
 * 1) 메트릭 산출 → 비율 클램프.
 * 2) sideWidth × ratio = 좌측 폭, 나머지 = 우측 폭.
 * 3) --lp-small-events-width / --lp-small-chat-width 변수 설정 + .lp-small-columns-custom 토글로
 *    CSS가 grid template column을 fr 대신 인라인 px로 인식하도록 함.
 * 4) 적용에 성공한 실제 비율(safeRatio) 반환 — 호출자가 onMove 마지막 값 보존용으로 사용.
 */
function applySmallLayoutResizeRatio(layout, ratio) {
  const metrics = getSmallLayoutResizeMetrics(layout);
  if (!metrics) return null;
  const safeRatio = clampSmallLayoutResizeRatio(metrics, ratio);
  if (safeRatio == null) return null;
  const leftWidth = Math.round(metrics.sideWidth * safeRatio);
  const rightWidth = Math.round(metrics.sideWidth - leftWidth);
  layout.style.setProperty('--lp-small-events-width', `${leftWidth}px`);
  layout.style.setProperty('--lp-small-chat-width', `${rightWidth}px`);
  layout.classList.add('lp-small-columns-custom');
  return safeRatio;
}

/** 페이지 로드/리사이즈 시점에 저장된 비율을 모든 layout-small에 적용. 비율이 없으면 default로 reset. */
function applyStoredSmallLayoutResize() {
  const ratio = loadSmallLayoutResizeRatio();
  document.querySelectorAll('.layout-small').forEach(layout => {
    if (ratio == null) {
      resetSmallLayoutResize(layout);
      return;
    }
    applySmallLayoutResizeRatio(layout, ratio);
  });
}

/**
 * 사용자 정의 비율을 떼어내 default(CSS의 fr)로 복원.
 * 인자 없으면 모든 layout-small 대상, 인자 있으면 해당 layout만 처리.
 */
function resetSmallLayoutResize(layout = null) {
  const targets = layout ? [layout] : Array.from(document.querySelectorAll('.layout-small'));
  targets.forEach(node => {
    if (!node) return;
    node.classList.remove('lp-small-columns-custom');
    node.style.removeProperty('--lp-small-events-width');
    node.style.removeProperty('--lp-small-chat-width');
  });
}

/**
 * 작은 캠 layout의 events-stat 칼럼 우측 경계 + cam-chat 칼럼 좌측 경계에 리사이즈 핸들 생성.
 * 가운데 두 패널(라인업/벤치)은 고정 폭이라, 어느 쪽 핸들을 드래그해도 좌(events)/우(chat)
 * 비율이 완전히 같은 방식으로 조정된다(합이 일정하므로 handle 위치와 무관하게 동일한 로직).
 * - pointerdown → 드래그 세션 시작.
 * - dblclick → 기본 비율 복원.
 */
function ensureSmallLayoutResizeHandles() {
  document.querySelectorAll('.layout-small .lp-col-events-stat').forEach(panel => {
    if (panel.querySelector(':scope > .lp-small-col-resize')) return;
    const handle = document.createElement('div');
    handle.className = 'lp-small-col-resize';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '칼럼 크기 조정 · 더블클릭으로 초기화';
    handle.addEventListener('pointerdown', startSmallLayoutResize);
    handle.addEventListener('dblclick', resetSmallLayoutResizeFromHandle);
    panel.appendChild(handle);
  });
  document.querySelectorAll('.layout-small .lp-cam-chat').forEach(panel => {
    if (panel.querySelector(':scope > .lp-small-col-resize-end')) return;
    const handle = document.createElement('div');
    handle.className = 'lp-small-col-resize-end';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '칼럼 크기 조정 · 더블클릭으로 초기화';
    handle.addEventListener('pointerdown', startSmallLayoutResize);
    handle.addEventListener('dblclick', resetSmallLayoutResizeFromHandle);
    panel.appendChild(handle);
  });
}

/** 핸들 더블클릭 → 저장된 비율 제거 + 해당 layout만 default로 복원. (events-stat/cam-chat 핸들 공용) */
function resetSmallLayoutResizeFromHandle(event) {
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const layout = handle.closest('.layout-small');
  clearSmallLayoutResizeRatio();
  resetSmallLayoutResize(layout);
}

/**
 * 작은 캠 칼럼 리사이즈 드래그 세션. events-stat 우측 핸들 / cam-chat 좌측 핸들 공용.
 * 1) 좌클릭이 아니면 무시. 메트릭 못 구하면 무시.
 * 2) 시작 시점의 events 폭 + clientX를 기록해 dragX 기준점으로 사용.
 *    (두 핸들 모두 "핸들을 오른쪽으로 끌면 좌측 폭이 늘어난다"는 방향이 동일 — 가운데
 *    라인업/벤치가 고정폭이라 좌우 합이 일정하기 때문에 별도 부호 반전 없이 그대로 재사용)
 * 3) onMove: 새 메트릭으로 매번 sideWidth 재산출 후 좌측 폭을 [leftMin, sideWidth-rightMin]로 클램프.
 * 4) onUp: 핸들러 정리 + 마지막으로 적용된 비율(lastRatio)을 storage에 저장.
 *
 * pointer capture로 드래그 도중 마우스가 핸들 밖으로 나가도 이벤트 끊기지 않게 한다.
 */
function startSmallLayoutResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget;
  const layout = handle.closest('.layout-small');
  const eventsCol = layout?.querySelector('.lp-col-events-stat');
  const metrics = getSmallLayoutResizeMetrics(layout);
  if (!handle || !eventsCol || !layout || !metrics) return;
  // 같은 layout에 이미 진행 중인 드래그 세션이 있으면(다른 핸들 동시 클릭, 멀티터치 등)
  // 새 세션을 시작하지 않는다 — 두 세션이 겹치면 서로 다른 startX 기준으로 같은
  // CSS 변수를 동시에 덮어써 값이 튀는 문제가 생긴다.
  if (smallLayoutActiveResizePointers.has(layout)) return;

  const startLeft = getDisplayLayoutRect(eventsCol).width;
  const startX = toDisplayLayoutPixels(event.clientX);
  const pointerId = event.pointerId;
  let lastRatio = clampSmallLayoutResizeRatio(metrics, startLeft / metrics.sideWidth);
  if (lastRatio == null) return;

  smallLayoutActiveResizePointers.set(layout, pointerId);
  document.body.classList.add('lp-small-resizing');
  layout.classList.add('is-resizing');
  handle.setPointerCapture?.(pointerId);

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const nextMetrics = getSmallLayoutResizeMetrics(layout);
    if (!nextMetrics) return;
    const deltaX = toDisplayLayoutPixels(e.clientX) - startX;
    const nextLeft = Math.max(
      nextMetrics.leftMin,
      Math.min(nextMetrics.sideWidth - nextMetrics.rightMin, startLeft + deltaX)
    );
    const nextRatio = applySmallLayoutResizeRatio(layout, nextLeft / nextMetrics.sideWidth);
    if (nextRatio != null) lastRatio = nextRatio;
  };

  const onUp = (e) => {
    if (e && e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('lp-small-resizing');
    layout.classList.remove('is-resizing');
    handle.releasePointerCapture?.(pointerId);
    smallLayoutActiveResizePointers.delete(layout);
    saveSmallLayoutResizeRatio(lastRatio);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

/**
 * layout-small 폭 변화 감시. 변화 시 저장된 비율을 다시 적용해 px 값이 layout 폭 변화에 맞춰지게 함.
 * ResizeObserver 우선, 없으면 window resize 이벤트로 fallback (한 번만 바인드).
 */
function observeSmallLayoutResize() {
  if (typeof ResizeObserver === 'function') {
    if (!smallLayoutResizeObserver) {
      smallLayoutResizeObserver = new ResizeObserver(() => {
        if (loadSmallLayoutResizeRatio() != null) applyStoredSmallLayoutResize();
      });
    } else {
      // 이미 옵저버 있으면 재구독을 위해 disconnect → 아래 forEach에서 다시 observe.
      smallLayoutResizeObserver.disconnect();
    }
    document.querySelectorAll('.layout-small').forEach(layout => smallLayoutResizeObserver.observe(layout));
    return;
  }

  // 구형 환경 fallback. 중복 바인드 방지 플래그.
  if (!smallLayoutResizeFallbackBound) {
    smallLayoutResizeFallbackBound = true;
    window.addEventListener('resize', () => {
      if (loadSmallLayoutResizeRatio() != null) applyStoredSmallLayoutResize();
    });
  }
}

/**
 * 라인업 리사이즈 드래그 세션 시작.
 * 드래그 중에는 CSS 변수만 즉시 갱신하고, pointerup 시 최종 값을 setting으로 저장한다.
 */
function startLineupResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget;
  const panel = handle.closest('.lp-lineup');
  const layout = panel?.closest('.layout-wrap');
  if (!panel || !layout) return;

  const layoutHeight = layout.clientHeight;
  if (!layoutHeight) return;

  const storedScalePct = Number(typeof getSetting === 'function' ? getSetting('lineupScale') : 100) || 100;
  const hasEdgeOverride = panel.classList.contains('has-w-override')
    || panel.classList.contains('has-h-override');
  const currentHeightPct = Math.round((getDisplayLayoutRect(panel).height / layoutHeight) * 100);
  const startScalePct = hasEdgeOverride
    ? Math.max(
      LINEUP_RESIZE_MIN,
      Math.min(LINEUP_RESIZE_MAX, currentHeightPct || storedScalePct),
    )
    : storedScalePct;
  const saveBaselinePct = hasEdgeOverride ? startScalePct : storedScalePct;
  const startY = toDisplayLayoutPixels(event.clientY);

  panel.classList.add('is-resizing');
  document.body.classList.add('lp-lineup-resizing');
  handle.setPointerCapture?.(event.pointerId);

  let lastPct = startScalePct;
  let releasedEdgeOverrides = false;

  const onMove = (e) => {
    // 1) 포인터 이동량을 layout 높이 기준 백분율로 환산한다.
    // 위로 드래그(deltaY > 0) → 확장, 아래로 드래그(deltaY < 0) → 축소.
    const deltaY = startY - toDisplayLayoutPixels(e.clientY);
    const deltaPct = (deltaY / layoutHeight) * 100;
    let next = startScalePct + deltaPct;
    next = Math.max(LINEUP_RESIZE_MIN, Math.min(LINEUP_RESIZE_MAX, Math.round(next)));
    if (next === lastPct) return;

    // 엣지 리사이즈 뒤 남은 개별 width/height override가 있으면
    // 첫 대각선 드래그 순간에 해제해 비율 스케일이 다시 주도권을 갖게 한다.
    if (!releasedEdgeOverrides && hasEdgeOverride) {
      _lineupEdgeClear(LINEUP_EDGE_W_KEY);
      _lineupEdgeClear(LINEUP_EDGE_H_KEY);
      _lineupClearWidthOverride(panel);
      _lineupClearHeightOverride(panel);
      document.documentElement.style.setProperty('--lp-lineup-scale', String(startScalePct / 100));
      releasedEdgeOverrides = true;
    }

    lastPct = next;

    // 2) 드래그 중에는 root CSS 변수만 바꿔 미리보기를 즉시 반영한다.
    // document root에 변수 설정 → settings-popup.js의 applyLayoutSettings와 동일 위치.
    // .layout-big 별도 인라인 스타일이 있으면 root보다 우선되므로 root만 셋해도 화면 반영.
    document.documentElement.style.setProperty('--lp-lineup-scale', String(next / 100));
  };

  const onUp = () => {
    // 3) 드래그 종료 시 이벤트를 정리하고 최종 값만 저장한다.
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    panel.classList.remove('is-resizing');
    document.body.classList.remove('lp-lineup-resizing');
    handle.releasePointerCapture?.(event.pointerId);
    if (typeof setSetting === 'function' && (lastPct !== saveBaselinePct || releasedEdgeOverrides)) {
      // setSetting 내부에서 applyLayoutSettings → fitLineupNamePills 호출되므로 별도 호출 불필요.
      setSetting('lineupScale', lastPct);
    } else if (typeof window.fitLineupNamePills === 'function') {
      // 값이 안 바뀐 케이스도 혹시 모를 폭 변동 대비 pill 재계산
      requestAnimationFrame(() => window.fitLineupNamePills());
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// (3) 캠 큰 우측 패널(팬 반응 / 경기 스탯) 독립 엣지 리사이즈
//   - bigPanelLinked=on (ON):  두 패널 칼럼 꽉 채움, 너비 공유, 높이 연동
//   - bigPanelLinked=off (OFF): 각 패널 높이·너비 독립, 사이 빈 공간 가능
//   - 오른쪽 변은 항상 고정 (right: 0)
//   - 스탯 패널 하단은 항상 칼럼 바닥 고정
//   - 더블클릭: 초기화
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BIG_COL_WIDTH_KEY      = 'obs.bigLayout.colWidth.v1';
const BIG_CHAT_H_KEY         = 'obs.bigLayout.chatH.v1';
const BIG_STAT_H_KEY         = 'obs.bigLayout.statH.v1';
const BIG_CHAT_W_KEY         = 'obs.bigLayout.chatW.v1';
const BIG_STAT_W_KEY         = 'obs.bigLayout.statW.v1';
const BIG_CHAT_FRACTION_KEY  = 'obs.bigLayout.chatFraction.v1'; // 비례 스케일링용 (chatH / usable)
const BIG_LAYOUT_MIGRATED_KEY = 'obs.bigLayout.migrated.v2';    // 1회 마이그레이션 완료 플래그
const BIG_PANEL_MIN_H        = 60;
const BIG_PANEL_MIN_W        = 100;
const BIG_COL_GAP            = 6; // .lp-col { gap: 6px } — ON 모드 높이 계산 시 차감

/** 캠 큼 패널 연동 설정이 켜져 있는지 반환한다. 설정 모듈이 없으면 독립 모드를 사용한다. */
function isBigPanelLinked() {
  return typeof getSetting === 'function' ? getSetting('bigPanelLinked') !== 'off' : false;
}

// ── localStorage 헬퍼 ──
/** 저장된 패널 크기를 숫자로 읽는다. 값이 없거나 최소값 미만·비정상 숫자이면 null을 반환한다. */
function _bigLoad(key, min) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= min ? v : null;
  } catch { return null; }
}
/** 패널 크기를 정수 픽셀로 반올림해 저장한다. 저장소 접근 오류는 무시한다. */
function _bigSave(key, px) {
  try { localStorage.setItem(key, String(Math.round(px))); } catch {}
}
/** 지정한 패널 크기 저장 키를 제거한다. 저장소 접근 오류는 무시한다. */
function _bigClear(key) {
  try { localStorage.removeItem(key); } catch {}
}
/** 저장된 분할 비율이 0과 1 사이의 유한수일 때만 반환하며, 나머지는 null로 처리한다. */
function _bigLoadFraction(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 && v < 1 ? v : null;
  } catch { return null; }
}
// fraction은 소수점 값이라 _bigSave(Math.round) 경유 불가 — 직접 저장
/** 채팅 분할 비율을 소수 넷째 자리까지 저장해 창 크기가 바뀌어도 높이 비율을 유지한다. */
function _bigSaveFraction(f) {
  try { localStorage.setItem(BIG_CHAT_FRACTION_KEY, f.toFixed(4)); } catch {}
}
// 구버전에서 fraction이 Math.round로 "1"로 잘못 저장되던 버그 대응.
// 첫 로드 시 1회만 실행 — 깨진 값 감지 시 관련 크기 저장값을 지워 현재 기본 배치로 복구.
/** 구버전에서 0 또는 1로 잘못 저장한 분할 비율과 관련 레이아웃 크기를 한 번만 정리한다. */
function _bigMigrateOnce() {
  try {
    if (localStorage.getItem(BIG_LAYOUT_MIGRATED_KEY)) return;
    const raw = localStorage.getItem(BIG_CHAT_FRACTION_KEY);
    if (raw === '1' || raw === '0') {
      // big layout + 같은 시기에 저장된 라인업/캠 작은 레이아웃 크기도 함께 초기화
      [
        BIG_COL_WIDTH_KEY, BIG_CHAT_H_KEY, BIG_STAT_H_KEY, BIG_CHAT_W_KEY, BIG_STAT_W_KEY, BIG_CHAT_FRACTION_KEY,
        SMALL_LAYOUT_RESIZE_STORAGE_KEY,
        LINEUP_EDGE_W_KEY, LINEUP_EDGE_H_KEY,
      ].forEach(k => { try { localStorage.removeItem(k); } catch {} });
    }
    localStorage.setItem(BIG_LAYOUT_MIGRATED_KEY, '1');
  } catch {}
}
/** px 값을 [min, max] 범위로 클램핑. 숫자가 아니면 null, max가 min보다 작으면 min만 보장. */
function _clampPx(px, min, max) {
  const n = Number(px);
  if (!Number.isFinite(n)) return null;
  const upper = Number.isFinite(max) ? Math.max(min, max) : n;
  return Math.max(min, Math.min(upper, n));
}
/** localStorage에서 px 값을 읽어 [min, max]로 클램핑. 보정이 발생하면 보정값을 다시 저장. */
function _bigLoadClamped(key, min, max) {
  const px = _bigLoad(key, min);
  if (px == null) return null;
  const clamped = _clampPx(px, min, max);
  if (clamped != null && Math.round(clamped) !== Math.round(px)) _bigSave(key, clamped);
  return clamped;
}
/** linked 모드(칼럼 공유)에서 칼럼 최대 너비 = layout 너비의 65%. */
function _bigColMaxWidth(layout) {
  const width = Number(layout?.clientWidth) || 0;
  return width > 0 ? width * 0.65 : Infinity;
}
/** 독립(off) 모드에서 패널 최대 너비 = layout 너비의 90%. */
function _bigPanelMaxWidth(layout) {
  const width = Number(layout?.clientWidth) || 0;
  return width > 0 ? width * 0.9 : Infinity;
}
/** 현재 linked/off 모드에 맞는 칼럼 최대 너비(65%/90%)를 반환. */
function _bigStoredColMaxWidth(layout) {
  return isBigPanelLinked() ? _bigColMaxWidth(layout) : _bigPanelMaxWidth(layout);
}

// ── CSS 변수로 칼럼 너비 적용 ──
/** 캠 큼 컬럼의 공유 너비를 정수 픽셀 CSS 변수로 적용한다. */
function applyBigColWidth(layout, px) {
  if (!layout) return;
  layout.style.setProperty('--lp-big-col-width', `${Math.round(px)}px`);
}
/** 캠 큼 컬럼의 수동 너비 변수를 제거해 CSS 기본 너비로 복원한다. */
function resetBigColWidth(layout) {
  if (!layout) return;
  layout.style.removeProperty('--lp-big-col-width');
}
/** 저장된 컬럼 너비를 현재 모드의 허용 범위로 보정해 적용하고, 없으면 기본 너비로 복원한다. */
function applyStoredBigColWidth() {
  document.querySelectorAll('.layout-big').forEach(layout => {
    const px = _bigLoadClamped(BIG_COL_WIDTH_KEY, BIG_PANEL_MIN_W, _bigStoredColMaxWidth(layout));
    if (px != null) applyBigColWidth(layout, px);
    else resetBigColWidth(layout);
  });
}

// ── 패널 absolute 스타일 초기화 ──
/** 독립 배치에서 지정한 위치·크기 인라인 스타일을 제거해 flex 모드 전환을 준비한다. */
function _clearPanelAbsolute(panel) {
  ['position','top','bottom','left','right','width','height','marginTop'].forEach(p => {
    panel.style.removeProperty(p);
  });
}

// ── ON 모드: flex 기반 연동 레이아웃 ──
/** 캠 큼 채팅·스탯을 flex로 연동 배치하고, 저장된 높이가 없으면 스탯 기본 높이로 공간을 나눈다. */
function _applyLinkedMode(col) {
  // 1) 독립 모드의 absolute 크기·위치 지정을 제거해 flex 배치로 전환한다.
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  col.classList.add('is-big-linked');
  _clearPanelAbsolute(chatPanel);
  _clearPanelAbsolute(statPanel);
  const colH = getDisplayLayoutRect(col).height;
  const usable = colH - BIG_COL_GAP; // gap을 제외한 실제 패널 배분 가능 높이
  if (colH > 0) {
    // 2) 저장된 비율 → 저장된 절대 높이 → 스탯 기본 높이 순으로 채팅에 배분할 높이를 결정한다.
    // fraction은 드래그 onUp에서만 저장 — 자동 초기화 없음 (전체화면 시 잘못된 px 기반 fraction 방지)
    let chatH;
    const fraction = _bigLoadFraction(BIG_CHAT_FRACTION_KEY);
    if (fraction != null) {
      chatH = Math.round(usable * fraction);
    } else {
      chatH = _bigLoadClamped(BIG_CHAT_H_KEY, BIG_PANEL_MIN_H, usable - BIG_PANEL_MIN_H);
      if (chatH == null) chatH = usable - stDefaultPanelHeight(statPanel);
    }
    // 3) 양쪽 최소 높이를 확보하고 남은 공간을 스탯에 배분한다.
    chatH = Math.max(BIG_PANEL_MIN_H, Math.min(usable - BIG_PANEL_MIN_H, chatH));
    const statH = usable - chatH;
    chatPanel.style.flex = `0 0 ${chatH}px`;
    chatPanel.style.height = `${chatH}px`;
    statPanel.style.flex = `0 0 ${statH}px`;
    statPanel.style.height = `${statH}px`;
  } else {
    // 높이를 측정할 수 없는 동안은 이전 고정 크기를 해제해 CSS 기본 배치를 사용한다.
    chatPanel.style.removeProperty('flex');
    chatPanel.style.removeProperty('height');
    statPanel.style.removeProperty('flex');
    statPanel.style.removeProperty('height');
  }
}

// ── OFF 모드: absolute 독립 레이아웃 ──
/** 캠 큼 채팅·스탯의 개별 크기를 복원해 위아래에 절대 배치하고, 컬럼 폭을 더 넓은 패널에 맞춘다. */
function _applyIndependentMode(col) {
  // 1) 연동 모드의 flex 지정을 해제해 각 패널에 별도 크기를 적용할 준비를 한다.
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  col.classList.remove('is-big-linked');
  chatPanel.style.removeProperty('flex');
  statPanel.style.removeProperty('flex');

  // 2) 저장값이 없을 때 사용할 크기를 계산한다. 스탯 기본 높이를 먼저 확보하고 채팅에 나머지를 준다.
  const colH   = getDisplayLayoutRect(col).height;
  const colRect = getDisplayLayoutRect(col);
  const layout = col.closest('.layout-big');
  const defaultStatH = Math.max(BIG_PANEL_MIN_H, Math.min(colH - BIG_PANEL_MIN_H, stDefaultPanelHeight(statPanel)));
  const defaultChatH = Math.max(BIG_PANEL_MIN_H, colH - BIG_COL_GAP - defaultStatH);
  const defaultW = (() => {
    const stored = _bigLoadClamped(BIG_COL_WIDTH_KEY, BIG_PANEL_MIN_W, _bigStoredColMaxWidth(layout));
    if (stored) return stored;
    return colRect.width > 0 ? colRect.width : 250;
  })();

  // 3) 저장된 패널별 크기를 허용 범위 안에서 복원한다. 채팅 높이부터 정해 스탯의 최대 높이를 제한한다.
  const maxPanelW = _bigPanelMaxWidth(layout);
  const storedChatH = _bigLoadClamped(
    BIG_CHAT_H_KEY,
    BIG_PANEL_MIN_H,
    colH > 0 ? colH - BIG_PANEL_MIN_H : Infinity,
  );
  let chatH = storedChatH ?? defaultChatH;
  const storedStatH = _bigLoadClamped(
    BIG_STAT_H_KEY,
    BIG_PANEL_MIN_H,
    colH > 0 ? colH - chatH : Infinity,
  );
  let statH = storedStatH ?? defaultStatH;
  let chatW = _bigLoadClamped(BIG_CHAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW) ?? defaultW;
  let statW = _bigLoadClamped(BIG_STAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW) ?? defaultW;
  // 4) 합산 높이가 컬럼을 넘으면 스탯을 줄이고, 기존 저장값이 있었다면 보정된 높이를 저장한다.
  if (colH > 0 && chatH + statH > colH) {
    statH = Math.max(BIG_PANEL_MIN_H, colH - chatH);
    if (storedStatH != null) _bigSave(BIG_STAT_H_KEY, statH);
  }

  // 5) 채팅은 오른쪽 위, 스탯은 오른쪽 아래에 고정하고 각자 복원한 크기를 적용한다.
  Object.assign(chatPanel.style, {
    position: 'absolute', top: '0', right: '0', bottom: '', left: '',
    width: `${Math.round(chatW)}px`, height: `${Math.round(chatH)}px`,
  });
  Object.assign(statPanel.style, {
    position: 'absolute', bottom: '0', right: '0', top: '', left: '',
    width: `${Math.round(statW)}px`, height: `${Math.round(statH)}px`,
  });

  // 6) 더 넓은 패널에 컬럼 너비를 맞춰 두 패널이 모두 들어가도록 한다.
  if (layout) applyBigColWidth(layout, Math.max(chatW, statW));
}

// ── 통합 적용 함수 (mode 전환 포함) ──
/** 캠 큼 패널의 연동 설정에 맞는 배치와 저장 크기를 적용하고, 연동 전환 시 저장된 너비를 맞춘다. */
function applyStoredBigPanelHeights() {
  // 1) 현재 연동 설정을 읽고 채팅·스탯이 모두 있는 컬럼만 처리한다.
  const linked = isBigPanelLinked();
  document.querySelectorAll('.layout-big .lp-col').forEach(col => {
    const chatPanel = col.querySelector('.lp-chat-big');
    const statPanel = col.querySelector('.lp-stat');
    if (!chatPanel || !statPanel) return;

    // 2) OFF → ON 전환 시 두 너비가 모두 저장돼 있으면 좁은 쪽을 기준으로 공통 너비를 저장한다.
    if (linked && !col.classList.contains('is-big-linked')) {
      const layout = col.closest('.layout-big');
      const maxPanelW = _bigPanelMaxWidth(layout);
      const chatW = _bigLoadClamped(BIG_CHAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW);
      const statW = _bigLoadClamped(BIG_STAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW);
      if (chatW != null && statW != null) {
        const newColW = Math.max(BIG_PANEL_MIN_W, Math.min(_bigColMaxWidth(layout), chatW, statW));
        if (layout) applyBigColWidth(layout, newColW);
        _bigSave(BIG_COL_WIDTH_KEY, newColW);
      }
    }

    // 3) 선택된 모드에서 높이 복원과 실제 배치를 수행한다.
    if (linked) _applyLinkedMode(col);
    else _applyIndependentMode(col);
  });
}
window.applyStoredBigPanelHeights = applyStoredBigPanelHeights;

// ── 드래그: 칼럼 너비 (ON 모드 — lp-col 왼쪽 엣지) ──
/** 연동 모드의 공유 컬럼 너비를 왼쪽 경계 드래그로 조절하고 종료 시 크기를 저장한다. */
function startBigColWidthDrag(event, col) {
  // 1) 시작 좌표와 컬럼 너비를 레이아웃 단위로 보관하고 최대 너비를 계산한다.
  if (event.button !== 0) return;
  event.preventDefault();
  const layout = col.closest('.layout-big');
  if (!layout) return;
  const startX = toDisplayLayoutPixels(event.clientX);
  const startW = getDisplayLayoutRect(col).width;
  const maxW   = layout.clientWidth * 0.65;
  let lastW = startW;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing');
  // 2) 오른쪽 경계는 고정하고 왼쪽 이동량만 너비에 더해 CSS 변수에 적용한다.
  const onMove = (e) => {
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + (startX - toDisplayLayoutPixels(e.clientX))));
    lastW = newW;
    applyBigColWidth(layout, newW);
  };
  // 3) 종료·취소 시 추적을 해제하고 최종 너비를 저장한 뒤 콘텐츠 배치를 갱신한다.
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-big-col-resizing');
    _bigSave(BIG_COL_WIDTH_KEY, lastW);
    requestAnimationFrame(() => {
      window.stRerenderActivePanels?.();
      window.lpBenchCycleRebalanceAll?.();
    });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 드래그: 패널 너비 (OFF 모드 — 각 패널 왼쪽 엣지) ──
/** 독립 모드의 지정 패널 너비만 조절하며, 공유 컬럼은 두 패널 중 넓은 너비를 유지한다. */
function startBigPanelWidthDrag(event, col, which) {
  // 1) 대상 패널과 저장 키를 선택하고 시작 크기·최대 너비를 보관한다.
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const panel  = which === 'chat' ? chatPanel : statPanel;
  const wKey   = which === 'chat' ? BIG_CHAT_W_KEY : BIG_STAT_W_KEY;
  const layout = col.closest('.layout-big');
  if (!layout) return;
  const startX = toDisplayLayoutPixels(event.clientX);
  const startW = getDisplayLayoutRect(panel).width;
  const maxW   = layout.clientWidth * 0.9;
  let lastW = startW;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing');
  const otherPanel = which === 'chat' ? statPanel : chatPanel;
  // 2) 대상 패널만 늘리되 다른 패널이 컬럼 밖으로 밀리지 않도록 공통 컬럼 너비도 맞춘다.
  const onMove = (e) => {
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + (startX - toDisplayLayoutPixels(e.clientX))));
    lastW = newW;
    panel.style.width = `${Math.round(newW)}px`;
    applyBigColWidth(layout, Math.max(newW, getDisplayLayoutRect(otherPanel).width));
  };
  // 3) 종료 시 개별 너비와 공유 컬럼 너비를 각각 저장하고 스탯·벤치 배치를 다시 계산한다.
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-big-col-resizing');
    _bigSave(wKey, lastW);
    _bigSave(BIG_COL_WIDTH_KEY, Math.max(lastW, getDisplayLayoutRect(otherPanel).width));
    requestAnimationFrame(() => {
      window.stRerenderActivePanels?.();
      window.lpBenchCycleRebalanceAll?.();
    });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 공유 헬퍼: 패널에 높이 적용 ──
/** 패널 높이를 정수 픽셀로 적용한다. 연동 모드에서는 flex 기준 크기도 같은 값으로 고정한다. */
function _bigSetH(panel, px, linked) {
  const v = `${Math.round(px)}px`;
  if (linked) panel.style.flex = `0 0 ${v}`;
  else panel.style.removeProperty('flex');
  panel.style.height = v;
}

// ── 드래그: 패널 높이 (수직 엣지) origin: 'chatBottom' | 'statTop' ──
/** 채팅 하단 또는 스탯 상단을 드래그해 높이를 조절하며, 연동 모드에서는 반대 패널에 남은 높이를 준다. */
function startBigPanelHeightDrag(event, col, origin) {
  // 1) 드래그 방향 계산에 쓸 시작 좌표·양쪽 높이와 모드별 가용 공간을 보관한다.
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const linked     = isBigPanelLinked();
  const startY     = toDisplayLayoutPixels(event.clientY);
  const startChatH = getDisplayLayoutRect(chatPanel).height;
  const startStatH = getDisplayLayoutRect(statPanel).height;
  const colH       = getDisplayLayoutRect(col).height;
  const usable     = colH - BIG_COL_GAP;
  let lastChatH = startChatH;
  let lastStatH = startStatH;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-h-resizing');

  // 2) 잡은 경계에 따라 높이 증감 방향을 결정한다. 독립 모드는 상대 높이를 고정하고 연동은 함께 조절한다.
  const onMove = (e) => {
    const delta = toDisplayLayoutPixels(e.clientY) - startY;
    if (origin === 'chatBottom') {
      const maxChat = linked ? usable - BIG_PANEL_MIN_H : colH - startStatH;
      const newChatH = Math.max(BIG_PANEL_MIN_H, Math.min(maxChat, startChatH + delta));
      lastChatH = newChatH;
      _bigSetH(chatPanel, newChatH, linked);
      if (linked) {
        const newStatH = Math.max(BIG_PANEL_MIN_H, usable - newChatH);
        lastStatH = newStatH;
        _bigSetH(statPanel, newStatH, linked);
      }
    } else {
      // statTop: 위로 드래그(delta < 0) = stat 확장 (하단 고정, 위로 성장)
      const maxStat = linked ? usable - BIG_PANEL_MIN_H : colH - startChatH;
      const newStatH = Math.max(BIG_PANEL_MIN_H, Math.min(maxStat, startStatH - delta));
      lastStatH = newStatH;
      _bigSetH(statPanel, newStatH, linked);
      if (linked) {
        const newChatH = Math.max(BIG_PANEL_MIN_H, usable - newStatH);
        lastChatH = newChatH;
        _bigSetH(chatPanel, newChatH, linked);
      }
    }
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-big-h-resizing');
    // 3) 종료·취소 시 최종 높이를 저장한다. 연동 모드는 화면 크기 변경에 쓸 비율도 저장한다.
    _bigSave(BIG_CHAT_H_KEY, lastChatH);
    _bigSave(BIG_STAT_H_KEY, lastStatH);
    if (linked && usable > 0) _bigSaveFraction(lastChatH / usable);
    requestAnimationFrame(() => {
      window.stRerenderActivePanels?.();
      window.lpBenchCycleRebalanceAll?.();
    });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 드래그: 대각선 코너 (너비 + 높이 동시 조절) ──
// panelSide: 'chat' → chat 하단-왼쪽 코너 / 'stat' → stat 상단-왼쪽 코너
/** 패널 모서리 드래그로 너비·높이를 함께 조절하고, 연동 여부에 맞게 개별 크기 또는 공유 크기를 저장한다. */
function startBigCornerDrag(event, col, panelSide) {
  // 1) 대상 패널과 연동 모드, 시작 좌표·크기·허용 범위를 드래그 시작 시점에 고정한다.
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel  = col.querySelector('.lp-chat-big');
  const statPanel  = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const linked     = isBigPanelLinked();
  const layout     = col.closest('.layout-big');
  const startX     = toDisplayLayoutPixels(event.clientX);
  const startY     = toDisplayLayoutPixels(event.clientY);
  const panel      = panelSide === 'chat' ? chatPanel : statPanel;
  const otherPanel = panelSide === 'chat' ? statPanel : chatPanel;
  const startW     = linked ? getDisplayLayoutRect(col).width : getDisplayLayoutRect(panel).width;
  const startChatH = getDisplayLayoutRect(chatPanel).height;
  const startStatH = getDisplayLayoutRect(statPanel).height;
  const colH       = getDisplayLayoutRect(col).height;
  const usable     = colH - BIG_COL_GAP;
  const maxW       = layout ? (linked ? _bigColMaxWidth(layout) : _bigPanelMaxWidth(layout)) : window.innerWidth;
  let lastW = startW, lastChatH = startChatH, lastStatH = startStatH;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing', 'lp-big-h-resizing');

  const onMove = (e) => {
    const dx = startX - toDisplayLayoutPixels(e.clientX); // 왼쪽 드래그 = 너비 증가
    const dy = toDisplayLayoutPixels(e.clientY) - startY; // 아래 드래그 = 양수

    // 2) 가로 이동은 연동 모드에서 컬럼 전체에, 독립 모드에서는 대상 패널에만 적용한다.
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + dx));
    lastW = newW;
    if (linked) {
      if (layout) applyBigColWidth(layout, newW);
    } else {
      panel.style.width = `${Math.round(newW)}px`;
      if (layout) applyBigColWidth(layout, Math.max(newW, getDisplayLayoutRect(otherPanel).width));
    }

    // 3) 세로 이동은 채팅 하단/스탯 상단의 방향을 반영하고, 연동 모드에서는 상대 높이도 맞춘다.
    if (panelSide === 'chat') {
      // chat BL 코너: 아래로 드래그 = chat 높이 증가
      const maxChat = linked ? usable - BIG_PANEL_MIN_H : colH - startStatH;
      const newChatH = Math.max(BIG_PANEL_MIN_H, Math.min(maxChat, startChatH + dy));
      lastChatH = newChatH;
      _bigSetH(chatPanel, newChatH, linked);
      if (linked) {
        const newStatH = Math.max(BIG_PANEL_MIN_H, usable - newChatH);
        lastStatH = newStatH;
        _bigSetH(statPanel, newStatH, linked);
      }
    } else {
      // stat TL 코너: 위로 드래그(dy<0) = stat 높이 증가
      const maxStat = linked ? usable - BIG_PANEL_MIN_H : colH - startChatH;
      const newStatH = Math.max(BIG_PANEL_MIN_H, Math.min(maxStat, startStatH - dy));
      lastStatH = newStatH;
      _bigSetH(statPanel, newStatH, linked);
      if (linked) {
        const newChatH = Math.max(BIG_PANEL_MIN_H, usable - newStatH);
        lastChatH = newChatH;
        _bigSetH(chatPanel, newChatH, linked);
      }
    }

  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-big-col-resizing', 'lp-big-h-resizing');
    // 4) 추적 해제 후 모드별 너비와 양쪽 높이를 저장하고 내용물의 배치를 갱신한다.
    if (linked) {
      _bigSave(BIG_COL_WIDTH_KEY, lastW);
    } else {
      _bigSave(panelSide === 'chat' ? BIG_CHAT_W_KEY : BIG_STAT_W_KEY, lastW);
      _bigSave(BIG_COL_WIDTH_KEY, Math.max(lastW, getDisplayLayoutRect(otherPanel).width));
    }
    _bigSave(BIG_CHAT_H_KEY, lastChatH);
    _bigSave(BIG_STAT_H_KEY, lastStatH);
    if (linked && usable > 0) _bigSaveFraction(lastChatH / usable);
    requestAnimationFrame(() => {
      window.stRerenderActivePanels?.();
      window.lpBenchCycleRebalanceAll?.();
    });
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 핸들 삽입 ──
/** 캠 큼 컬럼·개별 패널·모서리의 조절 핸들을 중복 없이 생성하고 공통 더블클릭 초기화를 연결한다. */
function ensureBigPanelHandles() {
  document.querySelectorAll('.layout-big .lp-col').forEach(col => {
    const chatPanel = col.querySelector('.lp-chat-big');
    const statPanel = col.querySelector('.lp-stat');
    if (!chatPanel || !statPanel) return;

    const resetAll = (e) => {
      e.preventDefault();
      [BIG_COL_WIDTH_KEY, BIG_CHAT_H_KEY, BIG_STAT_H_KEY, BIG_CHAT_W_KEY, BIG_STAT_W_KEY, BIG_CHAT_FRACTION_KEY].forEach(_bigClear);
      resetBigColWidth(col.closest('.layout-big'));
      requestAnimationFrame(() => {
        applyStoredBigPanelHeights();
        requestAnimationFrame(() => {
          window.stRerenderActivePanels?.();
          window.lpBenchCycleRebalanceAll?.();
        });
      });
    };

    // ON 모드 전용: lp-col 왼쪽 엣지 (공유 너비)
    if (!col.querySelector(':scope > .lp-big-col-left-handle')) {
      const el = document.createElement('div');
      el.className = 'lp-big-col-left-handle';
      el.setAttribute('aria-hidden', 'true');
      el.title = '칼럼 너비 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startBigColWidthDrag(e, col));
      el.addEventListener('dblclick', resetAll);
      col.appendChild(el);
    }

    // chat: 왼쪽 엣지 (OFF 모드 전용 — chat 너비 독립)
    if (!chatPanel.querySelector(':scope > .lp-big-edge-left')) {
      const el = document.createElement('div');
      el.className = 'lp-big-edge-left';
      el.setAttribute('aria-hidden', 'true');
      el.title = '팬 반응 패널 너비 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startBigPanelWidthDrag(e, col, 'chat'));
      el.addEventListener('dblclick', resetAll);
      chatPanel.appendChild(el);
    }

    // chat: 하단-왼쪽 코너 (너비 + chat 높이 동시)
    if (!chatPanel.querySelector(':scope > .lp-big-corner-bl')) {
      const el = document.createElement('div');
      el.className = 'lp-big-corner-bl';
      el.setAttribute('aria-hidden', 'true');
      el.title = '너비·높이 동시 조절';
      el.addEventListener('pointerdown', e => startBigCornerDrag(e, col, 'chat'));
      el.addEventListener('dblclick', resetAll);
      chatPanel.appendChild(el);
    }

    // chat: 아래쪽 엣지 (chat 높이)
    if (!chatPanel.querySelector(':scope > .lp-big-chat-edge-bottom')) {
      const el = document.createElement('div');
      el.className = 'lp-big-chat-edge-bottom';
      el.setAttribute('aria-hidden', 'true');
      el.title = '드래그로 높이 조절 · 더블클릭으로 초기화';
      el.addEventListener('pointerdown', e => startBigPanelHeightDrag(e, col, 'chatBottom'));
      el.addEventListener('dblclick', resetAll);
      chatPanel.appendChild(el);
    }

    // stat: 위쪽 엣지 (stat 높이)
    if (!statPanel.querySelector(':scope > .lp-big-stat-edge-top')) {
      const el = document.createElement('div');
      el.className = 'lp-big-stat-edge-top';
      el.setAttribute('aria-hidden', 'true');
      el.title = '드래그로 높이 조절 · 더블클릭으로 초기화';
      el.addEventListener('pointerdown', e => startBigPanelHeightDrag(e, col, 'statTop'));
      el.addEventListener('dblclick', resetAll);
      statPanel.appendChild(el);
    }

    // stat: 상단-왼쪽 코너 (너비 + stat 높이 동시)
    if (!statPanel.querySelector(':scope > .lp-big-corner-tl')) {
      const el = document.createElement('div');
      el.className = 'lp-big-corner-tl';
      el.setAttribute('aria-hidden', 'true');
      el.title = '너비·높이 동시 조절';
      el.addEventListener('pointerdown', e => startBigCornerDrag(e, col, 'stat'));
      el.addEventListener('dblclick', resetAll);
      statPanel.appendChild(el);
    }

    // stat: 왼쪽 엣지 (OFF 모드 전용 — stat 너비 독립)
    if (!statPanel.querySelector(':scope > .lp-big-edge-left')) {
      const el = document.createElement('div');
      el.className = 'lp-big-edge-left';
      el.setAttribute('aria-hidden', 'true');
      el.title = '경기 스탯 패널 너비 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startBigPanelWidthDrag(e, col, 'stat'));
      el.addEventListener('dblclick', resetAll);
      statPanel.appendChild(el);
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// (4) 캠 큰 라인업 패널 독립 엣지 리사이즈 (오른쪽=너비 / 위쪽=높이)
//   - 기존 우상단 핸들: 비율 고정 축소 (--lp-lineup-scale)
//   - 오른쪽 엣지:  너비만 독립 조절 → .has-w-override + --lp-lineup-x-scale (이름 라벨 비례 확장)
//   - 위쪽 엣지:    높이만 독립 조절 (aspect-ratio 무효화 없이 height inline 덮어씌움)
//   - 더블클릭: 두 override 모두 초기화 (비율 고정 핸들은 별도 유지)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LINEUP_EDGE_W_KEY = 'obs.lineup.edgeWidthPx.v1';
const LINEUP_EDGE_H_KEY = 'obs.lineup.edgeHeightPx.v1';
const LINEUP_EDGE_MIN_W = 80;
const LINEUP_EDGE_MIN_H = 80;
const LINEUP_RESET_SCALE_SPLIT_PCT = 100;
const LINEUP_RESET_SCALE_COMBINED_PCT = 85;

/** 라인업의 저장된 수동 크기를 읽고 최소값 이상의 유한수만 반환한다. 읽기 실패나 무효 값은 null. */
function _lineupEdgeLoad(key, min) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= min ? v : null;
  } catch { return null; }
}
/** 라인업의 수동 너비 또는 높이를 정수 픽셀로 반올림해 저장한다. */
function _lineupEdgeSave(key, px) {
  try { localStorage.setItem(key, String(Math.round(px))); } catch {}
}
/** 라인업의 지정된 수동 크기 저장 키를 제거한다. */
function _lineupEdgeClear(key) {
  try { localStorage.removeItem(key); } catch {}
}

/** 분리 피치와 통합 피치의 기본 가로/세로 비율을 반환해 자연 너비 계산에 사용한다. */
function _lineupNaturalAspectRatio(panel) {
  return panel?.classList.contains('dp-mode-split') ? (94 / 210) : (62 / 105);
}

/** 전체 크기 초기화 시 분리 피치는 100%, 통합 피치는 85%의 기본 높이 배율을 반환한다. */
function _lineupResetScalePct(panel) {
  // split OFF combined 피치는 전체 높이 100%로 돌아가면 캠 영역을 너무 많이 먹는다.
  // 보내준 기준 화면에 맞춰 기본 축구장 비율은 유지하되, 전체 리셋 높이만 조금 낮춘다.
  return panel?.classList.contains('dp-mode-split')
    ? LINEUP_RESET_SCALE_SPLIT_PCT
    : LINEUP_RESET_SCALE_COMBINED_PCT;
}

/** 소속 레이아웃 또는 화면 높이로 라인업 최대 높이를 구하며 최소 허용 높이 이상을 보장한다. */
function _lineupGetMaxHeight(panel) {
  const layout = panel?.closest('.layout-wrap') || document.body;
  return Math.max(
    LINEUP_EDGE_MIN_H,
    layout?.clientHeight || document.body?.clientHeight || window.innerHeight || LINEUP_EDGE_MIN_H
  );
}

/** 라인업 패널 너비 오버라이드의 상한 — 소속 layout-wrap(또는 body) 너비의 80%. */
function _lineupGetMaxWidth(panel) {
  const layout = panel?.closest('.layout-wrap') || document.body;
  const width = layout?.clientWidth || document.body?.clientWidth || window.innerWidth || LINEUP_EDGE_MIN_W;
  return Math.max(LINEUP_EDGE_MIN_W, width * 0.8);
}

/** 라인업 너비를 수동 고정하고 자연 너비 대비 1~4배 범위로 이름 라벨의 가로 배율을 조절한다. */
function _lineupApplyWidthOverride(panel, px, knownHeight = null) {
  panel.style.width = `${Math.round(px)}px`;
  panel.classList.add('has-w-override');
  panel.classList.add('has-edge-override');
  // --lp-lineup-x-scale: 너비/자연너비 비율 → 이름 라벨 폭 비례 확장
  const h = Number(knownHeight) || getDisplayLayoutRect(panel).height;
  const naturalW = h > 0 ? h * _lineupNaturalAspectRatio(panel) : px;
  // 높이를 크게 늘렸다고 이름 pill 기본 폭까지 같이 줄어들면,
  // 실제로는 공간이 충분한 라벨도 억지로 두 줄이 된다. 기본 폭(1)보다 작게는 줄이지 않는다.
  const xScale = Math.max(1, Math.min(4, px / naturalW));
  panel.style.setProperty('--lp-lineup-x-scale', xScale.toFixed(3));
}

/** 너비·높이 중 하나라도 수동 지정 상태이면 공통 엣지 조절 클래스를 유지한다. */
function _lineupSyncEdgeOverrideClass(panel) {
  const hasWidthOverride = panel.classList.contains('has-w-override');
  const hasHeightOverride = panel.classList.contains('has-h-override');
  panel.classList.toggle('has-edge-override', hasWidthOverride || hasHeightOverride);
}

/**
 * lineup-name-fit.js의 syncBigLineupFullscreenGeometry()가 붙여놓은 "전체화면 폭 고정"
 * 흔적(lp-width-locked 클래스 + dataset.lineupWindowWidth)을 지운다. 이 클래스가 붙어있으면
 * CSS(css/lineup/lineup-layout.css)가 aspect-ratio를 unset시키고 width만으로 크기를 잡는데,
 * 이 함수를 호출하는 쪽(_lineupClearWidthOverride/_lineupClearHeightOverride)이 그 width
 * 인라인 스타일을 지워버리면 aspect-ratio도 없고 width도 없는 상태가 돼 패널이 0으로
 * 붕괴한다. 리사이즈 override를 해제할 때는 항상 이 잠금도 함께 풀어 aspect-ratio 기반
 * 자연 크기로 되돌린다 — 실제로 전체화면 중이었다면 다음 resize/fullscreenchange에서
 * syncBigLineupFullscreenGeometry()가 새 크기 기준으로 다시 잠근다.
 */
function _lineupClearFullscreenWidthLock(panel) {
  panel.classList.remove('lp-width-locked');
  delete panel.dataset.lineupWindowWidth;
}

/** 수동 너비와 이름 배율을 해제한다. 높이 조절을 위해 임시 고정했던 너비가 있으면 복원한다. */
function _lineupClearWidthOverride(panel) {
  _lineupClearFullscreenWidthLock(panel);
  panel.style.removeProperty('width');
  panel.style.removeProperty('--lp-lineup-x-scale');
  panel.classList.remove('has-w-override');
  if (panel.classList.contains('has-h-frozen-width')) {
    panel.style.width = panel.dataset.lineupFrozenWidth || panel.style.width;
  }
  _lineupSyncEdgeOverrideClass(panel);
}

/** 너비가 따라 변하지 않도록 현재 너비를 필요 시 고정한 뒤 라인업 높이만 수동 적용한다. */
function _lineupApplyHeightOverride(panel, px, knownWidth = null) {
  // 위쪽 엣지는 높이 전용이다. 기존 aspect-ratio가 너비까지 끌고 가지 않게
  // 사용자가 너비를 따로 조절하지 않은 상태라면 현재 너비를 임시로 고정한다.
  if (!panel.classList.contains('has-w-override') && !panel.classList.contains('has-h-frozen-width')) {
    const frozenWidth = Number(knownWidth) || getDisplayLayoutRect(panel).width;
    if (frozenWidth > 0) {
      panel.style.width = `${Math.round(frozenWidth)}px`;
      panel.dataset.lineupFrozenWidth = `${Math.round(frozenWidth)}px`;
      panel.classList.add('has-h-frozen-width');
    } else {
      // 패널이 아직 레이아웃되지 않은 상태 — width 고정 없이 has-edge-override만 붙으면
      // aspect-ratio:unset + 너비 미지정 → 너비 0 붕괴 발생. 적용을 건너뛴다.
      return;
    }
  }
  panel.style.height = `${Math.round(px)}px`;
  panel.classList.add('has-h-override');
  panel.classList.add('has-edge-override');
}

/** 수동 높이와 그때 임시 고정한 너비를 해제한다. 사용자가 별도로 지정한 너비는 유지한다. */
function _lineupClearHeightOverride(panel) {
  panel.style.removeProperty('height');
  panel.classList.remove('has-h-override');
  if (panel.classList.contains('has-h-frozen-width') && !panel.classList.contains('has-w-override')) {
    _lineupClearFullscreenWidthLock(panel);
    panel.style.removeProperty('width');
  }
  panel.classList.remove('has-h-frozen-width');
  delete panel.dataset.lineupFrozenWidth;
  _lineupSyncEdgeOverrideClass(panel);
}

/** 저장된 라인업 높이·너비를 현재 화면의 허용 범위로 보정해 적용하고 보정된 크기를 다시 저장한다. */
function applyStoredLineupEdgeOverrides() {
  // 높이를 먼저 적용한 뒤 너비를 적용해야 이름의 가로 배율 계산에 복원된 높이가 사용된다.
  document.querySelectorAll('.layout-big .lp-lineup').forEach(panel => {
    const storedH = _lineupEdgeLoad(LINEUP_EDGE_H_KEY, LINEUP_EDGE_MIN_H);
    if (storedH != null) {
      const nextH = _clampPx(storedH, LINEUP_EDGE_MIN_H, _lineupGetMaxHeight(panel));
      if (nextH != null) {
        _lineupApplyHeightOverride(panel, nextH);
        if (Math.round(nextH) !== Math.round(storedH)) _lineupEdgeSave(LINEUP_EDGE_H_KEY, nextH);
      }
    }
    const storedW = _lineupEdgeLoad(LINEUP_EDGE_W_KEY, LINEUP_EDGE_MIN_W);
    if (storedW != null) {
      const nextW = _clampPx(storedW, LINEUP_EDGE_MIN_W, _lineupGetMaxWidth(panel));
      if (nextW != null) {
        _lineupApplyWidthOverride(panel, nextW);
        if (Math.round(nextW) !== Math.round(storedW)) _lineupEdgeSave(LINEUP_EDGE_W_KEY, nextW);
      }
    }
  });
}

// ── 드래그: 오른쪽 엣지 → 너비 ──
/** 라인업 오른쪽 경계를 드래그해 너비를 조절하며, 화면 반영은 프레임당 한 번으로 묶고 종료 시 저장한다. */
function startLineupWidthDrag(event, panel) {
  // 1) 시작 크기와 레이아웃 너비의 80% 상한을 구하고 드래그 포인터를 캡처한다.
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startX  = toDisplayLayoutPixels(event.clientX);
  const startW  = getDisplayLayoutRect(panel).width;
  const startH  = getDisplayLayoutRect(panel).height;
  const layoutW = (panel.closest('.layout-wrap') || document.body).clientWidth;
  const maxW    = layoutW * 0.8;
  let lastW = startW;
  let pendingW = startW;
  let rafId = 0;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-lineup-w-resizing');

  // 2) 마지막 이동값만 보관해 다음 프레임에 적용한다. 포인터 이벤트마다 DOM을 갱신하지 않는다.
  const onMove = (e) => {
    const newW = Math.max(LINEUP_EDGE_MIN_W, Math.min(maxW, startW + (toDisplayLayoutPixels(e.clientX) - startX)));
    lastW = newW;
    pendingW = newW;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      _lineupApplyWidthOverride(panel, pendingW, startH);
    });
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-lineup-w-resizing');
    // 3) 아직 실행되지 않은 프레임이 있으면 마지막 크기를 즉시 적용한 뒤 저장하고 이름을 다시 맞춘다.
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      _lineupApplyWidthOverride(panel, lastW, startH);
    }
    _lineupEdgeSave(LINEUP_EDGE_W_KEY, lastW);
    requestAnimationFrame(() => window.fitLineupNamePills?.());
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 드래그: 위쪽 엣지 → 높이 (align-self:flex-end이므로 위로 드래그 = 높이 증가) ──
/** 라인업 위쪽 경계를 드래그해 높이를 조절하고, 너비가 수동 고정된 경우 이름의 가로 배율도 갱신한다. */
function startLineupHeightDrag(event, panel) {
  // 1) 시작 너비를 보관해 높이 조절 중 피치의 가로 크기가 같이 변하지 않도록 한다.
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startY  = toDisplayLayoutPixels(event.clientY);
  const startH  = getDisplayLayoutRect(panel).height;
  const startW  = getDisplayLayoutRect(panel).width;
  const maxH    = _lineupGetMaxHeight(panel);
  let lastH = startH;
  let pendingH = startH;
  let rafId = 0;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-lineup-h-resizing');

  // 2) 이동을 프레임 단위로 합쳐 적용한다. 수동 너비가 있으면 바뀐 자연 너비를 기준으로 라벨 배율도 맞춘다.
  const onMove = (e) => {
    // 위로 드래그(dy < 0) = 높이 증가
    const newH = Math.max(LINEUP_EDGE_MIN_H, Math.min(maxH, startH - (toDisplayLayoutPixels(e.clientY) - startY)));
    lastH = newH;
    pendingH = newH;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      _lineupApplyHeightOverride(panel, pendingH, startW);
      // 너비 override 중이면 x-scale도 재계산
      if (panel.classList.contains('has-w-override')) {
        const naturalW = pendingH * _lineupNaturalAspectRatio(panel);
        const xScale = Math.max(1, Math.min(4, startW / naturalW));
        panel.style.setProperty('--lp-lineup-x-scale', xScale.toFixed(3));
      }
    });
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-lineup-h-resizing');
    // 3) 대기 중인 프레임을 정리하고 최종 높이·배율을 적용한 뒤 저장과 이름 재배치를 수행한다.
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      _lineupApplyHeightOverride(panel, lastH, startW);
      if (panel.classList.contains('has-w-override')) {
        const naturalW = lastH * _lineupNaturalAspectRatio(panel);
        const xScale = Math.max(1, Math.min(4, startW / naturalW));
        panel.style.setProperty('--lp-lineup-x-scale', xScale.toFixed(3));
      }
    }
    _lineupEdgeSave(LINEUP_EDGE_H_KEY, lastH);
    requestAnimationFrame(() => window.fitLineupNamePills?.());
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ── 핸들 삽입 ──
/** 라인업의 오른쪽·위쪽 조절 핸들을 한 번 생성하고 축별 드래그 및 더블클릭 초기화를 연결한다. */
function ensureLineupEdgeHandles() {
  document.querySelectorAll('.layout-big .lp-lineup').forEach(panel => {
    if (!panel.querySelector(':scope > .lp-lineup-right-edge')) {
      const el = document.createElement('div');
      el.className = 'lp-lineup-right-edge';
      el.setAttribute('aria-hidden', 'true');
      el.title = '라인업 너비 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startLineupWidthDrag(e, panel));
      el.addEventListener('dblclick', e => resetLineupWidthOnly(e, panel));
      panel.appendChild(el);
    }

    if (!panel.querySelector(':scope > .lp-lineup-top-edge')) {
      const el = document.createElement('div');
      el.className = 'lp-lineup-top-edge';
      el.setAttribute('aria-hidden', 'true');
      el.title = '드래그로 높이 조절 · 더블클릭으로 초기화';
      el.addEventListener('pointerdown', e => startLineupHeightDrag(e, panel));
      el.addEventListener('dblclick', e => resetLineupHeightOnly(e, panel));
      panel.appendChild(el);
    }
  });
}

/** 라인업 수동 너비만 초기화하고 다음 프레임에 선수 이름 배치를 다시 계산한다. */
function resetLineupWidthOnly(event, panel) {
  event.preventDefault();
  event.stopPropagation();
  _lineupEdgeClear(LINEUP_EDGE_W_KEY);
  _lineupClearWidthOverride(panel);
  requestAnimationFrame(() => window.fitLineupNamePills?.());
}

/** 라인업 수동 높이만 초기화하고 다음 프레임에 선수 이름 배치를 다시 계산한다. */
function resetLineupHeightOnly(event, panel) {
  event.preventDefault();
  event.stopPropagation();
  _lineupEdgeClear(LINEUP_EDGE_H_KEY);
  _lineupClearHeightOverride(panel);
  requestAnimationFrame(() => window.fitLineupNamePills?.());
}

/** 라인업 수동 너비·높이를 모두 지우고 피치 모드별 기본 배율을 적용한 뒤 이름 배치를 다시 계산한다. */
function resetLineupAllSizes(event, panel) {
  event.preventDefault();
  event.stopPropagation();
  _lineupEdgeClear(LINEUP_EDGE_W_KEY);
  _lineupEdgeClear(LINEUP_EDGE_H_KEY);
  _lineupClearWidthOverride(panel);
  _lineupClearHeightOverride(panel);
  const resetScalePct = _lineupResetScalePct(panel);
  if (typeof setSetting === 'function') setSetting('lineupScale', resetScalePct);
  else document.documentElement.style.setProperty('--lp-lineup-scale', String(resetScalePct / 100));
  requestAnimationFrame(() => window.fitLineupNamePills?.());
}

document.addEventListener('DOMContentLoaded', ensureLineupResizeHandles);
document.addEventListener('DOMContentLoaded', () => {
  // 캠 작음 리사이즈
  ensureSmallLayoutResizeHandles();
  ensureSmallBenchHeightHandle();
  ensureSmallStatsHeightHandle();
  applyStoredSmallLayoutResize();
  observeSmallLayoutResize();

  // 캠 큰 우측 패널 독립 엣지 리사이즈
  _bigMigrateOnce(); // 구버전 깨진 fraction("1") → 전체 초기화 (1회)
  ensureBigPanelHandles();
  applyStoredBigColWidth();
  requestAnimationFrame(() => {
    // fraction 초기화: applyStoredBigPanelHeights 보다 먼저 실행.
    // 기존 chatH px → fraction으로 변환해 사용자 비율을 보존한다.
    // 이 시점은 항상 창 모드이므로 colH 기준으로 안전하게 비율 계산 가능.
    if (_bigLoadFraction(BIG_CHAT_FRACTION_KEY) == null) {
      document.querySelectorAll('.layout-big .lp-col').forEach(col => {
        const colH = getDisplayLayoutRect(col).height;
        if (colH <= 0) return;
        const usable = colH - BIG_COL_GAP;
        const chatH = _bigLoad(BIG_CHAT_H_KEY, BIG_PANEL_MIN_H);
        if (chatH == null) return;
        const f = chatH / usable;
        // 0.15~0.85 범위만 신뢰 — 전체화면 때 저장된 큰 px값이 잘못 변환되지 않도록
        if (f >= 0.15 && f <= 0.85) _bigSaveFraction(f);
      });
    }
    applyStoredBigPanelHeights();
  });

  // 캠 큰 라인업 독립 엣지 리사이즈
  ensureLineupEdgeHandles();
  requestAnimationFrame(() => applyStoredLineupEdgeOverrides());
  // 페이지 로드 시점에 패널 너비가 아직 0이어서 적용을 건너뛴 경우를 위한 폴백
  window.addEventListener('load', () => requestAnimationFrame(() => applyStoredLineupEdgeOverrides()), { once: true });

  // 캠 큰 우측 패널: 전체화면 진입·해제 또는 창 크기 변경 시 패널 높이 재계산
  // (lp-col 높이 변화 감지 → applyStoredBigPanelHeights 재호출)
  const _onBigColHeightChange = (() => {
    let timer = null;
    return () => {
      if (document.body.classList.contains('lp-big-col-resizing') ||
          document.body.classList.contains('lp-big-h-resizing')) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        applyStoredBigPanelHeights();
        window.stRerenderActivePanels?.();
        window.lpStatAutoRestart?.();
      }, 60);
    };
  })();

  if (typeof ResizeObserver === 'function') {
    const bigColObserver = new ResizeObserver(_onBigColHeightChange);
    document.querySelectorAll('.layout-big .lp-col').forEach(col => bigColObserver.observe(col));
  }

  // 라인업 패널 ResizeObserver: F11/창 크기 변경 등 모든 리사이즈 시 x-scale 재계산 + 이름 라벨 재측정
  // (fullscreenchange는 F11에서 발화하지 않으므로 ResizeObserver로 대응)
  if (typeof ResizeObserver === 'function') {
    const _onLineupPanelResize = (() => {
      let timer = null;
      return () => {
        if (document.body.classList.contains('lp-lineup-w-resizing') ||
            document.body.classList.contains('lp-lineup-h-resizing')) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          applyStoredLineupEdgeOverrides();
          window.fitLineupNamePills?.();
        }, 150);
      };
    })();
    const lineupPanelObserver = new ResizeObserver(_onLineupPanelResize);
    document.querySelectorAll('.layout-big .lp-lineup').forEach(p => lineupPanelObserver.observe(p));
  }

  // window.resize: F11/창 크기 변경 시 우측 패널 높이 재계산 (lp-col ResizeObserver 보완)
  window.addEventListener('resize', (() => {
    let t = null;
    return () => {
      if (document.body.classList.contains('lp-big-col-resizing') ||
          document.body.classList.contains('lp-big-h-resizing')) return;
      clearTimeout(t);
      t = setTimeout(applyStoredBigPanelHeights, 200);
    };
  })());

  // fullscreenchange: requestFullscreen() API 사용 시 대응 (F11과는 별개)
  // rAF: 빠른 초기 적용(애니메이션 중간일 수 있음)
  // 600ms timeout: 애니메이션 완료 후 확정 치수로 재보정 (--lp-lineup-x-scale 포함)
  document.addEventListener('fullscreenchange', () => {
    if (!document.body.classList.contains('lp-big-col-resizing') &&
        !document.body.classList.contains('lp-big-h-resizing')) {
      requestAnimationFrame(() => {
        applyStoredBigPanelHeights();
        applyStoredLineupEdgeOverrides();
        window.stRerenderActivePanels?.();
        window.lpStatAutoRestart?.();
        window.fitLineupNamePills?.();
      });
      setTimeout(() => {
        applyStoredBigPanelHeights();
        applyStoredLineupEdgeOverrides();
        window.stRerenderActivePanels?.();
        window.lpStatAutoRestart?.();
        window.fitLineupNamePills?.();
      }, 600);
    }
  });
});

/**
 * 수동으로 조정한 패널 크기를 전부 기본값으로 되돌린다.
 * settings-popup.js의 "패널 크기 초기화" 버튼이 호출.
 */
window.resetAllLayoutSizes = function resetAllLayoutSizes() {
  // 1) 저장된 키 전체 삭제 (마이그레이션 플래그도 함께 제거해 다음 로드에서 재평가)
  [
    BIG_COL_WIDTH_KEY, BIG_CHAT_H_KEY, BIG_STAT_H_KEY,
    BIG_CHAT_W_KEY, BIG_STAT_W_KEY, BIG_CHAT_FRACTION_KEY,
    BIG_LAYOUT_MIGRATED_KEY,
    SMALL_LAYOUT_RESIZE_STORAGE_KEY,
    SMALL_BENCH_HEIGHT_KEY,
    LINEUP_EDGE_W_KEY, LINEUP_EDGE_H_KEY,
  ].forEach(k => { try { localStorage.removeItem(k); } catch {} });

  // 2) 캠 큰 우측 칼럼 CSS 변수 + 기본 스탯 9줄 높이 재적용
  document.querySelectorAll('.layout-big').forEach(layout => resetBigColWidth(layout));
  applyStoredBigPanelHeights();

  // 3) 캠 작은 칼럼 비율 기본 복원
  resetSmallLayoutResize();
  resetSmallBenchHeight();
  resetSmallStatsHeight();

  // 4) 라인업 엣지 오버라이드 인라인 스타일 제거
  document.querySelectorAll('.layout-big .lp-lineup').forEach(panel => {
    _lineupClearWidthOverride(panel);
    _lineupClearHeightOverride(panel);
  });

  // 5) 이름 라벨 재측정
  requestAnimationFrame(() => window.fitLineupNamePills?.());
};
