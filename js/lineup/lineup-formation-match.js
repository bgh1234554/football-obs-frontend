// 포메이션 변경은 API grid 번호가 아니라 현재 슬롯의 역할/좌우/좌표를 기준으로 한다.
// 전술적 관계와 대응 규칙의 근거: docs/formation-transitions.md
const LINEUP_FORMATION_FAMILIES = [
  { formations: ['4-3-1-2', '4-1-2-1-2', '4-1-3-2'], aliases: { RW: 'RCM', LW: 'LCM' } },
  { formations: ['3-5-2', '3-1-4-2', '5-3-2'], aliases: {} },
  { formations: ['3-4-3', '3-4-2-1', '5-2-3', '5-4-1'], aliases: { RAM: 'RW', LAM: 'LW', RM: 'RW', LM: 'LW' } },
  { formations: ['4-3-3', '4-1-2-3', '4-1-4-1', '4-5-1', '4-3-2-1'], aliases: { RM: 'RW', LM: 'LW', RAM: 'RW', LAM: 'LW' } },
  { formations: ['4-2-3-1', '4-2-1-3', '4-4-1-1'], aliases: { RM: 'RW', LM: 'LW' } },
  { formations: ['4-4-2', '4-2-2-2'], aliases: { RM: 'RAM', LM: 'LAM' } },
];

function getLineupTransitionSlots(formation) {
  const labels = getFormationSlotLabels(formation);
  return (getTacticsFormationMap()[formation] || []).map((coord, index) => {
    let role = labels[index];
    // 백3의 양쪽 RM/LM은 중앙 미드필더가 아니라 윙백이다.
    if (formation.startsWith('3-')) {
      if (role === 'RM') role = 'RWB';
      if (role === 'LM') role = 'LWB';
    }
    // 3-3-1-3의 중원3은 홀딩 한 명과 양쪽 측면 선수다. UI의 CM 표기를
    // 그대로 중앙 역할로 읽으면 기존 윙어를 중원으로 빼고 윙백을 공격수로 올리게 된다.
    if (formation === '3-3-1-3') {
      if (role === 'RCM') role = 'RWB';
      if (role === 'LCM') role = 'LWB';
    }
    const kind = role === 'GK' ? 'GK'
      : /CB$/.test(role) ? 'CB'
      : /WB$/.test(role) ? 'WB'
      : /^(RB|LB)$/.test(role) ? 'FB'
      : role === 'CDM' || getTacticsLabelMap()[formation]?.[index] === 'DM' ? 'DM'
      : /CM$/.test(role) ? 'CM'
      : /AM$/.test(role) ? 'AM'
      : /^(RM|LM)$/.test(role) ? 'WM'
      : /^(RW|LW)$/.test(role) ? 'W' : 'ST';
    return { role, kind, x: coord.x, y: coord.y };
  });
}

/** 11개 역할이 일대일 대응하는 유사 포메이션은 확정 매핑. 양방향/왕복 모두 같은 선수를 유지한다. */
function getRelatedLineupSlotMapping(fromFormation, toFormation, from, to) {
  const family = LINEUP_FORMATION_FAMILIES.find(group =>
    group.formations.includes(fromFormation) && group.formations.includes(toFormation));
  if (!family) return null;
  const keys = slots => slots.map(slot => family.aliases[slot.role] || slot.role);
  const source = keys(from), target = keys(to);
  if (new Set(source).size !== source.length || new Set(target).size !== target.length) return null;
  const mapping = target.map(key => source.indexOf(key));
  return mapping.every(index => index >= 0) ? mapping : null;
}

// 인접 역할의 전환 비용. 등록되지 않은 먼 역할 전환은 큰 비용을 부여한다.
const LINEUP_ROLE_CHANGE_COSTS = {
  'CB:FB': 30, 'CB:WB': 50, 'CB:DM': 40, 'CB:CM': 80,
  'FB:WB': 10, 'FB:WM': 35, 'FB:W': 65, 'FB:DM': 65, 'FB:CM': 70,
  'WB:WM': 15, 'WB:W': 40, 'WB:CM': 60,
  'DM:CM': 15, 'DM:AM': 45, 'DM:WM': 60,
  'CM:AM': 20, 'CM:WM': 30, 'CM:W': 55, 'CM:ST': 80,
  'AM:WM': 30, 'AM:W': 20, 'AM:ST': 25,
  'WM:W': 10, 'WM:ST': 60, 'W:ST': 30,
};

function lineupFormationMoveCost(from, to) {
  if ((from.kind === 'GK') !== (to.kind === 'GK')) return Infinity;
  const roleCost = from.kind === to.kind ? 0
    : LINEUP_ROLE_CHANGE_COSTS[`${from.kind}:${to.kind}`]
      ?? LINEUP_ROLE_CHANGE_COSTS[`${to.kind}:${from.kind}`] ?? 180;
  const oppositeSide = (from.y - 50) * (to.y - 50) < 0;
  return roleCost * 4 + (oppositeSide ? 120 : 0)
    + ((from.x - to.x) / 39) ** 2 * 80
    + ((from.y - to.y) / 80) ** 2 * 160;
}

/** 각 목적 슬롯에 대응하는 출발 슬롯 인덱스. 11! 탐색 대신 O(n²·2^n) 최적 배정. */
function getLineupFormationSlotMapping(fromFormation, toFormation) {
  const from = getLineupTransitionSlots(fromFormation), to = getLineupTransitionSlots(toFormation);
  if (!from.length || from.length !== to.length || from.length > 11) return null;
  if (fromFormation === toFormation) return from.map((_, index) => index);
  const related = getRelatedLineupSlotMapping(fromFormation, toFormation, from, to);
  if (related) return related;

  const n = from.length, size = 1 << n;
  const costs = from.map(a => to.map(b => lineupFormationMoveCost(a, b)));
  const best = new Float64Array(size).fill(Infinity);
  const chosen = new Int8Array(size).fill(-1);
  const count = new Uint8Array(size);
  best[0] = 0;
  for (let mask = 1; mask < size; mask++) count[mask] = count[mask >> 1] + (mask & 1);
  for (let mask = 0; mask < size - 1; mask++) {
    if (!Number.isFinite(best[mask])) continue;
    const destination = count[mask];
    for (let source = 0; source < n; source++) {
      if (mask & (1 << source)) continue;
      const next = mask | (1 << source);
      const cost = best[mask] + costs[source][destination];
      if (cost < best[next] - 1e-9) {
        best[next] = cost;
        chosen[next] = source;
      }
    }
  }
  if (!Number.isFinite(best[size - 1])) return null;
  const mapping = new Array(n);
  let mask = size - 1;
  for (let destination = n - 1; destination >= 0; destination--) {
    const source = chosen[mask];
    mapping[destination] = source;
    mask ^= 1 << source;
  }
  return mapping;
}

/** ID/객체/빈 슬롯을 그대로 옮긴다. 선수 이름이나 API pos로 사용자의 현재 배치를 덮어쓰지 않는다. */
function remapLineupFormationSlots(fromFormation, toFormation, values) {
  const mapping = getLineupFormationSlotMapping(fromFormation, toFormation);
  if (!mapping || values.length > mapping.length) return values.slice();
  return mapping.map(index => values[index] ?? null);
}
