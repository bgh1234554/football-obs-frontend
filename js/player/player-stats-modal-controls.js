/**
 * [선수 스탯 모달: 창 크기와 내용 확대]
 * player-menu.js가 경기/시즌 스탯 내용을 만든 뒤 이 모듈을 호출한다. 스탯 조회나 표 렌더링은
 * 호출자가 맡고, 여기서는 이미 만들어진 모달에 조절 버튼을 붙여 CSS 변수와 저장값을 관리한다.
 *
 * 처리 순서:
 *  1. 모달 종류별로 저장한 창 배율과 내용 배율을 읽고 범위/단위를 검증한다.
 *  2. 제목줄에는 창 크기, 프로필 옆에는 내용 확대 컨트롤을 별도로 붙인다.
 *  3. 창 높이를 실측해 현재 화면에서 허용할 배율을 구하고 버튼 상태까지 함께 반영한다.
 *  4. 사용자 조작은 저장하지만 화면 크기 때문에 임시 제한한 배율은 저장하지 않는다.
 *  5. 화면 크기가 바뀌면 저장값으로 다시 맞추고, 닫힌 모달의 resize 리스너는 다음 호출에서 해제한다.
 *
 * - 창 크기: 제목줄 -/%/+ 버튼(100~250%, 5%씩). 모달 위아래가 화면 끝에 닿는 배율에서 더 커지지 않고
 *   + 버튼이 비활성화되며, 폭은 화면 폭 안으로만 늘어난다. 가운데 %에 마우스를 올리면 배율 목록(25%씩)이
 *   뜨고, 화면에 안 들어가는 배율은 비활성화된다.
 * - 내용 확대: 프로필 오른쪽의 -/%/+ 버튼(50~200%, 5%씩, 가운데 % hover 시 25% 단위 목록). 창 크기와 별개로
 *   글씨와 표만 키우며, 넘치는 부분은 기존 스크롤 영역에서 스크롤한다.
 * - 두 값은 모달 종류(match/season)별로 localStorage에 저장한다.
 */
const PM_STATS_MODAL_STORAGE_KEY = 'obs.playerStatsModal.v1';
const PM_STATS_MODAL_SIZE_MIN = 100;
const PM_STATS_MODAL_SIZE_MAX = 250;
const PM_STATS_MODAL_SIZE_STEP = 5;
const PM_STATS_MODAL_SIZE_PRESETS = [100, 125, 150, 175, 200, 225, 250];
const PM_STATS_MODAL_EDGE_MARGIN = 8;
const PM_ZOOM_MINUS_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 5h7"/></svg>';
const PM_ZOOM_PLUS_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 5h7M5 1.5v7"/></svg>';
const PM_STATS_ZOOM_MIN = 50;
const PM_STATS_ZOOM_MAX = 200;
const PM_STATS_ZOOM_PRESETS = [50, 75, 100, 125, 150, 175, 200];

/** 저장된 모달별 크기/확대값. 5% 단계로 맞추고, 저장소를 쓸 수 없으면 기본값으로 동작한다. */
function pmStatsModalLoad(kind) {
  // 저장된 숫자가 유효한 범위 안에 있을 때만 5% 단위로 맞춘다. 손상된 JSON이나
  // 다른 형식의 값이 있어도 모달을 열 수 있도록 창 크기/내용 확대 각각의 기본값으로 돌아간다.
  const step = (value, min, max, fallback) => Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value / PM_STATS_MODAL_SIZE_STEP) * PM_STATS_MODAL_SIZE_STEP : fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(PM_STATS_MODAL_STORAGE_KEY) || '{}')?.[kind] || {};
    return {
      size: step(Number(saved.size), PM_STATS_MODAL_SIZE_MIN, PM_STATS_MODAL_SIZE_MAX, PM_STATS_MODAL_SIZE_MIN),
      zoom: step(Number(saved.zoom), PM_STATS_ZOOM_MIN, PM_STATS_ZOOM_MAX, 100),
    };
  } catch { return { size: PM_STATS_MODAL_SIZE_MIN, zoom: 100 }; }
}

/**
 * -/%/+ 버튼 묶음을 만든다. 가운데 %에 마우스를 올리면 presets 목록이 뜬다.
 * 만든 요소의 onStep(방향 -1|1)과 onPreset(값)을 연결해 쓰며, parts로 내부 버튼을 돌려준다.
 */
