/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   [일정 확인 탭 4칼럼 너비 리사이즈]
   .widgetGrid(Leagues/Games/Details/Standings) 경계 3곳에 드래그 핸들을 붙인다.
   각 핸들은 자신과 인접한 두 칼럼의 비율 합만 유지한 채 그 안에서만 재분배하고,
   나머지 두 칼럼은 전혀 건드리지 않는다(VSCode 사이드바/에디터 분할과 동일한 모델).
   더블클릭하면 그 핸들에 연결된 두 칼럼만 기본 비율로 복원한다.
   비율(0~1, 합=1)로 저장해 화면 폭이 달라져도(ResizeObserver로 재적용) 깨지지 않는다.

   화면은 1920 기준 레이아웃을 만든 뒤 transform으로 실제 뷰포트에 맞춘다(display-scale.js).
   그래서 CSS 값(px)은 전부 "레이아웃 좌표"인 반면 getBoundingClientRect()/event.clientX는
   "화면 좌표"라 배율만큼 어긋난다 — 반드시 getDisplayLayoutRect()/toDisplayLayoutPixels()로
   변환한 값만 CSS 변수·마우스 델타 계산에 사용한다(다른 리사이즈 모듈과 동일한 패턴).
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SCHED_GRID_STORAGE_KEY = 'obs.scheduleGrid.colRatios.v1';
const SCHED_GRID_MIN_PX = [140, 160, 280, 220]; // Leagues, Games, Details, Standings
// 사용자가 지정한 기본 칼럼 폭 — Leagues는 고정 px, 나머지 3개는 그 나머지 폭을 fr 비율로
// 분배(고정 비율표로 근사하면 화면 폭이 달라질 때마다 어긋나므로 반드시 이 형태를 유지).
// 콘솔에서 getDisplayLayoutRect() 기준 실측(widths(px): [247, 292, 691, 650], gapPx: 8)해 반영.
const SCHED_GRID_DEFAULT_COL1_PX = 247;
const SCHED_GRID_DEFAULT_FR = [1, 2.366, 2.226]; // Games, Details, Standings
const SCHED_HANDLE_WIDTH = 12;

let schedGridResizeObserver = null;
let schedGridResizeFallbackBound = false;
let schedGridActiveResizePointer = null;

function scheduleGridEl() {
  return document.querySelector('#page-schedule .widgetGrid');
}

function scheduleGridPanels(grid) {
  if (!grid) return [];
  return Array.from(grid.children).filter(el => el.classList.contains('panel'));
}

function scheduleGridGapPx(grid) {
  // getComputedStyle 값은 transform 영향을 받지 않는 레이아웃 px 그대로다.
  const cs = getComputedStyle(grid);
  const gap = parseFloat(cs.columnGap || cs.gap || '8');
  return Number.isFinite(gap) ? gap : 8;
}

function scheduleGridLoadRatios() {
  try {
    const raw = localStorage.getItem(SCHED_GRID_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 4 || arr.some(v => !Number.isFinite(v) || v <= 0)) return null;
    return arr;
  } catch { return null; }
}

function scheduleGridSaveRatios(ratios) {
  try { localStorage.setItem(SCHED_GRID_STORAGE_KEY, JSON.stringify(ratios)); } catch {}
}

/**
 * 현재 availableWidth 기준으로 "진짜" 기본 비율을 계산 — Leagues는 항상 190px 고정,
 * 나머지 3개(Games/Details/Standings)만 그 나머지 폭을 1:2.2:2로 나눈다. 화면 폭이
 * 달라질 때마다 다시 계산해야 원본 CSS 기본값과 정확히 일치한다(고정 비율표로는 불가능).
 */
function scheduleGridDefaultRatios(availableWidth) {
  if (!(availableWidth > 0)) return [0.25, 0.25, 0.25, 0.25];
  const col1 = Math.min(SCHED_GRID_DEFAULT_COL1_PX, availableWidth);
  const remaining = Math.max(0, availableWidth - col1);
  const frTotal = SCHED_GRID_DEFAULT_FR.reduce((a, b) => a + b, 0);
  const rest = SCHED_GRID_DEFAULT_FR.map(w => remaining * (w / frTotal));
  return [col1, ...rest].map(px => px / availableWidth);
}

