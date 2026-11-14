/**
 * [경기 선수 스탯 라벨: 표시 문구와 데이터 키 분리]
 * player-menu.js의 경기 스탯 빌더가 참조하는 한글 문구 목록이다.
 * 키는 스탯 조회에 쓰이므로 그대로 두고 번역 변경은 오른쪽 문자열에서 수행한다.
 * 조회·누락값 처리·행 생성은 메뉴 빌더의 책임이며 이 파일은 표시 이름만 제공한다.
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 컨텍스트 메뉴] 경기 스탯 라벨 한글 번역 (사용자 편집용)
//   player-menu.js의 pmBuildMatchStatRows()가 이 파일을 참조한다.
//   라벨을 바꿀 때는 오른쪽 문자열만 수정한다.
//   항목 순서는 표시 순서와 동일한다.
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
  passesTotal:        '전체패스(패스성공)',
  passesAccuracy:     '패스 성공률',
  passesKey:          '키패스',

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
