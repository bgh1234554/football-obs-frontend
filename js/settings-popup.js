// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [설정 팝업]
// 사이드바 우측 상단 톱니바퀴 → 화면 가운데 설정 모달 오픈.
// 이름 표시(long/short)와 라인업 노드 표시(photo/number)를 관리한다.
// 설정은 localStorage에 저장하고, 변경 시 'settings:change' 이벤트를 보낸다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SETTINGS_STORAGE_KEY = 'obs.settings.v3';
const SETTINGS_LEGACY_STORAGE_KEYS = ['obs.settings.v2'];

const SETTINGS_DEFAULTS = {
  teamName: 'long',   // 라인업 chip + 벤치/부상 컬럼 헤더의 팀명 표시 (default 풀네임)
  lineup: 'short',
  scorer: 'long',
  roster: 'short',
  lineupNode: 'photo',
  lineupHideInitial: 'off',
  lineupScale: 100,   // 캠 큼 페이지 라인업 크기 배율 (50~100, %). 비율 그대로.
                      // 설정 팝업 UI에는 노출 안 함 — 라인업 패널 우상단 핸들 드래그로 조정 (lineup-resize.js).
  lineupNameSize: 12, // 라인업 노드 이름 글자 크기 (px). 설정 팝업 슬라이더로 조정.
                      // long 모드(풀네임)는 CSS에서 0.875× 비율 유지.
  // 라인업 분할 (캠 큼 전용) — ON시 양 팀을 한 피치에 합쳐서 그리지 않고
  // 위(홈)/아래(원정) 두 개의 풀 피치(각 62:105 비율, 패널 전체는 62:210)로 분리.
  // 패널 폭이 줄어 cam이 더 넓어지고 각 팀 가독성 향상. 작은 캠 패널은 영향 없음.
  splitLineup: 'off',
  // 라인업 피치 안의 리그 로고 워시 위치. 센터 서클(default)/왼쪽 사이드라인/오른쪽 사이드라인.
  // 분할 모드에서는 각 피치마다 똑같이 적용된다.
  leagueLogoPos: 'center',
  // 크로마키 대응용 라인업 피치 톤 프리셋.
  lineupPitchTone: 'green',
  // 'logo' = matchInfo.homeTeamLogo (default. 클럽=팀 로고, 국대=국기)
  // 'fa'   = matchInfo.homeTeamFaUrl (협회 로고. URL 없으면 logo로 자동 폴백 — fixture.js)
  teamLogo: 'logo',
  // '메인에 표시' 버튼 클릭 시 자동 이동할 페이지: 'big'(캠 큼) / 'small'(캠 작음 = /detail).
  mainPage: 'big',
  fanReaction: 'on',
  // 경기 스탯 패널 자동 페이지 전환 (Iter 5-2). off='off', on='on' 토글 + 간격 (초 단위, 0.5 단위).
  statsAutoSwipe: 'off',
  statsAutoSwipeSec: 10,
  // 이벤트 패널 (Iter 5-2). 'event'는 이벤트 row 선수명 풀네임/단축, eventNameSize는 폰트 크기 px.
  event: 'long',
  eventNameSize: 15,
  // 라인업 이벤트 표시 (Iter 5-3) — 양 캠 공통 마스터 토글.
  // ON: 교체 IN 선수가 선발 그리드 자리로 올라오고 OUT 선수가 벤치로 내려감.
  // OFF: startXi/벤치 원본 유지 + OUT 선수에 빨간 화살표, IN 선수에 초록 화살표 마커.
  subReflect: 'on',
  // 캠 큼 페이지의 라인업 노드(피치)에 표시할 항목 per-feature 토글. 작은 캠은 마스터 토글만 적용.
  lineupShowGoals: 'on',     // 골/어시스트 이모티콘
  lineupShowCards: 'on',     // 옐로/레드 카드
  lineupShowRating: 'off',   // 평점 박스
  lineupShowSubTime: 'off',  // 교체 IN 시간(72' 등)
};

