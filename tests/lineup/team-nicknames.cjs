const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage, settle } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1920, height: 1080 } });
    const page = await openPage(context, { platform: 'Win32' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    const fixture = await page.evaluate(async () => {
      activatePage('main-small');
      setSetting('statsAutoSwipe', 'off');
      const roster = offset => Array.from({ length: 11 }, (_, i) => ({ playerId: offset + i, number: i + 1, name: `선수 ${i}`, grid: buildManualGridValues('4-4-2')[i] }));
      const f = { matchInfo: { fixtureId: 10001, homeTeamId: 101, awayTeamId: 202,
        homeTeamName: '홈팀 전체 이름', homeTeamNameShort: '홈팀', awayTeamName: '원정팀 전체 이름', awayTeamNameShort: '원정팀',
        homeScore: 2, awayScore: 1, status: 'NS' },
        homeLineup: { formation: '4-4-2', startXi: roster(1000), substitutes: [] },
        awayLineup: { formation: '4-4-2', startXi: roster(2000), substitutes: [] },
        homeInjuries: [], awayInjuries: [], events: [], playerStats: [] };
      fetchFixture = async () => structuredClone(f);
      await fetchAndApplyFixtureData(f.matchInfo.fixtureId, { silent: true });
      setPlayerNickname(1000, '선수 별명');
      return f;
    });
    const displayed = () => page.evaluate(() => ({
      home: document.querySelector('#team-text-left').textContent,
      away: document.querySelector('#team-text-right').textContent,
      homeLabels: [...document.querySelectorAll('[data-team-nickname-side="home"]')].map(el => el.textContent),
      awayLabels: [...document.querySelectorAll('[data-team-nickname-side="away"]')].map(el => el.textContent),
    }));
    const edit = async (selector, name) => {
      await page.locator(selector).click();
      await page.locator('#teamNickInput').fill(name);
      await page.locator('#teamNickSave').click();
      await settle(page);
    };
    await edit('#homeName', '홈 별명');
    let names = await displayed();
    assert.equal(names.home, '홈 별명');
    assert(names.homeLabels.length >= 3 && names.homeLabels.every(n => n === '홈 별명'), JSON.stringify(names));
    await edit('#benchPanel [data-team-nickname-side="away"]', '원정 별명');
    names = await displayed();
    assert.equal(names.away, '원정 별명');
    assert(names.awayLabels.every(n => n === '원정 별명'), JSON.stringify(names));
    await edit('#injuryPanel [data-team-nickname-side="home"]', '<b>홈 별명</b>');
    assert.equal(await page.locator('#homeName b').count(), 0);
    await edit('.page.active .dp-lineup-team-name[data-team-nickname-side="home"]', '피치 별명');
    await page.evaluate(() => { setSetting('teamName', 'long'); });
    await settle(page);
    assert.equal((await displayed()).home, '피치 별명');
    await page.evaluate(async () => { await fetchAndApplyFixtureData(10001, { silent: true }); });
    assert.equal((await displayed()).home, '피치 별명');
    await page.screenshot({ path: 'screenshots/tests/team-nicknames.png' });
    await page.evaluate(() => { activatePage('main-big'); setSetting('splitLineup', 'on'); });
    await settle(page);
    await edit('.page.active .dp-lineup-team-name[data-team-nickname-side="home"]', '피치 별명');
    await page.evaluate(() => setSetting('splitLineup', 'off'));
    assert.equal(await page.locator('.page.active .is-formation-only [data-team-nickname-side]').count(), 0);
    await page.evaluate(() => { activatePage('main-small'); state.boardScale = 75; reapplyBoardScale(); });
    await page.locator('#homeName').click();
    const popup = await page.locator('#teamNickPopup').boundingBox();
    assert(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= 1920 && popup.y + popup.height <= 1080);
    await page.screenshot({ path: 'screenshots/tests/team-nickname-editor.png' });
    await page.locator('#teamNickCancel').click();

    // 새로고침과 홈/원정이 바뀐 다른 경기에서도 ID로 같은 닉네임을 찾는다.
    await page.reload();
    await settle(page);
    assert.equal((await displayed()).home, '피치 별명');
    await page.evaluate(async f => {
      const m = f.matchInfo;
      for (const field of ['TeamId', 'TeamName', 'TeamNameShort']) [m[`home${field}`], m[`away${field}`]] = [m[`away${field}`], m[`home${field}`]];
      m.fixtureId = 10002;
      fetchFixture = async () => f;
      await fetchAndApplyFixtureData(10002, { silent: true });
    }, fixture);
    assert.equal((await displayed()).away, '피치 별명');
    assert.equal((await displayed()).home, '원정 별명');

    // 키보드 진입과 취소, 빈 값 저장, 개별 초기화를 확인한다.
    await page.locator('#awayName').focus();
    await page.keyboard.press('Enter');
    await page.locator('#teamNickInput').fill('저장하지 않음');
    await page.keyboard.press('Escape');
    assert.equal((await displayed()).away, '피치 별명');
    await edit('#awayName', '   ');
    assert.equal((await displayed()).away, '홈팀 전체 이름');
    await page.locator('#homeName').click();
    await page.locator('#teamNickClear').click();
    assert.equal((await displayed()).home, '원정팀 전체 이름');

    // 설정 목록 삭제와 팀 전체 초기화는 선수 닉네임에 영향을 주지 않는다.
    await edit('#homeName', '목록 삭제');
    await page.locator('#showTeamNicknameListBtn').evaluate(el => el.click());
    await page.locator('[data-team-nick-delete="202"]').click();
    assert.equal((await displayed()).home, '원정팀 전체 이름');
    await page.locator('#teamNickListClose').click();
    await edit('#awayName', '전체 삭제');
    await page.locator('#clearAllTeamNicknamesBtn').evaluate(el => el.click());
    assert.equal((await displayed()).away, '홈팀 전체 이름');
    assert.equal(await page.evaluate(() => getPlayerNickname(1000)), '선수 별명');

    // 다른 창의 저장 및 삭제도 점수판과 패널을 바로 갱신한다.
    const other = await page.context().newPage();
    await other.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>storage peer</title>' }));
    await other.goto('http://localhost/');
    await other.evaluate(() => {
      localStorage.setItem('obs.team.nicknames.v1', JSON.stringify({ '202': { name: '원정팀 전체 이름', nickname: '다른 창 별명' } }));
    });
    await page.waitForFunction(() => document.querySelector('#team-text-left').textContent === '다른 창 별명');
    assert.equal((await displayed()).home, '다른 창 별명');
    await other.evaluate(() => localStorage.removeItem('obs.team.nicknames.v1'));
    await page.waitForFunction(() => document.querySelector('#team-text-left').textContent === '원정팀 전체 이름');
    await other.close();
    await page.evaluate(() => {
      resetFixtureDrivenState({ clearFixtureId: true, clearCache: true });
      state.homeName = '수동 팀'; state.manualMode = true; render();
    });
    await edit('#homeName', '수동 별명');
    assert.equal((await displayed()).home, '수동 별명');
    assert.equal(await page.evaluate(() => readTeamNicknames()['n:수동 팀'].nickname), '수동 별명');
    await page.evaluate(() => {
      state.teamNicknameTeams = { home: teamNicknameIdentity({ homeTeamId: 999, homeTeamName: '이전 API 팀' }, 'home') };
      setTeamNickname(state.teamNicknameTeams.home, '이전 API 별명');
      el.manualHomeName.value = '새 수동 팀';
      el.manualHomeName.dispatchEvent(new Event('input'));
    });
    assert.equal((await displayed()).home, '새 수동 팀');
    assert.deepEqual(errors, []);
    console.log('PASS: team nickname click paths, persistence, polling, swapped teams, name settings, reset isolation, storage refresh and manual fallback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
