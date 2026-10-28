// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [설정 팝업]
// 사이드바 우측 상단 톱니바퀴 → 화면 가운데 설정 모달 오픈.
// 이름 표시(long/short)와 라인업 노드 표시(photo/number)를 관리한다.
// 설정은 localStorage에 저장하고, 변경 시 'settings:change' 이벤트를 보낸다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SETTINGS_STORAGE_KEY = 'obs.settings.v3';
const SETTINGS_LEGACY_STORAGE_KEYS = ['obs.settings.v2'];

// 원래 오버레이 색을 보관하고 그린스크린 안전도 변경 시 함께 변환한다.
const OVERLAY_CHROMA_COLORS = {
  '--overlay-green': '#22c55e',
  '--overlay-label-bg': 'rgba(34,197,94,.30)',
  '--overlay-label-text': '#bbf7d0',
  '--overlay-in-text': '#7cfc8e',
  '--overlay-in-bg': 'rgba(124,252,142,.18)',
  '--overlay-node-in-bg': 'rgba(21,83,52,.95)',
  '--overlay-node-in-text': '#33c771',
  '--overlay-timeline-bg': 'rgba(34,197,94,.12)',
  '--overlay-timeline-border': 'rgba(34,197,94,.32)',
  '--overlay-timeline-hover-bg': 'rgba(34,197,94,.22)',
  '--overlay-timeline-hover-border': 'rgba(34,197,94,.55)',
  '--overlay-timeline-glyph': '#4ade80',
};

// 유효성 검사와 실제 배경 적용이 같은 이미지 목록을 사용합니다.
const BACKGROUND_PRESET_IMAGES = {
  "stadium": "resources/backgrounds/dark/stadium-night.webp",
  "rainy-stadium": "resources/backgrounds/dark/rainy-stadium.webp",
  "abstract": "resources/backgrounds/dark/navy-mint.webp",
  "emerald": "resources/backgrounds/dark/emerald-pitch.webp",
  "charcoal": "resources/backgrounds/dark/charcoal-graphic.webp",
  "slate-line": "resources/backgrounds/dark/slate-line.webp",
  "burgundy": "resources/backgrounds/dark/burgundy-light.webp",
  "stadium-day": "resources/backgrounds/light/stadium-day.webp",
  "misty-pitch": "resources/backgrounds/light/misty-pitch.webp",
  "ivory-paper": "resources/backgrounds/light/ivory-paper.webp",
  "warm-stone": "resources/backgrounds/light/warm-stone.webp",
  "sky-glass": "resources/backgrounds/light/sky-glass.webp",
  "sage-studio": "resources/backgrounds/light/sage-studio.webp",
  "sand-dunes": "resources/backgrounds/light/sand-dunes.webp",
  "lavender-haze": "resources/backgrounds/light/lavender-haze.webp",
  "silver-contour": "resources/backgrounds/light/silver-contour.webp",
  "deep-ocean": "resources/backgrounds/dark/deep-ocean.webp",
  "copper-black": "resources/backgrounds/dark/copper-black.webp",
  "midnight-purple": "resources/backgrounds/dark/midnight-purple.webp",
  "steel-blue": "resources/backgrounds/dark/steel-blue.webp",
  "forest-mist": "resources/backgrounds/dark/forest-mist.webp",
  "peach-coral": "resources/backgrounds/light/peach-coral.webp",
  "ice-mint": "resources/backgrounds/light/ice-mint.webp",
  "blueprint-light": "resources/backgrounds/light/blueprint-light.webp",
  "paper-collage": "resources/backgrounds/light/paper-collage.webp",
  "red-tunnel": "resources/backgrounds/dark/red-tunnel.webp",
  "amber-floodlight": "resources/backgrounds/dark/amber-floodlight.webp",
  "ink-wave": "resources/backgrounds/dark/ink-wave.webp",
  "black-mesh": "resources/backgrounds/dark/black-mesh.webp"
};

const SETTINGS_DEFAULTS = {
  uiMode: 'dark',
  teamName: 'long',   // 라인업 chip + 벤치/부상 컬럼 헤더의 팀명 표시 (default 풀네임)
  lineup: 'short',
  scorer: 'long',
  roster: 'long',
  lineupNode: 'photo',
  lineupHideInitial: 'off',
  lineupShowFormationButton: 'on',
  lineupScale: 100,   // 캠 큼 페이지 라인업 크기 배율 (50~100, %). 비율 그대로.
                      // 설정 팝업 UI에는 노출 안 함 — 라인업 패널 우상단 핸들 드래그로 조정 (lineup-resize.js).
  lineupTokenScaleFullscreen: null, // 대시보드 전체화면의 선수 아이콘 크기는 별도로 저장한다.
  lineupTokenScale: 100, // 선발 바둑알과 부착 아이콘의 공통 배율(%).
  lineupNameSize: 12, // 라인업 노드 이름 글자 크기 (px). 설정 팝업 슬라이더로 조정.
  lineupNameSizeFullscreen: null, // 대시보드 전체화면에서 직접 조정한 값. null이면 기본값을 따른다.
                      // long 모드(풀네임)는 CSS에서 0.875× 비율 유지.
  // 라인업 분할 (캠 큼 전용) — ON시 양 팀을 한 피치에 합쳐서 그리지 않고
  // 위(홈)/아래(원정) 두 개의 풀 피치로 분리. OFF면 캠 작음과 같은 combined 피치를 사용.
  // 작은 캠 패널은 영향 없음.
  splitLineup: 'on',
  // 라인업 피치 안의 리그 로고 워시 위치. 센터 서클(default)/왼쪽 사이드라인/오른쪽 사이드라인.
  // 분할 모드에서는 각 피치마다 똑같이 적용된다.
  leagueLogoPos: 'center',
  // 크로마키 대응용 라인업 피치 톤 프리셋.
  lineupPitchTone: 'black',
  lightLineupPitchTone: 'green',
  // 'logo' = matchInfo.homeTeamLogo (default. 클럽=팀 로고, 국대=국기)
  // 'fa'   = matchInfo.homeTeamFaUrl (협회 로고. URL 없으면 logo로 자동 폴백 — fixture.js)
  teamLogo: 'logo',
  // '메인에 표시' 버튼 클릭 시 자동 이동할 페이지: 'big'(캠 큼) / 'small'(캠 작음 = /detail).
  mainPage: 'big',
  fanReaction: 'on',
  bigLineupVisible: 'on',
  bigInfoVisible: 'on',
  // 캠 큰 패널 자동 전환 (stat-cycle.js). off='off', on='on' 토글.
  statCycleAuto: 'on',
  // 자동 전환(statCycleAuto) 순서에 각 패널을 포함시킬지 per-panel 토글 (stat-cycle.js).
  // 체크 여부와 무관하게 해당 경기에 실제 데이터가 없는 패널은 lpStatAvailableModes()에서
  // 애초에 제외되므로, 이 토글은 "데이터는 있지만 자동 전환에서는 보고 싶지 않은" 패널 제외용.
  statCycleModeStats: 'on',
  statCycleModeEvents: 'on',
  statCycleModeHth: 'on',
  statCycleModeTeamFixtures: 'on',
  statCycleModeBenchHome: 'on',
  statCycleModeBenchAway: 'on',
  statCycleModeMatchInfo: 'on',
  statCycleModeInjuries: 'on',
  // 경기 스탯 패널 자동 페이지 전환 (Iter 5-2). off='off', on='on' 토글 + 간격 (초 단위, 0.5 단위).
  statsAutoSwipe: 'on',
  statsAutoSwipeSec: 10,
  // 이벤트 패널 (Iter 5-2). 'event'는 이벤트 row 선수명 풀네임/단축, eventNameSize는 폰트 크기 px.
  event: 'long',
  eventNameSize: 15,
  // 교체 명단 / 미출전 선수 명단 (.dp-item) 글자 크기 (px). 설정 팝업 슬라이더로 조정.
  benchInjuryNameSize: 13,
  benchInjuryNameSizeFullscreen: null,
  // 경기 스탯 패널 (.st-title/.st-val) 글자 크기 (px). 막대 굵기(.st-bar height)가
  // 기본값(12px) 대비 이 값의 비율만큼 함께 굵어진다 (statBarHeight = 6px * size/12).
  statsNameSize: 12,
  matchInfoNameSize: 16,
  hthNameSize: 12,
  teamFixturesNameSize: 11,
  // 신규 이벤트 화면 중앙 하단 표시 (js/panels/event-spotlight.js). 배율은 이벤트 패널 칼럼 너비 기준 %.
  // 'off' = 표시 안 함, 'board' = 점수판 바로 아래(윗변 고정, 아래로 커짐), 'bottom' = 화면 가운데 패널 하단선(아랫변 고정, 위로 커짐).
  eventSpotlight: 'board',
  eventSpotlightScale: 100,
  // 라인업 이벤트 표시 (Iter 5-3) — 양 캠 공통 마스터 토글.
  // ON: 교체 IN 선수가 선발 그리드 자리로 올라오고 OUT 선수가 벤치로 내려감.
  // OFF: startXi/벤치 원본 유지 + OUT 선수에 빨간 화살표, IN 선수에 초록 화살표 마커.
  subReflect: 'on',
  // 이벤트의 playerId/assistId가 라인업 ID와 안 맞을 때, API 원본(영문) 이름이 그 팀
  // 라인업+벤치 안에서 유일하게 일치하면 ID 입력 없이 자동으로 연결(player-id-resolve.js).
  // 동명이인이 있으면 자동 적용하지 않고 건너뛴다. off='off', on='on'.
  autoLinkPlayerIdByName: 'on',
  // 새 창 분리 (관리 탭). ON이면 교체 IN/OUT 선택 / 포메이션·라인업·교체·미출전 입력창 /
  // 설정 팝업 / 테마 탭을 window.open()으로 별도 창에 띄운다 (js/core/popout.js).
  // OBS 캡처(Browser Source/Window Capture 모두 메인 창 하나만 봄)에 잡히지 않게 하기 위함.
  popoutModals: 'off',
  // 캠 큼 페이지의 라인업 노드(피치)에 표시할 항목 per-feature 토글. 작은 캠은 마스터 토글만 적용.
  lineupShowGoals: 'on',     // 골/어시스트 이모티콘
  lineupShowCards: 'on',     // 옐로/레드 카드
  lineupShowRating: 'on',    // 평점 박스
  lineupShowSubTime: 'on',   // 교체 IN 시간(72' 등)
  lineupShowNumber: 'on',    // 사진 모드에서 이름 라벨 앞 등번호 표시
  // 교체 OUT 된 선수 중 골/도움/자책골을 기록한 선수를 피치 오른쪽에 별도 열로 표시.
  // subReflect=on일 때만 동작(off면 OUT 선수가 이미 그리드에 그대로 남아있어 중복 표시 방지).
  lineupShowOutScorers: 'off',
  // 점수판 양옆 득점자 박스에 골 외 이벤트를 함께 표시할지.
  noteShowPenaltyMisses: 'on',
  noteShowRedCards: 'on',
  noteOwnGoalColor: '#b6c2d1',
  notePenaltyMissColor: '#fb923c',
  noteRedCardColor: '#ff6b6b',
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
  lightBgColor:   '#c2c6cc',
  bgTeamDirection: 'off',
  bgPreset:      'stadium',
  lightBgPreset: 'stadium-day',
  bgAlpha:        0,         // 전체 배경 투명도. 100이면 OBS 브라우저 소스의 뒤가 보인다.
  matchInfoLabelColor: '#60A5FA', // 경기 정보의 주심/대회/경기장/킥오프 항목명.
  matchInfoLabelColorRev: 1, // 이전 주황 기본값을 1회만 새 기본색으로 이전.
  panelColor: '#0b1220',
  bgImageUrl:     '',        // 외부 URL — localStorage에 영구 저장
  bgImageData:    '',        // 파일 첨부 압축 base64 데이터 URL
  // 패널 투명도 (0~100). 0=불투명, 100=완전 투명. CSS에는 반전된 opacity alpha로 적용.
  panelAlpha:     25,
  lightPanelAlpha: 25,
  // 라인업 투명도 (0~100). 라인업 칼럼 배경 + 피치 배경/라인을 함께 조정.
  // 선수 노드/이름은 CSS에서 별도 레이어로 유지한다.
  pitchAlpha:     25,
  // 전술판 투명도 (0~100). 전술판 피치 + 타임라인/이벤트 패널 배경을 함께 조정.
  // 전술판 상단 슬라이더로 직접 조절하며, 설정 팝업과는 별도 진입점을 가진다.
  tacticsAlpha:   0,
  tacticsTopbarScale: 100, // 전체화면 상단바 버튼·글자 크기 배율(%).
  tacticsDrawtoolsScale: 150, // 전체화면 그리기 도구 패널 크기 배율(%). 태블릿 터치 편의를 위해 기본 150%.
  tacticsFullscreenAlign: 'center', // 전술판 전체화면 피치 정렬: left / center / right
  // 터치 기기 전술판 배치: auto(터치가 주 입력인 기기에서 자동) / on / off. js/tactics/tactics.js: tacticsApplyTouchLayout
  tacticsTouchLayout: 'auto',
  tacticsNameSize: 12, // 전술판 선수 이름 라벨 글자 크기(px). 전술판 상단 슬라이더로 조정.
  tacticsTokenScale: 100, // 전술판 선수 바둑알 크기 배율(%). 전술판 상단 슬라이더로 조정. 태블릿 등 작은 화면 대응.
  // v3 초반에는 위 3개 값이 "불투명도"로 저장됐다. 마이그레이션 완료 여부를 표시한다.
  alphaTransparencyMode: 'transparency',
  // 그리기 도구 크기 기본값 100% -> 150% 변경 마이그레이션 완료 표시. 이전 기본값(100)이 저장된 브라우저를 1회만 150으로 올린다.
  tacticsDrawtoolsScaleRev: 'v150',
  // 그린스크린 모드. ON시 초록 계열 중 OBS 기본 유사성의 CbCr 거리 기준에 해당하는 색만 치환.
  // OBS 크로마키와 충돌 방지용.
  // 팀 컬러·평점·교체 표시·이벤트·전술판은 같은 greenscreenIntensity를 따른다.
  greenscreen:    'off',
  // 그린스크린 치환 강도 (Iter 5-7).
  // 안전 순서 (가장 안전 → 가장 위험): strong > moderate > mild > natural
  //   strong   → 마젠타 (가장 안전 + 어떤 색과도 충돌 X. 단, 초록 팀 컬러엔 다소 부자연스러움)
  //   moderate → 파랑 (중립적, 차분)
  //   mild     → 어두운 청록 (그린 느낌 유지, 자연스러움 — 기본값)
  //   natural  → 어두운 초록 (가장 자연스러움. chromakey 위험 — strict 키 설정엔 키잉될 수 있음)
  // 적용 범위: 팀 컬러 / PK / 평점 / 이벤트 / 교체 표시 / 피치 / 경기 정보 항목명.
  greenscreenIntensity: 'purple',
  // 캠 큰 우측 패널 연결. on=두 패널 합계가 칼럼 높이를 꽉 채움, off=각 패널 독립 리사이즈.
  bigPanelLinked: 'on',
};

// 배경 이미지 원본 선택 제한. 저장 전 브라우저에서 WebP/JPEG로 압축한다.
const BG_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const BG_IMAGE_SAFE_PERSIST_BYTES = Math.floor(1.8 * 1024 * 1024);
const BG_IMAGE_MAX_WIDTH = 1920;
const BG_IMAGE_MAX_HEIGHT = 1080;

const EVENT_NAME_SIZE_MIN = 10;
const EVENT_NAME_SIZE_MAX = 25;
const BENCH_INJURY_NAME_SIZE_MIN = 10;
const BENCH_INJURY_NAME_SIZE_MAX = 21;
const STATS_NAME_SIZE_MIN = 10;
const STATS_NAME_SIZE_MAX = 21;
const STATS_NAME_SIZE_DEFAULT = 12;
const STATS_BAR_HEIGHT_DEFAULT = 6;
const STATS_SWIPE_SEC_MIN = 2.5;
const STATS_SWIPE_SEC_MAX = 60;

const LINEUP_SCALE_MIN = 50;
const LINEUP_SCALE_MAX = 100;
const LINEUP_NAME_SIZE_MIN = 9;
const LINEUP_NAME_SIZE_MAX = 23;
const TACTICS_NAME_SIZE_MIN = 7;
const TACTICS_NAME_SIZE_MAX = 21;
// 전술판 선수 바둑알 크기 배율(%) — 태블릿 등 작은 화면에서 기본 44px 원이 너무 크다는 피드백으로 추가.
const TACTICS_TOKEN_SCALE_MIN = 50;
const TACTICS_TOKEN_SCALE_MAX = 150;
const TACTICS_TOPBAR_SCALE_MIN = 100;
const TACTICS_TOPBAR_SCALE_MAX = 200;
const TACTICS_DRAWTOOLS_SCALE_MIN = 100;
const TACTICS_DRAWTOOLS_SCALE_MAX = 200;
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
const DASHBOARD_FULLSCREEN_DEFAULTS = { lineupNameSize: 16, benchInjuryNameSize: 14, lineupTokenScale: 115 };
function isDashboardFullscreen() {
  // F11은 fullscreenElement를 설정하지 않으므로 실제 화면 높이도 확인한다.
  return !!document.querySelector('#page-main-small.active') && (
    !!document.fullscreenElement || (screen.height > 0 && Math.abs(window.innerHeight - screen.height) <= 2)
  );
}

