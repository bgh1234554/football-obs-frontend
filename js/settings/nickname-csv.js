(() => {
  const formats = {
    player: { header: ['선수ID', '선수명', '닉네임'], filename: 'player-nicknames.csv' },
    team: { header: ['팀ID', '팀명', '닉네임'], filename: 'team-nicknames.csv' }
  };

  /** 쉼표·따옴표·줄바꿈이 들어간 셀과 UTF-8 BOM을 처리합니다. 깨진 따옴표는 저장 전에 거부합니다. */
  function parse(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', quoted = false, closed = false;
    const finishCell = () => { row.push(cell); cell = ''; closed = false; };
    const finishRow = () => { finishCell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { quoted = false; closed = true; }
        } else cell += char;
      } else if (char === ',') finishCell();
      else if (char === '\r' || char === '\n') {
        finishRow();
        if (char === '\r' && text[i + 1] === '\n') i++;
      } else if (char === '"' && !cell && !closed) quoted = true;
      else {
        if (closed || char === '"') throw new Error('CSV 따옴표 형식이 올바르지 않습니다.');
        cell += char;
      }
    }
    if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
    finishRow();
    return rows;
  }

  /** 기존 ID가 없는 항목도 원래 이름으로 복원할 수 있게 ID=0으로 기록합니다. */
  function identity(id, name) {
    id = String(id).trim();
    name = String(name).trim();
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
    if (Number(id) === 0) return name ? { key: `n:${name}`, name } : null;
    return { key: String(Number(id)), name };
  }

  function readMap(key) {
    const map = JSON.parse(localStorage.getItem(key) || '{}');
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('저장된 닉네임 형식을 확인해 주세요.');
    return map;
  }

  function exportCsv(kind) {
    const format = formats[kind];
    const map = readMap(kind === 'player' ? PLAYER_NICKNAME_KEY : TEAM_NICKNAME_KEY);
    const rows = [format.header];
    for (const [key, entry] of Object.entries(map)) {
      const nickname = kind === 'player' ? entry : entry?.nickname;
      if (typeof nickname !== 'string' || !nickname.trim()) continue;
      const byName = key.startsWith('n:');
      const player = kind === 'player' && !byName ? pmFindPlayer(Number(key)) : null;
      const name = byName ? key.slice(2) : kind === 'team' ? entry.name || ''
        : player?.nameKoLong || player?.playerNameKoLong || player?.name || player?.playerName || '';
      const id = byName ? '0' : key;
      if (identity(id, name)) rows.push([id, name, nickname]);
    }
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    return { text: '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n', count: rows.length - 1 };
  }

  /** 전체 파일을 검증한 뒤 병합합니다. 빈 닉네임은 기존 값을 삭제하지 않고 제외합니다. */
  function importCsv(kind, text) {
    const rows = parse(text), format = formats[kind];
    if (!rows.length || rows[0].length !== 3 || !rows[0].every((value, i) => value.trim() === format.header[i])) {
      throw new Error(`첫 줄은 ${format.header.join(',')} 형식이어야 합니다.`);
    }
    let skipped = 0;
    const valid = [];
    for (const row of rows.slice(1)) {
      const entry = row.length === 3 ? identity(row[0], row[1]) : null;
      const nickname = row[2]?.trim();
      if (!entry || !nickname || nickname.length > 30) { skipped++; continue; }
      valid.push({ ...entry, nickname });
    }
    if (!valid.length) return { applied: 0, skipped };
    const key = kind === 'player' ? PLAYER_NICKNAME_KEY : TEAM_NICKNAME_KEY;
    const map = readMap(key);
    const promoted = kind === 'player' ? readPromotedNicknames() : null;
    // 이름에서 승격된 닉네임은 함께 갱신하되 CSV의 직접 ID 지정이 항상 우선합니다.
    for (const entry of valid.filter(entry => entry.key.startsWith('n:'))) {
      map[entry.key] = kind === 'player' ? entry.nickname : { name: entry.name, nickname: entry.nickname };
      if (promoted) for (const [id, source] of Object.entries(promoted)) {
        if (source === entry.key) map[id] = entry.nickname;
      }
    }
    for (const entry of valid.filter(entry => !entry.key.startsWith('n:'))) {
      map[entry.key] = kind === 'player' ? entry.nickname
        : { name: entry.name || map[entry.key]?.name || '', nickname: entry.nickname };
      if (promoted) delete promoted[entry.key];
    }
    const before = localStorage.getItem(key);
    try {
      localStorage.setItem(key, JSON.stringify(map));
      if (promoted) localStorage.setItem(PLAYER_NICKNAME_PROMOTED_KEY, JSON.stringify(promoted));
    } catch {
      // 보조 저장소 기록까지 실패하면 원래 닉네임으로 되돌리고 성공 건수를 표시하지 않습니다.
      try { if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before); } catch {}
      throw new Error('닉네임을 저장하지 못했습니다. 저장 공간을 확인해 주세요.');
    }
    if (kind === 'player') pmRefreshAfterNickname();
    else refreshTeamNicknames();
    return { applied: valid.length, skipped };
  }

  document.addEventListener('DOMContentLoaded', () => {
    for (const menu of document.querySelectorAll('[data-nickname-csv]')) {
      const kind = menu.dataset.nicknameCsv, format = formats[kind], input = menu.querySelector('input');
      const result = document.createElement('p');
      result.className = 'sp-nickname-csv-result';
      result.setAttribute('role', 'status');
      result.hidden = true;
      menu.closest('.sp-row').after(result);
      const report = message => { result.textContent = message; result.hidden = false; };
      menu.querySelector('[data-csv-action="export"]').addEventListener('click', () => {
        try {
          const csv = exportCsv(kind);
          const url = URL.createObjectURL(new Blob([csv.text], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a');
          link.href = url; link.download = format.filename;
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          report(`${csv.count}개 닉네임을 내보냈습니다.`);
        } catch (error) { report(error.message || 'CSV를 내보내지 못했습니다.'); }
      });
      menu.querySelector('[data-csv-action="import"]').addEventListener('click', () => {
        input.value = '';
        input.click();
      });
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        input.disabled = true;
        try {
          const { applied, skipped } = importCsv(kind, await file.text());
          report(`불러오기 완료: ${applied}행 적용 · ${skipped}행 제외`);
        } catch (error) { report(error.message || 'CSV를 불러오지 못했습니다.'); }
        finally { input.disabled = false; input.value = ''; }
      });
    }
  });
})();
