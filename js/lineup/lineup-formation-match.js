// 포메이션 변경은 API grid 번호가 아니라 현재 슬롯의 역할/좌우/좌표를 기준으로 한다.
// 전술적 관계와 대응 규칙의 근거: docs/formation-transitions.md
const LINEUP_FORMATION_FAMILIES = [
  { formations: ['4-3-1-2', '4-1-2-1-2', '4-1-3-2'], aliases: { RW: 'RCM', LW: 'LCM' } },
  { formations: ['3-5-2', '3-1-4-2', '5-3-2'], aliases: {} },
  { formations: ['3-4-3', '3-4-2-1', '5-2-3', '5-4-1'], aliases: { RAM: 'RW', LAM: 'LW', RM: 'RW', LM: 'LW' } },
  { formations: ['4-3-3', '4-1-2-3', '4-1-4-1', '4-5-1', '4-3-2-1'], aliases: { RM: 'RW', LM: 'LW', RAM: 'RW', LAM: 'LW' } },
  { formations: ['4-2-3-1', '4-2-1-3', '4-4-1-1'], aliases: { RM: 'RW', LM: 'LW' } },
  { formations: ['4-4-2', '4-2-2-2'], aliases: { RM: 'RAM', LM: 'LAM' } },
  // 원톱+CAM ↔ 투톱: 기존 ST는 왼쪽 ST, CAM은 오른쪽 ST.
  // 측면 RM/RW와 LM/LW는 4-2-2-2의 RAM/LAM으로 좁혀 배치한다.
  { formations: ['4-2-3-1', '4-2-1-3', '4-4-1-1', '4-4-2', '4-2-2-2'],
    aliases: { RM: 'RAM', RW: 'RAM', LM: 'LAM', LW: 'LAM', CAM: 'RS', ST: 'LS' } },
];