function resetPanelFontSetting(category) {
  if (category in DASHBOARD_FULLSCREEN_DEFAULTS && isDashboardFullscreen()) {
    setSetting(category, DASHBOARD_FULLSCREEN_DEFAULTS[category]);
  } else {
    setSetting(category, SETTINGS_DEFAULTS[category]);
  }
}

function normalizeBackgroundImageUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  if (/^file:/i.test(raw)) return encodeURI(raw.replace(/\\/g, '/'));
  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    return encodeURI(`file:///${raw.replace(/\\/g, '/')}`);
  }
  if (/^\\\\/.test(raw)) {
    return encodeURI(`file://${raw.replace(/^\\\\/, '').replace(/\\/g, '/')}`);
  }
  return raw;
}

function isLikelyLocalFilePath(input) {
  const raw = String(input || '').trim();
  return /^file:/i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || /^\\\\/.test(raw);
}

/** 값을 0~100 범위로 클램핑. 숫자가 아니면 fallback을 사용. */
function clampPercent(value, fallback = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(0, Math.min(100, safe));
}

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
const NOTE_COLOR_VARS = { noteOwnGoalColor: '--note-own-goal', notePenaltyMissColor: '--note-pk-miss', noteRedCardColor: '--note-red-card' };

// on/off 토글 카테고리 — isValidSetting과 getSwitchSides 양쪽이 같은 목록을 참조해야
// 새 토글 추가 시 한쪽만 갱신하고 잊는 사고를 막는다.
const ON_OFF_TOGGLE_CATEGORIES = new Set([
  'subReflect', 'autoLinkPlayerIdByName', 'fanReaction', 'lineupHideInitial', 'lineupShowFormationButton',
  'bigLineupVisible', 'bigInfoVisible',
  'splitLineup', 'lineupShowGoals', 'lineupShowCards', 'lineupShowRating',
  'lineupShowSubTime', 'lineupShowNumber', 'lineupShowOutScorers', 'noteShowPenaltyMisses',
  'noteShowRedCards', 'greenscreen', 'bigPanelLinked',
  'statCycleModeStats', 'statCycleModeEvents', 'statCycleModeHth', 'statCycleModeTeamFixtures',
  'statCycleModeBenchHome', 'statCycleModeBenchAway', 'statCycleModeMatchInfo', 'statCycleModeInjuries',
  'popoutModals',
]);

/** 설정 종류별 허용 값·범위를 검사하며, 알 수 없는 값은 저장·복원 대상에서 제외한다. */
function isValidSetting(category, value) {
  if (category === 'lineupTokenScale') return Number.isFinite(value) && value >= 75 && value <= 125;
  if (category.endsWith('Fullscreen') && category.slice(0, -10) in DASHBOARD_FULLSCREEN_DEFAULTS) {
    return value === null || isValidSetting(category.slice(0, -10), value);
  }
  if (category === 'uiMode') return ['dark', 'light'].includes(value);
  if (category === 'bgPreset' || category === 'lightBgPreset') return value === 'off' || Object.hasOwn(BACKGROUND_PRESET_IMAGES, value);
  if (category === 'bgTeamDirection') return ['off', 'horizontal', 'vertical', 'mood'].includes(value);
  if (RATING_COLOR_KEYS.has(category) || Object.hasOwn(NOTE_COLOR_VARS, category)) return typeof value === 'string' && HEX_COLOR_RE.test(value);
  if (category === 'bgColor' || category === 'lightBgColor' || category === 'matchInfoLabelColor' || category === 'panelColor') return typeof value === 'string' && HEX_COLOR_RE.test(value);
  if (category === 'bgImageUrl') return typeof value === 'string';     // 빈 문자열 허용 (= 배경 없음)
  if (category === 'bgImageData') return typeof value === 'string';    // 빈 문자열 또는 data URL
  if (category === 'lineupNode') return value === 'number' || value === 'photo';
  if (category === 'teamLogo') return value === 'logo' || value === 'fa';
  if (category === 'mainPage') return value === 'big' || value === 'small';
  if (category === 'leagueLogoPos') return value === 'center' || value === 'left' || value === 'right';
  if (category === 'lineupPitchTone' || category === 'lightLineupPitchTone') return LINEUP_PITCH_TONES.includes(value);
  if (category === 'statCycleAuto') return value === 'on' || value === 'off';
  if (category === 'statsAutoSwipe') return value === 'on' || value === 'off';
  if (category === 'greenscreenIntensity') return ['strong','purple','moderate','mild','natural'].includes(value);
  if (category === 'alphaTransparencyMode') return value === 'transparency';
  if (category === 'tacticsDrawtoolsScaleRev') return value === 'v150';
  if (category === 'matchInfoLabelColorRev') return value === SETTINGS_DEFAULTS.matchInfoLabelColorRev;
  if (category === 'tacticsFullscreenAlign') return ['left', 'center', 'right'].includes(value);
  if (category === 'tacticsTouchLayout') return ['auto', 'on', 'off'].includes(value);
  if (ON_OFF_TOGGLE_CATEGORIES.has(category)) {
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
  if (category === 'benchInjuryNameSize') {
    return Number.isFinite(value) && value >= BENCH_INJURY_NAME_SIZE_MIN && value <= BENCH_INJURY_NAME_SIZE_MAX;
  }
  if (category === 'statsNameSize') {
    return Number.isFinite(value) && value >= STATS_NAME_SIZE_MIN && value <= STATS_NAME_SIZE_MAX;
  }
  if (['matchInfoNameSize', 'hthNameSize', 'teamFixturesNameSize'].includes(category)) {
    return Number.isFinite(value) && value >= 10 && value <= 21;
  }
  if (category === 'eventSpotlight') return ['off', 'board', 'bottom'].includes(value);
  if (category === 'eventSpotlightScale') {
    return Number.isFinite(value) && value >= 100 && value <= 250;
  }
  if (category === 'tacticsNameSize') {
    return Number.isFinite(value) && value >= TACTICS_NAME_SIZE_MIN && value <= TACTICS_NAME_SIZE_MAX;
  }
  if (category === 'tacticsTokenScale') {
    return Number.isFinite(value) && value >= TACTICS_TOKEN_SCALE_MIN && value <= TACTICS_TOKEN_SCALE_MAX;
  }
  if (category === 'tacticsTopbarScale') {
    return Number.isFinite(value) && value >= TACTICS_TOPBAR_SCALE_MIN && value <= TACTICS_TOPBAR_SCALE_MAX;
  }
  if (category === 'tacticsDrawtoolsScale') {
    return Number.isFinite(value) && value >= TACTICS_DRAWTOOLS_SCALE_MIN && value <= TACTICS_DRAWTOOLS_SCALE_MAX;
  }
  if (category === 'bgAlpha' || category === 'panelAlpha' || category === 'lightPanelAlpha' || category === 'pitchAlpha' || category === 'tacticsAlpha') {
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
    if (!parsed) {
      applyLayoutSettings();
      return;
    }

    const isLegacyPayload = loadedKey !== SETTINGS_STORAGE_KEY;
    const shouldMigrateAlphaTransparency =
      parsed.alphaTransparencyMode !== SETTINGS_DEFAULTS.alphaTransparencyMode;
    let normalizedSettings = false;
    // 이전 숨기기 옵션은 의미를 반전해 기존 표시 상태를 유지한다.
    if (!Object.hasOwn(parsed, 'lineupShowFormationButton') && ['on', 'off'].includes(parsed.lineupHideFormationButton)) {
      parsed.lineupShowFormationButton = parsed.lineupHideFormationButton === 'on' ? 'off' : 'on';
      normalizedSettings = true;
    }
    // 이전 ON/OFF와 방향 설정을 하나의 선택값으로 합친다.
    if (parsed.bgTeamColors === 'on' || parsed.bgTeamColors === 'off') {
      parsed.bgTeamDirection = parsed.bgTeamColors === 'on'
        ? (parsed.bgTeamDirection === 'vertical' ? 'vertical' : 'horizontal') : 'off';
      normalizedSettings = true;
    }
    // 기본 배경에 있던 팀 컬러 무드를 팀 컬러 배경의 스타일로 이전합니다.
    if (parsed.bgPreset === 'team') {
      parsed.bgPreset = 'off';
      parsed.bgTeamDirection = 'mood';
      normalizedSettings = true;
    }

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

    if (shouldMigrateAlphaTransparency) {
      ['panelAlpha', 'pitchAlpha', 'tacticsAlpha'].forEach(category => {
        if (!Object.prototype.hasOwnProperty.call(parsed, category)) return;
        const legacyOpacity = Number(parsed[category]);
        if (!Number.isFinite(legacyOpacity)) return;
        settingsState[category] = 100 - clampPercent(legacyOpacity, 100);
      });
      settingsState.alphaTransparencyMode = SETTINGS_DEFAULTS.alphaTransparencyMode;
      normalizedSettings = true;
    }

    // 그리기 도구 크기 기본값 150% 마이그레이션 — 이전 기본값(100)이 그대로 저장돼 있으면 1회만 150으로 올린다.
    // 마이그레이션 이후 사용자가 직접 100을 고르면 rev가 이미 저장돼 있어 다시 바뀌지 않는다.
    if (parsed.tacticsDrawtoolsScaleRev !== SETTINGS_DEFAULTS.tacticsDrawtoolsScaleRev) {
      if (Number(parsed.tacticsDrawtoolsScale) === 100) {
        settingsState.tacticsDrawtoolsScale = SETTINGS_DEFAULTS.tacticsDrawtoolsScale;
      }
      settingsState.tacticsDrawtoolsScaleRev = SETTINGS_DEFAULTS.tacticsDrawtoolsScaleRev;
      normalizedSettings = true;
    }

    // 이전 기본색만 1회 이전한다. 이후 사용자가 주황색을 선택해도 다시 바꾸지 않는다.
    if (parsed.matchInfoLabelColorRev !== SETTINGS_DEFAULTS.matchInfoLabelColorRev) {
      if (String(parsed.matchInfoLabelColor || '').toLowerCase() === '#ff9900') {
        settingsState.matchInfoLabelColor = SETTINGS_DEFAULTS.matchInfoLabelColor;
      }
      settingsState.matchInfoLabelColorRev = SETTINGS_DEFAULTS.matchInfoLabelColorRev;
      normalizedSettings = true;
    }

    if (settingsState.statCycleAuto === 'on' && settingsState.statsAutoSwipe !== 'on') {
      settingsState.statsAutoSwipe = 'on';
      normalizedSettings = true;
    }

    // 3) v2에서 읽은 경우 v3로 즉시 재저장 후 legacy 정리.
    if (isLegacyPayload || normalizedSettings) {
      if (saveSettings()) {
        if (isLegacyPayload) {
          SETTINGS_LEGACY_STORAGE_KEYS.forEach(key => {
            try { localStorage.removeItem(key); } catch {}
          });
        }
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

/** 모드별 저장 키를 공용 키로 정규화한 뒤 해당 설정의 입력·선택 컨트롤을 동기화한다. */
function syncSettingUi(category) {
  category = ({ lightBgColor: 'bgColor', lightBgPreset: 'bgPreset' }[category] || category);
  if (category === 'lightPanelAlpha') category = 'panelAlpha';
  if (category === 'lightLineupPitchTone') category = 'lineupPitchTone';
  syncSwitchUi(category);
  syncSliderUi(category);
  syncNumberUi(category);
  syncRadioUi(category);
  syncColorUi(category);
  syncTextUi(category);
  syncSelectUi(category);
  syncGroupedSettingExamples();
}

/** settingsState에 값이 없으면 default fallback. 외부 모듈은 이 함수만 통해 값 조회. */
function getSetting(category) {
  if (['benchInjuryNameSize', 'statsNameSize'].includes(category) && document.querySelector('#page-main-big.active')) {
    // 캠 큰 화면에서는 기존 기본값만 확대하고 직접 지정한 크기는 유지한다.
    const size = settingsState[category] ?? SETTINGS_DEFAULTS[category];
    return size === SETTINGS_DEFAULTS[category] ? 16 : size;
  }
  if (category in DASHBOARD_FULLSCREEN_DEFAULTS && isDashboardFullscreen()) {
    return settingsState[`${category}Fullscreen`]
      ?? (category !== 'lineupTokenScale' && settingsState[category] !== SETTINGS_DEFAULTS[category] ? settingsState[category] : DASHBOARD_FULLSCREEN_DEFAULTS[category]);
  }
  if (settingsState.uiMode === 'light' && ['bgColor', 'bgPreset'].includes(category)) {
    const lightCategory = category === 'bgColor' ? 'lightBgColor' : 'lightBgPreset';
    // 처음 전환할 때 직접 고른 배경은 이어 받고, 기본값만 밝은 모드 기본으로 바꾼다.
    return settingsState[lightCategory] ?? (settingsState[category] && settingsState[category] !== SETTINGS_DEFAULTS[category]
      ? settingsState[category] : SETTINGS_DEFAULTS[lightCategory]);
  }
  if (category === 'panelAlpha' && settingsState.uiMode === 'light') return settingsState.lightPanelAlpha ?? SETTINGS_DEFAULTS.lightPanelAlpha;
  if (category === 'lineupPitchTone' && settingsState.uiMode === 'light') {
    // 기존에 고른 색은 유지하고, 기본 피치만 라이트모드의 초록색으로 시작한다.
    return settingsState.lightLineupPitchTone
      ?? (settingsState.lineupPitchTone && settingsState.lineupPitchTone !== SETTINGS_DEFAULTS.lineupPitchTone
        ? settingsState.lineupPitchTone : SETTINGS_DEFAULTS.lightLineupPitchTone);
  }
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
  if (category === 'lineupTokenScale' && typeof lpGetTokenScaleLimit === 'function') {
    value = Math.min(value, Math.max(75, Math.floor(lpGetTokenScaleLimit() * 100 + 0.001)));
    requestAnimationFrame(() => syncSliderUi(category));
  }
  if (category in DASHBOARD_FULLSCREEN_DEFAULTS && isDashboardFullscreen()) {
    const key = `${category}Fullscreen`;
    if (value !== null && !isValidSetting(category, value)) return false;
    const previous = settingsState[key];
    settingsState[key] = value;
    if (!saveSettings()) { settingsState[key] = previous; return false; }
    syncSettingUi(category);
    applySettingSideEffects(category);
    emitSettingsChange(category);
    return true;
  }
  if (!(category in SETTINGS_DEFAULTS)) return false;
  if (!isValidSetting(category, value)) return false;
  if (category === 'statsAutoSwipe' && value !== 'on' && getSetting('statCycleAuto') === 'on') {
    if (settingsState.statsAutoSwipe !== 'on') {
      settingsState.statsAutoSwipe = 'on';
      saveSettings();
    }
    syncSwitchUi('statsAutoSwipe');
    syncStatsAutoSwipeLockUi();
    if (typeof showToast === 'function') {
      showToast('패널 자동 전환이 켜져 있어 자동 스와이프를 끌 수 없습니다.');
    }
    return false;
  }
  // 모드별 투명도와 피치 선택은 다른 모드의 저장값을 덮어쓰지 않는다.
  const storageCategory = getSetting('uiMode') === 'light'
    ? ({ panelAlpha: 'lightPanelAlpha', lineupPitchTone: 'lightLineupPitchTone', bgColor: 'lightBgColor', bgPreset: 'lightBgPreset' }[category] || category) : category;
  if (settingsState[storageCategory] === value) {
    if (category === 'statCycleAuto' && value === 'on' && getSetting('statsAutoSwipe') !== 'on') {
      return setSetting('statsAutoSwipe', 'on');
    }
    return true;
  }

  const hadOwnValue = Object.prototype.hasOwnProperty.call(settingsState, storageCategory);
  const prevValue = settingsState[storageCategory];
  settingsState[storageCategory] = value;
  if (!saveSettings()) {
    if (hadOwnValue) settingsState[storageCategory] = prevValue;
    else delete settingsState[storageCategory];
    syncSettingUi(category);
    if (typeof showToast === 'function') {
      showToast('설정을 저장하지 못했습니다. 저장 공간을 확인하세요.');
    }
    return false;
  }

  syncSettingUi(category);
  applySettingSideEffects(category);
  if (category === 'statCycleAuto' && value === 'on' && getSetting('statsAutoSwipe') !== 'on') {
    setSetting('statsAutoSwipe', 'on');
  }
  document.dispatchEvent(new CustomEvent('settings:change', {
    detail: { category, value, mode: value }
  }));
  return true;
}

/**
 * category 하나가 바뀌었을 때 필요한 추가 부수효과(CSS 변수 재적용/재렌더/패널 높이 등) —
 * setSetting()의 로컬 변경 경로뿐 아니라, 팝업 분리(js/core/popout.js)가 storage 이벤트로
 * 원격 변경사항을 반영할 때도 이 함수를 그대로 호출해야 한다. 예전엔 이 부수효과들이
 * setSetting() 안에만 있어서, 팝업에서 배경색/그린스크린/bigPanelLinked 등을 바꾸면 값
 * 자체는 메인 창에 동기화돼도 실제 화면(CSS 변수·재렌더)엔 반영되지 않는 문제가 있었다.
 */
function applySettingSideEffects(category) {
  category = ({ lightBgColor: 'bgColor', lightBgPreset: 'bgPreset' }[category] || category);
  if (category === 'lightPanelAlpha') category = 'panelAlpha';
  if (category === 'lightLineupPitchTone') category = 'lineupPitchTone';
  if (category === 'uiMode') {
    applyLayoutSettings();
    syncSliderUi('panelAlpha');
    syncRadioUi('lineupPitchTone');
    syncSettingUi('bgColor');
    syncSettingUi('bgPreset');
    document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: category } }));
  }
  if (Object.hasOwn(NOTE_COLOR_VARS, category)) applyLayoutSettings();
  if (category === 'lineupShowFormationButton') document.body.classList.toggle('hide-lineup-formation-button', getSetting(category) !== 'on');
  if (category === 'matchInfoLabelColor' || ['matchInfoNameSize', 'hthNameSize', 'teamFixturesNameSize'].includes(category)) applyLayoutSettings();
  if (category === 'eventNameSize') applyLayoutSettings();
  if (category === 'lineupTokenScale') window.lpUpdateTokenScale?.();
  if (category === 'lineupScale' || category === 'lineupNameSize' || category === 'lineupPitchTone' || category === 'tacticsNameSize' || category === 'tacticsTokenScale' || category === 'tacticsTopbarScale' || category === 'tacticsDrawtoolsScale' || category === 'tacticsFullscreenAlign' || category === 'benchInjuryNameSize' || category === 'statsNameSize') applyLayoutSettings();
  // Iter 5-3: per-feature 토글이 바뀌면 body 클래스 갱신을 위해 applyLayoutSettings 호출.
  if (category === 'fanReaction'
    || category === 'bigLineupVisible' || category === 'bigInfoVisible'
    || category === 'lineupShowGoals' || category === 'lineupShowCards'
    || category === 'lineupShowRating' || category === 'lineupShowSubTime'
    || category === 'lineupShowNumber') {
    applyLayoutSettings();
  }
  // Iter 5-7: 배경 색/이미지 변경 → 즉시 :root CSS 변수 갱신.
  if (category === 'bgColor'
    || category === 'bgPreset'
    || category === 'bgTeamDirection'
    || category === 'panelColor'
    || category === 'bgAlpha'
    || category === 'bgImageUrl'
    || category === 'bgImageData'
    || category === 'panelAlpha'
    || category === 'pitchAlpha'
    || category === 'tacticsAlpha') {
    applyBackgroundSettings();
  }
  if (category === 'bigPanelLinked') {
    window.applyStoredBigPanelHeights?.();
  }
  // Iter 5-7: 그린스크린 토글 또는 강도 변경 → 모든 색상(피치 톤/배경/팀컬러/평점) 일괄 재적용.
  if (category === 'greenscreen' || category === 'greenscreenIntensity') {
    applyLayoutSettings();
    ['panelAlpha', 'pitchAlpha', 'tacticsAlpha'].forEach(syncSliderUi);
    if (typeof render === 'function') render();
    // theme:colors-changed로 라인업/스탯 패널이 인라인 컬러를 다시 그리도록 신호.
    document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key: category } }));
  }
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
  window.logoTrimClearCache?.();
  window.ScoreboardLogoContrast?.clearCache?.();
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

  window.hthClearCache?.();

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
 *   --dp-item-name-size     : 교체 명단/미출전 선수 명단(.dp-item) base 글자 크기
 *   --st-name-base-size     : 경기 스탯 패널(.st-title/.st-val) base 글자 크기
 *   --st-bar-height         : 경기 스탯 막대(.st-bar) 굵기. statsNameSize 비율만큼 6px 기준으로 스케일
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
  Object.entries(NOTE_COLOR_VARS).forEach(([category, variable]) => {
    document.documentElement.style.setProperty(variable, chromaSafe(getSetting(category)));
  });
  const scale = Math.max(LINEUP_SCALE_MIN, Math.min(LINEUP_SCALE_MAX, Number(getSetting('lineupScale')) || 100)) / 100;
  const nameSize = Math.max(LINEUP_NAME_SIZE_MIN, Math.min(LINEUP_NAME_SIZE_MAX, Number(getSetting('lineupNameSize')) || 12));
  const eventSize = Math.max(EVENT_NAME_SIZE_MIN, Math.min(EVENT_NAME_SIZE_MAX, Number(getSetting('eventNameSize')) || 15));
  const benchInjurySize = Math.max(BENCH_INJURY_NAME_SIZE_MIN, Math.min(BENCH_INJURY_NAME_SIZE_MAX, Number(getSetting('benchInjuryNameSize')) || 13));
  const statsSize = Math.max(STATS_NAME_SIZE_MIN, Math.min(STATS_NAME_SIZE_MAX, Number(getSetting('statsNameSize')) || STATS_NAME_SIZE_DEFAULT));
  const statsBarHeight = STATS_BAR_HEIGHT_DEFAULT * (statsSize / STATS_NAME_SIZE_DEFAULT);
  const tacticsNameSize = Math.max(TACTICS_NAME_SIZE_MIN, Math.min(TACTICS_NAME_SIZE_MAX, Number(getSetting('tacticsNameSize')) || 12));
  const tacticsTokenScale = Math.max(TACTICS_TOKEN_SCALE_MIN, Math.min(TACTICS_TOKEN_SCALE_MAX, Number(getSetting('tacticsTokenScale')) || 100)) / 100;
  const pitchTone = LINEUP_PITCH_TONE_STYLES[getSetting('lineupPitchTone')]
    || LINEUP_PITCH_TONE_STYLES[SETTINGS_DEFAULTS.lineupPitchTone];
  const root = document.documentElement;
  Object.entries(OVERLAY_CHROMA_COLORS).forEach(([variable, color]) => {
    const isText = variable.endsWith('-text') || variable.endsWith('-glyph');
    const safeColor = variable === '--overlay-in-text' && isGreenscreenOn() && getGreenscreenIntensity() === 'natural'
      ? '#7dd3fc'
      : (isText ? chromaSafeText(color) : chromaSafe(color));
    root.style.setProperty(variable, safeColor);
  });
  if (isGreenscreenOn() && getGreenscreenIntensity() === 'purple') {
    root.style.setProperty('--overlay-node-in-text', '#d8b4fe');
  }
  root.style.setProperty('--match-info-ui-scale', String(getSetting('matchInfoNameSize') / 13));
  root.style.setProperty('--hth-ui-scale', String(getSetting('hthNameSize') / 12));
  root.style.setProperty('--tf-ui-scale', String(getSetting('teamFixturesNameSize') / 11));
  root.style.setProperty('--mi-label-color', chromaSafeText(getSetting('matchInfoLabelColor')));
  root.style.setProperty('--lp-lineup-scale', String(scale));
  root.style.setProperty('--lp-name-base-size', `${nameSize}px`);
  root.style.setProperty('--ev-name-base-size', `${eventSize}px`);
  root.style.setProperty('--dp-item-name-size', `${benchInjurySize}px`);
  root.style.setProperty('--st-name-base-size', `${statsSize}px`);
  root.style.setProperty('--st-bar-height', `${statsBarHeight}px`);
  root.style.setProperty('--td-name-size', `${tacticsNameSize}px`);
  root.style.setProperty('--tactics-event-scale', String(eventSize / 15));
  root.style.setProperty('--td-token-scale', String(tacticsTokenScale));
  root.style.setProperty('--td-topbar-scale', String(
    Math.max(TACTICS_TOPBAR_SCALE_MIN, Math.min(TACTICS_TOPBAR_SCALE_MAX,
      Number(getSetting('tacticsTopbarScale')) || SETTINGS_DEFAULTS.tacticsTopbarScale)) / 100
  ));
  root.style.setProperty('--td-drawtools-scale', String(
    Math.max(TACTICS_DRAWTOOLS_SCALE_MIN, Math.min(TACTICS_DRAWTOOLS_SCALE_MAX,
      Number(getSetting('tacticsDrawtoolsScale')) || SETTINGS_DEFAULTS.tacticsDrawtoolsScale)) / 100
  ));
  root.style.setProperty('--td-fullscreen-align', {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }[getSetting('tacticsFullscreenAlign')] || 'center');
  document.getElementById('page-tactics')?.classList.toggle(
    'tactics-fullscreen-panels-left',
    getSetting('tacticsFullscreenAlign') === 'right'
  );
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

  // Iter 5-7: 배경 색 + 배경 이미지 적용.
  // greenscreen 모드는 오버레이 요소 색만 바꾸고, 크로마키용 단색 배경은 그대로 둔다.
  applyBackgroundSettings();

  // Iter 5-3: per-feature 토글 → body 클래스. CSS에서 .layout-big에서만 적용해 큰 캠 숨김.
  const body = document.body;
  if (body) {
    const panels = [
      ['bigLineupVisible', '.layout-big .lp-lineup'],
      ['bigInfoVisible', '.layout-big .lp-stat'],
    ].map(([category, selector]) => ({ category, panel: document.querySelector(selector), disabled: getSetting(category) !== 'on' }));
    panels.forEach(({ category, panel, disabled }) => {
      if (!panel) return;
      if (disabled && panel.contains(document.activeElement)) {
        const candidates = isSettingsOpen()
          ? document.querySelectorAll(`[data-settings-cat="${category}"], #settingsBackdrop button`)
          : document.querySelectorAll('#tabsBar');
        const target = Array.from(candidates).find(el => !el.disabled && !el.closest('[inert]')
          && !panels.some(item => item.disabled && item.panel?.contains(el))
          && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (target) target.focus({ preventScroll: true });
        else {
          const tabindex = body.getAttribute('tabindex');
          body.tabIndex = -1;
          body.focus({ preventScroll: true });
          if (tabindex === null) body.removeAttribute('tabindex');
          else body.setAttribute('tabindex', tabindex);
        }
      }
      panel.inert = disabled;
    });
    body.classList.toggle('no-fan-reaction', getSetting('fanReaction') !== 'on');
    body.classList.toggle('hide-lineup-formation-button', getSetting('lineupShowFormationButton') !== 'on');
    body.classList.toggle('no-big-lineup', getSetting('bigLineupVisible') !== 'on');
    body.classList.toggle('no-big-info', getSetting('bigInfoVisible') !== 'on');
    body.classList.toggle('no-lineup-goals',   getSetting('lineupShowGoals')   !== 'on');
    body.classList.toggle('no-lineup-cards',   getSetting('lineupShowCards')   !== 'on');
    body.classList.toggle('no-lineup-rating',  getSetting('lineupShowRating')  !== 'on');
    body.classList.toggle('no-lineup-subtime', getSetting('lineupShowSubTime') !== 'on');
    body.classList.toggle('greenscreen-mode',  getSetting('greenscreen') === 'on');
  }
  // 라인업 이름 변화 시 pill width / 잘림 보정 다시 호출 (lineup-name-fit.js의 fit 함수)
  if (typeof window.fitLineupNamePills === 'function') {
    requestAnimationFrame(() => window.fitLineupNamePills());
  }
  // benchInjuryNameSize 변경 시 글자 크기가 바뀌어 교체/미출전 명단 내용 높이가 달라지므로,
  // 캠 작음(#benchPanel/#injuryPanel) 높이 자동 배분도 다시 실행 (lineup-name-fit.js).
  if (typeof window.balanceBenchInjuryPanelHeights === 'function') {
    requestAnimationFrame(() => window.balanceBenchInjuryPanelHeights());
  }
}

