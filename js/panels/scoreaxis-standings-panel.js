// ScoreAxis standings widget renderer for small events area and big stat cycle.
(function () {
  const PANEL_SELECTOR = '[data-scoreaxis-standings-panel]';
  const SMALL_PANEL_SELECTOR = '.lp-events-s [data-scoreaxis-standings-panel]';
  const SMALL_EVENTS_SELECTOR = '.lp-events-s [data-events-panel]';
  const SMALL_HTH_SELECTOR = '.lp-events-s [data-hth-panel]';

  const state = {
    fixtureData: null,
    smallMode: 'events',
    renderSeq: 0,
  };

  function getEmbeds(fixtureData = state.fixtureData) {
    if (typeof window.resolveScoreaxisStandingsEmbeds !== 'function') return [];
    return window.resolveScoreaxisStandingsEmbeds(fixtureData);
  }

  function hasEmbeds(fixtureData = state.fixtureData) {
    return getEmbeds(fixtureData).length > 0;
  }

  function getFixtureId(fixtureData = state.fixtureData) {
    return String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  }

  function getRenderKey(fixtureData, embeds) {
    const fixtureId = getFixtureId(fixtureData);
    const leagueId = String(fixtureData?.matchInfo?.leagueId ?? '');
    const round = String(fixtureData?.matchInfo?.leagueRound ?? fixtureData?.matchInfo?.round ?? '');
    const names = embeds.map(entry => entry.scoreaxisLeagueName).join('|');
    return [fixtureId, leagueId, round, names].join('::');
  }

  function createIconButton(title, className, iconHtml, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.innerHTML = iconHtml;
    button.addEventListener('click', event => {
      event.preventDefault();
      onClick?.();
    });
    return button;
  }

  function eventsIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><rect x="6" y="2" width="7" height="2" rx="1"/><circle cx="3" cy="7" r="1.5"/><rect x="6" y="6" width="7" height="2" rx="1"/><circle cx="3" cy="11" r="1.5"/><rect x="6" y="10" width="7" height="2" rx="1"/></svg>';
  }

  function standingsIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2" rx="1"/><rect x="1" y="6" width="12" height="2" rx="1"/><rect x="1" y="10" width="12" height="2" rx="1"/></svg>';
  }

  function hthIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h10M9 2l2 2-2 2"/><path d="M13 10H3M5 8l-2 2 2 2"/></svg>';
  }

  function createSmallPanelModeButton({ mode, activeMode, title, iconHtml, disabled, onClick }) {
    const button = createIconButton(title, 'small-panel-mode-btn', iconHtml, onClick);
    button.dataset.smallPanelMode = mode;
    button.classList.toggle('is-active', mode === activeMode);
    button.disabled = !!disabled;
    return button;
  }

  function createSmallPanelModeButtons(activeMode = 'events', fixtureData = state.fixtureData) {
    const data = fixtureData || state.fixtureData;
    const group = document.createElement('div');
    group.className = 'small-panel-mode-buttons';
    group.appendChild(createSmallPanelModeButton({
      mode: 'events',
      activeMode,
      title: '이벤트 보기',
      iconHtml: eventsIcon(),
      onClick: () => {
        state.smallMode = 'events';
        scoreaxisStandingsUpdateSmallVisibility();
        if (typeof window.hthSetMode === 'function') window.hthSetMode('events');
      },
    }));
    group.appendChild(createSmallPanelModeButton({
      mode: 'standings',
      activeMode,
      title: '순위표 보기',
      iconHtml: standingsIcon(),
      disabled: !hasEmbeds(data),
      onClick: () => { scoreaxisStandingsShowForFixture(data); },
    }));
    group.appendChild(createSmallPanelModeButton({
      mode: 'hth',
      activeMode,
      title: '상대 전적 보기',
      iconHtml: hthIcon(),
      disabled: !(typeof window.hthCanLoadForFixture === 'function' && window.hthCanLoadForFixture(data)),
      onClick: () => {
        scoreaxisStandingsHideSmall({ skipHthUpdate: true });
        if (typeof window.hthShowForFixture === 'function') {
          window.hthShowForFixture(data).catch(err => console.warn('HTH fetch failed:', err));
        }
      },
    }));
    return group;
  }

  function createTitleBar(container, fixtureData) {
    const isStatPanel = container?.closest?.('.lp-stat');
    const titleBar = document.createElement('div');
    titleBar.className = 'ev-title-bar scoreaxis-standings-title-bar';

    if (!isStatPanel) {
      titleBar.appendChild(createSmallPanelModeButtons('standings', fixtureData));
    }

    const title = document.createElement('div');
    title.className = 'ev-title scoreaxis-standings-title';
    title.textContent = '순위표';
    titleBar.appendChild(title);
    return titleBar;
  }

  function materializeEmbed(entry) {
    const embedCode = String(entry?.embedCode || '').trim();
    if (!embedCode) return document.createTextNode('');

    const frame = document.createElement('iframe');
    frame.className = 'scoreaxis-standings-frame';
    frame.title = [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' - ') || 'ScoreAxis standings';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.srcdoc = embedCode;
    return frame;
  }
  function createEntryLabel(entry) {
    const label = document.createElement('div');
    label.className = 'scoreaxis-standings-entry-label';
    label.textContent = [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' · ');
    return label;
  }

  function isInActivePage(container) {
    const page = container.closest?.('.page');
    return !page || page.classList.contains('active');
  }

  function shouldRenderContainer(container) {
    if (!isInActivePage(container)) return false;
    if (container.closest?.('.lp-events-s')) return state.smallMode === 'standings';
    if (container.closest?.('.lp-stat')) return window._lpStatCycle?.mode === 'standings';
    return true;
  }
  function renderEmpty(container, message) {
    const empty = document.createElement('div');
    empty.className = 'scoreaxis-standings-empty ev-empty';
    empty.textContent = message;
    container.replaceChildren(empty);
  }

  function renderPanel(container, fixtureData, embeds, panelIndex, options = {}) {
    container.classList.add('scoreaxis-standings-panel');
    const renderKey = getRenderKey(fixtureData, embeds);
    if (!options.force && container.dataset.scoreaxisRenderKey === renderKey && container.childElementCount) return;
    container.dataset.scoreaxisRenderKey = renderKey;

    if (!fixtureData) {
      renderEmpty(container, '경기를 선택하면 순위표가 표시됩니다');
      return;
    }
    if (!embeds.length) {
      renderEmpty(container, '이 경기의 순위표 위젯이 없습니다');
      return;
    }

    state.renderSeq += 1;
    const titleBar = createTitleBar(container, fixtureData);
    const list = document.createElement('div');
    list.className = 'scoreaxis-standings-list';

    embeds.forEach((entry, embedIndex) => {
      const item = document.createElement('div');
      item.className = 'scoreaxis-standings-item';
      if (embeds.length > 1) item.appendChild(createEntryLabel(entry));
      item.appendChild(materializeEmbed(entry));
      list.appendChild(item);
    });

    container.replaceChildren(titleBar, list);
    requestAnimationFrame(() => { container.scrollTop = 0; });
  }

  function applyScoreaxisStandingsPanel(fixtureData, options = {}) {
    state.fixtureData = fixtureData || null;
    const embeds = getEmbeds(state.fixtureData);
    if (!embeds.length && state.smallMode === 'standings') state.smallMode = 'events';

    document.querySelectorAll(PANEL_SELECTOR).forEach((container, panelIndex) => {
      if (!shouldRenderContainer(container)) {
        container.dataset.scoreaxisRenderKey = '';
        container.replaceChildren();
        return;
      }
      renderPanel(container, state.fixtureData, embeds, panelIndex, options);
    });

    scoreaxisStandingsUpdateSmallVisibility();
    window.lpStatUpdateBtn?.();
  }

  function scoreaxisStandingsUpdateSmallVisibility() {
    const isStandings = state.smallMode === 'standings';
    document.querySelectorAll(SMALL_PANEL_SELECTOR).forEach(el => {
      el.style.display = isStandings ? '' : 'none';
    });

    if (isStandings) {
      document.querySelectorAll(SMALL_EVENTS_SELECTOR).forEach(el => { el.style.display = 'none'; });
      document.querySelectorAll(SMALL_HTH_SELECTOR).forEach(el => { el.style.display = 'none'; });
      return;
    }

    const isHth = window._hthState?.mode === 'hth';
    document.querySelectorAll(SMALL_EVENTS_SELECTOR).forEach(el => {
      el.style.display = isHth ? 'none' : '';
    });
    document.querySelectorAll(SMALL_HTH_SELECTOR).forEach(el => {
      el.style.display = isHth ? '' : 'none';
    });
  }
  function scoreaxisStandingsShowForFixture(fixtureData = state.fixtureData) {
    const data = fixtureData || state.fixtureData;
    if (!hasEmbeds(data)) return false;
    if (typeof window.hthSetMode === 'function' && window._hthState?.mode === 'hth') {
      window.hthSetMode('events');
    }
    state.smallMode = 'standings';
    applyScoreaxisStandingsPanel(data, { force: true });
    return true;
  }

  function scoreaxisStandingsShowEvents() {
    state.smallMode = 'events';
    scoreaxisStandingsUpdateSmallVisibility();
    if (typeof window.hthSetMode === 'function') window.hthSetMode('events');
  }

  function scoreaxisStandingsHideSmall(options = {}) {
    state.smallMode = 'events';
    scoreaxisStandingsUpdateSmallVisibility();
    if (!options.skipHthUpdate) window.hthUpdateVisibility?.();
  }

  function scoreaxisStandingsReset() {
    state.fixtureData = null;
    state.smallMode = 'events';
    document.querySelectorAll(PANEL_SELECTOR).forEach(container => {
      container.dataset.scoreaxisRenderKey = '';
      container.replaceChildren();
    });
    scoreaxisStandingsUpdateSmallVisibility();
  }

  window.createSmallPanelModeButtons = createSmallPanelModeButtons;
  window.applyScoreaxisStandingsPanel = applyScoreaxisStandingsPanel;
  window.scoreaxisStandingsHasEmbeds = hasEmbeds;
  window.scoreaxisStandingsShowForFixture = scoreaxisStandingsShowForFixture;
  window.scoreaxisStandingsShowEvents = scoreaxisStandingsShowEvents;
  window.scoreaxisStandingsHideSmall = scoreaxisStandingsHideSmall;
  window.scoreaxisStandingsIsSmallMode = () => state.smallMode === 'standings';
  window.scoreaxisStandingsUpdateSmallVisibility = scoreaxisStandingsUpdateSmallVisibility;
  window.scoreaxisStandingsReset = scoreaxisStandingsReset;
}());