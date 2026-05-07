// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업/칼럼 마우스 드래그 리사이즈]
//
// 두 종류의 리사이즈를 한 파일에서 관리한다.
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

  const startScalePct = Number(typeof getSetting === 'function' ? getSetting('lineupScale') : 100) || 100;
  const startY = event.clientY;

  panel.classList.add('is-resizing');
  document.body.classList.add('lp-lineup-resizing');
  handle.setPointerCapture?.(event.pointerId);

  let lastPct = startScalePct;

  const onMove = (e) => {
    // 1) 포인터 이동량을 layout 높이 기준 백분율로 환산한다.
    // 위로 드래그(deltaY > 0) → 확장, 아래로 드래그(deltaY < 0) → 축소.
    const deltaY = startY - e.clientY;
    const deltaPct = (deltaY / layoutHeight) * 100;
    let next = startScalePct + deltaPct;
    next = Math.max(LINEUP_RESIZE_MIN, Math.min(LINEUP_RESIZE_MAX, Math.round(next)));
    if (next === lastPct) return;
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
    if (typeof setSetting === 'function' && lastPct !== startScalePct) {
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

document.addEventListener('DOMContentLoaded', ensureLineupResizeHandles);
document.addEventListener('DOMContentLoaded', () => {
  ensureSmallLayoutResizeHandles();
  applyStoredSmallLayoutResize();
  observeSmallLayoutResize();
});