/**
 * availableWidth(칼럼 전용 폭, gap 제외, 레이아웃 px) 기준 최소 비율을 보장하며 합=1로 정규화.
 * 기존엔 min으로 올려친 뒤 전체 합으로 나눠 재정규화했는데, 그 나누기 단계가 방금 올려친
 * 최소값까지 다시 비례 축소해버려 min이 실제로는 보장 안 되는 문제가 있었다(예: min 비율
 * 합이 0.8인 4칼럼에서 한 칼럼만 큰 값을 가지면 나머지가 min 아래로 다시 깎임).
 * 대신 "각 칼럼에 min을 먼저 배정 → 남는 폭(1 - totalMin)만 원래 비율의 초과분(min 넘는 부분)
 * 비례로 재분배"하는 방식으로 바꿔 min을 항상 만족시킨다.
 */
function scheduleGridClampRatios(ratios, availableWidth) {
  if (!(availableWidth > 0)) return ratios;
  const n = ratios.length;
  const totalRatio = ratios.reduce((a, b) => a + b, 0);
  const normalized = totalRatio > 0 ? ratios.map(r => r / totalRatio) : ratios.map(() => 1 / n);
  const minR = SCHED_GRID_MIN_PX.map(px => px / availableWidth);
  const totalMin = minR.reduce((a, b) => a + b, 0);
  if (totalMin >= 1) return ratios.map(() => 1 / n);
  const remaining = 1 - totalMin;
  const excess = normalized.map((r, i) => Math.max(0, r - minR[i]));
  const totalExcess = excess.reduce((a, b) => a + b, 0);
  if (totalExcess > 0) {
    return minR.map((m, i) => m + remaining * (excess[i] / totalExcess));
  }
  // 모든 칼럼이 이미 자기 min 이하로 눌려있던 경우 — 남는 폭을 균등 배분.
  return minR.map(m => m + remaining / n);
}

function scheduleGridHandles(grid) {
  if (!grid) return [];
  return Array.from(grid.querySelectorAll(':scope > .sched-col-resize'));
}

/**
 * 핸들 left(레이아웃 px)를 실측한 panel 경계에 맞춰 매번 다시 계산.
 * .panel은 둥근 모서리를 위해 overflow:hidden이라 핸들을 panel의 자식으로 두면 칼럼 경계
 * 밖으로 걸쳐야 하는 절반이 그대로 잘린다 — 핸들은 .widgetGrid의 자식으로 두고(그리드 자체는
 * 칼럼 사이 gap을 클리핑하지 않음) 위치만 JS로 매번 갱신한다.
 */
function syncScheduleGridHandlePositions(grid, panels) {
  if (!grid) return;
  const targetPanels = panels || scheduleGridPanels(grid);
  if (targetPanels.length !== 4) return;
  const gridRect = getDisplayLayoutRect(grid);
  scheduleGridHandles(grid).forEach(handle => {
    const idx = Number(handle.dataset.idx);
    const panel = targetPanels[idx];
    if (!panel) return;
    const boundaryX = getDisplayLayoutRect(panel).right - gridRect.left;
    handle.style.left = `${Math.round(boundaryX - SCHED_HANDLE_WIDTH / 2)}px`;
  });
}

/** ratios(합=1)를 실제 grid 폭(레이아웃 px)으로 환산해 CSS 변수로 적용. 클램프 후 실제 적용된 비율 반환. */
function scheduleGridApplyRatios(grid, ratios) {
  const rect = getDisplayLayoutRect(grid);
  const gapPx = scheduleGridGapPx(grid);
  const availableWidth = Math.max(0, rect.width - gapPx * 3);
  const safeRatios = scheduleGridClampRatios(ratios, availableWidth);
  safeRatios.forEach((r, i) => {
    grid.style.setProperty(`--sched-col-${i + 1}`, `${Math.round(availableWidth * r)}px`);
  });
  grid.classList.add('sched-columns-custom');
  syncScheduleGridHandlePositions(grid);
  return safeRatios;
}

/**
 * 드래그 중(pointermove)마다 호출되는 경량 버전 — grid/panel을 다시 측정하지 않는다.
 * scheduleGridApplyRatios + syncScheduleGridHandlePositions는 각각 getBoundingClientRect를
 * 강제해 매 이동마다 최대 5번의 동기 레이아웃 재계산(layout thrashing)이 발생해 드래그가
 * 버벅였다 — 드래그 시작 시점에 고정해둔 availableWidth/gapPx로 CSS 변수와 핸들 left를
 * 산술 계산만 해서 쓰기 전용으로 처리한다. handles는 idx(0/1/2) 순서로 미리 정렬해 전달.
 */