const EVENT_NAME_SIZE_MIN = 10;
const EVENT_NAME_SIZE_MAX = 22;
const STATS_SWIPE_SEC_MIN = 1;
const STATS_SWIPE_SEC_MAX = 60;

const LINEUP_SCALE_MIN = 50;
const LINEUP_SCALE_MAX = 100;
const LINEUP_NAME_SIZE_MIN = 9;
const LINEUP_NAME_SIZE_MAX = 16;
const LINEUP_PITCH_TONE_STYLES = {
  green: {
    background: 'linear-gradient(135deg, #1a7a3a 0%, #15662f 25%, #1a7a3a 50%, #15662f 75%, #1a7a3a 100%)',
    stripe: 'rgba(255,255,255,.5)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.55)',
    logoOpacity: '.26',
    logoFilter: 'grayscale(.35) saturate(.9) contrast(1.12) brightness(1.08)',
    tacticsMarking: 'rgba(255,255,255,.4)',
    tacticsMarkingSoft: 'rgba(255,255,255,.3)',
    tacticsMarkingFaint: 'rgba(255,255,255,.25)',
    washA: 'rgba(255,255,255,.08)',
    washB: 'rgba(255,255,255,.035)',
  },
  black: {
    background: 'linear-gradient(135deg, #20242c 0%, #13171d 25%, #20242c 50%, #13171d 75%, #20242c 100%)',
    stripe: 'rgba(255,255,255,.34)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.5)',
    logoOpacity: '.36',
    logoFilter: 'grayscale(.18) saturate(1.02) contrast(1.18) brightness(1.32)',
    tacticsMarking: 'rgba(255,255,255,.44)',
    tacticsMarkingSoft: 'rgba(255,255,255,.32)',
    tacticsMarkingFaint: 'rgba(255,255,255,.26)',
    washA: 'rgba(255,255,255,.055)',
    washB: 'rgba(255,255,255,.022)',
  },
  blue: {
    background: 'linear-gradient(135deg, #12649f 0%, #0c4f82 25%, #12649f 50%, #0c4f82 75%, #12649f 100%)',
    stripe: 'rgba(255,255,255,.52)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.52)',
    logoOpacity: '.31',
    logoFilter: 'grayscale(.26) saturate(.96) contrast(1.16) brightness(1.18)',
    tacticsMarking: 'rgba(255,255,255,.42)',
    tacticsMarkingSoft: 'rgba(255,255,255,.31)',
    tacticsMarkingFaint: 'rgba(255,255,255,.25)',
    washA: 'rgba(255,255,255,.075)',
    washB: 'rgba(255,255,255,.03)',
  },
  white: {
    background: 'linear-gradient(135deg, #f7f9fc 0%, #e9edf2 25%, #f7f9fc 50%, #e9edf2 75%, #f7f9fc 100%)',
    stripe: 'rgba(15,23,42,.4)',
    border: 'rgba(15,23,42,.12)',
    marking: 'rgba(15,23,42,.34)',
    logoOpacity: '.28',
    logoFilter: 'grayscale(.5) saturate(.78) contrast(1.2) brightness(.82)',
    tacticsMarking: 'rgba(15,23,42,.34)',
    tacticsMarkingSoft: 'rgba(15,23,42,.26)',
    tacticsMarkingFaint: 'rgba(15,23,42,.2)',
    washA: 'rgba(15,23,42,.08)',
    washB: 'rgba(15,23,42,.03)',
  },
  red: {
    background: 'linear-gradient(135deg, #9f1d34 0%, #7f172a 25%, #9f1d34 50%, #7f172a 75%, #9f1d34 100%)',
    stripe: 'rgba(255,255,255,.44)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.5)',
    logoOpacity: '.31',
    logoFilter: 'grayscale(.24) saturate(.94) contrast(1.16) brightness(1.16)',
    tacticsMarking: 'rgba(255,255,255,.4)',
    tacticsMarkingSoft: 'rgba(255,255,255,.3)',
    tacticsMarkingFaint: 'rgba(255,255,255,.25)',
    washA: 'rgba(255,255,255,.07)',
    washB: 'rgba(255,255,255,.028)',
  },
  purple: {
    background: 'linear-gradient(135deg, #6d28d9 0%, #581c87 25%, #6d28d9 50%, #581c87 75%, #6d28d9 100%)',
    stripe: 'rgba(255,255,255,.46)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.52)',
    logoOpacity: '.33',
    logoFilter: 'grayscale(.22) saturate(.98) contrast(1.18) brightness(1.24)',
    tacticsMarking: 'rgba(255,255,255,.42)',
    tacticsMarkingSoft: 'rgba(255,255,255,.31)',
    tacticsMarkingFaint: 'rgba(255,255,255,.25)',
    washA: 'rgba(255,255,255,.075)',
    washB: 'rgba(255,255,255,.03)',
  },
  mint: {
    background: 'linear-gradient(135deg, #49b39a 0%, #2f8f7b 25%, #49b39a 50%, #2f8f7b 75%, #49b39a 100%)',
    stripe: 'rgba(255,255,255,.48)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.5)',
    logoOpacity: '.28',
    logoFilter: 'grayscale(.32) saturate(.88) contrast(1.14) brightness(1.08)',
    tacticsMarking: 'rgba(255,255,255,.4)',
    tacticsMarkingSoft: 'rgba(255,255,255,.3)',
    tacticsMarkingFaint: 'rgba(255,255,255,.25)',
    washA: 'rgba(255,255,255,.07)',
    washB: 'rgba(255,255,255,.028)',
  },
  brown: {
    background: 'linear-gradient(135deg, #714a24 0%, #5a3917 25%, #714a24 50%, #5a3917 75%, #714a24 100%)',
    stripe: 'rgba(255,255,255,.42)',
    border: 'rgba(255,255,255,.12)',
    marking: 'rgba(255,255,255,.48)',
    logoOpacity: '.3',
    logoFilter: 'grayscale(.24) saturate(.95) contrast(1.18) brightness(1.2)',
    tacticsMarking: 'rgba(255,255,255,.4)',
    tacticsMarkingSoft: 'rgba(255,255,255,.3)',
    tacticsMarkingFaint: 'rgba(255,255,255,.24)',
    washA: 'rgba(255,255,255,.065)',
    washB: 'rgba(255,255,255,.026)',
  },
};
const LINEUP_PITCH_TONES = Object.keys(LINEUP_PITCH_TONE_STYLES);

