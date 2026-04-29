// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [설정 팝업]
// 사이드바 우측 상단 톱니바퀴 → 화면 가운데 설정 모달 오픈.
// 이름 표시(long/short)와 라인업 노드 표시(photo/number)를 관리한다.
// 설정은 localStorage에 저장하고, 변경 시 'settings:change' 이벤트를 보낸다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SETTINGS_STORAGE_KEY = 'obs.settings.v2';

const SETTINGS_DEFAULTS = {
  teamName: 'long',   // 라인업 chip + 벤치/부상 컬럼 헤더의 팀명 표시 (default 풀네임)
  lineup: 'short',
  scorer: 'long',
  roster: 'short',
  lineupNode: 'number',
  lineupScale: 100,   // 캠 큼 페이지 라인업 크기 배율 (50~100, %). 비율 그대로.
                      // 설정 팝업 UI에는 노출 안 함 — 라인업 패널 우상단 핸들 드래그로 조정 (lineup-resize.js).
  lineupNameSize: 12, // 라인업 노드 이름 글자 크기 (px). 설정 팝업 슬라이더로 조정.
                      // long 모드(풀네임)는 CSS에서 0.875× 비율 유지.
  // 'logo' = matchInfo.homeTeamLogo (default. 클럽=팀 로고, 국대=국기)
  // 'fa'   = matchInfo.homeTeamFaUrl (협회 로고. URL 없으면 logo로 자동 폴백 — fixture.js)
  teamLogo: 'logo',
  // '메인에 표시' 버튼 클릭 시 자동 이동할 페이지: 'big'(캠 큼) / 'small'(캠 작음 = /detail).
  mainPage: 'big',
  // 경기 스탯 패널 자동 페이지 전환 (Iter 5-2). off='off', on='on' 토글 + 간격 (초 단위, 0.5 단위).
  statsAutoSwipe: 'off',
  statsAutoSwipeSec: 5,
  // 이벤트 패널 (Iter 5-2). 'event'는 이벤트 row 선수명 풀네임/단축, eventNameSize는 폰트 크기 px.
  event: 'short',
  eventNameSize: 15,
};

const EVENT_NAME_SIZE_MIN = 10;
const EVENT_NAME_SIZE_MAX = 22;
const STATS_SWIPE_SEC_MIN = 1;
const STATS_SWIPE_SEC_MAX = 60;

const LINEUP_SCALE_MIN = 50;
const LINEUP_SCALE_MAX = 100;
const LINEUP_NAME_SIZE_MIN = 9;
const LINEUP_NAME_SIZE_MAX = 16;

const settingsState = { ...SETTINGS_DEFAULTS };

function isValidSetting(category, value) {
  if (category === 'lineupNode') return value === 'number' || value === 'photo';
  if (category === 'teamLogo') return value === 'logo' || value === 'fa';
  if (category === 'mainPage') return value === 'big' || value === 'small';
  if (category === 'statsAutoSwipe') return value === 'on' || value === 'off';
  if (category === 'statsAutoSwipeSec') {
    return Number.isFinite(value) && value >= STATS_SWIPE_SEC_MIN && value <= STATS_SWIPE_SEC_MAX;
  }
  if (category === 'lineupScale') {
    return Number.isFinite(value) && value >= LINEUP_SCALE_MIN && value <= LINEUP_SCALE_MAX;
  }
  if (category === 'lineupNameSize') {
    return Number.isFinite(value) && value >= LINEUP_NAME_SIZE_MIN && value <= LINEUP_NAME_SIZE_MAX;
  }
  if (category === 'eventNameSize') {
    return Number.isFinite(value) && value >= EVENT_NAME_SIZE_MIN && value <= EVENT_NAME_SIZE_MAX;
  }
  return value === 'short' || value === 'long';
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    Object.keys(SETTINGS_DEFAULTS).forEach(category => {
      const value = parsed[category];
      if (isValidSetting(category, value)) settingsState[category] = value;
    });
  } catch {}
  applyLayoutSettings();
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsState));
  } catch {}
}

