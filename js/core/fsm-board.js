function setFsmStyle(selector, styles, index) {
  const nodes = document.querySelectorAll(selector);
  (index == null ? Array.from(nodes) : [nodes[index]]).filter(Boolean).forEach(node => Object.assign(node.style, styles));
}
function setFsmText(selector, value) {
  document.querySelectorAll(selector).forEach(node => { node.textContent = value ?? ''; });
}
function setFsmAttr(selector, name, value) {
  document.querySelectorAll(selector).forEach(node => {
    if (value) node.setAttribute(name, value); else node.removeAttribute(name);
  });
}
const LEAGUE_THEME_MAP = {
  39:  { theme: 'pl',      logoUrl: 'https://indvel.github.io/utils/fsm/logos/EPL/premierleague-1536x1536.png', type: 'club' },
  2:   { theme: 'cl',      logoUrl: null, type: 'club' },  // UEFA 챔피언스리그 (leagues.csv CDN URL 우선)
  3:   { theme: 'uel',     logoUrl: null, type: 'club' },  // UEFA 유로파리그
  848: { theme: 'uecl',    logoUrl: null, type: 'club' },  // UEFA 컨퍼런스 리그
  17:  { theme: 'acle',    logoUrl: null, type: 'club' },  // AFC 챔피언스리그 엘리트
  5:   { theme: 'unl',     logoUrl: null, type: 'national' },  // UEFA 네이션스리그
  4:   { theme: 'er24',    logoUrl: null, type: 'national' },  // UEFA 유로 2024
  61:  { theme: 'ligue1',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/Ligue1/france_ligue-1-logos.svg', type: 'club' },
  62:  { theme: 'ligue2',  logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/Ligue2Black.svg', type: 'club' },  // 프랑스 리그2 — 추후 logoUrl에 전용 로고 URL 지정
  135: { theme: 'seriea',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/SerieA/Serie_A_symbol_stroke.svg', type: 'club' },
  235: { theme: 'rpl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RPL.svg', type: 'club' },  // Russian Premier League - API logo
  236: { theme: 'fnl', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianFirstLeague.svg', type: 'club' },
  1025: { theme: 'fnl2a', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueA.svg', type: 'club' },
  1026: { theme: 'fnl2a', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueA.svg', type: 'club' },
  651: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  652: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  650: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  653: { theme: 'fnl2b', logoUrl: 'https://bgh1234554.github.io/football-obs-logo-cdn/leagues/RussianSecondLeagueB.svg', type: 'club' },
  292: { theme: 'kleague', logoUrl: null, type: 'club' },  // K리그 1
  293: { theme: 'kleague', logoUrl: null, type: 'club' },  // K리그 2
  294: { theme: 'kleague', logoUrl: null, type: 'club' },  // 코리아컵
  295: { theme: 'kleague', logoUrl: null, type: 'club' },  // K3리그
  1166:{ theme: 'cwc25',   logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2025FIFACWC.svg', type: 'club' },
  1:   { theme: 'wc26', logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2026FIFAWorldCup_white.svg', type: 'national' }
  // 리그 추가 시 여기에만 한 줄 추가
};
const FSM_FALLBACK_THEME = 'default';  // 친선경기 포함 매핑 없는 모든 리그
const FSM_FALLBACK_TYPE = 'club';
const FSM_THEMES = Object.freeze({
  default: '기본', pl: '프리미어 리그', seriea: '세리에 A', ligue1: '리그 1', ligue2: '리그 2',
  cl: 'UEFA 챔피언스 리그',  uel: 'UEFA 유로파 리그', uecl: 'UEFA 컨퍼런스 리그', acle: 'AFC 챔피언스리그 엘리트',
  unl: '네이션스리그', er24: '유로',
  rpl: '러시아 프리미어 리그', fnl: '러시아 퍼스트 리그', fnl2a: '러시아 세컨드리그 A', fnl2b: '러시아 세컨드리그 B',
  kleague: 'K리그', wc26: '월드컵'
});

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
const CSS_LINK_INDEX = 17;
var _currentTheme = 'default';
var _currentType = 'club';
var _timerMargin = 'none';

window.autoApplyTemplateByLeagueId = function(leagueId, apiLeagueLogoUrl) {
  const selectedTheme = Object.hasOwn(FSM_THEMES, state.fsmTheme) ? state.fsmTheme : null;
  const entry = selectedTheme
    ? Object.values(LEAGUE_THEME_MAP).find(entry => entry.theme === selectedTheme)
    : LEAGUE_THEME_MAP[leagueId];
  const theme = selectedTheme || (entry ? entry.theme : FSM_FALLBACK_THEME);
  const type = entry ? entry.type : FSM_FALLBACK_TYPE;
  // API 응답 URL 우선, 없으면 LEAGUE_THEME_MAP의 fallback URL 사용
  const logoUrl = entry?.logoUrl || apiLeagueLogoUrl || null;

  _currentType = type;
  // FSM의 기존 switch 로직을 그대로 재활용
  applyTheme(theme, logoUrl);
};

var oldlink = document.getElementById('fsm-theme-link');
var pendingThemeLink = null;
var fsmEntranceEndListener = null;
var fsmInitialStateReady = false;

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

function applyTheme(theme, logoUrl) {
  // FSM의 switch(data.theme) 블록을 함수로 추출한 것
  switch(theme) {
    case 'pl':
      changeCSS('css/theme/result_style_EPL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'kleague':
      changeCSS('css/theme/result_style_KLEAGUE.css', theme);
      break;
    case 'rpl':
      changeCSS('css/theme/result_style_RPL.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'seriea':
      changeCSS('css/theme/result_style_SERIEA.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'cl':
      changeCSS('css/theme/result_style_CL.css', theme);
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
    case 'ligue1':
      changeCSS('css/theme/result_style_LIGUE1.css', theme);
      setFsmAttr('.epl-lion', 'src', logoUrl);
      break;
    case 'ligue2':
      changeCSS('css/theme/result_style_LIGUE2.css', theme);
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
    default:
      changeCSS('css/theme/result_style_default.css', 'default');
  }
}

  // applyText()는 data 대신 state를 읽도록 수정
  function applyText() {
    const board = document.querySelector('.fsm-board');
    if (board) board.dataset.fsmTheme = _currentTheme;
    setFsmText('.fsm-board #team-text-left', state.homeName);   // data.teamLeft.name → state.homeName
    setFsmText('.fsm-board #homeScore', state.homeScore);
    setFsmText('.fsm-board #team-text-right', state.awayName);
    setFsmText('.fsm-board #awayScore', state.awayScore);




    // 팀 로고: state.homeLogo / state.awayLogo는 백엔드 logos.csv CDN URL에서 옵니다.
    // logos.csv에 indvel GitHub CDN URL을 등록하면 여기서 자동으로 반영됩니다.


    // 팀 컬러 언더라인 — 현재 테마에 따라 다르게 처리 (applyTheme()에서 호출됨)
    // pl2 테마는 언더라인 대신 팀 컬러 배경을 사용: state.colors.homeBg / state.colors.awayBg
    // 나머지 테마는 state.colors.homeBg 를 border-bottom 색상으로 사용
    applyTeamColors();

    const clock = board.querySelector('.time');
    setFsmStyle('.fsm-board .extra-time', {
      marginLeft: '0px', left: `calc(50% + ${clock.offsetWidth / 2}px)`
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
       setFsmStyle('.pso-main', {height: '32px'});
       setFsmStyle('.pso-status', {display: 'flex'});
    } else {
       setFsmStyle('.pso-main', {height: '0px'});
       setFsmStyle('.pso-status', {display: 'none'});
    }

    if(_currentTheme == 'cl' || _currentTheme == 'uel' || _currentTheme == 'uecl' || _currentTheme == 'acle' || _currentTheme == 'default') {
      if(state.aggEnabled) {
        var aggHome = (Number(state.aggHomeBase)||0)+(Number(state.homeScore)||0);
        var aggAway = (Number(state.aggAwayBase)||0)+(Number(state.awayScore)||0);
        setFsmText('.fsm-board #totalScoreLeft', aggHome);
        setFsmText('.fsm-board #totalScoreRight', aggAway);
        setFsmStyle('.fsm-board .total-score', {display: 'flex', opacity: '100%'});
      } else {
        setFsmStyle('.fsm-board .total-score', {display: 'none', opacity: '0'});
      }
    } else {
        setFsmStyle('.fsm-board .total-score', {display: 'none', opacity: '0'});
    }
    adjustScoreboardWidth();
  }

  // 팀명 길이에 따라 폰트 크기 조정
const FSM_WIDTH_LIMITS = Object.freeze({
  minBoard: 520, maxBoard: 1080,
  minTeam: 220, maxTeam: 480,
  teamPadding: 48, maxFont: 33, minFont: 12
});

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
  // 합산 점수가 표시되는 경우 이를 포함해 실제 테마 영역을 측정합니다.
  const fixedWidth = Array.from(scoreboard.children).reduce((sum, child) => {
    const style = getComputedStyle(child);
    if (cards.includes(child) || style.position === 'absolute' || style.display === 'none') return sum;
    return sum + child.offsetWidth + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  }, 0);
  board.style.removeProperty('--fsm-name-reserved-width');
  board.style.removeProperty('--fsm-score-overlap');
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
  if (['seriea', 'rpl', 'wc26', 'ligue1', 'ligue2', 'fnl', 'fnl2a', 'fnl2b'].includes(_currentTheme)) {
    // 절대 위치의 점수 영역이 팀 카드와 겹치므로 실제 표시 경계를 기준으로
    // 세리에 A의 기울기까지 반영하여 바깥쪽 팀명 영역을 계산합니다.
    const scale = scoreboard.getBoundingClientRect().width / scoreboard.offsetWidth || 1;
    const homeScore = document.getElementById('team-score-left').getBoundingClientRect();
    const awayScore = document.getElementById('team-score-right').getBoundingClientRect();
    const overlap = Math.max(0,
      (cards[0].getBoundingClientRect().right - homeScore.left) / scale,
      (awayScore.right - cards[1].getBoundingClientRect().left) / scale);
    const reserved = overlap + (_currentTheme === 'wc26' ? 41 : _currentTheme === 'rpl' ? 8 : 0);
    board.style.setProperty('--fsm-score-overlap', overlap + 'px');
    board.style.setProperty('--fsm-name-reserved-width', reserved + 'px');
  }
  const reservedWidth = parseFloat(getComputedStyle(board).getPropertyValue('--fsm-name-reserved-width')) || 0;
  const requestedTeam = Math.max(limits.minTeam, ...widths.map((width, index) => {
    const style = getComputedStyle(names[index]);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    // 점수 영역을 위해 이미 확보한 여백은 중복해서 더하지 않습니다.
    const margin = Math.max(0,
      (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0) - reservedWidth);
    return width + Math.max(limits.teamPadding, padding + margin) + reservedWidth;
  }));
  const requestedBoard = Math.max(limits.minBoard, fixedWidth + 2 * requestedTeam);
  const boardWidth = Math.min(limits.maxBoard, requestedBoard, fixedWidth + 2 * limits.maxTeam);
  const teamWidth = Math.max(0, (boardWidth - fixedWidth) / 2);
  cards.forEach(card => { card.style.width = teamWidth + 'px'; });
  scoreboard.style.width = boardWidth + 'px';
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
    if (['pl', 'unl'].includes(_currentTheme) && Number.isFinite(metrics.fontBoundingBoxAscent)) {
      // 합성 굵기가 적용된 한글은 글꼴 측정값과 실제 픽셀 높이가 다를 수 있습니다.
      // 실제로 그려진 글자의 상하 경계로 프리미어리그와 네이션스리그 팀명을 보정합니다.
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


  // 테마별 팀 컬러 적용 분기 — applyText()와 applyTheme() 양쪽에서 호출
  function applyTeamColors() {
    const theme = _currentTheme;  // applyTheme()에서 갱신하는 내부 변수
    const colorBoard = document.querySelector('.fsm-board');
    if (colorBoard) {
      colorBoard.style.setProperty('--fsm-home-number-color', state.colors.homeText);
      colorBoard.style.setProperty('--fsm-away-number-color', state.colors.awayText);
      colorBoard.style.setProperty('--fsm-away-primary-color', state.colors.awayBg);
      colorBoard.style.setProperty('--fsm-home-primary-color', state.colors.homeBg);

      colorBoard.dataset.fsmColorEdge = ['pl', 'fnl', 'fnl2a', 'fnl2b', 'wc26', 'uel', 'uecl'].includes(theme)
        ? 'none' : theme === 'rpl' ? 'chip' : 'strip';
    }
    if(theme == 'pl') {
      setFsmStyle('.fsm-board .teams-left', {background: state.colors.homeBg, color: getColorContract(state.colors.homeBg), borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: state.colors.awayBg, color: getColorContract(state.colors.awayBg), borderBottom: 'none', borderTop: 'none'});
      const board = document.querySelector('.fsm-board');
      ['home', 'away'].forEach(side => {
        // CSS transitions expose the previous/interpolated background here.
        // Contrast must follow the requested color immediately.
        const rgb = parseAnyColor(state.colors[`${side}Bg`]);
        const nearWhite = rgb && Math.min(rgb.r, rgb.g, rgb.b) >= 235;
        board.style.setProperty(`--fsm-pl-${side}-overlay`,
          nearWhite ? '#000000' : '#ffffff');
      });
    } else if(['fnl', 'fnl2a', 'fnl2b'].includes(theme)) {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
    } else if(theme == 'wc26') {
      setFsmStyle('.fsm-board .teams-left', {background: 'black', color: 'white', borderBottom: '3px solid #E9A186', borderTop: '3px solid #661D18'});
      setFsmStyle('.fsm-board .teams-right', {background: 'black', color: 'white', borderBottom: '3px solid #BDE74C', borderTop: '3px solid #AD8BF7'});
      setFsmStyle('.fsm-board #homeColor', {background: state.colors.homeBg});
      setFsmStyle('.fsm-board #awayColor', {background: state.colors.awayBg});
    } else if(theme == 'rpl') {
      setFsmStyle('.fsm-board .teams-left, .fsm-board .teams-right', {background: '', color: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: state.colors.homeBg});
      setFsmStyle('.fsm-board #awayColor', {background: state.colors.awayBg});
    } else if(theme == 'uel' || theme == 'uecl') {
      setFsmStyle('.fsm-board .teams-left', {background: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: '', borderBottom: 'none', borderTop: 'none'});
      setFsmStyle('.fsm-board #homeColor', {background: 'linear-gradient(to bottom, ' + state.colors.homeBg + ' 50%, ' + state.colors.homeText + ' 50%)'});
      setFsmStyle('.fsm-board #awayColor', {background: 'linear-gradient(to bottom, ' + state.colors.awayBg + ' 50%, ' + state.colors.awayText + ' 50%)'});    
    } else if(theme != 'pl' && theme != 'wc26' && theme != 'uel' && theme != 'uecl') {
      // default / pl / cl / uel / 나머지 모든 테마
      setFsmStyle('.fsm-board .teams-left', {background: '', borderBottom: '5px solid ' + state.colors.homeBg, borderTop: 'none'});
      setFsmStyle('.fsm-board .teams-right', {background: '', borderBottom: '5px solid ' + state.colors.awayBg, borderTop: 'none'});
      setFsmStyle('.fsm-board .team-logo > img', {outline: 'none'});
      // 테마별 고정 배경색은 applyTheme() 안의 switch에서 이미 지정됨 — 여기서 다시 쓸 필요 없음
    }
  }

  function toPsoArr(pkArr) {
    const base = Math.max(5, (pkArr || []).length);
    return Array.from({ length: base }, (_, i) => {
      const v = (pkArr || [])[i];
      return v === 'G' ? 1 : v === 'M' ? 0 : -1;
    });
  }

  // applyPSO()도 state.pk 배열 읽도록 수정 (자세한 내용은 6-5 참조)
  function applyPSO() {
    const isPso = state.half === 'PK';
    setFsmStyle('.fsm-board .pso-status', {height: isPso ? '32px' : '0'});
    if (!isPso) return;
    const homePso = toPsoArr(state.pk.home);  // 'G'/'M' → [1,0,-1,...] 변환
    const awayPso = toPsoArr(state.pk.away);

    [homePso, awayPso].forEach((attempts, side) => {
      const list = document.querySelector(side === 0 ? '#pso-left ul' : '#pso-right ul');
      if (!list) return;
      list.replaceChildren(...attempts.map(value => {
        const item = document.createElement('li');
        item.className = 'pso-circle';
        item.style.background = value === 1 ? 'limegreen' : value === 0 ? 'red' : '';
        return item;
      }));
    });
  }

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

window.fsmBoardRender = function() { applyText(); applyPSO(); autoLayoutNotes(); initBoardScale(); revealFsmBoard(); };

if (document.fonts) {
  document.fonts.ready.then(() => window.fsmBoardRender());
  // 최초 글꼴 준비 완료 이후에도 테마 변경으로 새 글꼴이 로딩될 수 있습니다.
  // 대체 글꼴이 아닌 로딩된 글꼴로 숫자의 위치 보정값을 다시 계산합니다.
  document.fonts.addEventListener('loadingdone', () => window.fsmBoardRender());
}
