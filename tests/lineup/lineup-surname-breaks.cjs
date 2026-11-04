// 실행: node tests/lineup/lineup-surname-breaks.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../..');
const override = process.argv[3] ? path.resolve(process.argv[3]) : root;
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const relative = decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname).slice(1);
      const candidate = path.join(override, relative);
      const file = fs.existsSync(candidate) ? candidate : path.join(root, relative);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      settingsState.lineupNode = 'photo';
      const host = document.createElement('div');
      host.id = 'surname-fit-probe';
      host.style.cssText = 'position:absolute;left:50px;top:50px;width:1000px;background:#284b35;z-index:100000;';
      document.body.appendChild(host);
      const make = (name, width, number = '') => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `display:flex;justify-content:center;width:${width}px;margin-bottom:20px;`;
        wrap.innerHTML = buildLineupNameLabelHtml({ number }, name, 'dp-lineup-name');
        host.appendChild(wrap);
        return wrap.firstElementChild;
      };
      const measure = el => ({
        text: el.textContent,
        lines: getRenderedTextLineCount(el),
        split: el.classList.contains('has-surname-breaks'),
        font: parseFloat(getComputedStyle(el).fontSize),
        fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
        parts: [...el.querySelectorAll('.dp-lineup-surname-part')].map(part => part.textContent),
        number: el.querySelector('.dp-lineup-name-num')?.textContent || '',
        prefix: el.querySelector('.dp-lineup-name-prefix')?.textContent || '',
      });
      const wide = make('A. 메인틀런드-나일스', 300);
      fitLineupNameSelf(wide);
      const two = make('M. 루이스-스켈리', 85);
      fitLineupNameSelf(two);
      const narrow = make('A. 메인틀런드-나일스', 82, '15');
      fitLineupNameSelf(narrow);
      const narrowBeforeResize = measure(narrow);
      const captain = make('A. 메인틀런드-나일스', 82, '15');
      const captainPrefix = document.createElement('span');
      captainPrefix.className = 'dp-lineup-name-prefix';
      captainPrefix.appendChild(Object.assign(document.createElement('span'), {
        className: 'dp-lineup-captain-badge',
        textContent: 'C',
      }));
      captainPrefix.appendChild(captain.querySelector('.dp-lineup-name-num'));
      captain.insertBefore(captainPrefix, captain.firstChild);
      fitLineupNameSelf(captain);
      const veryLong = make('N. 켐추움-스타시오프스키', 82);
      fitLineupNameSelf(veryLong);
      const hiddenInitial = make('메인틀런드-나일스', 48);
      fitLineupNameSelf(hiddenInitial);
      const plain = make('Kh. 크바라츠헬리아', 70);
      fitLineupNameSelf(plain);
      const unsafe = make('A. <img src=x onerror=alert(1)>메인틀런드-나일스', 70);
      fitLineupNameSelf(unsafe);
      const injectionSafe = !unsafe.querySelector('img');
      // 확대 후 다시 맞출 때는 이전에 삽입한 수동 줄바꿈을 제거해야 합니다.
      narrow.parentElement.style.width = '400px';
      fitLineupNamePills(narrow.parentElement);
      const resized = measure(narrow);
      fitLineupNamePills(narrow.parentElement);
      const resizedAgain = measure(narrow);
      settingsState.lineup = 'short';
      settingsState.scorer = 'short';
      settingsState.roster = 'short';
      settingsState.lineupHideInitial = 'off';
      const player = { playerId: 1456, name: 'A. 메인틀런드-나일스' };
      const displayNames = ['lineup', 'scorer', 'roster'].map(category => pickName(player, category));
      const sourceName = pickName(player, 'lineup', { preserveSurnameBreaks: true });
      const collisionEqual = normalizeLineupInitialBaseName(player.name) === normalizeLineupInitialBaseName('B. 메인틀런드나일스');
      return { wide: measure(wide), two: measure(two), narrow: narrowBeforeResize, captain: measure(captain), veryLong: measure(veryLong), hiddenInitial: measure(hiddenInitial), plain: measure(plain), injectionSafe, resized, resizedAgain, displayNames, sourceName, collisionEqual };
    });
    assert.equal(result.wide.lines, 1);
    assert.equal(result.wide.split, false);
    assert.equal(result.two.lines, 2);
    assert.equal(result.two.split, false);
    assert.equal(result.narrow.lines, 3);
    assert.deepEqual(result.narrow.parts, ['A.', '메인틀런드', '나일스']);
    assert.equal(result.narrow.number, '15');
    assert.equal(result.narrow.font, result.wide.font, 'try surname breaks before reducing font');
    assert(result.captain.lines <= 3, `captain rendered in too many lines: ${JSON.stringify(result.captain)}`);
    assert.equal(result.captain.split, true);
    assert.equal(result.captain.prefix, 'C15');
    assert(result.captain.fits, `captain is clipped: ${JSON.stringify(result.captain)}`);
    assert(result.veryLong.font < result.wide.font, 'shrink only if the longer surname still overflows');
    assert.equal(result.hiddenInitial.lines, 2);
    assert.equal(result.hiddenInitial.split, false, 'two natural lines can use a larger font than forced surname segments');
    assert.equal(result.plain.split, false);
    for (const key of ['wide', 'two', 'narrow', 'veryLong', 'hiddenInitial', 'plain', 'resized']) {
      assert(result[key].fits, `${key} is clipped: ${JSON.stringify(result[key])}`);
      assert(!result[key].text.includes('-'), `${key} exposes a marker`);
    }
    assert.equal(result.resized.split, false);
    assert.equal(result.resized.lines, 1);
    assert.deepEqual(result.resized, result.resizedAgain);
    assert(result.injectionSafe);
    assert(result.collisionEqual);
    assert(result.displayNames.every(name => name === 'A. 메인틀런드나일스'));
    assert.equal(result.sourceName, 'A. 메인틀런드-나일스');
    const multiPartName = await page.evaluate(() => {
      const host = document.getElementById('surname-fit-probe');
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;display:flex;justify-content:center;width:113px;margin-bottom:80px;';
      const name = 'Arkelle Nicholas Cecil Jude-Boyd'; // 경기 1639960의 홈팀 12번 선수.
      wrap.innerHTML = buildLineupNameLabelHtml({ number: 12 }, name, 'dp-lineup-name');
      host.appendChild(wrap);
      const el = wrap.firstElementChild;
      const configuredFont = parseFloat(getComputedStyle(el).fontSize);
      fitLineupNameSelf(el);
      const result = {
        font: parseFloat(getComputedStyle(el).fontSize), configuredFont,
        parts: [...el.querySelectorAll('.dp-lineup-surname-part')].map(part => part.textContent),
        fits: canStayWithinLineupNameLayout(el), lines: getRenderedTextLineCount(el),
      };
      wrap.style.width = '500px';
      fitLineupNamePills(wrap);
      result.restored = el.querySelector('.dp-lineup-name-text').textContent === name && !el.querySelector('br');
      wrap.remove();
      return result;
    });
    assert.equal(multiPartName.font, multiPartName.configuredFont, JSON.stringify(multiPartName));
    assert(multiPartName.fits && multiPartName.lines <= 3, JSON.stringify(multiPartName));
    assert.equal(multiPartName.parts.join(' '), 'Arkelle Nicholas Cecil Jude-Boyd');
    assert(multiPartName.restored, 'resizing must preserve the full name and hyphen');
    console.log('PASS: fixture 1639960 multi-part name retains the configured font without clipping.');
    const fullNames = await page.evaluate(() => {
      settingsState.lineup = 'long';
      const host = document.getElementById('surname-fit-probe');
      const make = (player, width) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:relative;display:flex;justify-content:center;width:${width}px;margin-bottom:80px;`;
        const selected = pickName(player, 'lineup', { preserveSurnameBreaks: true });
        wrap.innerHTML = buildLineupNameLabelHtml(player, selected, 'dp-lineup-name');
        host.appendChild(wrap);
        const el = wrap.firstElementChild;
        const marker = el.querySelector('.dp-lineup-name-text').dataset.surnameBreaks;
        fitLineupNameSelf(el);
        return { marker, text: el.textContent, split: el.classList.contains('has-surname-breaks'), font: parseFloat(getComputedStyle(el).fontSize), parts: [...el.querySelectorAll('.dp-lineup-surname-part')].map(part => part.textContent), fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 };
      };
      const player = { playerId: 1456, number: 2, name: 'A. 메인틀런드-나일스', nameKoLong: '에인슬리 메인틀런드나일스' };
      const long = make(player, 82);
      const beforeFix = make({ ...player, name: 'A. 메인틀런드나일스' }, 82);
      const wide = make(player, 300);
      const differentSurname = make({ ...player, nameKoLong: '에인슬리 다른이름' }, 82);
      const partialSuffix = make({ ...player, nameKoLong: '가메인틀런드나일스' }, 82);
      const omittedSurname = make({ playerId: 123, name: 'J. 기튼스', nameKoLong: '제이미 기튼스' }, 82);
      settingsState.lineup = 'short';
      return { long, beforeFix, wide, differentSurname, partialSuffix, omittedSurname };
    });
    assert.equal(fullNames.long.marker, '에인슬리 메인틀런드-나일스');
    assert.deepEqual(fullNames.long.parts, ['에인슬리', '메인틀런드', '나일스']);
    assert(fullNames.long.font > fullNames.beforeFix.font, JSON.stringify(fullNames));
    assert(fullNames.long.fits);
    assert(!fullNames.long.text.includes('-'));
    assert.equal(fullNames.wide.split, false);
    for (const key of ['differentSurname', 'partialSuffix', 'omittedSurname']) assert.equal(fullNames[key].marker, undefined, key);
    const choices = await page.evaluate(() => {
      const host = document.getElementById('surname-fit-probe');
      const make = (name, width) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:relative;display:flex;justify-content:center;width:${width}px;margin-bottom:80px;`;
        wrap.innerHTML = buildLineupNameLabelHtml({}, name, 'dp-lineup-name');
        host.appendChild(wrap);
        return wrap.firstElementChild;
      };
      const tie = make('A. 메인틀런드-나일스', 300);
      const tieChoice = getPreferredLineupSurnameFont(tie, ['A.', '메인틀런드', '나일스']);
      const twoWins = make('메인틀런드-나일스', 48);
      const twoFont = measureLineupNameCandidateFont(twoWins, null, []);
      const threeFont = measureLineupNameCandidateFont(twoWins, ['메인틀런드', '나일스'], []);
      const widerChoice = getPreferredLineupSurnameFont(twoWins, ['메인틀런드', '나일스']);
      const blocked = make('A. 메인틀런드-나일스', 82);
      const obstacle = document.createElement('span');
      obstacle.className = 'dp-lineup-name';
      // 지원하는 모든 글꼴 크기에서 세 번째 줄은 높이 25px를 넘지만, 8px의 두 줄은 들어갑니다.
      obstacle.style.cssText = 'position:absolute;left:0;top:25px;width:82px;height:30px;';
      obstacle.textContent = '다른 선수';
      blocked.parentElement.appendChild(obstacle);
      const before = blocked.outerHTML;
      const blockedChoice = getPreferredLineupSurnameFont(blocked, ['A.', '메인틀런드', '나일스']);
      const unchanged = before === blocked.outerHTML;
      const availableTwo = measureLineupNameCandidateFont(blocked, null, [obstacle]);
      const blockedThree = measureLineupNameCandidateFont(blocked, ['A.', '메인틀런드', '나일스'], [obstacle]);
      fitLineupNameSelf(blocked);
      const noOverlap = !wrapsOverlap(blocked, obstacle);
      const blockedSplit = blocked.classList.contains('has-surname-breaks');
      obstacle.style.top = '0';
      const neitherChoice = getPreferredLineupSurnameFont(blocked, ['A.', '메인틀런드', '나일스']);
      return { tieChoice, twoFont, threeFont, widerChoice, blockedChoice, unchanged, availableTwo, blockedThree, noOverlap, blockedSplit, neitherChoice };
    });
    assert.equal(choices.tieChoice, null, 'same font selects two lines');
    assert(choices.twoFont > choices.threeFont, JSON.stringify(choices));
    assert.equal(choices.widerChoice, null, 'larger two-line font wins');
    assert.equal(choices.blockedChoice, null, 'overlapping third line is rejected');
    assert.equal(choices.blockedThree, null);
    assert.notEqual(choices.availableTwo, null);
    assert(choices.unchanged, 'candidate measurement must leave the original label intact');
    assert.equal(choices.blockedSplit, false);
    assert(choices.noOverlap, 'the selected two-line label clears the obstacle');
    assert.equal(choices.neitherChoice, null, 'no overlapping candidate may be selected');
    const numberLines = await page.evaluate(() => {
      const host = document.getElementById('surname-fit-probe');
      const results = [];
      for (const name of ['페데르코 루소', '후안 마누엘 보셀리', '에인슬리 메인틀런드-나일스', '김민재']) {
        for (const width of [48, 58, 68, 82, 150]) {
          const wrap = document.createElement('div');
          wrap.style.cssText = `position:relative;display:flex;justify-content:center;width:${width}px;margin-bottom:80px;`;
          wrap.innerHTML = buildLineupNameLabelHtml({ number: 15 }, name, 'dp-lineup-name');
          host.appendChild(wrap);
          const el = wrap.firstElementChild;
          const max = parseFloat(getComputedStyle(el).fontSize);
          fitLineupNameSelf(el);
          const before = parseFloat(getComputedStyle(el).fontSize);
          const original = el.outerHTML;
          improveLineupNameWithNumberLine(el, [el], max);
          const after = parseFloat(getComputedStyle(el).fontSize);
          results.push({ name, width, before, after, lines: getRenderedTextLineCount(el), split: el.classList.contains('has-number-line-break'), fits: canStayWithinLineupNameLayout(el), unchanged: original === el.outerHTML });
          if (el.classList.contains('has-number-line-break')) {
            wrap.style.width = '400px';
            fitLineupNamePills(wrap);
            if (el.classList.contains('has-number-line-break') || el.querySelector('br')) throw new Error('Resize must restore the original single-line layout');
            if (el.querySelector('.dp-lineup-name-text').textContent !== stripKoreanSurnameBreaks(name)) throw new Error('Resize changed the name');
            const once = el.outerHTML;
            fitLineupNamePills(wrap);
            if (el.outerHTML !== once) throw new Error('Repeated fitting must be stable');
          }
          wrap.remove();
        }
      }
      return results;
    });
    assert(numberLines.some(x => x.split && x.lines === 3), 'number / first / last name');
    assert(numberLines.some(x => x.split && x.lines === 4), 'number plus existing three name lines');
    for (const x of numberLines) {
      if (x.split) { assert(x.after > x.before, JSON.stringify(x)); assert(x.fits, JSON.stringify(x)); }
      else assert(x.unchanged, JSON.stringify(x));
      if (x.name === '김민재') assert(!x.split);
    }
    const numberGuards = await page.evaluate(() => {
      const host = document.getElementById('surname-fit-probe');
      const run = ({ captain = false, obstacle = false, number = 15 } = {}) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:flex;justify-content:center;width:58px;margin-bottom:80px;';
        wrap.innerHTML = buildLineupNameLabelHtml({ number }, '페데르코 루소', 'dp-lineup-name');
        host.appendChild(wrap);
        const el = wrap.firstElementChild;
        if (captain) {
          el.querySelector('.dp-lineup-name-prefix').insertAdjacentHTML('afterbegin', '<span class="dp-lineup-captain-badge">C</span>');
          moveLineupCaptainBadgeToLastToken(el);
        }
        fitLineupNameSelf(el);
        const before = el.outerHTML;
        let target;
        if (obstacle) {
          target = document.createElement('span');
          target.className = 'dp-lineup-name';
          target.style.cssText = 'position:absolute;left:0;top:25px;width:58px;height:50px;';
          target.textContent = '다른 선수';
          wrap.appendChild(target);
        }
        improveLineupNameWithNumberLine(el, target ? [el, target] : [el], 12);
        const split = el.classList.contains('has-number-line-break');
        const unchanged = el.outerHTML === before;
        const badges = el.querySelectorAll('.dp-lineup-captain-badge').length;
        const fits = canStayWithinLineupNameLayout(el);
        const badgeOnNumber = !!el.querySelector('.dp-lineup-name-prefix .dp-lineup-captain-badge');
        wrap.style.width = '400px';
        fitLineupNamePills(wrap);
        const badgesAfterResize = el.querySelectorAll('.dp-lineup-captain-badge').length;
        wrap.remove();
        return { split, unchanged, badges, fits, badgeOnNumber, badgesAfterResize };
      };
      return { blocked: run({ obstacle: true }), noNumber: run({ number: '' }), captain: run({ captain: true }) };
    });
    assert(numberGuards.blocked.unchanged, 'reject an extra line that collides with another label');
    assert(numberGuards.noNumber.unchanged, 'never split without a displayed shirt number');
    assert(numberGuards.captain.split && numberGuards.captain.fits, JSON.stringify(numberGuards.captain));
    assert.equal(numberGuards.captain.badges, 1);
    assert.equal(numberGuards.captain.badgesAfterResize, 1);
    assert(!numberGuards.captain.badgeOnNumber, 'number line must contain only the number');
    console.log('PASS: number-only first line, strictly larger fonts, 3/4 lines, ties, collision rejection, absent numbers, captain badge and resize reset.');
    await page.evaluate(() => {
      document.getElementById('surname-fit-probe').remove();
      const names = ['A. 메인틀런드-나일스', 'M. 페르난데스-파르도', 'V. 밀린코비치-사비치', 'A. 옥슬레이드-체임벌린', 'N. 켐추움-스타시오프스키', '김민재', '손흥민', 'J. 워드-프라우스', 'Kh. 크바라츠헬리아', 'T. 알렉산더-아놀드', 'M. 루이스-스켈리'];
      const longNames = ['에인슬리 메인틀런드나일스', '마티아스 페르난데스파르도', '바냐 밀린코비치사비치', '알렉스 옥슬레이드체임벌린', '노에 켐추움스타시오프스키', '김민재', '손흥민', '제임스 워드프라우스', '흐비차 크바라츠헬리아', '트렌트 알렉산더아놀드', '마일스 루이스스켈리'];
      const grids = ['1:1', '2:1', '2:2', '2:3', '2:4', '3:1', '3:2', '3:3', '4:1', '4:2', '4:3'];
      const lineup = offset => ({ formation: '4-3-3', coach: { name: '감독' }, startXi: names.map((name, i) => ({ playerId: offset + i, name, nameKoLong: longNames[i], number: i + 1, grid: grids[i], pos: i === 0 ? 'G' : 'M' })), substitutes: [] });
      applyLineupPanels({ matchInfo: { fixtureId: 'surname-test', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정' }, homeLineup: lineup(100), awayLineup: lineup(200), homeInjuries: [], awayInjuries: [], events: [], playerStats: [] });
    });
    for (const nameMode of ['short', 'long']) {
      await page.evaluate(nameMode => setSetting('lineup', nameMode), nameMode);
      for (const mode of ['main-big', 'main-small']) {
        for (const nodeMode of ['number', 'photo']) {
          await page.evaluate(({ mode, nodeMode }) => {
            activatePage(mode);
            setSetting('lineupNode', nodeMode);
          }, { mode, nodeMode });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const labels = await page.evaluate(() => {
            const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
            fitLineupNamePills(panel);
            return [...panel.querySelectorAll('.dp-lineup-name')].map(el => ({ text: el.textContent, lines: getRenderedTextLineCount(el), fourLines: el.classList.contains('has-four-name-lines'), split: el.classList.contains('has-surname-breaks'), overlapsLabel: [...el.closest('.dp-lineup-vertical-pitch').querySelectorAll('.dp-lineup-name')].some(other => other !== el && wrapsOverlap(el, other)), fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 }));
          });
          assert.equal(labels.length, 22, `${mode}/${nodeMode} renders both teams`);
          for (const label of labels) {
            assert(!label.text.includes('-'), `${mode}/${nodeMode}: ${label.text}`);
            assert(label.lines <= (label.fourLines ? 4 : label.split ? 3 : 2), JSON.stringify(label));
            assert(label.fits, `${mode}/${nodeMode}: ${JSON.stringify(label)}`);
            if (label.split) assert(!label.overlapsLabel, `${mode}/${nodeMode}: three-line collision ${JSON.stringify(label)}`);
          }
        }
      }
    }
    await page.setViewportSize({ width: 1920, height: 950 });
    await page.evaluate(() => {
      activatePage('main-small');
      setSetting('lineup', 'short');
      setSetting('lineupNode', 'photo');
      const names = ['V. Barclett', 'A. Jouis', 'D. lionel', 'T. Thomas', 'S. nelson', 'K. frederick', 'M. Doxilly', 'Arkelle Nicholas Cecil Jude-Boyd', 'C. Elva', 'S. byron', 'K. Caull'];
      const grids = ['1:1', '2:1', '2:2', '2:3', '2:4', '3:1', '3:2', '4:1', '4:2', '4:3', '5:1'];
      const lineup = offset => ({ formation: '4-2-3-1', coach: { name: '감독' }, startXi: names.map((name, i) => ({ playerId: offset + i, name, number: i === 7 ? 12 : i + 1, grid: grids[i], pos: i === 0 ? 'G' : 'M' })), substitutes: [] });
      applyLineupPanels({ matchInfo: { fixtureId: '1639960', homeTeamId: 1, awayTeamId: 2, homeTeamName: '세인트루시아', awayTeamName: '버뮤다' }, homeLineup: lineup(100), awayLineup: lineup(200), homeInjuries: [], awayInjuries: [], events: [], playerStats: [] });
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const formationName = await page.evaluate(() => {
      const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
      fitLineupNamePills(panel);
      const el = panel.querySelector('[data-player-id="107"] .dp-lineup-name');
      return { font: parseFloat(getComputedStyle(el).fontSize), fits: canStayWithinLineupNameLayout(el), overlap: [...panel.querySelectorAll('.dp-lineup-name')].some(other => other !== el && wrapsOverlap(el, other)) };
    });
    assert(formationName.font >= 12, JSON.stringify(formationName));
    assert(formationName.fits && !formationName.overlap, JSON.stringify(formationName));
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'screenshots/lineup-multipart-name.png') });
    // 이웃 한 줄 이름의 줄바꿈으로 두 선수의 기본 글자 크기를 함께 확보해야 한다.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      activatePage('main-big');
      setSetting('splitLineup', 'off');
      setSetting('lineup', 'short');
      setSetting('lineupNode', 'photo');
    });
    const neighborCases = await page.evaluate(() => {
      const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
      const savedStyle = panel.getAttribute('style');
      panel.style.cssText += ';width:410px;height:700px;flex:none';
      const outcomes = [];
      for (const reverse of [false, true]) for (const blocked of [false, true]) {
        const names = ['조셉 마르티네스', '앙주요안 보니', '마누엘 아칸지', '페데리코 디마르코', '카를루스 아우구스투', '피오트르 지엘린스키', '피오 에스포시토', '제드 스펜스', '페테르 수치치', '헨리크 므히타랸', '마르쿠스 튀람'];
        if (reverse) [names[1], names[3]] = [names[3], names[1]];
        const make = (formation, offset) => ({ formation, startXi: buildManualGridValues(formation).map((grid, i) => ({
          playerId: offset + i, name: names[i], grid, number: i === 2 ? 25 : 14,
          photoUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        })), substitutes: [] });
        const homeLineup = make('4-4-1-1', 100), awayLineup = make('3-4-2-1', 200);
        applyLineupPanels({ matchInfo: { fixtureId: 'neighbor-wrap', homeTeamId: 1, awayTeamId: 2 }, homeLineup, awayLineup, events: [], playerStats: [...homeLineup.startXi, ...awayLineup.startXi].map(p => ({ playerId: p.playerId, rating: 6.8 })) });
        const akanji = panel.querySelector('[data-player-id="202"] .dp-lineup-name');
        const boni = panel.querySelector(`[data-player-id="${reverse ? 203 : 201}"] .dp-lineup-name`);
        const optimize = window.regrowLineupNamesWithNeighborWrap;
        // 먼저 기존 피팅 결과를 만든 뒤 새 최적화만 독립적으로 검사한다.
        window.regrowLineupNamesWithNeighborWrap = () => {};
        try { fitLineupNamePills(panel); } finally { window.regrowLineupNamesWithNeighborWrap = optimize; }
        const labels = [...panel.querySelectorAll('.dp-lineup-name')];
        const fonts = new Map(labels.map(el => [el, 12]));
        let obstacle;
        if (blocked && !reverse) {
          // 한 줄 아래에 배지를 두어 두 줄 후보만 충돌하게 만든다.
          const wrap = boni.closest('.dp-lineup-name-wrap');
          obstacle = document.createElement('span');
          obstacle.className = 'dp-node-badge dp-node-sub-in';
          obstacle.style.cssText = 'position:absolute;left:0;top:24px;right:auto;bottom:auto;transform:none;width:113px;height:14px';
          wrap.appendChild(obstacle);
        }
        optimize(labels, fonts);
        const snapshot = () => ({
          akanji: parseFloat(getComputedStyle(akanji).fontSize), boni: parseFloat(getComputedStyle(boni).fontSize),
          boniLines: getRenderedTextLineCount(boni),
          overlap: wrapsOverlap(akanji, boni),
          clipped: !canStayWithinLineupNameLayout(akanji) || !canStayWithinLineupNameLayout(boni),
          badgeOverlap: obstacle ? wrapsOverlap(boni, obstacle) : false,
        });
        const first = snapshot();
        let widened;
        if (!blocked) {
          // 피치는 종횡비를 유지하므로 높이도 늘려야 실제 피치 폭이 넓어진다.
          panel.style.width = '600px';
          panel.style.height = '1100px';
          fitLineupNamePills(panel);
          widened = snapshot();
          panel.style.width = '410px';
          panel.style.height = '700px';
        }
        if (blocked) optimize(labels, fonts); else fitLineupNamePills(panel);
        outcomes.push({ reverse, blocked, first, widened, repeated: snapshot() });
      }
      if (savedStyle === null) panel.removeAttribute('style'); else panel.setAttribute('style', savedStyle);
      return outcomes;
    });
    for (const result of neighborCases) {
      const label = JSON.stringify(result);
      assert(!result.first.overlap && !result.first.clipped && !result.first.badgeOverlap, label);
      if (!result.blocked) {
        assert.equal(result.first.akanji, 12, label);
        assert.equal(result.first.boni, 12, label);
        assert.equal(result.first.boniLines, 2, label);
        assert.equal(result.widened.akanji, 12, label);
        assert.equal(result.widened.boniLines, 1, 'unnecessary wrapping must reset after widening: ' + label);
      }
      assert.deepEqual(result.repeated, result.first, 'repeated fitting must be stable: ' + label);
    }
    console.log('PASS: neighboring names wrap without sacrificing font size, mirrored rows, blocked candidates and repeated fitting.');
    // 실제 글꼴을 쓰는 독립 배치로 간격·DOM 순서·번호·장애물 조합을 추가 검사한다.
    const pairCases = await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'layout-big';
      host.style.cssText = 'position:fixed;left:0;top:0;width:500px;height:500px';
      host.innerHTML = '<div class="lp-lineup" style="width:500px;height:500px"><div class="dp-lineup-vertical-pitch" style="width:500px;height:500px"></div></div>';
      document.body.append(host);
      const pitch = host.querySelector('.dp-lineup-vertical-pitch');
      const cases = [];
      try {
        for (const neighborName of ['앙주요안 보니', '루카 모드리치']) for (const gap of [92, 86]) for (const mirrored of [false, true]) for (const reverseDom of [false, true]) for (const number of [true, false]) for (const obstacle of ['none', 'badge', 'circle', 'label', 'boundary']) {
          pitch.innerHTML = '';
          pitch.style.height = obstacle === 'boundary' ? '150px' : '500px';
          const make = (text, x, font, width) => {
            const wrap = document.createElement('div');
            wrap.className = 'dp-lineup-name-wrap is-away';
            wrap.style.cssText = `left:${x}px;top:100px`;
            wrap.innerHTML = buildLineupNameLabelHtml({ number: number ? 25 : '' }, text, 'dp-lineup-name');
            pitch.append(wrap);
            const el = wrap.firstElementChild;
            el.style.cssText = `font-size:${font}px;width:${width}px`;
            return el;
          };
          const a = make('마누엘 아칸지', 230, 10, 59);
          const b = make(neighborName, 230 + (mirrored ? -gap : gap), 12, 106);
          b.style.whiteSpace = 'nowrap';
          if (reverseDom) pitch.prepend(b.parentElement);
          if (obstacle !== 'none' && obstacle !== 'boundary') {
            const badge = document.createElement('div');
            badge.className = obstacle === 'badge' ? 'dp-node-sub-in' : obstacle === 'circle' ? 'dp-lineup-node' : 'dp-lineup-name';
            badge.style.cssText = `position:absolute;left:${230 + (mirrored ? -gap : gap) - 56}px;top:148px;right:auto;bottom:auto;transform:none;width:113px;height:14px`;
            if (obstacle === 'circle') badge.style.cssText = `position:absolute;left:${230 + (mirrored ? -gap : gap)}px;top:150px;transform:translate(-50%,-50%);width:20px;height:20px`;
            if (obstacle === 'label') { badge.textContent = '다른 선수'; badge.style.fontSize = '12px'; }
            pitch.append(badge);
          }
          const labels = [...pitch.querySelectorAll('.dp-lineup-name')];
          const styles = labels.map(el => el.style.cssText);
          regrowLineupNamesWithNeighborWrap(labels, new Map(labels.map(el => [el, 12])));
          const fonts = [a, b].map(el => parseFloat(getComputedStyle(el).fontSize));
          cases.push({ neighborName, gap, mirrored, reverseDom, number, blocked: obstacle !== 'none', obstacle, fonts,
            width: getDisplayLayoutRect(b).width,
            contentWidth: Math.ceil(measureMaxTextLineWidth(b) + getHorizontalChromeWidth(b) + 1),
            overlap: wrapsOverlap(a, b), fits: [a, b].every(canStayWithinLineupNameLayout),
            unchanged: labels.every((el, i) => el.style.cssText === styles[i]),
          });
        }
      } finally { host.remove(); }
      return cases;
    });
    for (const result of pairCases) {
      const label = JSON.stringify(result);
      assert(result.fits && !result.overlap, label);
      if (!result.unchanged) {
        assert(Math.min(...result.fonts) > 10, label);
        assert(result.fonts[0] + result.fonts[1] >= 22, label);
        assert(result.width <= result.contentWidth + 0.5, 'wrapped background must fit its text: ' + label);
      }
      if (result.gap === 92 && result.number && !result.blocked) assert.deepEqual(result.fonts, [12, 12], label);
      if (result.neighborName === '앙주요안 보니' && result.gap === 86 && result.number && !result.blocked) assert.deepEqual(result.fonts, [11, 11], label);
      if (result.blocked) assert(result.unchanged, label);
    }
    console.log('PASS: 160 paired name cases cover compact backgrounds, balanced fonts, mirrored/DOM order, numbers, badges, circles, labels and boundaries.');
    // 다른 선수 원의 경계 부근은 허용하되, 얼굴 중심을 덮는 이름은 계속 충돌로 본다.
    const circleTolerance = await page.evaluate(() => {
      const circle = document.createElement('div');
      circle.style.cssText = 'position:fixed;left:500px;top:100px;width:42px;height:42px';
      document.body.append(circle);
      const r = getDisplayLayoutRect(circle), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const rect = bottom => ({ left: cx - r.width, right: cx + r.width, top: cy - r.height, bottom });
      const skim = nameRectOverlapsNodeCircleSignificantly(rect(cy - r.width * 0.225 + 2), circle);
      const center = nameRectOverlapsNodeCircleSignificantly(rect(cy + 2), circle);
      circle.remove();
      return { skim, center };
    });
    assert(!circleTolerance.skim, 'small intrusion near the half-radius boundary must not force shrinking');
    assert(circleTolerance.center, 'text covering the player center must still be corrected');

    // 분할 OFF의 모든 홈·원정 조합에서 이름표가 읽을 수 있는 크기로 남고 서로 겹치지 않아야 한다.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      setSetting('splitLineup', 'off');
      setSetting('lineup', 'short');
      setSetting('lineupNode', 'photo');
    });
    for (const config of [
      { mode: 'main-big', label: 'camera-410x700', width: 410, height: 700 },
      { mode: 'main-big', label: 'camera-default' },
      { mode: 'main-big', label: 'camera-360x650', width: 360, height: 650 },
      { mode: 'main-big', label: 'camera-short', width: 410, height: 700, short: true },
      { mode: 'main-small', label: 'dashboard' },
    ]) {
      const { mode } = config;
      await page.evaluate(mode => activatePage(mode), mode);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const audit = await page.evaluate(config => {
        const panel = document.querySelector('.page.active [data-dp-role="lineup"]');
        const originalStyle = panel.getAttribute('style');
        if (config.width) panel.style.cssText += `;width:${config.width}px;height:${config.height}px;flex:none`;
        const size = getDisplayLayoutRect(panel);
        const names = ['마이크 메냥', '마리오 힐라', '코니 더빈터르', '스트라히냐 파블로비치', '오마리 허친슨', '루카 모드리치', '아르돈 야샤리', '다비데 바르테사기', '모하메드 쿠두스', '데얀 쿨루셰프스키', '코너 갤러거'];
        const make = (formation, offset, short) => ({ formation, startXi: buildManualGridValues(formation).map((grid, i) => ({
          playerId: offset + i, name: short ? names[i].split(' ').at(-1) : names[i], number: i + 1, grid,
          photoUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        })), substitutes: [] });
        let count = 0;
        const failures = [];
        const check = (home, away, short = false) => {
          short = short || !!config.short;
          settingsState.lineupShowNumber = short ? 'off' : 'on';
          const homeLineup = make(home, 100, short), awayLineup = make(away, 200, short);
          applyLineupPanels({ matchInfo: { fixtureId: 'formation-name-clearance', homeTeamId: 1, awayTeamId: 2, homeTeamName: '홈', awayTeamName: '원정' }, homeLineup, awayLineup, events: [], playerStats: [...homeLineup.startXi, ...awayLineup.startXi].map(p => ({ playerId: p.playerId, rating: 6.8 })) });
          // 윙백 교체 표시는 실제와 같은 별도 레이어에 넣어 수비 이름표와의 접촉도 검사한다.
          for (const side of ['home', 'away']) {
            const lineup = side === 'home' ? homeLineup : awayLineup;
            if (lineup.formation !== '3-5-1-1') continue;
            for (const { slot, player } of getFormationAssignments(lineup)) {
              if (slot.coord.x !== 18) continue;
              const node = panel.querySelector(`.dp-lineup-node.is-${side}[data-player-id="${player.playerId}"]`);
              const layer = node.cloneNode(false);
              layer.className = node.className.replace('dp-lineup-node', 'dp-lineup-sub-layer');
              layer.innerHTML = '<span class="dp-lineup-avatar dp-sub-layer-size"></span>' + lpBuildNodeSubBadgesHtml({ subIn: { time: { elapsed: 89 } } });
              node.after(layer);
            }
          }
          fitLineupNamePills(panel);
          const labels = [...panel.querySelectorAll('.dp-lineup-name')];
          const midline = getDisplayLayoutRect(panel.querySelector('.dp-lineup-marking-midline'));
          const mid = (midline.top + midline.bottom) / 2;
          const coords = TACTICS_FM[home], frontX = Math.max(...coords.map(coord => coord.x));
          const expectedSolo = config.mode === 'main-big' && coords.filter(coord => coord.x === frontX).length === 1;
          const soloLabels = labels.filter(el => el.parentElement.matches('.is-combined-solo-forward.is-home'));
          if (config.mode === 'main-big') for (const side of ['home', 'away']) {
            const lineup = side === 'home' ? homeLineup : awayLineup;
            if (lineup.formation !== '3-5-1-1') continue;
            const ratings = [...panel.querySelectorAll(`.dp-lineup-node.is-combined-midfielder.is-${side} .dp-node-rating`)];
            const baseline = Math.max(...ratings.map(el => getDisplayLayoutRect(el).bottom));
            const wingNames = labels.filter(el => el.parentElement.matches(`.is-combined-wingback.is-${side}`));
            if (wingNames.length !== 2 || wingNames.some(el => Math.abs(getDisplayLayoutRect(el).bottom - baseline) > 1)) {
              failures.push({ home, away, reason: side + ' wingback label bottoms must align with midfield ratings' });
            }
          }
          const bad = labels.filter(el => parseFloat(getComputedStyle(el).fontSize) < 9
            || el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
            || nameOverlapsAnyNodeCircle(el, getSiblingNodeCirclesForLabel(el))
            || getPriorityLineupBadgeTargets(el).some(badge => wrapsOverlap(el, badge))
            // 정확한 접촉이 새 충돌을 만들면 이름표 아래 절반이 닿는 가까운 안전 위치를 허용한다.
            || (el.parentElement.matches('.is-combined-solo-forward.is-home') && Math.abs(getDisplayLayoutRect(el).bottom - mid) > getDisplayLayoutRect(el).height / 2)
            || labels.some(other => other !== el && wrapsOverlap(el, other)));
          if (labels.length !== 22 || bad.length || soloLabels.length !== Number(expectedSolo)) failures.push({ home, away, short, count: labels.length, bad: bad.map(el => ({ text: el.textContent, font: getComputedStyle(el).fontSize })) });
          count++;
        };
        try {
          for (const home of Object.keys(TACTICS_FM)) for (const away of Object.keys(TACTICS_FM)) check(home, away);
          check('3-4-2-1', '3-4-2-1', true);
          check('4-4-1-1', '3-4-2-1', true);
        } finally {
          if (originalStyle === null) panel.removeAttribute('style'); else panel.setAttribute('style', originalStyle);
          settingsState.lineupShowNumber = 'on';
        }
        return { count, failures, width: size.width, height: size.height };
      }, config);
      assert.equal(audit.failures.length, 0, config.label + ': ' + JSON.stringify(audit.failures.slice(0, 12)));
      console.log('PASS: ' + config.label + ' (' + Math.round(audit.width) + 'x' + Math.round(audit.height) + ') combined lineup name clearance, ' + audit.count + ' formation/name cases.');
    }
    // 실제 모달 스타일을 적용하여 양쪽 스크롤 방향을 시각적으로 검증합니다.
    await page.evaluate(() => {
      const { modal, mount } = evHideCreateModal('교체 선수 수정', 'ev-subst-cluster-modal');
      const columns = document.createElement('div');
      columns.className = 'ev-subst-cluster-cols';
      for (let col = 0; col < 3; col += 1) {
        const box = document.createElement('div');
        box.className = 'ev-subst-cluster-col';
        const heading = document.createElement('div');
        heading.className = 'ev-subst-cluster-head';
        heading.textContent = `74′ 교체 ${col + 1}`;
        const list = document.createElement('div');
        list.className = 'ev-subst-picker-list';
        for (let i = 1; i <= 20; i += 1) list.appendChild(evEditPlayerItem(String(i), i === 1 ? '현재: Ajani Burchall' : 'J. Hill', 'F', i === 1, () => {}));
        box.append(heading, list);
        columns.appendChild(box);
      }
      modal.appendChild(columns);
      mount();
    });
    await page.locator('.ev-subst-cluster-modal').screenshot({ path: path.join(root, 'screenshots/substitution-scrollbars.png') });
    assert.deepEqual(errors, []);
    console.log(`PASS: Everton #2 full name renders in three lines at ${fullNames.long.font}px (without the surname hint: ${fullNames.beforeFix.font}px).`);
    console.log('PASS: short/full names, larger-font selection, two-line ties, collision rejection, hidden initials, photo numbers, resize reset and 22-player big/small formations.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