/** 사용자가 초록색 단색 배경을 확정했을 때만 그린스크린 모드 사용을 권장한다. */
function commitBackgroundColor(value, recommendGreenscreen = true) {
  if (!setSetting('bgColor', value)) return false;
  if (!recommendGreenscreen || getSetting('greenscreen') === 'on' || getSetting('bgTeamDirection') !== 'off'
    || getSetting('bgPreset') !== 'off'
    || String(getSetting('bgImageUrl') || '').trim()
    || String(getSetting('bgImageData') || '').trim()
    || Number(getSetting('bgAlpha')) >= 100) return true;
  const [r, g, b] = [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16));
  // #00ff00 근처의 밝고 선명한 초록색만 감지하며, 어두운 초록색과 다른 색상은 제외한다.
  if (r > 64 || g < 200 || b > 64) return true;
  if (confirm('단색 초록색 배경에 크로마키를 사용할 때는 그린스크린 모드 ON을 권장합니다.\n\n'
    + '그린스크린 모드를 켜면 초록 계열의 팀컬러·평점·교체 표시·이벤트·전술판 색상을 크로마키 제거에 적합한 색상으로 치환합니다.\n'
    + '패널·피치·전술판 투명도는 0%로 고정되며, 직접 선택한 배경색은 유지됩니다.\n\n'
    + '그린스크린 모드를 켤까요?')) setSetting('greenscreen', 'on');
  return true;
}

/**
 * 배경 색 + 배경 이미지를 :root에 CSS 변수로 반영.
 * - bgColor: greenscreen ON이어도 그대로 유지 (크로마키용 단색 배경 보호)
 * - 설정 표시 순서대로 URL → 파일 첨부 → 기본 배경 → 팀 컬러 → 배경 색 우선 적용
 */
