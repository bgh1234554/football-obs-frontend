// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 컨텍스트 메뉴] 경기 스탯 라벨 한글 번역 (사용자 편집용)
//   player-menu.js 의 pmBuildMatchStatRows() 가 이 파일을 참조합니다.
//   라벨을 바꾸고 싶으면 오른쪽 문자열만 수정하세요.
//   항목 순서는 표시 순서와 동일합니다.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PLAYER_MATCH_STAT_LABELS = {
  minutes:            '출전 시간',
  position:           '포지션',
  rating:             '평점',

  // 슛
  shotsTotal:         '전체 슈팅',
  shotsOn:            '유효 슈팅',

  // 득점/어시
  goalsScored:        '득점',
  assists:            '도움',

  // 골키퍼
  saves:              '선방',
  goalsConceded:      '실점',

  // 패스
  passesTotal:        '전체 패스',
  passesKey:          '키패스',
  passesAccuracy:     '패스 성공률',

  // 수비
  tacklesTotal:       '태클',
  tacklesBlocks:      '블록',
  tacklesInterceptions: '인터셉트',

  // 드리블 / 경합
  dribblesAttempts:   '드리블 시도',
  dribblesSuccess:    '드리블 성공',
  duelsTotal:         '전체 경합',
  duelsWon:           '경합 승리',

  // 파울
  foulsDrawn:         '피파울',
  foulsCommitted:     '파울',

  // 카드
  yellowCards:        '옐로카드',
  redCards:           '레드카드',
};
