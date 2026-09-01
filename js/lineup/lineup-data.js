// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [라인업 패널 / 데이터 합성]
// API fixture 응답 + lineup-manual-store.js의 수동 override를 합성해 실제 표시용
// 데이터(buildEffectiveFixtureData)를 만든다. 그리드/포메이션/색상 변환 헬퍼도 포함.
// lineup-manual-store.js 로드 후 사용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * API fixture 응답에 수동 override를 합성해 "실제 표시용" 상세 패널 데이터를 만든다.
 * startXi 풀폼 override, grid-only override, 교체 명단, 감독/주심, 부상자 명단을 모두 여기서 병합한다.
 */
function buildEffectiveFixtureData(data) {
  if (!data) return null;

  // 1) 현재 fixture에 대해 저장된 수동 입력이 없으면 원본 응답을 그대로 사용.
  const fixtureId = getFixtureIdFromData(data);
  const entry = getManualEntry(fixtureId);

  // 2) 원본 객체를 직접 훼손하지 않도록 라인업/부상 배열을 먼저 복제한다.
  const next = {
    ...data,
    homeLineup: cloneLineup(data.homeLineup),
    awayLineup: cloneLineup(data.awayLineup),
    homeInjuries: cloneInjuries(data.homeInjuries),
    awayInjuries: cloneInjuries(data.awayInjuries),
  };
  // 교체 선수 수동 연동 override(events-panel.js) 적용 — subReflect swap이 이를 반영하도록.
  if (typeof window.evPatchSubstEvents === 'function' && Array.isArray(next.events)) {
    next.events = window.evPatchSubstEvents(next.events, fixtureId);
  }
  // 교체 IN 이벤트에만 등장하고 교체 명단(substitutes)엔 없는 선수를 벤치에 보강.
  // (예: API가 벤치 명단 갱신 없이 실제로 투입된 선수를 이벤트에서만 내려주는 경우 —
  //  lpFindLineupPlayerIndex가 substitutes에서 못 찾아 subReflect swap이 그냥 skip됨.)
  synthesizeMissingBenchPlayers(next);
  if (!entry) {
    // 수동 입력이 없으면 ID override만 적용하고 바로 반환.
    if (typeof window.applyZeroIdOverrides === 'function') {
      window.applyZeroIdOverrides(next, fixtureId);
    }
    return next;
  }

  // 3) 홈/원정 각각에 대해 라인업, 벤치, 감독, 부상자 override를 순서대로 적용한다.
  ['home', 'away'].forEach(side => {
    const manualSide = entry[side];
    if (!manualSide) return;

    const lineupKey = `${side}Lineup`;
    let lineup = next[lineupKey];

    if (manualSide.lineup) {
      const base = lineup || { formation: null, startXi: [], substitutes: [], coach: null };
      if (Array.isArray(manualSide.lineup.startXi)) {
        // (A) 풀폼 모드 — startXi 통째 override
        lineup = {
          ...base,
          formation: manualSide.lineup.formation || base.formation || null,
          startXi: clonePlayers(manualSide.lineup.startXi || []),
          substitutes: clonePlayers(base.substitutes || []),
          coach: base.coach ? { ...base.coach } : null,
        };
      } else if (manualSide.lineup.gridByPlayerId) {
        // (B) 그리드만 모드 — API의 startXi를 보존, formation + 선수별 grid만 override.
        // 카드/교체 이벤트는 자동 모드와 같은 데이터 구조라 그대로 작동.
        const grids = manualSide.lineup.gridByPlayerId;
        lineup = {
          ...base,
          formation: manualSide.lineup.formation || base.formation || null,
          startXi: clonePlayers(base.startXi || []).map((p, idx) => ({
            ...p,
            grid: grids[buildLineupRosterKey(p, idx)] || p.grid || null,
          })),
          substitutes: clonePlayers(base.substitutes || []),
          coach: base.coach ? { ...base.coach } : null,
        };
      }
      next[lineupKey] = lineup;
    }

    if (manualSide.bench) {
      const base = lineup || next[lineupKey] || { formation: null, startXi: [], substitutes: [], coach: null };
      lineup = {
        ...base,
        startXi: clonePlayers(base.startXi || []),
        substitutes: clonePlayers(manualSide.bench || []),
        coach: base.coach ? { ...base.coach } : null,
      };
      next[lineupKey] = lineup;
    }

    if (manualSide.coachName) {
      const base = lineup || next[lineupKey] || { formation: null, startXi: [], substitutes: [], coach: null };
      lineup = {
        ...base,
        startXi: clonePlayers(base.startXi || []),
        substitutes: clonePlayers(base.substitutes || []),
        coach: {
          ...(base.coach || {}),
          name: manualSide.coachName,
          nameKoLong: manualSide.coachName,
        },
      };
      next[lineupKey] = lineup;
    }

    if (manualSide.injuries) {
      next[`${side}Injuries`] = cloneInjuries(manualSide.injuries);
    }
  });

  // 4) 주심은 fixture 공통 데이터라 side 바깥에서 한 번만 반영한다.
  // fixture 단위로 저장된 manualEntry.refereeName 적용 — API에 주심 없을 때만 의미가 있지만,
  // setRefereeElement는 raw fixture 기준 editable 여부를 판별하므로 항상 override 우선.
  const manualReferee = String(entry.refereeName || '').trim();
  if (manualReferee) {
    next.matchInfo = { ...(next.matchInfo || {}), refereeName: manualReferee };
  }

  // 5) 수동 라인업 적용 후 ID override 적용 — 수동 선수 데이터가 한글 이름을 덮어쓰지 않도록
  //    항상 마지막에 실행한다.
  if (typeof window.applyZeroIdOverrides === 'function') {
    window.applyZeroIdOverrides(next, fixtureId);
  }

  return next;
}

