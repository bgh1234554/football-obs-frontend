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
//       더블클릭 → 50/50 기본값 복원.  obs.bigLayout.colSplit.v1 에 영속화.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LINEUP_RESIZE_MIN = 50;
const LINEUP_RESIZE_MAX = 100;
const SMALL_LAYOUT_RESIZE_STORAGE_KEY = 'obs.smallLayout.eventsStatRatio.v1';
const SMALL_LAYOUT_RATIO_MIN = 0.2;
const SMALL_LAYOUT_RATIO_MAX = 0.8;
const SMALL_LAYOUT_LEFT_MIN_PX = 220;
const SMALL_LAYOUT_RIGHT_MIN_PX = 220;

// 윈도우 리사이즈/패널 폭 변화 시 저장된 비율을 다시 적용하기 위한 옵저버.
// ResizeObserver가 없는 구형 환경은 window resize 이벤트로 fallback.
let smallLayoutResizeObserver = null;
let smallLayoutResizeFallbackBound = false;

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

  const lineupWidth = lineup.getBoundingClientRect().width;
  const benchWidth = bench.getBoundingClientRect().width;
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
 * 작은 캠 layout의 events-stat 칼럼 우측 경계에 리사이즈 핸들 1회 생성.
 * - pointerdown → 드래그 세션 시작.
 * - dblclick → 기본 비율 복원.
 */
function ensureSmallLayoutResizeHandles() {
  document.querySelectorAll('.layout-small .lp-col-events-stat').forEach(panel => {
    if (panel.querySelector(':scope > .lp-small-col-resize')) return;
    const handle = document.createElement('div');
    handle.className = 'lp-small-col-resize';
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '칼럼 크기 조정';
    handle.addEventListener('pointerdown', startSmallLayoutResize);
    handle.addEventListener('dblclick', resetSmallLayoutResizeFromHandle);
    panel.appendChild(handle);
  });
}

/** 핸들 더블클릭 → 저장된 비율 제거 + 해당 layout만 default로 복원. */
function resetSmallLayoutResizeFromHandle(event) {
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const eventsCol = handle.closest('.lp-col-events-stat');
  const layout = eventsCol?.closest('.layout-small');
  clearSmallLayoutResizeRatio();
  resetSmallLayoutResize(layout);
}

