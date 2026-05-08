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
  // 평점 색상 (Iter 5-4). lineup-events.js의 lpRatingColor가 이 값을 우선 사용.
  // 사용자가 설정 팝업의 '이벤트/스탯' 탭에서 7구간 색을 직접 조정할 수 있다.
  // color input은 항상 소문자 hex를 반환하므로 default도 소문자로 통일 — 비교/리셋 일관성.
  ratingColorBelow6:    '#cd0b00',  // < 6.0
  ratingColor6:         '#ed7e07',  // 6.0 ~ 6.4
  ratingColor65:        '#d9af00',  // 6.5 ~ 6.9
  ratingColor7:         '#00c424',  // 7.0 ~ 7.9
  ratingColor8:         '#00adc4',  // 8.0 ~ 8.9
  ratingColor9:         '#374df5',  // 9.0 ~ 9.4
  ratingColor95:        '#7f1d6d',  // ≥ 9.5
  // 배경 (Iter 5-7). 설정 팝업 '배경' 탭에서 조정. 테마 탭의 uiBg 옵션은 여기로 이전됨.
  bgColor:        '#111827', // 점수판 외곽 배경색 (테마 탭 uiBg에서 이전)
  bgImageUrl:     '',        // 외부 URL — localStorage에 영구 저장
  bgImageData:    '',        // 파일 첨부 base64 데이터 URL — 3MB까지만 허용
  // 패널 투명도 (0~100). 100=완전 불투명(기본), 낮을수록 배경 이미지가 비쳐 보임.
  // applyLayoutSettings에서 :root --panel-alpha CSS 변수에 0~1로 매핑돼 적용.
  panelAlpha:     100,
  // 라인업 투명도 (0~100). 라인업 칼럼 배경 + 피치 배경/라인을 함께 조정.
  // 선수 노드/이름은 CSS에서 별도 레이어로 유지한다.
  pitchAlpha:     100,
  // 그린스크린 모드 (Iter 5-7). ON시 모든 초록 계열(60~170° hue)을 자동 치환.
  // OBS 크로마키와 충돌 방지용.
  // 카테고리별 분리 정책:
  //   - 이벤트 라벨/막대 (.ev-label-green/.ev-bar-green): 항상 마젠타 (가장 안전 + 평점/팀컬러와 충돌 X)
  //   - 라인업 교체 IN 마커 (.dp-sub-marker.is-in): 항상 파랑 (자연스럽고 OUT의 빨강과 보색 대비)
  //   - 팀 컬러 / PK 색 / 평점 / 피치 / 보드 등: greenscreenIntensity 설정으로 사용자가 강도 선택
  greenscreen:    'off',
  // 그린스크린 치환 강도 (Iter 5-7).
  // 안전 순서 (가장 안전 → 가장 위험): strong > moderate > mild > natural
  //   strong   → 마젠타 (가장 안전 + 어떤 색과도 충돌 X. 단, 초록 팀 컬러엔 다소 부자연스러움)
  //   moderate → 파랑 (중립적, 차분)
  //   mild     → 어두운 청록 (그린 느낌 유지, 자연스러움 — 기본값)
  //   natural  → 어두운 초록 (가장 자연스러움. chromakey 위험 — strict 키 설정엔 키잉될 수 있음)
  // 적용 범위: 팀 컬러 / PK 색 / 피치 / 보드 등.
  // 평점은 항상 마젠타 고정(lineup-events.js), 이벤트 라벨/막대는 항상 마젠타 고정(CSS),
  // 교체 IN 마커는 항상 파랑 고정(CSS).
  greenscreenIntensity: 'mild',
};

// 배경 이미지 파일 크기 제한 (Iter 5-7). 3MB — 1080p JPEG/WebP 충분히 수용.
const BG_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const EVENT_NAME_SIZE_MIN = 10;
const EVENT_NAME_SIZE_MAX = 22;
const STATS_SWIPE_SEC_MIN = 1;
const STATS_SWIPE_SEC_MAX = 60;
const LOW_PANEL_ALPHA_TEXT_OUTLINE_THRESHOLD = 70;

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

// 현재 설정값을 보관하는 단일 객체. loadSettings()가 localStorage에서 채우고,
// setSetting()이 변경 시점마다 saveSettings()로 다시 직렬화한다.
const settingsState = { ...SETTINGS_DEFAULTS };

