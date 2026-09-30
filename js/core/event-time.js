/**
 * 공통 이벤트 시간 판정 — 이벤트 패널, 전술판, 수정 후보가 같은 시점을 사용한다.
 *
 * 이 파일을 수정할 때 먼저 읽을 전체 처리 규칙
 * ──────────────────────────────────────────────────────────────────────────
 * 1. 기본 원칙과 해결하려는 문제
 *    API의 elapsed:45, extra:null만으로는 전반 45분과 하프타임 교체를 구별할 수 없다.
 *    HT 이후에 처음 받았다는 사실도 실제 발생 시각을 증명하지 않는다. 지연 수신이나
 *    경기 중간의 첫 조회일 수 있다. 다만 45분 교체는 사용자 요청에 따라 HT 이후에는
 *    후반 시작을 기본값으로 사용한다. 명시적 추가시간/전반 관측/수동 지정은 우선한다.
 *
 *    기본 판정 예:
 *      45/null 골·PK골·자책골·PK실패·카드 → 전반
 *      45/null 교체                       → HT 이후에는 후반 시작(표시 시간은 45분 유지)
 *      45/4 등 명시적 추가시간             → 전반 추가시간
 *      46/null                            → 후반
 *      comments:"Penalty Shootout"         → 승부차기(일반 경기 중 PK와 구별)
 *    fixture 1583654의 하피냐 45분 PK골도 HT 이후 조회/새로고침 여부와 무관하게 전반이다.
 *    위 예는 수동 구간 지정이 없는 자동 판정 기준이다.
 *
 * 2. 최종 판정의 우선순위
 *    (1) 승부차기로 명시된 이벤트는 전용 승부차기 구간을 사용한다.
 *    (2) 유효한 수동 구간 지정(_eventPeriod)이 있으면 자동 판정보다 우선한다.
 *    (3) 나머지는 기록된 분/추가시간을 기본으로 삼고, 경계분 교체만 자동 보정을 검토한다.
 *        골과 카드는 앞뒤 이벤트 순서만으로 휴식 구간으로 옮기지 않는다.
 *        정보 수정된 이벤트(_evEdited)에도 원본 이웃에 의한 자동 이동을 적용하지 않는다.
 *        시간/선수가 바뀌었을 수 있기 때문이다. 이 경우에도 명시적 수동 구간 지정은 가능하다.
 *
 *    자동 보정에 쓰는 관측 기록의 우선순위(evObserveBoundaryEvents):
 *      현재 extra > 0 또는 Goal → 이전 구간으로 유지.
 *      과거 observed-before/added-time 기록 → 이전 구간이라는 강한 근거를 유지.
 *      현재 경기 상태가 해당 구간 진행 중 → observed-before로 기록.
 *      이미 경계를 지났고 교체의 양쪽 이웃 근거가 있음 → 휴식 중인지 재추정.
 *      나머지 → default-before(근거 부족에 따른 이전 구간 기본값).
 *    최종 판정에서는 45분 교체의 default-before/neighbors-after를 후반 시작으로 처리한다.
 *    예: 1H 때 이미 본 45분 교체는 나중에 HT/2H 응답을 받아도 전반으로 유지한다.
 *    같은 사건이 45+2였다가 45/null로 바뀌어도 과거 추가시간 기록을 근거로 유지한다.
 *
 * 3. 원본 앞뒤 이벤트를 이용한 교체 재추정(evInferBoundarySubstitutions)
 *    숨김/수정/화면 정렬 전 _rawEvents를 우선하고, 없으면 입력 events를 사용한다.
 *    애매한 경계분 교체를 제외한 나머지 이벤트 시간이 일관된 오름차순/내림차순이어야 한다.
 *    역순이면 복사본을 뒤집고, 방향 불명·순서 혼재·잘못된 시간값이면 추정하지 않는다.
 *    연속된 같은 경계분 교체는 묶음 바깥의 가장 가까운 이전/다음 이벤트를 함께 본다.
 *
 *      45+4 카드 → 45/null 교체(여러 건 가능) → 46분 이벤트
 *        → HT 이후이고 더 강한 관측 기록이 없으면 하프타임 교체로 추정.
 *      44분 이벤트 → 45/null 교체 → 45+4 이벤트
 *        → 전반 교체라는 보조 근거.
 *      45+4 → 교체 → 80분 / 한쪽 이웃 없음 / 뒤섞인 배열
 *        → 이웃 추정은 보류. 45분 교체는 HT 이후 후반 시작 기본값을 사용한다.
 *
 *    휴식 중으로 추정하려면 이전 이벤트가 해당 경계분의 추가시간이어야 하고,
 *    다음 이벤트는 경계 다음 분부터 5분 이내여야 한다(45분 경계라면 46~50분).
 *    매 폴링에서 다시 검사하므로 나중에 46분 이벤트가 들어오면 추정할 수 있고,
 *    원본 순서 정정 등으로 근거가 사라지면 기본값으로 되돌린다. 직접 관측 기록은 유지한다.
 *    화면에서 이벤트를 숨겨도 원본은 남아 있어 이웃 판단 근거가 사라지지 않는다.
 *    배열 순서가 실제 발생 순서를 완전히 보장하지는 않으므로 이 결과는 어디까지나 추정이다.
 *
 * 4. 경계별 기본 구간과 자동 보정 허용 조건(evActiveBoundaryElapsedSet)
 *      45분  : 전반      → HT 이후 추가시간 없는 교체는 후반 시작이 기본값.
 *      90분  : 후반      → 연장으로 이어졌을 때 연장 시작 전 휴식 교체 추정 허용.
 *      105분 : 연장 전반 → 연장 후반으로 이어졌을 때 연장 하프타임 교체 추정 허용.
 *      120분 : 연장 후반 → 승부차기로 이어졌을 때 승부차기 전 교체 추정 허용.
 *    경기 상태·종료 시각·승부차기 점수/이벤트로 진행한 구간을 판단한다.
 *    특히 연장 없이 FT인 경기의 90분 교체는 풀타임 뒤로 보내지 않는다.
 *    구간 마커 생성도 같은 경기 진행 판정(evComputePeriodFlags)을 사용한다.
 *
 * 5. 수동 구간 지정과 저장(event-hide.js의 evPeriodOpen/evPeriodSave)
 *    45/90/105/120분 경계 이벤트에서 자동/이전 구간/휴식/다음 구간을 선택한다.
 *    45분이면 자동 판정/전반/하프타임/후반이다. 명시적 승부차기는 이 선택에서 제외한다.
 *    저장 전 선택은 미리보기이며, 저장하면 정렬 위치와 전술판 적용 시점을 변경한다.
 *    원본 elapsed/extra, 이벤트 패널의 시간 표시, 점수는 구간 선택으로 바꾸지 않는다.
 *    다음 구간을 선택하면 내부 위치를 경계 다음 분으로 잡는다(45분→후반 선택은 46분 위치).
 *    수동 선택은 위의 경기 진행에 따른 자동 보정 제한보다 우선한다.
 *
 *    관측 이력: sessionStorage, 경기별 최대 12개. 같은 탭 새로고침/경기 전환 후 복원한다.
 *               새 세션이나 보관 한도를 벗어난 경기는 이전 관측 없이 다시 판단한다.
 *    수동 지정: localStorage의 기존 이벤트 수정 저장소에 periods로 별도 보관(경기 항목 TTL 7일).
 *               같은 원본 이벤트라면 폴링/새로고침에도 유지된다. 자동으로 돌리면 구간 지정만
 *               해제하며 선수·득점 등 다른 수정은 보존한다. 원본 내용 서명이 바뀌거나 이벤트가
 *               사라지면 기존 숨김/수정과 함께 정리한다. 단 빈 응답은 일시적 누락일 수 있어 보류한다.
 *    관측 이력의 사건 키는 extra를 제외하지만 수동값의 원본 서명에는 extra가 포함된다.
 *    따라서 추가시간 정정 시 과거 관측은 이어질 수 있어도 수동 지정은 해제될 수 있다.
 *
 * 6. 화면별 적용과 내부 시간 표현
 *    evBuildTimeContext로 관측/경기 진행 근거를 준비하고, evResolveEventTime이
 *    sortKey(정렬 위치), period(구간), reason(이유), timelinePosition(전술판 위치)을 반환한다.
 *      events-panel.js    : 같은 판정으로 실제 이벤트와 구간 마커를 최신순 정렬.
 *      tactics-timeline.js: 같은 판정 시점까지 교체/퇴장을 누적해 그 시점의 라인업 재구성.
 *      event-hide.js      : 같은 시점까지의 교체/퇴장으로 수정창 출전/벤치 선수 후보 계산.
 *                           교체 묶음 수정에서도 서로 다른 구간의 교체를 한 묶음으로 합치지 않음.
 *    예: 전반 추가시간 골을 수정할 때 하프타임에 투입된 선수는 아직 출전 후보가 아니다.
 *
 *    일반 정렬 키는 elapsed*100+extra. 구간 마커에는 가상 extra=50,
 *    휴식 중 교체에는 가상 extra=51을 사용한다. 실제 추가시간을 50/51로 수정하는 것이 아니다.
 *      시간 오름차순: 45분(4500) → 45+4(4504) → HT 마커(4550) → HT 교체(4551) → 46분(4600)
 *    이벤트 화면은 최신순이므로 HT 교체가 HT 마커 위에 보인다.
 *    전술판은 sortKey/100을 내부 위치로 사용하되 45.04를 45+4′, 45.51을 하프타임으로 표시한다.
 *    각 선택 시점은 그 위치까지의 이벤트만 포함한다. 45분에서 추가시간 퇴장/HT 교체까지
 *    미리 적용하거나, ceil로 45+4와 HT를 모두 46분에 합치면 안 된다.
 *    시간/전술판 툴팁은 reason을 설명해 직접 관측·추가시간·이웃 추정·기본값·수동 지정을 구별한다.
 *
 * 아래 함수별 주석에는 식별 키, 저장 복원, 경기별 회귀 사례와 세부 조건을 추가로 설명한다.
 */
