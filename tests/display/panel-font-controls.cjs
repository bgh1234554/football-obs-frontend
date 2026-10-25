const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1920, height: 1080 }, dpr: 1, platform: 'Win32' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const data = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/1637598-lineup.json'), 'utf8'));
    data.homeLineup.formation = '3-4-3';
    data.events = [{ type: 'Card', detail: 'Yellow Card', elapsed: 10, side: 'home', playerId: 1, playerName: '선수' }];
    data.homeInjuries = [{ playerId: 1, playerName: '부상 선수', reason: 'Injury' }];
    data.awayInjuries = [];
    data.teamStats = [{ side: 'home', totalShots: 4 }, { side: 'away', totalShots: 2 }];
    await page.evaluate(async data => {
      clearPolling();
      setSetting('statCycleAuto', 'off');
      fetchFixture = async () => structuredClone(data);
      await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true });
      clearPolling(); activatePage('main-small');
    }, data);
    const popup = page.getByRole('dialog', { name: '패널 글자 크기' });
    const slider = popup.getByRole('slider', { name: '글자 크기' });
    const change = async value => slider.evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    const close = async () => page.mouse.click(page.viewportSize().width - 6, 8);
    // 대시보드 전체화면 기본값과 직접 조정한 값은 일반 화면과 분리해서 저장한다.
    await page.evaluate(() => document.documentElement.requestFullscreen());
    await settle(page);
    assert.deepEqual(await page.evaluate(() => ['lineupNameSize', 'benchInjuryNameSize'].map(getSetting)), [16, 14]);
    await page.locator('#benchPanel [data-panel-font]').first().click();
    await change(18);
    await popup.locator('.panel-font-reset').click();
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 14);
    await close();
    await page.evaluate(() => { setSetting('lineupNameSize', 19); setSetting('benchInjuryNameSize', 17); });
    await page.reload();
    await settle(page);
    await page.evaluate(() => activatePage('main-small'));
    assert.deepEqual(await page.evaluate(() => ['lineupNameSize', 'benchInjuryNameSize'].map(getSetting)), [19, 17]);
    await page.evaluate(() => { resetSettingsToDefaults(); clearPolling(); });
    assert.deepEqual(await page.evaluate(() => ['lineupNameSize', 'benchInjuryNameSize'].map(getSetting)), [16, 14]);
    await page.evaluate(() => document.fullscreenElement ? document.exitFullscreen() : undefined);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight + 100 });
      window.dispatchEvent(new Event('resize'));
    });
    await settle(page);
    assert.deepEqual(await page.evaluate(() => ['lineupNameSize', 'benchInjuryNameSize'].map(getSetting)), [12, 13]);
    await page.evaluate(() => {
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight });
      window.dispatchEvent(new Event('resize'));
    });
    assert.deepEqual(await page.evaluate(() => ['--lp-name-base-size', '--dp-item-name-size'].map(key => document.documentElement.style.getPropertyValue(key))), ['16px', '14px']);
    await page.evaluate(() => {
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight + 100 });
      setSetting('lineupNameSize', 18);
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight });
    });
    assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 18);
    await page.evaluate(() => {
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight + 100 });
      resetSettingsToDefaults();
      window.dispatchEvent(new Event('resize'));
    });
    await page.evaluate(async data => {
      setSetting('statCycleAuto', 'off');
      fetchFixture = async () => structuredClone(data);
      await fetchAndApplyFixtureData(data.matchInfo.fixtureId, { silent: true });
      clearPolling(); activatePage('main-small');
    }, data);
    // 선수명 크기와 라벨·아이콘의 배율이 함께 바뀌어야 한다.
    const eventMetrics = () => page.locator('.lp-events-s .ev-row:has(.ev-icon)').first().evaluate(row => {
      const font = selector => parseFloat(getComputedStyle(row.querySelector(selector)).fontSize);
      const icon = row.querySelector('.ev-icon > .football-icon').getBoundingClientRect();
      return { label: font('.ev-label'), time: font('.ev-time'), iconWidth: icon.width, iconHeight: icon.height };
    });
    const baseSize = await page.evaluate(() => getSetting('eventNameSize'));
    const baseMetrics = await eventMetrics();
    await page.locator('.lp-events-s .ev-title').click();
    const largerSize = Number(await slider.getAttribute('max'));
    await change(largerSize);
    const largerMetrics = await eventMetrics();
    for (const key of Object.keys(baseMetrics)) {
      assert(Math.abs(largerMetrics[key] / baseMetrics[key] - largerSize / baseSize) < 0.02, `${key} follows event font scale`);
    }
    await popup.getByRole('button', { name: '초기화', exact: true }).click();
    await close();
    for (const [selector, category] of [
      ['.lp-events-s .ev-title', 'eventNameSize'],
      ['.lp-stat-s .st-title-bar', 'statsNameSize'],
      ['#benchPanel .dp-title', 'benchInjuryNameSize'],
      ['#injuryPanel .dp-title', 'benchInjuryNameSize'],
    ]) {
      await page.locator(selector).click();
      assert(await popup.isVisible(), selector);
      const nameSetting = category === 'benchInjuryNameSize' ? 'roster' : category === 'eventNameSize' ? 'event' : null;
      if (nameSetting) {
        assert.equal(await popup.locator('.sp-label-sub').count(), 0);
        const toggle = popup.locator(`input[data-settings-cat="${nameSetting}"]`);
        const before = await toggle.isChecked();
        await toggle.locator('..').click();
        assert.equal(await page.locator(`#settingsBackdrop input[data-settings-cat="${nameSetting}"]`).isChecked(), !before);
        await page.evaluate(({ category, before }) => setSetting(category, before ? getSwitchSides(category).on : getSwitchSides(category).off), { category: nameSetting, before });
        assert.equal(await toggle.isChecked(), before);
      }
      const range = page.locator(`input[data-settings-slider="${category}"]`);
      assert.equal(await slider.getAttribute('min'), await range.getAttribute('min'));
      assert.equal(await slider.getAttribute('max'), await range.getAttribute('max'));
      const before = Number(await slider.inputValue());
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await range.inputValue(), String(before + 1));
      assert.equal(await popup.locator('output').textContent(), `${before + 1}px`);
      await popup.getByRole('button', { name: '초기화', exact: true }).click();
      assert.equal(await slider.inputValue(), String(await page.evaluate(category => SETTINGS_DEFAULTS[category], category)));
      await close();
      assert.equal(await popup.count(), 0);
    }
    // 제목 주변 필터는 기존 기능을 유지한다.
    await page.locator('.lp-events-s .ev-filter-btn').first().click();
    assert.equal(await popup.count(), 0);
    await page.keyboard.press('Escape');
    // 닫을 때 현재 내용 기준 높이를 다시 맞추며, 창이 사라진 뒤에도 값은 유지된다.
    await page.locator('#benchPanel .dp-title').click();
    await change(18);
    await close();
    await settle(page);
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 18);
    assert(await page.locator('#benchPanel').evaluate(panel => {
      const split = panel.querySelector('.dp-split');
      return split.clientHeight > 0 && split.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom;
    }), 'bench list remains inside the recalculated panel');
    // 작은 캠 하프라인은 선수 노드를 피해 누를 수 있어야 한다.
    const smallLine = page.locator('.layout-small .dp-lineup-marking-midline');
    await smallLine.click({ position: { x: 10, y: 1 } });
    assert.equal(Number(await slider.getAttribute('max')), await page.evaluate(() => LINEUP_NAME_SIZE_MAX));
    assert.equal(await popup.locator('.panel-font-heading').textContent(), '선발 라인업 이름 크기');
    assert.equal(await popup.locator('.sp-label-sub').count(), 0);
    for (const category of ['lineup', 'lineupHideInitial']) {
      const toggle = popup.locator(`input[data-settings-cat="${category}"]`);
      const setting = page.locator(`#settingsBackdrop input[data-settings-cat="${category}"]`);
      const before = await toggle.isChecked();
      await toggle.locator('..').click();
      assert.equal(await setting.isChecked(), !before);
      await page.evaluate(category => {
        const { off, on } = getSwitchSides(category);
        setSetting(category, getSetting(category) === on ? off : on);
      }, category);
      assert.equal(await toggle.isChecked(), before);
    }
    await change(20);
    assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 20);
    await close();
    // 하프라인이 선수와 겹쳐도 양쪽 터치라인에서 같은 메뉴를 열 수 있습니다.
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const line = page.locator(`.layout-small .dp-lineup-touchline.is-${side}`);
      const box = await line.boundingBox();
      const position = ['top', 'bottom'].includes(side) ? { x: box.width / 2, y: 6 } : { x: 6, y: 35 };
      await line.click({ position });
      assert(await popup.locator('.sp-row:has(input[data-settings-cat="lineup"])').isVisible());
      if (['left', 'right'].includes(side)) {
        const menu = await popup.boundingBox();
        assert(Math.abs(menu.y - (box.y + position.y)) < 15, 'menu opens near the clicked point on a long boundary');
      }
      if (side === 'left') await popup.screenshot({ path: path.join(root, 'screenshots/tests/lineup-name-menu-small.png') });
      await close();
    }
    // F11처럼 너비는 같고 높이만 달라져도 네 칼럼이 화면 너비를 모두 채운다.
    await page.setViewportSize({ width: 1920, height: 950 });
    await page.waitForTimeout(350);
    const gap = await page.evaluate(() => {
      const layout = document.querySelector('.layout-small');
      const last = layout.querySelector('.lp-cam-chat');
      return layout.getBoundingClientRect().right - last.getBoundingClientRect().right - (parseFloat(getComputedStyle(layout).paddingRight) || 0);
    });
    assert(Math.abs(gap) < 2, `height-only resize must not leave an unused right margin: ${gap}`);
    await page.evaluate(() => activatePage('main-big'));
    await settle(page);
    const lines = page.locator('.layout-big .dp-lineup-marking-midline');
    assert.equal(await lines.count(), 2);
    for (let i = 0; i < 2; i++) {
      // 3-4-3에서 하프라인을 덮는 선수는 그대로 누를 수 있게 두고, 키보드 진입도 확인합니다.
      await lines.nth(i).focus();
      await page.keyboard.press('Enter');
      assert.equal(await popup.locator('input[type="checkbox"]').count(), 2);
      await change(19 + i);
      assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 19 + i);
      await close();
    }
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const line = page.locator(`.layout-big .dp-lineup-touchline.is-${side}`).first();
      const box = await line.boundingBox();
      await line.click({ position: ['top', 'bottom'].includes(side) ? { x: box.width / 2, y: 6 } : { x: 6, y: 35 } });
      assert(await popup.isVisible());
      if (side === 'left') await popup.screenshot({ path: path.join(root, 'screenshots/tests/lineup-name-menu-big.png') });
      await close();
    }
    // 분할을 끈 큰 캠에서도 같은 하프라인 편집기를 사용한다.
    await page.evaluate(() => setSetting('splitLineup', 'off'));
    await settle(page);
    assert.equal(await lines.count(), 1);
    await lines.first().focus();
    await page.keyboard.press('Enter');
    assert(await popup.isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await popup.count(), 0);
    // 큰 캠의 순환 패널 제목도 같은 설정으로 연결된다.
    for (const mode of ['events', 'stats', 'bench_home', 'injuries']) {
      await page.evaluate(mode => { _lpStatCycle.mode = mode; lpStatUpdateVisibility(); }, mode);
      const heading = page.locator('.layout-big .lp-stat [data-panel-font]:visible').first();
      if (mode === 'bench_home') await heading.locator('.panel-font-title-text').click();
      else await heading.click();
      assert(await popup.isVisible(), mode);
      await close();
    }
    await page.evaluate(() => document.documentElement.requestFullscreen());
    await settle(page);
    await page.locator('.layout-big .dp-lineup-touchline.is-right').first().click({ position: { x: 6, y: 35 } });
    await change(20);
    assert.equal(await popup.evaluate(node => node.parentElement === document.fullscreenElement), true);
    await page.evaluate(() => document.exitFullscreen());
    await settle(page);
    assert.equal(await popup.count(), 0);
    assert.equal(await page.evaluate(() => getSetting('lineupNameSize')), 20);
    assert.deepEqual(errors, []);
    await page.reload();
    await settle(page);
    assert.equal(await page.locator('input[data-settings-slider="lineupNameSize"]').inputValue(), '20');
    // 두 뷰의 스탯 초기화 높이는 글씨 크기와 무관하고 글씨 설정은 보존한다.
    for (const view of ['main-small', 'main-big']) {
      await page.evaluate(view => activatePage(view), view);
      await settle(page);
      await page.evaluate(() => resetPanelFontSetting('statsNameSize'));
      const defaultSize = view === 'main-big' ? 16 : 12;
      assert.equal(await page.evaluate(() => getSetting('statsNameSize')), defaultSize);
      assert.equal(await page.locator('input[data-settings-slider="statsNameSize"]').inputValue(), String(defaultSize));
      await page.evaluate(() => setSetting('statsNameSize', 18));
      assert.equal(await page.evaluate(() => getSetting('statsNameSize')), 18);
      const heights = await page.evaluate(() => {
        const panel = document.querySelector('#page-main-small.active .lp-stat-s, #page-main-big.active .lp-stat');
        const reset = () => {
          if (document.querySelector('#page-main-small.active')) resetSmallStatsHeight();
          else {
            localStorage.removeItem(BIG_CHAT_FRACTION_KEY);
            localStorage.removeItem(BIG_CHAT_H_KEY);
            localStorage.removeItem(BIG_STAT_H_KEY);
            applyStoredBigPanelHeights();
          }
          return panel.getBoundingClientRect().height;
        };
        setSetting('statsNameSize', 12);
        const baseline = reset();
        setSetting('statsNameSize', STATS_NAME_SIZE_MAX);
        const enlarged = reset();
        const font = getSetting('statsNameSize');
        setSetting('statsNameSize', 12);
        return { baseline, enlarged, font, max: STATS_NAME_SIZE_MAX };
      });
      assert(heights.baseline > 0);
      assert(Math.abs(heights.baseline - heights.enlarged) < 1, JSON.stringify({ view, ...heights }));
      assert.equal(heights.font, heights.max);
    }
    // 큰 글씨의 미출전 사유는 읽을 수 있는 비율을 유지하고, 좁으면 다음 줄을 사용한다.
    await page.evaluate(() => { activatePage('main-big'); _lpStatCycle.mode = 'injuries'; lpStatUpdateVisibility(); });
    await settle(page);
    await page.evaluate(() => resetPanelFontSetting('benchInjuryNameSize'));
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 16);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--dp-item-name-size')), '16px');
    await page.evaluate(() => setSetting('benchInjuryNameSize', 18));
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 18);
    await page.evaluate(() => {
      resetPanelFontSetting('benchInjuryNameSize');
      Object.defineProperty(screen, 'height', { configurable: true, value: innerHeight + 100 });
      activatePage('main-small');
    });
    assert.equal(await page.evaluate(() => getSetting('benchInjuryNameSize')), 13);
    await page.evaluate(() => activatePage('main-big'));
    const reasonFits = await page.evaluate(() => {
      const panel = document.querySelector('[data-injury-cycle-panel]');
      const original = panel.innerHTML;
      const results = [];
      for (const size of [13, 18, 21]) {
        setSetting('benchInjuryNameSize', size);
        for (const width of [220, 290, 330]) {
          panel.innerHTML = `<div style="width:${width}px">${buildInjuryListHtml([
            { playerId: 987001, name: '에밀리아노 마르티네스', number: 1, reason: 'Special Leave', type: 'Missing Fixture' },
            { playerId: 987002, name: '리스 제임스', number: 24, reason: 'Knee Injury', type: 'Missing Fixture' }
          ], true, { inlineReason: true })}</div>`;
          fitInjuryReasons(panel);
          for (const label of panel.querySelectorAll('.dp-item-name')) {
            const reason = label.querySelector('.ic-reason');
            results.push({
              size, width,
              ratio: parseFloat(getComputedStyle(reason).fontSize) / parseFloat(getComputedStyle(label).fontSize),
              overflow: label.scrollWidth - label.clientWidth,
              newline: label.classList.contains('ic-reason-newline')
            });
          }
        }
      }
      panel.innerHTML = original;
      return results;
    });
    for (const result of reasonFits) {
      assert(result.ratio >= 8 / 13 - 0.01, JSON.stringify(result));
      assert(result.overflow <= 1, JSON.stringify(result));
    }
    assert(reasonFits.some(result => result.size === 21 && result.newline), 'large names move reasons to a readable new line');
    // 경기 정보와 상대전적도 제목 메뉴·설정 슬라이더·저장을 공유한다.
    await page.evaluate(() => {
      applyHthPanel({ matches: [{
        fixtureId: 999001, date: '2025-01-01T12:00:00Z', status: 'PEN',
        homeTeamId: 1, awayTeamId: 2,
        homeTeamName: '첼시', awayTeamName: '토트넘 홋스퍼',
        homeTeamLogo: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        awayTeamLogo: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        homeScore: 2, awayScore: 2, homePenaltyScore: 5, awayPenaltyScore: 4,
        leagueName: '긴 대회 이름 테스트', venueName: '긴 경기장 이름 테스트'
      }] }, lineupPanelState.lastFixture);
    });
    for (const [mode, category, selector, content] of [
      ['match_info', 'matchInfoNameSize', '.mi-panel-title', '.mi-value'],
      ['hth', 'hthNameSize', '[data-hth-panel] .ev-title', '.hth-team-name']
    ]) {
      await page.evaluate(mode => { _lpStatCycle.mode = mode; lpStatUpdateVisibility(); }, mode);
      await settle(page);
      const heading = page.locator(`.layout-big ${selector}`).first();
      await heading.click();
      assert.equal(await popup.getAttribute('data-category'), category);
      const initial = await page.locator(`.layout-big ${content}`).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      await change(21);
      assert.equal(await page.locator(`input[data-settings-slider="${category}"]`).inputValue(), '21');
      const enlarged = await page.locator(`.layout-big ${content}`).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert(enlarged > initial);
      await close();
      for (const width of [250, 460]) {
        const geometry = await page.evaluate(({ width, mode }) => {
          const panel = document.querySelector('.layout-big .lp-stat');
          applyBigColWidth(panel.closest('.layout-big'), width);
          panel.style.width = `${width}px`;
          hthCheckMetaWrap();
          const body = panel.querySelector(mode === 'hth' ? '.hth-list' : '.mi-body');
          const teams = [...body.querySelectorAll('.hth-team-side')].map(team => {
            const name = team.querySelector('.hth-team-name').getBoundingClientRect();
            const logo = team.querySelector('.hth-logo-box').getBoundingClientRect();
            return { overlapY: Math.min(name.bottom, logo.bottom) - Math.max(name.top, logo.top),
              overlapX: Math.min(name.right, logo.right) - Math.max(name.left, logo.left) };
          });
          return { width: body.clientWidth, overflow: body.scrollWidth - body.clientWidth, teams };
        }, { width, mode });
        assert(geometry.width > 0);
        assert(geometry.overflow <= 1, JSON.stringify({ mode, width, ...geometry }));
        for (const team of geometry.teams) {
          assert(team.overlapY > 0 && team.overlapX <= 0, JSON.stringify({ width, team }));
        }
        if (mode === 'hth') {
          const words = await page.locator('.layout-big .hth-team-away .hth-team-name').first().evaluate(label => {
            const text = label.firstChild;
            return label.textContent.split(' ').map(word => {
              const start = label.textContent.indexOf(word);
              const range = document.createRange();
              range.setStart(text, start); range.setEnd(text, start + word.length);
              return range.getClientRects().length;
            });
          });
          // 아주 좁은 영역에서는 긴 단어도 나눌 수 있지만, 충분한 폭에서는 단어를 보존한다.
          if (width === 460) assert(words.every(lines => lines === 1), JSON.stringify(words));
        }
      }
      await page.screenshot({ path: `screenshots/tests/panel-font-${mode}.png` });
      if (mode === 'hth') {
        const widths = await page.evaluate(() => {
          const list = document.querySelector('.layout-big .hth-list');
          const row = hthCreateRow({
            homeTeamName: '로고 없는 홈팀', awayTeamName: '로고 없는 원정팀',
            homeTeamId: 987001, awayTeamId: 987002, homeScore: 1, awayScore: 0, status: 'FT'
          }, null);
          list.append(row);
          const widths = [...row.querySelectorAll('.hth-team-side')].map(team => ({
            team: team.clientWidth, name: team.querySelector('.hth-team-name').clientWidth,
            logo: !!team.querySelector('.hth-logo-box')
          }));
          row.remove();
          return widths;
        });
        for (const width of widths) {
          assert.equal(width.logo, false);
          assert(width.name >= width.team - 1, JSON.stringify(width));
        }
      }
      if (mode === 'match_info') {
        const scroll = await page.evaluate(() => {
          const panel = document.querySelector('.layout-big .lp-stat');
          const previous = panel.style.cssText;
          panel.style.height = '180px'; panel.style.flex = '0 0 180px';
          const body = panel.querySelector('.mi-body');
          body.scrollTop = body.scrollHeight;
          const result = { top: body.scrollTop, height: body.clientHeight, total: body.scrollHeight };
          panel.style.cssText = previous;
          return result;
        });
        assert(scroll.top > 0 && scroll.total > scroll.height, JSON.stringify(scroll));
      }
      await heading.click();
      await popup.locator('.panel-font-reset').click();
      await close();
      await page.locator(`input[data-settings-slider="${category}"]`).evaluate(input => {
        input.value = '19'; input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal(await page.evaluate(category => getSetting(category), category), 19);
    }
    // 대시보드에서도 상대전적 제목으로 조절하며 커진 목록은 패널 안에서 스크롤한다.
    await page.evaluate(() => {
      activatePage('main-small');
      hthSetMode('hth');
      setSetting('hthNameSize', 21);
    });
    await settle(page);
    await page.locator('.lp-events-s [data-hth-panel] .ev-title').click();
    assert.equal(await popup.getAttribute('data-category'), 'hthNameSize');
    await close();
    for (const view of ['main-small', 'main-big']) {
      const scroll = await page.evaluate(view => {
        activatePage(view);
        const parent = document.querySelector(view === 'main-small' ? '.lp-events-s' : '.layout-big .lp-stat');
        if (view === 'main-small') hthSetMode('hth');
        else { _lpStatCycle.mode = 'hth'; lpStatUpdateVisibility(); }
        parent.style.height = '180px'; parent.style.flex = '0 0 180px';
        const list = parent.querySelector('.hth-list');
        const row = list.firstElementChild;
        for (let i = 0; i < 8; i++) list.append(row.cloneNode(true));
        list.scrollTop = list.scrollHeight;
        return { top: list.scrollTop, height: list.clientHeight, total: list.scrollHeight,
          overflow: getComputedStyle(list).overflowY,
          parentHeight: parent.getBoundingClientRect().height };
      }, view);
      assert(scroll.top > 0 && scroll.total > scroll.height, JSON.stringify({ view, ...scroll }));
      assert.equal(scroll.overflow, 'auto');
      await page.screenshot({ path: `screenshots/tests/hth-font-scroll-${view}.png` });
    }
    await page.evaluate(() => { setSetting('hthNameSize', 19); });
    await page.reload(); await settle(page);
    assert.deepEqual(await page.evaluate(() => ['matchInfoNameSize', 'hthNameSize'].map(getSetting)), [19, 19]);
    // 설정창의 모든 슬라이더는 자기 항목만 초기화하며 입력값과 표시값도 함께 갱신한다.
    await page.evaluate(() => { activatePage('main-big'); openSettingsPopup(); });
    const settingsSliders = await page.locator('#settingsBackdrop input[data-settings-slider]').evaluateAll(inputs => inputs.map(input => ({
      category: input.dataset.settingsSlider,
      tab: input.closest('[data-sp-tab-section]').dataset.spTabSection,
      min: Number(input.min), max: Number(input.max)
    })));
    assert.equal(await page.locator('#settingsBackdrop [data-settings-slider-reset]').count(), settingsSliders.length);
    for (const { category, tab, min, max } of settingsSliders) {
      await page.locator(`[data-sp-tab="${tab}"]`).click();
      const input = page.locator(`#settingsBackdrop input[data-settings-slider="${category}"]`);
      const expected = await page.evaluate(category => ['benchInjuryNameSize', 'statsNameSize'].includes(category) ? 16 : SETTINGS_DEFAULTS[category], category);
      await input.evaluate((input, value) => {
        input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true }));
      }, expected === max ? min : max);
      const untouched = await page.evaluate(category => Object.fromEntries(
        [...document.querySelectorAll('#settingsBackdrop input[data-settings-slider]')]
          .filter(input => input.dataset.settingsSlider !== category)
          .map(input => [input.dataset.settingsSlider, getSetting(input.dataset.settingsSlider)])
      ), category);
      await page.locator(`[data-settings-slider-reset="${category}"]`).click();
      assert.equal(await page.evaluate(category => getSetting(category), category), expected, category);
      assert.equal(Number(await input.inputValue()), expected, category);
      assert.match(await input.locator('..').locator('.sp-slider-value').innerText(), new RegExp(`^${expected}(px|%)$`));
      assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, getSetting(key)])), Object.keys(untouched)), untouched);
    }
    await page.locator('[data-sp-tab="events"]').click();
    await page.screenshot({ path: 'screenshots/tests/settings-slider-resets.png' });
    await page.evaluate(() => closeSettingsPopup());
    // 양쪽 뷰의 팬 반응 닫기는 기존 설정과 토스트를 사용하고 설정에서 다시 켤 수 있다.
    for (const view of ['main-big', 'main-small']) {
      await page.evaluate(view => { activatePage(view); setSetting('fanReaction', 'on'); }, view);
      await settle(page);
      const fan = page.locator(view === 'main-big' ? '.layout-big .lp-chat-big' : '.layout-small .lp-cam-chat');
      const closeFan = fan.locator('.fan-reaction-close');
      await page.mouse.move(0, 0);
      await page.waitForTimeout(150);
      assert.equal(await closeFan.evaluate(button => getComputedStyle(button).opacity), '0');
      await fan.hover();
      await page.waitForTimeout(150);
      assert.equal(await closeFan.evaluate(button => getComputedStyle(button).opacity), '1');
      await closeFan.click();
      assert.equal(await page.evaluate(() => getSetting('fanReaction')), 'off');
      assert(await page.locator('#copy-toast').evaluate(toast => toast.classList.contains('show')));
      assert.match(await page.locator('#copy-toast').innerText(), /설정 → 패널\/스탯 → 카메라 뷰 패널 표시 → 팬 반응/);
      await page.evaluate(() => openSettingsPopup());
      await page.locator('[data-sp-tab="events"]').click();
      await page.locator('input[data-settings-cat="fanReaction"]').locator('..').click();
      await page.evaluate(() => closeSettingsPopup());
      assert.equal(await page.evaluate(() => getSetting('fanReaction')), 'on');
    }
    console.log('PASS panel font controls, proportional injury reasons, fixed stats reset heights and match info/head-to-head font settings');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