function scheduleGridApplyRatiosFast(grid, ratios, availableWidth, gapPx, orderedHandles) {
  const safeRatios = scheduleGridClampRatios(ratios, availableWidth);
  const px = safeRatios.map(r => Math.round(availableWidth * r));
  px.forEach((w, i) => grid.style.setProperty(`--sched-col-${i + 1}`, `${w}px`));

  let cursor = 0;
  for (let i = 0; i < 3; i++) {
    cursor += px[i];
    const handle = orderedHandles[i];
    if (handle) handle.style.left = `${Math.round(cursor - SCHED_HANDLE_WIDTH / 2)}px`;
    cursor += gapPx;
  }
  return safeRatios;
}

/** 페이지 로드/탭 전환/리사이즈 시점에 저장된 비율을 적용. 없으면 default(CSS 그대로)로 두고
 * 핸들 위치만 그 기본 레이아웃 기준으로 다시 계산한다. */
function applyStoredScheduleGridWidths() {
  const grid = scheduleGridEl();
  if (!grid) return;
  const ratios = scheduleGridLoadRatios();
  if (!ratios) {
    grid.classList.remove('sched-columns-custom');
    syncScheduleGridHandlePositions(grid);
    return;
  }
  scheduleGridApplyRatios(grid, ratios);
}

/** 커스텀 비율 유무와 무관하게(기본 fr 레이아웃도 창 크기에 따라 바뀌므로) 항상 핸들 위치를 재동기화. */
function observeScheduleGridResize() {
  const grid = scheduleGridEl();
  if (!grid) return;
  const handleResize = () => {
    if (scheduleGridLoadRatios()) applyStoredScheduleGridWidths();
    else syncScheduleGridHandlePositions(grid);
  };
  if (typeof ResizeObserver === 'function') {
    if (!schedGridResizeObserver) {
      schedGridResizeObserver = new ResizeObserver(handleResize);
    } else {
      schedGridResizeObserver.disconnect();
    }
    schedGridResizeObserver.observe(grid);
    return;
  }
  if (!schedGridResizeFallbackBound) {
    schedGridResizeFallbackBound = true;
    window.addEventListener('resize', handleResize);
  }
}

/** 경계 3곳의 핸들을 .widgetGrid의 자식으로 생성(각 handle.dataset.idx = 0/1/2). */
function ensureScheduleGridResizeHandles() {
  const grid = scheduleGridEl();
  const panels = scheduleGridPanels(grid);
  if (!grid || panels.length !== 4) return;
  for (let idx = 0; idx < 3; idx++) {
    if (grid.querySelector(`:scope > .sched-col-resize[data-idx="${idx}"]`)) continue;
    const handle = document.createElement('div');
    handle.className = 'sched-col-resize';
    handle.dataset.idx = String(idx);
    handle.setAttribute('aria-hidden', 'true');
    handle.title = '칼럼 크기 조정 · 더블클릭으로 이 두 칼럼만 초기화';
    handle.addEventListener('pointerdown', e => startScheduleGridResize(e, idx));
    handle.addEventListener('dblclick', e => resetScheduleGridPair(e, idx));
    grid.appendChild(handle);
  }
  syncScheduleGridHandlePositions(grid, panels);
}

/**
 * idx번째 경계(0=Leagues/Games, 1=Games/Details, 2=Details/Standings) 드래그.
 * 인접한 두 칼럼의 레이아웃 px 합(pairSum)을 시작 시점에 고정해두고 그 안에서만 재분배 —
 * 나머지 두 칼럼은 이 드래그 동안 값이 전혀 바뀌지 않는다.
 */