function getSetting(category) {
  return settingsState[category] ?? SETTINGS_DEFAULTS[category];
}

function getNameMode(category) {
  return getSetting(category);
}

function isLongName(category) {
  return getNameMode(category) === 'long';
}

function getLineupNodeMode() {
  return getSetting('lineupNode') === 'photo' ? 'photo' : 'number';
}

function setSetting(category, value) {
  if (!(category in SETTINGS_DEFAULTS)) return;
  if (!isValidSetting(category, value)) return;
  if (settingsState[category] === value) return;

  settingsState[category] = value;
  saveSettings();
  syncSwitchUi(category);
  syncSliderUi(category);
  if (category === 'lineupScale' || category === 'lineupNameSize') applyLayoutSettings();
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
}

// 라인업 관련 CSS 변수를 document root에 일괄 반영.
//   --lp-lineup-scale  : 캠 큼 페이지 라인업 패널 크기 배율 (.layout-big .lp-lineup만 사용)
//   --lp-name-base-size: 라인업 노드 이름 base 글자 크기 (모든 layout 공통)
// 두 값 다 root에 두면 inheritance로 모든 layout에서 자연스럽게 적용된다.
function applyLayoutSettings() {
  const scale = Math.max(LINEUP_SCALE_MIN, Math.min(LINEUP_SCALE_MAX, Number(getSetting('lineupScale')) || 100)) / 100;
  const nameSize = Math.max(LINEUP_NAME_SIZE_MIN, Math.min(LINEUP_NAME_SIZE_MAX, Number(getSetting('lineupNameSize')) || 12));
  const eventSize = Math.max(EVENT_NAME_SIZE_MIN, Math.min(EVENT_NAME_SIZE_MAX, Number(getSetting('eventNameSize')) || 15));
  const root = document.documentElement;
  root.style.setProperty('--lp-lineup-scale', String(scale));
  root.style.setProperty('--lp-name-base-size', `${nameSize}px`);
  root.style.setProperty('--ev-name-base-size', `${eventSize}px`);
  // 라인업 이름 변화 시 pill width / 잘림 보정 다시 호출 (lineup-panel.js의 fit 함수)
  if (typeof window.fitLineupNamePills === 'function') {
    requestAnimationFrame(() => window.fitLineupNamePills());
  }
}

function syncSliderUi(category) {
  const input = document.querySelector(`input[data-settings-slider="${category}"]`);
  if (!input) return;
  const value = Number(getSetting(category));
  if (input.value !== String(value)) input.value = String(value);
  const label = input.closest('.sp-slider-cluster')?.querySelector('.sp-slider-value');
  if (!label) return;
  if (category === 'lineupNameSize' || category === 'eventNameSize') label.textContent = `${value}px`;
  else label.textContent = `${value}%`;
}

function syncNumberUi(category) {
  const input = document.querySelector(`input[data-settings-number="${category}"]`);
  if (!input) return;
  const value = Number(getSetting(category));
  if (Number.isFinite(value) && input.value !== String(value)) input.value = String(value);
}

function setNameMode(category, mode) {
  setSetting(category, mode);
}

function pickName(player, category) {
  if (!player) return '';
  const shortName = player.name || player.playerName || '';
  const longName = player.nameKoLong || player.playerNameKoLong || '';
  if (isLongName(category) && longName) return longName;
  return shortName || longName || '';
}

function openSettingsPopup() {
  if (typeof closeSidebar === 'function') closeSidebar();
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.add('open');
}

