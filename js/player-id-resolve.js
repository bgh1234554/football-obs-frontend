// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 ID 연결] 클릭 → ID 입력 팝업
// fetchPlayerStats로 프로필 가져와 이름/사진 덮어쓰기. 폴링 이벤트도 실 ID로 매칭됨.
// lineup-panel.js의 buildEffectiveFixtureData에서 window.applyZeroIdOverrides를 호출해 적용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PIR_STORE_KEY = 'obs.player.id.resolve.v2';

// ── 저장소 ───────────────────────────────────────────────────────────────────
// 키 형식:
//   id≠0 선수: "{fixtureId}:{side}:id:{originalPlayerId}"  — 이름 패치에 무관하게 안정적
//   id=0  선수: "{fixtureId}:{side}:n:{origApiName}"       — id가 없으므로 이름이 유일 식별자
// 값: { playerId, name, photoUrl, resolvedAt }

function pirReadStore() {
  try { return JSON.parse(localStorage.getItem(PIR_STORE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function pirWriteStore(store) {
  try { localStorage.setItem(PIR_STORE_KEY, JSON.stringify(store)); }
  catch {}
}

function pirMakeIdKey(fixtureId, side, playerId) {
  return `${fixtureId}:${side}:id:${playerId}`;
}
function pirMakeNameKey(fixtureId, side, name) {
  return `${fixtureId}:${side}:n:${name}`;
}

function pirGetByKey(key) {
  return key ? (pirReadStore()[key] || null) : null;
}
function pirSetByKey(key, data) {
  if (!key) return;
  const store = pirReadStore();
  if (data) store[key] = data;
  else delete store[key];
  pirWriteStore(store);
}

// 같은 fixtureId 내에서 newPid가 이미 다른 entry의 value.playerId로 쓰이는지 확인.
// currentKey는 자기 자신 (수정 중인 entry) → 비교에서 제외.
function pirIsDuplicateAltId(fixtureId, currentKey, newPid) {
  if (!fixtureId || !newPid) return false;
  const store = pirReadStore();
  const prefix = `${fixtureId}:`;
  for (const [k, v] of Object.entries(store)) {
    if (!k.startsWith(prefix)) continue;
    if (k === currentKey) continue;
    if (Number(v.playerId) === Number(newPid)) return true;
  }
  return false;
}
window.pirIsDuplicateAltId = pirIsDuplicateAltId;

// override 적용 후 effective playerId로 원본 id 키를 역탐색.
// 같은 선수를 두 번 수정할 때 사용 (effective pid → 원본 키).
function pirFindOriginalIdKey(fixtureId, side, effectivePid) {
  const store = pirReadStore();
  const prefix = `${fixtureId}:${side}:id:`;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix) && Number(v.playerId) === Number(effectivePid)) return k;
  }
  return null;
}

// id=0 선수를 연결한 경우(이름 키), value.playerId === effectivePid 인 n: 키를 역탐색.
// pmShowIdInput에서 연결 해제 버튼 렌더 및 clear 키로 사용.
function pirFindNameKeyByEffectiveId(fixtureId, side, effectivePid) {
  if (!fixtureId || !effectivePid) return null;
  const store = pirReadStore();
  const prefix = `${fixtureId}:${side}:n:`;
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix) && Number(v?.playerId) === Number(effectivePid)) return k;
  }
  return null;
}
window.pirFindNameKeyByEffectiveId = pirFindNameKeyByEffectiveId;

// ── override 적용 ─────────────────────────────────────────────────────────────
// lineup-panel.js의 buildEffectiveFixtureData에서 window hook으로 호출.
// 복제된 next 객체를 직접 변경(in-place) — 반환값 없음.