function evTimeTypeIs(ev, type) { return String(ev?.type || '').toLowerCase() === type.toLowerCase(); }
function evTimeIsShootout(ev) { return String(ev?.comments || '').trim().toLowerCase() === 'penalty shootout'; }

// ─── 구간 구분자 (하프타임/후반종료/연장전반종료/연장후반종료/풀타임) ───────────
// API가 이런 경계를 별도 이벤트로 안 주기 때문에 matchInfo.status/elapsed 전이로
// 추론해서 합성한 "가짜 이벤트"를 실제 이벤트 사이에 끼워 넣는다.
// 정렬 키는 elapsed * 100 + extra. 구간 마커에는 가상의 extra=50을 주어 보통의 추가시간보다
// 뒤에 놓고, 앞뒤 시간으로 휴식 중 교체라고 추정한 이벤트만 extra=51로 그 마커 뒤에 놓는다.
// 화면은 내림차순이므로 "뒤(더 나중)"로 보낸 이벤트가 실제 화면에서는 마커보다 위에 나타난다.
// 이는 정렬용 값일 뿐이다. 원본 extra와 화면에 표시하는 45′/45+4′ 등의 시간은 수정하지 않는다.
const EV_PERIOD_MARKER_SORT_PADDING = 50;
const EV_PENALTY_SHOOTOUT_SORT_ELAPSED = 121; // 승부차기는 연장 후반 종료(120') 마커 이후에 배치
// 하프타임 마커 표시 허용 status — "NS/1H가 아니면 전부"식 부정 조건은 PST/CANC/SUSP/INT/ABD/AWD/WO
// 같은 비정상 status에도 걸려 하프타임 마커가 잘못 붙었음. 진행된 상태만 명시적으로 허용한다.
const EV_HALFTIME_REACHED_STATUSES = new Set(['HT', '2H', 'ET1', 'ET2', 'PSO', 'FT']);
// 구간 경계 elapsed — 하프타임/후반종료/연장전반종료/연장후반종료 마커 위치와 같다.
// 휴식 시간의 교체/카드가 elapsed:45, extra:null처럼 내려오는 경우를 처리하기 위한 목록이다.
// 단, 똑같은 시간값으로 전반 45분에 실제로 발생한 이벤트도 들어올 수 있으므로,
// 경계 숫자만 보고 밀지 않고 아래의 이벤트 종류 + 경기 진행 상태 + 최초 관측 이력을 함께 본다.
const EV_PERIOD_BOUNDARY_ELAPSED = new Set([45, 90, 105, 120]);
const EV_BOUNDARY_HISTORY_STORAGE_KEY = 'obs.events.boundary-history.v2';
const EV_BOUNDARY_HISTORY_LIMIT = 12;
const evBoundaryHistory = evLoadBoundaryHistory();