// 목적 슬롯 → 출발 슬롯. 검증한 한 단계의 선수 이동만 여기에 등록한다.
// 유사군의 동일 역할 이동과 연결하면 다른 포메이션에도 같은 선수 흐름을 적용할 수 있다.
const LINEUP_FORMATION_MOVES = [
  { from: '4-3-3', to: '3-4-3', slots: [0, 2, 6, 3, 1, 5, 7, 4, 8, 9, 10] },
  { from: '4-1-2-3', to: '3-4-3', slots: [0, 2, 5, 3, 1, 6, 7, 4, 8, 9, 10] },
  { from: '4-2-1-3', to: '3-3-1-3', slots: [0, 2, 5, 3, 1, 6, 4, 7, 8, 9, 10] },
  { from: '3-4-3', to: '3-3-1-3', slots: [0, 1, 2, 3, 4, 6, 7, 5, 8, 9, 10] },
  { from: '3-5-2', to: '3-4-1-2', slots: [0, 1, 2, 3, 4, 5, 6, 8, 7, 9, 10] },
  { from: '3-5-2', to: '3-5-1-1', slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { from: '3-4-1-2', to: '3-4-2-1', slots: [0, 1, 2, 3, 4, 5, 6, 7, 9, 8, 10] },
  // 오른쪽 CM을 CAM으로 올려, 이후 오른쪽 공격수로 전환해도 좌우를 유지한다.
  { from: '4-3-3', to: '4-2-3-1', slots: [0, 1, 2, 3, 4, 6, 7, 8, 5, 10, 9] },
  // 홀딩 미드필더는 백3 중앙으로 내려가고, 양쪽 풀백은 윙백으로 올라간다.
  { from: '4-3-1-2', to: '3-4-1-2', slots: [0, 2, 6, 3, 1, 5, 7, 4, 8, 9, 10] },
  { from: '4-3-2-1', to: '3-4-2-1', slots: [0, 2, 6, 3, 1, 5, 7, 4, 8, 9, 10] },
  // 오른쪽 CM은 CAM으로 전진하고, DM이 그 자리를 채워 좌우가 뒤바뀌지 않게 한다.
  { from: '4-5-1', to: '4-4-1-1', slots: [0, 1, 2, 3, 4, 5, 7, 8, 9, 6, 10] },
  // 풀백은 전진하고 측면 공격수는 안쪽으로 이동하며, 피벗 한 명은 백3으로 내려간다.
  { from: '4-2-3-1', to: '3-5-2', slots: [0, 2, 5, 3, 1, 7, 6, 9, 4, 8, 10] },
  // 중앙 공격수는 CAM으로 내려가고, 양쪽 윙어는 투톱으로 좁혀 들어온다.
  { from: '4-3-3', to: '4-3-1-2', slots: [0, 1, 2, 3, 4, 5, 6, 7, 9, 8, 10] },
  // 측면 미드필더 한 명은 전진하고, 반대쪽 윙은 가까운 공격수가 맡는다.
  // 오른쪽 공격수는 중앙에 남고 왼쪽 공격수는 측면으로 이동하며, CAM은 중원으로 내려간다.
  { from: '4-1-3-2', to: '4-3-3', slots: [0, 1, 2, 3, 4, 7, 5, 8, 6, 9, 10] },
  // 투톱을 공유하는 포메이션은 공격수를 유지하고 중원의 형태만 바꾼다.
  { from: '4-4-2', to: '4-3-1-2', slots: [0, 1, 2, 3, 4, 5, 6, 8, 7, 9, 10] },
  { from: '4-4-2', to: '4-1-3-2', slots: [0, 1, 2, 3, 4, 6, 5, 7, 8, 9, 10] },
  // 중앙 미드필더 한 명은 백3으로 내려가며, 투톱은 기존 좌우를 유지한다.
  { from: '4-4-2', to: '3-5-2', slots: [0, 2, 6, 3, 1, 5, 7, 8, 4, 9, 10] },
  // 공격수 한 명이 CAM으로 내려오고 기존 CAM은 피벗에 합류한다.
  { from: '4-1-3-2', to: '4-2-3-1', slots: [0, 1, 2, 3, 4, 5, 7, 6, 9, 8, 10] },
  // 오른쪽 CM은 기존 공격수와 투톱을 이루고, 양쪽 윙어는 측면 미드필더로 내려온다.
  { from: '4-3-3', to: '4-4-2', slots: [0, 1, 2, 3, 4, 8, 6, 7, 10, 5, 9] },
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

let lineupFormationTransitionGraph = null;

/** 전술적으로 확인한 양방향 이동과 유사군을 연결한다. */
function getLineupFormationTransitionGraph() {
  if (lineupFormationTransitionGraph) return lineupFormationTransitionGraph;
  const graph = new Map();
  const add = (from, to, slots) => {
    const fromSlots = getLineupTransitionSlots(from);
    const toSlots = getLineupTransitionSlots(to);
    if (fromSlots.length !== 11 || toSlots.length !== 11
      || slots.length !== 11 || new Set(slots).size !== 11
      || slots.some(index => index < 0 || index >= 11)) return;
    const reverse = new Array(11);
    slots.forEach((source, destination) => { reverse[source] = destination; });
    const cost = slots.reduce((sum, source, destination) =>
      sum + lineupFormationMoveCost(fromSlots[source], toSlots[destination]), 0);
    if (!graph.has(from)) graph.set(from, []);
    if (!graph.has(to)) graph.set(to, []);
    graph.get(from).push({ to, slots, cost });
    graph.get(to).push({ to: from, slots: reverse, cost });
  };
  for (const family of LINEUP_FORMATION_FAMILIES) {
    family.formations.forEach((from, index) => {
      family.formations.slice(index + 1).forEach(to => {
        const slots = getRelatedLineupSlotMapping(
          from, to, getLineupTransitionSlots(from), getLineupTransitionSlots(to));
        if (slots) add(from, to, slots);
      });
    });
  }
  LINEUP_FORMATION_MOVES.forEach(({ from, to, slots }) => add(from, to, slots));
  lineupFormationTransitionGraph = graph;
  return graph;
}

/** 확인된 이동만 합성한다. 같은 길이의 경로는 최종 역할/좌우 보존과 이동 비용을 비교한다. */
function getLineupFormationTransitionPath(fromFormation, toFormation) {
  const graph = getLineupFormationTransitionGraph();
  const from = getLineupTransitionSlots(fromFormation), to = getLineupTransitionSlots(toFormation);
  const sharedDefenders = new Set(from.filter(slot => /^(GK|RB|LB|RCB|CB|LCB|RWB|LWB)$/.test(slot.role)
    && to.some(target => target.role === slot.role)).map(slot => slot.role));
  const sameStrikerCount = from.filter(slot => slot.kind === 'ST').length
    === to.filter(slot => slot.kind === 'ST').length;
  const compare = (a, b) => {
    for (let index = 0; index < a.length; index++) {
      if (Math.abs(a[index] - b[index]) > 1e-9) return a[index] - b[index];
    }
    return 0;
  };
  let best = null;
  const visit = (formation, path, slots, cost) => {
    if (formation === toFormation && path.length > 1) {
      // 역방향에서도 같은 경로를 고르도록 양방향 공통 서명을 쓴다.
      const forward = path.join('>'), backward = path.slice().reverse().join('>');
      const signature = forward < backward ? forward : backward;
      const preservationLoss = slots.reduce((sum, source, destination) => sum
        + (sharedDefenders.has(to[destination].role) && from[source].role !== to[destination].role ? 1 : 0)
        + (sameStrikerCount && to[destination].kind === 'ST' && from[source].kind !== 'ST' ? 1 : 0), 0);
      const sideCrossings = slots.filter((source, destination) =>
        (from[source].y - 50) * (to[destination].y - 50) < 0).length;
      const endpointCost = slots.reduce((sum, source, destination) =>
        sum + lineupFormationMoveCost(from[source], to[destination]), 0);
      // 같은 단계 수에서는 최종 배치의 수비/공격수 보존, 좌우, 이동 비용 순으로 비교한다.
      // 경유 단계의 비용만 합산하면 최종적으로 더 먼 자리나 반대쪽을 선택할 수 있다.
      const rank = [path.length, preservationLoss, sideCrossings, endpointCost, cost];
      const candidate = { path, slots, cost, endpointCost, signature, rank };
      const order = best ? compare(rank, best.rank) : -1;
      if (order < 0 || (order === 0 && signature < best.signature)) best = candidate;
      return;
    }
    if (path.length >= 5 || (best && path.length >= best.path.length)) return;
    for (const edge of graph.get(formation) || []) {
      if (path.includes(edge.to)) continue;
      visit(edge.to, [...path, edge.to], edge.slots.map(index => slots[index]), cost + edge.cost);
    }
  };
  visit(fromFormation, [fromFormation], Array.from({ length: 11 }, (_, index) => index), 0);
  return best;
}

/** 각 목적 슬롯에 대응하는 출발 슬롯 인덱스. 11! 탐색 대신 O(n²·2^n) 최적 배정. */
function getLineupFormationSlotMapping(fromFormation, toFormation) {
  const from = getLineupTransitionSlots(fromFormation), to = getLineupTransitionSlots(toFormation);
  if (!from.length || from.length !== to.length || from.length > 11) return null;
  if (fromFormation === toFormation) return from.map((_, index) => index);
  const related = getRelatedLineupSlotMapping(fromFormation, toFormation, from, to);
  if (related) return related;
  const transition = getLineupFormationTransitionPath(fromFormation, toFormation);
  if (transition) return transition.slots;

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
