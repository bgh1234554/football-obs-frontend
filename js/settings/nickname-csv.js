/**
 * 선수와 팀 닉네임을 공통 3열 CSV 형식으로 내보내고 기존 저장값에 병합한다.
 *
 * 선수 닉네임은 문자열, 팀 닉네임은 원래 이름을 포함한 객체로 저장되므로 파일 입출력
 * 단계에서 이 차이를 변환한다. ID가 없는 항목은 이름 기반 키를 유지하고, 파일 전체를
 * 검증하기 전에는 저장소를 변경하지 않는다. 인용 형식이나 헤더에 구조 오류가 있는
 * 파일은 저장하지 않으며, ID나 닉네임 조건에 맞지 않는 데이터 행은 제외 건수로 돌려준다.
 */
(() => {
  const formats = {
    player: { header: ['선수ID', '선수명', '닉네임'], filename: 'player-nicknames.csv' },
    team: { header: ['팀ID', '팀명', '닉네임'], filename: 'team-nicknames.csv' }
  };

  /**
   * CSV의 인용 상태를 추적해 셀 안의 쉼표, 줄바꿈, 이중 따옴표와 UTF-8 BOM을 처리한다.
   * 따옴표를 닫은 뒤 다른 문자가 붙거나 마지막 인용이 닫히지 않으면 오류로 처리한다.
   * 단순 split(',')로 나눌 수 없는 이름과 닉네임도 원래 셀 내용으로 돌려준다.
   * @param {string} text CSV 파일 전체 내용.
   * @returns {string[][]} 내용이 있는 행의 셀 배열. 헤더 검증은 importCsv()가 담당한다.
   */
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

  /** 저장소 값이 닉네임 맵 형태인지 확인한다. 손상된 JSON이나 배열을 빈 맵으로 덮어쓰지 않고 실패시킨다. */
  function readMap(key) {
    const map = JSON.parse(localStorage.getItem(key) || '{}');
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('저장된 닉네임 형식을 확인해 주세요.');
    return map;
  }

  /**
   * 현재 닉네임 맵을 ID, 원래 이름, 닉네임의 3열 CSV 문자열로 만든다.
   * 이름 기반 항목은 ID 0으로 기록하며, 모든 셀을 인용하고 BOM과 CRLF를 포함해 내보낸다.
   * 실제 파일 다운로드와 임시 Blob URL 해제는 버튼 이벤트가 담당한다.
   * @param {'player'|'team'} kind 내보낼 닉네임 종류.
   * @returns {{text: string, count: number}} 파일 내용과 헤더를 제외한 데이터 행 수.
   */
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

  /**
   * 헤더와 모든 데이터 행을 검증한 뒤 기존 닉네임 맵에 병합해 저장한다.
   * 빈 닉네임은 기존 값을 지우는 지시로 보지 않고 제외한다. 이름에서 ID로 연결된 선수는
   * 이름 기반 변경을 관련 ID에도 반영하되 파일에 명시한 ID 행을 마지막에 적용해 우선한다.
   * 보조 연결 맵까지 저장하지 못하면 주 닉네임 저장값을 복원하고 오류를 전달한다.
   * @param {'player'|'team'} kind 가져올 닉네임 종류.
   * @param {string} text CSV 파일 전체 내용.
   * @returns {{applied: number, skipped: number}} 검증과 저장에 성공한 적용/제외 행 수.
   */
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