/**
 * 최초 관측 기록을 sessionStorage에서 복원한다.
 * 저장 형태: [[fixtureId, { observations: { [eventKey]: { after, reason } } }], ...].
 * after는 경계 뒤 여부, reason은 판정 근거다. 직접 관측한 전반 정보와 임시 기본값을 구분해야
 * 이후 폴링에서 이웃 이벤트가 추가/정정됐을 때 추정만 다시 계산할 수 있다.
 *
 * HT 이후 새로고침했을 때 이전 1H에서 확인했던 이벤트를 "HT 이후 처음 생긴 이벤트"로
 * 오인하지 않도록 탭 세션에 보관한다. 같은 탭에서 다른 경기를 보다가 돌아와도 fixtureId별로
 * 구분되며, 메모리/저장소 크기를 제한하기 위해 최대 12경기만 유지한다.
 * 새 세션 또는 기록이 퇴출된 경기는 과거 관측을 복원할 수 없다. JSON 손상/저장소 접근 차단은
 * 경기 표시 자체를 막지 않도록 빈 기록으로 시작하고 현재 실행 중의 메모리 기록을 사용한다.
 */
function evLoadBoundaryHistory() {
  try {
    const current = sessionStorage.getItem(EV_BOUNDARY_HISTORY_STORAGE_KEY);
    const entries = JSON.parse(current || sessionStorage.getItem('obs.events.boundary-history.v1') || '[]');
    if (!Array.isArray(entries)) return new Map();
    const valid = entries.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string'
      && entry[1]?.observations && typeof entry[1].observations === 'object')
      .slice(-EV_BOUNDARY_HISTORY_LIMIT);
    const reasons = new Set(['observed-before', 'added-time', 'goal', 'neighbors-after', 'neighbors-before', 'default-before']);
    return new Map(valid.map(([id, history]) => {
      const observations = {};
      Object.entries(history.observations).forEach(([key, value]) => {
        // v1의 false는 경계 전 직접 관측/추가시간/골이었다. true는 단순 HT 수신 추정이므로 폐기.
        if (!current && value === false) observations[key] = { after: false, reason: 'observed-before' };
        else if (value && typeof value.after === 'boolean' && reasons.has(value.reason)
          && value.after === (value.reason === 'neighbors-after')) observations[key] = value;
      });
      return [id, { observations }];
    }));
  } catch { return new Map(); }
}

/**
 * 같은 이벤트가 매 폴링/재렌더에서 같은 관측 기록을 찾도록 식별 키를 만든다.
 * 선수 ID가 있으면 표시명 대신 ID를 사용하고, _hideSig가 있으면 가공 전의 side/type/detail/선수를
 * 읽는다. 닉네임 변경, alt→canonical ID 연결, 도움 선수 정정으로 기존 전반 이벤트를 새로 들어온
 * 후반 이벤트로 오인하는 일을 줄이기 위함이다.
 *
 * extra는 키에서 제외한다: null↔0 변화 또는 뒤늦은 extra:2 정정도 같은 이벤트의 새 정보다.
 * elapsed는 현재 값을 사용한다: 사용자가 45분을 90분으로 고치면 다른 경계의 사건으로 판단한다.
 * ID가 없는 선수는 원문 이름/이름으로 대체하므로 이름 자체가 바뀌면 같은 사건임을 보장할 수 없다.
 */
