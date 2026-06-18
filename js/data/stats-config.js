// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [경기 스탯 설정] 라벨 한글 매핑 + 표시 순서 + 페이지네이션/자동 스와이프 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사용자가 수시로 라벨/순서를 바꿀 수 있도록 별도 파일로 분리.
// stats-panel.js가 이 전역 객체를 읽어서 렌더링한다.
//
// - labels: TeamStatsDto 필드명 → 한글 라벨
// - order : 표시 순서. 빠진 키는 표시 안 됨. 양 팀 모두 null인 항목은 자동 skip.
// - itemsPerPage: 한 페이지에 표시할 스탯 항목 수 (큼/작음 페이지 공통)
// - autoSwipeIntervalMs: 자동 스와이프 ON일 때 페이지 전환 간격 (ms). 설정 팝업에서 토글/조정.

window.STATS_CONFIG = {
  labels: {
    expectedGoals:    '기대득점',
    ballPossession:   '점유율',
    totalShots:       '총 슈팅',
    shotsOnGoal:      '유효슈팅',
    fouls:            '파울',
    cornerKicks:      '코너킥',
    offsides:         '오프사이드',
    yellowCards:      '경고',
    redCards:         '퇴장',
    totalPasses:      '패스 횟수',
    passesPercent:    '패스정확도',  // null이면 passesAccurate / totalPasses로 계산해서 % 표시
    passesAccurate:   '정확한 패스',
    shotsOffGoal:     '무효슈팅',
    blockedShots:     '블록된 슈팅',
    shotsInsidebox:   '박스 안 슈팅',
    shotsOutsidebox:  '박스 바깥 슈팅',
    goalkeeperSaves:  '세이브 수',
    goalsPrevented:   '기대 실점 대비 선방',
  },

  // 표시 순서 — 사용자 지정 순서 그대로
  order: [
    'expectedGoals', 'ballPossession', 'totalShots', 'shotsOnGoal',
    'yellowCards', 'redCards', 'fouls', 'cornerKicks', 'offsides',
    'totalPasses', 'passesPercent', 'passesAccurate',
    'shotsOffGoal', 'blockedShots', 'shotsInsidebox', 'shotsOutsidebox',
    'goalkeeperSaves', 'goalsPrevented',
  ],

  itemsPerPage: 6,
  autoSwipeIntervalMs: 10000,
};
