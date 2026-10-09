/**
 * 경기 상태와 현재 시각을 기준으로 다음 자동 조회까지의 대기 시간을 계산한다.
 * 실제 요청·타이머 예약·사용자 안내는 fixture.js에서 처리한다.
 *
 * 반환값:
 * - delay: 다음 조회까지 기다릴 시간(ms). null이면 자동 조회를 중단한다.
 * - reason: 중단 안내가 필요한 경우에만 'ABD' 또는 'INT'를 반환한다.
 *
 * tracking은 호출 사이에 유지하는 추적 객체이며, 이 함수가 최초 감지 시각을 갱신한다.
 * ftFirstDetectedAt은 종료 상태의 추가 조회 기간, intFirstDetectedAt은 중단 상태의
 * 재확인 기간을 계산하는 기준이다. 요청 실패 후 재예약할 때도 같은 객체의 값을
 * 이어받아야 제한 시간이 매번 처음부터 시작되지 않는다.
 * now는 기본적으로 현재 시각이며, 경계 조건 검증에서는 특정 시각을 전달할 수 있다.
 */
function getFixturePollingPlan(data, tracking, now = Date.now()) {
  const status = String(data?.matchInfo?.status || '');
  const kickoff = Date.parse(data?.matchInfo?.kickoffAt || data?.matchInfo?.kickoffUtc);

  // 1) 종료 상태: FT(정규 종료), AET(연장 종료), PEN(승부차기 종료).
  // 킥오프로부터 4시간 이상 지난 경기는 최초 로딩만으로 충분하므로 추가 조회하지 않는다.
  // 그 외에는 종료 상태를 처음 감지한 뒤 3분 동안 1분 간격으로 조회한다.
  // 종료 직후 뒤늦게 반영되는 경기 스탯·이벤트를 받기 위한 유예 기간이다.
  if (['FT', 'AET', 'PEN'].includes(status)) {
    if (Number.isFinite(kickoff) && now - kickoff >= 4 * 60 * 60 * 1000) return { delay: null };
    tracking.ftFirstDetectedAt ??= now;
    if (now - tracking.ftFirstDetectedAt >= 3 * 60 * 1000) return { delay: null };
    return { delay: 60 * 1000 };
  }

  // 종료 상태를 벗어나면 종료 추적을 초기화한다.
  // INT도 다른 상태로 바뀌면 초기화해, 나중에 다시 중단될 때 새로 30분을 센다.
  tracking.ftFirstDetectedAt = null;
  if (status !== 'INT') tracking.intFirstDetectedAt = null;

  // 2) ABD(경기 포기·중도 종료): 자동 조회를 중단하고 화면 쪽에 안내 사유를 전달한다.
  if (status === 'ABD') return { delay: null, reason: 'ABD' };

  // 3) PST(연기), CANC(취소), SUSP(정지), AWD(결과 부여), WO(부전승)는
  // 자동 조회를 조용히 중단한다. 재개 여부를 확인하는 INT는 아래에서 별도로 처리한다.
  if (['PST', 'CANC', 'SUSP', 'AWD', 'WO'].includes(status)) return { delay: null };

  // 4) INT(일시 중단): 재개 가능성이 있으므로 5분 간격으로 다시 확인한다.
  // 처음 감지한 뒤 30분 이상 지속되면 조회를 중단하고 수동 새로고침 안내를 요청한다.
  if (status === 'INT') {
    tracking.intFirstDetectedAt ??= now;
    return now - tracking.intFirstDetectedAt >= 30 * 60 * 1000
      ? { delay: null, reason: 'INT' } : { delay: 5 * 60 * 1000 };
  }

  // 5) NS(시작 전)이고 유효한 킥오프 시각이 있는 경우:
  // - 1시간보다 많이 남았으면 킥오프 1시간 전까지 기다린다.
  // - 1시간 전부터는 라인업 반영을 확인하기 위해 10분 간격으로 조회한다.
  // - 킥오프 1분 전부터는 아래의 15초 간격 조회로 전환한다.
  if (status === 'NS' && Number.isFinite(kickoff) && kickoff > now + 60 * 1000) {
    const remaining = kickoff - now;
    if (remaining > 60 * 60 * 1000) return { delay: remaining - 60 * 60 * 1000 };
    // 다음 10분을 그대로 기다리면 전환 시각을 지나칠 수 있으므로,
    // 킥오프 1분 전까지 남은 시간이 더 짧으면 그 시각에 맞춰 조회한다.
    return { delay: Math.min(10 * 60 * 1000, remaining - 60 * 1000) };
  }

  // 6) 진행 중인 전·후반, 하프타임, 연장 전·후반, 승부차기는 15초 간격으로 조회한다.
  // NS도 킥오프 1분 이내이거나 예정 시각이 지났으면 같은 간격으로 시작 여부를 확인한다.
  // 킥오프 시각이 없거나 잘못된 NS 역시 15초 간격을 사용해 조회가 끊기지 않게 한다.
  // 알 수 없는 상태는 불필요한 API 호출을 막기 위해 자동 조회하지 않는다.
  return { delay: ['1H', 'HT', '2H', 'ET1', 'ET2', 'PSO', 'NS'].includes(status) ? 15000 : null };
}
