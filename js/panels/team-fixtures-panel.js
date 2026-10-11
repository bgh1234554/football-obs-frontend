// 양 캠의 최근·예정 경기: 팀별 요청을 공유하고 경기 전환 후 늦은 응답은 버린다.
(() => {
  const cache = new Map();
  let fixture = null;
  let page = 0;
  let bigPage = 0;
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

  function load(teamId, period) {
    const key = `${teamId}:${period}`;
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.promise;
    const promise = fetchTeamFixtures(teamId, period).catch(error => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
      throw error;
    });
    cache.set(key, { promise, expires: Date.now() + 12 * 60 * 60 * 1000 });
    return promise;
  }

  function teamName(data, side) {
    const long = data?.[`${side}TeamName`] || '';
    const short = data?.[`${side}TeamNameShort`] || '';
    return isLongName('teamName') ? long || short : short || long;
  }

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
    label.dataset.longName = `${match[`${opponent}TeamName`] || teamName(match, opponent)} (${home ? 'H' : 'A'})`;
    label.dataset.shortName = `${match[`${opponent}TeamNameShort`] || teamName(match, opponent)} (${home ? 'H' : 'A'})`;
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

  function render() {
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(container => {
      const isBig = !!container.closest('.lp-stat');
      const viewPage = isBig ? bigPage : page;
      const rows = dataRows[periods[viewPage]] || [];
      const bar = node('div', 'ev-title-bar');
      if (!isBig) bar.append(window.createSmallPanelModeButtons('fixtures', fixture));
      bar.append(node('div', 'ev-title', titles[viewPage]));
      const body = node('div', 'tf-body');
      ['home', 'away'].forEach((side, index) => {
        const section = node('section', 'tf-team');
        const header = node('div', 'dp-side-header');
        const label = node('span', 'dp-side-name', teamName(fixture?.matchInfo, side) || (side === 'home' ? '홈팀' : '원정팀'));
        label.title = label.textContent;
        label.dataset.longName = fixture?.matchInfo?.[`${side}TeamName`] || label.textContent;
        label.dataset.shortName = fixture?.matchInfo?.[`${side}TeamNameShort`] || label.textContent;
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
      container.replaceChildren(bar, body, controls);
    });
    requestAnimationFrame(alignCardRows);
  }

  // 긴 이름과 승부차기가 있어도 같은 팀 카드들의 점수·날짜 시작선을 맞춘다.
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
        const fits = () => {
          const css = getComputedStyle(label);
          if (isCard) return label.offsetHeight <= Math.ceil(parseFloat(css.lineHeight) * 3) + 1;
          // 말줄임된 flex 텍스트는 scrollWidth가 같을 수 있어 실제 글자 폭을 잰다.
          const range = document.createRange();
          range.selectNodeContents(label);
          const rect = label.getBoundingClientRect();
          const scale = rect.width / (label.offsetWidth || 1);
          return range.getBoundingClientRect().width <= rect.width - (parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)) * scale + 1;
        };
        const shrink = () => {
          for (let size = initialSize; size >= 9; size -= 0.5) {
            label.style.fontSize = `${size}px`;
            if (fits()) return true;
          }
          return false;
        };
        if (!shrink()) {
          label.textContent = label.dataset.shortName;
          if (!shrink() && isCard) label.classList.add('tf-name-clamped');
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
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const widths = new WeakMap();
    const observer = new ResizeObserver(entries => {
      if (entries.some(entry => {
        const changed = widths.get(entry.target) !== entry.contentRect.width;
        widths.set(entry.target, entry.contentRect.width);
        return changed;
      })) requestAnimationFrame(alignCardRows);
    });
    document.querySelectorAll('[data-team-fixtures-panel]').forEach(el => observer.observe(el));
  });

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
  window.teamFixturesShow = data => {
    if (!hthGetTeamIds(data)) return;
    window.teamFixturesSync(data);
    fixture = data;
    page = 0;
    hthSetMode('fixtures');
    refresh();
  };
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
  window.teamFixturesEnsure = (data, index = 0) => {
    if (!hthGetTeamIds(data)) return Promise.resolve();
    window.teamFixturesSync(data);
    fixture = data;
    bigPage = index;
    const ids = hthGetTeamIds(data);
    const fresh = [ids.homeTeamId, ids.awayTeamId].every(id => (cache.get(`${id}:${periods[index]}`)?.expires || 0) > Date.now());
    if (fresh && dataRows[periods[index]]?.every(row => row.status === 'fulfilled')) {
      render();
      return Promise.resolve();
    }
    return refresh(index);
  };
  // 경기 제거·수동 모드 진입에서도 이전 팀과 진행 중인 요청을 정리한다.
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
  document.addEventListener('theme:colors-changed', () => { if (fixture) render(); });
  document.addEventListener('settings:change', () => { if (fixture) render(); });
})();
