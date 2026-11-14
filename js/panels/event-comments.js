/**
 * [이벤트 문구: 코멘트와 VAR 세부 판정 번역]
 * 카드/행위 사유인 comments와 VAR 판정인 detail을 별도 맵으로 관리한다.
 *
 * 조회 순서:
 *  1. null/빈 문자열은 빈 표시로 반환하고 나머지는 앞뒤 공백을 정리한다.
 *  2. 원문 완전 일치를 먼저 보고 없으면 대소문자를 무시한 키를 찾는다.
 *  3. 번역이 없으면 원문을 반환해 새로운 공급자 문구가 화면에서 사라지지 않게 한다.
 *
 * 쉼표가 포함된 복합 사유도 하나의 문구로 조회한다. 번역은 표시 단계일 뿐 이벤트 종류나
 * 원본 comments/detail을 변경하지 않으므로 수동 편집 저장과 사건 식별은 원본 기준을 유지한다.
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [이벤트 코멘트 한글 매핑]
// API Football events.comments 필드의 영어 사유를 한글로 표시.
// 사용자가 수시로 번역을 수정할 수 있도록 별도 .js 파일.
//
// 매칭 규칙:
//   1. 정확 일치(case-sensitive) 먼저
//   2. case-insensitive 일치
//   3. 매칭 없으면 원문 그대로 반환
//
// "Not on pitch, Unsportsmanlike conduct" 같은 복합 사유도 직접 매핑(콤마 분리 처리 X).
// 새 사유가 API에서 들어오면 [KO_COMMENT_NEEDED] 콘솔 로그(개발자 모드)에서 확인 후 추가.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.EVENT_COMMENT_KO = {
  // 카드 사유 — 일반
  'Not on pitch':               '그라운드 밖',
  'Unsportsmanlike conduct':    '비신사적 행위',
  'Tripping':                   '발걸기',
  'Roughing':                   '거친 플레이',
  'Holding':                    '홀딩',
  'Handling':                   '핸들링',
  'Foul':                       '파울',
  'Delay of game':              '경기 지연',
  'Elbowing':                   '엘보잉',
  'Diving':                     '다이빙',
  'Fighting':                   '폭행',
  'Abuse of officials':         '심판 모욕',
  'Serious foul':               '심각한 파울',
  'Impeding':                   '진로 방해',
  'Head-butting':               '박치기',
  'Argument':                   '항의',
  'Handball':                   '핸드볼',
  'Time wasting':               '시간 끌기',
  'Abusive Language':           '모욕적인 언행',
  'Violent conduct':            '폭력 행위',
  'Persistent fouling':         '반복적 파울',
  'Persistent Infringement':    '반복적 규칙 위반',
  'Simulation':                 '시뮬레이션',
  'Dangerous play':             '위험한 플레이',
  'Professional foul last man': '최종 수비수 고의 반칙',
  'Professional handball':      '고의 핸드볼',
  'Unallowed field entering':   '경기장 무단 진입',
  'Off the ball foul':          '오프더볼 파울',
  'Leaving field':              '무단 퇴장',
  'Unsporting behaviour':       '비신사적 행위',
  'Rescinded Card':             '카드 철회',
  'misses next match':          '다음 경기 출장 정지',
  'Offside':                    '오프사이드',
  'Dissent':                    '판정 항의',
  'Not Retreating':             '세트피스 거리 미준수',
  'video review':               '온필드 리뷰',
  
  // 페널티 슛아웃
  'Penalty Shootout':             '승부차기',

  // 복합 사유 (콤마 분리된 그대로 매핑)
  'Not on pitch, Unsportsmanlike conduct': '그라운드 밖에서 비신사적 행위',
  'Not on pitch, Fighting':                '그라운드 밖에서 폭행',
};

/** 코멘트 한글화 — 매칭 없으면 원문 반환. 빈 값 / null이면 빈 문자열. */
function eventTranslateFromMap(raw, map) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (map[s]) return map[s];
  // case-insensitive 시도
  const lower = s.toLowerCase();
  for (const key in map) {
    if (key.toLowerCase() === lower) return map[key];
  }
  return s;
}

// VAR detail은 comments와 별도 관리한다. 새 판정이 카드 사유 목록에 섞이지 않도록 한다.
window.EVENT_VAR_DETAIL_KO = {
  'Card upgrade':               '카드 변경',
  'Card upgrade confirmed':     '카드 변경',
  'Card upheld':                '카드 판정 유지',
  'Card reviewed':              '카드 판정 검토 완료',
};
window.translateEventComment = raw => eventTranslateFromMap(raw, window.EVENT_COMMENT_KO || {});
window.translateEventVarDetail = raw => eventTranslateFromMap(raw, window.EVENT_VAR_DETAIL_KO || {});