const settingsState = { ...SETTINGS_DEFAULTS };

function syncAllSettingsUi() {
  Object.keys(SETTINGS_DEFAULTS).forEach(category => {
    syncSwitchUi(category);
    syncSliderUi(category);
    syncNumberUi(category);
    syncRadioUi(category);
  });
}

// 3-state 라디오 클러스터 동기화 — leagueLogoPos 같은 다항 설정 전용.
function syncRadioUi(category) {
  const buttons = document.querySelectorAll(`[data-settings-radio="${category}"]`);
  if (!buttons.length) return;
  const value = getSetting(category);
  buttons.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.settingsRadioValue === value);
    btn.setAttribute('aria-pressed', btn.dataset.settingsRadioValue === value ? 'true' : 'false');
  });
}

function emitSettingsChange(category) {
  const value = getSetting(category);
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
}

function isValidSetting(category, value) {
  if (category === 'lineupNode') return value === 'number' || value === 'photo';
  if (category === 'teamLogo') return value === 'logo' || value === 'fa';
  if (category === 'mainPage') return value === 'big' || value === 'small';
  if (category === 'leagueLogoPos') return value === 'center' || value === 'left' || value === 'right';
  if (category === 'lineupPitchTone') return LINEUP_PITCH_TONES.includes(value);
  if (category === 'statsAutoSwipe') return value === 'on' || value === 'off';
  if (category === 'subReflect'
    || category === 'fanReaction'
    || category === 'lineupHideInitial'
    || category === 'splitLineup'
    || category === 'lineupShowGoals'
    || category === 'lineupShowCards'
    || category === 'lineupShowRating'
    || category === 'lineupShowSubTime') {
    return value === 'on' || value === 'off';
  }
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
    const storageKeys = [SETTINGS_STORAGE_KEY, ...SETTINGS_LEGACY_STORAGE_KEYS];
    let parsed = null;
    let loadedKey = '';
    for (const key of storageKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const candidate = JSON.parse(raw);
        if (!candidate || typeof candidate !== 'object') continue;
        parsed = candidate;
        loadedKey = key;
        break;
      } catch {}
    }
    if (!parsed) return;

    const isLegacyPayload = loadedKey !== SETTINGS_STORAGE_KEY;

    Object.keys(SETTINGS_DEFAULTS).forEach(category => {
      let value = parsed[category];
      if (isLegacyPayload && category === 'statsAutoSwipeSec') {
        const legacySec = Number(value);
        if (!Number.isFinite(legacySec) || legacySec === 5) {
          value = SETTINGS_DEFAULTS.statsAutoSwipeSec;
        }
      }
      if (isValidSetting(category, value)) settingsState[category] = value;
    });

    if (isLegacyPayload) {
      saveSettings();
      SETTINGS_LEGACY_STORAGE_KEYS.forEach(key => {
        try { localStorage.removeItem(key); } catch {}
      });
    }
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
  syncRadioUi(category);
  if (category === 'lineupScale' || category === 'lineupNameSize' || category === 'lineupPitchTone') applyLayoutSettings();
  // Iter 5-3: per-feature 토글이 바뀌면 body 클래스 갱신을 위해 applyLayoutSettings 호출.
  if (category === 'fanReaction'
    || category === 'lineupShowGoals' || category === 'lineupShowCards'
    || category === 'lineupShowRating' || category === 'lineupShowSubTime') {
    applyLayoutSettings();
  }
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
}