function evBoundaryEventKey(ev) {
  let source = ev;
  if (ev?._hideSig) {
    try {
      const sig = JSON.parse(ev._hideSig);
      if (Array.isArray(sig) && sig.length >= 8) {
        source = { side: sig[0], type: sig[1], detail: sig[2], playerId: sig[6], playerName: sig[7] };
      }
    } catch {}
  }
  const player = Number(source?.playerId) > 0
    ? `id:${source.playerId}`
    : `name:${source?.playerOrigName || source?.playerName || ''}`;
  // 시간의 수동 수정은 별개 경계로 판정하되 extra null/0 및 추가시간 정정은 같은 이벤트로 본다.
  return JSON.stringify([source?.side || ev?.teamId || '', String(source?.type || '').toLowerCase(),
    String(source?.detail || '').trim().toLowerCase(), Number(ev?.elapsed), player]);
}

/**
 * 정렬 전 원본 배열의 앞뒤 시간으로만 경계 교체를 재추정한다. 화면용 evProcess 결과를 넣으면
 * elapsed로 이미 재정렬돼 근거가 사라지므로 반드시 _rawEvents(없으면 입력 events)를 사용한다.
 *
 * 1) 애매한 45/90/105/120분 교체를 제외한 나머지 시간들이 일관된 오름차순/내림차순인지 확인.
 *    방향을 알 수 없거나 순서가 섞였으면 추정하지 않는다. 역순 응답은 복사본만 뒤집는다.
 * 2) 연속된 경계 교체 묶음 바깥의 가장 가까운 이전/다음 이벤트를 함께 본다.
 *    예: 45+4 카드 → 45/null 교체(여러 건 가능) → 46분 이벤트이면 휴식 중 교체로 추정.
 *    다음 이벤트가 50분 이내여야 한다. 45+4 → 45/null → 80분처럼 간격이 크면 판단을 보류한다.
 *    반대로 44분 → 45/null 교체 → 45+4 이벤트이면 전반 교체라는 보조 근거가 된다.
 * 3) 어느 한쪽 이웃이 없으면 기본값(이전 구간)을 사용한다. 다음 폴링에 46분 이벤트가 생기면
 *    다시 검사한다. 1H 직접 관측/명시적 추가시간은 이 추정보다 우선하며 카드와 골은 옮기지 않는다.
 *
 * 한계: 배열의 시간 순서가 일관돼도 실제 발생 순서를 완전히 보장하지는 않는다. 이 결과는
 * 확정 사실이 아닌 neighbors-* 추정이며, 매 응답에서 근거가 사라지거나 모순되면 다시 계산한다.
 */
function evInferBoundarySubstitutions(rawEvents) {
  const result = new Map();
  const events = rawEvents.filter(ev => ev && !evTimeIsShootout(ev));
  const ambiguous = ev => evTimeTypeIs(ev, 'subst') && EV_PERIOD_BOUNDARY_ELAPSED.has(Number(ev.elapsed))
    && Number(ev.extra ?? 0) === 0;
  const validTime = ev => ev.elapsed != null && ev.elapsed !== '' && Number.isFinite(Number(ev.elapsed))
    && Number(ev.elapsed) >= 0 && Number.isFinite(Number(ev.extra ?? 0)) && Number(ev.extra ?? 0) >= 0;
  if (!events.every(validTime)) return result;
  const anchors = events.filter(ev => !ambiguous(ev));
  let direction = 0;
  for (let i = 1; i < anchors.length; i += 1) {
    const diff = Number(anchors[i].elapsed) - Number(anchors[i - 1].elapsed)
      || Number(anchors[i].extra ?? 0) - Number(anchors[i - 1].extra ?? 0);
    if (!diff) continue;
    const nextDirection = Math.sign(diff);
    if (direction && direction !== nextDirection) return result;
    direction = nextDirection;
  }
  if (!direction) return result;
  const ordered = direction > 0 ? events : events.slice().reverse();
  ordered.forEach((ev, index) => {
    if (!ambiguous(ev)) return;
    let left = index - 1;
    let right = index + 1;
    while (left >= 0 && ambiguous(ordered[left]) && Number(ordered[left].elapsed) === Number(ev.elapsed)) left -= 1;
    while (right < ordered.length && ambiguous(ordered[right]) && Number(ordered[right].elapsed) === Number(ev.elapsed)) right += 1;
    const previous = ordered[left];
    const next = ordered[right];
    if (!previous || !next) return;
    const boundary = Number(ev.elapsed);
    if (Number(previous.elapsed) === boundary && Number(previous.extra) > 0
      && Number(next.elapsed) > boundary && Number(next.elapsed) <= boundary + 5) {
      result.set(ev, { after: true, reason: 'neighbors-after' });
    } else if (Number(previous.elapsed) <= boundary && Number(previous.extra ?? 0) === 0
      && Number(next.elapsed) === boundary && Number(next.extra) > 0) {
      result.set(ev, { after: false, reason: 'neighbors-before' });
    }
  });
  return result;
}

