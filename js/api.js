  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [백엔드 API fetch]
  // 백엔드: https://football-obs-backend.onrender.com
  //
  // TODO: 아래 함수들을 구현하고, fixture.js의 fetchAndApplyFixtureData()에서 호출.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const API_BASE = 'https://football-obs-backend.onrender.com';

  // ---------------------------------------------------------------------------
  // GET /api/fixtures/{fixtureId}
  // 응답: FixtureResponseDto
  //
  // 응답 → state 매핑:
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
  //
  // TODO: 구현 완료 후 fixture.js의 fetchAndApplyFixtureData() stub을 이 함수로 교체
  // ---------------------------------------------------------------------------
  async function fetchFixture(fixtureId) {
    // TODO
    // const res = await fetch(`${API_BASE}/api/fixtures/${fixtureId}`);
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // return await res.json();
  }

  // ---------------------------------------------------------------------------
  // GET /api/playerStats/{playerId}
  // 응답: 선수 시즌별 대회별 스탯 목록
  //
  // TODO: 선수 클릭 → 메뉴 → 개인 스탯 팝업 구현 시 사용
  // ---------------------------------------------------------------------------
  async function fetchPlayerStats(playerId) {
    // TODO
    // const res = await fetch(`${API_BASE}/api/playerStats/${playerId}`);
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // return await res.json();
  }

  // ---------------------------------------------------------------------------
  // GET /api/fixtures/headtohead?home={homeTeamId}&away={awayTeamId}
  // 응답: 상대 전적 목록
  //
  // TODO: 상대 전적 팝업 또는 패널 구현 시 사용
  // ---------------------------------------------------------------------------
  async function fetchHeadToHead(homeTeamId, awayTeamId) {
    // TODO
    // const res = await fetch(`${API_BASE}/api/fixtures/headtohead?home=${homeTeamId}&away=${awayTeamId}`);
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // return await res.json();
  }