/**
 * 모든 설정 카테고리의 UI(스위치/슬라이더/숫자입력/라디오/색상)를 settingsState 기준으로 일괄 동기화.
 * 설정 초기화나 탭 전환처럼 "현재 상태를 통째로 화면에 반영"해야 할 때 호출.
 */
function syncAllSettingsUi() {
  Object.keys(SETTINGS_DEFAULTS).forEach(category => {
    syncSwitchUi(category);
    syncSliderUi(category);
    syncNumberUi(category);
    syncRadioUi(category);
    syncColorUi(category);
    syncTextUi(category);
    syncSelectUi(category);
  });
}

/**
 * 3-state 라디오 클러스터 동기화 — leagueLogoPos(center/left/right), lineupPitchTone(8종) 같은
 * 다항 설정 전용. 같은 category를 공유하는 버튼 그룹에서 현재 값과 일치하는 버튼만 is-active.
 */
function syncRadioUi(category) {
  const buttons = document.querySelectorAll(`[data-settings-radio="${category}"]`);
  if (!buttons.length) return;
  const value = getSetting(category);
  buttons.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.settingsRadioValue === value);
    btn.setAttribute('aria-pressed', btn.dataset.settingsRadioValue === value ? 'true' : 'false');
  });
}

/**
 * 'settings:change' 커스텀 이벤트를 보낸다.
 * events-panel/stats-panel 등 외부 모듈이 캐시된 마지막 fixture로 재렌더 트리거할 때 사용.
 * detail.mode는 legacy 호환용(과거 코드가 mode 키만 읽는 경우 대비).
 */
function emitSettingsChange(category) {
  const value = getSetting(category);
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
}

/**
 * 카테고리별 값 유효성 검사. localStorage에서 손상된/구버전 값이 들어와도
 * 잘못된 값이 settingsState에 들어가지 않도록 가드 역할.
 *
 * - enum 카테고리(lineupNode, teamLogo, mainPage, leagueLogoPos, lineupPitchTone)는 후보 비교.
 * - on/off 토글 카테고리는 'on' | 'off' 문자열만 허용.
 * - 숫자 카테고리(slider/number)는 범위(min/max) 안 finite 숫자만 허용.
 * - 그 외(scorer/lineup/roster/teamName/event)는 'short' | 'long'만 허용.
 */
const RATING_COLOR_KEYS = new Set([
  'ratingColorBelow6', 'ratingColor6', 'ratingColor65',
  'ratingColor7', 'ratingColor8', 'ratingColor9', 'ratingColor95',
]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidSetting(category, value) {
  if (RATING_COLOR_KEYS.has(category)) return typeof value === 'string' && HEX_COLOR_RE.test(value);
  if (category === 'bgColor') return typeof value === 'string' && HEX_COLOR_RE.test(value);
  if (category === 'bgImageUrl') return typeof value === 'string';     // 빈 문자열 허용 (= 배경 없음)
  if (category === 'bgImageData') return typeof value === 'string';    // 빈 문자열 또는 data URL
  if (category === 'lineupNode') return value === 'number' || value === 'photo';
  if (category === 'teamLogo') return value === 'logo' || value === 'fa';
  if (category === 'mainPage') return value === 'big' || value === 'small';
  if (category === 'leagueLogoPos') return value === 'center' || value === 'left' || value === 'right';
  if (category === 'lineupPitchTone') return LINEUP_PITCH_TONES.includes(value);
  if (category === 'statsAutoSwipe') return value === 'on' || value === 'off';
  if (category === 'greenscreenIntensity') return ['strong','moderate','mild','natural'].includes(value);
  if (category === 'subReflect'
    || category === 'fanReaction'
    || category === 'lineupHideInitial'
    || category === 'splitLineup'
    || category === 'lineupShowGoals'
    || category === 'lineupShowCards'
    || category === 'lineupShowRating'
    || category === 'lineupShowSubTime'
    || category === 'greenscreen') {
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
  if (category === 'panelAlpha' || category === 'pitchAlpha') {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }
  return value === 'short' || value === 'long';
}

/**
 * localStorage에서 설정값 복원. v3 우선, 없으면 legacy v2도 시도.
 * 1) 현재 키와 legacy 키들을 순서대로 훑어 첫 번째로 파싱 가능한 것을 채택.
 * 2) legacy payload면 마이그레이션 — statsAutoSwipeSec의 옛 default(5초)를 새 default(10초)로 승격.
 * 3) 카테고리별로 isValidSetting 통과한 값만 settingsState에 반영(잘못된 값은 default 유지).
 * 4) legacy를 읽었으면 v3 키로 재저장 후 legacy 키 정리.
 * 5) layout 관련 CSS 변수도 같이 적용.
 */
function loadSettings() {
  try {
    // 1) v3 → v2 순서로 첫 valid payload 탐색.
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

    // 2) 카테고리별 적용 + legacy 마이그레이션 보정.
    Object.keys(SETTINGS_DEFAULTS).forEach(category => {
      let value = parsed[category];
      if (isLegacyPayload && category === 'statsAutoSwipeSec') {
        // v2의 default 5초였던 사용자는 v3 default 10초로 승격(명시적으로 5초로 둔 사용자도 동일하게 끌어올림).
        const legacySec = Number(value);
        if (!Number.isFinite(legacySec) || legacySec === 5) {
          value = SETTINGS_DEFAULTS.statsAutoSwipeSec;
        }
      }
      if (isValidSetting(category, value)) settingsState[category] = value;
    });

    // 3) v2에서 읽은 경우 v3로 즉시 재저장 후 legacy 정리.
    if (isLegacyPayload) {
      if (saveSettings()) {
        SETTINGS_LEGACY_STORAGE_KEYS.forEach(key => {
          try { localStorage.removeItem(key); } catch {}
        });
      }
    }
  } catch {}
  // 4) layout(CSS 변수) 즉시 반영. (script 로드 시점에 호출되므로 body 클래스도 같이 세팅됨.)
  applyLayoutSettings();
}

/** 현재 settingsState를 v3 키에 JSON으로 저장. localStorage 풀이면 무시. */
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsState));
    return true;
  } catch (error) {
    console.warn('설정 저장 실패:', error);
    return false;
  }
}