function applyPageBackground() {
  const root = document.documentElement;
  const bgColor = getSetting('bgColor') || '#111827';
  const url = normalizeBackgroundImageUrl(getSetting('bgImageUrl') || '');
  const data = String(getSetting('bgImageData') || '').trim();
  const preset = getSetting('bgPreset');
  const presetPath = BACKGROUND_PRESET_IMAGES[preset];
  // CSS 변수 안의 상대 URL이 스타일시트 폴더 기준으로 해석되지 않도록 문서 기준 절대 주소로 만듭니다.
  const presetImage = presetPath ? new URL(presetPath, document.baseURI).href : '';
  const imgSrc = url || data || presetImage;
  // 기존 첨부 이미지의 표시 방식은 유지하고, 기본 배경 이미지만 화면 비율에 맞춰 자릅니다.
  root.style.setProperty('--bg-image-size', !url && !data && presetImage ? 'cover' : '100% 100%');

  root.style.setProperty('--bg-ui', bgColor);
  const bgOpacity = (100 - clampPercent(getSetting('bgAlpha'), SETTINGS_DEFAULTS.bgAlpha)) / 100;
  // 배경을 먼저 합성한 뒤 전체 레이어에 투명도를 한 번만 적용합니다.
  root.style.setProperty('--page-bg-opacity', String(bgOpacity));
  root.style.setProperty('--page-bg', bgColor);
  if (!imgSrc && getSetting('bgTeamDirection') === 'mood') {
    const lightMood = getSetting('uiMode') === 'light';
    const moodColor = value => {
      let rgb = parseAnyColor(chromaSafe(value));
      if (lightMood) {
        // 흰색·검정 팀도 바탕을 날려 버리지 않게 밝기 범위를 맞추고 색조만 은은하게 남긴다.
        const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const tone = hslToRgb(h, Math.min(s, .6), .65);
        rgb = parseAnyColor(chromaSafe(rgbToHex(tone.r, tone.g, tone.b)));
      }
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${lightMood ? .35 : .4})`;
    };
    // 팀 색은 가장자리에 두고 중앙은 모드별 바탕색으로 차분하게 유지합니다.
    root.style.setProperty('--page-bg', 'transparent');
    root.style.setProperty('--bg-image', [
      lightMood
        ? `linear-gradient(135deg, rgba(90, 96, 104, .08), rgba(90, 96, 104, 0) 45%, rgba(90, 96, 104, .04))`
        : `linear-gradient(to bottom, rgba(6, 14, 26, .15), rgba(6, 14, 26, .75))`,
      `radial-gradient(ellipse at 0% 25%, ${moodColor(state.colors.homeBg)}, transparent 65%)`,
      `radial-gradient(ellipse at 100% 75%, ${moodColor(state.colors.awayBg)}, transparent 65%)`,
      lightMood
        ? `linear-gradient(rgba(194, 198, 204, 1), rgba(194, 198, 204, 1))`
        : `linear-gradient(rgba(9, 19, 33, 1), rgba(9, 19, 33, 1))`
    ].join(', '));
  } else if (!imgSrc && getSetting('bgTeamDirection') !== 'off') {
    const color = value => {
      const rgb = parseAnyColor(chromaSafe(value));
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    };
    const direction = getSetting('bgTeamDirection') === 'vertical' ? 'to bottom' : 'to right';
    root.style.setProperty('--page-bg', 'transparent');
    root.style.setProperty('--bg-image', `linear-gradient(${direction}, ${color(state.colors.homeBg)}, ${color(state.colors.awayBg)})`);
  } else if (imgSrc) {
    // CSS url() 안에 큰따옴표가 들어가면 깨질 수 있어 escape.
    const safeSrc = imgSrc.replace(/"/g, '\\"');
    root.style.setProperty('--bg-image', `url("${safeSrc}")`);
  } else {
    root.style.setProperty('--bg-image', 'none');
  }
}

/** 선택한 기준색은 보존하고, 밝은 모드에서는 같은 색조의 밝은 표면색을 만든다. */
function panelSurfaceColor(color, mode = getSetting('uiMode')) {
  if (mode !== 'light') return color;
  if (String(color).toLowerCase() === SETTINGS_DEFAULTS.panelColor) return '#d3d6db';
  const rgb = parseAnyColor(color);
  if (!rgb) return color;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const surface = hslToRgb(h, Math.min(s * .5, .35), Math.max(.79, .85 - l * .06));
  return rgbToHex(surface.r, surface.g, surface.b);
}

/** 메뉴 팔레트와 정보 패널 팔레트를 따로 적용해 팀색·점수판·피치 색은 유지한다. */
function applyUiMode() {
  const root = document.documentElement;
  root.dataset.uiMode = getSetting('uiMode');
  const surface = chromaSafe(panelSurfaceColor(getSetting('panelColor')));
  const rgb = parseAnyColor(surface);
  root.style.setProperty('--info-panel-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  // 패널 투명도와 페이지 단색까지 적용한 뒤, 행 음영이 있는 영역도 함께 비교한다.
  const panel = document.querySelector('#benchPanel, .lp-events-s');
  const shownSurface = panel ? teamPanelBackground(panel) : surface;
  const shownRgb = parseAnyColor(shownSurface);
  const rowSurfaces = [shownSurface, ...[0, 255].map(value => {
    const parts = ['r', 'g', 'b'].map(key => Math.round(shownRgb[key] * .92 + value * .08));
    return `rgb(${parts.join(', ')})`;
  })];
  const contrastOnRows = color => Math.min(...rowSurfaces.map(background => teamColorContrastRatio(color, background)));
  const darkInk = contrastOnRows('#20242a') > contrastOnRows('#ffffff');
  const preferredText = darkInk ? '#20242a' : '#f0f0f0';
  const infoText = contrastOnRows(preferredText) >= 4.5 ? preferredText : (darkInk ? '#000000' : '#ffffff');
  root.dataset.infoTone = darkInk ? 'light' : 'dark';
  root.style.setProperty('--info-ink-rgb', darkInk ? '32, 36, 42' : '255, 255, 255');
  root.style.setProperty('--info-text', infoText);
  // 의미색의 색조를 유지하면서 실제 행 표면에서 읽히는 명도까지 조절한다.
  const readableInfoColor = color => {
    const safe = chromaSafeText(color);
    if (contrastOnRows(safe) >= 4.5) return safe;
    const value = parseAnyColor(safe);
    const { h, s, l } = rgbToHsl(value.r, value.g, value.b);
    for (let step = 1; step <= 20; step++) {
      const next = hslToRgb(h, s, l + ((darkInk ? 0 : 1) - l) * step / 20);
      const candidate = chromaSafeText(rgbToHex(next.r, next.g, next.b));
      if (contrastOnRows(candidate) >= 4.5) return candidate;
    }
    return infoText;
  };
  root.style.setProperty('--info-emphasis-text', readableInfoColor(darkInk ? '#124b2c' : '#bbf7d0'));
  root.style.setProperty('--info-secondary-text', readableInfoColor(darkInk ? '#334155' : '#cbd5e1'));
  root.style.setProperty('--info-yellow-text', readableInfoColor(darkInk ? '#6b5900' : '#FFD93D'));
  root.style.setProperty('--roster-in-text', readableInfoColor(darkInk ? '#17653b' : '#bbf7d0'));
  root.style.setProperty('--roster-out-text', readableInfoColor(darkInk ? '#7f1d1d' : '#ff8a8a'));
  root.style.setProperty('--event-in-text', darkInk ? chromaSafeText('#22C55E') : chromaSafeText(OVERLAY_CHROMA_COLORS['--overlay-in-text']));
  root.style.setProperty('--event-out-text', readableInfoColor(darkInk ? '#3e4856' : '#cbd5e1'));
  root.style.setProperty('--event-arrow-in', chromaSafeText(OVERLAY_CHROMA_COLORS['--overlay-in-text']));
  root.style.setProperty('--event-dark-green-bg', chromaSafe('#244332'));
  root.style.setProperty('--event-dark-green-text', chromaSafeText('#bbf7d0'));
  // 배지는 패널과 다른 표면이므로 배지 배경에 대해 글자 대비를 따로 판단한다.
  const eventGreenBackground = chromaSafe('#cfe5d9');
  const eventGreenText = chromaSafeText('#174f36');
  root.style.setProperty('--event-green-label-bg', eventGreenBackground);
  root.style.setProperty('--event-green-label-text', teamColorContrastRatio(eventGreenText, eventGreenBackground) >= 4.5
    ? eventGreenText : teamColorReadableText(eventGreenBackground));
  const label = parseAnyColor(getSetting('matchInfoLabelColor'));
  const labelHsl = rgbToHsl(label.r, label.g, label.b);
  const labelTone = hslToRgb(labelHsl.h, labelHsl.s, Math.min(labelHsl.l, .36));
  root.style.setProperty('--info-label-color', readableInfoColor(darkInk ? rgbToHex(labelTone.r, labelTone.g, labelTone.b) : getSetting('matchInfoLabelColor')));
}

/** 페이지 배경과 패널 투명도를 적용하고, 실제 합성 배경에 맞춰 패널 의미색을 갱신한다. */
function applyBackgroundSettings() {
  applyPageBackground();
  const root = document.documentElement;
  const forceOpaquePanels = getSetting('greenscreen') === 'on';

  // 패널 투명도 — UI는 0=불투명, 100=완전 투명. CSS alpha에는 반전된 opacity를 넣는다.
  const panelTransparencyPct = forceOpaquePanels
    ? 0 : clampPercent(getSetting('panelAlpha'), SETTINGS_DEFAULTS.panelAlpha);
  const alpha = (100 - panelTransparencyPct) / 100;
  root.style.setProperty('--panel-alpha', String(alpha));
  root.style.setProperty('--api-widget-hover-alpha', String(0.22 * alpha));
  const body = document.body;

  // 라인업 투명도 — 라인업 칼럼 배경과 피치 배경/라인 레이어가 이 값을 공유한다.
  const pitchTransparencyPct = forceOpaquePanels ? 0 : clampPercent(getSetting('pitchAlpha'), SETTINGS_DEFAULTS.pitchAlpha);
  const pitchAlpha = (100 - pitchTransparencyPct) / 100;
  root.style.setProperty('--lp-pitch-alpha', String(pitchAlpha));

  // 전술판 투명도 — 피치 + 우측 타임라인/이벤트 패널 배경을 별도 조절.
  const tacticsTransparencyPct = forceOpaquePanels ? 0 : clampPercent(getSetting('tacticsAlpha'), SETTINGS_DEFAULTS.tacticsAlpha);
  const tacticsAlpha = (100 - tacticsTransparencyPct) / 100;
  root.style.setProperty('--td-pitch-alpha', String(tacticsAlpha));
  if (body) {
    body.classList.remove('low-tactics-alpha');
  }
  applyUiMode();
}

/** 투명도 슬라이더의 가벼운 미리보기와 설정 확정을 분리한다. */
function bindTransparencySlider(input, category, label) {
  // 드래그 중에는 CSS만 갱신하고, 저장·대비 계산·패널 재렌더는 조작 종료 시 한 번 실행한다.
  input.addEventListener('input', () => {
    if (getSetting('greenscreen') === 'on') return;
    const value = clampPercent(Number(input.value), SETTINGS_DEFAULTS[category]);
    const alpha = (100 - value) / 100;
    const root = document.documentElement;
    const variable = { panelAlpha: '--panel-alpha', pitchAlpha: '--lp-pitch-alpha', tacticsAlpha: '--td-pitch-alpha' }[category];
    root.style.setProperty(variable, String(alpha));
    if (category === 'panelAlpha') root.style.setProperty('--api-widget-hover-alpha', String(.22 * alpha));
    if (label) label.textContent = `${value}%`;
  });
  input.addEventListener('change', () => {
    const value = Number(input.value);
    const unchanged = Number(getSetting(category)) === value;
    const saved = getSetting('greenscreen') !== 'on' && setSetting(category, value);
    // 원래 값으로 돌아오거나 저장에 실패한 경우에도 미리보기 상태를 확정값으로 복구한다.
    if (!saved || unchanged) applyBackgroundSettings();
    syncSliderUi(category);
    syncPanelFontPopup();
  });
}

/** 아직 확정하지 않은 미리보기도 기본값으로 되돌린다. */
function resetTransparencySetting(category) {
  const value = SETTINGS_DEFAULTS[category];
  if (Number(getSetting(category)) === value) applyBackgroundSettings();
  setSetting(category, value);
  syncSliderUi(category);
  syncPanelFontPopup();
}

/**
 * 슬라이더 UI 동기화 + 옆에 붙은 .sp-slider-value 라벨도 같이 갱신.
 * lineupNameSize / eventNameSize / benchInjuryNameSize / statsNameSize는 px 단위, 그 외(lineupScale 등)는 % 단위로 표시.
 */
function syncSliderUi(category) {
  const input = document.querySelector(`input[data-settings-slider="${category}"]`);
  if (!input) return;
  const isPanelTransparency = ['panelAlpha', 'pitchAlpha', 'tacticsAlpha'].includes(category);
  const forceOpaquePanel = isPanelTransparency && getSetting('greenscreen') === 'on';
  const value = forceOpaquePanel ? 0 : Number(getSetting(category));
  if (isPanelTransparency) input.disabled = forceOpaquePanel;
  const reset = input.parentElement?.querySelector('[data-settings-slider-reset]');
  if (reset) reset.disabled = input.disabled;
  if (input.value !== String(value)) input.value = String(value);
  const label = input.closest('.sp-slider-cluster')?.querySelector('.sp-slider-value')
    || document.querySelector(`[data-settings-slider-value="${category}"]`);
  if (!label) return;
  if (category === 'lineupNameSize' || category === 'eventNameSize' || category === 'tacticsNameSize' || category === 'benchInjuryNameSize' || category === 'statsNameSize' || ['matchInfoNameSize', 'hthNameSize', 'teamFixturesNameSize'].includes(category)) label.textContent = `${value}px`;
  else label.textContent = `${value}%`;
}

/** 패널 제목의 빠른 글자 크기 편집도 설정 창과 같은 저장·적용 경로를 사용한다. */
const PANEL_FONT_SETTINGS = ['lineupNameSize', 'eventNameSize', 'benchInjuryNameSize', 'statsNameSize', 'matchInfoNameSize', 'hthNameSize', 'teamFixturesNameSize'];
function panelFontTitleAttrs(category) {
  return ` data-panel-font="${category}" role="button" tabindex="0" title="클릭하여 글자 크기·투명도 조절"`;
}
function bindPanelFontTitle(title, category) {
  title.dataset.panelFont = category;
  title.setAttribute('role', 'button');
  title.tabIndex = 0;
  title.title = '클릭하여 글자 크기·투명도 조절';
}
let panelFontPopup = null;
/** 빠른 메뉴에서도 설정창과 같은 토글·저장·동기화를 사용합니다. */
function createQuickSettingRow(category, compact = false) {
  const sourceCategory = category === 'lineupShowFormationButton' ? 'lineupHideInitial' : category;
  const source = document.querySelector(`#settingsBackdrop input[data-settings-cat="${sourceCategory}"]`).closest('.sp-row');
  const row = document.createElement('div');
  row.className = 'sp-row quick-setting-row';
  row.append(source.querySelector('.sp-row-label').cloneNode(true), source.querySelector('.sp-toggle-cluster').cloneNode(true));
  if (compact) row.querySelector('.sp-label-sub')?.remove();
  const input = row.querySelector('input');
  input.dataset.settingsCat = category;
  if (category === 'lineupShowFormationButton') {
    row.classList.add('quick-formation-setting');
    row.querySelector('.sp-label-main').textContent = '포메이션 설정 버튼';
  }
  input.setAttribute('aria-label', row.querySelector('.sp-label-main').textContent);
  if (compact) {
    input.closest('.sp-switch').classList.add('sp-switch-mini');
    row.querySelector('.sp-label-main').textContent = {
      lineup: '이름 풀네임 표기', lineupHideInitial: '이니셜 제거', roster: '이름 풀네임 표기',
      event: '이름 풀네임 표기', scorer: '득점자 풀네임', teamName: '팀 이름 풀네임',
    }[category] || row.querySelector('.sp-label-main').textContent;
  }
  input.checked = getSetting(category) === getSwitchSides(category).on;
  input.addEventListener('change', () => {
    const { off, on } = getSwitchSides(category);
    setSetting(category, input.checked ? on : off);
  });
  return row;
}
function closePanelFontPopup() {
  const recalculate = panelFontPopup?.dataset.rebalance === 'small-bench'
    && Number(panelFontPopup.dataset.initialValue) !== Number(getSetting('benchInjuryNameSize'));
  panelFontPopup?.remove();
  panelFontPopup = null;
  // 조절창을 닫은 뒤 확정된 글자 크기로 높이를 다시 맞추되, 사용자가 드래그한 비율은 유지한다.
  if (recalculate) requestAnimationFrame(() => window.balanceBenchInjuryPanelHeights?.());
}
function syncPanelFontPopup() {
  if (!panelFontPopup) return;
  panelFontPopup._syncToken?.();
  panelFontPopup._syncTransparency?.();
  const category = panelFontPopup.dataset.category;
  const value = Number(getSetting(category));
  panelFontPopup.querySelector('input').value = String(value);
  panelFontPopup.querySelector('output').textContent = `${value}px`;
}
function openPanelFontPopup(title, clickPoint = null) {
  const category = title.dataset.panelFont;
  if (!PANEL_FONT_SETTINGS.includes(category)) return;
  const source = document.querySelector(`input[data-settings-slider="${category}"]`);
  if (!source) return;
  if (panelFontPopup?._anchor === title) { closePanelFontPopup(); return; }
  closePanelFontPopup();
  const popup = document.createElement('div');
  popup.className = 'panel-font-popover';
  popup.dataset.category = category;
  popup.dataset.initialValue = String(getSetting(category));
  if (title.closest('#benchPanel, #injuryPanel')) popup.dataset.rebalance = 'small-bench';
  popup._anchor = title;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', '패널 글자 크기');
  const cluster = document.createElement('label');
  cluster.className = 'sp-slider-cluster';
  const input = document.createElement('input');
  input.type = 'range';
  ['min', 'max', 'step'].forEach(attr => input.setAttribute(attr, source.getAttribute(attr)));
  input.setAttribute('aria-label', '글자 크기');
  const value = document.createElement('output');
  value.className = 'sp-slider-value';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'panel-font-reset';
  reset.textContent = '초기화';
  reset.addEventListener('click', () => { resetPanelFontSetting(category); syncPanelFontPopup(); });
  input.addEventListener('input', () => { setSetting(category, Number(input.value)); syncPanelFontPopup(); });
  cluster.append(input, value);
  const heading = document.createElement('div');
  heading.className = 'panel-font-heading';
  heading.textContent = category === 'lineupNameSize' ? '선발 라인업 이름 크기'
    : ['benchInjuryNameSize', 'eventNameSize'].includes(category) ? '이름 크기' : '글자 크기';
  popup.append(heading);
  popup.append(cluster, reset);
  const nameSettings = category === 'lineupNameSize' ? ['lineup', 'lineupHideInitial', 'lineupShowFormationButton']
    : category === 'benchInjuryNameSize' ? ['roster'] : category === 'eventNameSize' ? ['event'] : [];
  if (nameSettings.length) popup.classList.add('has-name-settings');
  if (category === 'lineupNameSize') {
    const row = document.querySelector('[data-settings-slider="lineupTokenScale"]').closest('.sp-row').cloneNode(true);
    row.querySelector('.sp-label-sub')?.remove();
    row.querySelector('[data-settings-slider-reset]')?.remove();
    const tokenInput = row.querySelector('input');
    const tokenValue = row.querySelector('.sp-slider-value');
    const sync = () => {
      tokenInput.value = getSetting('lineupTokenScale');
      tokenValue.textContent = `${tokenInput.value}%`;
    };
    tokenInput.setAttribute('aria-label', '선발 라인업 선수 크기');
    tokenInput.addEventListener('input', () => { setSetting('lineupTokenScale', Number(tokenInput.value)); sync(); });
    const tokenReset = document.createElement('button');
    tokenReset.className = 'panel-font-reset';
    tokenReset.textContent = '초기화';
    tokenReset.addEventListener('click', () => { resetPanelFontSetting('lineupTokenScale'); sync(); });
    const tokenHeading = document.createElement('div');
    tokenHeading.className = 'panel-font-heading';
    tokenHeading.textContent = row.querySelector('.sp-label-main').textContent;
    popup.append(tokenHeading, row.querySelector('.sp-slider-cluster'), tokenReset);
    popup._syncToken = sync;
    sync();
  }
  // 빠른 메뉴의 투명도도 설정 창과 같은 저장값과 그린스크린 제한을 따른다.
  const transparencyCategory = category === 'lineupNameSize' ? 'pitchAlpha' : 'panelAlpha';
  const transparencyLabel = category === 'lineupNameSize' ? '라인업 투명도' : '패널 투명도';
  const transparencySource = document.querySelector(`#settingsBackdrop input[data-settings-slider="${transparencyCategory}"]`);
  const transparencyInput = transparencySource.cloneNode(true);
  transparencyInput.removeAttribute('data-settings-slider');
  transparencyInput.setAttribute('aria-label', transparencyLabel);
  const transparencyHeading = document.createElement('div');
  transparencyHeading.className = 'panel-font-heading';
  transparencyHeading.textContent = transparencyLabel;
  const transparencyCluster = document.createElement('label');
  transparencyCluster.className = 'sp-slider-cluster';
  const transparencyValue = document.createElement('output');
  transparencyValue.className = 'sp-slider-value';
  const transparencyReset = document.createElement('button');
  transparencyReset.type = 'button';
  transparencyReset.className = 'panel-font-reset';
  transparencyReset.textContent = '초기화';
  transparencyReset.setAttribute('aria-label', `${transparencyLabel} 초기화`);
  popup._syncTransparency = () => {
    const disabled = getSetting('greenscreen') === 'on';
    transparencyInput.disabled = transparencyReset.disabled = disabled;
    transparencyInput.value = disabled ? 0 : getSetting(transparencyCategory);
    transparencyValue.textContent = `${transparencyInput.value}%`;
  };
  bindTransparencySlider(transparencyInput, transparencyCategory, transparencyValue);
  transparencyReset.addEventListener('click', () => resetTransparencySetting(transparencyCategory));
  transparencyCluster.append(transparencyInput, transparencyValue);
  popup.classList.add('has-name-settings');
  popup.append(transparencyHeading, transparencyCluster, transparencyReset);
  nameSettings.forEach(setting => popup.append(createQuickSettingRow(setting, true)));
  (document.fullscreenElement || document.body).append(popup);
  panelFontPopup = popup;
  nameSettings.forEach(syncSwitchUi);
  syncPanelFontPopup();
  const rect = title.getBoundingClientRect();
  // 긴 경기장 외곽선은 아래 끝이 아니라 실제 누른 지점 옆에 메뉴를 엽니다.
  const anchor = title.matches('.dp-lineup-touchline')
    ? (clickPoint || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    : { x: rect.left, y: rect.bottom };
  const point = typeof toDisplayLayoutPoint === 'function' ? toDisplayLayoutPoint(anchor.x, anchor.y + 6) : { x: anchor.x, y: anchor.y + 6 };
  popup.style.left = `${point.x}px`;
  popup.style.top = `${point.y}px`;
  if (typeof pmClampPopupToViewport === 'function') pmClampPopupToViewport(popup);
  input.focus({ preventScroll: true });
}
document.addEventListener('click', event => {
  if (event.target.closest('button, a, input, select, [data-team-nickname-side], [data-team-nickname-key]')) return;
  const title = event.target.closest('[data-panel-font]');
  if (!title) return;
  event.stopPropagation();
  openPanelFontPopup(title, event.detail ? { x: event.clientX, y: event.clientY } : null);
});
document.addEventListener('pointerdown', event => {
  if (panelFontPopup && !panelFontPopup.contains(event.target) && !event.target.closest('[data-panel-font]')) closePanelFontPopup();
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panelFontPopup) { closePanelFontPopup(); event.preventDefault(); return; }
  if (!['Enter', ' '].includes(event.key) || !event.target.matches('[data-panel-font]')) return;
  event.preventDefault();
  event.stopPropagation();
  openPanelFontPopup(event.target);
});
document.addEventListener('settings:change', syncPanelFontPopup);
document.addEventListener('page:activated', closePanelFontPopup);
document.addEventListener('fullscreenchange', closePanelFontPopup);
window.addEventListener('resize', closePanelFontPopup);
// 화면 모드가 바뀌면 저장값은 유지하고 현재 화면의 기본값과 입력 UI만 다시 적용한다.
function syncDashboardFontContext() {
  applyLayoutSettings();
  [...Object.keys(DASHBOARD_FULLSCREEN_DEFAULTS), 'statsNameSize'].forEach(category => {
    syncSettingUi(category);
    emitSettingsChange(category);
  });
}
window.addEventListener('resize', syncDashboardFontContext);
document.addEventListener('fullscreenchange', syncDashboardFontContext);
document.addEventListener('page:activated', syncDashboardFontContext);
window.matchMedia('(display-mode: fullscreen)').addEventListener('change', syncDashboardFontContext);

/** 숫자 input(<input type="number">) UI 동기화. statsAutoSwipeSec처럼 0.5 step 허용 카테고리에 사용. */
function syncNumberUi(category) {
  const input = document.querySelector(`input[data-settings-number="${category}"]`);
  if (!input) return;
  const value = Number(getSetting(category));
  if (Number.isFinite(value) && input.value !== String(value)) input.value = String(value);
}

/** 색상 input(<input type="color">) UI 동기화. 평점 색상 7구간 등에 사용. */
function syncColorUi(category) {
  const value = String(getSetting(category) || '').toLowerCase();
  if (category === 'panelColor') {
    const preset = document.getElementById('panelColorPreset');
    if (preset) preset.value = [...preset.options].some(option => option.value === value) ? value : 'custom';
  }
  document.querySelectorAll(`input[data-settings-color="${category}"]`).forEach(input => {
    if (HEX_COLOR_RE.test(value) && input.value.toLowerCase() !== value) input.value = value;
  });
  document.querySelectorAll(`[data-color-editor="${category}"]`).forEach(editor => {
  if (HEX_COLOR_RE.test(value)) {
    editor.querySelector('[data-color-hex]').value = value;
    editor.querySelectorAll('[data-color-channel]').forEach(channel => {
      const start = 1 + Number(channel.dataset.colorChannel) * 2;
      channel.value = parseInt(value.slice(start, start + 2), 16);
    });
  }
  });
}

/** 저장이나 전체 렌더 없이 현재 색상에 해당하는 화면 속성만 미리 보여줍니다. */
function previewSettingsColor(category, value) {
  if (!HEX_COLOR_RE.test(value)) return;
  const root = document.documentElement;
  if (category in NOTE_COLOR_VARS) {
    root.style.setProperty(NOTE_COLOR_VARS[category], chromaSafe(value));
  } else if (RATING_COLOR_KEYS.has(category)) {
    const keys = ['ratingColorBelow6', 'ratingColor6', 'ratingColor65', 'ratingColor7', 'ratingColor8', 'ratingColor9', 'ratingColor95'];
    document.querySelectorAll('.dp-rating, .dp-node-rating').forEach(node => {
      const rating = Number(node.textContent);
      if (!Number.isFinite(rating)) return;
      const index = [6, 6.5, 7, 8, 9, 9.5].findIndex(limit => rating < limit);
      if (keys[index < 0 ? 6 : index] !== category) return;
      const safe = chromaSafe(value);
      node.style.background = safe;
      if (node.classList.contains('dp-rating')) {
        node.style.color = teamColorContrastRatio('#000000', safe) > teamColorContrastRatio('#ffffff', safe) ? '#000000' : '#ffffff';
      }
    });
  } else if (['bgColor', 'panelColor', 'matchInfoLabelColor'].includes(category)) {
    // 기존 모드별 배경·대비 계산만 재사용하고 저장값은 즉시 원복합니다.
    const key = category === 'bgColor' && getSetting('uiMode') === 'light' ? 'lightBgColor' : category;
    const existed = Object.hasOwn(settingsState, key);
    const previous = settingsState[key];
    settingsState[key] = value;
    try {
      if (category === 'bgColor') applyPageBackground();
      else {
        if (category === 'matchInfoLabelColor') root.style.setProperty('--mi-label-color', chromaSafeText(value));
        applyUiMode();
      }
    } finally {
      if (existed) settingsState[key] = previous;
      else delete settingsState[key];
    }
  }
}

function initSettingsColorEditors() {
  document.querySelectorAll('input[data-settings-color]').forEach(swatch => {
    const category = swatch.dataset.settingsColor;
    if (category === 'bgColor' || swatch.closest('[data-color-editor]')) return;
    const label = swatch.closest('label');
    const title = swatch.getAttribute('aria-label') || label.textContent.trim();
    swatch.setAttribute('aria-label', title);
    const editor = document.createElement('div');
    editor.className = 'sp-color-editor';
    editor.dataset.colorEditor = category;
    label.replaceWith(editor);
    editor.append(label);
    // 테마 탭에서는 기존 팀 색상 편집기처럼 라벨 아래에 입력기를 한 줄로 배치합니다.
    if (swatch.closest('#themePanel')) {
      const group = document.createElement('div');
      group.className = 'pgroup';
      const groupLabel = document.createElement('label');
      groupLabel.textContent = title;
      editor.before(group);
      group.append(groupLabel, editor);
      editor.className = 'theme-color-editor';
      editor.append(swatch);
      label.remove();
    }
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'sp-text-input sp-color-code';
    hex.dataset.colorHex = '';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', `${title} HEX`);
    const rgb = document.createElement('div');
    rgb.className = 'sp-color-rgb';
    rgb.hidden = true;
    ['R', 'G', 'B'].forEach((name, index) => {
      const channelLabel = document.createElement('label');
      channelLabel.append(name);
      const channel = document.createElement('input');
      Object.assign(channel, { type: 'number', min: '0', max: '255', step: '1', inputMode: 'numeric' });
      channel.dataset.colorChannel = index;
      channel.setAttribute('aria-label', `${title} ${name}`);
      channelLabel.append(channel);
      rgb.append(channelLabel);
    });
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sp-color-format-btn';
    toggle.innerHTML = document.getElementById('settingsBgColorFormat').innerHTML;
    const updateToggle = () => {
      toggle.title = rgb.hidden ? 'RGB 입력으로 전환' : 'HEX 입력으로 전환';
      toggle.setAttribute('aria-label', `${title} ${toggle.title}`);
    };
    editor.append(hex, rgb, toggle);
    updateToggle();
    toggle.addEventListener('click', () => {
      rgb.hidden = !rgb.hidden;
      hex.hidden = !rgb.hidden;
      editor.classList.toggle('is-rgb', !rgb.hidden);
      syncColorUi(category);
      updateToggle();
      (rgb.hidden ? hex : rgb.querySelector('input')).focus();
    });
    hex.addEventListener('change', () => {
      const value = hex.value.trim().toLowerCase();
      if (HEX_COLOR_RE.test(value)) setSetting(category, value);
      syncColorUi(category);
    });
    const commitRgb = () => {
      const channels = [...rgb.querySelectorAll('input')];
      if (channels.some(channel => !channel.value || !channel.validity.valid)) return false;
      setSetting(category, '#' + channels.map(channel => Number(channel.value).toString(16).padStart(2, '0')).join(''));
      return true;
    };
    rgb.querySelectorAll('input').forEach(channel => {
      channel.addEventListener('input', commitRgb);
      channel.addEventListener('change', () => { if (!commitRgb()) syncColorUi(category); });
    });
    syncColorUi(category);
  });
}

/** 텍스트 input(<input type="text">) UI 동기화. bgImageUrl 등에 사용. */
function syncTextUi(category) {
  if (category === 'bgImageUrl' || category === 'bgImageData') syncBackgroundImageUi();
  const input = document.querySelector(`input[data-settings-text="${category}"]`);
  if (!input) return;
  const value = String(getSetting(category) || '');
  if (category === 'bgColor' && HEX_COLOR_RE.test(value)) {
    document.querySelectorAll('input[data-bg-rgb]').forEach(channelInput => {
      const start = 1 + Number(channelInput.dataset.bgRgb) * 2;
      channelInput.value = parseInt(value.slice(start, start + 2), 16);
    });
  }
  if (input.value !== value) input.value = value;
}

/** select 드롭다운 UI 동기화. greenscreenIntensity 등 enum 카테고리에 사용. */
function syncSelectUi(category) {
  const select = document.querySelector(`select[data-settings-select="${category}"]`);
  if (!select) return;
  const value = String(getSetting(category) || '');
  if (select.value !== value) select.value = value;
  if (category === 'bgPreset') syncBackgroundImageUi();
}

/** 배경은 적용 전까지 갤러리 안에서만 미리 보고, 취소하면 기존 선택을 유지한다. */
const BACKGROUND_CUSTOM_INPUTS = `<div class="bg-picker-custom-file">
  <label for="settingsBgImageFile">내 사진</label>
  <input type="file" id="settingsBgImageFile" accept="image/*" class="sp-file-input">
  <p>12MB 이하의 이미지 파일을 선택하세요.</p></div>
  <div class="bg-picker-custom-url"><label for="backgroundPickerUrl">이미지 URL</label>
  <input type="url" id="backgroundPickerUrl" class="sp-text-input" placeholder="https://example.com/bg.jpg">
  <p>주소를 입력하면 위에서 미리 볼 수 있습니다.</p></div>
  <p class="bg-picker-status" role="status"></p>`;

/**
 * URL → 첨부 이미지 → 현재 모드의 기본 배경 순서로 실제 표시할 이미지를 조회한다.
 * 저장값은 변경하지 않으며, 미리보기와 설정 행이 공통으로 사용할 출처·주소·이름을 반환한다.
 * @returns {{source: string, src: string, name: string, preset?: string}} 현재 적용되는 이미지 정보.
 */
function currentBackgroundImage() {
  const url = normalizeBackgroundImageUrl(getSetting('bgImageUrl'));
  const data = getSetting('bgImageData');
  const preset = getSetting('bgPreset');
  if (url) return { source: 'url', src: url, name: '이미지 URL' };
  if (data) return { source: 'file', src: data, name: '첨부 이미지' };
  return { source: 'preset', preset,
    src: BACKGROUND_PRESET_IMAGES[preset] ? new URL(BACKGROUND_PRESET_IMAGES[preset], document.baseURI).href : '',
    name: document.querySelector(`[data-settings-select="bgPreset"] option[value="${preset}"]`)?.textContent || '사용 안 함' };
}

/** 실제 적용 이미지의 이름·썸네일과 해제 버튼 상태를 설정 행에 반영한다. */
function syncBackgroundImageUi() {
  const current = currentBackgroundImage();
  const name = document.getElementById('settingsBgPresetName');
  if (name) name.textContent = current.name;
  const thumb = document.getElementById('settingsBgPresetThumb');
  if (thumb) {
    thumb.hidden = !current.src;
    thumb.style.backgroundImage = current.src ? `url(${JSON.stringify(current.src)})` : 'none';
  }
  const clear = document.getElementById('settingsBgPresetClear');
  if (clear) clear.disabled = !current.src;
}

/**
 * 선택한 배경을 저장하면서 충돌하는 URL·첨부 이미지 설정을 함께 비운다.
 * 기본 배경은 현재 모드의 키만 갱신한다. 저장 실패 시 전체 상태를 복구하고,
 * 성공한 경우에만 입력 UI·페이지 배경을 갱신하고 설정 변경 이벤트를 전달한다.
 * @param {{source: string, src: string, preset?: string}} draft 적용할 이미지 또는 해제 선택.
 * @returns {boolean} 저장과 적용이 완료되면 true, 저장 실패 시 false.
 */
function commitBackgroundImage(draft) {
  const presetKey = getSetting('uiMode') === 'light' ? 'lightBgPreset' : 'bgPreset';
  const values = {
    bgImageUrl: draft.source === 'url' ? draft.src : '',
    bgImageData: draft.source === 'file' ? draft.src : '',
    [presetKey]: draft.source === 'preset' ? draft.preset : getSetting('bgPreset')
  };
  const previous = { ...settingsState };
  Object.assign(settingsState, values);
  if (!saveSettings()) {
    Object.assign(settingsState, previous);
    if (typeof showToast === 'function') showToast('배경을 저장하지 못했습니다. 저장 공간을 확인하세요.');
    return false;
  }
  Object.entries(values).forEach(([category, value]) => {
    syncSettingUi(category); applySettingSideEffects(category);
    document.dispatchEvent(new CustomEvent('settings:change', { detail: { category, value, mode: value } }));
  });
  syncBackgroundImageUi();
  return true;
}

/** 선택 창의 로딩·오류 안내와 적용 버튼 활성 상태를 함께 변경한다. 저장값은 바꾸지 않는다. */
function setBackgroundDraftStatus(dialog, message, disabled) {
  dialog.querySelector('.bg-picker-status').textContent = message;
  dialog.querySelector('#backgroundPickerApply').disabled = disabled;
}

/** 선택 중인 이미지의 미리보기·선택 표시·전체화면 접근 상태를 갱신하고 적용 가능 여부를 반영한다. */
function renderBackgroundDraft(dialog) {
  const draft = dialog._draft;
  dialog.dataset.selection = draft.preset || '';
  dialog.querySelectorAll('[data-bg-choice]').forEach(button => button.setAttribute('aria-pressed', String(draft.source === 'preset' && button.dataset.bgChoice === draft.preset)));
  const image = dialog.querySelector('.bg-picker-preview-image');
  image.style.backgroundImage = draft.src ? `url(${JSON.stringify(draft.src)})` : 'none';
  image.querySelector('.bg-picker-preview-empty').textContent = draft.src ? '' : draft.source === 'preset' ? '배경 이미지 사용 안 함' : '이미지 미리보기';
  image.setAttribute('aria-disabled', String(!draft.src)); image.tabIndex = draft.src ? 0 : -1;
  dialog.querySelector('.bg-picker-preview-name').textContent = draft.name;
  setBackgroundDraftStatus(dialog, '', !draft.src && draft.source !== 'preset');
}

/**
 * URL 이미지를 비동기로 확인한 뒤 선택 창의 미리보기에만 반영한다.
 * 요청 번호와 창의 열림 상태를 확인해 이전 요청·취소된 창의 응답은 무시한다.
 * 로딩 또는 오류 중에는 적용을 막고, 정상 로딩된 주소만 적용할 수 있도록 한다.
 * @param {HTMLDialogElement} dialog 배경 선택 창.
 * @param {string} src 정규화된 이미지 주소. 빈 주소이면 입력 안내만 표시한다.
 */
function loadBackgroundDraft(dialog, src) {
  const request = ++dialog._request;
  dialog._draft = { source: 'url', src: '', name: '이미지 URL' };
  renderBackgroundDraft(dialog);
  if (!src) { setBackgroundDraftStatus(dialog, '이미지 주소를 입력하세요.', true); return; }
  setBackgroundDraftStatus(dialog, '이미지를 불러오고 있습니다.', true);
  const image = new Image();
  image.onload = () => {
    if (request !== dialog._request || !dialog.open) return;
    dialog._draft = { source: 'url', src, name: '이미지 URL' }; renderBackgroundDraft(dialog);
  };
  image.onerror = () => {
    if (request === dialog._request && dialog.open) setBackgroundDraftStatus(dialog, '이미지를 불러오지 못했습니다. 주소를 확인하세요.', true);
  };
  image.src = src;
}

/**
 * 기본 배경 목록과 파일·URL 입력이 있는 선택 창을 생성하거나 다시 연다.
 * 열 때마다 현재 배경으로 임시 선택을 초기화하고, 적용 전까지 실제 설정은 유지한다.
 * 파일 압축·전체화면 미리보기·취소 동작을 연결하며 재사용 시 이벤트를 중복 등록하지 않는다.
 */
function openBackgroundPicker() {
  let dialog = document.getElementById('backgroundPicker');
  const source = document.querySelector('[data-settings-select="bgPreset"]');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'backgroundPicker';
    dialog.className = 'bg-picker';
    dialog.setAttribute('aria-labelledby', 'backgroundPickerTitle');
    dialog.innerHTML = `<header class="bg-picker-header"><h2 id="backgroundPickerTitle">배경 이미지 설정</h2><button type="button" class="sp-close-btn" data-bg-picker-close aria-label="닫기">×</button></header>
      <div class="bg-picker-body"><div class="bg-picker-preview"><div class="bg-picker-preview-image" role="button" tabindex="0" aria-label="배경 전체화면 미리보기"><span class="bg-picker-preview-empty"></span><button type="button" class="bg-picker-preview-exit" aria-label="전체화면 미리보기 닫기">닫기</button></div><strong class="bg-picker-preview-name"></strong><p>배경을 선택해 미리 본 뒤 적용하세요. 미리보기 이미지를 더블클릭하면 전체화면으로 볼 수 있습니다.</p></div><div class="bg-picker-list"></div></div>
      <footer class="bg-picker-footer"><button type="button" class="sp-secondary-btn" data-bg-picker-close>취소</button><button type="button" class="sp-secondary-btn" id="backgroundPickerApply">적용</button></footer>`;
    const list = dialog.querySelector('.bg-picker-list');
    const addChoice = option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bg-picker-choice';
      button.dataset.bgChoice = option.value;
      button.setAttribute('aria-pressed', 'false');
      if (BACKGROUND_PRESET_IMAGES[option.value]) {
        const img = document.createElement('img');
        img.src = new URL(BACKGROUND_PRESET_IMAGES[option.value], document.baseURI).href;
        img.alt = ''; img.loading = 'lazy';
        button.append(img);
      } else {
        const empty = document.createElement('span');
        empty.className = 'bg-picker-none'; empty.setAttribute('aria-hidden', 'true');
        empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>';
        button.append(empty);
      }
      const name = document.createElement('span'); name.textContent = option.value === 'off' ? '이미지 사용 안 함' : option.textContent;
      button.append(name); button.addEventListener('click', () => previewBackgroundChoice(dialog, option.value));
      list.append(button);
    };
    [...source.children].forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const heading = document.createElement('h3'); heading.textContent = child.label; list.append(heading);
        [...child.children].forEach(addChoice);
      } else addChoice(child);
    });
    dialog.querySelector('.bg-picker-footer').prepend(list.querySelector('[data-bg-choice="off"]'));
    dialog.querySelectorAll('[data-bg-picker-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.querySelector('#backgroundPickerApply').addEventListener('click', () => {
      if (commitBackgroundImage(dialog._draft)) dialog.close();
    });
    const preview = dialog.querySelector('.bg-picker-preview-image');
    const closePreview = () => {
      if (document.fullscreenElement === preview) document.exitFullscreen().catch(() => {});
      dialog.classList.remove('is-preview-fullscreen');
      if (dialog.open) preview.focus();
    };
    const expandPreview = async () => {
      if (!dialog._draft?.src) return;
      // 전체화면 API를 제공하지 않는 OBS 환경에서는 같은 창 안의 전체 보기로 대체한다.
      try { await preview.requestFullscreen(); }
      catch { dialog.classList.add('is-preview-fullscreen'); }
    };
    preview.addEventListener('dblclick', event => {
      if (event.target.closest('.bg-picker-preview-exit')) return;
      if (document.fullscreenElement === preview || dialog.classList.contains('is-preview-fullscreen')) closePreview();
      else expandPreview();
    });
    preview.addEventListener('keydown', event => {
      if (event.target !== preview || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); expandPreview();
    });
    preview.querySelector('.bg-picker-preview-exit').addEventListener('click', event => { event.stopPropagation(); closePreview(); });
    dialog.addEventListener('close', () => { dialog._request++; closePreview(); });
    dialog.addEventListener('keydown', event => {
      // 설정 팝업·분리 창의 Esc 처리까지 전파하지 않고 갤러리만 닫는다.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (document.fullscreenElement === preview || dialog.classList.contains('is-preview-fullscreen')) closePreview();
        else dialog.close();
      }
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    const listHost = document.createElement('div');
    listHost.className = 'bg-picker-sources';
    list.replaceWith(listHost);
    listHost.append(list);
    const inputs = document.createElement('div');
    inputs.className = 'bg-picker-custom';
    inputs.innerHTML = BACKGROUND_CUSTOM_INPUTS;
    dialog.querySelector('.bg-picker-preview').append(inputs);
    dialog.querySelector('#backgroundPickerUrl').addEventListener('input', event => loadBackgroundDraft(dialog, normalizeBackgroundImageUrl(event.target.value)));
    dialog.querySelector('#settingsBgImageFile').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const request = ++dialog._request;
      if (!/^image\//.test(file.type) || file.size > BG_IMAGE_MAX_BYTES) {
        setBackgroundDraftStatus(dialog, '12MB 이하의 이미지 파일을 선택하세요.', true); return;
      }
      setBackgroundDraftStatus(dialog, '이미지를 준비하고 있습니다.', true);
      try {
        const data = await compressBackgroundImage(file);
        if (request !== dialog._request || !dialog.open) return;
        dialog._draft = { source: 'file', src: data, name: file.name };
        renderBackgroundDraft(dialog);
      } catch {
        if (request === dialog._request && dialog.open) setBackgroundDraftStatus(dialog, '이미지를 열지 못했습니다. 다른 파일을 선택하세요.', true);
      }
    });
    document.getElementById('settingsBackdrop').append(dialog);
  }
  dialog._request = (dialog._request || 0) + 1;
  dialog._draft = currentBackgroundImage();
  dialog.querySelector('#backgroundPickerUrl').value = getSetting('bgImageUrl') || '';
  dialog.querySelector('#settingsBgImageFile').value = '';
  renderBackgroundDraft(dialog);
  dialog.showModal();
  dialog.querySelector('.bg-picker-list').scrollTop = 0;
}

