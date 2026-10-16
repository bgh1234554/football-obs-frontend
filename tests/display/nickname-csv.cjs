const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { dpr: 1, platform: 'Win32', viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      setPlayerNickname(10, '기존 별명');
      setPlayerNickname(99, '보존할 선수');
      setPlayerNickname(0, '이름 별명', 'No ID');
      promoteNameNicknameToId('No ID', 20);
      promoteNameNicknameToId('No ID', 30);
      setTeamNickname({ key: '101', name: '원래 팀' }, '기존 팀');
      setTeamNickname({ key: '202', name: '다른 팀' }, '보존할 팀');
      setTeamNickname({ key: 'n:수동 팀', name: '수동 팀' }, '수동 별명');
      state.teamNicknameTeams = { home: { key: '101', name: '원래 팀' } };
      openSettingsPopup();
    });
    await page.locator('[data-sp-tab="names"]').click();
    const menu = kind => page.locator(`[data-nickname-csv="${kind}"]`);
    const result = kind => menu(kind).locator('xpath=ancestor::div[contains(@class,"sp-row")]/following-sibling::p[1]');
    const upload = async (kind, text) => {
      const chooser = page.waitForEvent('filechooser');
      await menu(kind).locator('[data-csv-action="import"]').click();
      await (await chooser).setFiles({ name: 'nicknames.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
      await page.waitForFunction(kind => {
        const input = document.querySelector(`[data-nickname-csv="${kind}"] input`);
        return !input.disabled && !input.value;
      }, kind);
    };
    const download = async kind => {
      const pending = page.waitForEvent('download');
      await menu(kind).locator('[data-csv-action="export"]').click();
      const file = await pending;
      assert.equal(file.suggestedFilename(), `${kind}-nicknames.csv`);
      return fs.readFileSync(await file.path());
    };
    const nickname = '별명, "큰"\n작은';
    const csv = '\uFEFF선수ID,선수명,닉네임\r\n'
      + `10,같은 이름,"${nickname.replace(/"/g, '""')}"\r\n`
      + '0,No ID,새 이름 별명\r\n20,다른 이름,직접 지정\r\n'
      + '__proto__,이름,오류\r\n0,,오류\r\n-1,이름,오류\r\n11,이름,\r\n'
      + `12,이름,${'가'.repeat(31)}\r\n13,열 부족\r\n\r\n`;
    await upload('player', csv);
    assert.match(await result('player').textContent(), /3행 적용 · 6행 제외/);
    assert.deepEqual(await page.evaluate(() => ({
      changed: getPlayerNickname(10), kept: getPlayerNickname(99), byName: getPlayerNickname(0, 'No ID'),
      direct: getPlayerNickname(20), promoted: readPromotedNicknames()['20'], inherited: getPlayerNickname(30)
    })), { changed: nickname, kept: '보존할 선수', byName: '새 이름 별명', direct: '직접 지정', promoted: undefined, inherited: '새 이름 별명' });
    const exported = await download('player');
    assert.deepEqual([...exported.subarray(0, 3)], [239, 187, 191]);
    assert(exported.toString('utf8').includes('"별명, ""큰""\n작은"'));
    assert(exported.toString('utf8').includes('"0","No ID","새 이름 별명"'));
    const before = await page.evaluate(() => localStorage.getItem(PLAYER_NICKNAME_KEY));
    await upload('player', exported.toString('utf8'));
    assert.equal(await page.evaluate(() => localStorage.getItem(PLAYER_NICKNAME_KEY)), before);

    await page.evaluate(() => {
      window.nicknameCsvOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === PLAYER_NICKNAME_PROMOTED_KEY) throw new DOMException('Full', 'QuotaExceededError');
        return window.nicknameCsvOriginalSetItem.call(this, key, value);
      };
    });
    await upload('player', '선수ID,선수명,닉네임\n10,,저장 실패');
    assert.match(await result('player').textContent(), /저장하지 못했습니다/);
    assert.equal(await page.evaluate(() => localStorage.getItem(PLAYER_NICKNAME_KEY)), before);
    await page.evaluate(() => { Storage.prototype.setItem = window.nicknameCsvOriginalSetItem; });
    await upload('player', '팀ID,팀명,닉네임\n10,이름,오류');
    assert.match(await result('player').textContent(), /첫 줄/);
    await upload('player', '선수ID,선수명,닉네임\n10,이름,"깨진 따옴표');
    assert.match(await result('player').textContent(), /따옴표/);
    assert.equal(await page.evaluate(() => localStorage.getItem(PLAYER_NICKNAME_KEY)), before);

    await upload('team', '팀ID,팀명,닉네임\n101,새 참고 이름,새 팀 별명\n0,수동 팀,새 수동 별명\n303,추가 팀,추가 별명\n202,다른 팀,');
    assert.match(await result('team').textContent(), /3행 적용 · 1행 제외/);
    assert.deepEqual(await page.evaluate(() => [getTeamNickname({ key: '101' }), getTeamNickname({ key: '202' }),
      getTeamNickname({ key: 'n:수동 팀' }), document.querySelector('#team-text-left').textContent]),
    ['새 팀 별명', '보존할 팀', '새 수동 별명', '새 팀 별명']);
    const teams = await download('team');
    assert(teams.toString('utf8').includes('"101","새 참고 이름","새 팀 별명"'));
    const teamBefore = await page.evaluate(() => localStorage.getItem(TEAM_NICKNAME_KEY));
    await upload('team', teams.toString('utf8'));
    assert.equal(await page.evaluate(() => localStorage.getItem(TEAM_NICKNAME_KEY)), teamBefore);
    await page.reload();
    assert.equal(await page.evaluate(() => getPlayerNickname(10)), nickname);
    assert.equal(await page.evaluate(() => getTeamNickname({ key: '101' })), '새 팀 별명');
    await page.evaluate(() => openSettingsPopup());
    for (const width of [1920, 1280, 753]) {
      await page.setViewportSize({ width, height: 900 });
      for (const kind of ['player','team']) {
        await menu(kind).scrollIntoViewIfNeeded();
        const buttons=menu(kind).locator('[data-csv-action]');
        assert.equal(await buttons.count(),2);
        const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}));
        assert(boxes.every(r=>r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=900));
        assert(boxes[0].right<=boxes[1].left);
      }
      await page.locator('#settingsBackdrop').screenshot({ path: path.resolve(__dirname, `../../screenshots/tests/nickname-csv-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS nickname CSV downloads/BOM, quoted cells/newlines, ID/name-key round trips, merge, validation, promotion, persistence and separate buttons');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
