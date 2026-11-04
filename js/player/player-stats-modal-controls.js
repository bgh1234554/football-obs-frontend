/**
 * player-stats-modal-controls.js
 * 선수 경기 스탯 / 시즌 스탯 모달의 창 크기와 내용 확대 조절.
 *
 * - 창 크기: 제목줄 -/%/+ 버튼(100~250%, 5%씩). 모달 위아래가 화면 끝에 닿는 배율에서 더 커지지 않고
 *   + 버튼이 비활성화되며, 폭은 화면 폭 안으로만 늘어난다. 가운데 %에 마우스를 올리면 배율 목록(25%씩)이
 *   뜨고, 화면에 안 들어가는 배율은 비활성화된다.
 * - 내용 확대: 프로필 오른쪽의 -/%/+ 버튼(50~200%, 5%씩, 가운데 % hover 시 25% 단위 목록). 창 크기와 별개로
 *   글씨와 표만 키우며, 넘치는 부분은 기존 스크롤 영역에서 스크롤한다.
 * - 두 값은 모달 종류(match/season)별로 localStorage에 저장한다.
 * player-menu.js의 pmShowMatchStats / pmShowSeasonStats가 모달을 그린 직후 호출한다.
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

function pmStatsModalSave(kind, values) {
  try {
    const all = JSON.parse(localStorage.getItem(PM_STATS_MODAL_STORAGE_KEY) || '{}') || {};
    all[kind] = { ...pmStatsModalLoad(kind), ...values };
    localStorage.setItem(PM_STATS_MODAL_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

/** 위아래가 화면 끝에 닿기 직전까지의 최대 창 배율(%). 기본 배율의 실제 높이로 계산한다. */
function pmStatsModalMaxSize(modal) {
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
