// ScoreAxis standings widget renderer for small events area and big stat cycle.
(function () {
  const PANEL_SELECTOR = '[data-scoreaxis-standings-panel]';
  const SMALL_PANEL_SELECTOR = '.lp-events-s [data-scoreaxis-standings-panel]';
  const SMALL_EVENTS_SELECTOR = '.lp-events-s [data-events-panel]';
  const SMALL_HTH_SELECTOR = '.lp-events-s [data-hth-panel]';
  const BIG_POPUP_BUTTON_SELECTOR = '.lp-stat-standings-popup-btn';
  const POPUP_BACKDROP_ID = 'scoreaxisStandingsBackdrop';
  const FRAME_OVERRIDE_STYLE_ID = 'scoreaxisHostOverrides';

  let panelSurfaceObserver = null;

  const state = {
    fixtureData: null,
    smallMode: 'events',
    popupOpen: false,
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
    const isSmallPanel = container?.closest?.('.lp-events-s');
    const titleBar = document.createElement('div');
    titleBar.className = 'ev-title-bar scoreaxis-standings-title-bar';

    if (isSmallPanel) {
      titleBar.appendChild(createSmallPanelModeButtons('standings', fixtureData));
    }

    const title = document.createElement('div');
    title.className = 'ev-title scoreaxis-standings-title';
    title.textContent = '순위표';
    titleBar.appendChild(title);
    return titleBar;
  }

  function getPanelSurfaceVars() {
    try {
      const styles = getComputedStyle(document.documentElement);
      return {
        rgb: styles.getPropertyValue('--panel-ui-rgb').trim() || '11, 18, 32',
        alpha: styles.getPropertyValue('--panel-alpha').trim() || '1',
      };
    } catch (err) {
      return { rgb: '11, 18, 32', alpha: '1' };
    }
  }

  function buildFrameCss(surface) {
    return ':root{--scoreaxis-panel-rgb:' + surface.rgb + ';--scoreaxis-panel-alpha:' + surface.alpha + '}'
      + 'html,body{margin:0;padding:0;background:transparent;overflow:hidden;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.5) transparent;}'
      + '*{box-sizing:border-box;}'
      + 'html,body,body *,.scoreaxis-widget,.scoreaxis-widget *,.scoreaxis-inner-widget,.scoreaxis-inner-widget *{font-family:"Ubuntu","NanumBarunGothic","Nanum Barun Gothic","Malgun Gothic",Arial,sans-serif!important;}'
      + '.scoreaxis-widget,.scoreaxis-inner-widget{background-color:rgba(var(--scoreaxis-panel-rgb),var(--scoreaxis-panel-alpha))!important;}'
      + '::-webkit-scrollbar{width:7px;height:7px;}'
      + '::-webkit-scrollbar-track{background:transparent;}'
      + '::-webkit-scrollbar-thumb{background:rgba(148,163,184,.45);border-radius:999px;border:2px solid #0b1220;}'
      + '::-webkit-scrollbar-thumb:hover{background:rgba(203,213,225,.62);}';
  }

  function buildIframeSrcdoc(embedCode) {
    const surface = getPanelSurfaceVars();
    const fontLinks = '<link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;700&display=swap" rel="stylesheet">'
      + '<link href="https://hangeul.pstatic.net/hangeul_static/css/nanum-barun-gothic.css" rel="stylesheet">';
    const frameCss = '<style>' + buildFrameCss(surface) + '</style>';
    return '<!doctype html><html><head><meta charset="utf-8">'
      + fontLinks
      + frameCss
      + '</head><body>'
      + embedCode
      + '</body></html>';
  }

  function installFrameOverrides(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc?.head) return;
      const surface = getPanelSurfaceVars();
      doc.documentElement?.style?.setProperty('--scoreaxis-panel-rgb', surface.rgb);
      doc.documentElement?.style?.setProperty('--scoreaxis-panel-alpha', surface.alpha);
      let style = doc.getElementById(FRAME_OVERRIDE_STYLE_ID);
      if (!style) {
        style = doc.createElement('style');
        style.id = FRAME_OVERRIDE_STYLE_ID;
        doc.head.appendChild(style);
      }
      style.textContent = buildFrameCss(surface);
    } catch (err) {}
  }

  function syncAllFrameSurfaces() {
    document.querySelectorAll('.scoreaxis-standings-frame').forEach(installFrameOverrides);
  }

  function ensurePanelSurfaceObserver() {
    if (panelSurfaceObserver || !window.MutationObserver) return;
    panelSurfaceObserver = new MutationObserver(syncAllFrameSurfaces);
    panelSurfaceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }
  function getFrameContentHeight(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return 0;
      const body = doc.body;
      const html = doc.documentElement;
      return Math.ceil(Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        html?.scrollHeight || 0,
        html?.offsetHeight || 0
      ));
    } catch (err) {
      return 0;
    }
  }

  function resizeFrameToContent(frame) {
    const height = getFrameContentHeight(frame);
    if (height > 80) frame.style.height = `${height}px`;
  }

  function attachFrameAutoHeight(frame) {
    const run = () => resizeFrameToContent(frame);
    frame.addEventListener('load', () => {
      installFrameOverrides(frame);
      run();
      try {
        const doc = frame.contentDocument;
        const ro = new ResizeObserver(run);
        if (doc?.documentElement) ro.observe(doc.documentElement);
        if (doc?.body) ro.observe(doc.body);
        frame._scoreaxisResizeObserver = ro;
        doc?.fonts?.ready?.then(run).catch(() => {});
      } catch (err) {}
      [250, 750, 1500, 3000, 6000, 10000].forEach(delay => setTimeout(() => { installFrameOverrides(frame); run(); }, delay));
    });
    requestAnimationFrame(run);
  }

  function materializeEmbed(entry) {
    const embedCode = String(entry?.embedCode || '').trim();
    if (!embedCode) return document.createTextNode('');

    const frame = document.createElement('iframe');
    frame.className = 'scoreaxis-standings-frame';
    frame.title = [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' - ') || 'ScoreAxis standings';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.loading = 'eager';
    frame.srcdoc = buildIframeSrcdoc(embedCode);
    ensurePanelSurfaceObserver();
    attachFrameAutoHeight(frame);
    return frame;
  }
  function createEntryLabel(entry) {
    const label = document.createElement('div');
    label.className = 'scoreaxis-standings-entry-label';
    label.textContent = [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' \u00B7 ');
    return label;
  }

  function isPopupContainer(container) {
    return !!container?.closest?.(`#${POPUP_BACKDROP_ID}`);
  }

  function ensurePopupElements() {
    let backdrop = document.getElementById(POPUP_BACKDROP_ID);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = POPUP_BACKDROP_ID;
      backdrop.className = 'dp-manual-backdrop scoreaxis-standings-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.innerHTML = `
        <div class="dp-manual-modal scoreaxis-standings-modal" role="dialog" aria-modal="true" aria-labelledby="scoreaxisStandingsTitle">
          <div class="dp-manual-header scoreaxis-standings-modal-header">
            <div>
              <div class="dp-manual-title" id="scoreaxisStandingsTitle">&#49692;&#50948;&#54364;</div>
              <div class="dp-manual-meta" id="scoreaxisStandingsMeta"></div>
            </div>
            <button class="dp-manual-close" id="scoreaxisStandingsClose" aria-label="&#45803;&#44592;">&times;</button>
          </div>
          <div class="dp-manual-body scoreaxis-standings-popup-body" data-scoreaxis-standings-panel data-scoreaxis-popup-panel></div>
        </div>`;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) closeStandingsPopup();
      });
      backdrop.querySelector('#scoreaxisStandingsClose')?.addEventListener('click', closeStandingsPopup);
    }
    return {
      backdrop,
      panel: backdrop.querySelector('[data-scoreaxis-popup-panel]'),
      meta: backdrop.querySelector('#scoreaxisStandingsMeta'),
    };
  }

  function describeEmbeds(embeds) {
    return embeds.map(entry => [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' \u00B7 ')).join(' / ');
  }

  function describeFixtureLeague(fixtureData, fallbackEmbeds = []) {
    const matchInfo = fixtureData?.matchInfo || {};
    const leagueName = String(matchInfo.leagueName || matchInfo.league?.name || '').trim();
    const round = String(matchInfo.leagueRound || matchInfo.round || '').trim();
    const parts = [leagueName, round].filter(Boolean);
    if (parts.length) return parts.join(' \u00B7 ');
    return describeEmbeds(fallbackEmbeds);
  }
  function openStandingsPopup(fixtureData = state.fixtureData) {
    const data = fixtureData || state.fixtureData;
    const embeds = getEmbeds(data);
    if (!embeds.length) return false;
    state.fixtureData = data || null;
    state.popupOpen = true;
    const { backdrop, panel, meta } = ensurePopupElements();
    if (meta) meta.textContent = describeFixtureLeague(data, embeds);
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    renderPanel(panel, state.fixtureData, embeds, 0, { force: true });
    updatePopupButton();
    requestAnimationFrame(() => { if (panel) panel.scrollTop = 0; });
    return true;
  }

  function closeStandingsPopup() {
    const backdrop = document.getElementById(POPUP_BACKDROP_ID);
    state.popupOpen = false;
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      const panel = backdrop.querySelector('[data-scoreaxis-popup-panel]');
      if (panel) {
        panel.dataset.scoreaxisRenderKey = '';
        panel.replaceChildren();
      }
    }
    updatePopupButton();
  }

  function updatePopupButton(fixtureData = state.fixtureData || window._eventsLastData) {
    const data = fixtureData || state.fixtureData || window._eventsLastData || null;
    const show = hasEmbeds(data);
    document.querySelectorAll(BIG_POPUP_BUTTON_SELECTOR).forEach(button => {
      button.style.display = show ? '' : 'none';
      button.disabled = !show;
      button.innerHTML = standingsIcon();
      button.title = '\uC21C\uC704\uD45C \uD31D\uC5C5';
      button.setAttribute('aria-label', '\uC21C\uC704\uD45C \uD31D\uC5C5 \uC5F4\uAE30');
      button.closest('.lp-stat')?.classList.toggle('has-standings-popup-btn', show);
    });
  }

  function isInActivePage(container) {
    const page = container.closest?.('.page');
    return !page || page.classList.contains('active');
  }

  function shouldRenderContainer(container) {
    if (isPopupContainer(container)) return state.popupOpen;
    if (!isInActivePage(container)) return false;
    if (container.closest?.('.lp-events-s')) return state.smallMode === 'standings';
    return false;
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
    const titleBar = isPopupContainer(container) ? null : createTitleBar(container, fixtureData);
    const list = document.createElement('div');
    list.className = 'scoreaxis-standings-list';

    embeds.forEach((entry, embedIndex) => {
      const item = document.createElement('div');
      item.className = 'scoreaxis-standings-item';
      if (embeds.length > 1) item.appendChild(createEntryLabel(entry));
      item.appendChild(materializeEmbed(entry));
      list.appendChild(item);
    });

    if (titleBar) container.replaceChildren(titleBar, list);
    else container.replaceChildren(list);
    requestAnimationFrame(() => { container.scrollTop = 0; });
  }

  function applyScoreaxisStandingsPanel(fixtureData, options = {}) {
    state.fixtureData = fixtureData || null;
    const embeds = getEmbeds(state.fixtureData);
    if (!embeds.length && state.smallMode === 'standings') state.smallMode = 'events';
    if (!embeds.length && state.popupOpen) closeStandingsPopup();

    document.querySelectorAll(PANEL_SELECTOR).forEach((container, panelIndex) => {
      if (!shouldRenderContainer(container)) {
        container.dataset.scoreaxisRenderKey = '';
        container.replaceChildren();
        return;
      }
      renderPanel(container, state.fixtureData, embeds, panelIndex, options);
    });

    scoreaxisStandingsUpdateSmallVisibility();
    updatePopupButton(state.fixtureData);
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
    closeStandingsPopup();
    updatePopupButton(null);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(BIG_POPUP_BUTTON_SELECTOR).forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        openStandingsPopup(window._eventsLastData || state.fixtureData);
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.popupOpen) closeStandingsPopup();
    });
    updatePopupButton(window._eventsLastData || state.fixtureData);
  });

  window.createSmallPanelModeButtons = createSmallPanelModeButtons;
  window.applyScoreaxisStandingsPanel = applyScoreaxisStandingsPanel;
  window.scoreaxisStandingsHasEmbeds = hasEmbeds;
  window.scoreaxisStandingsShowForFixture = scoreaxisStandingsShowForFixture;
  window.scoreaxisStandingsShowEvents = scoreaxisStandingsShowEvents;
  window.scoreaxisStandingsOpenPopup = openStandingsPopup;
  window.scoreaxisStandingsClosePopup = closeStandingsPopup;
  window.scoreaxisStandingsUpdatePopupButton = updatePopupButton;
  window.scoreaxisStandingsHideSmall = scoreaxisStandingsHideSmall;
  window.scoreaxisStandingsIsSmallMode = () => state.smallMode === 'standings';
  window.scoreaxisStandingsUpdateSmallVisibility = scoreaxisStandingsUpdateSmallVisibility;
  window.scoreaxisStandingsReset = scoreaxisStandingsReset;
}());