/**
 * 폴링 응답에서 경계 이벤트를 처음 확인한 구간을 fixture별로 기록한다.
 * 호출 위치는 applyEventsPanel의 필터링/DOM 검사 이전이다. 숨김/수동 수정 전 _rawEvents를
 * 우선해 화면에서 이벤트를 숨겨도 이웃 시간 근거가 사라지지 않는다.
 *
 * 판정 순서:
 *  1) Goal 또는 extra > 0이면 경계 전. 골은 휴식 중 발생한 사건이 아니며, 명시적인
 *     추가시간은 수신 시점보다 강한 정보다. HT 이후 늦게 받아도 하프타임 뒤로 보내지 않는다.
 *  2) observed-before/added-time 기록은 유지. 1H 때 있던 45분 교체를 HT/2H 응답에서 다시
 *     받아도 전반이라는 근거는 유지된다. 이전의 단순 기본값/이웃 추정은 확정 기록으로 취급하지 않는다.
 *  3) 현재 구간이 1H/2H/ET1/ET2이면 각각 45/90/105/120분을 observed-before로 기록.
 *  4) 경계를 이미 지났고 교체이면 이웃 시간을 재검사. 양쪽 근거가 있는 경우에만 휴식 중으로 추정.
 *  5) 나머지는 default-before. 카드, 기록 없는 최초 조회, HT 이후 신규 수신만으로는 뒤로 보내지 않는다.
 *
 * 중요: "최초 수신 시점"이 "실제 발생 시점"을 완전히 증명하지는 않는다.
 * HT 이후 최초 조회/지연 수신에는 전반을 기본값으로 사용한다. 이웃 근거가 나중에 추가되면
 * default-before를 neighbors-after로 바꿀 수 있고, 원본 순서 정정으로 근거가 없어지면 되돌린다.
 * 승부차기는 별도 정렬 규칙이 있으므로 이 관측 기록에서 제외한다.
 */
function evObserveBoundaryEvents(fixtureData) {
  const fixtureId = String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  if (!fixtureId) return null;
  const events = Array.isArray(fixtureData._rawEvents) ? fixtureData._rawEvents
    : (Array.isArray(fixtureData.events) ? fixtureData.events : []);
  const inferred = evInferBoundarySubstitutions(events);
  const active = evActiveBoundaryElapsedSet(fixtureData.matchInfo, events);
  const status = String(fixtureData.matchInfo?.status || '').toUpperCase();
  const beforeStatus = { 45: '1H', 90: '2H', 105: 'ET1', 120: 'ET2' };
  const history = evBoundaryHistory.get(fixtureId) || { observations: {} };
  let changed = !evBoundaryHistory.has(fixtureId);
  for (const ev of events) {
    const elapsed = Number(ev?.elapsed);
    if (!EV_PERIOD_BOUNDARY_ELAPSED.has(elapsed) || evTimeIsShootout(ev)) continue;
    const key = evBoundaryEventKey(ev);
    const prior = history.observations[key];
    let decision = { after: false, reason: 'default-before' };
    if (Number(ev.extra) > 0) decision = { after: false, reason: 'added-time' };
    else if (evTimeTypeIs(ev, 'Goal')) decision = { after: false, reason: 'goal' };
    else if (prior?.reason === 'observed-before' || prior?.reason === 'added-time') decision = prior;
    else if (status === beforeStatus[elapsed]) decision = { after: false, reason: 'observed-before' };
    else if (active.has(elapsed) && inferred.has(ev)) decision = inferred.get(ev);
    if (prior?.after !== decision.after || prior?.reason !== decision.reason) {
      history.observations[key] = decision;
      changed = true;
    }
  }
  evBoundaryHistory.delete(fixtureId);
  evBoundaryHistory.set(fixtureId, history);
  while (evBoundaryHistory.size > EV_BOUNDARY_HISTORY_LIMIT) {
    evBoundaryHistory.delete(evBoundaryHistory.keys().next().value);
    changed = true;
  }
  if (changed) {
    try { sessionStorage.setItem(EV_BOUNDARY_HISTORY_STORAGE_KEY, JSON.stringify([...evBoundaryHistory])); } catch {}
  }
  return history.observations;
}

