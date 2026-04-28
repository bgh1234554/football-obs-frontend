  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [백엔드 API fetch]
  // 백엔드: https://football-obs-backend.onrender.com
  //
  // 통신 레이어 전용. 응답 본문(JSON)을 그대로 반환하거나 ApiError를 throw.
  // state 매핑/렌더링은 호출자(fixture.js 등)에서 처리.
  //
  // 추가 정책:
  //   - 429 Too Many Requests 응답 시, 백엔드가 내려준
  //     Retry-After / X-Retry-After-Millis 헤더를 읽어 자동 재시도.
  //   - 백엔드 헤더를 브라우저에서 읽으려면 CORS의
  //     Access-Control-Expose-Headers 에 해당 헤더명이 포함되어 있어야 함.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const API_BASE = 'https://football-obs-backend.onrender.com';

  // 429 fallback 재시도 정책.
  // 백엔드가 대기시간 헤더를 안 내려주거나, 브라우저가 CORS 때문에 헤더를 읽지 못하는 경우 사용.
  // 현재 백엔드 버킷 정책(4초마다 1토큰 충전)에 맞춰 5초를 보수적 기본값으로 둔다.
  const RATE_LIMIT_FALLBACK_MS = 5000;
  // 헤더에 적힌 시간에 약간의 버퍼를 더해 경계 타이밍에서 다시 429를 맞는 확률을 줄인다.
  const RATE_LIMIT_RETRY_BUFFER_MS = 300;
  // 한 번의 apiFetch 호출 안에서 허용할 최대 429 자동 재시도 횟수.
  // 0이면 자동 재시도 없이 즉시 ApiError를 던진다.
  const RATE_LIMIT_MAX_RETRIES = 2;

  /**
   * 백엔드 ErrorResult를 담는 커스텀 에러.
   * 응답 본문이 ErrorResult 형식이면 code/message/status/path/timestamp가 채워짐.
   * 네트워크 오류 등 본문 파싱 실패 시 status=0, code='NETWORK_ERROR'.
   *
   * 추가 필드:
   *   retryAfterMs
   *     - 429 응답일 때 "다음 재시도까지 기다린 시간(또는 기다려야 할 시간)"을 ms로 저장.
   *   retryCount
   *     - 해당 요청에서 429 자동 재시도를 몇 번 수행했는지 기록.
   */
  class ApiError extends Error {
    constructor({ code, message, status, path, timestamp, retryAfterMs, retryCount }) {
      super(message || `API error (${code || status})`);
      this.name = 'ApiError';
      this.code = code || null;
      this.status = status ?? 0;
      this.path = path || null;
      this.timestamp = timestamp || null;
      this.retryAfterMs = Math.max(0, Number(retryAfterMs) || 0);
      this.retryCount = Math.max(0, Number(retryCount) || 0);
    }
  }

  /** ms만큼 대기하는 Promise helper */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 429 응답 헤더에서 "몇 ms 뒤 재시도할지"를 읽는다.
   *
   * 우선순위:
   *   1. X-Retry-After-Millis  (백엔드 커스텀 ms 헤더)
   *   2. Retry-After           (표준 헤더: 초 숫자 또는 HTTP-date)
   *   3. RATE_LIMIT_FALLBACK_MS
   *
   * 참고:
   *   - fetch에서 res.headers.get(...)이 항상 읽히는 건 아님.
   *   - CORS expose 설정이 없으면 네트워크 응답에 헤더가 있어도 JS에선 null일 수 있다.
   *   - 그래서 fallback 경로를 반드시 둔다.
   */
  function readRetryAfterMs(res) {
    const retryAfterMsHeader = Number(res.headers.get('X-Retry-After-Millis'));
    if (Number.isFinite(retryAfterMsHeader) && retryAfterMsHeader >= 0) {
      return retryAfterMsHeader;
    }

    const retryAfter = String(res.headers.get('Retry-After') || '').trim();
    if (!retryAfter) return RATE_LIMIT_FALLBACK_MS;

    // Retry-After: "5" 같은 초 단위 숫자
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return retryAfterSeconds * 1000;
    }

    // Retry-After: "Wed, 21 Oct 2015 07:28:00 GMT" 같은 HTTP-date 형식
    const retryAtMs = Date.parse(retryAfter);
    if (!Number.isNaN(retryAtMs)) {
      return Math.max(0, retryAtMs - Date.now());
    }

    return RATE_LIMIT_FALLBACK_MS;
  }

  /**
   * 최종 재시도 대기시간(ms) 계산.
   * - 음수 방지
   * - 너무 짧은 값 방지 (최소 1초)
   * - 경계 타이밍 버퍼(+300ms) 추가
   */
  function normalizeRetryDelayMs(res) {
    const waitMs = Math.max(0, readRetryAfterMs(res));
    return Math.max(1000, waitMs + RATE_LIMIT_RETRY_BUFFER_MS);
  }

  /**
   * 429 이벤트를 UI 레이어로 전달.
   *
   * 왜 document CustomEvent를 쓰나?
   *   - api.js는 통신 전용 레이어라서 fixture.js의 토스트/배지 함수(showToast, setApiStatus)를 직접 알면 결합이 강해진다.
   *   - 대신 "429가 났고, 몇 ms 뒤 재시도할 예정인지"만 이벤트로 브로드캐스트하면
   *     fixture.js가 필요한 방식으로만 UI 반응을 붙일 수 있다.
   *
   * detail.silent:
   *   - 폴링(silent fetch)처럼 시청자 화면을 건드리고 싶지 않은 호출은 true.
   *   - fixture.js는 이 값을 보고 토스트/상태표시를 생략한다.
   */
  function notifyRateLimit(path, waitMs, options = {}) {
    document.dispatchEvent(new CustomEvent('api:rate-limit', {
      detail: {
        path,
        waitMs,
        silent: !!options.silent,
        attempt: Math.max(1, Number(options.attempt) || 1),
        willRetry: !!options.willRetry,
      }
    }));
  }

  /**
   * 공통 fetch 헬퍼. 응답이 ok가 아니면 ErrorResult를 파싱해 ApiError throw.
   * 응답 본문이 비어있거나 JSON 파싱 실패하면 null 반환.
   * timeout: AbortController로 10초 기본 타임아웃 구현. timeout 발생 시 NETWORK_TIMEOUT 코드 반환.
   *
   * 추가 동작:
   *   - 429 응답이면 지정 횟수만큼 자동 재시도
   *   - 재시도 전에 api:rate-limit 이벤트 발행
   *   - 재시도 횟수를 모두 소진하면 마지막 429를 ApiError로 throw
   */
  async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10000; // 기본 10초 타임아웃
    // ?? 대신 || 를 쓰면 호출자가 명시적으로 0(=재시도 없음)을 넘겨도 기본값으로 덮여버림.
    // nullish 병합으로 undefined/null만 fallback 처리.
    const maxRateLimitRetries = Math.max(0, Number(options.rateLimitRetries ?? RATE_LIMIT_MAX_RETRIES));

    // 일반 오류는 즉시 throw, 429만 같은 호출 컨텍스트 안에서 재시도한다.
    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
      const controller = new AbortController();
      let timeoutId = null;
      let res;

      try {
        // 타임아웃 타이머 시작
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });

        // fetch 성공 시 타이머 즉시 정리
        clearTimeout(timeoutId);
      } catch (e) {
        clearTimeout(timeoutId);

        // AbortError는 NETWORK_TIMEOUT으로 변환
        if (e.name === 'AbortError') {
          throw new ApiError({ code: 'NETWORK_TIMEOUT', message: '요청 시간 초과 (10초)', status: 0, path });
        }

        throw new ApiError({ code: 'NETWORK_ERROR', message: e.message, status: 0, path });
      }

      let body = null;
      const text = await res.text();
      if (text) {
        try { body = JSON.parse(text); } catch { /* 본문이 JSON이 아니면 null 유지 */ }
      }

      if (res.ok) return body;

      const err = (body && typeof body === 'object') ? body : {};
      const retryAfterMs = normalizeRetryDelayMs(res);
      const willRetry = res.status === 429 && attempt < maxRateLimitRetries;

      if (res.status === 429) {
        notifyRateLimit(path, retryAfterMs, {
          silent: options.silent,
          attempt: attempt + 1,
          willRetry,
        });

        if (willRetry) {
          await sleep(retryAfterMs);
          continue;
        }
      }

      throw new ApiError({
        code:      err.code      || `HTTP_${res.status}`,
        message:   err.message   || res.statusText,
        status:    err.status    ?? res.status,
        path:      err.path      || path,
        timestamp: err.timestamp || null,
        retryAfterMs: res.status === 429 ? retryAfterMs : 0,
        retryCount: res.status === 429 ? attempt : 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/fixtures/{fixtureId}
  // 응답: FixtureResponseDto (또는 200 null — fixture 원본 미존재 시)
  //
  // 응답 → state 매핑 (fixture.js에서 처리):
  //   matchInfo.homeTeamNameShort → state.homeName
  //   matchInfo.awayTeamNameShort → state.awayName
  //   matchInfo.homeScore         → state.homeScore   (정규+연장 goals)
  //   matchInfo.awayScore         → state.awayScore
  //   matchInfo.homePenaltyScore  → state.pk.home 배열 재구성 (null이면 PSO 아님)
  //   matchInfo.awayPenaltyScore  → state.pk.away 배열 재구성
  //   matchInfo.homeTeamLogo      → state.homeLogo
  //   matchInfo.awayTeamLogo      → state.awayLogo
  //   matchInfo.homePrimaryColor  → state.homeBg
  //   matchInfo.homeNumberColor   → state.homeText
  //   matchInfo.awayPrimaryColor  → state.awayBg
  //   matchInfo.awayNumberColor   → state.awayText
  //   matchInfo.status            → state.half  ("1H"|"HT"|"2H"|"ET1"|"ET2"|"PSO"→"PK"|"FT"|"NS")
  //   matchInfo.elapsed           → state.seconds (elapsed * 60)
  //   matchInfo.extra             → state.extra (null이면 추가시간 없음)
  //
  // events 배열 가공:
  //   type==="Goal" && detail!=="Missed Penalty" → buildScorers() → state.notes.home/away
  //   type==="Card" && detail==="Red Card"|"Second Yellow Card" → state.redHome/redAway
  //   comments==="Penalty Shootout" → PK 결과 배열 재구성 (detail==="Penalty"→"G", "Missed Penalty"→"M")
  //
  // options:
  //   silent: true면 429 재시도 이벤트를 UI가 무시할 수 있도록 detail.silent=true로 전파
  // ---------------------------------------------------------------------------
  async function fetchFixture(fixtureId, options = {}) {
    return await apiFetch(`/api/fixtures/${encodeURIComponent(fixtureId)}`, options);
  }

  // ---------------------------------------------------------------------------
  // GET /api/playerStats/{playerId}
  // 응답: PlayerProfileStatResponseDto (선수 기본 정보 + 시즌별 대회 스탯)
  //
  // 시즌은 백엔드가 결정 (9/1 이전: 전 시즌+현 시즌, 이후: 현 시즌).
  // 사용처: 선수 클릭 → 메뉴 → 개인 스탯 팝업
  // ---------------------------------------------------------------------------
  async function fetchPlayerStats(playerId, options = {}) {
    return await apiFetch(`/api/playerStats/${encodeURIComponent(playerId)}`, options);
  }

  // ---------------------------------------------------------------------------
  // GET /api/hth?teamA={teamA}&teamB={teamB}
  // 응답: HthResponseDto (matches[]는 날짜 내림차순 정렬)
  //
  // 양 팀 순서가 바뀌어도 동일 결과 반환.
  // 사용처: 상대 전적 패널 / 팝업
  // ---------------------------------------------------------------------------
  async function fetchHeadToHead(teamA, teamB, options = {}) {
    const qs = `teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}`;
    return await apiFetch(`/api/hth?${qs}`, options);
  }
