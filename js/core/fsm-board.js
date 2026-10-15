/** selector에 맞는 노드(index를 주면 그 하나만)에 인라인 스타일 객체를 적용한다. */
function setFsmStyle(selector, styles, index) {
  const nodes = document.querySelectorAll(selector);
  (index == null ? Array.from(nodes) : [nodes[index]]).filter(Boolean).forEach(node => Object.assign(node.style, styles));
}
/** selector에 맞는 모든 노드의 텍스트를 바꾼다. null/undefined는 빈 문자열. */
function setFsmText(selector, value) {
  document.querySelectorAll(selector).forEach(node => { node.textContent = value ?? ''; });
}
/** selector에 맞는 모든 노드의 속성을 설정한다. 값이 비어 있으면 속성을 제거한다. */
function setFsmAttr(selector, name, value) {
  document.querySelectorAll(selector).forEach(node => {
    if (value) node.setAttribute(name, value); else node.removeAttribute(name);
  });
}
const LEAGUE_THEME_MAP = {
  39:  { theme: 'pl',      logoUrl: 'https://indvel.github.io/utils/fsm/logos/EPL/premierleague-1536x1536.png', type: 'club' },
  40: { theme: 'eflchampionship', logoUrl: null, type: 'club' },
  41: { theme: 'eflleagueone', logoUrl: null, type: 'club' },
  42: { theme: 'eflleaguetwo', logoUrl: null, type: 'club' },
  43: { theme: 'nationalleague', logoUrl: null, type: 'club' },
  50: { theme: 'nationalleague', logoUrl: null, type: 'club' },
  51: { theme: 'nationalleague', logoUrl: null, type: 'club' },
  984: { theme: 'nationalleague', logoUrl: null, type: 'club' },
  985: { theme: 'nationalleague', logoUrl: null, type: 'club' },
  45:  { theme: 'facup', logoUrl: "https://indvel.github.io/utils/fsm/logos/Cups/emirates-fa-cup-logo-trophy.svg", type: 'club' }, // FA컵
  137: { theme: 'coppaitalia', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CoppaItalia.svg', type: 'club' },
  135: { theme: 'seriea',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/SerieA/Serie_A_symbol_stroke.svg', type: 'club' },
  140: { theme: 'laliga', logoUrl: 'https://indvel.github.io/utils/fsm/logos/Laliga/LL_RGB_white.png', type: 'club' }, // 라리가
  141: { theme: 'laliga2', logoUrl: 'https://indvel.github.io/utils/fsm/logos/Laliga/LL_RGB_white.png', type: 'club' }, // 라리가 2
  78: { theme: 'bundes', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Bundesliga.svg', type: 'club' }, // 분데스리가
  79: { theme: 'bundes2', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Bundesliga2.svg', type: 'club' }, // 분데스리가 2
  66: { theme: 'coupedefrance', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CoupeDeFrance.svg', type: 'club' },
  61:  { theme: 'ligue1',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/Ligue1/france_ligue-1-logos.svg', type: 'club' },
  62:  { theme: 'ligue2',  logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Ligue2Black.svg', type: 'club' },  // 프랑스 리그2 — 추후 logoUrl에 전용 로고 URL 지정
  94: { theme: 'ligaportugal', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/PrimeiraLiga.png', type: 'club' },
  88: { theme: 'eredivisie', logoUrl: null, type: 'club' },
  144: { theme: 'belgian', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/BelgianProLeague.svg', type: 'club' },
  203: { theme: 'superlig', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TurkishSuperLig.svg', type: 'club' },
  204: { theme: 'tff1lig', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TFF1Lig.svg', type: 'club' },
  206: { theme: 'turkishcup', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/TurkishCup.svg', type: 'club' },
  235: { theme: 'rpl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RPL.svg', type: 'club' },  // Russian Premier League - API logo
  236: { theme: 'fnl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianFirstLeague.svg', type: 'club' },
  1025: { theme: 'fnl2a', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueA.svg', type: 'club' },
  1026: { theme: 'fnl2a', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueA.svg', type: 'club' },
  651: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  652: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  650: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  653: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  237: { theme: 'russiancup', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/KubokRossii.png', type: 'club' },
  345: { theme: 'czech', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CzechFirstLeagueTransparent.svg', type: 'club' },
  106: { theme: 'ekstraklasa', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Ekstraklasa.svg', type: 'club' },
  119: { theme: 'danish', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/DanishSuperliga.svg', type: 'club' },
  283: { theme: 'romanian', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RomaniaLigaICup.svg', type: 'club' },
  342: { theme: 'armenian', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ArmenianPremierLeague.svg', type: 'club' },
  116: { theme: 'belarus', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/BelarusianPremierLeague.svg', type: 'club' },
  2:   { theme: 'cl',      logoUrl: null, type: 'club' },  // UEFA 챔피언스리그
  3:   { theme: 'uel',     logoUrl: null, type: 'club' },  // UEFA 유로파리그
  848: { theme: 'uecl',    logoUrl: null, type: 'club' },  // UEFA 컨퍼런스 리그
  17:  { theme: 'acle',    logoUrl: null, type: 'club' },  // AFC 챔피언스리그 엘리트
  18:  { theme: 'acl2',   logoUrl: null, type: 'club' },  // AFC 챔피언스리그 2
  1132: { theme: 'acgl', logoUrl: null, type: 'club' },  // AFC 챌린지 리그
  536: { theme: 'cnl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ConcacafNationsLeagueCup.svg', type: 'national' },
  5:   { theme: 'unl',     logoUrl: null, type: 'national' },  // UEFA 네이션스리그
  4:   { theme: 'er24',    logoUrl: null, type: 'national' },  // UEFA 유로 2024
  16: { theme: 'concacafcc', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ConcacafChampionsCupCrop.svg', type: 'club' },
  12: { theme: 'cafcl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CafChampionsLeague.svg', type: 'club' },
  20: { theme: 'cafcc', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CafConfederationCup.png', type: 'club' },
  541: { theme: 'recopa', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RecopaSudamericana.png', type: 'club' },
  11: { theme: 'sudamericana', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CopaSudamericana.svg', type: 'club' },
  13: { theme: 'libertadores', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/CopaLibertadores.svg', type: 'club' },
  188: { theme: 'aleague', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ALeagueMen.svg', type: 'club' },
  169: { theme: 'chinesesuperleague', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/ChineseSuperLeague.svg', type: 'club' },
  71: { theme: 'brazilseriea', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/BrazilSerieA.svg', type: 'club' },
  504: { theme: 'saudikingscup', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/SaudiKingsCup.png', type: 'club' },
  307: { theme: 'saudi', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/SaudiProLeague.svg', type: 'club' },
  369: { theme: 'uzbek', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/UzbekSuperLeague.svg', type: 'club' },
  292: { theme: 'kleague', logoUrl: null, type: 'club' },  // K리그 1
  293: { theme: 'kleague', logoUrl: null, type: 'club' },  // K리그 2
  294: { theme: 'kleague', logoUrl: null, type: 'club' },  // 코리아컵 - 추후 따로 만들기
  295: { theme: 'kleague', logoUrl: null, type: 'club' },  // K3리그
  48:  { theme: 'carabao', logoUrl: "https://indvel.github.io/utils/fsm/logos/Cups/EFL_Carabao_Cup_without_back.svg", type: 'club' }, // EFL컵(카라바오컵)
  100: { theme: 'jleague', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/JLeague.svg', type: 'club' },
  99: { theme: 'jleague', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/JLeague.svg', type: 'club' },
  98: { theme: 'jleague', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/JLeague.svg', type: 'club' },
  253: { theme: 'mls', logoUrl: null, type: 'club' },
  1166:{ theme: 'cwc25',   logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2025FIFACWC.svg', type: 'club' },
  1:   { theme: 'wc26', logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2026FIFAWorldCup_white.svg', type: 'national' }
  // 리그 추가 시 여기에만 한 줄 추가
};
const FSM_FALLBACK_THEME = 'default';  // 친선경기 포함 매핑 없는 모든 리그
const FSM_FALLBACK_TYPE = 'club';
const FSM_THEMES = Object.freeze({
  default: '기본',
  //잉글랜드
  pl: '프리미어 리그', eflchampionship: 'EFL 챔피언십', eflleagueone: 'EFL 리그 원', eflleaguetwo: 'EFL 리그 투', nationalleague: '내셔널리그', facup: 'FA 컵', carabao: 'EFL 컵',
  //UEFA 계수 2,3위
  seriea: '세리에 A', coppaitalia: '코파 이탈리아', laliga: '라리가', laliga2: '세군다 디비시온',
  //UEFA 계수 4,5위
  bundes: '분데스리가', bundes2: '2. 분데스리가', ligue1: '리그 1', ligue2: '리그 2', coupedefrance: '쿠프 드 프랑스',
  //UEFA 계수 6~9위
  ligaportugal: '프리메이라리가', eredivisie: '에레디비시', belgian: '벨기에 프로 리그', superlig: '튀르키예 쉬페르리그', tff1lig: 'TFF 1. 리그', turkishcup: '튀르키예 쿠파스',
  //러시아
  rpl: '러시아 프리미어 리그', fnl: '러시아 퍼스트 리그', fnl2a: '러시아 세컨드리그 A', fnl2b: '러시아 세컨드리그 B', russiancup: '러시아 컵',
  //기타 유럽 리그 (가능하면 UEFA 남자 국가 계수 순)
  czech: '체코 퍼스트 리그', ekstraklasa: '엑스트라클라사', danish: '덴마크 수페르리가', romanian: '루마니아 리가 I', belarus: '벨라루스 프리미어 리그', armenian: '아르메니아 프리미어 리그',
  //유럽 대항전
  cl: 'UEFA 챔피언스 리그',  uel: 'UEFA 유로파 리그', uecl: 'UEFA 컨퍼런스 리그', unl: 'UEFA 네이션스리그', er24: '유로',
  //아시아 리그
  kleague: 'K리그', saudi: '사우디 프로 리그', saudikingscup: '사우디 국왕컵', jleague: 'J리그', aleague: 'A리그 남자부', chinesesuperleague: '중국 슈퍼리그', uzbek: '우즈베키스탄 슈퍼 리그',
  //아시아 대항전
  acle: 'AFC 챔피언스리그 엘리트', acl2: 'AFC 챔피언스리그 2', acgl: 'AFC 챌린지 리그',
  //북중미
  mls: 'MLS', concacafcc: 'CONCACAF 챔피언스 컵', cnl: 'CONCACAF 네이션스리그',
  //남미
  brazilseriea: '브라질 세리 A', libertadores: '코파 리베르타도레스', sudamericana: '코파 수다메리카나', recopa: '레코파 수다메리카나',
  //아프리카
  cafcl: 'CAF 챔피언스리그', cafcc: 'CAF 컨페더레이션 컵',
  //오세아니아 + 세계
  wc26: '월드컵',
});

// 기존 컵 테마와 홈·원정 합산 승강 플레이오프가 있는 리그만 허용합니다.
// 리그별 확인 근거와 시즌 예외는 about.md의 합계 점수 안내를 참고합니다.
const FSM_AGGREGATE_THEMES = Object.freeze([
  'default', 'cl', 'uel', 'uecl', 'acle', 'acl2', 'acgl', 'russiancup', 'tff1lig', 'turkishcup',
  'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'nationalleague', 'laliga2',
  'bundes', 'bundes2', 'ligue1', 'ligue2', 'ligaportugal', 'eredivisie',
  'rpl', 'fnl', 'fnl2a', 'czech', 'romanian', 'belarus', 'kleague', 'jleague', 'unl', 'cnl', 'aleague', 'uzbek', 'saudi', 'chinesesuperleague', 'saudikingscup', 'brazilseriea',
  'libertadores', 'sudamericana', 'recopa', 'cafcl', 'cafcc', 'concacafcc', 'facup', 'carabao', 'coppaitalia', 'coupedefrance'
]);

/** 테마 선택 목록을 초기화하고 선택 변경을 저장 상태와 점수판에 반영합니다. */
function initFsmThemeSelect() {
  const select = document.getElementById('fsmThemeSelect');
  if (!select) return;
  if (!Object.hasOwn(FSM_THEMES, state.fsmTheme)) state.fsmTheme = 'auto';
  select.replaceChildren(...Object.entries({auto: '경기에 맞춰 자동', ...FSM_THEMES})
    .map(([value, label]) => new Option(label, value)));
  select.value = state.fsmTheme;
  select.addEventListener('change', () => {
    state.fsmTheme = select.value;
    window.autoApplyTemplateByLeagueId(state.leagueId, state.leagueLogoUrl);
    render();
    persist();
  });
}
/**
 * 사용 가능한 테마를 순환 선택하고 전환 완료 후 선택한 테마를 안내합니다.
 * @param {number} direction 이전 테마는 -1, 다음 테마는 1입니다.
 */
function cycleFsmTheme(direction) {
  const select = document.getElementById('fsmThemeSelect');
  const options = Array.from(select?.options || []).filter(option => !option.disabled);
  if (!options.length) return;
  const index = options.findIndex(option => option.value === state.fsmTheme);
  const next = options[((index < 0 ? 0 : index) + direction + options.length) % options.length];
  select.value = next.value;
  select.dispatchEvent(new Event('change'));
  const notify = () => {
    if (state.fsmTheme === next.value) showToast(`점수판 변경: ${next.textContent}`);
  };
  const link = pendingThemeLink;
  if (link) {
    link.addEventListener('load', () => {
      if (oldlink === link) notify();
    }, { once: true });
  } else {
    notify();
  }
}
const CSS_LINK_INDEX = 17;
var _currentTheme = 'default';
var _currentType = 'club';
var _timerMargin = 'none';

/**
 * 수동 테마 선택을 우선하고, 자동 모드에서는 리그 매핑에 따라 테마와 로고를 적용합니다.
 * @param {number|null} leagueId 경기의 리그 ID입니다.
 * @param {string|null} apiLeagueLogoUrl 매핑에 로고가 없을 때 사용할 API 로고 URL입니다.
 */
window.autoApplyTemplateByLeagueId = function(leagueId, apiLeagueLogoUrl) {
  const selectedTheme = Object.hasOwn(FSM_THEMES, state.fsmTheme) ? state.fsmTheme : null;
  const entry = selectedTheme
    ? Object.values(LEAGUE_THEME_MAP).find(entry => entry.theme === selectedTheme)
    : LEAGUE_THEME_MAP[leagueId];
  const theme = selectedTheme || (entry ? entry.theme : FSM_FALLBACK_THEME);
  const type = entry ? entry.type : FSM_FALLBACK_TYPE;
  // 지정 대회 로고를 우선하고, 등록된 로고가 없으면 API 응답 URL을 사용한다.
  const logoUrl = entry?.logoUrl || apiLeagueLogoUrl || null;

  _currentType = type;
  // FSM의 기존 switch 로직을 그대로 재활용
  applyTheme(theme, logoUrl);
};

var oldlink = document.getElementById('fsm-theme-link');
var pendingThemeLink = null;
var fsmEntranceEndListener = null;
var fsmInitialStateReady = false;

/** 초기 상태 준비와 테마 로딩이 완료된 점수판의 등장 효과를 다시 시작합니다. */
window.replayFsmBoardEntrance = function() {
  const board = document.querySelector('.fsm-board');
  // 다른 테마로 바뀌는 경우에는 기존 테마 전환을 유지합니다.
  if (!board || pendingThemeLink || !fsmInitialStateReady) return;
  if (fsmEntranceEndListener) {
    board.removeEventListener('animationend', fsmEntranceEndListener);
    fsmEntranceEndListener = null;
  }
  board.classList.remove('fsm-entering');
  board.classList.add('fsm-starting');
  window.fsmBoardRender();
};

/** 테마와 글꼴 로딩 후 배치를 확정하고 준비 중인 점수판의 등장 효과를 실행합니다. */
function revealFsmBoard() {
  const board = document.querySelector('.fsm-board.fsm-starting');
  if (!board || pendingThemeLink || !fsmInitialStateReady) return;
  // 최종 테마의 크기를 transition:none 상태에서 확정합니다. CSS 교체와
  // fsm-starting 제거가 같은 스타일 계산에 합쳐지면 이전 크기에서 전환됩니다.
  // 이 계산으로 테마 폰트 로딩도 시작하므로 fonts.status는 이후 확인합니다.
  void board.offsetHeight;
  if (document.fonts?.status === 'loading') {
    document.fonts.ready.then(revealFsmBoard);
    return;
  }
  requestAnimationFrame(() => {
    if (pendingThemeLink || !board.classList.contains('fsm-starting')) return;
    // 예약 후 render/폰트 갱신이 발생해도 표시 직전의 레이아웃을 확정합니다.
    void board.offsetHeight;
    if (document.fonts?.status === 'loading') {
      document.fonts.ready.then(revealFsmBoard);
      return;
    }
    board.classList.remove('fsm-starting');
    board.classList.add('fsm-entering');
    if (getComputedStyle(board).animationName === 'none') {
      board.classList.remove('fsm-entering');
      return;
    }
    const finishEntrance = event => {
      if (event.target === board && event.animationName === 'fsm-board-enter') {
        board.classList.remove('fsm-entering');
        board.removeEventListener('animationend', finishEntrance);
        if (fsmEntranceEndListener === finishEntrance) fsmEntranceEndListener = null;
      }
    };
    fsmEntranceEndListener = finishEntrance;
    board.addEventListener('animationend', finishEntrance);
  });
}

/**
 * 테마 스타일시트를 교체하고 로딩이 끝난 최신 요청의 점수판 배치를 갱신합니다.
 * @param {string} cssFile 적용할 테마 CSS 경로입니다.
 * @param {string} requestedTheme 요청한 테마 키입니다.
 */
function changeCSS(cssFile, requestedTheme = _currentTheme) {
  const href = new URL(cssFile, document.baseURI).href;
  if (pendingThemeLink?.href === href) return;

  // 연속 테마 변경 시 이전 요청이 늦게 완료되어 최신 테마를 덮어쓰지 않게 한다.
  if (pendingThemeLink) {
    pendingThemeLink.onload = pendingThemeLink.onerror = null;
    pendingThemeLink.remove();
    pendingThemeLink = null;
  }
  if (oldlink?.href === href) {
    _currentTheme = requestedTheme;
    return;
  }

  const newlink = document.createElement('link');
  newlink.rel = 'stylesheet';
  newlink.href = href;
  // 새 CSS가 준비될 때까지 현재 테마를 유지한다. 로딩 중 스타일이 사라지면
  // initBoardScale()이 로고의 원본 크기 등을 측정해 패널 높이를 0으로 만들 수 있다.
  newlink.media = 'not all';
  pendingThemeLink = newlink;
  newlink.onload = () => {
    if (pendingThemeLink !== newlink) return;
    newlink.onload = newlink.onerror = null;
    // 목적 테마의 전환 속성을 CSS 교체 전에 준비해야 크기/위치 전환이
    // 스타일 계산 타이밍에 따라 생략되지 않습니다.
    const board = document.querySelector('.fsm-board');
    _currentTheme = requestedTheme;
    if (board) board.dataset.fsmTheme = _currentTheme;
    oldlink?.remove();
    newlink.id = 'fsm-theme-link';
    newlink.media = 'all';
    oldlink = newlink;
    pendingThemeLink = null;
    requestAnimationFrame(() => {
      window.fsmBoardRender();
      // 목적 테마에서 투명한 칸은 이전 배경색이 사라지는 동안 박스로 남기지 않습니다.
      // 불투명한 배경끼리의 색상 전환과 다른 전환 효과는 그대로 유지합니다.
      document.querySelectorAll('.fsm-board :is(.scoreboard-main, .team-logo, .team-score, .score-div)')
        .forEach(node => node.getAnimations().forEach(animation => {
          if (animation.transitionProperty !== 'background-color') return;
          const frames = animation.effect.getKeyframes();
          const target = frames[frames.length - 1]?.backgroundColor;
          if (target === 'transparent' || target === 'rgba(0, 0, 0, 0)') animation.finish();
        }));
      autoLayoutNotes();
      initBoardScale();
      document.fonts.ready.then(() => {
        if (oldlink !== newlink || pendingThemeLink) return;
        window.fsmBoardRender();
        autoLayoutNotes();
        initBoardScale();
      });
    });
  };
  newlink.onerror = () => {
    if (pendingThemeLink !== newlink) return;
    newlink.onload = newlink.onerror = null;
    newlink.remove();
    pendingThemeLink = null;
    console.warn('Scoreboard theme stylesheet failed to load:', href);
    window.fsmBoardRender();
  };
  // 기존 link 바로 뒤에 넣어 다른 스타일시트와의 우선순위도 유지한다.
  if (oldlink) oldlink.after(newlink);
  else document.head.appendChild(newlink);
}

let fsmChromaSheet = null;
let fsmChromaMode = '';
/** 현재 테마의 색상 선언을 크로마키 안전색으로 보정하는 추가 스타일을 갱신합니다. */
function applyFsmChromaTheme() {
  const sheet = oldlink?.sheet;
  const mode = isGreenscreenOn() ? getGreenscreenIntensity() : 'off';
  if (!sheet || (sheet === fsmChromaSheet && mode === fsmChromaMode)) return;
  let style = document.getElementById('fsm-chroma-colors');
  if (!style) { style = document.createElement('style'); style.id = 'fsm-chroma-colors'; }
  oldlink.after(style);
  const rules = [];
  const visit = list => Array.from(list).forEach(rule => {
    if (rule.selectorText && rule.style) {
      const declarations = [];
      Array.from(rule.style).forEach(property => {
        if (!/^(color|background|border|box-shadow|text-shadow)/.test(property)) return;
        const original = rule.style.getPropertyValue(property);
        const converted = chromaSafeGradient(original);
        if (converted !== original) declarations.push(`${property}:${converted}${rule.style.getPropertyPriority(property) ? ' !important' : ''};`);
      });
      if (declarations.length) rules.push(`${rule.selectorText}{${declarations.join('')}}`);
    } else if (rule.cssRules) {
      const start = rules.length;
      visit(rule.cssRules);
      if (rules.length > start) {
        const nested = rules.splice(start).join('\n');
        rules.push(`${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${nested}}`);
      }
    }
  });
  if (mode !== 'off') visit(sheet.cssRules);
  style.textContent = rules.join('\n');
  fsmChromaSheet = sheet;
  fsmChromaMode = mode;
}

/**
 * FSM 점수판 테마를 적용한다 — 테마 CSS(changeCSS)를 교체하고 리그 로고 src를 지정한다.
 * FSM의 switch(data.theme) 블록을 함수로 추출한 것.
 * @param {string} theme  FSM_THEMES의 키 (알 수 없는 값은 기본 테마)
 * @param {string|null} logoUrl  리그 로고 URL (LEAGUE_THEME_MAP 값, 없으면 null)
 */
function applyTheme(theme, logoUrl) {
  switch(theme) {
    case 'pl':
      changeCSS('css/theme/result_style_EPL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'kleague':
      changeCSS('css/theme/result_style_KLEAGUE.css', theme);
      break;
    case 'danish':
      changeCSS('css/theme/result_style_DANISH.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'rpl':
      changeCSS('css/theme/result_style_RPL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'superlig':
      changeCSS('css/theme/result_style_SUPERLIG.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'coppaitalia':
      changeCSS('css/theme/result_style_COPPA_ITALIA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'seriea':
      changeCSS('css/theme/result_style_SERIEA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'cl':
      changeCSS('css/theme/result_style_CL.css', theme);
      break;
    case 'mls':
      changeCSS('css/theme/result_style_MLS.css', theme);
      break;
    case 'eredivisie':
      changeCSS('css/theme/result_style_EREDIVISIE.css', theme);
      break;
    case 'uel':
      changeCSS('css/theme/result_style_UEL.css', theme);
      break;
    case 'unl':
      changeCSS('css/theme/result_style_UNL.css', theme);
      break;
    case 'acle':
      changeCSS('css/theme/result_style_ACLE.css', theme);
      break;
    case 'acl2':
      changeCSS('css/theme/result_style_ACL2.css', theme);
      break;
    case 'acgl':
      changeCSS('css/theme/result_style_ACGL.css', theme);
      break;
    case 'ekstraklasa':
      changeCSS('css/theme/result_style_EKSTRAKLASA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'czech':
      changeCSS('css/theme/result_style_CZECH.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'armenian':
      changeCSS('css/theme/result_style_ARMENIAN.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'concacafcc':
      changeCSS('css/theme/result_style_CONCACAFCC.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'cafcc':
      changeCSS('css/theme/result_style_CAFCC.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'cafcl':
      changeCSS('css/theme/result_style_CAFCL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'recopa':
      changeCSS('css/theme/result_style_RECOPA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'sudamericana':
      changeCSS('css/theme/result_style_SUDAMERICANA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'libertadores':
      changeCSS('css/theme/result_style_LIBERTADORES.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'turkishcup':
    case 'tff1lig':
      changeCSS('css/theme/result_style_TFF1LIG.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'belgian':
      changeCSS('css/theme/result_style_BELGIAN.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'ligaportugal':
      changeCSS('css/theme/result_style_LIGAPORTUGAL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'brazilseriea':
      changeCSS('css/theme/result_style_BRAZIL_SERIE_A.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'saudikingscup':
      changeCSS('css/theme/result_style_SAUDI_KINGS_CUP.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'chinesesuperleague':
      changeCSS('css/theme/result_style_CHINESE_SUPER_LEAGUE.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'saudi':
      changeCSS('css/theme/result_style_SAUDI.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'uzbek':
      changeCSS('css/theme/result_style_UZBEK.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'aleague':
      changeCSS('css/theme/result_style_ALEAGUE.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'cnl':
      changeCSS('css/theme/result_style_CNL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'coupedefrance':
      changeCSS('css/theme/result_style_COUPE_DE_FRANCE.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'ligue1':
      changeCSS('css/theme/result_style_LIGUE1.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'ligue2':
      changeCSS('css/theme/result_style_LIGUE2.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'nationalleague':
      changeCSS('css/theme/result_style_NATIONAL_LEAGUE.css', theme);
      break;
    case 'eflchampionship':
      changeCSS('css/theme/result_style_EFL_CHAMPIONSHIP.css', theme);
      break;
    case 'eflleagueone':
      changeCSS('css/theme/result_style_EFL_LEAGUE_ONE.css', theme);
      break;
    case 'eflleaguetwo':
      changeCSS('css/theme/result_style_EFL_LEAGUE_TWO.css', theme);
      break;
    case 'jleague':
      changeCSS('css/theme/result_style_JLEAGUE.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'belarus':
      changeCSS('css/theme/result_style_BELARUS.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'russiancup':
      changeCSS('css/theme/result_style_RUSSIANCUP.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'romanian':
      changeCSS('css/theme/result_style_ROMANIAN.css', theme);
      // 지정 SVG에서 글자를 제외하고 분리한 컵 경로를 표시합니다.
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'fnl':
      changeCSS('css/theme/result_style_FNL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'fnl2a':
      changeCSS('css/theme/result_style_FNL2A.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'fnl2b':
      changeCSS('css/theme/result_style_FNL2B.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'er24':
      changeCSS('css/theme/result_style_EURO24.css', theme);
      break;
    case 'wc26':
      changeCSS('css/theme/result_style_WC26.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'uecl':
      changeCSS('css/theme/result_style_UECL.css', theme);
      break;
    case 'laliga':
      changeCSS('css/theme/result_style_LALIGA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'laliga2':
      // 라리가와 같은 디자인에 주황색(#FF4B44)만 #00D4D6으로 바꾼 테마
      changeCSS('css/theme/result_style_LALIGA2.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'bundes':
      changeCSS('css/theme/result_style_BUNDESLIGA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'bundes2':
      // 분데스리가와 같은 CSS를 쓰고 로고만 LEAGUE_THEME_MAP[79]에서 다르게 지정
      changeCSS('css/theme/result_style_BUNDESLIGA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'facup':
      changeCSS('css/theme/result_style_FACUP.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'carabao':
      changeCSS('css/theme/result_style_CARABAO.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    default:
      changeCSS('css/theme/result_style_default.css', 'default');
  }
}

  /** 현재 상태를 점수판에 반영하고 테마별 합계 점수·타이머·숫자 위치를 맞춥니다. */
  function applyText() {
    applyFsmChromaTheme();
    const board = document.querySelector('.fsm-board');
    if (board) board.dataset.fsmTheme = _currentTheme;
    setFsmText('.fsm-board #team-text-left', scoreboardTeamDisplayName('home'));   // data.teamLeft.name → state.homeName
    setFsmText('.fsm-board #homeScore', state.homeScore);
    setFsmText('.fsm-board #team-text-right', scoreboardTeamDisplayName('away'));
    setFsmText('.fsm-board #awayScore', state.awayScore);




    // 팀 로고: state.homeLogo / state.awayLogo는 백엔드 logos.csv CDN URL에서 옵니다.
    // logos.csv에 indvel GitHub CDN URL을 등록하면 여기서 자동으로 반영됩니다.


    // 팀 컬러 언더라인 — 현재 테마에 따라 다르게 처리 (applyTheme()에서 호출됨)
    // pl2 테마는 언더라인 대신 팀 컬러 배경을 사용: state.colors.homeBg / state.colors.awayBg
    // 나머지 테마는 state.colors.homeBg 를 border-bottom 색상으로 사용
    applyTeamColors();

    board.querySelectorAll('.team-logo').forEach(box => {
      const style = getComputedStyle(box);
      const width = box.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const height = box.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      box.style.setProperty('--fsm-logo-width', Math.max(0, width) + 'px');
      box.style.setProperty('--fsm-logo-height', Math.max(0, height) + 'px');
    });

    const clock = board.querySelector('.time');
    setFsmStyle('.fsm-board .extra-time', {
      marginLeft: '0px', left: `calc(50% + ${clock.offsetWidth / 2 + (_currentTheme === 'romanian' ? 6 : 0)}px)`
    });
    // 두 박스에 같은 숫자 기준을 사용하여 추가시간과 타이머의 기준선을 맞춥니다.
    // 각 값을 따로 측정하면 높이가 낮은 글자가 90:00보다 아래로 이동합니다.
    board.querySelectorAll('.time, .extra-time').forEach(element => {
      const style = getComputedStyle(element);
      const context = document.createElement('canvas').getContext('2d');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText('0123456789');
      const shift = Number.isFinite(metrics.fontBoundingBoxAscent)
        ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent - metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / 2 : 0;
      element.style.paddingTop = Math.max(0, 2 * shift) + 'px';
      element.style.paddingBottom = Math.max(0, -2 * shift) + 'px';
    });

    if(state.half == 'PK') {
       setFsmStyle('.pso-main', {height: 'auto'});
       setFsmStyle('.pso-status', {display: 'flex'});
    } else {
       setFsmStyle('.pso-main', {height: '0px'});
       setFsmStyle('.pso-status', {display: 'none'});
    }

    const supportsAggregate = FSM_AGGREGATE_THEMES.includes(_currentTheme);
    board.dataset.fsmAggregate = String(supportsAggregate && !!state.aggEnabled);
    // 테마에서 지정한 타이머·로고·팀명 칸의 색상 쌍은 대비색 자동 선택으로 바꾸지 않습니다.
    const fixedAggregatePalette = {
      turkishcup: ['#08151B', '#ffffff'], tff1lig: ['#08151B', '#ffffff'],
      aleague: ['#141993', '#ffffff'],
      brazilseriea: ['transparent', '#ffffff'],
      saudikingscup: ['#B7993C', '#22242A'],
      chinesesuperleague: ['#03356C', '#ffffff'],
      saudi: ['#273441', '#ffffff'],
      uzbek: ['transparent', '#ffffff'],
      acgl: ['#E9DFC6', '#48002B'],
      acl2: ['#73BBF6', '#181559'],
      coupedefrance: ['#000121', '#ffffff'],
      coppaitalia: ['#661729', '#ffffff'],
      facup: ['#ED1C24', '#ffffff'],
      carabao: ['#008F5E', '#ffffff'],
      eflchampionship: ['#b69b42', '#ffffff'],
      eflleagueone: ['#7f8384', '#ffffff'],
      eflleaguetwo: ['#cc0935', '#ffffff'],
      ligue1: ['#085FFF', '#ffffff'],
      ligue2: ['#00fcd0', '#000000'],
      ligaportugal: ['#ffffff', '#102556'],
      concacafcc: ['#01FCDA', '#001021'],
      cafcc: ['#787F7E', '#ffffff'],
      cafcl: ['#B0902E', '#ffffff'],
      recopa: ['#141809', '#77F8FB'],
      sudamericana: ['#141809', '#ffffff'],
      libertadores: ['#141809', '#F2DA82'],
      rpl: ['#0e2a5c', '#ffffff'],
      fnl: ['#000000', '#00c7b2'],
      czech: ['#ffffff', '#181E73'],
      romanian: ['transparent', '#ffffff'],
      belarus: ['#000000', '#ffffff']
    }[_currentTheme];
    const palette = fixedAggregatePalette || FSM_PSO_PALETTES[_currentTheme] || FSM_PSO_PALETTES.default;
    board.style.setProperty('--fsm-aggregate-background', chromaSafe(palette[0]));
    board.style.setProperty('--fsm-aggregate-ink', fixedAggregatePalette ? chromaSafeText(palette[1]) : getColorContract(chromaSafe(palette[0])));
    if(supportsAggregate) {
      if(state.aggEnabled) {
        var aggHome = (Number(state.aggHomeBase)||0)+(Number(state.homeScore)||0);
        var aggAway = (Number(state.aggAwayBase)||0)+(Number(state.awayScore)||0);
        setFsmText('.fsm-board #totalScoreLeft', aggHome);
        setFsmText('.fsm-board #totalScoreRight', aggAway);
        setFsmStyle('.fsm-board .total-score', {display: 'flex', opacity: '100%'});
        if (_currentTheme === 'romanian') {
          // 같은 숫자 글리프 기준으로 실제 잉크 높이를 점수판의 세로 중앙에 맞춥니다.
          const style = getComputedStyle(board.querySelector('.total'));
          const context = document.createElement('canvas').getContext('2d');
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const metrics = context.measureText('0123456789');
          const shift = Number.isFinite(metrics.fontBoundingBoxAscent)
            ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent - metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / 2 : 0;
          board.style.setProperty('--fsm-aggregate-number-shift', `${shift}px`);
        }
        // 자리수가 달라도 양쪽 합계 폭을 같게 유지해 중앙 로고와 경기 점수가 밀리지 않게 합니다.
        const totals = Array.from(board.querySelectorAll('.total-score'));
        totals.forEach(node => { node.style.width = ''; });
        const totalWidth = Math.max(...totals.map(node => Math.max(node.offsetWidth, node.scrollWidth)));
        totals.forEach(node => { node.style.width = `${totalWidth}px`; });
      } else {
        setFsmStyle('.fsm-board .total-score', {display: 'none', opacity: '0'});
      }
    } else {
        setFsmStyle('.fsm-board .total-score', {display: 'none', opacity: '0'});
    }
    if (_currentTheme === 'belarus') {
      // 실제 숫자 높이에 상하 5px 여백을 두고 두 자리 점수도 박스 안에 넣는다.
      ['home', 'away'].forEach(side => {
        const score = document.getElementById(side + 'Score');
        const style = getComputedStyle(score);
        const context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontWeight} 64px ${style.fontFamily}`;
        const initial = context.measureText(score.textContent);
        const size = Math.min(64, 64 * 38 / (initial.actualBoundingBoxAscent + initial.actualBoundingBoxDescent), 64 * (score.parentElement.clientWidth - 4) / initial.width);
        context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
        const ink = context.measureText(score.textContent);
        const baseline = (48 - ink.fontBoundingBoxAscent - ink.fontBoundingBoxDescent) / 2 + ink.fontBoundingBoxAscent;
        board.style.setProperty(`--fsm-belarus-${side}-size`, `${size}px`);
        const inkHeight = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
        board.style.setProperty(`--fsm-belarus-${side}-shift`, `${(48 + inkHeight) / 2 - ink.actualBoundingBoxDescent - baseline}px`);
      });
    }
    adjustScoreboardWidth();
  }

  // 팀명 길이에 따라 폰트 크기 조정
/** 벨라루스 테마 — 실제 화면 픽셀에 수평 연결부를 맞추되 사선 기울기와 돌출 폭은 유지한다. */
window.syncBelarusBoundaryPixelGrid = function() {
  const board = document.querySelector('.fsm-board[data-fsm-theme="belarus"]');
  const score = board?.querySelector('#team-score-left');
  if (!score || !score.offsetHeight) return;
  const rect = score.getBoundingClientRect();
  const scale = rect.height / score.offsetHeight;
  const dpr = window.devicePixelRatio || 1;
  if (!(scale > 0)) return;
  // 바탕 팀 색상이 반 픽셀 높이로 먼저 칠해진 뒤 비치지 않도록 끝 행 전체를 덮는다.
  const overscanTop = (rect.top - Math.floor(rect.top * dpr + 1e-7) / dpr) / scale;
  const overscanBottom = (Math.ceil(rect.bottom * dpr - 1e-7) / dpr - rect.bottom) / scale;
  board.style.setProperty('--fsm-belarus-edge-top', `${-overscanTop}px`);
  board.style.setProperty('--fsm-belarus-edge-bottom', `${-overscanBottom}px`);
  board.style.setProperty('--fsm-belarus-edge-top-x', `${1.36 - overscanTop / 12}px`);
  board.style.setProperty('--fsm-belarus-edge-bottom-x', `${5.36 + overscanBottom / 12}px`);
  [['upper', 48 * .2045], ['lower', 36]].forEach(([name, originalY]) => {
    const screenY = Math.round((rect.top + originalY * scale) * dpr) / dpr;
    const y = (screenY - rect.top) / scale;
    const outerX = 1.36 + y / 12;
    board.style.setProperty(`--fsm-belarus-${name}-y`, `${y}px`);
    board.style.setProperty(`--fsm-belarus-${name}-paint-y`, `${y + overscanTop}px`);
    board.style.setProperty(`--fsm-belarus-${name}-outer`, `${outerX}px`);
    board.style.setProperty(`--fsm-belarus-${name}-inner`, `${outerX + 5.46}px`);
  });
};
window.addEventListener('resize', () => {
  if (_currentTheme === 'belarus') requestAnimationFrame(window.syncBelarusBoundaryPixelGrid);
  if (_currentTheme === 'ekstraklasa') requestAnimationFrame(window.syncEkstraklasaBoundaryPixelGrid);
});

/** 엑스트라클라사 테마 — 반 픽셀에 걸린 위쪽 그라데이션과 구분선을 실제 화면 픽셀에 맞춰 흐림을 없앤다. */
window.syncEkstraklasaBoundaryPixelGrid = function() {
  const board = document.querySelector('.fsm-board[data-fsm-theme="ekstraklasa"]');
  const score = board?.querySelector('#team-score-left');
  if (!score || !score.offsetHeight) return;
  const rect = score.getBoundingClientRect();
  const scale = rect.height / score.offsetHeight;
  if (!(scale > 0)) return;
  const dpr = window.devicePixelRatio || 1;
  // 반 픽셀에 걸린 위쪽 행까지 같은 그라데이션으로 칠합니다.
  const overscan = (rect.top - Math.floor(rect.top * dpr + 1e-7) / dpr) / scale;
  board.style.setProperty('--fsm-ekstraklasa-paint-top', `${-overscan}px`);
  // 구분선의 시작점과 폭을 실제 화면 픽셀에 맞춰 흐릿한 반 픽셀 선을 없앱니다.
  /** CSS px 값을 가장 가까운 화면 픽셀 경계로 반올림한다. */
  const snap = value => Math.round(value * dpr) / dpr;
  board.querySelectorAll('.team-score, .score-div').forEach(node => {
    const r = node.getBoundingClientRect();
    const lineWidth = Math.max(1, Math.round(scale * dpr)) / dpr;
    const top = snap(r.top + 8 * scale);
    const bottom = snap(r.bottom - 8 * scale);
    node.style.setProperty('--fsm-line-top', `${(top - r.top) / scale}px`);
    node.style.setProperty('--fsm-line-height', `${(bottom - top) / scale}px`);
    node.style.setProperty('--fsm-line-width', `${lineWidth / scale}px`);
    const afterX = node.id === 'team-score-left' ? r.left : r.right - lineWidth;
    node.style.setProperty('--fsm-line-after-x', `${(snap(afterX) - r.left) / scale}px`);
    node.style.setProperty('--fsm-line-before-x', `${(snap(r.left) - r.left) / scale}px`);
  });
};

const FSM_WIDTH_LIMITS = Object.freeze({
  minBoard: 520, maxBoard: 1080,
  minTeam: 220, maxTeam: 480,
  teamPadding: 48, maxFont: 33, minFont: 12
});

/**
 * 두 팀 이름이 원래 글꼴 크기로 들어가도록 점수판 너비를 조정한다(FSM_WIDTH_LIMITS 범위 안).
 * 테마별로 점수 영역·로고와 겹치는 폭을 팀명 영역에서 빼고, 그래도 넘치면 글꼴을 줄인다.
 */
function adjustScoreboardWidth() {
  const board = document.querySelector('.fsm-board');
  const scoreboard = board?.querySelector('.scoreboard-main');
  const cards = [document.getElementById('homeCard'), document.getElementById('awayCard')];
  const names = cards.map(card => card?.querySelector('.team-name'));
  const texts = names.map(name => name?.querySelector('.text'));
  if (!scoreboard || texts.some(text => !text)) return;
  const limits = FSM_WIDTH_LIMITS;
  // 모든 테마의 실제 좌우 패딩을 너비 계산에 사용하는 설정과 동기화합니다.
  board.style.setProperty('--fsm-team-name-padding', `${limits.teamPadding / 2}px`);
  // 이전 렌더링 결과와 무관하게 원래 글꼴 크기로 측정합니다.
  const widths = texts.map(text => {
    text.style.fontSize = limits.maxFont + 'px';
    text.style.width = 'max-content';
    const width = text.scrollWidth;
    text.style.width = '';
    return width;
  });
  if (_currentTheme === 'jleague') {
    // 글자의 실제 높이에서 원호가 차지하는 최대 폭을 구해 최소한의 여백만 확보한다.
    const radius = cards[0].clientHeight;
    const context = document.createElement('canvas').getContext('2d');
    const inkHeight = Math.max(...texts.map(text => {
      const style = getComputedStyle(text);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = context.measureText(text.textContent);
      return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    }));
    const reach = Math.min(radius, (radius + inkHeight) / 2);
    const padding = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - reach * reach)) + 3);
    board.style.setProperty('--fsm-jleague-name-padding', `${Math.max(16, padding)}px`);
  }
  // 합산 점수가 표시되는 경우 이를 포함해 실제 테마 영역을 측정합니다.
  const fixedWidth = Array.from(scoreboard.children).reduce((sum, child) => {
    const style = getComputedStyle(child);
    if (cards.includes(child) || style.position === 'absolute' || style.display === 'none') return sum;
    return sum + child.offsetWidth + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  }, 0);
  board.style.removeProperty('--fsm-name-reserved-width');
  board.style.removeProperty('--fsm-score-overlap');
  if (_currentTheme === 'mls') board.style.setProperty('--fsm-name-reserved-width', '28px');
  if (_currentTheme === 'eredivisie') board.style.setProperty('--fsm-name-reserved-width', '8px');
  if (_currentTheme === 'unl') {
    // 회전된 로고 박스의 안쪽 꼭짓점까지는 팀명 영역에서 제외합니다.
    const scale = scoreboard.getBoundingClientRect().width / scoreboard.offsetWidth || 1;
    const homeLogo = document.getElementById('team-logo-left').getBoundingClientRect();
    const awayLogo = document.getElementById('team-logo-right').getBoundingClientRect();
    const overlap = Math.max(0,
      (homeLogo.right - cards[0].getBoundingClientRect().left) / scale,
      (cards[1].getBoundingClientRect().right - awayLogo.left) / scale);
    board.style.setProperty('--fsm-name-reserved-width', `${overlap}px`);
  }
  if (['russiancup', 'romanian', 'danish', 'ekstraklasa', 'czech', 'seriea', 'superlig', 'tff1lig', 'turkishcup', 'belgian', 'armenian', 'cnl', 'aleague', 'uzbek', 'saudi', 'chinesesuperleague', 'saudikingscup', 'brazilseriea', 'ligaportugal', 'rpl', 'wc26', 'ligue1', 'ligue2', 'fnl', 'fnl2a', 'fnl2b', 'nationalleague', 'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'libertadores', 'sudamericana', 'recopa', 'cafcl', 'cafcc', 'concacafcc', 'coppaitalia', 'coupedefrance'].includes(_currentTheme)) {
    // 절대 위치의 점수 영역이 팀 카드와 겹치므로 실제 표시 경계를 기준으로
    // 세리에 A의 기울기까지 반영하여 바깥쪽 팀명 영역을 계산합니다.
    const scale = scoreboard.getBoundingClientRect().width / scoreboard.offsetWidth || 1;
    const homeScore = (board.dataset.fsmAggregate === 'true' && _currentTheme !== 'czech' ? document.getElementById('totalScoreLeft').parentElement : document.getElementById('team-score-left')).getBoundingClientRect();
    const awayScore = (board.dataset.fsmAggregate === 'true' && _currentTheme !== 'czech' ? document.getElementById('totalScoreRight').parentElement : document.getElementById('team-score-right')).getBoundingClientRect();
    const overlap = Math.max(0,
      (cards[0].getBoundingClientRect().right - homeScore.left) / scale,
      (awayScore.right - cards[1].getBoundingClientRect().left) / scale);
    board.style.setProperty('--fsm-score-overlap', overlap + 'px');
    let danishWidth = 0;
    if (_currentTheme === 'danish') {
      // 타이머와 팀컬러의 실제 높이에 같은 기울기를 적용합니다.
      const slope = parseFloat(getComputedStyle(board).getPropertyValue('--danish-slope')) || .3;
      const clock = board.querySelector('.time');
      const chip = board.querySelector('#homeColor');
      board.style.setProperty('--danish-timer-inset', `${clock.offsetHeight * slope}px`);
      board.style.setProperty('--danish-team-color-width', `${chip.offsetHeight * slope}px`);
      // 삼각형의 위쪽 바깥 꼭짓점까지 제외한 영역 안에서 팀명을 정렬합니다.
      const homeEdge = board.querySelector('#homeColor').getBoundingClientRect().left;
      const awayEdge = board.querySelector('#awayColor').getBoundingClientRect().right;
      danishWidth = Math.max(
        (cards[0].getBoundingClientRect().right - homeEdge) / scale,
        (awayEdge - cards[1].getBoundingClientRect().left) / scale) - overlap;
    }
    const reserved = overlap + (_currentTheme === 'russiancup' ? cards[0].clientHeight : _currentTheme === 'danish' ? danishWidth : _currentTheme === 'wc26' ? 41 : ['cnl', 'aleague'].includes(_currentTheme) ? 7 : _currentTheme === 'ligaportugal' ? 16 : ['rpl', 'belgian', 'coupedefrance', 'brazilseriea'].includes(_currentTheme) ? 8 : 0);
    board.style.setProperty('--fsm-name-reserved-width', reserved + 'px');
  }
  const reservedWidth = parseFloat(getComputedStyle(board).getPropertyValue('--fsm-name-reserved-width')) || 0;
  const requestedTeam = Math.max(limits.minTeam, ...widths.map((width, index) => {
    const style = getComputedStyle(names[index]);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    // 점수 영역을 위해 이미 확보한 여백은 중복해서 더하지 않습니다.
    const margin = Math.max(0,
      (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0) - reservedWidth);
    return width + Math.max(_currentTheme === 'jleague' ? 32 : limits.teamPadding, padding + margin) + reservedWidth;
  }));
  const requestedBoard = Math.max(limits.minBoard, fixedWidth + 2 * requestedTeam);
  // 합계 칸이 추가되어도 기존 팀명 공간을 유지하도록 최대 너비에 표시 폭을 더합니다.
  const aggregateWidth = board.dataset.fsmAggregate === 'true'
    ? Array.from(board.querySelectorAll('.total-score')).reduce((sum, node) => sum + node.offsetWidth, 0)
    : 0;
  const boardWidth = Math.min(limits.maxBoard + aggregateWidth, requestedBoard, fixedWidth + 2 * limits.maxTeam);
  const teamWidth = Math.max(0, (boardWidth - fixedWidth) / 2);
  cards.forEach(card => { card.style.width = teamWidth + 'px'; });
  scoreboard.style.width = boardWidth + 'px';
  if (_currentTheme === 'cnl') syncCnlGeometry(board);
  if (_currentTheme === 'aleague') syncCnlGeometry(board, null, false);
  if (_currentTheme === 'uzbek') syncCnlGeometry(board, 32);
  if (_currentTheme === 'ekstraklasa') {
    window.syncEkstraklasaBoundaryPixelGrid();
  }
  const background = board.querySelector('.div-background');
  if (background) background.style.width = boardWidth + 'px';
  // 양쪽 팀 영역에 동일한 최종 너비를 적용한 뒤 글자를 맞춥니다.
  texts.forEach((text, index) => {
    const style = getComputedStyle(names[index]);
    const available = Math.max(0, names[index].clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
    let size = limits.maxFont;
    text.style.width = 'max-content';
    while (text.scrollWidth > available && size > limits.minFont) text.style.fontSize = --size + 'px';
    if (text.scrollWidth > available && available > 0) text.style.fontSize = (size * available / text.scrollWidth) + 'px';
    text.style.width = '';
    // 글꼴의 줄 박스가 아니라 실제 글자 높이를 기준으로 가운데 정렬합니다.
    // Gmarket 글꼴의 비대칭 상하 높이와 팀 카드의 테두리 높이 차이를 반영합니다.
    const textStyle = getComputedStyle(text);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
    const metrics = context.measureText(text.textContent);
    const cardStyle = getComputedStyle(cards[index]);
    text.style.transform = 'none';
    const cardRect = cards[index].getBoundingClientRect();
    const textRect = text.getBoundingClientRect();
    const layoutScale = cardRect.height / cards[index].offsetHeight || 1;
    const topInset = (parseFloat(cardStyle.borderTopWidth) || 0) + (parseFloat(cardStyle.paddingTop) || 0);
    const stripEdge = board.dataset.fsmColorEdge === 'strip' && cardStyle.boxShadow !== 'none' ? 1 : 0;
    const bottomInset = (parseFloat(cardStyle.borderBottomWidth) || 0) + (parseFloat(cardStyle.paddingBottom) || 0) + stripEdge;
    const contentCenter = cardRect.top + (cardRect.height + (topInset - bottomInset) * layoutScale) / 2;
    const layoutOffset = (contentCenter - (textRect.top + textRect.bottom) / 2) / layoutScale;
    let inkOffset = Number.isFinite(metrics.fontBoundingBoxAscent)
      ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent - metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / 2
      : 0;
    if (_currentTheme === 'pl' && Number.isFinite(metrics.fontBoundingBoxAscent)) {
      // 합성 굵기가 적용된 한글은 글꼴 측정값과 실제 픽셀 높이가 다를 수 있습니다.
      // 실제로 그려진 글자의 상하 경계로 프리미어리그 팀명을 보정합니다.
      const font = context.font;
      const renderScale = cards[index].getBoundingClientRect().width / cards[index].offsetWidth || 1;
      const baseline = Math.ceil(parseFloat(textStyle.fontSize) * 2);
      context.canvas.width = Math.ceil((metrics.width + 16) * renderScale);
      context.canvas.height = Math.ceil(baseline * 2 * renderScale);
      context.font = font;
      context.scale(renderScale, renderScale);
      context.fillText(text.textContent, 8, baseline);
      const pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
      let top = pixels.height, bottom = -1;
      for (let y = 0; y < pixels.height; y++) {
        for (let x = 0; x < pixels.width; x++) {
          if (pixels.data[(y * pixels.width + x) * 4 + 3] >= 192) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (bottom >= top) inkOffset = baseline - (top + bottom + 1) / (2 * renderScale)
        - (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
    }
    text.style.transform = `translateY(${inkOffset + layoutOffset}px)`;
  });
}


  /** 테마별 팀 컬러 적용 분기 — applyText()와 applyTheme() 양쪽에서 호출. 크로마키 모드면 안전한 색으로 바꿔 적용. */
  function applyTeamColors() {
    const teamColors = Object.fromEntries(Object.entries(state.colors).map(([key, value]) => [key, chromaSafe(value)]));
    // 로고의 확대·이동과 독립된 고정 원형 마스크를 카라바오컵에만 적용합니다.
    document.querySelectorAll('.fsm-board .team-logo').forEach(box => {
      const wrapper = box.querySelector('.carabao-logo-clip');
      if (_currentTheme === 'carabao' && !wrapper) {
        const img = box.querySelector('img');
        if (!img) return;
        const clip = document.createElement('div');
        clip.className = 'carabao-logo-clip';
        box.append(clip);
        clip.append(img);
      } else if (_currentTheme !== 'carabao' && wrapper) {
        wrapper.replaceWith(...wrapper.childNodes);
      }
    });
    setFsmStyle('.fsm-board .team-name', {color: ''});
    // 이전 테마의 팀컬러·글자색과 카라바오 전용 마감을 현재 테마로 넘기지 않습니다.
    setFsmStyle('.fsm-board .team-color', {background: ''});
    setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {color: '', boxShadow: ''});
    // 네이션스리그 분기가 로고 칸에 넣은 팀 컬러 배경을 지운다. 지우지 않으면 다른 테마로 바꿔도
    // 인라인 스타일이 남아 로고 칸이 테마 CSS 색(whitesmoke/검정 등) 대신 팀 컬러로 보인다.
    setFsmStyle('.fsm-board .team-logo', {background: '', border: ''});
    // UNL 전용 이미지·필터가 다른 테마의 팀 로고에 남지 않도록 복원합니다.
    setFsmAttr('.fsm-board #team-logo-left img', 'src', state.homeLogo);
    setFsmAttr('.fsm-board #team-logo-right img', 'src', state.awayLogo);
    setFsmStyle('.fsm-board .team-logo img', {width: '', height: '', filter: '', mixBlendMode: ''});
    const theme = _currentTheme;  // applyTheme()에서 갱신하는 내부 변수
    const colorBoard = document.querySelector('.fsm-board');
    if (colorBoard) {
      colorBoard.style.setProperty('--fsm-home-number-color', teamColors.homeText);
      colorBoard.style.setProperty('--fsm-away-number-color', teamColors.awayText);
      colorBoard.style.setProperty('--fsm-away-primary-color', teamColors.awayBg);
      colorBoard.style.setProperty('--fsm-home-primary-color', teamColors.homeBg);

      colorBoard.dataset.fsmColorEdge = ['bundes', 'bundes2', 'laliga', 'laliga2', 'brazilseriea', 'russiancup', 'romanian', 'danish', 'pl', 'jleague', 'belarus', 'fnl', 'fnl2a', 'fnl2b', 'nationalleague', 'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'saudi', 'chinesesuperleague', 'wc26', 'uel', 'uecl', 'eredivisie', 'mls'].includes(theme)
        ? 'none' : ['czech', 'ekstraklasa'].includes(theme) ? 'strip-top' : ['rpl', 'belgian', 'concacafcc', 'armenian', 'cnl', 'uzbek', 'ligaportugal', 'coupedefrance'].includes(theme) ? 'chip' : 'strip';
    }
    if (theme === 'aleague') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: '5px solid transparent', borderTop: 'none'});
    } else if(theme == 'pl') {
      setFsmStyle('.fsm-board .teams-left', {background: teamColors.homeBg, color: getColorContract(teamColors.homeBg), borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: teamColors.awayBg, color: getColorContract(teamColors.awayBg), borderBottom: 'none', borderTop: 'none'});
      const board = document.querySelector('.fsm-board');
      ['home', 'away'].forEach(side => {
        // CSS transitions expose the previous/interpolated background here.
        // Contrast must follow the requested color immediately.
        const rgb = parseAnyColor(teamColors[`${side}Bg`]);
        const nearWhite = rgb && Math.min(rgb.r, rgb.g, rgb.b) >= 235;
        board.style.setProperty(`--fsm-pl-${side}-overlay`,
          nearWhite ? '#000000' : '#ffffff');
      });
    } else if(theme == 'bundes' || theme == 'bundes2') {
      // 팀명 칸은 팀 컬러(FNL처럼), 글자는 프리미어리그처럼 칸마다 흰색/검은색 중 더 잘 보이는 쪽.
      ['home', 'away'].forEach(side => {
        const bg = teamColors[`${side}Bg`];
        const ink = getColorContract(bg);
        setFsmStyle(`.fsm-board .teams-${side === 'home' ? 'left' : 'right'}`, {background: bg, color: ink, borderBottom: 'none', borderTop: 'none'});
        setFsmStyle(`.fsm-board #${side}Name`, {color: ink});
      });
    } else if(theme == 'unl') {
      // 네이션스리그 — 팀 컬러는 로고 칸(마름모) 배경으로만 표시하고 팀명 칸 아래 줄은 쓰지 않는다
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .team-logo img', {outline: 'none'});
      setFsmStyle('.fsm-board #team-logo-left', {background: teamColors.homeBg});
      setFsmStyle('.fsm-board #team-logo-right', {background: teamColors.awayBg});
      setFsmAttr('.fsm-board .team-logo img', 'src', 'resources/imgs/UNL_shape.png');
      ['home', 'away'].forEach(side => {
        // 검정에 가까운 색만 밝게 합성하고, 나머지는 원래 팀색을 유지하며 어둡게 합성합니다.
        const rgb = parseAnyColor(teamColors[`${side}Bg`]);
        const nearBlack = rgb && Math.max(rgb.r, rgb.g, rgb.b) <= 60;
        setFsmStyle(`.fsm-board #team-logo-${side === 'home' ? 'left' : 'right'} > img`, {
          width: '100%', height: '100%',
          // 투명 영역은 원래 팀색으로 남고, 회색 영역만 명암이 바뀝니다.
          // 원본의 약 75% 알파를 반영해 어두운 면은 65%, 밝은 면은 흰색 20% 혼합으로 맞춥니다.
          filter: nearBlack ? 'brightness(0.53)' : 'brightness(1.045)',
          mixBlendMode: nearBlack ? 'screen' : 'multiply'
        });
      });
    } else if(['jleague', 'belarus', 'fnl', 'fnl2a', 'fnl2b', 'nationalleague', 'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'saudi', 'chinesesuperleague'].includes(theme)) {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      if (theme === 'jleague') {
        setFsmStyle('.fsm-board .team-color', {background: ''});
        ensureJleagueArcs();
      }
    } else if(theme == 'laliga' || theme == 'laliga2' || theme == 'brazilseriea') {
      // 라리가·라리가 2 — 팀명 칸 아래 팀 컬러 줄 없이, 점수 옆 컬러 띠만 primary/number 반반으로 표시
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: 'linear-gradient(to bottom, ' + teamColors.homeBg + ' 50%, ' + teamColors.homeText + ' 50%)'});
      setFsmStyle('.fsm-board #awayColor', {background: 'linear-gradient(to bottom, ' + teamColors.awayBg + ' 50%, ' + teamColors.awayText + ' 50%)'});
    } else if(theme == 'wc26') {
      setFsmStyle('.fsm-board .teams-left', {background: 'black', color: 'white', borderBottom: '3px solid #E9A186', borderTop: '3px solid #661D18'});
      setFsmStyle('.fsm-board .teams-right', {background: 'black', color: 'white', borderBottom: '3px solid ' + chromaSafe('#BDE74C'), borderTop: '3px solid #AD8BF7'});
      setFsmStyle('.fsm-board #homeColor', {background: teamColors.homeBg});
      setFsmStyle('.fsm-board #awayColor', {background: teamColors.awayBg});
    } else if(theme == 'mls') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: teamColors.homeBg});
      setFsmStyle('.fsm-board #awayColor', {background: teamColors.awayBg});
    } else if(theme == 'eredivisie') {
      ['home', 'away'].forEach(side => {
        const primary = teamColors[`${side}Bg`];
        const number = teamColors[`${side}Text`];
        const direction = side === 'home' ? 'to left' : 'to right';
        setFsmStyle(`.fsm-board .teams-${side === 'home' ? 'left' : 'right'}`, {
          background: `linear-gradient(${direction}, ${primary}, ${number})`,
          color: '', borderBottom: 'none', borderTop: 'none'
        });
        setFsmAttr(`.fsm-board #${side}Name`, 'data-fsm-name-ink', getFsmGradientNameInk(primary, number));
        setFsmStyle(`.fsm-board #${side}Color`, {background: `linear-gradient(to bottom, ${primary} 50%, ${number} 50%)`});
      });
    } else if(['czech', 'ekstraklasa'].includes(theme)) {
      setFsmStyle('.fsm-board .teams-left', {background: '', color: '', borderBottom: 'none', borderTop: '5px solid ' + teamColors.homeBg});
      setFsmStyle('.fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: '5px solid ' + teamColors.awayBg});
    } else if(theme === 'russiancup') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      ensureRussianCupTriangles();
    } else if(theme === 'romanian') {
      ['home', 'away'].forEach(side => {
        setFsmStyle(`.fsm-board .teams-${side === 'home' ? 'left' : 'right'}`, {background: teamColors[`${side}Bg`], color: getColorContract(teamColors[`${side}Bg`]), borderBottom: '', borderTop: ''});
      });
    } else if(theme === 'danish') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .team-color', {background: ''});
      ensureDanishTriangles();
    } else if(theme == 'uzbek' || theme == 'concacafcc' || theme == 'coupedefrance' || theme == 'rpl' || theme == 'belgian' || theme == 'armenian' || theme == 'ligaportugal' || theme == 'cnl') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: teamColors.homeBg});
      setFsmStyle('.fsm-board #awayColor', {background: teamColors.awayBg});
    } else if(theme == 'uel' || theme == 'uecl') {
      setFsmStyle('.fsm-board .teams-left', {background: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: 'linear-gradient(to bottom, ' + teamColors.homeBg + ' 50%, ' + teamColors.homeText + ' 50%)'});
      setFsmStyle('.fsm-board #awayColor', {background: 'linear-gradient(to bottom, ' + teamColors.awayBg + ' 50%, ' + teamColors.awayText + ' 50%)'});
    } else if(theme == 'carabao') {
      setFsmStyle('.fsm-board .teams-left', {background: teamColors.homeBg, color: teamColors.homeText, borderBottom: 'none', borderTop: 'none', boxShadow: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: teamColors.awayBg, color: teamColors.awayText, borderBottom: 'none', borderTop: 'none', boxShadow: 'none'});
      setFsmStyle('.fsm-board #homeName', {color: teamColors.homeText});
      setFsmStyle('.fsm-board #awayName', {color: teamColors.awayText});
      setFsmStyle('.fsm-board #team-logo-left', {background: teamColors.homeBg, border: 'none'});
      setFsmStyle('.fsm-board #team-logo-right', {background: teamColors.awayBg, border: 'none'});
    } else {
      // default / cl / seriea / ligue1 등 나머지 모든 테마 — 팀명 칸 아래 5px 팀 컬러 줄
      // (테마별 고정 배경색은 applyTheme() 안의 switch에서 이미 지정됨)
      setFsmStyle('.fsm-board .teams-left', {background: '', borderBottom: '5px solid ' + teamColors.homeBg, borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: '', borderBottom: '5px solid ' + teamColors.awayBg, borderTop: 'none'});
      setFsmStyle('.fsm-board .team-logo img', {outline: 'none'});
    }
  }

  /** 덴마크 테마 — 팀 컬러 칸마다 타이머와 같은 기울기의 SVG 삼각형(번호색 선 포함)을 한 번만 만들어 넣는다. */
  function ensureDanishTriangles() {
    const namespace = 'http://www.w3.org/2000/svg';
    document.querySelectorAll('.fsm-board .team-color').forEach(panel => {
      if (panel.querySelector('.danish-triangle')) return;
      const svg = document.createElementNS(namespace, 'svg');
      svg.setAttribute('class', 'danish-triangle');
      svg.setAttribute('viewBox', '0 0 1 1');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      // 타이머와 같은 0.3 기울기에 번호색 선을 겹쳐 그립니다.
      const fill = document.createElementNS(namespace, 'path');
      fill.setAttribute('class', 'danish-triangle-fill');
      fill.setAttribute('d', 'M0 0 H1 V1 Z');
      const defs = document.createElementNS(namespace, 'defs');
      const clip = document.createElementNS(namespace, 'clipPath');
      const clipId = `danish-triangle-clip-${panel.id}`;
      clip.setAttribute('id', clipId);
      const clipShape = document.createElementNS(namespace, 'path');
      clipShape.setAttribute('d', 'M0 0 H1 V1 Z');
      clip.append(clipShape);
      defs.append(clip);
      const edge = document.createElementNS(namespace, 'path');
      edge.setAttribute('class', 'danish-triangle-edge');
      edge.setAttribute('d', 'M0 0 L1 1');
      // 번호색 선을 삼각형 내부로 제한해 타이머와 만나는 사선의 외곽을 유지합니다.
      edge.setAttribute('clip-path', `url(#${clipId})`);
      svg.append(defs, fill, edge);
      panel.append(svg);
    });
  }

  /** 러시아 컵 팀컬러 칸에 좌우 방향에 맞는 삼각형과 내부 경계선용 SVG를 생성합니다. */
  function ensureRussianCupTriangles() {
    const namespace = 'http://www.w3.org/2000/svg';
    document.querySelectorAll('.fsm-board .team-color').forEach(panel => {
      if (panel.querySelector('.russiancup-triangle')) return;
      const svg = document.createElementNS(namespace, 'svg');
      svg.setAttribute('class', 'russiancup-triangle');
      svg.setAttribute('viewBox', '0 0 48 48');
      svg.setAttribute('aria-hidden', 'true');
      const shape = panel.id === 'homeColor' ? 'M0 0 H48 L0 48 Z' : 'M0 48 H48 V0 Z';
      const defs = document.createElementNS(namespace, 'defs');
      const clip = document.createElementNS(namespace, 'clipPath');
      const id = `russiancup-clip-${panel.id}`;
      clip.setAttribute('id', id);
      const clipShape = document.createElementNS(namespace, 'path');
      clipShape.setAttribute('d', shape);
      clip.append(clipShape);
      defs.append(clip);
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', shape);
      path.setAttribute('clip-path', `url(#${id})`);
      svg.append(defs, path);
      panel.append(svg);
    });
  }

  /**
   * 경기 점수·합계 점수·로고의 전체 너비에 맞춰 CNL 원형 경계와 팀컬러 곡선을 갱신합니다.
   * @param {HTMLElement} board 현재 FSM 점수판 요소입니다.
   * @param {number|null} fixedInnerRadius 로고 원만 감싸는 테마의 고정 안쪽 반지름입니다.
   * @param {boolean} withTeamCurves 중앙 원 바깥 팀컬러 원호를 생성할지 여부입니다.
   */
  function syncCnlGeometry(board, fixedInnerRadius = null, withTeamCurves = true) {
    // 합계 숫자도 경기 점수·로고와 같은 원 안에 포함합니다. 숨긴 합계 칸의 폭은 0입니다.
    const centerWidth = Array.from(board.querySelectorAll('#team-score-left, .score-div, #team-score-right, .total-score'))
      .reduce((sum, node) => sum + node.offsetWidth, 0);
    const innerRadius = fixedInnerRadius ?? centerWidth / 2;
    const radius = innerRadius + 7;
    const halfHeight = 24;
    const outerX = radius - Math.sqrt(radius * radius - halfHeight * halfHeight);
    const innerX = radius - Math.sqrt(innerRadius * innerRadius - halfHeight * halfHeight);
    board.style.setProperty('--cnl-radius', `${innerRadius}px`);
    board.style.setProperty('--cnl-color-offset', `${radius}px`);
    if (!withTeamCurves) return;
    const shape = `M${outerX} 0 A${radius} ${radius} 0 0 0 ${outerX} 48 L${innerX} 48 A${innerRadius} ${innerRadius} 0 0 1 ${innerX} 0 Z`;
    const namespace = 'http://www.w3.org/2000/svg';
    board.querySelectorAll('.team-color').forEach(panel => {
      let svg = panel.querySelector('.cnl-curve');
      if (!svg) {
        svg = document.createElementNS(namespace, 'svg');
        svg.setAttribute('class', 'cnl-curve');
        svg.setAttribute('viewBox', '0 0 16 48');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(namespace, 'path');
        svg.append(path);
        panel.append(svg);
      }
      svg.setAttribute('viewBox', `0 0 ${fixedInnerRadius == null ? 16 : 24} 48`);
      svg.firstElementChild.setAttribute('d', shape);
    });
  }

  /** J리그 팀컬러 칸의 양 끝에 채움과 경계선으로 구성된 SVG 원호를 생성합니다. */
  function ensureJleagueArcs() {
    const namespace = 'http://www.w3.org/2000/svg';
    document.querySelectorAll('.fsm-board .team-color').forEach(panel => {
      if (panel.querySelector('.jleague-arc')) return;
      ['start', 'end'].forEach(edge => {
        const svg = document.createElementNS(namespace, 'svg');
        svg.setAttribute('class', `jleague-arc jleague-arc-${edge}`);
        svg.setAttribute('viewBox', '0 0 48 48');
        svg.setAttribute('aria-hidden', 'true');
        const fill = document.createElementNS(namespace, 'path');
        fill.setAttribute('class', 'jleague-arc-fill');
        fill.setAttribute('d', 'M0 0 A48 48 0 0 0 48 48 L0 48 Z');
        const curve = document.createElementNS(namespace, 'path');
        curve.setAttribute('class', 'jleague-arc-border');
        curve.setAttribute('d', 'M0 0 A48 48 0 0 0 48 48');
        svg.append(fill, curve);
        panel.append(svg);
      });
    });
  }

  /**
   * 승부차기 기록을 최소 다섯 칸의 성공·실패·미실시 값으로 변환합니다.
   * @param {string[]} pkArr 성공은 G, 실패는 M으로 저장한 승부차기 기록입니다.
   * @returns {number[]} 성공 1, 실패 0, 미실시 -1로 구성된 배열입니다.
   */
  function toPsoArr(pkArr) {
    const base = Math.max(5, (pkArr || []).length);
    return Array.from({ length: base }, (_, i) => {
      const v = (pkArr || [])[i];
      return v === 'G' ? 1 : v === 'M' ? 0 : -1;
    });
  }

  // 점수 또는 시계에 이미 쓰이는 고정 색상만 사용한다. 전환 중 보간색은 읽지 않는다.
  const FSM_PSO_PALETTES = Object.freeze({
    aleague: ['#3640CD', '#ffffff'],
    brazilseriea: ['#131428', '#ffffff'],
    saudikingscup: ['#7A5D3B', '#37261C'],
    chinesesuperleague: ['#0772BB', '#ffffff'],
    saudi: ['#141722', '#ffffff'],
    uzbek: ['#ffffff', '#000000'],
    acgl: ['#FF784B', '#48002B'],
    acl2: ['#73BBF6', '#181559'],
    coupedefrance: ['#ffffff', '#101B36'],
    coppaitalia: ['#661729', '#ffffff'],
    facup: ['#ED1C24', '#ffffff'],
    carabao: ['#008F5E', '#ffffff'],
    belarus: ['#233434', '#14EB4B'],
    jleague: ['#0D0D0D', '#ffffff'],
    default: ['#ffd700', '#000000'], pl: ['#3E0B3D', '#ffffff'],
    seriea: ['#0456e5', '#f5f5f5'], superlig: ['#ff0203', '#ffffff'],
    // 라리가·라리가 2·분데스리가는 추가시간 칸과 같은 배경/글자색
    laliga: ['#FF4B44', '#ffffff'], laliga2: ['#00D4D6', '#ffffff'], bundes: ['#D20515', '#ffffff'], bundes2: ['#8F9191', '#000000'],
    ekstraklasa: ['#003BEF', '#ffffff'],
    czech: ['#3041C3', '#ffffff'],
    armenian: ['#000000', '#ffffff'],
    cnl: ['#031F98', '#ffffff'],
    ligue1: ['#ffffff', '#000000'], ligue2: ['#ffffff', '#000000'],
    ligaportugal: ['#ffffff', '#102556'], eredivisie: ['#d1d1d1', '#0a0a0a'],
    concacafcc: ['#01FCDA', '#001021'], cafcc: ['#787F7E', '#ffffff'], cafcl: ['#B0902E', '#ffffff'], recopa: ['#77F8FB', '#000000'], sudamericana: ['#ffffff', '#000000'], libertadores: ['#F2DA82', '#000000'], turkishcup: ['#E51636', '#ffffff'], tff1lig: ['#ffffff', '#08151B'], belgian: ['#141809', '#ffffff'], cl: ['#00009c', '#ffffff'],
    uel: ['#ffffff', '#000000'], uecl: ['#ffffff', '#000000'], acle: ['#ffffff', '#000000'],
    unl: ['#48516E', '#ffffff'], er24: ['#ffffff', '#000000'],
    russiancup: ['#162940', '#ffffff'],
    romanian: ['#ffffff', '#ea0f0a'],
    danish: ['#BDE55E', '#000000'],
    rpl: ['#ffffff', '#0e2a5c'], fnl: ['#00c7b2', '#000000'],
    fnl2a: ['#000000', '#e31d29'], fnl2b: ['#ffffff', '#e31d29'],
    nationalleague: ['#000000', '#ffffff'],
    eflchampionship: ['#b69b42', '#ffffff'], eflleagueone: ['#7f8384', '#ffffff'],
    eflleaguetwo: ['#ffffff', '#cc0935'], kleague: ['#1F3459', '#ffffff'],
    mls: ['#e1e3e7', '#000000'], wc26: ['#A0FBDC', '#000000'],
  });

  /** PSO 띠 아래의 빠른 입력과 기존 테마 입력 버튼을 연결합니다. */
  function initPsoQuickControls(board) {
    const status = board.querySelector('.pso-status');
    const main = status.querySelector('.pso-main');
    let panel = status.querySelector('#boardPsoControls');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'boardPsoControls';
      panel.hidden = true;
      panel.innerHTML = `<div class="pso-quick-row"><div class="pso-quick-team"><button type="button" data-pso-action="pkHomeGoal" aria-label="홈 성공">S</button><button type="button" data-pso-action="pkHomeMiss" aria-label="홈 실패">F</button></div><div class="pso-quick-middle"><button type="button" data-pso-action="pkUndo" aria-label="되돌리기" title="되돌리기">↶</button><button type="button" data-pso-action="pkReset" aria-label="초기화" title="초기화">×</button></div><div class="pso-quick-team"><button type="button" data-pso-action="pkAwayGoal" aria-label="원정 성공">S</button><button type="button" data-pso-action="pkAwayMiss" aria-label="원정 실패">F</button></div></div><div class="pso-quick-hint"></div>`;
      status.append(panel);
      /** 클릭·포커스 이동·Esc가 같은 닫힘 상태와 접근성 속성을 사용합니다. */
      const close = () => { panel.hidden = true; main.setAttribute('aria-expanded', 'false'); };
      const toggle = () => { panel.hidden = !panel.hidden; main.setAttribute('aria-expanded', String(!panel.hidden)); };
      main.tabIndex = 0;
      main.setAttribute('role', 'button');
      main.setAttribute('aria-label', '승부차기 입력 열기');
      main.setAttribute('aria-controls', panel.id);
      main.setAttribute('aria-expanded', 'false');
      main.addEventListener('click', toggle);
      main.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      });
      panel.addEventListener('click', event => {
        const action = event.target.closest('[data-pso-action]')?.dataset.psoAction;
        if (action && state.half === 'PK') document.getElementById(action)?.click();
      });
      document.addEventListener('pointerdown', event => { if (!status.contains(event.target)) close(); });
      document.addEventListener('focusin', event => { if (!status.contains(event.target)) close(); });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) { close(); main.focus({preventScroll: true}); }
      });
    }
    // 가운데 글자의 여백까지 공유해 버튼과 공 영역의 경계를 맞춥니다.
    const middle = main.querySelector('.pso-middle');
    const style = getComputedStyle(middle);
    panel.style.setProperty('--pso-middle-width', `${middle.offsetWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight)}px`);
    const hint = document.getElementById('psoControlHint');
    if (hint) {
      const keys = [...hint.querySelectorAll('.kbd')];
      const input = document.createElement('span');
      const history = document.createElement('span');
      const key = index => keys[index]?.cloneNode(true) || document.createTextNode('');
      input.append('홈 성공/실패 ', key(0), '/', key(1), ' · 원정 성공/실패 ', key(2), '/', key(3));
      history.append('되돌리기 ', key(4), ' · 초기화 ', key(5));
      panel.querySelector('.pso-quick-hint').replaceChildren(input, history);
    }
    panel.querySelectorAll('.pso-quick-team button').forEach(button => {
      button.textContent = button.dataset.psoAction.endsWith('Goal') ? '성공' : '실패';
    });
  }

  /** 승부차기 상태에서만 타이머 위치에 PSO를 표시하고 기록·테마 색상·서든데스 폭을 맞춥니다. */
  function applyPSO() {
    const isPso = state.half === 'PK';
    setFsmStyle('.fsm-board .pso-status', {height: isPso ? 'auto' : '0'});
    document.querySelector('.fsm-board').dataset.fsmPso = String(isPso);
    if (!isPso) {
      document.querySelector('#boardPsoControls')?.setAttribute('hidden', '');
      document.querySelector('.pso-main[role="button"]')?.setAttribute('aria-expanded', 'false');
      return;
    }
    const board = document.querySelector('.fsm-board');
    const clock = board.querySelector('.time');
    const boardRect = board.getBoundingClientRect();
    const scale = boardRect.width / board.offsetWidth || 1;
    const top = (clock.getBoundingClientRect().top - boardRect.top) / scale;
    setFsmStyle('.fsm-board .pso-status', {top: `${top}px`});
    const [background, ink] = FSM_PSO_PALETTES[_currentTheme] || FSM_PSO_PALETTES.default;
    board.style.setProperty('--fsm-pso-background', chromaSafe(background));
    board.style.setProperty('--fsm-pso-ink', chromaSafe(ink));
    const homePso = toPsoArr(state.pk.home);  // 'G'/'M' → [1,0,-1,...] 변환
    const awayPso = toPsoArr(state.pk.away);

    initPsoQuickControls(board);
    [homePso, awayPso].forEach((attempts, side) => {
      const list = document.querySelector(side === 0 ? '#pso-left ul' : '#pso-right ul');
      if (!list) return;
      list.replaceChildren(...attempts.map(value => {
        const item = document.createElement('li');
        item.className = 'pso-circle';
        item.style.background = value === 1 ? chromaSafe(state.colors.pkGoal) : value === 0 ? chromaSafe(state.colors.pkMiss) : '';
        return item;
      }));
    });
    // 서든데스에서는 공을 줄바꿈하지 않고 양쪽 영역을 같은 폭으로 늘립니다.
    const circle = board.querySelector('.pso-circle');
    const circleStyle = getComputedStyle(circle);
    const slotWidth = circle.offsetWidth + parseFloat(circleStyle.marginLeft) + parseFloat(circleStyle.marginRight);
    const middleWidth = parseFloat(board.querySelector('#boardPsoControls').style.getPropertyValue('--pso-middle-width'));
    const count = Math.max(homePso.length, awayPso.length);
    board.querySelector('.pso-status').style.width = `${Math.max(360, 5 * slotWidth * 2 + middleWidth) + Math.max(0, count - 5) * slotWidth * 2}px`;
  }

  /**
   * 팀명 영역의 그라데이션 대비를 검사해 읽기 쉬운 검정 또는 흰 글자색을 선택합니다.
   * @param {string} primary 그라데이션의 팀 배경색입니다.
   * @param {string} number 그라데이션의 등번호 색상입니다.
   * @returns {string} 대비 기준을 만족하면 black, 그렇지 않으면 white입니다.
   */
  function getFsmGradientNameInk(primary, number) {
    const a = parseAnyColor(primary), b = parseAnyColor(number);
    if (!a || !b) return 'white';
    // Black must remain readable across the central text region; otherwise
    // white with a black stroke also covers mixed light/dark gradients.
    const blackContrast = [0.25, 0.5, 0.75].map(t => {
      const color = `rgb(${Math.round(a.r + (b.r - a.r) * t)}, ${Math.round(a.g + (b.g - a.g) * t)}, ${Math.round(a.b + (b.b - a.b) * t)})`;
      return teamColorContrastRatio(color, '#000000');
    });
    return Math.min(...blackContrast) >= 4.5 ? 'black' : 'white';
  }

  /**
   * 배경색의 가중 밝기를 기준으로 검정 또는 흰 글자색을 선택합니다.
   * @param {string} color 파싱할 배경 색상입니다.
   * @returns {string} 밝은 배경에는 #000000, 어둡거나 유효하지 않은 배경에는 #ffffff입니다.
   */
  function getColorContract(color) {
    const rgb = parseAnyColor(color);
    if (!rgb || ![rgb.r, rgb.g, rgb.b].every(Number.isFinite)) return '#ffffff';
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return brightness > 130 ? '#000000' : '#ffffff';
  }

(function init() {
  // 페이지 로드 즉시 default(친선경기) CSS 적용(저장된 리그 아이디가 없을 시)
  if(state.leagueId == null) {
    changeCSS('css/theme/result_style_default.css');
  }
})();

/** 점수판 내용·승부차기·메모 배치·배율을 갱신하고 준비된 점수판을 표시합니다. */
window.fsmBoardRender = function() { applyText(); applyPSO(); autoLayoutNotes(); initBoardScale(); revealFsmBoard(); };

if (document.fonts) {
  document.fonts.ready.then(() => window.fsmBoardRender());
  // 최초 글꼴 준비 완료 이후에도 테마 변경으로 새 글꼴이 로딩될 수 있습니다.
  // 대체 글꼴이 아닌 로딩된 글꼴로 숫자의 위치 보정값을 다시 계산합니다.
  document.fonts.addEventListener('loadingdone', () => window.fsmBoardRender());
}