/** 기본 배경을 임시 선택하고 대기 중인 이미지 요청을 무효화한 뒤 미리보기만 갱신한다. */
function previewBackgroundChoice(dialog, value) {
  dialog._request = (dialog._request || 0) + 1;
  dialog._draft = { source: 'preset', preset: value,
    src: BACKGROUND_PRESET_IMAGES[value] ? new URL(BACKGROUND_PRESET_IMAGES[value], document.baseURI).href : '',
    name: dialog.querySelector(`[data-bg-choice="${value}"]`)?.lastElementChild.textContent || '' };
  renderBackgroundDraft(dialog);
}

function getDataUrlByteLength(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return Math.floor(payload.length * 3 / 4);
}

/**
 * @param {File} file
 * @param {{ preserveAlpha?: boolean }} [options] - preserveAlpha:true면(팀 로고 등 투명
 *   배경이 의미 있는 이미지) JPEG로 폴백하지 않는다 — JPEG는 알파 채널이 없어 투명 배경이
 *   단색으로 채워지며, 배경 이미지와 달리 로고는 그러면 시각적으로 망가진다. 그 대신 WebP
 *   (알파 유지 가능)만으로 계속 시도하고, 그래도 목표 용량을 못 맞추면 캔버스를 한 번 더
 *   축소해 재시도한다.
 */