function resetSettingsToDefaults() {
  const changedCategories = Object.keys(SETTINGS_DEFAULTS)
    .filter(category => settingsState[category] !== SETTINGS_DEFAULTS[category]);

  if (!changedCategories.length) {
    if (typeof showToast === 'function') showToast('이미 기본 설정입니다');
    return;
  }

  Object.keys(settingsState).forEach(category => { delete settingsState[category]; });
  Object.assign(settingsState, SETTINGS_DEFAULTS);

  try { localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch {}
  SETTINGS_LEGACY_STORAGE_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch {}
  });

  syncAllSettingsUi();
  applyLayoutSettings();
  changedCategories.forEach(emitSettingsChange);

  if (typeof showToast === 'function') showToast('설정을 기본값으로 초기화했습니다');
}

function clearAppCaches() {
  if (typeof resetFixtureDrivenState === 'function') {
    resetFixtureDrivenState({
      clearFixtureId: true,
      clearCache: true,
      statusMessage: '경기 캐시 초기화 완료'
    });
  } else {
    try { sessionStorage.removeItem('cached_fixture_data'); } catch {}
    try { localStorage.removeItem('cached_fixture_data'); } catch {}
  }

  try { localStorage.removeItem('last_fixture_id'); } catch {}

  if (typeof showToast === 'function') showToast('캐시를 초기화했습니다');
}