/**
 * 실제 이벤트의 정렬 키를 계산한다. 다음 조건이 모두 맞을 때만 가상 extra=51로 보정한다:
 *   - elapsed가 실제로 다음 구간까지 이어진 경계(activeBoundaryElapsedSet)에 해당한다.
 *   - 추가시간이 없다(null/undefined/빈 문자열/0은 모두 0으로 취급).
 *   - 교체(subst)다. 골(PK골/자책골/PK실패 포함)과 카드는 기본적으로 해당 분의 경기 중 이벤트다.
 *   - 최신 원본 배열의 앞뒤 시간으로 휴식 중이라고 추정한 기록(after:true)이 있다.
 *
 * 실제 패널은 evActiveBoundaryElapsedSet과 evObserveBoundaryEvents 결과를 모두 넘긴다.
 * 인자가 없거나 근거가 없는 호출은 원래 분/추가시간 그대로 정렬한다. 수동 수정 이벤트도 원본
 * 이웃 추정을 그대로 적용하지 않는다(_evEdited). 원본 시간/선수와 달라졌을 수 있기 때문이다.
 *
 * ── 기존 회귀 사례 1: AS로마 vs 인테르, 연장 없이 FT ────────────────────
 *   { elapsed:90, extra:null, type:"subst", playerOrigName:"M. Thuram" }    (IN: A. Bonny)
 *   { elapsed:90, extra:null, type:"subst", playerOrigName:"L. Martinez" } (IN: F. Esposito)
 * 과거에는 경계 숫자만 보고 extra=51 → 9051로 만들어 풀타임(9050)보다 위에 표시됐다.
 * 연장이 없으면 activeBoundaryElapsedSet에 90이 없으므로 지금은 두 교체 모두 9000이다.
 * 따라서 풀타임 마커보다 아래(더 과거)에 표시된다. 이 조건을 없애면 종료 후 교체처럼 보인다.
 *
 * ── 기존 회귀 사례 2: 토트넘 vs 아스톤 빌라, 전반 추가시간 + 휴식 중 교체 ──
 *   { elapsed:45, extra:4,    type:"Goal", playerOrigName:"Johan Manzambi" }    → 4504
 *   { elapsed:45, extra:7,    type:"Card", playerOrigName:"Jan Paul van Hecke" } → 4507
 *   { elapsed:45, extra:null, type:"subst", playerOrigName:"Aaron Wan-Bissaka" } → 4551
 *   { elapsed:45, extra:null, type:"subst", playerOrigName:"Mateus Fernandes" }  → 4551
 * 여기서 두 교체는 원본 배열에서 45+7 다음, 46분 이벤트 앞에 있으며 1H 관측 기록은 없다고 가정한다.
 * 45분 교체는 HT 이후 후반 시작 기본값(4600)을 쓰므로 46분 이웃이 없어도 하프타임 뒤다.
 * 하프타임 마커는 4550. 화면 위→아래(최신→과거)는 교체 2건 → 하프타임 → 판헤커 카드 → 만잠비 골.
 * 동점 키는 원래 입력 순서를 유지한다. 만약 같은 교체를 1H에서 이미 관측했다면 observed-before가 남아
 * 4500을 유지한다. 후반 시작 기본값도 직접 관측한 전반 기록보다 우선하지 않는다.
 * 이 사례의 90+2분 카드/90+8분 골처럼 extra가 명시된 이벤트는 원래 추가시간 그대로 정렬된다.
 *
 * ── 회귀 사례 3: fixture 1583654, 하피냐 전반 45분 PK골 ──────────────────
 *   { elapsed:45, extra:null, type:"Goal", detail:"Penalty", playerId:1496 }
 * 과거의 "모든 경계 이벤트 +51" 규칙은 이 골도 4551로 만들어 하프타임 이후처럼 표시했다.
 * 지금은 골을 보정 대상에서 제외해 4500으로 유지한다. HT 응답에서 처음 받거나 새로고침해도
 * 하프타임(4550)보다 아래다. comments:"Penalty Shootout"인 승부차기는 예외로 elapsed=121을
 * 사용해 연장 후반 종료(120분) 이후에 배치한다.
 */
/** 후반에 도달한 경기의 45분 교체는 추가시간/전반 관측 근거가 없으면 후반 시작으로 본다. */
function evIsDefaultSecondHalfSubstitution(ev, activeBoundaryElapsedSet, observations) {
  if (Number(ev?.elapsed) !== 45 || Number(ev?.extra || 0) !== 0
    || !evTimeTypeIs(ev, 'subst') || ev._evEdited || !activeBoundaryElapsedSet?.has(45)) return false;
  const reason = observations?.[evBoundaryEventKey(ev)]?.reason;
  return !['observed-before', 'added-time', 'neighbors-before'].includes(reason);
}

function evSortKey(ev, activeBoundaryElapsedSet, observations) {
  const elapsed = evTimeIsShootout(ev)
    ? EV_PENALTY_SHOOTOUT_SORT_ELAPSED
    : Number(ev?.elapsed ?? 0);
  const rawExtra = Number(ev?.extra ?? 0);
  const isActiveBoundary = !!activeBoundaryElapsedSet?.has(elapsed);
  const isIntervalEvent = evTimeTypeIs(ev, 'subst') && !ev._evEdited;
  const observedAfter = observations?.[evBoundaryEventKey(ev)]?.after;
  const extra = rawExtra === 0 && isActiveBoundary && isIntervalEvent && observedAfter === true
    ? EV_PERIOD_MARKER_SORT_PADDING + 1
    : rawExtra;
  const normalKey = (Number.isFinite(elapsed) ? elapsed : 0) * 100
    + (Number.isFinite(extra) ? extra : 0);
  const boundary = EV_TIME_BOUNDARIES[elapsed];
  // 수동 선택은 자동 추정보다 우선한다. API 분/extra는 바꾸지 않고 정렬 위치만 바꾼다.
  // 승부차기는 시간값이 잘못 내려와도 전용 구간을 유지한다.
  if (!boundary || evTimeIsShootout(ev)) return normalKey;
  if (ev?._eventPeriod === boundary.before) return elapsed * 100 + (Number.isFinite(rawExtra) ? rawExtra : 0);
  if (ev?._eventPeriod === boundary.interval) return elapsed * 100 + EV_PERIOD_MARKER_SORT_PADDING + 1;
  if (ev?._eventPeriod === boundary.after) return (elapsed + 1) * 100 + (Number.isFinite(rawExtra) ? rawExtra : 0);
  if (evIsDefaultSecondHalfSubstitution(ev, activeBoundaryElapsedSet, observations)) return 4600;
  return normalKey;
}