function startScheduleGridResize(event, idx) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (schedGridActiveResizePointer != null) return;

  const grid = scheduleGridEl();
  const panels = scheduleGridPanels(grid);
  if (!grid || panels.length !== 4) return;

  const rect = getDisplayLayoutRect(grid);
  const gapPx = scheduleGridGapPx(grid);
  const availableWidth = Math.max(0, rect.width - gapPx * 3);
  if (availableWidth <= 0) return;

  const startWidths = panels.map(p => getDisplayLayoutRect(p).width);
  const pairSum = startWidths[idx] + startWidths[idx + 1];
  const minA = SCHED_GRID_MIN_PX[idx];
  const minB = SCHED_GRID_MIN_PX[idx + 1];
  if (pairSum < minA + minB) return;

  const baseRatios = startWidths.map(w => w / availableWidth);
  const startX = toDisplayLayoutPixels(event.clientX);
  const pointerId = event.pointerId;
  const handle = event.currentTarget;
  // idx(0/1/2) 순서로 미리 정렬 — fast apply가 매 이동마다 다시 쿼리하지 않도록.
  const orderedHandles = [0, 1, 2].map(i => grid.querySelector(`:scope > .sched-col-resize[data-idx="${i}"]`));
  schedGridActiveResizePointer = pointerId;
  document.body.classList.add('sched-grid-resizing');
  grid.classList.add('sched-columns-custom');
  handle.setPointerCapture?.(pointerId);

  let lastRatios = baseRatios;

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const deltaX = toDisplayLayoutPixels(e.clientX) - startX;
    const nextA = Math.max(minA, Math.min(pairSum - minB, startWidths[idx] + deltaX));
    const nextB = pairSum - nextA;
    const nextRatios = baseRatios.slice();
    nextRatios[idx] = nextA / availableWidth;
    nextRatios[idx + 1] = nextB / availableWidth;
    lastRatios = scheduleGridApplyRatiosFast(grid, nextRatios, availableWidth, gapPx, orderedHandles);
  };

  const onUp = (e) => {
    if (e && e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('sched-grid-resizing');
    handle.releasePointerCapture?.(pointerId);
    schedGridActiveResizePointer = null;
    // 드래그 중에는 재측정 없이 고정 availableWidth로만 계산했으니, 마지막에 한 번
    // 실측 기반으로 정확히 맞추고(서브픽셀 오차 보정) 그 값을 저장한다.
    lastRatios = scheduleGridApplyRatios(grid, lastRatios);
    scheduleGridSaveRatios(lastRatios);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

/**
 * 핸들 idx에 연결된 두 칼럼을 "고정된 기본 비율(SCHED_GRID_DEFAULT_RATIOS)"로 복원.
 * 이전에는 "그 두 칼럼의 현재 합(pairSum)"을 기본 비율로만 재분배했는데, 다른 핸들을
 * 먼저 드래그해 pairSum 자체가 바뀌어 있으면 복원 결과도 매번 달라지는 문제가 있었다
 * (같은 핸들을 더블클릭해도 이전에 무엇을 드래그했는지에 따라 절대 폭이 계속 바뀜).
 * 이제는 두 칼럼을 항상 같은 고정 기본값으로 맞추고, 남는/모자란 폭만 나머지 두 칼럼에
 * (서로의 비율은 유지한 채) 흡수시켜 합계 1을 유지한다 — 더블클릭 결과가 언제나 동일.
 */
function resetScheduleGridPair(event, idx) {
  event.preventDefault();
  event.stopPropagation();
  const grid = scheduleGridEl();
  const panels = scheduleGridPanels(grid);
  if (!grid || panels.length !== 4) return;

  const rect = getDisplayLayoutRect(grid);
  const gapPx = scheduleGridGapPx(grid);
  const availableWidth = Math.max(0, rect.width - gapPx * 3);
  if (availableWidth <= 0) return;

  const currentRatios = panels.map(p => getDisplayLayoutRect(p).width / availableWidth);
  const defaultRatios = scheduleGridDefaultRatios(availableWidth);

  const nextRatios = currentRatios.slice();
  nextRatios[idx] = defaultRatios[idx];
  nextRatios[idx + 1] = defaultRatios[idx + 1];

  const otherIdxs = [0, 1, 2, 3].filter(i => i !== idx && i !== idx + 1);
  const otherSumBefore = otherIdxs.reduce((sum, i) => sum + currentRatios[i], 0);
  const otherSumAfter = 1 - (nextRatios[idx] + nextRatios[idx + 1]);
  if (otherSumBefore > 0) {
    const scale = otherSumAfter / otherSumBefore;
    otherIdxs.forEach(i => { nextRatios[i] = currentRatios[i] * scale; });
  }

  const applied = scheduleGridApplyRatios(grid, nextRatios);
  scheduleGridSaveRatios(applied);
}

document.addEventListener('DOMContentLoaded', () => {
  ensureScheduleGridResizeHandles();
  applyStoredScheduleGridWidths();
  observeScheduleGridResize();
});

// 탭 전환으로 display:none → block 될 때 ResizeObserver가 못 잡는 환경 대비 재적용.
document.addEventListener('page:activated', (e) => {
  if (e.detail?.page !== 'schedule') return;
  ensureScheduleGridResizeHandles();
  applyStoredScheduleGridWidths();
});
