  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [백엔드 API fetch]
  // 백엔드: https://football-obs-backend.onrender.com
  //
  // 통신 레이어 전용. 응답 본문(JSON)을 그대로 반환하거나 ApiError를 throw.
  // state 매핑/렌더링은 호출자(fixture.js 등)에서 처리.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const API_BASE = 'https://football-obs-backend.onrender.com';

  /**
   * 백엔드 ErrorResult를 담는 커스텀 에러.
   * 응답 본문이 ErrorResult 형식이면 code/message/status/path/timestamp가 채워짐.
   * 네트워크 오류 등 본문 파싱 실패 시 status=0, code='NETWORK_ERROR'.
   */
  class ApiError extends Error {
    constructor({ code, message, status, path, timestamp }) {
      super(message || `API error (${code || status})`);
      this.name = 'ApiError';
      this.code = code || null;
      this.status = status ?? 0;
      this.path = path || null;
      this.timestamp = timestamp || null;
    }
  }

  /**
   * 공통 fetch 헬퍼. 응답이 ok가 아니면 ErrorResult를 파싱해 ApiError throw.
   * 응답 본문이 비어있거나 JSON 파싱 실패하면 null 반환.
   * timeout: AbortController로 10초 기본 타임아웃 구현. timeout 발생 시 NETWORK_TIMEOUT 코드 반환.
   */
  async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10000; // 기본 10초 타임아웃
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

    if (!res.ok) {
      const err = (body && typeof body === 'object') ? body : {};
      throw new ApiError({
        code:      err.code      || `HTTP_${res.status}`,
        message:   err.message   || res.statusText,
        status:    err.status    ?? res.status,
        path:      err.path      || path,
        timestamp: err.timestamp || null,
      });
    }
    return body;
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
  // 라인업 연동:
  //   homeLineup.startXi / awayLineup.startXi → tacticsApplyLineup() 호출
  //   PlayerDto { playerId, name, number, pos, grid } → _isReal: true 플래그 추가 시 전술판에서 한글 이름 표시
  // ---------------------------------------------------------------------------
  async function fetchFixture(fixtureId) {
    return await apiFetch(`/api/fixtures/${encodeURIComponent(fixtureId)}`);
  }

  // ---------------------------------------------------------------------------
  // GET /api/playerStats/{playerId}
  // 응답: PlayerProfileStatResponseDto (선수 기본 정보 + 시즌별 대회 스탯)
  //
  // 시즌은 백엔드가 결정 (9/1 이전: 전 시즌+현 시즌, 이후: 현 시즌).
  // 사용처: 선수 클릭 → 메뉴 → 개인 스탯 팝업
  // ---------------------------------------------------------------------------
  async function fetchPlayerStats(playerId) {
    return await apiFetch(`/api/playerStats/${encodeURIComponent(playerId)}`);
  }

  // ---------------------------------------------------------------------------
  // GET /api/hth?teamA={teamA}&teamB={teamB}
  // 응답: HthResponseDto (matches[]는 날짜 내림차순 정렬)
  //
  // 양 팀 순서가 바뀌어도 동일 결과 반환.
  // 사용처: 상대 전적 패널 / 팝업
  // ---------------------------------------------------------------------------
  async function fetchHeadToHead(teamA, teamB) {
    const qs = `teamA=${encodeURIComponent(teamA)}&teamB=${encodeURIComponent(teamB)}`;
    return await apiFetch(`/api/hth?${qs}`);
  }