function applyZeroIdOverrides(next, fixtureId) {
  if (!next || !fixtureId) return;

  const store = pirReadStore();
  const prefix = `${fixtureId}:`;
  const relevant = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix)) relevant[k.slice(prefix.length)] = v;
  }
  if (!Object.keys(relevant).length) return;

  // altId → canonicalId 역방향 맵 구성 (id≠0 선수의 event/stats 리매핑용)
  // 예: key "home:id:29809" + value.playerId=533035 → altToCanonical["home:533035"] = 29809
  const altToCanonical = {};
  for (const [localKey, ov] of Object.entries(relevant)) {
    if (!localKey.includes(':id:')) continue;
    const parts = localKey.split(':');          // [side, 'id', canonicalId]
    const side = parts[0];
    const canonicalId = Number(parts[2]);
    const altId = Number(ov.playerId);
    if (altId && altId !== canonicalId) {
      altToCanonical[`${side}:${altId}`] = canonicalId;
    }
  }

  // ── 라인업/부상자: id=0→playerId 교체+이름/사진, id≠0→이름/사진만 ────────────
  const applyToList = (list, side) => {
    if (!Array.isArray(list)) return list;
    return list.map(p => {
      if (!p) return p;
      const pid = Number(p.playerId);
      const isZero = pid === 0;
      const ov = isZero
        ? relevant[`${side}:n:${String(p.name || '').trim()}`]
        : relevant[`${side}:id:${pid}`];
      if (!ov) return p;
      return {
        ...p,
        ...(isZero ? { playerId: ov.playerId } : {}),
        ...(ov.name ? { name: ov.name } : {}),
        ...(ov.nameKoLong ? { nameKoLong: ov.nameKoLong } : {}),
        ...(ov.photoUrl ? { photoUrl: ov.photoUrl } : {}),
      };
    });
  };

  for (const side of ['home', 'away']) {
    const lk = `${side}Lineup`;
    if (next[lk]) {
      next[lk] = {
        ...next[lk],
        startXi: applyToList(next[lk].startXi, side),
        substitutes: applyToList(next[lk].substitutes, side),
      };
    }
    const ik = `${side}Injuries`;
    if (next[ik]) next[ik] = applyToList(next[ik], side);
  }

  // ── 이벤트: altId → canonicalId 리매핑 (교체/카드/골이 라인업 노드에 귀속) ──
  if (Array.isArray(next.events) && Object.keys(altToCanonical).length) {
    next.events = next.events.map(ev => {
      if (!ev) return ev;
      const side = ev.side || '';
      const newPlayerId = altToCanonical[`${side}:${ev.playerId}`];
      const newAssistId = ev.assistId != null ? altToCanonical[`${side}:${ev.assistId}`] : undefined;
      if (!newPlayerId && newAssistId === undefined) return ev;
      return {
        ...ev,
        ...(newPlayerId ? { playerId: newPlayerId } : {}),
        ...(newAssistId !== undefined ? { assistId: newAssistId } : {}),
      };
    });
  }

  // ── playerStats: id=0→실ID 교체 / altId→canonicalId 귀속 ────────────────────
  if (Array.isArray(next.playerStats)) {
    next.playerStats = next.playerStats.map(p => {
      if (!p) return p;
      const pid = Number(p.playerId);
      if (pid === 0) {
        const name = String(p.name || p.playerName || '').trim();
        const ov = relevant[`home:n:${name}`] || relevant[`away:n:${name}`];
        if (!ov) return p;
        return { ...p, playerId: ov.playerId, ...(ov.name ? { name: ov.name, playerName: ov.name } : {}) };
      }
      // altId가 canonicalId로 매핑된 경우 (stats가 altId 아래 있을 때)
      const canonical = altToCanonical[`home:${pid}`] || altToCanonical[`away:${pid}`];
      if (!canonical) return p;
      return { ...p, playerId: canonical };
    });
  }
}

window.applyZeroIdOverrides = applyZeroIdOverrides;
window.pirGetByKey = pirGetByKey;
window.pirSetByKey = pirSetByKey;
window.pirMakeIdKey = pirMakeIdKey;
window.pirMakeNameKey = pirMakeNameKey;
window.pirFindOriginalIdKey = pirFindOriginalIdKey;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function pirEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pirGetCurrentFixtureId() {
  try {
    return String(
      (typeof lineupPanelState !== 'undefined'
        ? lineupPanelState.lastFixture?.matchInfo?.fixtureId
        : null) ?? ''
    ).trim();
  } catch { return ''; }
}

// ── side 감지 ─────────────────────────────────────────────────────────────────

function pirGetSide(el) {
  if (!el) return null;
  if (el.classList.contains('is-home')) return 'home';
  if (el.classList.contains('is-away')) return 'away';
  const bench = el.closest('[data-bench-side]');
  if (bench) return bench.dataset.benchSide || null;
  const inj = el.closest('[data-injury-side]');
  if (inj) return inj.dataset.injurySide || null;
  const wrap = el.closest('.dp-lineup-name-wrap');
  if (wrap) return wrap.classList.contains('is-home') ? 'home' : wrap.classList.contains('is-away') ? 'away' : null;
  return null;
}

// ── raw fixture에서 선수 조회 (id=0 팝업 전용) ────────────────────────────────

