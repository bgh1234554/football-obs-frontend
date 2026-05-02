// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 마우스 드래그 리사이즈 — 캠 큼 페이지 한정]
// .layout-big .lp-lineup 의 우상단 모서리(.lp-lineup-resize)를 잡고 드래그하면
// 비율(62/105) 유지한 채 height에 곱해지는 --lp-lineup-scale (50~100%)이 변한다.
// 패널은 align-self:flex-end로 아래쪽 정렬돼있어 핸들을 위로 끌수록 패널이 위로 확장,
// 아래로 끌수록 축소된다. 다른 컬럼(cam-big, events/stat)의 비율은 영향 없음.
// 최종 값은 settings-popup.js의 lineupScale에 저장 → 새로고침 후에도 유지.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LINEUP_RESIZE_MIN = 50;
const LINEUP_RESIZE_MAX = 100;
const SMALL_LAYOUT_RESIZE_STORAGE_KEY = 'obs.smallLayout.eventsStatRatio.v1';
const SMALL_LAYOUT_RATIO_MIN = 0.2;
const SMALL_LAYOUT_RATIO_MAX = 0.8;
const SMALL_LAYOUT_LEFT_MIN_PX = 220;
const SMALL_LAYOUT_RIGHT_MIN_PX = 220;

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

function saveSmallLayoutResizeRatio(ratio) {
  try {
    localStorage.setItem(SMALL_LAYOUT_RESIZE_STORAGE_KEY, String(ratio));
  } catch {}
}

function clearSmallLayoutResizeRatio() {
  try {
    localStorage.removeItem(SMALL_LAYOUT_RESIZE_STORAGE_KEY);
  } catch {}
}

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

function clampSmallLayoutResizeRatio(metrics, ratio) {
  if (!metrics) return null;
  const minRatio = Math.max(SMALL_LAYOUT_RATIO_MIN, metrics.leftMin / metrics.sideWidth);
  const maxRatio = Math.min(SMALL_LAYOUT_RATIO_MAX, (metrics.sideWidth - metrics.rightMin) / metrics.sideWidth);
  return Math.max(minRatio, Math.min(maxRatio, ratio));
}

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

function resetSmallLayoutResize(layout = null) {
  const targets = layout ? [layout] : Array.from(document.querySelectorAll('.layout-small'));
  targets.forEach(node => {
    if (!node) return;
    node.classList.remove('lp-small-columns-custom');
    node.style.removeProperty('--lp-small-events-width');
    node.style.removeProperty('--lp-small-chat-width');
  });
}

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

function resetSmallLayoutResizeFromHandle(event) {
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const eventsCol = handle.closest('.lp-col-events-stat');
  const layout = eventsCol?.closest('.layout-small');
  clearSmallLayoutResizeRatio();
  resetSmallLayoutResize(layout);
}

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

function observeSmallLayoutResize() {
  if (typeof ResizeObserver === 'function') {
    if (!smallLayoutResizeObserver) {
      smallLayoutResizeObserver = new ResizeObserver(() => {
        if (loadSmallLayoutResizeRatio() != null) applyStoredSmallLayoutResize();
      });
    } else {
      smallLayoutResizeObserver.disconnect();
    }
    document.querySelectorAll('.layout-small').forEach(layout => smallLayoutResizeObserver.observe(layout));
    return;
  }

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
