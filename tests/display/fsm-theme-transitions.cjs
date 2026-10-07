const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const themes = { default: 'default', pl: 'EPL', cl: 'CL', uel: 'UEL', acle: 'ACLE', unl: 'UNL', er24: 'EURO24', ligue1: 'LIGUE1', seriea: 'SERIEA', kleague: 'KLEAGUE', wc26: 'WC26' };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    await page.evaluate(() => { state.homeName='맨체스터 시티'; state.awayName='선덜랜드'; render(); fsmBoardRender(); });
    await page.evaluate(() => document.fonts.ready);
    const failures = [];
    for (const [theme, file] of Object.entries(themes)) {
      // Compare the original theme declarations; widths deliberately follow current layout.
      const oldCss = execFileSync('git', ['show', `5d791aa:css/theme/result_style_${file}.css`], { cwd: root, encoding: 'utf8' });
      const originalTransitions = [...oldCss.matchAll(/([^{}]+)\{[^{}]*transition:\s*([^;]+);[^{}]*\}/g)].map(match => match[1].trim());
      for (const source of ['default', 'pl', 'wc26']) {
        if (source === theme) continue;
        await page.evaluate(source => { document.querySelector('#board').classList.add('fsm-starting'); applyTheme(source, null); fsmBoardRender(); }, source);
        await page.waitForFunction(() => !pendingThemeLink && !document.querySelector('.fsm-starting'));
        await page.evaluate(() => { document.querySelector('#board').classList.remove('fsm-entering'); state.homeScore = 5; state.awayScore = 3; render(); });
        await page.evaluate(theme => applyTheme(theme, null), theme);
        await page.waitForFunction(theme => !pendingThemeLink && document.querySelector('#board').dataset.fsmTheme === theme, theme);
        // Font loading can legitimately change measured glyph widths; audit CSS transitions after fonts settle.
        await page.evaluate(async () => { await document.fonts.ready; fsmBoardRender(); });
        const metrics = await page.evaluate(() => {
          const main = document.querySelector('.scoreboard-main');
          const width = main.offsetWidth;
          const nodes = [...document.querySelectorAll('.team-score, .score-div, .team-logo, .time, .extra-time')];
          return { width, names: [...document.querySelectorAll('.team-name .text')].map(n => ({ text:n.textContent, width:n.scrollWidth, font:getComputedStyle(n).font, animations:n.parentElement.getAnimations().map(a=>a.transitionProperty) })), nodes: nodes.map(node => { const style = getComputedStyle(node); return {
            selector: node.className, background: style.backgroundColor,
            transition: style.transitionProperty, radius: style.borderTopLeftRadius
          }; }) };
        });
        if (source === 'default') await page.screenshot({ path: `tests/display/transition-${theme}-middle.png` });
        await page.waitForTimeout(theme === 'pl' ? 450 : 950);
        const final = await page.evaluate(() => ({ width: document.querySelector('.scoreboard-main').offsetWidth, names:[...document.querySelectorAll('.team-name .text')].map(n=>({text:n.textContent,width:n.scrollWidth,font:getComputedStyle(n).font,animations:n.parentElement.getAnimations().map(a=>a.transitionProperty)})),
          backgrounds: [...document.querySelectorAll('.team-score, .score-div, .team-logo, .time, .extra-time')].map(node => getComputedStyle(node).backgroundColor) }));
        metrics.nodes.forEach((node, index) => {
          if (final.backgrounds[index] === 'rgba(0, 0, 0, 0)' && node.background !== final.backgrounds[index]) failures.push(`${source}->${theme}: stale ${node.selector} background ${node.background}`);
          if (!node.transition.includes('border-radius')) failures.push(`${source}->${theme}: missing ${node.selector} border-radius transition`);
        });
        if(metrics.width !== final.width) failures.push(`${source}->${theme}: width moved ${metrics.width}->${final.width} ${JSON.stringify({before:metrics.names,after:final.names})}`);
      }
      console.log('AUDIT', theme, 'original animated selectors:', originalTransitions.join(', '));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    console.log('PASS all 30 source/target pairs: transparent backgrounds, corner effects and stable widths');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
