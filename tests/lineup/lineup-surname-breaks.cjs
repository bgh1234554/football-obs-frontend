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
    assert.equal(formationName.font, 12, JSON.stringify(formationName));
    assert(formationName.fits && !formationName.overlap, JSON.stringify(formationName));
    fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'screenshots/lineup-multipart-name.png') });
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