function closeSettingsPopup() {
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function isSettingsOpen() {
  const backdrop = document.getElementById('settingsBackdrop');
  return !!(backdrop && backdrop.classList.contains('open'));
}

function getSwitchSides(category) {
  if (category === 'lineupNode') return { off: 'number', on: 'photo' };
  if (category === 'teamLogo') return { off: 'logo', on: 'fa' };
  if (category === 'mainPage') return { off: 'big', on: 'small' };
  if (category === 'statsAutoSwipe') return { off: 'off', on: 'on' };
  return { off: 'short', on: 'long' };
}

function syncSwitchUi(category) {
  const input = document.querySelector(`input[data-settings-cat="${category}"]`);
  if (!input) return;

  const value = getSetting(category);
  const { off, on } = getSwitchSides(category);
  input.checked = value === on;

  const cluster = input.closest('.sp-toggle-cluster');
  if (!cluster) return;

  const offEl = cluster.querySelector(`[data-side="${off}"]`);
  const onEl = cluster.querySelector(`[data-side="${on}"]`);
  if (offEl) offEl.classList.toggle('is-active', value === off);
  if (onEl) onEl.classList.toggle('is-active', value === on);
}

/**
 * 설정 팝업 카테고리 탭 — sp-tabs 안의 버튼 클릭 시 data-sp-tab-section과 매칭하는 섹션만 표시.
 * 탭 상태는 localStorage에 저장(다음 진입 시 마지막 탭 복원).
 */
const SETTINGS_TAB_KEY = 'obs.settings.activeTab.v1';

function applySettingsTab(tabName) {
  document.querySelectorAll('.sp-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.spTab === tabName);
  });
  document.querySelectorAll('[data-sp-tab-section]').forEach(section => {
    if (section.dataset.spTabSection === tabName) section.removeAttribute('hidden');
    else section.setAttribute('hidden', '');
  });
  try { localStorage.setItem(SETTINGS_TAB_KEY, tabName); } catch {}
}

function initSettingsTabs() {
  const tabButtons = document.querySelectorAll('.sp-tab');
  if (!tabButtons.length) return;
  let initial = 'names';
  try {
    const saved = localStorage.getItem(SETTINGS_TAB_KEY);
    if (saved && document.querySelector(`[data-sp-tab="${saved}"]`)) initial = saved;
  } catch {}
  applySettingsTab(initial);
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.spTab;
      if (name) applySettingsTab(name);
    });
  });
}

function initSettingsPopup() {
  // loadSettings는 모듈 로드 시 이미 한 번 실행됨 (아래 즉시 호출). 여기서는 UI 와이어업만.
  const gearBtn = document.getElementById('settingsGearBtn');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const backdrop = document.getElementById('settingsBackdrop');

  initSettingsTabs();

  if (gearBtn) gearBtn.addEventListener('click', openSettingsPopup);
  if (closeBtn) closeBtn.addEventListener('click', closeSettingsPopup);
  if (backdrop) {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeSettingsPopup();
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isSettingsOpen()) {
      event.preventDefault();
      closeSettingsPopup();
    }
  });

  document.querySelectorAll('input[data-settings-cat]').forEach(input => {
    const category = input.dataset.settingsCat;
    syncSwitchUi(category);
    input.addEventListener('change', () => {
      const { off, on } = getSwitchSides(category);
      setSetting(category, input.checked ? on : off);
    });
  });

  document.querySelectorAll('input[data-settings-slider]').forEach(input => {
    const category = input.dataset.settingsSlider;
    syncSliderUi(category);
    input.addEventListener('input', () => {
      setSetting(category, Number(input.value));
    });
  });

  // 숫자 입력 (예: statsAutoSwipeSec). slider와 별개로 단순 number input — sp-num-cluster 안에 들어감.
  document.querySelectorAll('input[data-settings-number]').forEach(input => {
    const category = input.dataset.settingsNumber;
    syncNumberUi(category);
    // change(blur 시) + input(타이핑 중) 둘 다 반영. step=0.5도 그대로 처리됨.
    const handler = () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) setSetting(category, v);
    };
    input.addEventListener('change', handler);
    input.addEventListener('input', handler);
  });
}

// 스크립트 로드 시 즉시 settingsState를 채워둔다. fixture.js가 sessionStorage에서 데이터
// 복원할 때 getSetting('teamLogo') 등을 참조하기 때문에, 그 호출 이전에 settingsState가
// 준비돼있어야 저장된 값(예: 협회 로고 토글 상태)이 반영된다.
loadSettings();

document.addEventListener('DOMContentLoaded', initSettingsPopup);