/** settingsState에 값이 없으면 default fallback. 외부 모듈은 이 함수만 통해 값 조회. */
function getSetting(category) {
  return settingsState[category] ?? SETTINGS_DEFAULTS[category];
}

/** 'short' | 'long' 카테고리(scorer/lineup/roster/teamName/event)의 현재 모드 반환. */
function getNameMode(category) {
  return getSetting(category);
}

/** 'short' | 'long' 카테고리가 'long'인지 boolean으로 변환. 표시 분기 헬퍼. */
function isLongName(category) {
  return getNameMode(category) === 'long';
}

/** 라인업 노드 표시 모드. 'photo'(default) 또는 'number'(팀 컬러 등번호). */
function getLineupNodeMode() {
  return getSetting('lineupNode') === 'photo' ? 'photo' : 'number';
}

/**
 * 설정값 변경 단일 진입점.
 * 1) 알 수 없는 카테고리 / 잘못된 값 / 변경 없음(no-op)이면 즉시 return.
 * 2) settingsState 업데이트 + 즉시 localStorage 저장.
 * 3) 연관된 모든 UI(스위치/슬라이더/라디오) 동기화.
 * 4) layout/CSS 변수에 영향 주는 카테고리는 applyLayoutSettings()로 root 변수 갱신.
 * 5) 'settings:change' 이벤트로 외부 모듈(events-panel/stats-panel/lineup-panel)에 통지.
 */
function setSetting(category, value) {
  if (!(category in SETTINGS_DEFAULTS)) return;
  if (!isValidSetting(category, value)) return;
  if (settingsState[category] === value) return;

  settingsState[category] = value;
  saveSettings();
  syncSwitchUi(category);
  syncSliderUi(category);
  syncRadioUi(category);
  syncColorUi(category);
  syncTextUi(category);
  syncSelectUi(category);
  if (category === 'lineupScale' || category === 'lineupNameSize' || category === 'lineupPitchTone') applyLayoutSettings();
  // Iter 5-3: per-feature 토글이 바뀌면 body 클래스 갱신을 위해 applyLayoutSettings 호출.
  if (category === 'fanReaction'
    || category === 'lineupShowGoals' || category === 'lineupShowCards'
    || category === 'lineupShowRating' || category === 'lineupShowSubTime') {
    applyLayoutSettings();
  }
  // Iter 5-7: 배경 색/이미지 변경 → 즉시 :root CSS 변수 갱신.
  if (category === 'bgColor'
    || category === 'bgImageUrl'
    || category === 'bgImageData'
    || category === 'panelAlpha'
    || category === 'pitchAlpha') {
    applyBackgroundSettings();
  }
  // Iter 5-7: 그린스크린 토글 또는 강도 변경 → 모든 색상(피치 톤/배경/팀컬러/평점) 일괄 재적용.
  if (category === 'greenscreen' || category === 'greenscreenIntensity') {
    applyLayoutSettings();
    if (typeof render === 'function') render();
    // theme:colors-changed로 라인업/스탯 패널이 인라인 컬러를 다시 그리도록 신호.
    document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: category } }));
  }
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
}