function compressBackgroundImage(file, options = {}) {
  const preserveAlpha = !!options.preserveAlpha;
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          BG_IMAGE_MAX_WIDTH / image.naturalWidth,
          BG_IMAGE_MAX_HEIGHT / image.naturalHeight
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.84, 0.72, 0.60, 0.48]) {
          const webp = canvas.toDataURL('image/webp', quality);
          if (getDataUrlByteLength(webp) <= BG_IMAGE_SAFE_PERSIST_BYTES) {
            resolve(webp);
            return;
          }
          if (!preserveAlpha) {
            const jpeg = canvas.toDataURL('image/jpeg', quality);
            if (getDataUrlByteLength(jpeg) <= BG_IMAGE_SAFE_PERSIST_BYTES) {
              resolve(jpeg);
              return;
            }
          }
        }
        if (preserveAlpha) {
          // 화질을 더 낮춰도 안 되면 캔버스 자체를 축소해 WebP로 재시도(알파 유지 우선).
          canvas.width = Math.max(1, Math.round(canvas.width * 0.5));
          canvas.height = Math.max(1, Math.round(canvas.height * 0.5));
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.72, 0.48, 0.3]) {
            const webp = canvas.toDataURL('image/webp', quality);
            if (getDataUrlByteLength(webp) <= BG_IMAGE_SAFE_PERSIST_BYTES) {
              resolve(webp);
              return;
            }
          }
        }
        reject(new Error('compressed image is still too large'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image decode failed'));
    };
    image.src = objectUrl;
  });
}

function handleBgImageFileLoad(dataUrl, file) {
  if (!setSetting('bgImageData', String(dataUrl || ''))) {
    const mb = file ? (file.size / 1024 / 1024).toFixed(1) : '?';
    if (typeof showToast === 'function') {
      showToast(`배경 이미지 저장 실패. ${mb}MB 파일은 첨부로 저장하기 큽니다. 이미지 URL을 사용하세요.`);
    }
    return;
  }
  if (settingsState.bgImageUrl && !setSetting('bgImageUrl', '')) {
    if (typeof showToast === 'function') {
      showToast('배경 이미지 저장 실패. 첨부 저장 공간이 부족합니다. 이미지 URL을 사용하세요.');
    }
    return;
  }
  if (typeof showToast === 'function') showToast('배경 이미지가 적용되었습니다');
}

/** legacy alias — 기존 외부 호출 호환용. setSetting의 wrapper. */
function setNameMode(category, mode) {
  setSetting(category, mode);
}

let lineupInitialCollisionBaseNames = new Set();
let lineupShortNameCollisionNames = new Set();

// CSV 한글 숏네임의 하이픈은 성 경계 메타데이터이며 표시명에서는 숨긴다.
function stripKoreanSurnameBreaks(name) {
  return String(name || '').replace(/(?<=[가-힣])-(?=[가-힣])/g, '');
}

/**
 * API가 라틴 문자 이름의 띄어쓰기 자리에 가운뎃점을 넣어 보내는 경우(예: "Malique·Roberts",
 * "Tiquanny·Williams" — 경기 1639959)가 있어, 라틴 글자 사이의 가운뎃점류(·・‧∙)를 공백으로 바꾼다.
 * 한 단어로 취급돼 포메이션 이름 라벨이 줄바꿈 없이 작은 폰트로 줄어들던 문제 해결. 한글 사이 가운뎃점은 그대로.
 */
