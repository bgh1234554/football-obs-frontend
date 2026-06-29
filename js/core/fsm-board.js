const LEAGUE_THEME_MAP = {
  // EPL: 'pl' 또는 'pl2' 중 선택. pl2는 팀 컬러가 배경이 되는 스타일
  39:  { theme: 'pl',      logoUrl: 'https://indvel.github.io/utils/fsm/logos/EPL/premierleague-1536x1536.png' },
  2:   { theme: 'cl',      logoUrl: null },  // UEFA Champions League (leagues.csv CDN URL 우선)
  3:   { theme: 'uel',     logoUrl: null },  // UEFA Europa League
  848: { theme: 'acle',    logoUrl: null },  // AFC Champions League Elite (leagueId 확인 필요)
  5:   { theme: 'unl',     logoUrl: null },  // UEFA Nations League
  960: { theme: 'er24',    logoUrl: null },  // UEFA Euro 2024 (leagueId 확인 필요)
  61:  { theme: 'ligue1',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/Ligue1/ligue-1-2020-2024-logo.png' },
  135: { theme: 'seriea',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/SerieA/Serie_A_symbol_stroke.svg' },
  292: { theme: 'kleague', logoUrl: null },  // K League 1
  1166:{ theme: 'cwc25',   logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2025FIFACWC.svg' },  // FIFA CWC 2025 (leagueId 확인 필요)
  // 리그 추가 시 여기에만 한 줄 추가
};
const FSM_FALLBACK_THEME = 'default';  // 친선경기 포함 매핑 없는 모든 리그
const CSS_LINK_INDEX = 17;
var _currentTheme = 'default'

window.autoApplyTemplateByLeagueId = function(leagueId, apiLeagueLogoUrl) {
  const entry = LEAGUE_THEME_MAP[leagueId];
  const theme = entry ? entry.theme : FSM_FALLBACK_THEME;
  // API 응답 URL 우선, 없으면 LEAGUE_THEME_MAP의 fallback URL 사용
  const logoUrl = apiLeagueLogoUrl || entry?.logoUrl || null;

  _currentTheme = theme;
  // FSM의 기존 switch 로직을 그대로 재활용
  applyTheme(theme, logoUrl);
};

var oldlink = document.getElementById('fsm-theme-link');

function changeCSS(cssFile) {
  var newlink = document.createElement("link");
  newlink.setAttribute("rel", "stylesheet");
  newlink.setAttribute("href", cssFile);
  newlink.id = 'fsm-theme-link';
  document.head.replaceChild(newlink, oldlink);
  oldlink = newlink;  // 다음 교체를 위해 참조 갱신
}

function applyTheme(theme, logoUrl) {
  // FSM의 switch(data.theme) 블록을 함수로 추출한 것
  _currentTheme = theme;
  switch(theme) {
    case 'pl':
      changeCSS('css/theme/result_style_epl.css', CSS_LINK_INDEX);
      break;
    case 'kl':
      changeCSS('css/theme/board-theme-kleague.css', CSS_LINK_INDEX);
      break;
    default:
      changeCSS('css/theme/result_style_default.css', CSS_LINK_INDEX);
  }
}

  // applyText()는 data 대신 state를 읽도록 수정
  function applyText() {
    jQuery('.fsm-board #team-text-left').text(state.homeName);   // data.teamLeft.name → state.homeName
    jQuery('.fsm-board #score-left').text(state.homeScore);
    jQuery('.fsm-board #team-text-right').text(state.awayName);
    jQuery('.fsm-board #score-right').text(state.awayScore);

    // 팀 로고: state.homeLogo / state.awayLogo는 백엔드 logos.csv CDN URL에서 옵니다.
    // logos.csv에 indvel GitHub CDN URL을 등록하면 여기서 자동으로 반영됩니다.
    jQuery('.fsm-board #logo-imgLeft').css({objectFit: 'contain'}).attr('src', state.homeLogo);
    jQuery('.fsm-board #logo-imgRight').css({objectFit: 'contain'}).attr('src', state.awayLogo);

    // 팀 컬러 언더라인 — 현재 테마에 따라 다르게 처리 (applyTheme()에서 호출됨)
    // pl2 테마는 언더라인 대신 팀 컬러 배경을 사용: state.colors.homeBg / state.colors.awayBg
    // 나머지 테마는 state.colors.homeBg 를 border-bottom 색상으로 사용
    applyTeamColors();
  }

  // 테마별 팀 컬러 적용 분기 — applyText()와 applyTheme() 양쪽에서 호출
  function applyTeamColors() {
    const theme = _currentTheme;  // applyTheme()에서 갱신하는 내부 변수
    if (theme === 'pl') {
      jQuery('.fsm-board .teams-left').css({background: state.colors.homeBg, color: getColorContract(state.colors.homeBg), borderBottom: 'none'});
      jQuery('.fsm-board .teams-right').css({background: state.colors.awayBg, color: getColorContract(state.colors.awayBg), borderBottom: 'none'});
    } else {
      // default / pl / cl / uel / 나머지 모든 테마
      jQuery('.fsm-board .teams-left').css({borderBottom: '3px solid ' + state.colors.homeBg});
      jQuery('.fsm-board .teams-right').css({borderBottom: '3px solid ' + state.colors.awayBg});
      // 테마별 고정 배경색은 applyTheme() 안의 switch에서 이미 지정됨 — 여기서 다시 쓸 필요 없음
    }
  }

  // applyPSO()도 state.pk 배열 읽도록 수정 (자세한 내용은 6-5 참조)
  function applyPSO() {
    const isPso = state.half === 'PK';
    jQuery('.fsm-board .pso-status').css('height', isPso ? '32px' : '0');
    if (!isPso) return;
    const homePso = toPsoArr(state.pk.home);  // 'G'/'M' → [1,0,-1,...] 변환
    const awayPso = toPsoArr(state.pk.away);
    // FSM 원본 DOM 조작 코드에서 data.teamLeft.pso → homePso, data.teamRight.pso → awayPso 로 교체
  }

  function getColorContract(hex) {
    var threshold = 130;
    var hRed = hexToR(hex);
    var hGreen = hexToG(hex);
    var hBlue = hexToB(hex);

    function hexToR(h) {return parseInt((cutHex(h)).substring(0,2),16)}
    function hexToG(h) {return parseInt((cutHex(h)).substring(2,4),16)}
    function hexToB(h) {return parseInt((cutHex(h)).substring(4,6),16)}
    function cutHex(h) {return (h.charAt(0)=="#") ? h.substring(1,7):h}

    cBrightness = ((hRed * 299) + (hGreen * 587) + (hBlue * 114)) / 1000;
      if (cBrightness > threshold) { return "#000000"; } else { return "#ffffff"; } 
  }

  // render.js가 호출할 수 있도록 단 한 줄 추가
  window.fsmBoardRender = function() { applyText(); applyPSO(); };

(function init() {
  // 페이지 로드 즉시 default(친선경기) CSS 적용
  changeCSS('css/theme/result_style_default.css');

  // localStorage에 저장된 leagueId가 있으면 복원 (선택 사항)
  const savedLeagueId = localStorage.getItem('obs-last-league-id');
  if (savedLeagueId) {
    window.autoApplyTemplateByLeagueId(Number(savedLeagueId), null);
  }
})();

window.fsmBoardRender = function() { applyText(); applyPSO(); };