/**
 * 교체 IN(assistId)으로 이벤트에 등장하는 선수가 라인업(startXi)에도 교체 명단
 * (substitutes)에도 없으면, playerStats(항상 실제로 뛴 선수 기준으로 내려옴)에서
 * 이름/사진/포지션/등번호를 찾아 벤치에 합성해 넣는다. playerStats에도 없으면
 * 이벤트 쪽 assist* 필드(이름만)로 최소한의 항목을 만든다 — 이름조차 없으면 표시할
 * 수 없으므로 skip.
 * 이렇게 해야 lpFindLineupPlayerIndex(substitutes, ...)가 그 선수를 찾을 수 있어
 * subReflect(교체 반영) swap과 벤치 패널 표시가 정상 작동한다. 원본 객체는 건드리지
 * 않고 next를 직접 변형한다(buildEffectiveFixtureData가 이미 clone한 next 대상).
 */
function synthesizeMissingBenchPlayers(next) {
  if (!next) return;
  const events = Array.isArray(next.events) ? next.events : [];
  const playerStats = Array.isArray(next.playerStats) ? next.playerStats : [];
  if (!events.length) return;

  ['home', 'away'].forEach(side => {
    const lineupKey = `${side}Lineup`;
    const lineup = next[lineupKey];
    if (!lineup) return;

    const knownIds = new Set(
      [...(lineup.startXi || []), ...(lineup.substitutes || [])]
        .map(p => Number(p?.playerId))
        .filter(id => Number.isFinite(id) && id > 0)
    );

    const missingIds = new Set();
    events.forEach(ev => {
      if (!ev || ev.side !== side || String(ev.type || '').toLowerCase() !== 'subst') return;
      const inId = Number(ev.assistId);
      if (Number.isFinite(inId) && inId > 0 && !knownIds.has(inId)) missingIds.add(inId);
    });
    if (!missingIds.size) return;

    const added = [];
    missingIds.forEach(id => {
      // playerStats가 사진/포지션/등번호까지 갖춘 가장 정확한 소스 — side까지 일치해야 오매칭 방지.
      const statRow = playerStats.find(p => p && Number(p.playerId) === id && p.side === side);
      const eventRow = events.find(ev => ev && ev.side === side
        && String(ev.type || '').toLowerCase() === 'subst' && Number(ev.assistId) === id);

      const name = statRow?.playerName || eventRow?.assistName || '';
      if (!name) return; // 이름조차 없으면 표시 불가 — skip

      added.push({
        playerId: id,
        name,
        nameKoLong: statRow?.playerNameKoLong || eventRow?.assistNameKoLong || null,
        origName: eventRow?.assistOrigName || null,
        photoUrl: statRow?.playerPhotoUrl || null,
        number: statRow?.number ?? null,
        pos: statRow?.position || null,
        grid: null,
      });
    });

    if (added.length) {
      next[lineupKey] = { ...lineup, substitutes: [...(lineup.substitutes || []), ...added] };
    }
  });
}