// 라인업 관련 CSS 변수를 document root에 일괄 반영.
//   --lp-lineup-scale  : 캠 큼 페이지 라인업 패널 크기 배율 (.layout-big .lp-lineup만 사용)
//   --lp-name-base-size: 라인업 노드 이름 base 글자 크기 (모든 layout 공통)
// 두 값 다 root에 두면 inheritance로 모든 layout에서 자연스럽게 적용된다.
function applyLayoutSettings() {
  const scale = Math.max(LINEUP_SCALE_MIN, Math.min(LINEUP_SCALE_MAX, Number(getSetting('lineupScale')) || 100)) / 100;
  const nameSize = Math.max(LINEUP_NAME_SIZE_MIN, Math.min(LINEUP_NAME_SIZE_MAX, Number(getSetting('lineupNameSize')) || 12));
  const eventSize = Math.max(EVENT_NAME_SIZE_MIN, Math.min(EVENT_NAME_SIZE_MAX, Number(getSetting('eventNameSize')) || 15));
  const pitchTone = LINEUP_PITCH_TONE_STYLES[getSetting('lineupPitchTone')] || LINEUP_PITCH_TONE_STYLES.green;
  const root = document.documentElement;
  root.style.setProperty('--lp-lineup-scale', String(scale));
  root.style.setProperty('--lp-name-base-size', `${nameSize}px`);
  root.style.setProperty('--ev-name-base-size', `${eventSize}px`);
  root.style.setProperty('--lp-pitch-bg', pitchTone.background);
  root.style.setProperty('--lp-pitch-stripe-color', pitchTone.stripe);
  root.style.setProperty('--lp-pitch-border-color', pitchTone.border);
  root.style.setProperty('--lp-pitch-marking-color', pitchTone.marking);
  root.style.setProperty('--lp-pitch-wash-a', pitchTone.washA);
  root.style.setProperty('--lp-pitch-wash-b', pitchTone.washB);
  root.style.setProperty('--lp-pitch-logo-opacity', pitchTone.logoOpacity || '.26');
  root.style.setProperty('--lp-pitch-logo-filter', pitchTone.logoFilter || 'grayscale(.35) saturate(.9) contrast(1.12) brightness(1.08)');
  root.style.setProperty('--td-pitch-bg', pitchTone.background);
  root.style.setProperty('--td-pitch-stripe-color', pitchTone.stripe);
  root.style.setProperty('--td-pitch-border-color', pitchTone.border);
  root.style.setProperty('--td-pitch-marking-color', pitchTone.tacticsMarking || pitchTone.marking);
  root.style.setProperty('--td-pitch-marking-soft', pitchTone.tacticsMarkingSoft || pitchTone.tacticsMarking || pitchTone.marking);
  root.style.setProperty('--td-pitch-marking-faint', pitchTone.tacticsMarkingFaint || pitchTone.tacticsMarkingSoft || pitchTone.tacticsMarking || pitchTone.marking);
  // Iter 5-3: per-feature 토글 → body 클래스. CSS에서 .layout-big에서만 적용해 큰 캠 숨김.
  const body = document.body;
  if (body) {
    body.classList.toggle('no-fan-reaction', getSetting('fanReaction') !== 'on');
    body.classList.toggle('no-lineup-goals',   getSetting('lineupShowGoals')   !== 'on');
    body.classList.toggle('no-lineup-cards',   getSetting('lineupShowCards')   !== 'on');
    body.classList.toggle('no-lineup-rating',  getSetting('lineupShowRating')  !== 'on');
    body.classList.toggle('no-lineup-subtime', getSetting('lineupShowSubTime') !== 'on');
  }
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
  const shouldHideInitial = category === 'lineup'
    && !isLongName('lineup')
    && getSetting('lineupHideInitial') === 'on';
  const displayShortName = shouldHideInitial
    ? stripLeadingLineupInitial(shortName) || shortName
    : shortName;
  if (isLongName(category) && longName) return longName;
  return displayShortName || longName || shortName || '';
}

function stripLeadingLineupInitial(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  const stripped = text
    // 앞쪽의 이니셜 블록(J. / M. / J.-P. / Á. 등)을 점 기준으로 제거
    .replace(/^\s*(?:[^\s.．｡。]+[.．｡。]\s*)+/u, '')
    .trim();
  return stripped || text;
}