/**
 * 설정값 전체 초기화. 사이드바 "설정 초기화" 버튼이 호출.
 * 1) 변경된 카테고리만 추려둔다(이벤트 emit 대상 + "변경된 게 없으면 토스트만").
 * 2) settingsState를 비우고 default로 재할당(레퍼런스는 유지 — 외부 캡처 의존성 보호).
 * 3) v3 + legacy storage 키 모두 제거.
 * 4) UI 동기화 + layout 갱신 + 변경 있던 카테고리만 'settings:change' 이벤트 발행.
 */
function resetSettingsToDefaults() {
  // 1) 실제로 default와 다른 값이 있던 카테고리만 모은다.
  const changedCategories = Object.keys(SETTINGS_DEFAULTS)
    .filter(category => settingsState[category] !== SETTINGS_DEFAULTS[category]);

  if (!changedCategories.length) {
    if (typeof showToast === 'function') showToast('이미 기본 설정입니다');
    return;
  }

  // 2) settingsState 객체 자체는 유지하되 키만 제거 후 default 재할당(레퍼런스 보존).
  Object.keys(settingsState).forEach(category => { delete settingsState[category]; });
  Object.assign(settingsState, SETTINGS_DEFAULTS);

  // 3) v3 + legacy 키 모두 정리 — 다음 페이지 로드에서도 default가 나오도록.
  try { localStorage.removeItem(SETTINGS_STORAGE_KEY); } catch {}
  SETTINGS_LEGACY_STORAGE_KEYS.forEach(key => {
    try { localStorage.removeItem(key); } catch {}
  });

  // 4) UI/layout 동기화 + 외부 모듈 통지(변경 있던 카테고리만).
  syncAllSettingsUi();
  applyLayoutSettings();
  changedCategories.forEach(emitSettingsChange);

  if (typeof showToast === 'function') showToast('설정을 기본값으로 초기화했습니다');
}

/**
 * 경기 캐시 + 마지막 fixture id 초기화. 사이드바 "캐시 초기화" 버튼이 호출.
 * resetFixtureDrivenState가 있으면 그쪽에 위임(상태/배지/패널까지 정리),
 * 없으면 sessionStorage/localStorage만 직접 청소(fallback).
 */
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

function resetRatingColorsToDefaults() {
  let changed = false;
  RATING_COLOR_KEYS.forEach(category => {
    if (settingsState[category] !== SETTINGS_DEFAULTS[category]) {
      changed = true;
      setSetting(category, SETTINGS_DEFAULTS[category]);
    }
  });

  if (typeof showToast === 'function') {
    showToast(changed ? '평점 색상을 기본값으로 초기화했습니다' : '이미 기본 평점 색상입니다');
  }
}

/**
 * 라인업/피치/이벤트 폰트 등 설정값 → CSS 변수와 body 클래스 일괄 반영.
 *
 * CSS 변수(:root에 등록):
 *   --lp-lineup-scale       : 캠 큼 페이지 라인업 패널 크기 배율 (.layout-big .lp-lineup 전용)
 *   --lp-name-base-size     : 라인업 노드 이름 base 글자 크기 (모든 layout 공통)
 *   --ev-name-base-size     : 이벤트 패널 base 글자 크기
 *   --lp-pitch-*            : 라인업 패널 피치 색감 (background/stripe/border/marking/wash/logo)
 *   --td-pitch-*            : 전술판 피치 색감 (라인업과 같은 톤 프리셋 사용)
 *
 * body 클래스(Iter 5-3 per-feature 토글):
 *   .no-fan-reaction / .no-lineup-goals / .no-lineup-cards
 *   .no-lineup-rating / .no-lineup-subtime
 *   → CSS에서 .layout-big 하위에서만 매칭해 큰 캠 표시 토글.
 *
 * 마지막에 fitLineupNamePills로 이름 잘림 보정 재호출(이름 폰트 크기 변경 영향).
 */