/**
 * 작은 캠 칼럼 리사이즈 드래그 세션.
 * 1) 좌클릭이 아니면 무시. 메트릭 못 구하면 무시.
 * 2) 시작 시점의 events 폭 + clientX를 기록해 dragX 기준점으로 사용.
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
  const eventsCol = handle.closest('.lp-col-events-stat');
  const layout = eventsCol?.closest('.layout-small');
  const metrics = getSmallLayoutResizeMetrics(layout);
  if (!handle || !eventsCol || !layout || !metrics) return;

  const startLeft = eventsCol.getBoundingClientRect().width;
  const startX = event.clientX;
  let lastRatio = clampSmallLayoutResizeRatio(metrics, startLeft / metrics.sideWidth);
  if (lastRatio == null) return;

  document.body.classList.add('lp-small-resizing');
  layout.classList.add('is-resizing');
  handle.setPointerCapture?.(event.pointerId);

  const onMove = (e) => {
    const nextMetrics = getSmallLayoutResizeMetrics(layout);
    if (!nextMetrics) return;
    const deltaX = e.clientX - startX;
    const nextLeft = Math.max(
      nextMetrics.leftMin,
      Math.min(nextMetrics.sideWidth - nextMetrics.rightMin, startLeft + deltaX)
    );
    const nextRatio = applySmallLayoutResizeRatio(layout, nextLeft / nextMetrics.sideWidth);
    if (nextRatio != null) lastRatio = nextRatio;
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('lp-small-resizing');
    layout.classList.remove('is-resizing');
    handle.releasePointerCapture?.(event.pointerId);
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
  const currentHeightPct = Math.round((panel.getBoundingClientRect().height / layoutHeight) * 100);
  const startScalePct = hasEdgeOverride
    ? Math.max(
      LINEUP_RESIZE_MIN,
      Math.min(LINEUP_RESIZE_MAX, currentHeightPct || storedScalePct),
    )
    : storedScalePct;
  const saveBaselinePct = hasEdgeOverride ? startScalePct : storedScalePct;
  const startY = event.clientY;

  panel.classList.add('is-resizing');
  document.body.classList.add('lp-lineup-resizing');
  handle.setPointerCapture?.(event.pointerId);

  let lastPct = startScalePct;
  let releasedEdgeOverrides = false;

  const onMove = (e) => {
    // 1) 포인터 이동량을 layout 높이 기준 백분율로 환산한다.
    // 위로 드래그(deltaY > 0) → 확장, 아래로 드래그(deltaY < 0) → 축소.
    const deltaY = startY - e.clientY;
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

const BIG_COL_WIDTH_KEY = 'obs.bigLayout.colWidth.v1';
const BIG_CHAT_H_KEY    = 'obs.bigLayout.chatH.v1';
const BIG_STAT_H_KEY    = 'obs.bigLayout.statH.v1';
const BIG_CHAT_W_KEY    = 'obs.bigLayout.chatW.v1';
const BIG_STAT_W_KEY    = 'obs.bigLayout.statW.v1';
const BIG_PANEL_MIN_H   = 60;
const BIG_PANEL_MIN_W   = 100;
const BIG_COL_GAP       = 6; // .lp-col { gap: 6px } — ON 모드 높이 계산 시 차감

function isBigPanelLinked() {
  return typeof getSetting === 'function' ? getSetting('bigPanelLinked') !== 'off' : false;
}

// ── localStorage 헬퍼 ──
function _bigLoad(key, min) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= min ? v : null;
  } catch { return null; }
}
function _bigSave(key, px) {
  try { localStorage.setItem(key, String(Math.round(px))); } catch {}
}
function _bigClear(key) {
  try { localStorage.removeItem(key); } catch {}
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
function applyBigColWidth(layout, px) {
  if (!layout) return;
  layout.style.setProperty('--lp-big-col-width', `${Math.round(px)}px`);
}
function resetBigColWidth(layout) {
  if (!layout) return;
  layout.style.removeProperty('--lp-big-col-width');
}
function applyStoredBigColWidth() {
  document.querySelectorAll('.layout-big').forEach(layout => {
    const px = _bigLoadClamped(BIG_COL_WIDTH_KEY, BIG_PANEL_MIN_W, _bigStoredColMaxWidth(layout));
    if (px != null) applyBigColWidth(layout, px);
    else resetBigColWidth(layout);
  });
}

// ── 패널 absolute 스타일 초기화 ──
function _clearPanelAbsolute(panel) {
  ['position','top','bottom','left','right','width','height','marginTop'].forEach(p => {
    panel.style.removeProperty(p);
  });
}

// ── ON 모드: flex 기반 연동 레이아웃 ──
function _applyLinkedMode(col) {
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  col.classList.add('is-big-linked');
  _clearPanelAbsolute(chatPanel);
  _clearPanelAbsolute(statPanel);
  const colH = col.getBoundingClientRect().height;
  const usable = colH - BIG_COL_GAP; // gap을 제외한 실제 패널 배분 가능 높이
  let chatH = colH > 0
    ? _bigLoadClamped(BIG_CHAT_H_KEY, BIG_PANEL_MIN_H, usable - BIG_PANEL_MIN_H)
    : _bigLoad(BIG_CHAT_H_KEY, BIG_PANEL_MIN_H);
  if (colH > 0) {
    if (chatH == null) chatH = Math.floor(usable / 2);
    chatH = Math.max(BIG_PANEL_MIN_H, Math.min(usable - BIG_PANEL_MIN_H, chatH));
    const statH = usable - chatH;
    chatPanel.style.flex = `0 0 ${chatH}px`;
    chatPanel.style.height = `${chatH}px`;
    statPanel.style.flex = `0 0 ${statH}px`;
    statPanel.style.height = `${statH}px`;
  } else {
    chatPanel.style.removeProperty('flex');
    chatPanel.style.removeProperty('height');
    statPanel.style.removeProperty('flex');
    statPanel.style.removeProperty('height');
  }
}

// ── OFF 모드: absolute 독립 레이아웃 ──
function _applyIndependentMode(col) {
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  col.classList.remove('is-big-linked');
  chatPanel.style.removeProperty('flex');
  statPanel.style.removeProperty('flex');

  const colH   = col.getBoundingClientRect().height;
  const colRect = col.getBoundingClientRect();
  const layout = col.closest('.layout-big');
  const defaultH = colH > 0 ? Math.max(BIG_PANEL_MIN_H, Math.floor(colH / 2)) : 200;
  const defaultW = (() => {
    const stored = _bigLoadClamped(BIG_COL_WIDTH_KEY, BIG_PANEL_MIN_W, _bigStoredColMaxWidth(layout));
    if (stored) return stored;
    return colRect.width > 0 ? colRect.width : 250;
  })();

  const maxPanelW = _bigPanelMaxWidth(layout);
  const storedChatH = _bigLoadClamped(
    BIG_CHAT_H_KEY,
    BIG_PANEL_MIN_H,
    colH > 0 ? colH - BIG_PANEL_MIN_H : Infinity,
  );
  let chatH = storedChatH ?? defaultH;
  const storedStatH = _bigLoadClamped(
    BIG_STAT_H_KEY,
    BIG_PANEL_MIN_H,
    colH > 0 ? colH - chatH : Infinity,
  );
  let statH = storedStatH ?? defaultH;
  let chatW = _bigLoadClamped(BIG_CHAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW) ?? defaultW;
  let statW = _bigLoadClamped(BIG_STAT_W_KEY, BIG_PANEL_MIN_W, maxPanelW) ?? defaultW;
  if (colH > 0 && chatH + statH > colH) {
    statH = Math.max(BIG_PANEL_MIN_H, colH - chatH);
    if (storedStatH != null) _bigSave(BIG_STAT_H_KEY, statH);
  }

  Object.assign(chatPanel.style, {
    position: 'absolute', top: '0', right: '0', bottom: '', left: '',
    width: `${Math.round(chatW)}px`, height: `${Math.round(chatH)}px`,
  });
  Object.assign(statPanel.style, {
    position: 'absolute', bottom: '0', right: '0', top: '', left: '',
    width: `${Math.round(statW)}px`, height: `${Math.round(statH)}px`,
  });

  // 칼럼 너비 = 두 패널 중 넓은 것
  if (layout) applyBigColWidth(layout, Math.max(chatW, statW));
}

// ── 통합 적용 함수 (mode 전환 포함) ──
function applyStoredBigPanelHeights() {
  const linked = isBigPanelLinked();
  document.querySelectorAll('.layout-big .lp-col').forEach(col => {
    const chatPanel = col.querySelector('.lp-chat-big');
    const statPanel = col.querySelector('.lp-stat');
    if (!chatPanel || !statPanel) return;

    // OFF → ON 전환: 너비는 둘 중 좁은 것 기준, 높이는 반반
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
      const colH = col.getBoundingClientRect().height;
      if (colH > 0) _bigSave(BIG_CHAT_H_KEY, Math.floor((colH - BIG_COL_GAP) / 2));
    }

    if (linked) _applyLinkedMode(col);
    else _applyIndependentMode(col);
  });
}
window.applyStoredBigPanelHeights = applyStoredBigPanelHeights;

// ── 드래그: 칼럼 너비 (ON 모드 — lp-col 왼쪽 엣지) ──
function startBigColWidthDrag(event, col) {
  if (event.button !== 0) return;
  event.preventDefault();
  const layout = col.closest('.layout-big');
  if (!layout) return;
  const startX = event.clientX;
  const startW = col.getBoundingClientRect().width;
  const maxW   = layout.clientWidth * 0.65;
  let lastW = startW;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing');
  const onMove = (e) => {
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + (startX - e.clientX)));
    lastW = newW;
    applyBigColWidth(layout, newW);
  };
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
function startBigPanelWidthDrag(event, col, which) {
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const panel  = which === 'chat' ? chatPanel : statPanel;
  const wKey   = which === 'chat' ? BIG_CHAT_W_KEY : BIG_STAT_W_KEY;
  const layout = col.closest('.layout-big');
  if (!layout) return;
  const startX = event.clientX;
  const startW = panel.getBoundingClientRect().width;
  const maxW   = layout.clientWidth * 0.9;
  let lastW = startW;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing');
  const otherPanel = which === 'chat' ? statPanel : chatPanel;
  const onMove = (e) => {
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + (startX - e.clientX)));
    lastW = newW;
    panel.style.width = `${Math.round(newW)}px`;
    applyBigColWidth(layout, Math.max(newW, otherPanel.getBoundingClientRect().width));
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    handle.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('lp-big-col-resizing');
    _bigSave(wKey, lastW);
    _bigSave(BIG_COL_WIDTH_KEY, Math.max(lastW, otherPanel.getBoundingClientRect().width));
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
function _bigSetH(panel, px, linked) {
  const v = `${Math.round(px)}px`;
  if (linked) panel.style.flex = `0 0 ${v}`;
  else panel.style.removeProperty('flex');
  panel.style.height = v;
}

// ── 드래그: 패널 높이 (수직 엣지) origin: 'chatBottom' | 'statTop' ──
function startBigPanelHeightDrag(event, col, origin) {
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel = col.querySelector('.lp-chat-big');
  const statPanel = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const linked     = isBigPanelLinked();
  const startY     = event.clientY;
  const startChatH = chatPanel.getBoundingClientRect().height;
  const startStatH = statPanel.getBoundingClientRect().height;
  const colH       = col.getBoundingClientRect().height;
  const usable     = colH - BIG_COL_GAP;
  let lastChatH = startChatH;
  let lastStatH = startStatH;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-h-resizing');

  const onMove = (e) => {
    const delta = e.clientY - startY;
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
    _bigSave(BIG_CHAT_H_KEY, lastChatH);
    _bigSave(BIG_STAT_H_KEY, lastStatH);
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
function startBigCornerDrag(event, col, panelSide) {
  if (event.button !== 0) return;
  event.preventDefault();
  const chatPanel  = col.querySelector('.lp-chat-big');
  const statPanel  = col.querySelector('.lp-stat');
  if (!chatPanel || !statPanel) return;
  const linked     = isBigPanelLinked();
  const layout     = col.closest('.layout-big');
  const startX     = event.clientX;
  const startY     = event.clientY;
  const panel      = panelSide === 'chat' ? chatPanel : statPanel;
  const otherPanel = panelSide === 'chat' ? statPanel : chatPanel;
  const startW     = linked ? col.getBoundingClientRect().width : panel.getBoundingClientRect().width;
  const startChatH = chatPanel.getBoundingClientRect().height;
  const startStatH = statPanel.getBoundingClientRect().height;
  const colH       = col.getBoundingClientRect().height;
  const usable     = colH - BIG_COL_GAP;
  const maxW       = layout ? (linked ? _bigColMaxWidth(layout) : _bigPanelMaxWidth(layout)) : window.innerWidth;
  let lastW = startW, lastChatH = startChatH, lastStatH = startStatH;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-big-col-resizing', 'lp-big-h-resizing');

  const onMove = (e) => {
    const dx = startX - e.clientX; // 왼쪽 드래그 = 너비 증가
    const dy = e.clientY - startY; // 아래 드래그 = 양수

    // 너비
    const newW = Math.max(BIG_PANEL_MIN_W, Math.min(maxW, startW + dx));
    lastW = newW;
    if (linked) {
      if (layout) applyBigColWidth(layout, newW);
    } else {
      panel.style.width = `${Math.round(newW)}px`;
      if (layout) applyBigColWidth(layout, Math.max(newW, otherPanel.getBoundingClientRect().width));
    }

    // 높이
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
    if (linked) {
      _bigSave(BIG_COL_WIDTH_KEY, lastW);
    } else {
      _bigSave(panelSide === 'chat' ? BIG_CHAT_W_KEY : BIG_STAT_W_KEY, lastW);
      _bigSave(BIG_COL_WIDTH_KEY, Math.max(lastW, otherPanel.getBoundingClientRect().width));
    }
    _bigSave(BIG_CHAT_H_KEY, lastChatH);
    _bigSave(BIG_STAT_H_KEY, lastStatH);
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
function ensureBigPanelHandles() {
  document.querySelectorAll('.layout-big .lp-col').forEach(col => {
    const chatPanel = col.querySelector('.lp-chat-big');
    const statPanel = col.querySelector('.lp-stat');
    if (!chatPanel || !statPanel) return;

    const resetAll = (e) => {
      e.preventDefault();
      [BIG_COL_WIDTH_KEY, BIG_CHAT_H_KEY, BIG_STAT_H_KEY, BIG_CHAT_W_KEY, BIG_STAT_W_KEY].forEach(_bigClear);
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
      el.title = '팬 반응 높이 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startBigPanelHeightDrag(e, col, 'chatBottom'));
      el.addEventListener('dblclick', resetAll);
      chatPanel.appendChild(el);
    }

    // stat: 위쪽 엣지 (stat 높이)
    if (!statPanel.querySelector(':scope > .lp-big-stat-edge-top')) {
      const el = document.createElement('div');
      el.className = 'lp-big-stat-edge-top';
      el.setAttribute('aria-hidden', 'true');
      el.title = '경기 스탯 높이 조절 (더블클릭: 초기화)';
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

function _lineupEdgeLoad(key, min) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= min ? v : null;
  } catch { return null; }
}
function _lineupEdgeSave(key, px) {
  try { localStorage.setItem(key, String(Math.round(px))); } catch {}
}
function _lineupEdgeClear(key) {
  try { localStorage.removeItem(key); } catch {}
}

function _lineupNaturalAspectRatio(panel) {
  return panel?.classList.contains('dp-mode-split') ? (94 / 210) : (62 / 105);
}

function _lineupResetScalePct(panel) {
  // split OFF combined 피치는 전체 높이 100%로 돌아가면 캠 영역을 너무 많이 먹는다.
  // 보내준 기준 화면에 맞춰 기본 축구장 비율은 유지하되, 전체 리셋 높이만 조금 낮춘다.
  return panel?.classList.contains('dp-mode-split')
    ? LINEUP_RESET_SCALE_SPLIT_PCT
    : LINEUP_RESET_SCALE_COMBINED_PCT;
}

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

function _lineupApplyWidthOverride(panel, px, knownHeight = null) {
  panel.style.width = `${Math.round(px)}px`;
  panel.classList.add('has-w-override');
  panel.classList.add('has-edge-override');
  // --lp-lineup-x-scale: 너비/자연너비 비율 → 이름 라벨 폭 비례 확장
  const h = Number(knownHeight) || panel.getBoundingClientRect().height;
  const naturalW = h > 0 ? h * _lineupNaturalAspectRatio(panel) : px;
  // 높이를 크게 늘렸다고 이름 pill 기본 폭까지 같이 줄어들면,
  // 실제로는 공간이 충분한 라벨도 억지로 두 줄이 된다. 기본 폭(1)보다 작게는 줄이지 않는다.
  const xScale = Math.max(1, Math.min(4, px / naturalW));
  panel.style.setProperty('--lp-lineup-x-scale', xScale.toFixed(3));
}

function _lineupSyncEdgeOverrideClass(panel) {
  const hasWidthOverride = panel.classList.contains('has-w-override');
  const hasHeightOverride = panel.classList.contains('has-h-override');
  panel.classList.toggle('has-edge-override', hasWidthOverride || hasHeightOverride);
}

function _lineupClearWidthOverride(panel) {
  panel.style.removeProperty('width');
  panel.style.removeProperty('--lp-lineup-x-scale');
  panel.classList.remove('has-w-override');
  if (panel.classList.contains('has-h-frozen-width')) {
    panel.style.width = panel.dataset.lineupFrozenWidth || panel.style.width;
  }
  _lineupSyncEdgeOverrideClass(panel);
}

function _lineupApplyHeightOverride(panel, px, knownWidth = null) {
  // 위쪽 엣지는 높이 전용이다. 기존 aspect-ratio가 너비까지 끌고 가지 않게
  // 사용자가 너비를 따로 조절하지 않은 상태라면 현재 너비를 임시로 고정한다.
  if (!panel.classList.contains('has-w-override') && !panel.classList.contains('has-h-frozen-width')) {
    const frozenWidth = Number(knownWidth) || panel.getBoundingClientRect().width;
    if (frozenWidth > 0) {
      panel.style.width = `${Math.round(frozenWidth)}px`;
      panel.dataset.lineupFrozenWidth = `${Math.round(frozenWidth)}px`;
      panel.classList.add('has-h-frozen-width');
    }
  }
  panel.style.height = `${Math.round(px)}px`;
  panel.classList.add('has-h-override');
  panel.classList.add('has-edge-override');
}

function _lineupClearHeightOverride(panel) {
  panel.style.removeProperty('height');
  panel.classList.remove('has-h-override');
  if (panel.classList.contains('has-h-frozen-width') && !panel.classList.contains('has-w-override')) {
    panel.style.removeProperty('width');
  }
  panel.classList.remove('has-h-frozen-width');
  delete panel.dataset.lineupFrozenWidth;
  _lineupSyncEdgeOverrideClass(panel);
}

function applyStoredLineupEdgeOverrides() {
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
function startLineupWidthDrag(event, panel) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startX  = event.clientX;
  const startW  = panel.getBoundingClientRect().width;
  const startH  = panel.getBoundingClientRect().height;
  const layoutW = (panel.closest('.layout-wrap') || document.body).clientWidth;
  const maxW    = layoutW * 0.8;
  let lastW = startW;
  let pendingW = startW;
  let rafId = 0;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-lineup-w-resizing');

  const onMove = (e) => {
    const newW = Math.max(LINEUP_EDGE_MIN_W, Math.min(maxW, startW + (e.clientX - startX)));
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
function startLineupHeightDrag(event, panel) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startY  = event.clientY;
  const startH  = panel.getBoundingClientRect().height;
  const startW  = panel.getBoundingClientRect().width;
  const maxH    = _lineupGetMaxHeight(panel);
  let lastH = startH;
  let pendingH = startH;
  let rafId = 0;
  const handle = event.currentTarget;
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('lp-lineup-h-resizing');

  const onMove = (e) => {
    // 위로 드래그(dy < 0) = 높이 증가
    const newH = Math.max(LINEUP_EDGE_MIN_H, Math.min(maxH, startH - (e.clientY - startY)));
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
      el.title = '라인업 높이 조절 (더블클릭: 초기화)';
      el.addEventListener('pointerdown', e => startLineupHeightDrag(e, panel));
      el.addEventListener('dblclick', e => resetLineupHeightOnly(e, panel));
      panel.appendChild(el);
    }
  });
}

function resetLineupWidthOnly(event, panel) {
  event.preventDefault();
  event.stopPropagation();
  _lineupEdgeClear(LINEUP_EDGE_W_KEY);
  _lineupClearWidthOverride(panel);
  requestAnimationFrame(() => window.fitLineupNamePills?.());
}

function resetLineupHeightOnly(event, panel) {
  event.preventDefault();
  event.stopPropagation();
  _lineupEdgeClear(LINEUP_EDGE_H_KEY);
  _lineupClearHeightOverride(panel);
  requestAnimationFrame(() => window.fitLineupNamePills?.());
}

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
  applyStoredSmallLayoutResize();
  observeSmallLayoutResize();

  // 캠 큰 우측 패널 독립 엣지 리사이즈
  ensureBigPanelHandles();
  applyStoredBigColWidth();
  requestAnimationFrame(() => applyStoredBigPanelHeights());

  // 캠 큰 라인업 독립 엣지 리사이즈
  ensureLineupEdgeHandles();
  requestAnimationFrame(() => applyStoredLineupEdgeOverrides());
});
