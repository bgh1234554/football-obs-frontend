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
          startXi: clonePlayers(base.startXi || []).map(p => ({
            ...p,
            grid: grids[String(p.playerId)] || p.grid || null,
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
 * 포메이션 슬롯을 grid 순서(x → y 오름차순)로 정렬해서 반환.
 * 각 슬롯은 { coord, originalIndex } — originalIndex로 라벨/좌표 매핑 보존.
 */
function getFormationSlotsByGridOrder(formation) {
  return (getTacticsFormationMap()[formation] || [])
    .map((coord, originalIndex) => ({ coord: { ...coord }, originalIndex }))
    .sort((left, right) => {
      if (left.coord.x !== right.coord.x) return left.coord.x - right.coord.x;
      return left.coord.y - right.coord.y;
    });
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

/** 그리드 모드 모달 초기값용 — 포메이션의 슬롯 11개를 "line:row" grid 문자열 배열로 변환. */
function buildManualGridValues(formation) {
  const slots = getFormationSlotsByGridOrder(formation);
  if (!slots.length) return Array.from({ length: 11 }, (_, index) => index === 0 ? '1:1' : null);

  const uniqueLines = [...new Set(slots.map(slot => slot.coord.x))].sort((a, b) => a - b);
  return slots.map(slot => {
    const lineIndex = uniqueLines.indexOf(slot.coord.x) + 1;
    const rowSlots = slots.filter(candidate => candidate.coord.x === slot.coord.x);
    // grid 값의 col은 API-Football 관례와 동일하게 "오른쪽 -> 왼쪽" 순서로 저장한다.
    // getOrderedLineupPlayers()가 같은 line 안에서 col 내림차순으로 정렬하기 때문에,
    // 여기서도 RB/RW가 더 큰 col을 갖도록 맞춰야 저장 후 재로딩 시 좌우가 뒤집히지 않는다.
    const rowIndex = rowSlots.length - rowSlots.findIndex(candidate => candidate.originalIndex === slot.originalIndex);
    return `${lineIndex}:${rowIndex}`;
  });
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

