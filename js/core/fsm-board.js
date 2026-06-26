const LEAGUE_THEME_MAP = {
  39:  { theme: 'pl', logoUrl: 'https://indvel.github.io/utils/fsm/logos/EPL/premierleague-1536x1536.png' }
};
const FSM_FALLBACK_THEME = 'default';  // 친선경기 포함 매핑 없는 모든 리그
const CSS_LINK_INDEX = 17;

// fixture.js가 경기 로드 후 호출하는 window.autoApplyTemplateByLeagueId를 덮어씁니다.
// fixture.js는 leagueId와 함께 API 응답의 leagueLogoUrl을 두 번째 인자로 넘겨줍니다.
// (fixture.js 수정 방법은 6-6 참조)
window.autoApplyTemplateByLeagueId = function(leagueId, apiLeagueLogoUrl) {
  const entry = LEAGUE_THEME_MAP[leagueId];
  const theme = entry ? entry.theme : FSM_FALLBACK_THEME;
  // API 응답 URL 우선, 없으면 LEAGUE_THEME_MAP의 fallback URL 사용
  const logoUrl = apiLeagueLogoUrl || entry?.logoUrl || null;

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
  switch(theme) {
    case 'pl':
      changeCSS('../css/core/theme/board-theme-epl.css', CSS_LINK_INDEX);
      break;
    default:
      changeCSS('../css/core/theme/board-theme-default.css', CSS_LINK_INDEX);
  }
}