function pmCreateStepControl(downLabel, valueLabel, upLabel, presets) {
  const control = document.createElement('div');
  control.className = 'pm-content-zoom';
  control.innerHTML = `
<button type="button" class="pm-zoom-btn" data-step="-1" aria-label="${downLabel}">${PM_ZOOM_MINUS_ICON}</button>
<div class="pm-size-preset">
  <button type="button" class="pm-zoom-value" aria-haspopup="menu" aria-label="${valueLabel}"></button>
  <div class="pm-size-menu" role="menu">${presets.map(value =>
    `<button type="button" role="menuitemradio" data-preset="${value}">${value}%</button>`).join('')}</div>
</div>
<button type="button" class="pm-zoom-btn" data-step="1" aria-label="${upLabel}">${PM_ZOOM_PLUS_ICON}</button>`;
  const [down, up] = control.querySelectorAll('.pm-zoom-btn');
  const preset = control.querySelector('.pm-size-preset');
  control.parts = { value: control.querySelector('.pm-zoom-value'), down, up, presets: [...control.querySelectorAll('[data-preset]')] };
  control.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button === control.parts.value) return;
    if (button.dataset.preset) {
      control.onPreset?.(Number(button.dataset.preset));
      // 고른 뒤에는 목록을 닫는다(마우스가 그대로 있어도 다시 올릴 때까지 숨김).
      preset.classList.add('is-closed');
      button.blur();
    } else control.onStep?.(Number(button.dataset.step));
  });
  preset.addEventListener('pointerleave', () => preset.classList.remove('is-closed'));
  return control;
}

/**
 * 현재 모달 종류의 변경 항목만 저장한다. 창 크기만 바꿔도 내용 배율을 유지하고,
 * 경기 스탯과 시즌 스탯의 값도 섞지 않는다. 저장 실패는 현재 화면의 조절을 막지 않는다.
 */
