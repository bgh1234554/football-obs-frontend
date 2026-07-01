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
  'Violent conduct':            '폭력 행위',
  'Persistent fouling':         '반복적 파울',
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
  
  // 페널티 슛아웃
  'Penalty Shootout':             '승부차기',

  // 복합 사유 (콤마 분리된 그대로 매핑)
  'Not on pitch, Unsportsmanlike conduct': '그라운드 밖에서 비신사적 행위',
  'Not on pitch, Fighting':                '그라운드 밖에서 폭행',
};

/** 코멘트 한글화 — 매칭 없으면 원문 반환. 빈 값 / null이면 빈 문자열. */
window.translateEventComment = function translateEventComment(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const map = window.EVENT_COMMENT_KO || {};
  if (map[s]) return map[s];
  // case-insensitive 시도
  const lower = s.toLowerCase();
  for (const key in map) {
    if (key.toLowerCase() === lower) return map[key];
  }
  return s;
};
