// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [팀 컬러 수동 보정 매핑]
// API/로고 색상 추출이 대표팀 실제 유니폼 컬러와 맞지 않는 경우를 위한 비상용 테이블.
// teamId를 키로 쓰고, primaryColor는 배경색, numberColor는 글씨색으로 적용된다.
//
// 추가 예시:
//   999: { primaryColor: '#123456', numberColor: '#ffffff', label: 'Example' },
//
// 사용자 테마 직접 수정(teamColorOverride)이 켜진 fixture에서는 이 매핑도 덮어쓰지 않는다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.TEAM_COLOR_OVERRIDES = {
  12: {
    primaryColor: '#212b57',
    numberColor: '#ffffff',
    label: 'Japan national team',
  },
  25: {
    primaryColor: '#ffffff',
    numberColor: '#000000',
    label: 'Germany national team',
  },
  2382: {
    primaryColor: '#ffce00',
    numberColor: '#002255',
    label: 'Ecuador national team',
  },
};