// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [선수 ID 연결] playerId=0인 선수 클릭 → ID 입력 팝업
// fetchPlayerStats로 프로필 가져와 이름/사진 덮어쓰기. 폴링 이벤트도 실 ID로 매칭됨.
// lineup-panel.js의 buildEffectiveFixtureData에서 window.applyZeroIdOverrides를 호출해 적용.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PIR_STORE_KEY = 'obs.player.id.resolve.v1';

// ── 저장소 ───────────────────────────────────────────────────────────────────
// 형식: { "{fixtureId}:{side}:{origApiName}": { playerId, name, photoUrl, resolvedAt } }

function pirReadStore() {
  try { return JSON.parse(localStorage.getItem(PIR_STORE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function pirWriteStore(store) {
  try { localStorage.setItem(PIR_STORE_KEY, JSON.stringify(store)); }
  catch {}
}

function pirStoreKey(fixtureId, side, origName) {
  return `${fixtureId}:${side}:${origName}`;
}

function pirGetOverride(fixtureId, side, origName) {
  return pirReadStore()[pirStoreKey(fixtureId, side, origName)] || null;
}

function pirSetOverride(fixtureId, side, origName, override) {
  const store = pirReadStore();
  const k = pirStoreKey(fixtureId, side, origName);
  if (override) store[k] = override;
  else delete store[k];
  pirWriteStore(store);
}

// ── override 적용 ─────────────────────────────────────────────────────────────
// lineup-panel.js의 buildEffectiveFixtureData에서 window hook으로 호출.
// 복제된 next 객체를 직접 변경(in-place) — 반환값 없음.

function applyZeroIdOverrides(next, fixtureId) {
  if (!next || !fixtureId) return;

  const store = pirReadStore();
  const prefix = `${fixtureId}:`;
  const relevant = {};
  for (const k of Object.keys(store)) {
    if (k.startsWith(prefix)) relevant[k.slice(prefix.length)] = store[k];
  }
  if (!Object.keys(relevant).length) return;

  const applyToList = (list, side) => {
    if (!Array.isArray(list)) return list;
    return list.map(p => {
      if (!p) return p;
      const origName = String(p.name || '').trim();
      const ov = relevant[`${side}:${origName}`];
      if (!ov) return p;
      return {
        ...p,
        playerId: ov.playerId,
        ...(ov.name ? { name: ov.name } : {}),
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
}

window.applyZeroIdOverrides = applyZeroIdOverrides;
window.pirGetOverride = pirGetOverride;
window.pirSetOverride = pirSetOverride;

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

// ── fixture에서 원본 선수 조회 ─────────────────────────────────────────────────

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

// ── 팝업 표시 ─────────────────────────────────────────────────────────────────

function pirShowMenu(side, origName, clientX, clientY) {
  const c = pirGetContainer();
  const player = pirFindPlayer(side, origName);
  const fixtureId = pirGetCurrentFixtureId();
  const existing = fixtureId ? pirGetOverride(fixtureId, side, origName) : null;

  const num = String(player?.number ?? '');
  const displayName = (typeof pickName === 'function' && player)
    ? (pickName(player, 'roster') || origName || '-')
    : (origName || '-');
  const currentApiId = player ? Number(player.playerId) : 0;
  const idStatusHtml = currentApiId
    ? `<div class="pm-pos" style="color:#8af;font-size:11px">현재 API ID: ${pirEsc(String(currentApiId))}</div>`
    : `<div class="pm-pos" style="color:#f88;font-size:11px">선수 ID 없음 (클릭해서 연결)</div>`;

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
        value="${existing ? pirEsc(String(existing.playerId)) : (currentApiId ? pirEsc(String(currentApiId)) : '')}"
        style="flex:1;min-width:0"/>
      <button class="pm-btn pm-btn-primary" id="pirFetch" style="white-space:nowrap;padding:4px 10px">검색</button>
    </div>
    <div id="pirPreview" style="margin-top:8px;min-height:22px;font-size:11.5px;color:#aaa">
      ${existing
        ? `연결됨${existing.name ? ' - ' + pirEsc(existing.name) : ''} · 새 ID 입력 시 덮어쓰기`
        : currentApiId
          ? '다른 ID로 연결하려면 새 ID를 입력하고 검색하세요'
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
    if (!pid || pid <= 0 || !fixtureId) return;
    const p = _fetched?.player;
    pirSetOverride(fixtureId, side, origName, {
      playerId: pid,
      name: p?.fullName || p?.name || null,
      photoUrl: p?.photoUrl || null,
      resolvedAt: Date.now(),
    });
    pirHideAll();
    if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
  });

  const clearBtn = document.getElementById('pirClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!fixtureId) return;
      pirSetOverride(fixtureId, side, origName, null);
      pirHideAll();
      if (typeof rerenderLineupPanels === 'function') rerenderLineupPanels();
    });
  }

  input.focus();
  input.select();
}

// ── 클릭 이벤트 핸들러 ─────────────────────────────────────────────────────────

function pirInit() {
  // bubble phase — pmInit의 capture phase가 pid=0일 때 이미 return하므로 충돌 없음.
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

// ── 외부 진입점 (player-menu.js에서 호출) ──────────────────────────────────────
// pmShowMenu의 "ID 입력" 버튼 → 이 함수 → pirShowMenu 재사용.
function pirShowMenuForPlayer(side, origApiName, clientX, clientY) {
  pirShowMenu(side, String(origApiName || '').trim(), clientX, clientY);
}
window.pirShowMenuForPlayer = pirShowMenuForPlayer;

document.addEventListener('DOMContentLoaded', pirInit);