function pmStatsModalSave(kind, values) {
  try {
    const all = JSON.parse(localStorage.getItem(PM_STATS_MODAL_STORAGE_KEY) || '{}') || {};
    all[kind] = { ...pmStatsModalLoad(kind), ...values };
    localStorage.setItem(PM_STATS_MODAL_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

/** 위아래가 화면 끝에 닿기 직전까지의 최대 창 배율(%). 기본 배율의 실제 높이로 계산한다. */
function pmStatsModalMaxSize(modal) {
  // 이미 커진 높이로 최대 배율을 계산하면 반복 호출마다 한도가 달라진다. 측정할 때만
  // 창 배율을 1로 돌리고 즉시 이전 값으로 복원해, 항상 같은 기본 높이에서 한도를 구한다.
  const previous = modal.style.getPropertyValue('--pm-modal-scale');
  modal.style.setProperty('--pm-modal-scale', '1');
  const baseHeight = getDisplayLayoutRect(modal).height;
  modal.style.setProperty('--pm-modal-scale', previous || '1');
  const available = document.body.clientHeight - PM_STATS_MODAL_EDGE_MARGIN * 2;
  if (!(baseHeight > 0)) return PM_STATS_MODAL_SIZE_MAX;
  // 버튼 단계(5%)에 맞춰 내림해 화면 끝에 닿기 직전 단계에서 멈추게 한다.
  const fit = Math.floor(available / baseHeight * 100 / PM_STATS_MODAL_SIZE_STEP) * PM_STATS_MODAL_SIZE_STEP;
  return Math.max(PM_STATS_MODAL_SIZE_MIN, Math.min(PM_STATS_MODAL_SIZE_MAX, fit));
}

/**
 * 모달에 창 크기 버튼과 내용 확대 버튼을 붙이고 저장된 값을 적용한다.
 * 호출 시점에는 헤더와 프로필이 모두 존재해야 한다. 버튼 중복을 검사하는 함수는 아니므로
 * 호출자는 모달 본문을 새로 만든 뒤 연결한다. 프로필은 조절 행으로 옮기되 기존 내용은 유지한다.
 * @param {'match'|'season'} kind 모달 종류(저장 키)
 */
function pmMountStatsModalControls(kind) {
  const backdrop = document.getElementById('pmBackdrop');
  const modal = backdrop?.querySelector('.pm-modal');
  const header = modal?.querySelector('.pm-modal-header');
  const profile = modal?.querySelector('#pmSznProfile');
  if (!modal || !header || !profile) return;
  const values = pmStatsModalLoad(kind);
  modal.classList.add('pm-modal-sizable');

  // 1) 제목줄: 닫기 버튼 앞에 창 크기 -/%/+ (내용 확대와 같은 모양, 5%씩 이동).
  //    창이 가운데 기준으로 커져 버튼 위치가 계속 바뀌므로, 가운데 %에 마우스를 올리면 배율 목록에서 한 번에 고를 수 있다.
  const sizeControl = pmCreateStepControl('창 작게', '창 크기 배율 선택', '창 크게', PM_STATS_MODAL_SIZE_PRESETS);
  sizeControl.classList.add('pm-modal-size');
  header.insertBefore(sizeControl, header.querySelector('.pm-modal-close'));
  const { value: sizeValue, down: sizeDown, up: sizeUp, presets: presetButtons } = sizeControl.parts;
  let appliedSize = PM_STATS_MODAL_SIZE_MIN;

  /** 창 배율을 화면 높이 한도로 제한해 적용한다. save=false면 저장값은 유지(작은 창에서 임시로 줄어든 경우). */
  const applySize = (size, save) => {
    const max = pmStatsModalMaxSize(modal);
    appliedSize = Math.max(PM_STATS_MODAL_SIZE_MIN, Math.min(size, max));
    modal.style.setProperty('--pm-modal-scale', String(appliedSize / 100));
    sizeValue.textContent = `${appliedSize}%`;
    sizeDown.disabled = appliedSize <= PM_STATS_MODAL_SIZE_MIN;
    // 위아래가 화면 끝에 닿아 더 키울 수 없으면 +를 끈다.
    sizeUp.disabled = appliedSize >= max;
    // 화면에 다 안 들어가는 배율은 목록에서 끄고, 현재 배율을 표시한다.
    presetButtons.forEach(button => {
      const preset = Number(button.dataset.preset);
      button.disabled = preset > max;
      button.setAttribute('aria-checked', String(preset === appliedSize));
    });
    if (save) pmStatsModalSave(kind, { size: appliedSize });
  };
  sizeControl.onStep = direction => applySize(appliedSize + direction * PM_STATS_MODAL_SIZE_STEP, true);
  sizeControl.onPreset = size => applySize(size, true);

  // 2) 프로필 오른쪽 아래: 내용 확대 -/%/+ (창 크기와 같은 방식, 5%씩 + 25% 단위 목록). 확대 대상에서는 제외.
  const row = document.createElement('div');
  row.className = 'pm-szn-profile-row';
  profile.before(row);
  row.append(profile);
  const zoomControl = pmCreateStepControl('글씨 축소', '글씨 크기 배율 선택', '글씨 확대', PM_STATS_ZOOM_PRESETS);
  row.append(zoomControl);
  const { value: zoomValue, down: zoomOut, up: zoomIn, presets: zoomPresets } = zoomControl.parts;
  const applyZoom = (zoom, save) => {
    // 내용 배율은 창 배율과 독립적이다. 버튼 자체는 확대 대상 밖에 두고 CSS 변수만 바꾸며,
    // 내용이 넘칠 때의 처리는 모달의 기존 스크롤 영역에 맡긴다.
    zoom = Math.max(PM_STATS_ZOOM_MIN, Math.min(PM_STATS_ZOOM_MAX, zoom));
    modal.style.setProperty('--pm-content-zoom', String(zoom / 100));
    zoomValue.textContent = `${zoom}%`;
    zoomOut.disabled = zoom <= PM_STATS_ZOOM_MIN;
    zoomIn.disabled = zoom >= PM_STATS_ZOOM_MAX;
    zoomPresets.forEach(button => button.setAttribute('aria-checked', String(Number(button.dataset.preset) === zoom)));
    values.zoom = zoom;
    if (save) pmStatsModalSave(kind, { zoom });
  };
  zoomControl.onStep = direction => applyZoom(values.zoom + direction * PM_STATS_MODAL_SIZE_STEP, true);
  zoomControl.onPreset = zoom => applyZoom(zoom, true);

  // 첫 표시는 저장값 복원일 뿐 사용자 변경이 아니다. 화면이 작아 창 크기가 줄어들어도
  // 저장된 선호 배율을 덮어쓰지 않아, 나중에 큰 화면으로 돌아오면 다시 복원할 수 있다.
  applyZoom(values.zoom, false);
  applySize(values.size, false);

  // 3) 화면 크기가 바뀌면 저장한 배율을 기준으로 다시 화면 안에 맞춘다. 모달이 닫히면 리스너를 해제한다.
  const onResize = () => {
    if (!backdrop.isConnected) { window.removeEventListener('resize', onResize); return; }
    applySize(pmStatsModalLoad(kind).size, false);
  };
  window.addEventListener('resize', onResize);
}
window.pmMountStatsModalControls = pmMountStatsModalControls;
