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
