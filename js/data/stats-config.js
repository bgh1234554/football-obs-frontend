/**
 * [스탯 표시 설정: API 필드·라벨·기본 순서]
 * stats-panel.js가 읽는 선언형 설정이다. API 값을 계산하거나 DOM을 생성하지 않는다.
 * labels의 키는 실제 teamStats 필드와 맞추고 order의 순서로 표시 대상을 정한다.
 *
 * itemsPerPage는 실측 실패 시 대체값이며 실제 페이지 용량은 화면 높이에서 계산한다.
 * 자동 넘김 시간도 기준 항목 수와 현재 용량을 함께 사용하므로 기본 9개를 고정 렌더 수로 해석하지 않는다.
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [경기 스탯 설정] 라벨 한글 매핑 + 표시 순서 + 페이지네이션/자동 스와이프 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사용자가 수시로 라벨/순서를 바꿀 수 있도록 별도 파일로 분리.
// stats-panel.js가 이 전역 객체를 읽어서 렌더링한다.
//
// - labels: TeamStatsDto 필드명 → 한글 라벨
// - order : 표시 순서. 빠진 키는 표시 안 됨. 양 팀 모두 null인 항목은 자동 skip.
// - itemsPerPage: 한 페이지에 표시할 스탯 항목 수 (큼/작음 페이지 공통) — 높이 측정 실패 시의 fallback값.
//   실제 페이지당 항목 수는 stComputeItemsPerPage가 패널 높이로 매번 동적 계산.
// - autoSwipeIntervalMs: 자동 스와이프 ON일 때 페이지 전환 간격 (ms). 설정 팝업에서 토글/조정.
// - autoSwipeBaselineItemsPerPage: 설정에 표시되는 "패널 슬라이딩 시간"이 기준으로 삼는
//   페이지당 항목 수. 패널이 작아져 동적 itemsPerPage가 이보다 적으면, 실제 페이지 전환
//   간격을 (동적 itemsPerPage / 이 값) 비율만큼 줄인다 — 항목 하나당 노출 시간을 일정하게
//   유지하기 위함. 더 많이 들어갈 때는 설정값을 그대로 사용(줄어들 때만 비례 적용).

window.STATS_CONFIG = {
  labels: {
    expectedGoals:    '기대득점',
    ballPossession:   '점유율',
    totalShots:       '총 슈팅',
    shotsOnGoal:      '유효슈팅',
    fouls:            '파울',
    freeKicks:        '프리킥',
    cornerKicks:      '코너킥',
    offsides:         '오프사이드',
    yellowCards:      '경고',
    redCards:         '퇴장',
    totalPasses:      '패스 횟수',
    passesAccurate:   '패스 성공',
    passesPercent:    '패스정확도',  // null이면 passesAccurate / totalPasses로 계산해서 % 표시
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
    'yellowCards', 'redCards', 'fouls', 'cornerKicks', 'offsides', 'freeKicks',
    'totalPasses', 'passesAccurate', 'passesPercent',
    'shotsOffGoal', 'blockedShots', 'shotsInsidebox', 'shotsOutsidebox',
    'goalkeeperSaves', 'goalsPrevented',
  ],

  itemsPerPage: 9,
  autoSwipeIntervalMs: 10000,
  autoSwipeBaselineItemsPerPage: 9,
};