// Iter 5-3: 교체 이벤트로 선발/벤치 swap. subReflect=on일 때만 적용.
// buildEffectiveFixtureData 결과를 받아 양 팀 startXi/substitutes를 이벤트 기반으로 재구성한 새 객체 반환.
// 데이터 변형은 lpApplySubReflectToLineup이 새 객체를 만들어 돌려주므로 입력 lineup은 안 건드림.
function applySubReflectToFixture(data) {
  if (!data) return data;
  const subReflectOn = (typeof getSetting === 'function') && getSetting('subReflect') === 'on';
  if (!subReflectOn) return data;
  if (typeof lpApplySubReflectToLineup !== 'function') return data;

  const events = Array.isArray(data.events) ? data.events : [];
  return {
    ...data,
    homeLineup: lpApplySubReflectToLineup(data.homeLineup, 'home', events),
    awayLineup: lpApplySubReflectToLineup(data.awayLineup, 'away', events),
  };
}

/** 한 사이드의 표시용 팀명. teamName 토글에 따라 long/short 선택, 빈 값은 다른 쪽 또는 기본 라벨로 폴백. */
function getTeamName(data, side) {
  const matchInfo = data?.matchInfo || {};
  const shortName = side === 'home'
    ? (matchInfo.homeTeamNameShort || '')
    : (matchInfo.awayTeamNameShort || '');
  const longName = side === 'home'
    ? (matchInfo.homeTeamName || '')
    : (matchInfo.awayTeamName || '');
  // 'teamName' 토글: long이면 풀네임, short이면 단축명. 빈 값은 다른 쪽으로 자동 폴백.
  const useLong = (typeof isLongName === 'function') && isLongName('teamName');
  const fallback = side === 'home' ? 'HOME' : 'AWAY';
  if (useLong) return longName || shortName || fallback;
  return shortName || longName || fallback;
}

/** API의 grid 값("X:Y") → {line, col} 객체. 잘못된 형식이면 null. */
function parseGridValue(value) {
  const match = String(value || '').match(/^(\d+):(\d+)$/);
  if (!match) return null;
  return { line: Number(match[1]), col: Number(match[2]) };
}

/**
 * grid 비교자. line(수비라인부터 1) 오름차순 + col 내림차순으로 정렬.
 * (col 내림차순: API의 col은 오른쪽에서 1부터인데 화면에선 왼쪽이 1번 슬롯이라 뒤집음.)
 * null grid는 항상 뒤로 보냄.
 */
function compareParsedGrid(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  if (left.line !== right.line) return left.line - right.line;
  return right.col - left.col;
}

/** startXi를 grid 순서로 정렬한 새 배열 반환. 원본 보존. */
function getOrderedLineupPlayers(players) {
  return clonePlayers(players).sort((a, b) => {
    const left = parseGridValue(a.grid);
    const right = parseGridValue(b.grid);
    return compareParsedGrid(left, right);
  });
}

/** lineup에 선발 11명(또는 그 이상)이 들어있는지. 빈 배열/null은 false. */
function hasStartXi(lineup) {
  return Array.isArray(lineup?.startXi) && lineup.startXi.length > 0;
}

/** lineup의 formation이 TACTICS_FM에 등록된 알려진 포메이션인지. */
function hasValidFormation(lineup) {
  const formation = String(lineup?.formation || '').trim();
  return !!(formation && getTacticsFormationMap()[formation]);
}

// Iter 3: API 라인업(startXi)이 있는 모든 경우 — 그리드 모드. 사용자가 데이터 오류나
// 교체 후 포메이션 변경을 직접 손볼 수 있도록, 포메이션이 이미 제공된 경우에도 활성화.
// startXi 자체가 없는 경우만 풀폼 모드(직접 입력) 라우팅.
function isGridMode(rawData, side) {
  const lineup = rawData?.[`${side}Lineup`];
  return !!lineup && hasStartXi(lineup);
}

/** 포메이션의 슬롯별 포지션 라벨(GK/CB/RB/...). 알 수 없는 포메이션이면 1~11 숫자 fallback. */
function getFormationSlotLabels(formation) {
  const labels = getTacticsLabelMap()[formation];
  if (Array.isArray(labels) && labels.length) return labels;
  return Array.from({ length: 11 }, (_, index) => `${index + 1}`);
}

