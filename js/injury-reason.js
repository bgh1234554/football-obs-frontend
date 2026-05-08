  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [부상 사유 한글화] API-Football injuries 응답의 reason 필드를 한글로 변환.
  // 또한 reason 값이 출장 정지 계열인지(레드카드 vs 부상 아이콘 분기용) 판별.
  //
  // 매핑이 없는 reason은 원문 그대로 반환 (호버 툴팁에 영문 표시).
  // 새 reason이 운영 중 발견되면 INJURY_REASON_KO 매핑에 한 줄 추가.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // -- 출장 정지 계열로 간주할 reason 패턴 (소문자 기준 부분 일치)
  // -- 매칭되면 부상 아이콘 대신 레드카드 아이콘 표시
  const SUSPENSION_PATTERNS = [
    'suspended',
    'suspension',
    'red card',
    'yellow card', // "Yellow Cards Accumulation" 등
    'card',
  ];

  // -- API reason 영문 → 한글 매핑
  const INJURY_REASON_KO = {
    // 부상 카테고리
    'Injury':            '부상',
    'Knock':             '타박상',
    'Muscle Injury':     '근육 부상',
    'Hamstring':         '햄스트링',
    'Hamstring Injury':  '햄스트링 부상',
    'Calf Injury':       '종아리 부상',
    'Thigh Injury':      '허벅지 부상',
    'Groin Injury':      '사타구니 부상',
    'Knee Injury':       '무릎 부상',
    'Leg Injury':        '다리 부상',
    'Ankle Injury':      '발목 부상',
    'Achilles Tendon Injury': '아킬레스건 부상',
    'Foot Injury':       '발 부상',
    'Toe Injury':        '발가락 부상',
    'Achilles Injury':   '아킬레스 부상',
    'Lower-Body Injury': '하체 부상',
    'Upper-Body Injury': '상체 부상',
    'Back Injury':       '허리 부상',
    'Shoulder Injury':   '어깨 부상',
    'Arm Injury':        '팔 부상',
    'Wrist Injury':      '손목 부상',
    'Hand Injury':       '손 부상',
    'Hip Injury':        '엉덩이 부상',
    'Broken cheekbone':  '광대뼈 골절',
    'Head Injury':       '머리 부상',
    'Hernia':            '탈장',
    'Neck Injury':       '목 부상',
    'Rib Injury':        '갈비뼈 부상',
    'Concussion':        '뇌진탕',
    'Broken Leg':        '다리 골절',
    'Broken Arm':        '팔 골절',
    'Fracture':          '골절',
    'Sprain':            '염좌',
    'Strain':            '근육 긴장',
    'Tendon Injury':     '힘줄 부상',
    'Ligament Injury':   '인대 부상',
    'ACL Injury':        '전방십자인대 부상',
    'Meniscus Injury':   '반월판 부상',
    'Surgery':           '수술',
    'Heart Problems':    '심장 문제',
    'Illness':           '질병',
    'Virus':             '바이러스',
    'Fever':             '발열',
    'Fitness':           '몸상태 문제',
    'Personal Reasons':  '개인 사정',
    'Coach\'s Decision': '감독 결정',
    'National Team':     '국가대표 차출',
    'Loan agreement':    '임대 조항',
    'Rest':              '휴식',
    'Inactive':          '출전 불가',
    'Unknown':           '원인 미상',

    // 출장 정지 카테고리
    'Suspended':                    '출장 정지',
    'Yellow Cards':                 '경고 누적',
    'Red card':                     '퇴장 (레드카드)',
    'Suspension':                   '출장 정지',
    'Red Card':                     '퇴장 (레드카드)',
    'Yellow Card Accumulation':     '경고 누적',
  };

  function normalizeInjuryReasonKey(reason) {
    return String(reason || '')
      .trim()
      .replace(/[‘’`´]/g, '\'')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  const INJURY_REASON_KO_NORMALIZED = Object.fromEntries(
    Object.entries(INJURY_REASON_KO).map(([key, value]) => [normalizeInjuryReasonKey(key), value])
  );

  /**
   * reason 영문 → 한글. 매핑 없으면 원문 반환.
   * @param {string|null|undefined} reason
   * @returns {string} 한글 reason 또는 원문, 빈 값이면 빈 문자열
   */
  function getInjuryReasonKo(reason) {
    if (!reason) return '';
    const raw = String(reason).trim();
    return INJURY_REASON_KO[raw]
      || INJURY_REASON_KO_NORMALIZED[normalizeInjuryReasonKey(raw)]
      || raw;
  }

  /**
   * reason이 출장 정지 계열인지 판별 (대소문자 무시, 부분 일치).
   * 정지면 레드카드 아이콘, 아니면 부상 아이콘으로 분기.
   * @param {string|null|undefined} reason
   * @returns {boolean}
   */
  function isSuspension(reason) {
    if (!reason) return false;
    const lower = reason.toLowerCase();
    return SUSPENSION_PATTERNS.some(p => lower.includes(p));
  }
