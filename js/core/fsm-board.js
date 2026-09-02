const LEAGUE_THEME_MAP = {
  // EPL: 'pl' 또는 'pl2' 중 선택. pl2는 팀 컬러가 배경이 되는 스타일
  39:  { theme: 'pl',      logoUrl: 'https://indvel.github.io/utils/fsm/logos/EPL/premierleague-1536x1536.png', type: 'club' },
  2:   { theme: 'cl',      logoUrl: null, type: 'club' },  // UEFA Champions League (leagues.csv CDN URL 우선)
  3:   { theme: 'uel',     logoUrl: null, type: 'club' },  // UEFA Europa League
  17:  { theme: 'acle',    logoUrl: null, type: 'club' },  // AFC Champions League Elite
  5:   { theme: 'unl',     logoUrl: null, type: 'national' },  // UEFA Nations League
  4:   { theme: 'er24',    logoUrl: null, type: 'national' },  // UEFA Euro 2024
  61:  { theme: 'ligue1',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/Ligue1/ligue-1-2020-2024-logo.png', type: 'club' },
  135: { theme: 'seriea',  logoUrl: 'https://indvel.github.io/utils/fsm/logos/SerieA/Serie_A_symbol_stroke.svg', type: 'club' },
  292: { theme: 'kleague', logoUrl: null, type: 'club' },  // K League 1
  1166:{ theme: 'cwc25',   logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2025FIFACWC.svg', type: 'club' },
  1:   { theme: 'wc26', logoUrl: 'https://indvel.github.io/utils/fsm/logos/Cups/2026FIFAWorldCup_white.svg', type: 'national' }
  // 리그 추가 시 여기에만 한 줄 추가
};
const FSM_FALLBACK_THEME = 'default';  // 친선경기 포함 매핑 없는 모든 리그
const FSM_FALLBACK_TYPE = 'club';
const CSS_LINK_INDEX = 17;
var _currentTheme = 'default';
var _currentType = 'club';

window.autoApplyTemplateByLeagueId = function(leagueId, apiLeagueLogoUrl) {
  const entry = LEAGUE_THEME_MAP[leagueId];
  const theme = entry ? entry.theme : FSM_FALLBACK_THEME;
  const type = entry ? entry.type : FSM_FALLBACK_TYPE;
  // API 응답 URL 우선, 없으면 LEAGUE_THEME_MAP의 fallback URL 사용
  const logoUrl = entry?.logoUrl || apiLeagueLogoUrl || null;

  _currentTheme = theme;
  _currentType = type;
  state.leagueId = leagueId;
  state.leagueLogoUrl = logoUrl;
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
      changeCSS('css/theme/result_style_EPL.css', CSS_LINK_INDEX);
      jQuery('.epl-lion').attr('src', logoUrl);
      break;
    case 'kleague':
      changeCSS('css/theme/result_style_KLEAGUE.css', CSS_LINK_INDEX);
      break;
    case 'seriea':
      changeCSS('css/theme/result_style_SERIEA.css', CSS_LINK_INDEX);
      jQuery('.epl-lion').attr('src', logoUrl);
      break;
    case 'cl':
      changeCSS('css/theme/result_style_CL.css', CSS_LINK_INDEX);
      break;
    case 'uel':
      changeCSS('css/theme/result_style_UEL.css', CSS_LINK_INDEX);
      break;
    case 'unl':
      changeCSS('css/theme/result_style_UNL.css', CSS_LINK_INDEX);
      break;
    case 'acle':
      changeCSS('css/theme/result_style_ACLE.css', CSS_LINK_INDEX);
      break;
    case 'ligue1':
      changeCSS('css/theme/result_style_LIGUE1.css', CSS_LINK_INDEX);
      jQuery('.epl-lion').attr('src', logoUrl);
      break;
    case 'er24':
      changeCSS('css/theme/result_style_EURO24.css', CSS_LINK_INDEX);
      break;
    case 'wc26':
      changeCSS('css/theme/result_style_WC26.css', CSS_LINK_INDEX);
      jQuery('.epl-lion').attr('src', logoUrl);
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

    if(_currentType == 'national') {
      jQuery('.fsm-board #logo-imgLeft').css({objectFit: 'cover'}).attr('src', state.homeLogo);
      jQuery('.fsm-board #logo-imgRight').css({objectFit: 'cover'}).attr('src', state.awayLogo);
    } else {
      jQuery('.fsm-board #logo-imgLeft').css({objectFit: 'contain'}).attr('src', state.homeLogo);
      jQuery('.fsm-board #logo-imgRight').css({objectFit: 'contain'}).attr('src', state.awayLogo);
    }

    // 팀 컬러 언더라인 — 현재 테마에 따라 다르게 처리 (applyTheme()에서 호출됨)
    // pl2 테마는 언더라인 대신 팀 컬러 배경을 사용: state.colors.homeBg / state.colors.awayBg
    // 나머지 테마는 state.colors.homeBg 를 border-bottom 색상으로 사용
    applyTeamColors();

    if(state.extra > 0) {
      jQuery('.fsm-board .extra-time').css({marginLeft: '180px'});
    } else {
      jQuery('.fsm-board .extra-time').css({marginLeft: '0px'});
    }

    if(state.half == 'PK') {
       jQuery('.pso-main').css({height: '32px'});
       jQuery('.pso-status').css({display: 'flex'});
    } else {
       jQuery('.pso-main').css({height: '0px'});
       jQuery('.pso-status').css({display: 'none'});
    }
  }

  // 테마별 팀 컬러 적용 분기 — applyText()와 applyTheme() 양쪽에서 호출
  function applyTeamColors() {
    const theme = _currentTheme;  // applyTheme()에서 갱신하는 내부 변수
    if (theme === 'pl') {
      jQuery('.fsm-board .teams-left').css({background: state.colors.homeBg, color: getColorContract(state.colors.homeBg), borderBottom: 'none', borderTop: 'none'});
      jQuery('.fsm-board .teams-right').css({background: state.colors.awayBg, color: getColorContract(state.colors.awayBg), borderBottom: 'none', borderTop: 'none'});
    } if (theme === 'wc26') {
      jQuery('.fsm-board .teams-left').css({background: 'black', color: 'white', borderBottom: '3px solid #E9A186', borderTop: '3px solid #661D18'});
      jQuery('.fsm-board .teams-right').css({background: 'black', color: 'white', borderBottom: '3px solid #BDE74C', borderTop: '3px solid #AD8BF7'});
      jQuery('.fsm-board #homeColor').css({background: state.colors.homeBg});
      jQuery('.fsm-board #awayColor').css({background: state.colors.awayBg});
    } else {
      // default / pl / cl / uel / 나머지 모든 테마
      jQuery('.fsm-board .teams-left').css({background: '', borderBottom: '3px solid ' + state.colors.homeBg, borderTop: 'none'});
      jQuery('.fsm-board .teams-right').css({background: '', borderBottom: '3px solid ' + state.colors.awayBg, borderTop: 'none'});
      jQuery('.fsm-board .team-logo > img').css({outline: 'none'});
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
    jQuery('.fsm-board .pso-status').css('height', isPso ? '32px' : '0');
    if (!isPso) return;
    const homePso = toPsoArr(state.pk.home);  // 'G'/'M' → [1,0,-1,...] 변환
    const awayPso = toPsoArr(state.pk.away);

    for (let i = 0; i < Math.max(homePso.length, 5); i++) {
      const lColor = homePso[i] === 1 ? 'limegreen' : homePso[i] === 0 ? 'red' : '';
      const rColor = awayPso[i] === 1 ? 'limegreen' : awayPso[i] === 0 ? 'red' : '';
      jQuery('.fsm-board #pso-left .pso-circle').eq(i).css({background: lColor});
      jQuery('.fsm-board #pso-right .pso-circle').eq(i).css({background: rColor});
    }
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
  const savedLeagueId = localStorage.getItem('obs-scoreboard-state-v2').leagueId;
  if (savedLeagueId) {
    window.autoApplyTemplateByLeagueId(Number(savedLeagueId), null);
  }
})();

window.fsmBoardRender = function() { applyText(); applyPSO(); };