function pirFindPlayer(side, origName) {
  const data = (typeof lineupPanelState !== 'undefined') ? lineupPanelState.lastFixture : null;
  if (!data) return null;
  const lineup = data[`${side}Lineup`];
  const all = [...(lineup?.startXi || []), ...(lineup?.substitutes || [])];
  const fromLineup = all.find(p => p && String(p.name || '').trim() === origName);
  if (fromLineup) return fromLineup;
  const injuries = data[`${side}Injuries`] || [];
  return injuries.find(p => p && String(p.name || '').trim() === origName) || null;
}

// ── pmContainer 참조 (player-menu.js와 공유) ──────────────────────────────────

function pirGetContainer() {
  if (typeof pmContainer === 'function') return pmContainer();
  let c = document.getElementById('pmContainer');
  if (!c) { c = document.createElement('div'); c.id = 'pmContainer'; document.body.appendChild(c); }
  return c;
}

function pirHideAll() {
  pirGetContainer().innerHTML = '';
}

// ── 팝업 표시 (id=0 선수 전용) ───────────────────────────────────────────────
// id≠0 선수의 ID 수정은 player-menu.js의 pmShowIdInput이 담당.

function pirShowMenu(side, origName, clientX, clientY) {
  const c = pirGetContainer();
  const player = pirFindPlayer(side, origName);
  const fixtureId = pirGetCurrentFixtureId();
  // id=0 선수는 name 키 사용
  const storeKey = fixtureId ? pirMakeNameKey(fixtureId, side, origName) : null;
  const existing = pirGetByKey(storeKey);

  const num = String(player?.number ?? '');
  const displayName = (typeof pickName === 'function' && player)
    ? (pickName(player, 'roster') || origName || '-')
    : (origName || '-');
  const idStatusHtml = `<div class="pm-pos" style="color:#f88;font-size:11px">선수 ID 없음 (클릭해서 연결)</div>`;

  c.innerHTML = `
<div class="pm-popup" id="pirPopup" role="dialog">
  <button class="pm-close" id="pirClose">&#10005;</button>
  <div class="pm-info">
    <div class="pm-avatar pm-avatar-empty" style="opacity:.35"></div>
    <div class="pm-info-text">
      <div class="pm-name"><span class="pm-num">${pirEsc(num)}</span>${pirEsc(displayName)}</div>
      ${idStatusHtml}
      ${existing ? `<div class="pm-nick-badge" style="color:#8cf">연결됨: ID ${pirEsc(String(existing.playerId))}</div>` : ''}
    </div>
  </div>
  <div class="pm-nick-wrap">
    <div class="pm-nick-title">선수 ID 입력 후 검색</div>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="pm-nick-input" id="pirIdInput" type="number" min="1"
        placeholder="예) 154660"
        value="${existing ? pirEsc(String(existing.playerId)) : ''}"
        style="flex:1;min-width:0"/>
      <button class="pm-btn pm-btn-primary" id="pirFetch" style="white-space:nowrap;padding:4px 10px">검색</button>
    </div>
    <div id="pirPreview" style="margin-top:8px;min-height:22px;font-size:11.5px;color:#aaa">
      ${existing
        ? `연결됨${existing.name ? ' - ' + pirEsc(existing.name) : ''} · 새 ID 입력 시 덮어쓰기`
        : '선수 ID를 입력하고 검색하세요'}
    </div>
    <div class="pm-nick-btns">
      <button class="pm-btn pm-btn-primary" id="pirSave">저장</button>
      ${existing ? '<button class="pm-btn pm-btn-danger" id="pirClear">연결 해제</button>' : ''}
      <button class="pm-btn" id="pirCancel">취소</button>
    </div>
  </div>
</div>`;

  if (typeof pmPositionPopup === 'function') {
    pmPositionPopup(document.getElementById('pirPopup'), clientX, clientY);
  }

  let _fetched = null;
  const input = document.getElementById('pirIdInput');
  const preview = document.getElementById('pirPreview');

  async function doFetch() {
    const pid = parseInt(input.value, 10);
    if (!pid || pid <= 0) {
      preview.innerHTML = '<span style="color:#f88">유효한 ID를 입력하세요</span>';
      return;
    }
    preview.innerHTML = '<span style="color:#aaa">로딩 중...</span>';
    const fetchBtn = document.getElementById('pirFetch');
    if (fetchBtn) fetchBtn.disabled = true;
    try {
      const data = await (typeof fetchPlayerStats === 'function'
        ? fetchPlayerStats(pid)
        : Promise.reject(new Error('fetchPlayerStats 없음')));
      _fetched = data;
      const p = data?.player;
      if (p) {
        const pname = p.fullName || p.name || '';
        const photoHtml = p.photoUrl
          ? `<img src="${pirEsc(p.photoUrl)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:5px">`
          : '';
        const nat = p.nationality ? ` · ${pirEsc(p.nationality)}` : '';
        const age = p.age ? ` · ${p.age}세` : '';
        preview.innerHTML = `${photoHtml}<span style="color:#fff">${pirEsc(pname)}</span><span style="color:#888">${nat}${age}</span>`;
      } else {
        preview.innerHTML = '<span style="color:#f88">선수 정보를 찾을 수 없습니다</span>';
        _fetched = null;
      }
    } catch (err) {
      preview.innerHTML = `<span style="color:#f88">로딩 실패: ${pirEsc(String(err?.message || ''))}</span>`;
      _fetched = null;
    } finally {
      const fb = document.getElementById('pirFetch');
      if (fb) fb.disabled = false;
    }
  }

  document.getElementById('pirFetch').addEventListener('click', doFetch);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doFetch(); }
    if (e.key === 'Escape') { e.stopPropagation(); pirHideAll(); }
  });

  document.getElementById('pirClose').addEventListener('click', pirHideAll);
  document.getElementById('pirCancel').addEventListener('click', pirHideAll);

  document.getElementById('pirSave').addEventListener('click', () => {
    const pid = parseInt(input.value, 10);
    if (!pid || pid <= 0 || !storeKey) return;
    if (pirIsDuplicateAltId(fixtureId, storeKey, pid)) {
      preview.innerHTML = '<span style="color:#f88">이미 다른 선수에 연결된 ID입니다</span>';
      return;
    }
    const p = _fetched?.player;
    pirSetByKey(storeKey, {
      playerId: pid,
      name: p?.name || null,           // 단축명 (한글 단축 우선, 없으면 API 영문 단축)
      nameKoLong: p?.fullName || null, // 풀네임 (한글 풀네임 우선, 없으면 API 영문 풀네임)
      photoUrl: p?.photoUrl || null,
      resolvedAt: Date.now(),
    });
    pirHideAll();
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });

  const clearBtn = document.getElementById('pirClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      pirSetByKey(storeKey, null);
      pirHideAll();
      if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
    });
  }

  input.focus();
  input.select();
}

