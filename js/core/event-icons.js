/**
 * [이벤트 아이콘: 공통 자산과 장식용 HTML]
 * 이벤트 패널과 선수 배지/컨트롤이 같은 그림을 사용하도록 HTML 생성 경로를 모은다.
 * 각 배열은 SVG viewBox의 x/y/폭/높이이며 원본 1254px PNG를 바꾸지 않고 표시 여백만 잘라낸다.
 *
 * 처리 순서:
 *  1. 교체는 색상 지정이 가능한 양방향 화살표 SVG를 직접 반환한다.
 *  2. 다른 종류는 등록된 경계를 확인하고 PNG 또는 VAR 합성 그림을 SVG 안에 배치한다.
 *  3. 알 수 없는 종류는 빈 장식 요소로 반환해 호출자의 행 구조를 유지한다.
 *
 * 아이콘 자체는 aria-hidden이다. 의미와 접근성 이름은 아이콘을 사용하는 이벤트/버튼이 제공한다.
 */
const FOOTBALL_ICON_ASSETS = Object.freeze({
  'goal': [53, 52, 1149, 1150],
  'own-goal': [46, 46, 1159, 1155],
  'assist': [55, 137, 1148, 1035],
  'pk-goal': [147, 342, 960, 575],
  'pk-miss': [147, 342, 961, 575],
  'yellow-card': [241, 76, 772, 1102],
  'red-card': [241, 75, 772, 1103],
  'cumulative-red': [216, 75, 822, 1112],
  'var': [88, 281, 1079, 721],
  'var-confirm': [88, 281, 1079, 720],
  'var-cancel': [88, 280, 1079, 721],
  'var-card-change': [88, 281, 1079, 720],
});

/** 등록된 내부 키를 받아 장식용 아이콘 HTML을 반환한다. 외부 입력을 검증하는 함수는 아니다. */
function footballIconHtml(key) {
  if (key === 'subst') {
    return '<svg class="football-icon football-icon-subst" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="football-icon-in" d="M7 20V4M3 8l4-4 4 4"/><path class="football-icon-out" d="M17 4v16M13 16l4 4 4-4"/></svg>';
  }
  const bounds = FOOTBALL_ICON_ASSETS[key];
  if (!bounds) return '<span class="football-icon-unknown" aria-hidden="true"></span>';
  const asset = name => appAssetPath(`resources/icons/events/${name}.png`);
  const raster = (name, cls = '') => `<image class="${cls}" href="${asset(name)}" width="1254" height="1254"/>`;
  // VAR 확정은 원본 그림과 CSS 색상 변경용 체크 레이어를 함께 두고 표시 조건을 CSS에 맡긴다.
  // 판정 변경은 카드 두 장과 양방향 화살표를 합성해 단순 VAR 확정/취소와 구분한다.
  // 노랑·빨강 카드와 양방향 화살표를 함께 보여 판정 변경과 퇴장 확정을 구분한다.
  const contents = key === 'var-card-change'
    ? raster('var-monitor')
      + '<rect x="250" y="405" width="215" height="335" rx="24" fill="#facc15"/>'
      + '<rect x="790" y="405" width="215" height="335" rx="24" fill="#ef4444"/>'
      + '<path d="M520 510H735M680 455L735 510L680 565M735 640H520M575 585L520 640L575 695" fill="none" stroke="#fff" stroke-width="50" stroke-linecap="round" stroke-linejoin="round"/>'
    : key === 'var-confirm'
    ? raster(key, 'football-icon-confirm-original')
      + `<g class="football-icon-confirm-chroma">${raster('var-monitor')}<path class="football-icon-check" d="M433 570 L585 720 L860 448"/></g>`
    : raster(key);
  return `<svg class="football-icon football-icon-${key}" viewBox="${bounds.join(' ')}" aria-hidden="true" focusable="false">${contents}</svg>`;
}