function applyLayoutSettings() {
  const scale = Math.max(LINEUP_SCALE_MIN, Math.min(LINEUP_SCALE_MAX, Number(getSetting('lineupScale')) || 100)) / 100;
  const nameSize = Math.max(LINEUP_NAME_SIZE_MIN, Math.min(LINEUP_NAME_SIZE_MAX, Number(getSetting('lineupNameSize')) || 12));
  const eventSize = Math.max(EVENT_NAME_SIZE_MIN, Math.min(EVENT_NAME_SIZE_MAX, Number(getSetting('eventNameSize')) || 15));
  const pitchTone = LINEUP_PITCH_TONE_STYLES[getSetting('lineupPitchTone')] || LINEUP_PITCH_TONE_STYLES.green;
  const root = document.documentElement;
  root.style.setProperty('--lp-lineup-scale', String(scale));
  root.style.setProperty('--lp-name-base-size', `${nameSize}px`);
  root.style.setProperty('--ev-name-base-size', `${eventSize}px`);
  // 그린스크린 ON일 때 피치 톤의 모든 색을 시안으로 자동 치환 (gradient/단색 모두 처리).
  // 사용자가 'green' 톤을 골라뒀어도 OBS 크로마키와 충돌하지 않게 보호.
  root.style.setProperty('--lp-pitch-bg',          chromaSafeGradient(pitchTone.background));
  root.style.setProperty('--lp-pitch-stripe-color', chromaSafe(pitchTone.stripe));
  root.style.setProperty('--lp-pitch-border-color', chromaSafe(pitchTone.border));
  root.style.setProperty('--lp-pitch-marking-color', chromaSafe(pitchTone.marking));
  root.style.setProperty('--lp-pitch-wash-a', chromaSafe(pitchTone.washA));
  root.style.setProperty('--lp-pitch-wash-b', chromaSafe(pitchTone.washB));
  root.style.setProperty('--lp-pitch-logo-opacity', pitchTone.logoOpacity || '.26');
  root.style.setProperty('--lp-pitch-logo-filter', pitchTone.logoFilter || 'grayscale(.35) saturate(.9) contrast(1.12) brightness(1.08)');
  root.style.setProperty('--td-pitch-bg',          chromaSafeGradient(pitchTone.background));
  root.style.setProperty('--td-pitch-stripe-color', chromaSafe(pitchTone.stripe));
  root.style.setProperty('--td-pitch-border-color', chromaSafe(pitchTone.border));
  root.style.setProperty('--td-pitch-marking-color', chromaSafe(pitchTone.tacticsMarking || pitchTone.marking));
  root.style.setProperty('--td-pitch-marking-soft',  chromaSafe(pitchTone.tacticsMarkingSoft || pitchTone.tacticsMarking || pitchTone.marking));
  root.style.setProperty('--td-pitch-marking-faint', chromaSafe(pitchTone.tacticsMarkingFaint || pitchTone.tacticsMarkingSoft || pitchTone.tacticsMarking || pitchTone.marking));

  // Iter 5-7: 배경 색 + 배경 이미지 적용. greenscreen 모드면 배경색도 자동 치환.
  applyBackgroundSettings();

  // Iter 5-3: per-feature 토글 → body 클래스. CSS에서 .layout-big에서만 적용해 큰 캠 숨김.
  const body = document.body;
  if (body) {
    body.classList.toggle('no-fan-reaction', getSetting('fanReaction') !== 'on');
    body.classList.toggle('no-lineup-goals',   getSetting('lineupShowGoals')   !== 'on');
    body.classList.toggle('no-lineup-cards',   getSetting('lineupShowCards')   !== 'on');
    body.classList.toggle('no-lineup-rating',  getSetting('lineupShowRating')  !== 'on');
    body.classList.toggle('no-lineup-subtime', getSetting('lineupShowSubTime') !== 'on');
    body.classList.toggle('greenscreen-mode',  getSetting('greenscreen') === 'on');
  }
  // 라인업 이름 변화 시 pill width / 잘림 보정 다시 호출 (lineup-panel.js의 fit 함수)
  if (typeof window.fitLineupNamePills === 'function') {
    requestAnimationFrame(() => window.fitLineupNamePills());
  }
}

/**
 * 배경 색 + 배경 이미지를 :root에 CSS 변수로 반영.
 * - bgColor: greenscreen ON시 chromaSafe 변환됨
 * - bgImageUrl 우선, 없으면 bgImageData (file 첨부 base64)
 * - 둘 다 비어있으면 이미지 없이 색만 적용
 */