function normalizeLatinNameSeparators(name) {
  return String(name || '').replace(/(?<=\p{Script=Latin}|[.'’])\s*[·・‧∙]\s*(?=\p{Script=Latin})/gu, ' ');
}

function getLineupShortName(player) {
  return stripKoreanSurnameBreaks(player?.name || player?.playerName || '');
}

function normalizeLineupInitialBaseName(name) {
  const text = stripKoreanSurnameBreaks(name).trim();
  if (!text) return '';
  const base = stripLeadingLineupInitial(text) || text;
  return String(base || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function hasLeadingLineupInitial(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  return stripLeadingLineupInitial(text) !== text;
}

/**
 * lineupHideInitial=on일 때도 동명이인이 생기면 이니셜을 보존하기 위한 경기 단위 인덱스.
 * 양 팀 선발+교체 전체를 기준으로 "J. Kim" → "Kim" 같은 base 이름을 세어 충돌 여부를 판단한다.
 * 이니셜까지 동일한 경우에는, 줄이지 않고 full name을 그대로 사용한다.
 */
function setLineupInitialCollisionContext(fixtureData) {
  const counts = new Map();
  const shortCounts = new Map();
  const seenPlayerKeys = new Set();

  ['home', 'away'].forEach(side => {
    const lineup = fixtureData?.[`${side}Lineup`];
    ['startXi', 'substitutes'].forEach(group => {
      const players = Array.isArray(lineup?.[group]) ? lineup[group] : [];
      players.forEach((player, idx) => {
        const shortName = getLineupShortName(player);
        const base = normalizeLineupInitialBaseName(shortName);
        if (!base) return;

        const pid = player?.playerId ?? player?.id;
        const playerKey = pid && Number(pid) !== 0
          ? `id:${pid}`
          : `${side}:${group}:${idx}:${shortName}`;
        if (seenPlayerKeys.has(playerKey)) return;
        seenPlayerKeys.add(playerKey);

        counts.set(base, (counts.get(base) || 0) + 1);

        const normShort = String(shortName).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
        if (normShort) shortCounts.set(normShort, (shortCounts.get(normShort) || 0) + 1);
      });
    });
  });

  lineupInitialCollisionBaseNames = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([base]) => base)
  );

  lineupShortNameCollisionNames = new Set(
    Array.from(shortCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  );
}

function shouldKeepLineupInitial(shortName) {
  return hasLeadingLineupInitial(shortName)
    && lineupInitialCollisionBaseNames.has(normalizeLineupInitialBaseName(shortName));
}

/**
 * 선수 표시명 선택 헬퍼.
 * 1) long 모드면 한글 풀네임(nameKoLong/playerNameKoLong) 우선, 없으면 short fallback.
 * 2) short 모드면 표준 short(name/playerName)를 사용.
 * 3) lineup 카테고리에서 short + lineupHideInitial=on이면 앞쪽 이니셜 블록 제거(예: "J. Mateta" → "Mateta").
 *    단, 양 팀 선발+교체 전체에서 이니셜을 제거했을 때 동명이인이 생기면 식별을 위해 이니셜을 유지.
 *    long 모드에선 hideInitial 무시(풀네임 형식이 깨짐).
 */
function pickName(player, category, { preserveSurnameBreaks = false } = {}) {
  if (!player) return '';
  // 포메이션 pill만 원본 경계를 받아 피팅 단계에서 사용한다.
  const display = name => normalizeLatinNameSeparators(preserveSurnameBreaks ? name : stripKoreanSurnameBreaks(name));
  // Iter 6-1: 닉네임 override (player-menu.js가 로드된 경우)
  // 닉네임은 사용자가 자유 입력한 텍스트라 성 경계 하이픈 규칙 대상이 아니다 — 그대로 반환.
  const pid = player.playerId || player.id;
  if (pid && Number(pid) !== 0 && typeof getPlayerNickname === 'function') {
    const nick = getPlayerNickname(pid);
    if (nick) return nick;
  }
  // playerId가 명시적으로 0인 선수만 API 원본 이름 키로 닉네임을 찾는다(감독 등 playerId가 없는 객체는 제외).
  if (player.playerId != null && Number(player.playerId) === 0
    && typeof getPlayerNickname === 'function' && typeof playerNicknameSourceName === 'function') {
    const nick = getPlayerNickname(0, playerNicknameSourceName(player));
    if (nick) return nick;
  }
  const shortName = player.name || player.playerName || '';
  const longName = player.nameKoLong || player.playerNameKoLong || '';
  const shouldHideInitial = category === 'lineup'
    && !isLongName('lineup')
    && getSetting('lineupHideInitial') === 'on';
  const displayShortName = shouldHideInitial && !shouldKeepLineupInitial(shortName)
    ? stripLeadingLineupInitial(shortName) || shortName
    : shortName;
  if (isLongName(category) && longName) return display(longName);
  // 이니셜 포함 shortname도 다른 선수와 동일하면 풀네임으로
  if (longName && (category === 'lineup' || category === 'roster')) {
    const normDisplay = stripKoreanSurnameBreaks(displayShortName).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (normDisplay && lineupShortNameCollisionNames.has(normDisplay)) return display(longName);
  }
  return display(displayShortName || longName || shortName || '');
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
    .replace(/^\s*(?:[^\s.．｡。]+\s*[.．｡。]\s*)+/u, '')
    .trim();
  return stripped || text;
}

/** 설정 팝업 오픈. 사이드바가 열려있으면 먼저 닫고, 백드롭에 .open 추가. 탭 섹션 높이 일괄화도 같이 호출. */
function openSettingsPopup() {
  if (typeof closeSidebar === 'function') closeSidebar();
  const backdrop = document.getElementById('settingsBackdrop');
  if (backdrop) backdrop.classList.add('open');
  syncAllSettingsUi();
  syncSettingsTabSectionHeights();
}

/** 설정 팝업 닫기. 백드롭의 .open 제거만 하면 CSS transition으로 사라짐. */
function closeSettingsPopup() {
  document.getElementById('backgroundPicker')?.close();
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
  if (category === 'statCycleAuto') return { off: 'off', on: 'on' };
  if (category === 'statsAutoSwipe') return { off: 'off', on: 'on' };
  if (ON_OFF_TOGGLE_CATEGORIES.has(category)) {
    return { off: 'off', on: 'on' };
  }
  return { off: 'short', on: 'long' };
}

// 관련 설정을 같은 컴포넌트 예시에 반영합니다.
function syncGroupedSettingExamples() {
  const section = document.querySelector('[data-sp-tab-section="names"]');
  if (!section) return;
  const group = (key, categories) => {
    let box = section.querySelector(`[data-example-group="${key}"]`);
    if (!box) {
      const rows = categories.map(cat => section.querySelector(`input[data-settings-cat="${cat}"]`).closest('.sp-row'));
      box = document.createElement('div');
      box.className = 'sp-example-group';
      box.dataset.exampleGroup = key;
      rows[0].before(box);
      const controls = document.createElement('div');
      controls.className = 'sp-example-controls';
      box.append(controls);
      rows.forEach(row => controls.append(row));
      const preview = document.createElement('div');
      preview.className = 'sp-setting-example';
      box.append(preview);
    }
    return box.querySelector('.sp-setting-example');
  };
  const lineup = group('lineup', ['lineup', 'lineupHideInitial']);
  renderSettingsLiveExample(lineup, 'lineup');
  const notes = group('notes', ['noteShowPenaltyMisses', 'noteShowRedCards']);
  renderSettingsLiveExample(notes, 'notes');
  const cameraSection = document.querySelector('[data-sp-tab-section="lineup"]');
  let camera = cameraSection.querySelector('[data-example-group="camera"]');
  if (!camera) {
    camera = document.createElement('div');
    camera.className = 'sp-example-group';
    camera.dataset.exampleGroup = 'camera';
    const controls = document.createElement('div');
    controls.className = 'sp-example-controls';
    const categories = ['lineupShowGoals', 'lineupShowCards', 'lineupShowRating', 'lineupShowSubTime', 'lineupShowNumber', 'lineupShowOutScorers'];
    const rows = categories.map(cat => cameraSection.querySelector(`input[data-settings-cat="${cat}"]`).closest('.sp-row'));
    rows[0].before(camera);
    rows.forEach(row => controls.append(row));
    const preview = document.createElement('div');
    preview.className = 'sp-setting-example';
    camera.append(controls, preview);
  }
  renderSettingsLiveExample(camera.querySelector('.sp-setting-example'), 'camera');
}

// 별도 문서에서 운영 화면의 CSS와 렌더 함수를 재사용하여 설정 창의 스타일 간섭을 막습니다.
function renderSettingsLiveExample(container, category) {
  if (typeof buildLineupNodePairHtml !== 'function' || typeof evCreateRow !== 'function') return;
  const loadedBoard = category === 'teamName' && !!lineupPanelState.lastFixture?.matchInfo?.fixtureId;
  if (category === 'teamName' && !loadedBoard) {
    container.classList.add('sp-preview-empty');
    container.textContent = '경기를 불러오면 점수판 예시가 표시됩니다.';
    container.dataset.renderSignature = '';
    return;
  }
  container.classList.remove('sp-preview-empty');
  const boardTheme = loadedBoard ? document.querySelector('#fsm-theme-link')?.href : 'fallback-default';
  const nodeKeys = ['lineup', 'lineupHideInitial', 'lineupNode', 'lineupShowNumber', 'lineupShowGoals', 'lineupShowCards', 'lineupShowRating', 'lineupShowSubTime'];
  const keys = {
    lineup: nodeKeys,
    camera: nodeKeys,
    scorer: ['scorer'],
    roster: ['roster', 'benchInjuryNameSize'],
    event: ['event', 'eventNameSize'],
    notes: ['scorer', 'noteShowPenaltyMisses', 'noteShowRedCards', 'noteOwnGoalColor', 'notePenaltyMissColor', 'noteRedCardColor'],
  }[category] || [];
  // 무관한 설정 변경으로 iframe과 높이 측정이 다시 시작되지 않게 합니다.
  const signature = category === 'teamName'
    ? JSON.stringify([category, boardTheme, loadedBoard ? document.querySelector('#board')?.outerHTML : getSetting('teamName')])
    : JSON.stringify([category, ...keys.map(key => getSetting(key)), getSetting('uiMode'), ['lineup', 'camera'].includes(category) ? state?.colors : null]);
  if (container.dataset.renderSignature === signature) return;
  container.dataset.renderSignature = signature;
  let frame = container.querySelector('iframe');
  if (!frame) {
    container.replaceChildren();
    frame = document.createElement('iframe');
    frame.className = 'sp-live-example';
    frame.title = '실제 표시 예시';
    frame.tabIndex = -1;
    container.append(frame);
    // 숨겨진 탭이 열릴 때도 내부 콘텐츠 높이를 다시 측정합니다.
    const observer = new ResizeObserver(() => frame._fitSettingsPreview?.());
    observer.observe(frame);
  }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(el => el.outerHTML).join('');
  const vars = getComputedStyle(document.documentElement);
  const properties = [...vars].filter(key => key.startsWith('--')).map(key => `${key}:${vars.getPropertyValue(key)}`).join(';')
    + ';--lp-name-base-size:12px';
  const player = { name: 'M. 살라', nameKoLong: '모하메드 살라', number: 11, photoUrl: 'resources/imgs/settings-preview-salah.png' };
  const nodeCategories = ['lineup', 'camera'];
  const node = nodeCategories.includes(category);
  let content = '';
  if (node) {
    const events = { goals: [{ time: { elapsed: 23 } }], assists: [{ time: { elapsed: 45 } }], yellow: { time: { elapsed: 38 } }, subIn: { time: { elapsed: 72 } } };
    const pair = buildLineupNodePairHtml(player, null, 'home', { left: 50, top: 38 }, '', { events, rating: 8.2 });
    const pitchHeight = category === 'lineup' ? 90 : 110;
    content = `${category === 'camera' ? '<div class="preview-heading">라인업</div>' : ''}<div class="lp-lineup"><div class="dp-lineup-pitch ${getSetting('lineup') === 'long' ? 'dp-mode-long' : ''}" style="position:relative;height:${pitchHeight}px">${pair.circle}${pair.name}</div></div>`;
  } else if (category === 'roster') {
    content = `<div class="lp-lineup"><div class="dp-list">${lpBuildRosterRowHtml(player, 'bench', 'home')}</div></div>`;
  } else if (category === 'event') {
    const goal = evCreateRow({ type: 'Goal', detail: 'Normal Goal', elapsed: 23, playerName: 'Kh. 크바라츠헬리아', playerNameKoLong: '흐비차 크바라츠헬리아' }, { matchInfo: {} });
    const substitution = evCreateRow({ type: 'subst', elapsed: 72, assistName: 'F. 토레스', assistNameKoLong: '페란 토레스', playerName: 'O. 뎀벨레', playerNameKoLong: '우스만 뎀벨레' }, { matchInfo: {} });
    // 예시는 선수 선택을 수정하지 않으므로 편집 버튼과 점선 밑줄을 제거합니다.
    substitution.querySelectorAll('.ev-subst-name-editable').forEach(button => {
      const name = document.createElement('span');
      name.className = 'ev-text-name';
      name.textContent = button.textContent;
      button.replaceWith(name);
    });
    content = `<div class="preview-events">${goal.outerHTML}${substitution.outerHTML}</div>`;
  } else if (category === 'teamName') {
    const source = document.querySelector('#board');
    if (source) {
      const board = source.cloneNode(true);
      board.classList.remove('fsm-starting');
      content = `<div class="preview-board-stage">${board.outerHTML}</div>`;
    }
  } else content = '<div class="note away"></div>';
  const classes = document.body.className.split(/\s+/).filter(name => !name.startsWith('no-lineup-'));
  for (const [key, suffix] of [['lineupShowGoals', 'goals'], ['lineupShowCards', 'cards'], ['lineupShowRating', 'rating'], ['lineupShowSubTime', 'subtime']]) {
    if (getSetting(key) !== 'on') classes.push(`no-lineup-${suffix}`);
  }
  const noteVars = Object.entries(NOTE_COLOR_VARS).map(([key, name]) => `${name}:${getSetting(key)}`).join(';');
  const updatePreview = async () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    await doc.fonts.ready;
    if (frame.contentDocument !== doc) return;
    if (category === 'camera') {
      const fit = () => {
        const surface = doc.querySelector('.layout-big');
        surface.style.transform = 'none';
        const parts = [...surface.querySelectorAll('.dp-lineup-node, .dp-lineup-name-wrap, .dp-lineup-name, .dp-lineup-name-text, .dp-node-badge, .dp-node-rating')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none')
          .map(el => el.getBoundingClientRect());
        const heading = surface.querySelector('.preview-heading');
        if (heading) {
          const range = doc.createRange();
          range.selectNodeContents(heading);
          parts.push(range.getBoundingClientRect());
        }
        if (!parts.length || !parts.some(rect => rect.width > 0)) return;
        const left = Math.min(...parts.map(rect => rect.left));
        const right = Math.max(...parts.map(rect => rect.right));
        const top = Math.min(...parts.map(rect => rect.top));
        const bottom = Math.max(...parts.map(rect => rect.bottom));
        // 사진·배지·이름표를 같은 비율로 확대하고 실제 내용만 너비에 맞춥니다.
        const scale = Math.min(1.4, (doc.body.clientWidth - 24) / (right - left));
        const x = (doc.body.clientWidth - (right - left) * scale) / 2 - left * scale;
        surface.style.transformOrigin = 'top left';
        surface.style.transform = `translate(${x}px, ${-top * scale}px) scale(${scale})`;
        frame.style.height = `${Math.ceil((bottom - top) * scale) + 8}px`;
      };
      frame._fitSettingsPreview = fit;
      fit();
    }
    const board = doc.querySelector('.preview-board-stage .fsm-board');
    if (board) {
      const fit = () => {
        const stage = board.parentElement;
        // 로고·카드·추가시간처럼 본체 밖으로 나온 자식까지 실제 표시 경계에 포함합니다.
        board.style.transform = 'none';
        const rects = [...board.querySelectorAll('.scoreboard-main, .scoreboard-main *, .scoreboard-timer, .scoreboard-timer *, .pso-status, .pso-status *')]
          .filter(el => {
            const css = getComputedStyle(el);
            return el.getClientRects().length && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0;
          })
          .map(el => el.getBoundingClientRect())
          .filter(rect => rect.width > 0 && rect.height > 0);
        if (!stage.clientWidth || !rects.length || !rects.some(rect => rect.width > 0)) return;
        const left = Math.min(...rects.map(rect => rect.left));
        const right = Math.max(...rects.map(rect => rect.right));
        const top = Math.min(...rects.map(rect => rect.top)) - 2;
        const bottom = Math.max(...rects.map(rect => rect.bottom)) + 2;
        const scale = Math.min(1, stage.clientWidth / (right - left));
        board.style.transform = `translate(${-left * scale}px, ${-top * scale}px) scale(${scale})`;
        const height = Math.ceil((bottom - top) * scale);
        stage.style.height = `${height}px`;
        frame.style.height = `${height + 2}px`;

      };
      fit();
      frame._fitSettingsPreview = fit;
      board.querySelectorAll('img').forEach(img => img.addEventListener('load', fit, { once: true }));
    }
    const events = doc.querySelector('.preview-events');
    if (events) {
      const fit = () => {
        evRefitPanelRows(events);
        frame.style.height = `${Math.ceil(events.getBoundingClientRect().height) + 4}px`;
      };
      fit();
      frame._fitSettingsPreview = fit;
    }
    const note = doc.querySelector('.note');
    let noteLines = [];
    if (note && window.renderScorerPreview) {
      const notePlayer = category === 'notes' ? { name: 'O. 뎀벨레', nameKoLong: '우스만 뎀벨레' } : player;
      const events = [{ side: 'home', type: 'Goal', detail: 'Normal Goal', elapsed: 23, playerName: notePlayer.name, playerNameKoLong: notePlayer.nameKoLong }];
      if (category === 'notes') events.push(
        { side: 'home', type: 'Goal', detail: 'Own Goal', elapsed: 38, playerName: '마르키뉴스', playerNameKoLong: '마르키뉴스' },
        { side: 'home', type: 'Goal', detail: 'Missed Penalty', elapsed: 56, playerName: 'M. 아클리우슈', playerNameKoLong: '마그네스 아클리우슈' },
        { side: 'home', type: 'Card', detail: 'Red Card', elapsed: 72, playerName: 'A. 하키미', playerNameKoLong: '아슈라프 하키미' }
      );
      noteLines = window.buildScorerPreviewText(events).split('\n');
      window.renderScorerPreview(note, noteLines);
    }
    // 행 안의 텍스트를 문서 상단에 붙여 iframe 자체의 빈 높이도 없앱니다.
    const target = note || (category === 'roster' ? doc.querySelector('.dp-item') : null);
    if (target) {
      const fit = () => {
        if (note) window.renderScorerPreview(note, noteLines);
        if (category === 'notes') return;
        const surface = doc.querySelector('.layout-big');
        surface.style.transform = 'none';
        const rect = target.getBoundingClientRect();
        if (!rect.height) return;
        surface.style.transform = `translateY(${-rect.top}px)`;
        frame.style.height = `${Math.ceil(rect.height)}px`;
      };
      frame._fitSettingsPreview = fit;
      fit();
    }
  };
  if (frame.dataset.initialized === 'true' && frame.contentDocument?.querySelector('.layout-big')) {
    const doc = frame.contentDocument;
    if (category === 'teamName') {
      const href = boardTheme;
      const current = doc.getElementById('fsm-theme-link') || doc.querySelector('link[href*="/theme/result_style_"]');
      if (current && current.href !== href) {
        // 새 테마가 준비될 때까지 기존 점수판을 유지해 글자와 배경 테마가 섞이지 않게 합니다.
        const pending = doc.querySelector('link[data-preview-theme-pending]');
        if (pending?.href === href) return;
        pending?.remove();
        const next = doc.createElement('link');
        next.rel = 'stylesheet';
        next.href = href;
        next.media = 'not all';
        next.dataset.previewThemePending = '';
        next.onload = () => {
          if (!next.isConnected) return;
          current.replaceWith(next);
          next.id = 'fsm-theme-link';
          next.media = 'all';
          delete next.dataset.previewThemePending;
          container.dataset.renderSignature = '';
          renderSettingsLiveExample(container, category);
        };
        doc.head.append(next);
        return;
      }
    }
    doc.documentElement.style.cssText = `${properties};${noteVars}`;
    doc.body.style.cssText = noteVars;
    doc.body.className = classes.join(' ');
    doc.querySelector('.layout-big').style.transform = 'none';
    doc.querySelector('.layout-big').innerHTML = content;
    updatePreview();
    return;
  }
  frame.onload = () => {
    frame.dataset.initialized = 'true';
    // 내용 갱신 때마다 리스너를 추가하지 않고 최신 피팅 함수로 전달합니다.
    frame.contentWindow.addEventListener('resize', () => frame._fitSettingsPreview?.());
    updatePreview();
  };
  frame.style.height = node ? (category === 'lineup' ? '90px' : '130px') : category === 'notes' ? '92px' : ['roster', 'scorer'].includes(category) ? '34px' : category === 'event' ? '58px' : '90px';
  frame.srcdoc = `<!doctype html><html class="preview-${category}" style="${properties};${noteVars}"><head><base href="${document.baseURI}">${styles}<style>html,body{margin:0!important;padding:0!important;min-width:0!important;min-height:0!important;width:100%!important;height:auto!important;background:transparent!important;overflow:hidden!important;zoom:1!important;transform:none!important}body{display:block;pointer-events:none}body::before{display:none!important}.layout-big{display:block!important;min-height:0!important;height:auto!important;background:transparent!important}.lp-lineup{width:100%!important;height:110px!important;min-height:0!important;display:block!important;background:transparent!important;border:0!important;box-shadow:none!important;aspect-ratio:auto!important}.preview-heading{font-size:10px;color:var(--muted);text-align:center;padding:8px 0 0}.note{position:relative!important;inset:auto!important;transform:none!important;font-size:12px!important;text-align:center!important;padding:8px 4px!important}.preview-notes,.preview-notes body{height:100%!important}.preview-notes .layout-big{height:100%!important;display:flex!important;align-items:center;justify-content:center}.preview-notes .note{padding:0!important}.ev-row{margin:0}.dp-item{margin:0}.preview-roster .dp-item{width:max-content;max-width:100%;margin-inline:auto}.preview-events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.preview-events .ev-row{min-width:0}.preview-board-stage{position:relative;width:100%;overflow:hidden}.preview-board-stage .fsm-board{position:absolute!important;inset:0 auto auto 0!important;margin:0!important;transform-origin:top left!important;visibility:visible!important}@media(max-width:480px){.preview-events{grid-template-columns:1fr}}</style></head><body style="${noteVars}" class="${classes.join(' ')}"><div class="layout-big">${content}</div></body></html>`;
}

function syncSettingExample(input) {
  const category = input.dataset.settingsCat;
  const names = ['scorer', 'roster', 'event', 'teamName'];
  if (!names.includes(category)) return;
  const row = input.closest('.sp-row');
  if (!row || !row.closest('[data-sp-tab-section]')) return;
  row.classList.add('sp-row-with-example');
  row.classList.toggle('sp-example-below', category === 'event' || category === 'teamName');
  let example = row.querySelector('.sp-setting-example');
  if (!example) {
    example = document.createElement('div');
    example.className = 'sp-setting-example';
    row.append(example);
  }
  renderSettingsLiveExample(example, category);
}

function syncSwitchUi(category) {
  syncGroupedSettingExamples();
  const value = getSetting(category);
  const { off, on } = getSwitchSides(category);
  // 일반 설정과 테마 탭에 있는 같은 옵션을 함께 동기화합니다.
  document.querySelectorAll(`input[data-settings-cat="${category}"]`).forEach(input => {
    input.checked = value === on;
    syncSettingExample(input);

    const cluster = input.closest('.sp-toggle-cluster');
    if (!cluster) return;

    const offEl = cluster.querySelector(`[data-side="${off}"]`);
    const onEl = cluster.querySelector(`[data-side="${on}"]`);
    if (offEl) offEl.classList.toggle('is-active', value === off);
    if (onEl) onEl.classList.toggle('is-active', value === on);
  });
  if (category === 'statCycleAuto' || category === 'statsAutoSwipe') {
    syncStatsAutoSwipeLockUi();
  }
}

/** statCycleAuto ON일 때 statsAutoSwipe 토글을 비활성화 + ON 고정하고 잠금 안내 문구를 표시. */
function syncStatsAutoSwipeLockUi() {
  const input = document.querySelector('input[data-settings-cat="statsAutoSwipe"]');
  if (!input) return;
  const locked = getSetting('statCycleAuto') === 'on';
  const cluster = input.closest('.sp-toggle-cluster');
  const note = document.querySelector('[data-stats-auto-swipe-lock]');
  input.disabled = locked;
  if (locked) {
    input.checked = true;
    cluster?.querySelector('[data-side="off"]')?.classList.remove('is-active');
    cluster?.querySelector('[data-side="on"]')?.classList.add('is-active');
  }
  cluster?.classList.toggle('is-locked', locked);
  if (note) note.hidden = !locked;
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
 * 4) 가장 긴 탭이 모달에 실제로 들어갈 수 있는 높이(availableHeight)보다 크면, 그 탭은 원래도
 *    스크롤이 필요한 게 맞으므로 그대로 두되 — 다른 짧은 탭들까지 그 큰 값으로 minHeight를
 *    맞추면 짧은 탭에도 필요 없는 스크롤이 생긴다. 그래서 적용할 minHeight는
 *    min(가장 큰 섹션 높이, availableHeight)로 상한을 둔다 — 짧은 탭은 모달이 허용하는
 *    한도까지만 채워지고(스크롤 없음), 정말 긴 탭만 그 한도를 넘겨 자체적으로 스크롤된다.
 */
function syncSettingsTabSectionHeights() {
  const modal = document.querySelector('.sp-modal');
  const header = document.querySelector('.sp-header');
  const tabs = document.querySelector('.sp-tabs');
  const body = document.querySelector('.sp-body');
  const sections = Array.from(document.querySelectorAll('[data-sp-tab-section]'));
  if (!modal || !body || !sections.length) return;

  // 1) 측정용 width — sp-body의 content area 폭 (padding 제외).
  const bodyRect = body.getBoundingClientRect();
  const bodyStyles = getComputedStyle(body);
  const bodyPaddingV = (parseFloat(bodyStyles.paddingTop) || 0) + (parseFloat(bodyStyles.paddingBottom) || 0);
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
  if (!maxHeight) return;

  // 4) 모달이 실제로 허용하는 섹션 높이 상한 계산 (모달 max-height - 헤더 - 탭바 - body padding).
  // 이 페이지 전체가 body에 걸린 transform:scale(--display-transform)로 화면에 맞춰 축소/확대되므로
  // (js/core/display-scale.js), getBoundingClientRect()는 축소된 실제 화면 px를 반환해
  // getComputedStyle().maxHeight(축소 전 논리 px)와 단위가 어긋난다. offsetHeight/clientHeight 같은
  // 레이아웃 박스 속성은 transform 영향을 받지 않는 논리 px 값이라 이쪽으로 통일해야 한다.
  const modalMaxHeight = parseFloat(getComputedStyle(modal).maxHeight) || 0;
  const headerHeight = header ? header.offsetHeight : 0;
  const tabsMarginBottom = tabs ? (parseFloat(getComputedStyle(tabs).marginBottom) || 0) : 0;
  const tabsHeight = tabs ? tabs.offsetHeight + tabsMarginBottom : 0;
  // 서브픽셀 반올림 오차로 1px 안팎 넘치는 것까지 스크롤바를 만들지 않도록 여유분을 조금 둔다.
  const roundingBuffer = 2;
  const availableHeight = modalMaxHeight > 0
    ? Math.max(0, modalMaxHeight - headerHeight - tabsHeight - bodyPaddingV - roundingBuffer)
    : maxHeight;
  const appliedHeight = Math.min(maxHeight, availableHeight);

  sections.forEach(section => {
    section.style.minHeight = `${appliedHeight}px`;
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
  document.querySelectorAll('.fan-reaction-close').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (setSetting('fanReaction', 'off')) {
        showToast('팬 반응 칼럼은 설정 → 패널/스탯 → 카메라 뷰 패널 표시 → 팬 반응 ON 을 통해 다시 켤 수 있습니다.');
      }
    });
  });
  // 경기 갱신과 팀명 설정 변경이 실제 점수판에 반영된 다음 미리보기도 따라갑니다.
  let previewFrame = 0;
  const refreshBoardPreview = () => {
    if (previewFrame || !isSettingsOpen()) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      const container = document.querySelector('.sp-row:has([data-settings-cat="teamName"]) .sp-setting-example');
      if (container) renderSettingsLiveExample(container, 'teamName');
    });
  };
  const board = document.querySelector('#board');
  if (board) new MutationObserver(refreshBoardPreview).observe(board, { subtree: true, childList: true, attributes: true, characterData: true });
  new MutationObserver(refreshBoardPreview).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  document.getElementById('settingsBgPresetOpen')?.addEventListener('click', openBackgroundPicker);
  document.getElementById('settingsBgPresetClear')?.addEventListener('click', () => commitBackgroundImage({ source: 'preset', preset: 'off', src: '' }));
  initSettingsColorEditors();
  document.querySelectorAll('[data-note-colors-reset]').forEach(button => {
    button.addEventListener('click', () => Object.keys(NOTE_COLOR_VARS).forEach(category => setSetting(category, SETTINGS_DEFAULTS[category])));
  });
  document.getElementById('panelColorPreset')?.addEventListener('change', event => {
    const value = event.currentTarget.value;
    if (value === 'custom') {
      const editor = document.querySelector('[data-color-editor="panelColor"]');
      const input = editor.querySelector('[data-color-hex]');
      (input.hidden ? editor.querySelector('[data-color-channel]') : input).focus();
    } else setSetting('panelColor', value);
  });
  // loadSettings는 모듈 로드 시 이미 한 번 실행됨 (아래 즉시 호출). 여기서는 UI 와이어업만.
  const gearBtn = document.getElementById('settingsGearBtn');
  const closeBtn = document.getElementById('settingsCloseBtn');
  const backdrop = document.getElementById('settingsBackdrop');
  const settingsResetBtn = document.getElementById('settingsResetBtn');
  const cacheResetBtn = document.getElementById('cacheResetBtn');
  const layoutResetBtn = document.getElementById('layoutResetBtn');
  const currentFixtureManualResetBtn = document.getElementById('currentFixtureManualResetBtn');
  const ratingColorsResetBtn = document.getElementById('ratingColorsResetBtn');

  initSettingsTabs();
  syncSettingsTabSectionHeights();

  window.addEventListener('resize', () => {
    syncSettingsTabSectionHeights();
  });

  if (gearBtn) gearBtn.addEventListener('click', () => {
    if (typeof popoutModeEnabled === 'function' && popoutModeEnabled()) {
      window.Popout.open('settings', {});
      return;
    }
    openSettingsPopup();
  });
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
    // 설정창에서는 각 슬라이더의 항목만 기본값으로 되돌린다.
    if (input.closest('#settingsBackdrop, #tactics-topbar')) {
      const isTactics = !!input.closest('#tactics-topbar');
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = isTactics ? 'td-slider-reset' : 'sp-slider-reset';
      reset.dataset.settingsSliderReset = category;
      if (isTactics) {
        reset.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 5.5A5 5 0 1 1 3 10M3 2v4h4"/></svg>';
      } else reset.textContent = '초기화';
      const label = input.closest('.sp-row')?.querySelector('.sp-label-main')?.textContent
        || input.parentElement.querySelector('.td-alpha-label')?.textContent || category;
      reset.setAttribute('aria-label', `${label} 초기화`);
      reset.title = `${label} 초기화`;
      reset.addEventListener('click', () => {
        if (PANEL_FONT_SETTINGS.includes(category) || category === 'lineupTokenScale') resetPanelFontSetting(category);
        else if (['panelAlpha', 'pitchAlpha', 'tacticsAlpha'].includes(category)) resetTransparencySetting(category);
        else setSetting(category, SETTINGS_DEFAULTS[category]);
      });
      input.parentElement.append(reset);
    }
    syncSliderUi(category);
    if (['panelAlpha', 'pitchAlpha', 'tacticsAlpha'].includes(category)) {
      bindTransparencySlider(input, category, input.closest('.sp-slider-cluster')?.querySelector('.sp-slider-value'));
      return;
    }
    if (category === 'tacticsTopbarScale' || category === 'tacticsDrawtoolsScale') {
      // 드래그 중 UI가 확대되면 슬라이더 위치도 이동하므로 놓을 때만 적용한다.
      input.addEventListener('input', () => {
        const label = document.querySelector(`[data-settings-slider-value="${category}"]`);
        if (label) label.textContent = `${input.value}%`;
      });
      input.addEventListener('change', () => {
        setSetting(category, Number(input.value));
      });
      return;
    }
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

  // 숫자 input 옆 +/- 스텝 버튼. 같은 sp-num-cluster 안의 input을 찾아 step만큼 가감 후 min/max로 clamp.
  document.querySelectorAll('.sp-num-step-btn').forEach(btn => {
    const input = btn.closest('.sp-num-cluster')?.querySelector('input[data-settings-number]');
    if (!input) return;
    const category = input.dataset.settingsNumber;
    const step = Number(input.step) || 0.5;
    const min = Number(input.min);
    const max = Number(input.max);
    const dir = Number(btn.dataset.numStep) || 1;
    btn.addEventListener('click', () => {
      const current = Number(getSetting(category));
      let next = (Number.isFinite(current) ? current : min) + dir * step;
      // 부동소수 누적 오차(0.1+0.2 같은) 방지 — step 단위 소수점 자리수로 고정.
      const decimals = (String(step).split('.')[1] || '').length;
      next = Number(next.toFixed(decimals));
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      setSetting(category, next);
      syncNumberUi(category);
    });
  });

  // 색상 input (평점 색상 등). 드래그 중에는 setSetting을 호출하지 않고 change에서만 commit
  // — theme.js의 색상 lag 방지 패턴과 동일. setSetting 자체에서 settings:change 이벤트가
  // 발행되므로 라인업 패널이 알아서 재렌더한다.
  document.querySelectorAll('input[data-settings-color]').forEach(input => {
    const category = input.dataset.settingsColor;
    syncColorUi(category);
    input.addEventListener('input', () => previewSettingsColor(category, input.value));
    // input은 색상 속성만 미리보기하고 change에서 저장·전체 갱신을 확정합니다.
    input.addEventListener('change', () => {
      const v = String(input.value || '').toLowerCase();
      if (HEX_COLOR_RE.test(v)) {
        if (category === 'bgColor') commitBackgroundColor(v);
        else setSetting(category, v);
      }
    });
  });

  // 텍스트 input (배경 이미지 URL 등). change(blur 시)에 commit.
  document.querySelectorAll('input[data-settings-text]').forEach(input => {
    const category = input.dataset.settingsText;
    syncTextUi(category);
    input.addEventListener('change', () => {
      const rawValue = String(input.value || '').trim();
      if (category === 'bgColor') {
        if (HEX_COLOR_RE.test(rawValue)) commitBackgroundColor(rawValue.toLowerCase());
        syncTextUi(category);
        return;
      }
      if (category === 'bgImageUrl'
        && rawValue
        && isLikelyLocalFilePath(rawValue)
        && window.location.protocol !== 'file:'
        && typeof showToast === 'function') {
        showToast('로컬 파일 경로는 여기서 안 열릴 수 있습니다. 이미지 URL을 사용하세요.');
      }
      const nextValue = category === 'bgImageUrl'
        ? normalizeBackgroundImageUrl(rawValue)
        : rawValue;
      setSetting(category, nextValue);
    });
  });

  document.getElementById('settingsBgColorFormat')?.addEventListener('click', event => {
    const input = document.querySelector('input[data-settings-text="bgColor"]');
    if (!input) return;
    const useRgb = input.dataset.colorFormat !== 'rgb';
    input.dataset.colorFormat = useRgb ? 'rgb' : 'hex';
    input.hidden = useRgb;
    document.getElementById('settingsBgRgb').hidden = !useRgb;
    const label = useRgb ? 'HEX 입력으로 전환' : 'RGB 입력으로 전환';
    event.currentTarget.setAttribute('aria-label', label);
    event.currentTarget.title = label;
    syncTextUi('bgColor');
    (useRgb ? document.querySelector('input[data-bg-rgb="0"]') : input).focus();
  });

  document.querySelectorAll('input[data-bg-rgb]').forEach(input => {
    const commit = (recommendGreenscreen = false) => {
      const inputs = [...document.querySelectorAll('input[data-bg-rgb]')];
      if (inputs.some(channel => channel.value === '' || !channel.validity.valid)) return false;
      const channels = inputs.map(channel => Number(channel.value));
      return commitBackgroundColor('#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join(''), recommendGreenscreen);
    };
    input.addEventListener('input', () => commit(false));
    input.addEventListener('change', () => { if (!commit(true)) syncTextUi('bgColor'); });
  });

  // select 드롭다운 (greenscreenIntensity 등). change에 즉시 commit.
  document.querySelectorAll('select[data-settings-select]').forEach(select => {
    const category = select.dataset.settingsSelect;
    syncSelectUi(category);
    select.addEventListener('change', () => {
      setSetting(category, String(select.value || ''));
    });
  });

  document.querySelectorAll('[data-bg-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.bgClear;
      if (kind === 'color') {
        // 현재 모드의 기본 단색으로 복귀한다.
        setSetting('bgColor', SETTINGS_DEFAULTS[getSetting('uiMode') === 'light' ? 'lightBgColor' : 'bgColor']);
      }
    });
  });

  if (ratingColorsResetBtn) {
    ratingColorsResetBtn.addEventListener('click', resetRatingColorsToDefaults);
  }
  document.getElementById('matchInfoLabelColorResetBtn')?.addEventListener('click', () => {
    setSetting('matchInfoLabelColor', SETTINGS_DEFAULTS.matchInfoLabelColor);
  });
  document.getElementById('panelColorResetBtn')?.addEventListener('click', () => {
    setSetting('panelColor', SETTINGS_DEFAULTS.panelColor);
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

  if (layoutResetBtn) {
    layoutResetBtn.addEventListener('click', () => {
      if (!confirm('드래그로 조정한 패널 크기를 모두 기본값으로 되돌릴까요?')) return;
      if (typeof window.resetAllLayoutSizes === 'function') {
        window.resetAllLayoutSizes();
        if (typeof showToast === 'function') showToast('패널 크기를 초기화했습니다');
      }
    });
  }

  if (currentFixtureManualResetBtn) {
    currentFixtureManualResetBtn.addEventListener('click', () => {
      const fixtureId = typeof getActiveFixtureId === 'function' ? getActiveFixtureId() : null;
      if (!fixtureId) {
        if (typeof showToast === 'function') showToast('표시 중인 경기가 없습니다');
        return;
      }

      const options = {
        lineup: !!document.getElementById('mrResetLineup')?.checked,
        bench: !!document.getElementById('mrResetBench')?.checked,
        injuries: !!document.getElementById('mrResetInjuries')?.checked,
        coachName: !!document.getElementById('mrResetCoach')?.checked,
        referee: !!document.getElementById('mrResetReferee')?.checked,
        venue: !!document.getElementById('mrResetVenue')?.checked,
      };
      if (!Object.values(options).some(Boolean)) {
        if (typeof showToast === 'function') showToast('지울 항목을 하나 이상 켜두세요');
        return;
      }
      if (!confirm('켜둔 항목의 수동 입력을 지우고 API 원본 데이터로 되돌릴까요? (다른 경기나 선수 ID·닉네임 연결은 유지됩니다)')) return;

      const cleared = typeof clearManualEntryFields === 'function' ? clearManualEntryFields(fixtureId, options) : false;
      if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
      if (typeof showToast === 'function') {
        showToast(cleared ? '선택한 항목을 초기화했습니다' : '이 경기에는 지울 수동 입력이 없습니다');
      }
    });
  }
}

// 스크립트 로드 시 즉시 settingsState를 채워둔다. fixture.js가 sessionStorage에서 데이터
// 복원할 때 getSetting('teamLogo') 등을 참조하기 때문에, 그 호출 이전에 settingsState가
// 준비돼있어야 저장된 값(예: 협회 로고 토글 상태)이 반영된다.
loadSettings();
applyUiMode();

document.addEventListener('DOMContentLoaded', initSettingsPopup);
