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
};

const settingsState = { ...SETTINGS_DEFAULTS };

function isValidSetting(category, value) {
  if (category === 'lineupNode') return value === 'number' || value === 'photo';
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
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
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

function initSettingsPopup() {
  loadSettings();

  const gearBtn = document.getElementById('settingsGearBtn');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const backdrop = document.getElementById('settingsBackdrop');

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
}

document.addEventListener('DOMContentLoaded', initSettingsPopup);
