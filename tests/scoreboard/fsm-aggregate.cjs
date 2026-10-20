const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const themes = await page.evaluate(() => Object.keys(FSM_THEMES));
    const nativeBaselines = new Map();
    // 승인한 리그 포맷 목록을 고정해 클럽 전체로 지원 범위가 넓어지는 회귀를 막습니다.
    const supportedThemes = new Set([
      'cypriotfirstdivision', 'default', 'cl', 'uel', 'uecl', 'acle', 'acl2', 'acgl', 'russiancup', 'tff1lig', 'turkishcup',
      'allsvenskan', 'scottishcup', 'spfl', 'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'nationalleague', 'laliga2',
      'bundes', 'bundes2', 'eliteserien', 'ligue1', 'ligue2', 'serieb', 'greecesuperleague', 'swisssuperleague', 'ligaportugal', 'eredivisie',
      'rpl', 'serbia', 'kazakh', 'azerbaijan', 'fnl', 'fnl2a', 'czech', 'romanian', 'belarus', 'kleague', 'jleague', 'unl', 'cnl', 'aleague', 'uzbek', 'ukrainian', 'saudi', 'chinesesuperleague', 'saudikingscup', 'brazilseriea',
      'libertadores', 'sudamericana', 'recopa', 'cafcl', 'cafcc', 'concacafcc', 'facup', 'carabao', 'coppaitalia', 'coupedefrance', 'cdr', 'korcup'
    ]);
    for (const theme of themes) {
      await page.evaluate(theme => {
        state.fsmTheme = theme;
        state.homeName = 'Borussia Monchengladbach'; state.awayName = 'Spartak Moscow';
        state.homeScore = 2; state.awayScore = 1;
        state.aggHomeBase = 1; state.aggAwayBase = 3;
        autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { state.aggEnabled = false; state.boardScale = 100; render(); fsmBoardRender(); });
      const baseline = await page.evaluate(() => {
        const main = document.querySelector('.scoreboard-main'), rect = main.getBoundingClientRect();
        const scale = rect.width / main.offsetWidth, center = rect.left + rect.width / 2;
        const boxes = ['#team-score-left', '.score-div', '#team-score-right'].map(selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { x: (r.left - center) / scale, width: r.width / scale, y: (r.top - rect.top) / scale };
        });
        const card = document.getElementById('homeCard').getBoundingClientRect();
        return { boxes, overlap: (card.right - document.querySelector('#team-score-left').getBoundingClientRect().left) / scale };
      });
      nativeBaselines.set(theme, baseline);
      for (const scale of [60, 100, 150]) {
        for (const enabled of [true, false]) {
          await page.evaluate(({ scale, enabled }) => {
            state.boardScale = scale; state.aggEnabled = enabled; render(); fsmBoardRender();
          }, { scale, enabled });
          await settle(page);
          const m = await page.evaluate(() => {
            const totals = [...document.querySelectorAll('.total-score')];
            const scores = [...document.querySelectorAll('.team-score')];
            const main = document.querySelector('.scoreboard-main'), mainRect = main.getBoundingClientRect();
            const boardScale = mainRect.width / main.offsetWidth, center = mainRect.left + mainRect.width / 2;
            const nativeBoxes = ['#team-score-left', '.score-div', '#team-score-right'].map(selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { x: (r.left - center) / boardScale, width: r.width / boardScale, y: (r.top - mainRect.top) / boardScale };
            });
            const central = ['#team-score-left', '#totalScoreLeft', '.score-div', '#totalScoreRight', '#team-score-right']
              .map(selector => {
                const node = document.querySelector(selector), box = node.closest('.total-score') || node;
                const rect = box.getBoundingClientRect(), style = getComputedStyle(box);
                return { left: rect.left, right: rect.right, width: box.offsetWidth, transform: style.transform,
                  fontSize: parseFloat(style.fontSize), background: style.backgroundImage };
              });
            return {
              nativeBoxes,
              overlap: (document.getElementById('homeCard').getBoundingClientRect().right - totals[0].getBoundingClientRect().left) / boardScale,
              smallNumbersFit: totals.every(node => {
                const r = node.querySelector('.total').getBoundingClientRect();
                return r.top >= mainRect.top - .2 && r.bottom <= mainRect.bottom + .2;
              }),
              central,
              radius: parseFloat(getComputedStyle(document.querySelector('.fsm-board')).getPropertyValue('--cnl-radius')),
              visible: totals.map(node => getComputedStyle(node).display !== 'none'),
              values: totals.map(node => node.textContent.trim()),
              colors: totals.map(node => {
                const style = getComputedStyle(node), before = getComputedStyle(node, '::before');
                return [style.backgroundColor === 'rgba(0, 0, 0, 0)' && before.content !== 'none' ? before.backgroundColor : style.backgroundColor, style.color];
              }),
              timerColors: (() => { const style = getComputedStyle(document.querySelector('.time')); return [style.backgroundColor, style.color]; })(),
              boxes: totals.map((node, i) => {
                const r = node.getBoundingClientRect(), score = scores[i].getBoundingClientRect();
                // 기울어진 점수 칸의 사선 끝은 겹칠 수 있지만 숫자 중심은 서로 침범하지 않아야 합니다.
                const center = r.left + r.width / 2, scoreCenter = score.left + score.width / 2;
                return { width: r.width, height: r.height, separate: (center < score.left || center > score.right) && (scoreCenter < r.left || scoreCenter > r.right),
                  visible: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).some(hit => node.contains(hit)) };
              }),
              fits: [...document.querySelectorAll('.team-name')].every(node => {
                const text = node.querySelector('.text'), style = getComputedStyle(node);
                return text.scrollWidth <= node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1;
              })
            };
          });
          const context = JSON.stringify({ theme, scale, enabled, m });
          const shouldShow = enabled && supportedThemes.has(theme);
          assert.deepEqual(m.visible, [shouldShow, shouldShow], context);
          if (shouldShow) {
            if (['rpl', 'ligaportugal', 'romanian'].includes(theme)) {
              m.nativeBoxes.forEach((box, i) => ['x', 'width', 'y'].forEach(key => assert(Math.abs(box[key] - baseline.boxes[i][key]) < .2, context)));
              assert(Math.abs(m.overlap - baseline.overlap) < .2, context);
            }
            if (theme === 'czech') {
              assert(Math.abs(m.nativeBoxes[1].x - baseline.boxes[1].x) < .2, context);
              const ends = await page.evaluate(() => ['#team-logo-left', '#homeCard', '#awayCard', '#team-logo-right'].map(selector => {
                const r = document.querySelector(selector).getBoundingClientRect();
                return { left: r.left, right: r.right };
              }));
              assert(ends[0].right <= ends[1].left + .2 && ends[2].right <= ends[3].left + .2, context);
            }
            if (theme === 'romanian') assert(m.smallNumbersFit, context);
            assert.deepEqual(m.values, ['3', '4'], context);
            if (theme.startsWith('efl')) m.colors.forEach(colors => assert.deepEqual(colors, m.timerColors, context));
            const expectedColors = {
              ligue1: ['rgb(8, 95, 255)', 'rgb(255, 255, 255)'],
              ligue2: ['rgb(0, 252, 208)', 'rgb(0, 0, 0)'],
              rpl: ['rgb(14, 42, 92)', 'rgb(255, 255, 255)'],
              fnl: ['rgb(0, 0, 0)', 'rgb(0, 199, 178)'],
              czech: ['rgb(255, 255, 255)', 'rgb(24, 30, 115)'],
              romanian: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'],
              belarus: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']
            }[theme];
            if (expectedColors) m.colors.forEach(colors => assert.deepEqual(colors, expectedColors, context));
            if (['ligaportugal', 'czech', 'cnl', 'jleague'].includes(theme)) {
              const ordered = theme === 'czech' ? m.central : [m.central[1], m.central[0], m.central[2], m.central[4], m.central[3]];
              for (let i = 0; i < ordered.length - 1; i++) assert(ordered[i].right <= ordered[i + 1].right && ordered[i + 1].left <= ordered[i].right + .2, context);
            }
            if (theme === 'cnl') {
              assert(Math.abs(m.radius - m.central.reduce((sum, box) => sum + box.width, 0) / 2) < .1, context);
              assert(m.central[1].fontSize < m.central[0].fontSize, context);
              assert.equal(m.central[1].background, m.central[0].background, context);
            }
            if (theme === 'kleague') {
              assert.equal(m.central[1].transform, m.central[0].transform, context);
              assert.equal(m.central[3].transform, m.central[4].transform, context);
            }
            if (['romanian', 'belarus'].includes(theme)) assert(m.central[1].fontSize < m.central[0].fontSize, context);
            assert(m.boxes.every(box => box.width > 0 && box.height > 0 && box.separate && box.visible), context);
            if (scale === 100) await page.locator('#boardStageInner').screenshot({ path: path.resolve(`screenshots/tests/aggregate-${theme}.png`) });
          }
          assert(m.fits, context);
        }
      }
      console.log('PASS aggregate visibility, totals, separation and name fit:', theme);
    }
    for (const theme of ['bundes', 'eredivisie', 'rpl', 'eflchampionship', 'eflleagueone', 'eflleaguetwo', 'czech', 'ligaportugal', 'romanian', 'cnl']) {
      await page.evaluate(theme => {
        state.fsmTheme = theme; state.boardScale = 100; state.aggEnabled = true;
        state.aggHomeBase = 100; autoApplyTemplateByLeagueId(39, null); render();
      }, theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.evaluate(() => fsmBoardRender());
      assert.equal(await page.locator('#totalScoreLeft').textContent(), '102');
      assert(await page.locator('.total-score').evaluateAll(nodes => nodes[0].offsetWidth === nodes[1].offsetWidth));
      if (['rpl', 'ligaportugal', 'romanian'].includes(theme)) {
        const boxes = await page.evaluate(() => {
          const main = document.querySelector('.scoreboard-main'), rect = main.getBoundingClientRect();
          const scale = rect.width / main.offsetWidth, center = rect.left + rect.width / 2;
          return ['#team-score-left', '.score-div', '#team-score-right'].map(selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: (r.left - center) / scale, width: r.width / scale, y: (r.top - rect.top) / scale };
          });
        });
        boxes.forEach((box, i) => ['x', 'width', 'y'].forEach(key => assert(Math.abs(box[key] - nativeBaselines.get(theme).boxes[i][key]) < .2, `${theme} asymmetric aggregate: ${JSON.stringify(boxes)}`)));
      }
      await page.locator('#boardStageInner').screenshot({ path: path.resolve(`screenshots/tests/aggregate-${theme}-large.png`) });
    }
    // UNL의 장식 이미지는 다른 모든 테마로 전환할 때 원래 팀 로고로 돌아와야 합니다.
    for (const theme of themes.filter(theme => theme !== 'unl')) {
      await page.evaluate(() => applyTheme('unl', null));
      await page.waitForFunction(() => !pendingThemeLink);
      assert.equal(await page.locator('#homeLogo').getAttribute('src'), 'resources/imgs/UNL_shape.png');
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      assert(await page.evaluate(() => document.getElementById('homeLogo').getAttribute('src') === (state.homeLogo || null)), theme);
      assert.equal(await page.locator('#homeLogo').evaluate(node => node.style.filter), '');
    }
    assert.deepEqual(errors, []);
    console.log('PASS UNL decoration and logo restoration for every theme');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