/** 라벨 텍스트(GK/CB/CDM 등)에서 G/D/M/F 큰 분류 추출. 노드 색/그룹화 등 폴백 사용. */
function inferBasePos(label) {
  const upper = String(label || '').toUpperCase();
  if (upper.includes('GK')) return 'G';
  if (upper.includes('CB') || upper.includes('LB') || upper.includes('RB') || upper.includes('WB')) return 'D';
  if (upper.includes('DM') || upper.includes('CM') || upper.includes('AM') || upper.includes('LM') || upper.includes('RM') || upper.includes('M')) return 'M';
  return 'F';
}

/**
 * 포메이션 문자열(예: "3-5-2")을 GK(1) + 숫자 그대로의 라인 인원수로 해석.
 * API-Football의 grid "line" 번호는 TACTICS_FM의 x좌표가 아니라 이 포메이션 숫자
 * 그대로를 따른다(예: "3-5-2"는 윙백 포함 5명이 항상 같은 line:3으로 내려옴 — 실제
 * fixture 데이터로 확인됨). 합이 좌표 개수와 안 맞으면(커스텀/손상 포메이션) null.
 */
function getFormationLineSizes(formation, coordsLength) {
  const digits = String(formation || '').split('-').map(Number);
  if (!digits.length || digits.some(n => !Number.isFinite(n) || n <= 0)) return null;
  const sizes = [1, ...digits];
  return sizes.reduce((sum, n) => sum + n, 0) === coordsLength ? sizes : null;
}

/**
 * 포메이션의 11개 슬롯을 "라인" 단위로 그룹핑해서 반환 (순서: GK → 최전방).
 * 라인 경계는 포메이션 숫자(getFormationLineSizes) 기준으로 원본 배열을 순서대로 끊어서
 * 정한다 — TACTICS_FM의 x(깊이) 값 자체는 더 이상 그룹 경계로 쓰지 않는다. 그래야 같은
 * 라인 안에서 특정 선수(예: 윙백)만 깊이를 다르게 그리고 싶을 때 x를 조정해도, API가 실제로
 * 보내는 grid 라인 묶음과 어긋나 선수가 엉뚱한 슬롯에 배치되는 사고가 안 난다.
 * 포메이션 숫자 파싱이 안 되는 커스텀/손상 케이스만 x값 동일 여부로 그룹핑(과거 동작 폴백).
 * 각 그룹 내부는 y(좌우) 오름차순으로 정렬.
 */
function getFormationLineGroups(formation) {
  const coords = getTacticsFormationMap()[formation] || [];
  const slots = coords.map((coord, originalIndex) => ({ coord: { ...coord }, originalIndex }));
  if (!slots.length) return [];

  const lineSizes = getFormationLineSizes(formation, slots.length);
  let groups;
  if (lineSizes) {
    groups = [];
    let cursor = 0;
    lineSizes.forEach(size => {
      groups.push(slots.slice(cursor, cursor + size));
      cursor += size;
    });
  } else {
    const byX = new Map();
    slots.forEach(slot => {
      if (!byX.has(slot.coord.x)) byX.set(slot.coord.x, []);
      byX.get(slot.coord.x).push(slot);
    });
    groups = [...byX.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group);
  }
  return groups.map(group => group.slice().sort((a, b) => a.coord.y - b.coord.y));
}

/**
 * 포메이션 슬롯을 grid 순서(라인 → y 오름차순)로 정렬해서 반환.
 * 각 슬롯은 { coord, originalIndex } — originalIndex로 라벨/좌표 매핑 보존.
 */
function getFormationSlotsByGridOrder(formation) {
  return getFormationLineGroups(formation).flat();
}

/**
 * 포메이션에서 최전방(FW) 바로 앞 라인의 depth를 구한다.
 * split 모드의 awaySupportLift가 이 라인까지 들어올리면 FW와의 간격이 좁아지므로 제외 대상으로 쓴다.
 */
function getPreFwFormationDepth(formation) {
  const depths = Array.from(new Set(
    (getTacticsFormationMap()[formation] || []).map(coord => {
      const rawX = Number(coord?.x) || 5;
      return Math.max(0, Math.min(1, (rawX - 5) / 39));
    })
  )).sort((a, b) => b - a);
  return depths.length > 1 ? depths[1] : null;
}

