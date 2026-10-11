const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1920, height: 1080 } });
    await page.evaluate(() => {
      setSetting('statCycleAuto', 'off');
      setSetting('teamName', 'long');
      activatePage('main-small');
      window.layoutFixture = { matchInfo: { fixtureId: 500, homeTeamId: 11, awayTeamId: 22, homeTeamName: '크리스탈 팰리스', homeTeamNameShort: '팰리스', awayTeamName: '노팅엄 포레스트', awayTeamNameShort: '노팅엄' }, events: [] };
      const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><path fill="#60a5fa" d="M2 2h26v20L15 29 2 22z"/></svg>');
      window.layoutMatches = {};
      fetchTeamFixtures = async id => {
        const names = id === 11 ? ['브리스톨 시티', '리즈 유나이티드', '레흐 포즈난', '입스위치 타운', '브라이튼 앤 호브 알비온'] : ['코번트리 시티', '아스톤 빌라', '토트넘 홋스퍼', '리버풀', '보루시아 묀헨글라트바흐'];
        const matches = names.map((name, i) => ({ fixtureId: 600 + i, status: 'FT', homeTeamId: id, awayTeamId: 99, homeTeamName: 'HOME', awayTeamName: name, awayTeamNameShort: ['브리스톨', '리즈', '레흐', '입스위치', '브라이튼'][i], awayTeamLogo: logo, homeScore: i % 3, awayScore: 1, date: '2026-09-12T18:00:00Z' }));
        if (id === 22) Object.assign(matches[0], { status: 'PEN', homeScore: 2, awayScore: 2, homePenaltyScore: 12, awayPenaltyScore: 11 });
        layoutMatches[id] = matches;
        return { matches };
      };
      applyEventsPanel(layoutFixture, { animate: false });
      teamFixturesShow(layoutFixture);
    });
    await page.waitForFunction(() => document.querySelectorAll('.lp-events-s .tf-card').length === 10);
    for (const [context, width, height] of [['small', 450, 400], ['big', 340, 600], ['big', 340, 400]]) {
      await page.evaluate(({ context, width, height }) => {
        activatePage(context === 'small' ? 'main-small' : 'main');
        if (context === 'big') lpStatShowTeamFixturesPage(0);
        const host = document.querySelector(context === 'small' ? '.lp-events-s' : '.lp-stat');
        host.style.background = '#0b1220';
        for (const [key, value] of Object.entries({ position: 'fixed', top: '0', left: '0', 'z-index': '1000', width: `${width}px`, height: `${height}px`, 'max-height': `${height}px`, 'min-height': '0', flex: `0 0 ${height}px` })) host.style.setProperty(key, value, 'important');
      }, { context, width, height });
      await settle(page);
      const panel = page.locator(`${context === 'small' ? '.lp-events-s' : '.lp-stat'} [data-team-fixtures-panel]`);
      const actualHeight = (await panel.boundingBox()).height;
      assert(Math.abs(actualHeight - (height - 2)) < 2, `${context}: requested ${height}, actual ${actualHeight}`);
      const measurements = await panel.evaluate(panel => {
        const titleBottom = panel.querySelector('.ev-title-bar').getBoundingClientRect().bottom;
        return [...panel.querySelectorAll('.tf-team')].map(team => {
          const r = team.getBoundingClientRect();
          const label = team.querySelector('.dp-side-name').getBoundingClientRect();
          const content = team.querySelector('.tf-content');
          const c = content.getBoundingClientRect();
          const grid = team.querySelector('.tf-grid').getBoundingClientRect();
          return { height: r.height, labelHeight: label.height, labelOffset: label.top - r.top, boundaryGap: label.top - (team === team.parentElement.firstElementChild ? titleBottom : r.top), top: grid.top - c.top, bottom: c.bottom - grid.bottom, scroll: content.scrollHeight - content.clientHeight, horizontalOverflow: content.scrollWidth - content.clientWidth };
        });
      });
      assert(Math.abs(measurements[0].height - measurements[1].height) < 1, JSON.stringify(measurements));
      assert(Math.abs(measurements[0].boundaryGap - measurements[1].boundaryGap) < 1, JSON.stringify(measurements));
      for (const item of measurements) {
        assert.equal(item.labelHeight, 20);
        assert(item.horizontalOverflow <= 1, JSON.stringify(item));
        if (item.scroll <= 1) assert(Math.abs(item.top - item.bottom) < 2, JSON.stringify(item));
        else assert(Math.abs(item.top) < 2, JSON.stringify(item));
      }
      console.log(context, width, height, JSON.stringify(measurements));
      await page.screenshot({ path: `tests/display/team-fixtures-${context}-${height}-stress.png`, clip: await panel.boundingBox() });
    }
    // 매우 긴 이름은 최소 글자 크기 아래로 축소하지 않고 단축명으로 전환한다.
    await page.evaluate(() => {
      layoutMatches[22][0].awayTeamName = '클루브 아틀레티코 데 마드리드 인터내셔널 유나이티드 풋볼 클럽';
      layoutMatches[22][0].awayTeamNameShort = '아틀레티코';
      layoutFixture.matchInfo.awayTeamName = '노팅엄 포레스트 인터내셔널 유나이티드 풋볼 클럽 아주 긴 팀 이름 테스트'.repeat(2);
      document.dispatchEvent(new CustomEvent('settings:change', { detail: { category: 'teamName' } }));
    });
    await settle(page);
    const awayContent = page.locator('.lp-stat .tf-content').nth(1);
    assert.equal(await awayContent.locator('.tf-opponent').first().innerText(), '아틀레티코 (H)');
    assert.equal(await page.locator('.lp-stat .tf-team .dp-side-name').nth(1).innerText(), '노팅엄');
    assert(await awayContent.locator('.tf-opponent').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 9));
    const dateVisible = await awayContent.evaluate(el => {
      const date = el.querySelector('.tf-date').getBoundingClientRect();
      return date.bottom <= el.getBoundingClientRect().bottom + 1;
    });
    assert(dateVisible);
    console.log('PASS centered cards, equal boundaries, long names, penalty scores and short-name fallback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