// 수동 지정은 경계분에만 허용한다. 예를 들어 30분 골을 "후반"으로 바꾸고 싶다면
// 먼저 정보 수정에서 실제 분을 고친다. 원본 시간과 구간이 양립할 수 없는 저장값은 무시한다.
const EV_TIME_BOUNDARIES = {
  45: { before: '1H', interval: 'HT', after: '2H' },
  90: { before: '2H', interval: 'ET_BREAK', after: 'ET1' },
  105: { before: 'ET1', interval: 'ET_HT', after: 'ET2' },
  120: { before: 'ET2', interval: 'PSO_BREAK', after: 'PSO' },
};
const EV_TIME_PERIOD_LABELS = {
  '1H': '전반', HT: '하프타임', '2H': '후반', ET_BREAK: '연장 시작 전 휴식',
  ET1: '연장 전반', ET_HT: '연장 하프타임', ET2: '연장 후반', PSO_BREAK: '승부차기 전', PSO: '승부차기',
};

/** 각 소비자는 목록당 한 번 context를 만들고 같은 값을 정렬/후보/툴팁에 전달한다. */
function evBuildTimeContext(fixtureData) {
  const observations = evObserveBoundaryEvents(fixtureData);
  return { observations, active: evActiveBoundaryElapsedSet(fixtureData?.matchInfo, fixtureData?.events || []) };
}

function evTimePeriodOptions(ev) {
  const boundary = EV_TIME_BOUNDARIES[Number(ev?.elapsed)];
  if (!boundary || evTimeIsShootout(ev)) return [];
  return [boundary.before, boundary.interval, boundary.after];
}

/** 부수효과 없는 최종 판정. sortKey/period/reason을 함께 반환해 화면별 별도 추정을 막는다. */
function evResolveEventTime(ev, context = {}) {
  const elapsed = Number(ev?.elapsed ?? 0);
  const boundary = EV_TIME_BOUNDARIES[elapsed];
  const manual = evTimePeriodOptions(ev).includes(ev?._eventPeriod) ? ev._eventPeriod : null;
  const sortKey = evSortKey(ev, context.active, context.observations);
  const observation = context.observations?.[evBoundaryEventKey(ev)];
  let period = elapsed <= 45 ? '1H' : elapsed <= 90 ? '2H' : elapsed <= 105 ? 'ET1' : elapsed <= 120 ? 'ET2' : 'PSO';
  let reason = 'event-time';
  if (evTimeIsShootout(ev)) { period = 'PSO'; reason = 'shootout'; }
  else if (manual) { period = manual; reason = 'manual'; }
  else if (evIsDefaultSecondHalfSubstitution(ev, context.active, context.observations)) {
    period = '2H';
    reason = 'halftime-substitution';
  }
  else if (boundary) {
    if (sortKey === elapsed * 100 + EV_PERIOD_MARKER_SORT_PADDING + 1 && evTimeTypeIs(ev, 'subst')) {
      period = boundary.interval;
      reason = 'neighbors-after';
    } else if (Number(ev?.extra) > 0) reason = 'added-time';
    else if (evTimeTypeIs(ev, 'Goal')) reason = 'goal';
    else if (ev?._evEdited) reason = 'edited-time';
    else if (observation?.reason === 'observed-before' || observation?.reason === 'added-time') reason = observation.reason;
    else if (observation?.reason === 'neighbors-before') reason = 'neighbors-before';
    else reason = 'default-before';
  }
  return { sortKey, period, reason, timelinePosition: sortKey / 100 };
}

function evEventTimeExplanation(result) {
  const reasons = {
    manual: '직접 지정한 구간입니다. 자동 추정보다 우선합니다.',
    'halftime-substitution': '추가시간 없는 45분 교체는 기본적으로 후반 시작 교체로 판정합니다.',
    'observed-before': '이 구간이 끝나기 전에 확인된 이벤트입니다.',
    'added-time': '해당 구간의 추가시간으로 기록된 이벤트입니다.',
    goal: '경계분의 골은 해당 구간에 유지합니다.',
    'neighbors-after': '원본 앞뒤 이벤트 시간으로 휴식 중 교체라고 추정했습니다.',
    'neighbors-before': '원본 앞뒤 이벤트 시간이 이전 구간을 가리킵니다.',
    'default-before': '구간을 바꿀 근거가 부족해 이전 구간에 유지합니다.',
    'edited-time': '직접 수정한 이벤트 시간을 사용합니다.',
    shootout: '승부차기로 명시된 이벤트입니다.',
    'event-time': '기록된 이벤트 시간을 기준으로 판정했습니다.',
  };
  return `${EV_TIME_PERIOD_LABELS[result.period] || result.period} · ${reasons[result.reason] || reasons['event-time']}`;
}

/** 각 stop은 그 판정 시각까지만 포함한다. 45, 45+4(45.04), HT(45.51)는 서로 다른 시점이다.
 * 정수에 .999를 더하면 45분 stop에서 추가시간/HT 교체까지 미리 적용된다.
 * 비교 오차만 허용하고, 경기 끝 stop은 ttComputeMaxElapsed가 마지막 이벤트 이후로 잡는다. */
function evTimelineCutoff(position) {
  return Number(position) + 0.000001;
}

function evTimelinePositionLabel(position) {
  const minute = Math.floor(Number(position));
  const extra = Math.round((Number(position) - minute) * 100);
  if (extra === EV_PERIOD_MARKER_SORT_PADDING + 1 && EV_TIME_BOUNDARIES[minute]) {
    return EV_TIME_PERIOD_LABELS[EV_TIME_BOUNDARIES[minute].interval];
  }
  return extra > 0 ? `${minute}+${extra}′` : `${minute}′`;
}