function applyBackgroundSettings() {
  const root = document.documentElement;
  const bgColor = chromaSafe(getSetting('bgColor') || '#111827');
  const url = String(getSetting('bgImageUrl') || '').trim();
  const data = String(getSetting('bgImageData') || '').trim();
  const imgSrc = url || data;

  root.style.setProperty('--bg-ui', bgColor);
  if (imgSrc) {
    // CSS url() 안에 큰따옴표가 들어가면 깨질 수 있어 escape.
    const safeSrc = imgSrc.replace(/"/g, '\\"');
    root.style.setProperty('--bg-image', `url("${safeSrc}")`);
  } else {
    root.style.setProperty('--bg-image', 'none');
  }

  // 패널 투명도 — 0~100 → 0~1로 매핑. 0=완전 투명, 100=완전 불투명.
  const rawPanelAlpha = Number(getSetting('panelAlpha'));
  const alphaPct = Math.max(0, Math.min(100, Number.isFinite(rawPanelAlpha) ? rawPanelAlpha : 100));
  const alpha = alphaPct / 100;
  root.style.setProperty('--panel-alpha', String(alpha));
  root.style.setProperty('--api-widget-hover-alpha', String(0.22 * alpha));
  const body = document.body;
  if (body) {
    body.classList.toggle('low-panel-alpha', alphaPct <= LOW_PANEL_ALPHA_TEXT_OUTLINE_THRESHOLD);
  }

  // 라인업 투명도 — 라인업 칼럼 배경과 피치 배경/라인 레이어가 이 값을 공유한다.
  const rawPitchAlpha = Number(getSetting('pitchAlpha'));
  const pitchAlphaPct = Math.max(0, Math.min(100, Number.isFinite(rawPitchAlpha) ? rawPitchAlpha : 100));
  root.style.setProperty('--lp-pitch-alpha', String(pitchAlphaPct / 100));
}

/**
 * 슬라이더 UI 동기화 + 옆에 붙은 .sp-slider-value 라벨도 같이 갱신.
 * lineupNameSize / eventNameSize는 px 단위, 그 외(lineupScale 등)는 % 단위로 표시.
 */
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

/** 숫자 input(<input type="number">) UI 동기화. statsAutoSwipeSec처럼 0.5 step 허용 카테고리에 사용. */
function syncNumberUi(category) {
  const input = document.querySelector(`input[data-settings-number="${category}"]`);
  if (!input) return;
  const value = Number(getSetting(category));
  if (Number.isFinite(value) && input.value !== String(value)) input.value = String(value);
}

/** 색상 input(<input type="color">) UI 동기화. 평점 색상 7구간 등에 사용. */
function syncColorUi(category) {
  const input = document.querySelector(`input[data-settings-color="${category}"]`);
  if (!input) return;
  const value = String(getSetting(category) || '').toLowerCase();
  if (HEX_COLOR_RE.test(value) && input.value.toLowerCase() !== value) input.value = value;
}

/** 텍스트 input(<input type="text">) UI 동기화. bgImageUrl 등에 사용. */
function syncTextUi(category) {
  const input = document.querySelector(`input[data-settings-text="${category}"]`);
  if (!input) return;
  const value = String(getSetting(category) || '');
  if (input.value !== value) input.value = value;
}

/** select 드롭다운 UI 동기화. greenscreenIntensity 등 enum 카테고리에 사용. */
function syncSelectUi(category) {
  const select = document.querySelector(`select[data-settings-select="${category}"]`);
  if (!select) return;
  const value = String(getSetting(category) || '');
  if (select.value !== value) select.value = value;
}

/** legacy alias — 기존 외부 호출 호환용. setSetting의 wrapper. */
function setNameMode(category, mode) {
  setSetting(category, mode);
}

/**
 * 선수 표시명 선택 헬퍼.
 * 1) long 모드면 한글 풀네임(nameKoLong/playerNameKoLong) 우선, 없으면 short fallback.
 * 2) short 모드면 표준 short(name/playerName)를 사용.
 * 3) lineup 카테고리에서 short + lineupHideInitial=on이면 앞쪽 이니셜 블록 제거(예: "J. Mateta" → "Mateta").
 *    long 모드에선 hideInitial 무시(풀네임 형식이 깨짐).
 */
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

/**
 * "J. Mateta" / "J.-P. Mateta" / "Á. Bastoni" 같은 앞쪽 이니셜 블록을 제거한다.
 * 점 기반 토큰을 반복 매칭해 모두 떼어낸 뒤 trim. 결과가 비면 원본 반환(안전 fallback).
 */
function stripLeadingLineupInitial(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  const stripped = text
    // 앞쪽의 이니셜 블록(J. / M. / J.-P. / Á. 등)을 점 기준으로 제거
    .replace(/^\s*(?:[^\s.．｡。]+[.．｡。]\s*)+/u, '')
    .trim();
  return stripped || text;
}

/** 설정 팝업 오픈. 사이드바가 열려있으면 먼저 닫고, 백드롭에 .open 추가. 탭 섹션 높이 일괄화도 같이 호출. */
function openSettingsPopup() {
  if (typeof closeSidebar === 'function') closeSidebar();
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.add('open');
  syncSettingsTabSectionHeights();
}

/** 설정 팝업 닫기. 백드롭의 .open 제거만 하면 CSS transition으로 사라짐. */
function closeSettingsPopup() {
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.remove('open');
}

/** 백드롭에 .open이 붙어있는지로 팝업 오픈 여부 판단. Esc 키 핸들러 가드용. */
function isSettingsOpen() {
  const backdrop = document.getElementById('settingsBackdrop');
  return !!(backdrop && backdrop.classList.contains('open'));
}

/**
 * 카테고리별 토글 스위치의 off/on 사이드 라벨 매핑.
 * 'short'/'long' 카테고리는 default short=off, long=on. enum 카테고리는 자체 매핑.
 * syncSwitchUi가 cluster 안에 [data-side="..."] 텍스트 라벨도 is-active 토글하는 데 사용.
 */
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
    || category === 'lineupShowSubTime'
    || category === 'greenscreen') {
    return { off: 'off', on: 'on' };
  }
  return { off: 'short', on: 'long' };
}

