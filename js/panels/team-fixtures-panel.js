// 양 캠의 최근·예정 경기: 팀별 요청을 공유하고 경기 전환 후 늦은 응답은 버린다.
(() => {
  const inFlight = new Map();
  let fixture = null;
  let page = 0;
  let bigPage = 0;
  // 초기화 이전에 시작한 요청이 새 경기의 결과를 덮어쓰지 않도록 세대를 구분합니다.
  let sequence = 0;
  let dataRows = {};
  let pending = {};
  const periods = ['last', 'next'];
  const titles = ['최근 5경기', '다음 5경기'];
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  /**
   * 진행 중인 팀·기간별 요청만 공유해 두 캠의 동시 중복 요청을 막습니다.
   * 요청이 끝나면 제거해 다음 조회에서는 새 응답을 받습니다.
   * @param {number|string} teamId 조회할 팀 ID입니다.
   * @param {'last'|'next'} period 최근 경기 또는 예정 경기입니다.
   * @returns {Promise<Object>} 팀의 경기 목록 응답입니다.
   */
  function load(teamId, period) {
    const key = `${teamId}:${period}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = fetchTeamFixtures(teamId, period).finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  /** 'teamName' 설정(풀네임/단축명)에 맞는 팀 이름. 저장한 팀 닉네임이 있으면 닉네임이 우선. */
  function teamName(data, side) {
    const long = data?.[`${side}TeamName`] || '';
    const short = data?.[`${side}TeamNameShort`] || '';
    return teamNicknameDisplay(data, side, isLongName('teamName') ? long || short : short || long);
  }

  /**
   * 최근 경기 카드 1장(상대팀 로고·이름(H/A)·점수·날짜)을 만든다.
   * @param {object} match  최근 경기 행
   * @param {number|string} teamId  기준 팀 ID (상대팀 판별용)
   * @param {number} viewPage  현재 보고 있는 기간 페이지
   */
  function card(match, teamId, viewPage) {
    const home = Number(match.homeTeamId) === Number(teamId);
    const opponent = home ? 'away' : 'home';
    const el = node('div', 'tf-card');
    const finished = ['FT', 'AET', 'PEN'].includes(match.status);
    const scored = match.homeScore != null && match.awayScore != null;
    const winner = finished && scored ? hthGetWinner(match) : null;
    if (viewPage === 0) {
      const result = winner === null ? 'unknown' : winner === 'draw' ? 'draw' : winner === (home ? 'home' : 'away') ? 'win' : 'loss';
      el.append(node('div', `tf-result tf-${result}`, { win: '승', draw: '무', loss: '패', unknown: '—' }[result]));
    }
    const box = node('span', 'hth-logo-box tf-logo');
    const url = hthResolveLogoUrl(match[`${opponent}TeamId`], match[`${opponent}TeamLogo`], fixture);
    if (url) {
      const img = node('img', 'hth-logo');
      img.alt = teamName(match, opponent);
      box.append(img);
      if (typeof LogoTrim !== 'undefined') LogoTrim.render(img, url);
      else img.src = url;
    }
    el.append(box);
    const name = `${teamName(match, opponent) || '상대팀'} (${home ? 'H' : 'A'})`;
    const label = node('div', 'tf-opponent', name);
    bindTeamNicknameLabel(label, match, opponent);
    label.dataset.longName = `${getTeamNickname(teamNicknameIdentity(match, opponent)) || match[`${opponent}TeamName`] || teamName(match, opponent)} (${home ? 'H' : 'A'})`;
    label.dataset.shortName = `${getTeamNickname(teamNicknameIdentity(match, opponent)) || match[`${opponent}TeamNameShort`] || teamName(match, opponent)} (${home ? 'H' : 'A'})`;
    label.title = label.dataset.longName;
    el.append(label);
    const score = node('div', 'tf-score');
    if (viewPage === 0) {
      const main = node('div', 'hth-score-main');
      for (const side of ['home', 'away']) {
        if (side === 'away') main.append(node('span', 'hth-score-sep', '-'));
        main.append(node('span', `hth-score hth-score-${winner === null || winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss'}`, match[`${side}Score`] ?? '—'));
      }
      score.append(main);
      if (match.homePenaltyScore != null && match.awayPenaltyScore != null) {
        score.append(node('div', 'hth-pk-score', `PK (${match.homePenaltyScore}-${match.awayPenaltyScore})`));
      }
    } else {
      const status = { PST: '연기', CANC: '취소', TBD: '시간 미정', ABD: '중단', SUSP: '중단' }[match.status];
      const date = new Date(match.date);
      score.textContent = status || (match.date && !isNaN(date) ? date.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '시간 미정');
    }
    const date = new Date(match.date);
    el.append(score, node('div', 'tf-date', match.date && !isNaN(date) ? date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }) : '날짜 미정'));
    return el;
  }

  /** 캠 큼/캠 작음의 최근 경기 패널을 현재 페이지 기준으로 다시 그리고, 다음 프레임에 카드 줄을 맞춘다. */
  function render() {
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(container => {
      const isBig = !!container.closest('.lp-stat');
      const viewPage = isBig ? bigPage : page;
      const rows = dataRows[periods[viewPage]] || [];
      const bar = node('div', 'ev-title-bar');
      if (!isBig) bar.append(window.createSmallPanelModeButtons('fixtures', fixture));
      const title = node('div', 'ev-title', titles[viewPage]);
      bindPanelFontTitle(title, 'teamFixturesNameSize');
      bar.append(title);
      const body = node('div', 'tf-body');
      body.dataset.period = periods[viewPage];
      ['home', 'away'].forEach((side, index) => {
        const section = node('section', 'tf-team');
        const header = node('div', 'dp-side-header');
        const label = node('span', 'dp-side-name', teamName(fixture?.matchInfo, side) || (side === 'home' ? '홈팀' : '원정팀'));
        bindTeamNicknameLabel(label, fixture?.matchInfo, side);
        label.title = label.textContent;
        label.dataset.longName = getTeamNickname(teamNicknameIdentity(fixture?.matchInfo, side)) || fixture?.matchInfo?.[`${side}TeamName`] || label.textContent;
        label.dataset.shortName = getTeamNickname(teamNicknameIdentity(fixture?.matchInfo, side)) || fixture?.matchInfo?.[`${side}TeamNameShort`] || label.textContent;
        label.title = label.dataset.longName;
        const cs = typeof chromaSafe === 'function' ? chromaSafe : value => value;
        const bg = cs(state.colors?.[`${side}Bg`] || getCSS(`--${side}-bg`));
        const fg = cs(state.colors?.[`${side}Text`] || '#fff');
        label.style.setProperty('--dp-team-accent', bg);
        label.style.setProperty('--dp-team-text', fg);
        teamOutlineLowContrast(label, bg, fg, teamPanelBackground(container));
        header.append(label);
        const content = node('div', 'tf-content');
        section.append(header, content);
        const grid = node('div', 'tf-grid');
        const result = rows[index];
        if (!result) content.append(node('div', 'tf-message', '불러오는 중…'));
        else if (result.status === 'rejected') content.append(node('div', 'tf-message', '경기를 불러오지 못했습니다'));
        else {
          // 최근 6경기에서 한국 시간 기준 오늘 경기와 현재 선택 경기를 제외한다.
          const dateOptions = { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' };
          const today = new Date().toLocaleDateString('ko-KR', dateOptions);
          const matches = (result.value?.matches || []).filter(match => {
            if (String(match.fixtureId) === String(fixture?.matchInfo?.fixtureId)) return false;
            if (viewPage !== 0 || !match.date) return true;
            const date = new Date(match.date);
            return isNaN(date) || date.toLocaleDateString('ko-KR', dateOptions) !== today;
          }).slice(0, 5);
          matches.forEach(match => grid.append(card(match, fixture.matchInfo[`${side}TeamId`], viewPage)));
          content.append(matches.length ? grid : node('div', 'tf-message', '경기 데이터가 없습니다'));
        }
        body.append(section);
      });
      const controls = node('div', 'st-controls');
      const select = index => {
        if (isBig) window.lpStatShowTeamFixturesPage(index);
        else { page = index; refresh(index); }
      };
      const prev = node('button', 'st-arrow', '‹');
      prev.type = 'button'; prev.title = '이전 페이지'; prev.onclick = () => select(1 - viewPage);
      const dots = node('div', 'st-dots');
      titles.forEach((title, index) => {
        const dot = node('button', `st-dot${index === viewPage ? ' is-active' : ''}`);
        dot.type = 'button'; dot.title = title; dot.setAttribute('aria-label', title);
        dot.setAttribute('aria-pressed', String(index === viewPage)); dot.onclick = () => select(index);
        dots.append(dot);
      });
      const next = node('button', 'st-arrow', '›');
      next.type = 'button'; next.title = '다음 페이지'; next.onclick = () => select(1 - viewPage);
      controls.append(prev, dots, next);
      // 같은 페이지를 다시 그릴 때 자동 스크롤 대상과 사용자 위치를 유지한다.
      const previousBody = container.querySelector('.tf-body');
      if (previousBody?.dataset.period === body.dataset.period) {
        previousBody.replaceChildren(...body.children);
        container.replaceChildren(bar, previousBody, controls);
      } else {
        container.replaceChildren(bar, body, controls);
      }
    });
    requestAnimationFrame(alignCardRows);
  }

  /** 긴 이름과 승부차기가 있어도 점수·날짜 시작선을 맞추고, 커진 내용은 팀별 영역에서 스크롤한다. */
  function alignCardRows() {
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(panel => {
      if (!panel.offsetWidth) return;
      panel.querySelectorAll('.tf-opponent, .dp-side-name').forEach(label => {
        const isCard = label.classList.contains('tf-opponent');
        label.classList.remove('tf-name-clamped');
        label.style.fontSize = '';
        label.style.minHeight = '0';
        label.textContent = isLongName('teamName') ? label.dataset.longName : label.dataset.shortName;
        const initialSize = parseFloat(getComputedStyle(label).fontSize);
        // 카드 이름은 지정한 크기로 모두 표시한다. 늘어난 높이는 스크롤 영역이 수용한다.
        if (isCard) { label.style.minHeight = ''; return; }
        /** 팀 헤더가 한 줄 폭 안에 들어가는지 확인한다. */
        const fits = () => {
          const css = getComputedStyle(label);
          // 말줄임된 flex 텍스트는 scrollWidth가 같을 수 있어 실제 글자 폭을 잰다.
          const range = document.createRange();
          range.selectNodeContents(label);
          const rect = label.getBoundingClientRect();
          const scale = rect.width / (label.offsetWidth || 1);
          return range.getBoundingClientRect().width <= rect.width - (parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)) * scale + 1;
        };
        /** 원래 글자 크기부터 다시 측정해 긴 이름·단축명 모두 같은 기준으로 맞춥니다. */
        const shrink = () => {
          for (let size = initialSize; size >= initialSize * 0.8; size -= 0.5) {
            label.style.fontSize = `${size}px`;
            if (fits()) return true;
          }
          return false;
        };
        if (!shrink()) {
          label.textContent = label.dataset.shortName;
          shrink();
        }
        label.style.minHeight = '';
      });
      for (const selector of ['.tf-opponent', '.tf-score']) {
        const groups = selector === '.tf-score' ? [...panel.querySelectorAll('.tf-grid')] : [panel];
        groups.forEach(group => {
          const cells = [...group.querySelectorAll(selector)];
          cells.forEach(cell => { cell.style.minHeight = ''; });
          const height = Math.max(0, ...cells.map(cell => cell.offsetHeight));
          cells.forEach(cell => { cell.style.minHeight = `${height}px`; });
        });
      }
      // 두 팀의 공간은 같은 높이로 유지하고 넘치는 전체 본문만 한 번 스크롤한다.
      const minimum = Math.max(0, ...[...panel.querySelectorAll('.tf-team')].map(team => {
        const style = getComputedStyle(team);
        return team.querySelector('.dp-side-header').offsetHeight
          + (team.querySelector('.tf-content')?.firstElementChild?.offsetHeight || 0)
          + parseFloat(style.rowGap) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      }));
      panel.style.setProperty('--tf-team-min-height', `${Math.ceil(minimum)}px`);
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const widths = new WeakMap();
    const observer = new ResizeObserver(entries => {
      // 높이 보정으로 다시 발생한 알림은 무시해 행 정렬이 반복되지 않게 합니다.
      if (entries.some(entry => {
        const changed = widths.get(entry.target) !== entry.contentRect.width;
        widths.set(entry.target, entry.contentRect.width);
        return changed;
      })) requestAnimationFrame(alignCardRows);
    });
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(el => observer.observe(el));
  });

  /** 양 팀을 독립적으로 조회해 한쪽 실패도 표시하며, 경기 초기화 후의 응답은 버립니다. */
  async function refresh(viewPage = page) {
    const seq = sequence;
    const period = periods[viewPage];
    if (pending[period]) return pending[period];
    render();
    const ids = hthGetTeamIds(fixture);
    if (!ids) return;
    const request = Promise.allSettled([load(ids.homeTeamId, period), load(ids.awayTeamId, period)]).then(result => {
      if (sequence !== seq) return;
      dataRows[period] = result;
      delete pending[period];
      render();
    });
    pending[period] = request;
    return request;
  }
  /** 작은 캠을 최근 경기 페이지로 열고, 같은 경기인지 확인한 뒤 데이터를 불러옵니다. */
  window.teamFixturesShow = data => {
    if (!hthGetTeamIds(data)) return;
    window.teamFixturesSync(data);
    fixture = data;
    page = 0;
    hthSetMode('fixtures');
    refresh();
  };
  /** 요청 세대를 바꿔 진행 중 응답을 무효화하고 양 캠의 표시 상태를 비웁니다. */
  window.teamFixturesReset = () => {
    sequence++;
    fixture = null;
    dataRows = {};
    pending = {};
    page = 0;
    bigPage = 0;
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(el => el.replaceChildren());
  };
  // 큰 캠은 작은 캠의 선택 페이지와 독립적으로 최근→예정 순환한다.
  /** 큰 캠의 페이지를 선택하고 양 팀의 경기 목록을 새로 조회합니다. */
  window.teamFixturesEnsure = (data, index = 0) => {
    if (!hthGetTeamIds(data)) return Promise.resolve();
    window.teamFixturesSync(data);
    fixture = data;
    bigPage = index;
    return refresh(index);
  };
  // 경기 제거·수동 모드 진입에서도 이전 팀과 진행 중인 요청을 정리한다.
  /** 경기 또는 팀 구성이 바뀌면 패널을 초기화하고, 같은 경기의 갱신 데이터는 유지합니다. */
  window.teamFixturesSync = data => {
    if (!fixture) return;
    const old = fixture.matchInfo;
    const current = data?.matchInfo;
    if (!current || ['fixtureId', 'homeTeamId', 'awayTeamId'].some(key => String(old?.[key]) !== String(current[key]))) {
      hthReset();
      return;
    }
    fixture = data;
  };
  document.addEventListener('team-nicknames:change', () => { if (fixture) render(); });
  document.addEventListener('theme:colors-changed', () => { if (fixture) render(); });
  document.addEventListener('settings:change', () => { if (fixture) render(); });
})();
