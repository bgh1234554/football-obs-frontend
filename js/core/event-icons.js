// Approved raster artwork, cropped at render time without changing the source files.
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

/** Decorative icon; the enclosing event, badge or control supplies its label. */
function footballIconHtml(key) {
  if (key === 'subst') {
    return '<svg class="football-icon football-icon-subst" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="football-icon-in" d="M7 20V4M3 8l4-4 4 4"/><path class="football-icon-out" d="M17 4v16M13 16l4 4 4-4"/></svg>';
  }
  const bounds = FOOTBALL_ICON_ASSETS[key];
  if (!bounds) return '<span class="football-icon-unknown" aria-hidden="true"></span>';
  const asset = name => appAssetPath(`resources/icons/events/${name}.png`);
  const raster = (name, cls = '') => `<image class="${cls}" href="${asset(name)}" width="1254" height="1254"/>`;
  // OFF uses the approved PNG unchanged. ON changes only the check color.
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