// ── 클릭 이벤트 핸들러 ─────────────────────────────────────────────────────────

function pirInit() {
  document.addEventListener('click', e => {
    const c = document.getElementById('pmContainer');
    if (c && c.contains(e.target)) return;

    const dpEl = e.target.closest(
      '.dp-item[data-player-id="0"], .dp-lineup-node[data-player-id="0"], .dp-lineup-name-wrap[data-player-id="0"]'
    );
    if (!dpEl) return;

    const origName = dpEl.dataset.playerOrigName || '';
    const side = pirGetSide(dpEl);
    if (!side) return;

    pirShowMenu(side, origName, e.clientX, e.clientY);
  });
}

// pirShowMenuForPlayer — id≠0 선수용. pmShowIdInput을 직접 호출하도록 player-menu.js에서 처리.
// 하위 호환을 위해 남겨두되 id=0 전용 pirShowMenu로 리다이렉트하지 않음.
window.pirShowMenuForPlayer = function(side, origApiName, clientX, clientY) {
  pirShowMenu(side, String(origApiName || '').trim(), clientX, clientY);
};

// ── 구버전 항목 자동 마이그레이션 ────────────────────────────────────────────
// name 필드만 있고 nameKoLong 프로퍼티가 없는 항목은 구버전 코드로 저장된 것.
// (구버전: name = fullName || name → 한글 풀네임이 name에 저장됨)
// name 필드를 제거해 백엔드가 내려주는 올바른 단축명이 그대로 사용되도록 함.
// playerId/photoUrl은 유지해 ID 연결과 사진 선택 결과는 보존.
function pirMigrateOldEntries() {
  const store = pirReadStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (!entry || typeof entry !== 'object') continue;
    const hasNameKoLong = Object.prototype.hasOwnProperty.call(entry, 'nameKoLong');
    if (entry.name && !hasNameKoLong) {
      const { name: _removed, ...rest } = entry;
      store[key] = rest;
      changed = true;
    }
  }
  if (changed) pirWriteStore(store);
}

document.addEventListener('DOMContentLoaded', () => {
  pirMigrateOldEntries();
  pirInit();
});