function openSettingsPopup() {
  if (typeof closeSidebar === 'function') closeSidebar();
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.add('open');
  syncSettingsTabSectionHeights();
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
  if (category === 'subReflect'
    || category === 'lineupHideInitial'
    || category === 'fanReaction'
    || category === 'splitLineup'
    || category === 'lineupShowGoals'
    || category === 'lineupShowCards'
    || category === 'lineupShowRating'
    || category === 'lineupShowSubTime') {
    return { off: 'off', on: 'on' };
  }
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

function syncSettingsTabSectionHeights() {
  const body = document.querySelector('.sp-body');
  const sections = Array.from(document.querySelectorAll('[data-sp-tab-section]'));
  if (!body || !sections.length) return;

  const bodyRect = body.getBoundingClientRect();
  const bodyStyles = getComputedStyle(body);
  const availableWidth = Math.max(
    0,
    bodyRect.width - (parseFloat(bodyStyles.paddingLeft) || 0) - (parseFloat(bodyStyles.paddingRight) || 0)
  );

  let maxHeight = 0;
  sections.forEach(section => {
    const wasHidden = section.hasAttribute('hidden');
    const prevCssText = section.style.cssText;

    if (wasHidden) section.removeAttribute('hidden');
    section.style.position = 'absolute';
    section.style.visibility = 'hidden';
    section.style.pointerEvents = 'none';
    section.style.left = '-99999px';
    section.style.top = '0';
    section.style.width = `${availableWidth}px`;
    section.style.minHeight = '';

    const height = Math.ceil(section.getBoundingClientRect().height || section.scrollHeight || 0);
    if (height > maxHeight) maxHeight = height;

    section.style.cssText = prevCssText;
    if (wasHidden) section.setAttribute('hidden', '');
  });

  if (!maxHeight) return;
  sections.forEach(section => {
    section.style.minHeight = `${maxHeight}px`;
  });
}

function applySettingsTab(tabName) {
  document.querySelectorAll('.sp-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.spTab === tabName);
  });
  document.querySelectorAll('[data-sp-tab-section]').forEach(section => {
    if (section.dataset.spTabSection === tabName) section.removeAttribute('hidden');
    else section.setAttribute('hidden', '');
  });
  syncSettingsTabSectionHeights();
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
  const settingsResetBtn = document.getElementById('settingsResetBtn');
  const cacheResetBtn = document.getElementById('cacheResetBtn');

  initSettingsTabs();
  syncSettingsTabSectionHeights();

  window.addEventListener('resize', () => {
    syncSettingsTabSectionHeights();
  });

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

  // 3-state 라디오 (leagueLogoPos 등) — 버튼 클릭 시 data-settings-radio-value를 setSetting에 전달.
  document.querySelectorAll('[data-settings-radio]').forEach(btn => {
    const category = btn.dataset.settingsRadio;
    btn.addEventListener('click', () => {
      const value = btn.dataset.settingsRadioValue;
      if (value) setSetting(category, value);
    });
  });
  Array.from(new Set(Array.from(document.querySelectorAll('[data-settings-radio]')).map(btn => btn.dataset.settingsRadio)))
    .forEach(category => syncRadioUi(category));

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

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', () => {
      if (!confirm('저장된 설정을 기본값으로 초기화할까요?')) return;
      resetSettingsToDefaults();
    });
  }

  if (cacheResetBtn) {
    cacheResetBtn.addEventListener('click', () => {
      if (!confirm('경기 캐시와 최근 경기 ID를 초기화할까요?')) return;
      clearAppCaches();
    });
  }
}

// 스크립트 로드 시 즉시 settingsState를 채워둔다. fixture.js가 sessionStorage에서 데이터
// 복원할 때 getSetting('teamLogo') 등을 참조하기 때문에, 그 호출 이전에 settingsState가
// 준비돼있어야 저장된 값(예: 협회 로고 토글 상태)이 반영된다.
loadSettings();

document.addEventListener('DOMContentLoaded', initSettingsPopup);