/**
 * 토글 스위치(checkbox) UI 동기화.
 * 1) input.checked는 value === on 여부.
 * 2) cluster 안의 좌/우 텍스트 라벨도 is-active 토글해 시각적으로 어느 쪽인지 표시.
 */
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

/**
 * 모든 탭 섹션의 minHeight를 가장 큰 섹션 높이로 통일.
 * 탭 전환 시 모달 높이가 출렁이는 것을 방지하기 위한 작업.
 *
 * 1) sp-body 폭에서 좌우 padding 빼서 availableWidth 산출.
 * 2) 각 섹션을 임시로 absolute + hidden 해제 + width 고정 → 자연 높이 측정.
 * 3) 측정 후 inline style 원복(`prevCssText`로 통째 되돌림). hidden 상태도 복구.
 * 4) 최대 높이 찾으면 모든 섹션의 minHeight 적용.
 */
function syncSettingsTabSectionHeights() {
  const body = document.querySelector('.sp-body');
  const sections = Array.from(document.querySelectorAll('[data-sp-tab-section]'));
  if (!body || !sections.length) return;

  // 1) 측정용 width — sp-body의 content area 폭 (padding 제외).
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

    // 2) 임시로 화면 밖에 놓고 자연 높이 측정 (visibility:hidden + left:-99999px).
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

    // 3) 측정용 inline style 원복 + hidden 상태 복구.
    section.style.cssText = prevCssText;
    if (wasHidden) section.setAttribute('hidden', '');
  });

  // 4) 모든 섹션에 max 높이 적용 → 탭 전환 시 모달 점프 방지.
  if (!maxHeight) return;
  sections.forEach(section => {
    section.style.minHeight = `${maxHeight}px`;
  });
}

/**
 * 탭 활성화 — sp-tab 버튼 is-active 상태 + 매칭하는 섹션만 표시.
 * 마지막 활성 탭은 localStorage(SETTINGS_TAB_KEY)에 저장해 다음 진입 시 복원.
 */
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

/**
 * 설정 팝업 탭 시스템 초기화.
 * 1) localStorage에서 마지막 활성 탭 복원 (없으면 'names' default).
 * 2) 각 탭 버튼에 click 핸들러 등록 → applySettingsTab 호출.
 */
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

/**
 * 설정 팝업 전체 와이어업. DOMContentLoaded에서 한 번 호출.
 *
 * 1) 톱니바퀴/닫기/백드롭/Esc → open/close 핸들러.
 * 2) 탭 시스템 초기화 + 윈도우 리사이즈 시 섹션 높이 재계산.
 * 3) 3-state 라디오 버튼들에 click 핸들러 (data-settings-radio-value 적용).
 * 4) 토글 스위치(input[data-settings-cat])에 change 핸들러 + 초기 sync.
 * 5) 슬라이더(input[data-settings-slider])에 input 핸들러 + 초기 sync.
 * 6) 숫자 입력(input[data-settings-number])에 change/input 핸들러 + 초기 sync.
 * 7) "설정 초기화" / "캐시 초기화" 버튼 — confirm 후 각각 reset/clear 실행.
 *
 * loadSettings는 모듈 로드 시 즉시 한 번 실행되고, 여기서는 UI만 와이어업한다.
 */
