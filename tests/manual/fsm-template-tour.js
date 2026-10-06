// 이 파일 전체를 대시보드 콘솔에 붙여 넣은 뒤 실행하세요:
// fsmTemplateTour(5)       // 테마당 표시 시간(초), 총 11개 테마
// fsmTemplateTour.stop()  // 중지하고 원래 테마로 복원
(() => {
  if (window.fsmTemplateTour?.running) {
    console.warn('Stop the existing tour before loading this script again.');
    return;
  }
  let controller = null;
  const themes = [
    ['default', 'Default / friendly', 'club'],
    ['pl', 'Premier League', 'club'],
    ['cl', 'Champions League', 'club'],
    ['uel', 'Europa League', 'club'],
    ['acle', 'AFC Champions League Elite', 'club'],
    ['unl', 'UEFA Nations League', 'national'],
    ['er24', 'EURO', 'national'],
    ['ligue1', 'Ligue 1', 'club'],
    ['seriea', 'Serie A', 'club'],
    ['kleague', 'K League', 'club'],
    ['wc26', 'World Cup', 'national'],
  ];
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Tour stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
  async function waitForTheme(href, signal) {
    const deadline = Date.now() + 10000;
    while (pendingThemeLink || document.getElementById('fsm-theme-link')?.href !== href) {
      if (Date.now() > deadline) throw new Error('Theme did not load: ' + href);
      await sleep(50, signal);
    }
    await document.fonts.ready;
    window.fsmBoardRender();
  }
  async function tour(seconds = 5) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Seconds must be positive.');
    if (controller) throw new Error('A tour is already running. Use fsmTemplateTour.stop().');
    if (typeof applyTheme !== 'function' || typeof window.fsmBoardRender !== 'function') {
      throw new Error('Open the FSM dashboard before running this script.');
    }
    controller = new AbortController();
    tour.running = true;
    const signal = controller.signal;
    const saved = {
      theme: _currentTheme, type: _currentType,
      href: document.getElementById('fsm-theme-link').href,
      logos: Array.from(document.querySelectorAll('.fsm-board .epl-lion'))
        .map(element => [element, element.getAttribute('src')]),
    };
    try {
      for (const [index, [theme, label, type]] of themes.entries()) {
        if (signal.aborted) break;
        const entry = Object.values(LEAGUE_THEME_MAP).find(item => item.theme === theme);
        _currentType = type;
        applyTheme(theme, entry?.logoUrl || state.leagueLogoUrl || null);
        const href = pendingThemeLink?.href || document.getElementById('fsm-theme-link').href;
        await waitForTheme(href, signal);
        if (signal.aborted) break;
        console.log(`[FSM ${index + 1}/${themes.length}] ${label} - ${seconds}s`);
        await sleep(seconds * 1000, signal);
      }
    } catch (error) {
      if (error.name !== 'AbortError') console.error('FSM tour failed:', error);
    } finally {
      try {
        _currentTheme = saved.theme;
        _currentType = saved.type;
        changeCSS(saved.href);
        saved.logos.forEach(([element, src]) => {
          if (src === null) element.removeAttribute('src');
          else element.setAttribute('src', src);
        });
        await waitForTheme(saved.href);
        console.log('[FSM] Original theme restored.');
      } finally {
        controller = null;
        tour.running = false;
      }
    }
  }
  tour.stop = () => controller?.abort();
  tour.running = false;
  window.fsmTemplateTour = tour;
  console.log('Ready: fsmTemplateTour(5). Stop: fsmTemplateTour.stop().');
})();