/**
 * 슬롯 ↔ 선수 매핑을 grid 순서대로 짝지어 반환.
 * 선수가 없는 슬롯은 결과에서 제외 (포메이션 11개 < startXi 11명일 수도 있는 잡음 방어).
 */
function getFormationAssignments(lineup) {
  const slots = getFormationSlotsByGridOrder(lineup?.formation);
  const players = getOrderedLineupPlayers(lineup?.startXi || []);
  return slots
    .map((slot, index) => ({ slot, player: players[index] || null }))
    .filter(entry => !!entry.player);
}

/** 포메이션+선발이 모두 유효하고 실제로 슬롯-선수 매핑이 1개 이상 나오는지 — 피치 그리기 가능 여부. */
function canRenderPitchMode(lineup) {
  if (!hasValidFormation(lineup) || !hasStartXi(lineup)) return false;
  return getFormationAssignments(lineup).length > 0;
}

/**
 * 그리드 모드 모달 초기값용 — 포메이션의 슬롯 11개를 "line:row" grid 문자열 배열로 변환.
 * (originalIndex 순서, 즉 TACTICS_FM 배열 순서 그대로 — slotPlayerIds와 같은 인덱싱.)
 * getFormationLineGroups와 같은 라인 그룹핑을 써야, 여기서 만든 "line:row" 값이
 * getOrderedLineupPlayers/getFormationAssignments가 실제 API grid를 해석할 때 쓰는
 * 라인 번호와 어긋나지 않는다.
 */
function buildManualGridValues(formation) {
  const groups = getFormationLineGroups(formation);
  if (!groups.length) return Array.from({ length: 11 }, (_, index) => index === 0 ? '1:1' : null);

  const gridBySlotIndex = [];
  groups.forEach((group, lineZeroBased) => {
    const lineIndex = lineZeroBased + 1;
    group.forEach((slot, rowFromLeft) => {
      // grid 값의 col은 API-Football 관례와 동일하게 "오른쪽 -> 왼쪽" 순서로 저장한다.
      // getOrderedLineupPlayers()가 같은 line 안에서 col 내림차순으로 정렬하기 때문에,
      // 여기서도 RB/RW가 더 큰 col을 갖도록 맞춰야 저장 후 재로딩 시 좌우가 뒤집히지 않는다.
      gridBySlotIndex[slot.originalIndex] = `${lineIndex}:${group.length - rowFromLeft}`;
    });
  });
  return gridBySlotIndex;
}

/** form input value trim. null/undefined는 빈 문자열. */
function getInputValue(value) {
  return String(value ?? '').trim();
}

/** '#' 유무 무관하게 받은 hex 문자열에 '#'을 붙여 정규화. 빈 값이면 fallback. */
function normalizeHexColor(value, fallback) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

/** 6자리 hex 색상 뒤에 alpha(2자리 hex) 붙이기. 형식이 안 맞으면 alpha 없이 그대로 반환. */
function withAlpha(hexColor, alphaHex) {
  const normalized = normalizeHexColor(hexColor, '');
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? `${normalized}${alphaHex}` : normalized;
}

/**
 * 라인업 토큰/팀 chip 색상 — state.colors를 우선 사용.
 *   applyFixtureToState가 API의 homePrimaryColor를 state.colors.homeBg에 동기화하고,
 *   사용자가 테마 탭에서 직접 바꾸면 거기서도 state.colors가 갱신됨 → 한 곳만 보면 일관됨.
 *   greenscreen ON일 때는 chromaSafe()로 초록 계열 → 시안 자동 치환.
 */
function getLineupSideColors(data, side) {
  const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
  if (side === 'home') {
    return {
      bg: cs(normalizeHexColor(state?.colors?.homeBg, '#2563eb')),
      text: cs(normalizeHexColor(state?.colors?.homeText, '#ffffff')),
    };
  }
  return {
    bg: cs(normalizeHexColor(state?.colors?.awayBg, '#ef4444')),
    text: cs(normalizeHexColor(state?.colors?.awayText, '#ffffff')),
  };
}

/** 패널 빈 상태 placeholder HTML. */
function buildEmptyHtml(message) {
  return `<div class="dp-empty">${dpEscape(message)}</div>`;
}