function initSettingsPopup() {
  // loadSettings는 모듈 로드 시 이미 한 번 실행됨 (아래 즉시 호출). 여기서는 UI 와이어업만.
  const gearBtn = document.getElementById('settingsGearBtn');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const backdrop = document.getElementById('settingsBackdrop');
  const settingsResetBtn = document.getElementById('settingsResetBtn');
  const cacheResetBtn = document.getElementById('cacheResetBtn');
  const ratingColorsResetBtn = document.getElementById('ratingColorsResetBtn');

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

  // 색상 input (평점 색상 등). 드래그 중에는 setSetting을 호출하지 않고 change에서만 commit
  // — theme.js의 색상 lag 방지 패턴과 동일. setSetting 자체에서 settings:change 이벤트가
  // 발행되므로 라인업 패널이 알아서 재렌더한다.
  document.querySelectorAll('input[data-settings-color]').forEach(input => {
    const category = input.dataset.settingsColor;
    syncColorUi(category);
    // input 이벤트는 무시 — 드래그마다 commit하면 patch 재계산 + render 트리거로 lag 발생.
    input.addEventListener('change', () => {
      const v = String(input.value || '').toLowerCase();
      if (HEX_COLOR_RE.test(v)) setSetting(category, v);
    });
  });

  // 텍스트 input (배경 이미지 URL 등). change(blur 시)에 commit.
  document.querySelectorAll('input[data-settings-text]').forEach(input => {
    const category = input.dataset.settingsText;
    syncTextUi(category);
    input.addEventListener('change', () => {
      setSetting(category, String(input.value || '').trim());
    });
  });

  // select 드롭다운 (greenscreenIntensity 등). change에 즉시 commit.
  document.querySelectorAll('select[data-settings-select]').forEach(select => {
    const category = select.dataset.settingsSelect;
    syncSelectUi(category);
    select.addEventListener('change', () => {
      setSetting(category, String(select.value || ''));
    });
  });

  // 배경 이미지 파일 첨부 (Iter 5-7). 3MB 초과 시 거부 + toast 안내.
  // 파일 → FileReader로 base64 data URL 변환 → bgImageData 저장.
  // localStorage quota 초과 시에도 toast 안내 (try/catch는 setSetting 내부에서 처리되지 않으므로 여기서 가드).
  const bgFileInput = document.getElementById('settingsBgImageFile');
  if (bgFileInput) {
    bgFileInput.addEventListener('change', () => {
      const file = bgFileInput.files?.[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        if (typeof showToast === 'function') showToast('이미지 파일만 첨부 가능합니다');
        bgFileInput.value = '';
        return;
      }
      if (file.size > BG_IMAGE_MAX_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        if (typeof showToast === 'function') {
          showToast(`파일이 너무 큽니다 (${mb}MB). 3MB 이하 JPEG/WebP로 변환하거나 URL을 사용하세요.`);
        }
        bgFileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          setSetting('bgImageData', String(reader.result || ''));
          // 파일을 첨부하면 URL은 비워서 우선순위 충돌 방지.
          if (settingsState.bgImageUrl) setSetting('bgImageUrl', '');
          if (typeof showToast === 'function') showToast('배경 이미지가 적용되었습니다');
        } catch (err) {
          // localStorage quota 초과 등.
          if (typeof showToast === 'function') showToast('배경 이미지 저장 실패: 용량 초과 또는 저장 공간 부족');
        }
      };
      reader.onerror = () => {
        if (typeof showToast === 'function') showToast('파일 읽기 실패');
      };
      reader.readAsDataURL(file);
    });
  }

  // 배경 이미지 지우기 버튼 — URL과 file data 각각 분리해서 비움.
  document.querySelectorAll('[data-bg-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.bgClear;
      if (kind === 'url') setSetting('bgImageUrl', '');
      else if (kind === 'data') {
        setSetting('bgImageData', '');
        if (bgFileInput) bgFileInput.value = '';
      }
      else if (kind === 'color') {
        // 단색 배경 초기화 — 기본값(#111827)으로 복귀.
        setSetting('bgColor', SETTINGS_DEFAULTS.bgColor);
      }
    });
  });

  if (ratingColorsResetBtn) {
    ratingColorsResetBtn.addEventListener('click', resetRatingColorsToDefaults);
  }

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