/**
 * matchInfo/events로부터 각 구간 경계(45/90/105/120)를 실제로 지나 다음 구간이 이어졌는지
 * 판정한다. 구간 마커와 교체 경계 보정이 같은 기준을 사용한다.
 *   - reachedHalftime  : status가 HT 이후로 진행됐으면(HT/2H/ET1/ET2/PSO/FT).
 *   - extraTimePlayed  : 연장으로 이어진 경우에만(정규시간 종료 시 FT가 바로 안 왔다는 뜻).
 *   - reachedEt2       : status가 ET2/PSO까지 진행됐거나(=elapsed 106 이상), FT인데
 *                        사후적으로 연장이 있었다고 판단되는 경우.
 *   - hadPenalties     : status가 PSO이거나 승부차기 스코어가 존재하는 경우.
 * FT 시점엔 status만으론 연장 여부를 알 수 없어(정규/연장/PK 종료 모두 그냥 "FT") elapsed가
 * 105를 넘었는지/승부차기 스코어가 있는지로 사후 추정한다 — 생방송 중에는 ET1/ET2/PSO 상태를
 * 직접 거치므로 이 추정이 필요 없다.
 */
function evComputePeriodFlags(matchInfo, events = []) {
  const hasShootoutEvents = Array.isArray(events) && events.some(evTimeIsShootout);
  const info = matchInfo || {}; // hasShootoutEvents만으로 통과한 경우 matchInfo가 없을 수 있음

  const status = String(info.status || '').toUpperCase();
  const elapsed = Number(info.elapsed ?? 0);
  const isPenaltyStatus = status === 'PSO' || status === 'P' || status === 'PEN';
  const hadPenalties = info.homePenaltyScore != null
    || info.awayPenaltyScore != null
    || isPenaltyStatus
    || hasShootoutEvents;

  const isLiveExtraTime = status === 'ET1' || status === 'ET2' || isPenaltyStatus;
  const ftLooksLikeExtraTime = status === 'FT' && (elapsed > 105 || hadPenalties);
  const extraTimePlayed = isLiveExtraTime || ftLooksLikeExtraTime || hasShootoutEvents;
  const reachedEt2 = status === 'ET2' || isPenaltyStatus || ftLooksLikeExtraTime || hasShootoutEvents;
  const reachedHalftime = EV_HALFTIME_REACHED_STATUSES.has(status) || hasShootoutEvents;

  return { status, elapsed, isPenaltyStatus, hadPenalties, extraTimePlayed, reachedEt2, reachedHalftime, hasShootoutEvents };
}

/**
 * evSortKey가 extra 없는 교체를 마커 뒤로 보낼 수 있는 경계 집합을 만든다.
 * evBuildPeriodMarkers와 같은 evComputePeriodFlags를 사용해야 마커 생성과 정렬 보정의
 * 구간 판단이 어긋나지 않는다. 이 집합은 "현재 그 경계를 지났는가"를 말할 뿐, 개별 이벤트가
 * 경계 전/후에 생겼는지는 알려주지 않는다. 그것은 evObserveBoundaryEvents의 기록으로 보완한다.
 *
 * 45는 HT 이후, 90은 연장으로 이어진 경우, 105는 연장 후반 도달, 120은 승부차기 도달 시 허용.
 * 특히 연장 없이 FT로 끝났으면 90은 비활성이다. 풀타임 마커는 있어도 그 뒤에 다음 경기 구간이
 * 없으므로, 90분 교체를 풀타임 이후로 밀면 안 된다(위 AS로마 vs 인테르 회귀 사례).
 */
function evActiveBoundaryElapsedSet(matchInfo, events = []) {
  const { reachedHalftime, extraTimePlayed, reachedEt2, hadPenalties } = evComputePeriodFlags(matchInfo, events);
  const active = new Set();
  if (reachedHalftime) active.add(45);
  if (extraTimePlayed) active.add(90);
  if (reachedEt2) active.add(105);
  if (hadPenalties) active.add(120);
  return active;
}

/**
 * matchInfo로 지금까지 지나온 구간 구분자 목록을 만든다. 두 쌍(후반종료/풀타임,
 * 연장후반종료/풀타임)은 그 경기가 연장으로 갔는지에 따라 서로 배타적으로 하나만 나온다.
 *   - 풀타임: 연장 없이 FT로 끝났을 때, 또는 연장에서 승부차기 없이 FT로 끝났을 때.
 */
function evBuildPeriodMarkers(matchInfo, events = []) {
  const hasShootoutEvents = Array.isArray(events) && events.some(evTimeIsShootout);
  if (!matchInfo && !hasShootoutEvents) return [];

  const { status, hadPenalties, extraTimePlayed, reachedEt2, reachedHalftime, isPenaltyStatus } =
    evComputePeriodFlags(matchInfo, events);

  const markers = [];
  const addMarker = (label, sortElapsed) => markers.push({
    _isPeriodMarker: true,
    label,
    elapsed: sortElapsed,
    extra: EV_PERIOD_MARKER_SORT_PADDING,
  });

  if (reachedHalftime) addMarker('하프타임', 45);

  if (extraTimePlayed) {
    addMarker('후반종료', 90);
    if (reachedEt2) addMarker('연장 전반 종료', 105);
    if (isPenaltyStatus || hadPenalties) addMarker('연장 후반 종료', 120);
    else if (status === 'FT') addMarker('풀타임', 120);
  } else if (status === 'FT') {
    addMarker('풀타임', 90);
  }

  return markers;
}

