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
  let restoringSmallEventsPanel = false;

  const state = {
    fixtureData: null,
    smallMode: 'events',
    popupOpen: false,
    renderSeq: 0,
  };

  /** 현재 fixture에 대한 ScoreAxis embed 항목 배열을 반환한다. */
  function getEmbeds(fixtureData = state.fixtureData) {
    if (typeof window.resolveScoreaxisStandingsEmbeds !== 'function') return [];
    return window.resolveScoreaxisStandingsEmbeds(fixtureData);
  }

  /** ScoreAxis embed 항목이 1개 이상 있으면 true를 반환한다. */
  function hasEmbeds(fixtureData = state.fixtureData) {
    return getEmbeds(fixtureData).length > 0;
  }

  /** fixtureData에서 fixtureId를 문자열로 추출해 반환한다. */
  function getFixtureId(fixtureData = state.fixtureData) {
    return String(fixtureData?.matchInfo?.fixtureId ?? '').trim();
  }

  /**
   * fixture + embed 조합으로 패널 렌더 캐시 키를 생성한다.
   * @param {object} fixtureData - FixtureResponseDto 형태의 경기 데이터.
   * @param {Array} embeds - ScoreAxis embed 항목 배열.
   * @returns {string} 콜론으로 구분된 캐시 키 문자열.
   */
  function getRenderKey(fixtureData, embeds) {
    const fixtureId = getFixtureId(fixtureData);
    const leagueId = String(fixtureData?.matchInfo?.leagueId ?? '');
    const round = String(fixtureData?.matchInfo?.leagueRound ?? fixtureData?.matchInfo?.round ?? '');
    const names = embeds.map(entry => entry.scoreaxisLeagueName).join('|');
    return [fixtureId, leagueId, round, names].join('::');
  }

  /**
   * type=button 엘리먼트를 생성해 클릭 핸들러를 등록한다.
   * @param {string} title - 버튼 tooltip 텍스트.
   * @param {string} className - 버튼에 적용할 CSS 클래스.
   * @param {string} iconHtml - 버튼 내부 아이콘 HTML.
   * @param {Function} onClick - 클릭 시 호출할 콜백.
   * @returns {HTMLButtonElement} 생성된 버튼 엘리먼트.
   */
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

  /** 이벤트 패널 모드 버튼에 사용할 아이콘 SVG 문자열을 반환한다. */
  function eventsIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><rect x="6" y="2" width="7" height="2" rx="1"/><circle cx="3" cy="7" r="1.5"/><rect x="6" y="6" width="7" height="2" rx="1"/><circle cx="3" cy="11" r="1.5"/><rect x="6" y="10" width="7" height="2" rx="1"/></svg>';
  }

  /** 순위표 패널 모드 버튼에 사용할 아이콘 SVG 문자열을 반환한다. */
  function standingsIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2" rx="1"/><rect x="1" y="6" width="12" height="2" rx="1"/><rect x="1" y="10" width="12" height="2" rx="1"/></svg>';
  }

  /** 상대 전적(HTH) 패널 모드 버튼에 사용할 아이콘 SVG 문자열을 반환한다. */
  function hthIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h10M9 2l2 2-2 2"/><path d="M13 10H3M5 8l-2 2 2 2"/></svg>';
  }

  /** 순위표 팝업 열기 버튼에 사용할 아이콘 SVG 문자열을 반환한다. */
  function popupOpenIcon() {
    return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8"/><path d="M9 1h4v4"/><path d="M13 1 7.5 6.5"/></svg>';
  }

  /**
   * 캠 작은 패널 모드 전환 버튼 하나를 생성한다.
   * @param {object} params - 버튼 생성 파라미터.
   * @param {string} params.mode - 이 버튼이 나타내는 모드 식별자.
   * @param {string} params.activeMode - 현재 활성 모드 식별자.
   * @param {string} params.title - 버튼 tooltip 텍스트.
   * @param {string} params.iconHtml - 버튼 내부 아이콘 HTML.
   * @param {boolean} [params.disabled] - 비활성화 여부.
   * @param {Function} [params.onClick] - 클릭 시 호출할 콜백.
   * @returns {HTMLButtonElement} 생성된 모드 버튼 엘리먼트.
   */
  function createSmallPanelModeButton({ mode, activeMode, title, iconHtml, disabled, onClick }) {
    const button = createIconButton(title, 'small-panel-mode-btn', iconHtml, onClick);
    button.dataset.smallPanelMode = mode;
    button.classList.toggle('is-active', mode === activeMode);
    button.disabled = !!disabled;
    return button;
  }

  /**
   * 이벤트/순위표/HTH 3-버튼 토글 그룹을 생성해 반환한다. window에 노출됨.
   * @param {string} [activeMode='events'] - 초기 활성 모드 식별자.
   * @param {object} [fixtureData] - 현재 경기 데이터. 버튼 비활성화 여부 판별에 사용.
   * @returns {HTMLDivElement} 버튼 3개가 담긴 그룹 엘리먼트.
   */
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

  /**
   * 순위표 패널 타이틀 바 엘리먼트를 생성해 반환한다.
   * @param {HTMLElement} container - 패널 컨테이너 엘리먼트. lp-events-s 여부 판별에 사용.
   * @param {object} fixtureData - 현재 경기 데이터.
   * @returns {HTMLDivElement} 타이틀 바 엘리먼트.
   */
  function createTitleBar(container, fixtureData) {
    const isSmallPanel = container?.closest?.('.lp-events-s');
    const titleBar = document.createElement('div');
    titleBar.className = 'ev-title-bar scoreaxis-standings-title-bar';

    if (isSmallPanel) {
      titleBar.appendChild(createSmallPanelModeButtons('standings', fixtureData));
    }

    const title = document.createElement('div');
    title.className = 'ev-title scoreaxis-standings-title';
    title.textContent = '\uC21C\uC704\uD45C';
    titleBar.appendChild(title);

    if (isSmallPanel) {
      const popupButton = createIconButton(
        '\uC21C\uC704\uD45C \uD31D\uC5C5',
        'scoreaxis-small-popup-btn',
        popupOpenIcon(),
        () => { openStandingsPopup(fixtureData || state.fixtureData); }
      );
      popupButton.setAttribute('aria-label', '\uC21C\uC704\uD45C \uD31D\uC5C5 \uC5F4\uAE30');
      popupButton.disabled = !hasEmbeds(fixtureData || state.fixtureData);
      titleBar.appendChild(popupButton);
    }

    return titleBar;
  }

  /**
   * CSS 변수에서 패널 배경 rgb 값과 alpha 값을 읽어 반환한다.
   * @returns {{ rgb: string, alpha: string }} 패널 배경 변수 객체.
   */
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

  /**
   * iframe srcdoc에 삽입할 배경/스크롤바 CSS 문자열을 생성한다.
   * @param {{ rgb: string, alpha: string }} surface - 패널 배경 변수 객체.
   * @returns {string} CSS 문자열.
   */
  function buildFrameCss(surface) {
    return ':root{--scoreaxis-panel-rgb:' + surface.rgb + ';--scoreaxis-panel-alpha:' + surface.alpha + '}'
      + 'html,body{margin:0;padding:0;background:transparent;overflow:hidden;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.5) transparent;}'
      + '*{box-sizing:border-box;}'
      + '.scoreaxis-widget,.scoreaxis-inner-widget{background-color:rgba(var(--scoreaxis-panel-rgb),var(--scoreaxis-panel-alpha))!important;}'
      + '.scoreaxis-inner-widget table,.scoreaxis-inner-widget thead,.scoreaxis-inner-widget tbody,.scoreaxis-inner-widget tr,.scoreaxis-inner-widget th,.scoreaxis-inner-widget td{background-color:transparent!important;}'
      + '::-webkit-scrollbar{width:7px;height:7px;}'
      + '::-webkit-scrollbar-track{background:transparent;}'
      + '::-webkit-scrollbar-thumb{background:rgba(148,163,184,.45);border-radius:999px;border:2px solid #0b1220;}'
      + '::-webkit-scrollbar-thumb:hover{background:rgba(203,213,225,.62);}';
  }

  const ROW_DENSITY = '1';
  /**
   * embed 코드 내 ScoreAxis script src에 rowDensity 파라미터를 주입해 반환한다.
   * @param {string} embedCode - 원본 embed HTML 코드 문자열.
   * @returns {string} rowDensity가 주입된 embed HTML 코드 문자열.
   */
  function applyRuntimeEmbedParams(embedCode) {
    const raw = String(embedCode || '').trim();
    if (!raw) return raw;
    try {
      const template = document.createElement('template');
      template.innerHTML = raw;
      const script = template.content.querySelector('script[src*="widgets.scoreaxis.com/api/football/league-table"]');
      if (!script) return raw;
      const url = new URL(script.getAttribute('src'), window.location.href);
      url.searchParams.set('rowDensity', ROW_DENSITY);
      script.setAttribute('src', url.toString());
      return template.innerHTML;
    } catch (err) {
      return raw;
    }
  }
  /**
   * 패널 표면 CSS를 포함한 완전한 iframe srcdoc HTML 문자열을 생성한다.
   * @param {string} embedCode - rowDensity가 주입된 embed HTML 코드 문자열.
   * @returns {string} srcdoc에 삽입할 완전한 HTML 문자열.
   */
  function buildIframeSrcdoc(embedCode) {
    const surface = getPanelSurfaceVars();
    const frameCss = '<style>' + buildFrameCss(surface) + '</style>';
    return '<!doctype html><html><head><meta charset="utf-8">'
      + frameCss
      + '</head><body>'
      + embedCode
      + '</body></html>';
  }

  /**
   * 로드된 iframe 내부 문서에 CSS 변수 오버라이드 style 태그를 주입한다.
   * cross-origin 예외는 무시한다.
   * @param {HTMLIFrameElement} frame - 대상 iframe 엘리먼트.
   */
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
      }
      style.textContent = buildFrameCss(surface);
      doc.head.appendChild(style);
    } catch (err) {}
  }

  /** 모든 .scoreaxis-standings-frame iframe에 CSS 변수를 일괄 동기화한다. */
  function syncAllFrameSurfaces() {
    document.querySelectorAll('.scoreaxis-standings-frame').forEach(installFrameOverrides);
  }

  /**
   * CSS 변수 변경을 감지하는 MutationObserver를 등록한다. 최초 1회만 등록된다.
   * documentElement의 style 속성 변경 시 syncAllFrameSurfaces를 호출한다.
   */
  function ensurePanelSurfaceObserver() {
    if (panelSurfaceObserver || !window.MutationObserver) return;
    panelSurfaceObserver = new MutationObserver(syncAllFrameSurfaces);
    panelSurfaceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }
  /**
   * iframe 내부 컨텐츠 높이를 픽셀 단위로 읽어 반환한다. cross-origin 예외 시 0을 반환한다.
   * @param {HTMLIFrameElement} frame - 높이를 측정할 iframe 엘리먼트.
   * @returns {number} 컨텐츠 높이(px). 접근 불가 시 0.
   */
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

  /**
   * iframe 높이를 내부 컨텐츠 크기에 맞게 조정한다. 80px 미만이면 조정하지 않는다.
   * @param {HTMLIFrameElement} frame - 높이를 조정할 iframe 엘리먼트.
   */
  function resizeFrameToContent(frame) {
    const height = getFrameContentHeight(frame);
    if (height > 80) frame.style.height = `${height}px`;
  }

  /**
   * load 이벤트/ResizeObserver/주기적 타이머로 iframe 높이를 컨텐츠에 맞게 자동 추적한다.
   * @param {HTMLIFrameElement} frame - 높이 자동 추적을 설정할 iframe 엘리먼트.
   */
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

  /**
   * embed 항목 하나를 iframe 엘리먼트로 생성해 반환한다.
   * @param {object} entry - ScoreAxis embed 항목 객체 ({ country, scoreaxisLeagueName, embedCode }).
   * @returns {HTMLIFrameElement|Text} 생성된 iframe 엘리먼트. embedCode가 없으면 빈 텍스트 노드.
   */
  function materializeEmbed(entry) {
    const rawEmbedCode = String(entry?.embedCode || '').trim();
    const embedCode = applyRuntimeEmbedParams(rawEmbedCode);
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
  /**
   * 순위표 항목의 country와 leagueName을 표시하는 레이블 엘리먼트를 생성한다.
   * @param {object} entry - ScoreAxis embed 항목 객체 ({ country, scoreaxisLeagueName }).
   * @returns {HTMLDivElement} 레이블 엘리먼트.
   */
  function createEntryLabel(entry) {
    const label = document.createElement('div');
    label.className = 'scoreaxis-standings-entry-label';
    label.textContent = [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' \u00B7 ');
    return label;
  }

  /**
   * 컨테이너가 순위표 팝업 모달 안에 있는지 판별한다.
   * @param {HTMLElement} container - 확인할 컨테이너 엘리먼트.
   * @returns {boolean} 팝업 안이면 true.
   */
  function isPopupContainer(container) {
    return !!container?.closest?.(`#${POPUP_BACKDROP_ID}`);
  }

  /**
   * 순위표 팝업 모달 DOM을 생성하거나 기존 것을 재사용해 반환한다.
   * @returns {{ backdrop: HTMLElement, panel: HTMLElement, meta: HTMLElement }} 팝업 구성 엘리먼트.
   */
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

  /**
   * embed 항목 목록을 "country · leagueName / ..." 형태의 표시용 문자열로 변환한다.
   * @param {Array} embeds - ScoreAxis embed 항목 배열.
   * @returns {string} 표시용 문자열.
   */
  function describeEmbeds(embeds) {
    return embeds.map(entry => [entry.country, entry.scoreaxisLeagueName].filter(Boolean).join(' \u00B7 ')).join(' / ');
  }

  /**
   * fixtureData의 리그명과 라운드 정보를 팝업 메타 텍스트로 변환한다.
   * 정보가 없으면 fallbackEmbeds를 describeEmbeds로 변환해 반환한다.
   * @param {object} fixtureData - FixtureResponseDto 형태의 경기 데이터.
   * @param {Array} [fallbackEmbeds=[]] - 리그명 정보가 없을 때 사용할 embed 배열.
   * @returns {string} 팝업 메타 텍스트.
   */
  function describeFixtureLeague(fixtureData, fallbackEmbeds = []) {
    const matchInfo = fixtureData?.matchInfo || {};
    const leagueName = String(matchInfo.leagueName || matchInfo.league?.name || '').trim();
    const round = String(matchInfo.leagueRound || matchInfo.round || '').trim();
    const parts = [leagueName, round].filter(Boolean);
    if (parts.length) return parts.join(' \u00B7 ');
    return describeEmbeds(fallbackEmbeds);
  }
  /**
   * 순위표 전체화면 팝업을 열고 embed 패널을 렌더한다. window에 노출됨.
   * @param {object} [fixtureData] - 렌더할 경기 데이터. 생략 시 현재 state.fixtureData 사용.
   * @returns {boolean} embed가 없으면 false, 열리면 true.
   */
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

  /** 순위표 팝업을 닫고 팝업 패널 내용을 비운다. window에 노출됨. */
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

  /**
   * 캠 큰 lp-stat 상단 순위표 팝업 버튼의 가시성과 상태를 갱신한다. window에 노출됨.
   * @param {object} [fixtureData] - embed 존재 여부 판별에 사용할 경기 데이터.
   */
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

  /**
   * 컨테이너가 현재 활성 .page 탭 안에 있는지 확인한다.
   * @param {HTMLElement} container - 확인할 컨테이너 엘리먼트.
   * @returns {boolean} 활성 페이지 안이거나 .page 조상이 없으면 true.
   */
  function isInActivePage(container) {
    const page = container.closest?.('.page');
    return !page || page.classList.contains('active');
  }

  /**
   * 이 컨테이너에 순위표를 렌더해야 하는지 판별한다.
   * 팝업이면 popupOpen 상태, lp-events-s이면 smallMode='standings' 상태일 때만 true.
   * @param {HTMLElement} container - 판별할 컨테이너 엘리먼트.
   * @returns {boolean} 렌더해야 하면 true.
   */
  function shouldRenderContainer(container) {
    if (isPopupContainer(container)) return state.popupOpen;
    if (!isInActivePage(container)) return false;
    if (container.closest?.('.lp-events-s')) return state.smallMode === 'standings';
    return false;
  }
  /**
   * 컨테이너에 빈 상태 메시지 DOM 노드를 삽입한다.
   * @param {HTMLElement} container - 메시지를 삽입할 컨테이너 엘리먼트.
   * @param {string} message - 표시할 텍스트 메시지.
   */
  function renderEmpty(container, message) {
    const empty = document.createElement('div');
    empty.className = 'scoreaxis-standings-empty ev-empty';
    empty.textContent = message;
    container.replaceChildren(empty);
  }

  /**
   * 순위표 패널 타이틀 바와 embed iframe 목록을 컨테이너에 렌더한다.
   * renderKey가 같고 options.force가 없으면 중복 렌더를 건너뛴다.
   * @param {HTMLElement} container - 렌더할 컨테이너 엘리먼트.
   * @param {object} fixtureData - 현재 경기 데이터.
   * @param {Array} embeds - ScoreAxis embed 항목 배열.
   * @param {number} panelIndex - 컨테이너 인덱스 (querySelectorAll 순서).
   * @param {object} [options={}] - { force: true }로 renderKey 캐시를 무시할 수 있다.
   */
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

  /**
   * 현재 경기의 리그 ID로 ScoreAxis 순위표 embed 항목을 조회해
   * 모든 data-scoreaxis-standings-panel 컨테이너에 iframe을 렌더하거나 초기화한다.
   * window에 노출됨.
   * @param {object} fixtureData - 백엔드 FixtureResponseDto 형태의 경기 데이터.
   * @param {object} [options={}] - { force: true }로 renderKey 캐시를 무시할 수 있다.
   */
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

  /**
   * 캠 작은 이벤트 패널이 표시 중이지만 내용이 비어있을 때 applyEventsPanel을 호출해 재렌더한다.
   * standings 모드이거나 HTH 모드이면 아무것도 하지 않는다.
   */
  function restoreSmallEventsPanelIfNeeded() {
    if (restoringSmallEventsPanel || state.smallMode === 'standings' || window._hthState?.mode === 'hth') return;
    if (typeof window.applyEventsPanel !== 'function') return;
    const data = window._eventsLastData || state.fixtureData;
    if (!data) return;
    const needsRender = Array.from(document.querySelectorAll(SMALL_EVENTS_SELECTOR)).some(el => {
      if (el.style.display === 'none') return false;
      return !el.querySelector('.ev-list,.ev-empty');
    });
    if (!needsRender) return;
    restoringSmallEventsPanel = true;
    try {
      window.applyEventsPanel(data, { animate: false });
    } finally {
      restoringSmallEventsPanel = false;
    }
  }

  /**
   * 탭 복귀 시 캠 작은 순위표 패널이 비어있으면 renderPanel을 호출해 재마운트한다.
   * embed가 없으면 smallMode를 'events'로 되돌린다.
   */
  function restoreSmallStandingsPanelIfNeeded() {
    if (state.smallMode !== 'standings') return;
    const data = state.fixtureData || window._eventsLastData;
    const embeds = getEmbeds(data);
    if (!data || !embeds.length) {
      state.smallMode = 'events';
      scoreaxisStandingsUpdateSmallVisibility();
      return;
    }
    document.querySelectorAll(SMALL_PANEL_SELECTOR).forEach((el, index) => {
      if (el.style.display === 'none') return;
      if (el.querySelector('.scoreaxis-standings-list')) return;
      renderPanel(el, data, embeds, index, { force: true });
    });
  }

  /**
   * smallMode에 따라 이벤트/순위표/HTH 패널의 display 상태를 전환한다. window에 노출됨.
   * standings 모드이면 순위표 패널 표시 + 이벤트/HTH 숨김.
   * 그 외에는 HTH 상태에 따라 이벤트/HTH 패널만 전환한다.
   */
  function scoreaxisStandingsUpdateSmallVisibility() {
    const isStandings = state.smallMode === 'standings';
    document.querySelectorAll(SMALL_PANEL_SELECTOR).forEach(el => {
      el.style.display = isStandings ? '' : 'none';
    });

    if (isStandings) {
      document.querySelectorAll(SMALL_EVENTS_SELECTOR).forEach(el => { el.style.display = 'none'; });
      document.querySelectorAll(SMALL_HTH_SELECTOR).forEach(el => { el.style.display = 'none'; });
      requestAnimationFrame(restoreSmallStandingsPanelIfNeeded);
      return;
    }

    const isHth = window._hthState?.mode === 'hth';
    document.querySelectorAll(SMALL_EVENTS_SELECTOR).forEach(el => {
      el.style.display = isHth ? 'none' : '';
    });
    document.querySelectorAll(SMALL_HTH_SELECTOR).forEach(el => {
      el.style.display = isHth ? '' : 'none';
    });
    requestAnimationFrame(restoreSmallEventsPanelIfNeeded);
  }

  /**
   * 현재 fixture로 순위표 패널을 활성화한다. embed가 없으면 false를 반환한다. window에 노출됨.
   * @param {object} [fixtureData] - 순위표를 표시할 경기 데이터.
   * @returns {boolean} 활성화 성공 여부.
   */
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

  /** 이벤트 패널로 전환한다. HTH 모드도 함께 events로 복귀시킨다. window에 노출됨. */
  function scoreaxisStandingsShowEvents() {
    state.smallMode = 'events';
    scoreaxisStandingsUpdateSmallVisibility();
    if (typeof window.hthSetMode === 'function') window.hthSetMode('events');
  }

  /**
   * 캠 작은 순위표 패널을 숨기고 이벤트 패널로 전환한다. window에 노출됨.
   * @param {object} [options={}] - { skipHthUpdate: true }로 HTH 가시성 갱신을 건너뛸 수 있다.
   */
  function scoreaxisStandingsHideSmall(options = {}) {
    state.smallMode = 'events';
    scoreaxisStandingsUpdateSmallVisibility();
    if (!options.skipHthUpdate) window.hthUpdateVisibility?.();
  }

  /**
   * 모든 순위표 패널을 초기화하고 state를 기본값으로 되돌린다. window에 노출됨.
   * 팝업이 열려 있으면 닫고, 팝업 버튼도 숨긴다.
   */
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

  window.addEventListener('pageshow', () => {
    requestAnimationFrame(scoreaxisStandingsUpdateSmallVisibility);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimationFrame(scoreaxisStandingsUpdateSmallVisibility);
  });
}());
