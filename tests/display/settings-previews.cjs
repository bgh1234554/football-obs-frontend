const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openPage(browser, { viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      openSettingsPopup();
      setSetting('lineupNode', 'photo');
      setSetting('lineupShowOutScorers', 'off');
      applySettingsTab('lineup');
    });
    const camera = page.frameLocator('[data-example-group="camera"] iframe');
    await camera.locator('.dp-lineup-avatar').waitFor();
    assert.match(await camera.locator('.dp-lineup-avatar').getAttribute('style'), /settings-preview-salah/);
    assert.match(await camera.locator('.dp-lineup-name').innerText(), /살라/);
    assert.equal(await page.locator('[data-example-group="camera"] iframe').count(), 1);
    assert.equal(await page.locator('[data-example-group="camera"] .sp-row').count(), 6);
    for (const [category, selector] of [
      ['lineupShowGoals', '.dp-node-goal'], ['lineupShowCards', '.dp-node-card'],
      ['lineupShowRating', '.dp-node-rating'], ['lineupShowSubTime', '.dp-node-sub-in'],
    ]) {
      for (const value of ['off', 'on']) {
        await page.evaluate(({ category, value }) => setSetting(category, value), { category, value });
        await page.waitForFunction(({ category, value }) => {
          const body = document.querySelector('[data-example-group="camera"] iframe')?.contentDocument?.body;
          const expected = { lineupShowGoals: 'goals', lineupShowCards: 'cards', lineupShowRating: 'rating', lineupShowSubTime: 'subtime' }[category];
          return body && body.classList.contains(`no-lineup-${expected}`) === (value === 'off');
        }, { category, value });
        assert.equal(await camera.locator(selector).isVisible(), value === 'on', category);
      }
    }
    await page.evaluate(() => setSetting('lineupShowOutScorers', 'on'));
    assert.equal(await camera.locator('.dp-lineup-outscorer').count(), 0);
    await page.locator('[data-example-group="camera"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-example-group="camera"] iframe');
      const label = frame?.contentDocument?.querySelector('.dp-lineup-name');
      return label && label.getBoundingClientRect().bottom <= frame.clientHeight;
    });
    await page.locator('.sp-modal').screenshot({ path: 'screenshots/tests/settings-real-camera.png' });
    await page.evaluate(() => applySettingsTab('names'));
    await page.waitForFunction(() => ['scorer', 'roster'].every(category => {
      const frame = document.querySelector(`.sp-row:has([data-settings-cat="${category}"]) iframe`);
      return frame && frame.getBoundingClientRect().height > 0;
    }));
    for (const category of ['scorer', 'roster']) {
      const aligned = await page.locator(`.sp-row:has([data-settings-cat="${category}"]) iframe`).evaluate(frame => {
        const row = frame.closest('.sp-row').getBoundingClientRect();
        const box = frame.getBoundingClientRect();
        const sample = frame.contentDocument.querySelector('.note, .dp-item').getBoundingClientRect();
        const scale = box.width / frame.clientWidth;
        const center = box.top + (sample.top + sample.height / 2) * scale;
        return sample.height > 0 && Math.abs(center - (row.top + row.height / 2)) < 2;
      });
      assert(aligned, `${category}: example must be visible and vertically centered`);
    }
    assert(await page.locator('[data-example-group="lineup"]').evaluate(group =>
      Math.abs(group.getBoundingClientRect().height - group.querySelector('.sp-example-controls').getBoundingClientRect().height) < 1
    ), 'Lineup preview must not add a blank area below the first two settings');
    assert.equal(await page.locator('[data-example-group="lineup"] .sp-row').count(), 2);
    assert.equal(await page.locator('[data-settings-cat="scorer"]').evaluate(el => !!el.closest('.sp-example-group')), false);
    const events = page.frameLocator('.sp-row:has([data-settings-cat="event"]) iframe');
    const scoreboard = page.frameLocator('.sp-row:has([data-settings-cat="teamName"]) iframe');
    assert.equal(await page.locator('.sp-row:has([data-settings-cat="teamName"]) iframe').count(), 0);
    assert.match(await page.locator('.sp-preview-empty').innerText(), /경기를 불러오면/);
    for (const value of ['short', 'long']) {
      await page.evaluate(value => { setSetting('event', value); setSetting('teamName', value); }, value);
      await page.waitForFunction(value => {
        const eventDoc = document.querySelector('.sp-row:has([data-settings-cat="event"]) iframe')?.contentDocument;
        return eventDoc?.body.textContent.includes(value === 'long' ? '우스만 뎀벨레' : 'O. 뎀벨레');
      }, value);
      assert.equal(await events.locator('.ev-row').count(), 2);
    }
    const notes = page.frameLocator('[data-example-group="notes"] iframe');
    await page.evaluate(() => {
      window.previewDocuments = [...document.querySelectorAll('.sp-live-example')].map(frame => [frame, frame.contentDocument]);
    });
    const initialHeight = await page.locator('.sp-modal').evaluate(el => el.getBoundingClientRect().height);
    for (const value of ['off', 'on']) {
      await page.evaluate(value => { setSetting('noteShowPenaltyMisses', value); setSetting('noteShowRedCards', value); }, value);
      await notes.locator('.note-line-own-goal').waitFor();
      assert.equal(await notes.locator('.note-line-pk-miss').count(), value === 'on' ? 1 : 0);
      assert.equal(await notes.locator('.note-line-red-card').count(), value === 'on' ? 1 : 0);
      assert.equal(await page.locator('.sp-modal').evaluate(el => el.getBoundingClientRect().height), initialHeight);
      assert(await page.evaluate(() => window.previewDocuments.every(([frame, doc]) => frame.contentDocument === doc)), 'Toggles must update existing documents without reloading previews');
    }
    assert.match(await notes.locator('.note-line-pk-miss').getAttribute('aria-label'), /^56' \(PK 실축\) 마그네스 아클리우슈$/);
    const lineup = page.frameLocator('[data-example-group="camera"] iframe');
    for (const size of [10, 16]) {
      await page.evaluate(size => setSetting('lineupNameSize', size), size);
      assert.equal(await lineup.locator('.dp-lineup-name').first().evaluate(el => getComputedStyle(el).fontSize), '12px');
    }
    await page.evaluate(() => setSetting('lineupNameSize', 12));
    for (const category of ['lineup', 'lineupHideInitial', 'scorer', 'roster', 'event']) {
      for (const enabled of [false, true]) {
        await page.evaluate(({ category, enabled }) => {
          const sides = getSwitchSides(category);
          setSetting(category, enabled ? sides.on : sides.off);
        }, { category, enabled });
        assert(await page.evaluate(() => window.previewDocuments.every(([frame, doc]) => frame.contentDocument === doc)), `${category}: existing preview documents must remain loaded`);
      }
    }
    await page.evaluate(() => setSetting('notePenaltyMissColor', '#123456'));
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-example-group="notes"] iframe')?.contentDocument?.querySelector('.note-line-pk-miss');
      return element && element.ownerDocument.defaultView.getComputedStyle(element).color === 'rgb(18, 52, 86)';
    });
    assert.equal(await notes.locator('.note-line-pk-miss').evaluate(el => getComputedStyle(el).color), 'rgb(18, 52, 86)');
    await page.evaluate(() => setSetting('notePenaltyMissColor', '#fb923c'));
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-example-group="notes"] iframe')?.contentDocument?.querySelector('.note-line-pk-miss');
      return element && element.ownerDocument.defaultView.getComputedStyle(element).color === 'rgb(251, 146, 60)';
    });
    await page.locator('.sp-modal').screenshot({ path: 'screenshots/tests/settings-real-names.png' });
    for (const width of [1280, 430]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const tab of ['names', 'lineup']) {
        await page.evaluate(tab => applySettingsTab(tab), tab);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const boxes = await page.locator('.sp-setting-example:visible').evaluateAll(elements => elements.filter(el => !el.parentElement.classList.contains('sp-example-below')).map(el => {
          const box = el.getBoundingClientRect();
          const row = el.parentElement.getBoundingClientRect();
          return { width: box.width, inside: box.left >= row.left - 1 && box.right <= row.right + 1 };
        }));
        assert(boxes.every(box => box.inside));
        assert(boxes.every(box => Math.abs(box.width - boxes[0].width) < 1));
        if (tab === 'names' && await page.locator('.sp-row:has([data-settings-cat="teamName"]) iframe').count()) {
          assert(await scoreboard.locator('.scoreboard-main').evaluate(main => [...main.children].filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none').every(el => {
            const rect = el.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= innerWidth + 1;
          })));
        }
      }
    }
    await page.evaluate(() => {
      applySettingsTab('names');
      lineupPanelState.lastFixture = { matchInfo: { fixtureId: 'settings-preview-test' } };
      state.homeName = '로드한 홈팀';
      state.awayName = '로드한 원정팀';
      state.homeScore = 3;
      state.awayScore = 0;
      render();
      fsmBoardRender();
      document.querySelector('#team-text-left').textContent = '로드한 홈팀';
      document.querySelector('#team-text-right').textContent = '로드한 원정팀';
      document.querySelector('#homeScore').textContent = '3';
      document.querySelector('#clock').textContent = '67:30';
    });
    await page.waitForFunction(() => {
      const doc = document.querySelector('.sp-row:has([data-settings-cat="teamName"]) iframe')?.contentDocument;
      return doc?.querySelector('#homeScore')?.textContent === '3' && doc.querySelector('#team-text-left')?.textContent === '로드한 홈팀';
    });
    assert.equal(await scoreboard.locator('#team-text-right').innerText(), '로드한 원정팀');
    assert.equal(await scoreboard.locator('#clock').innerText(), '67:30');
    for (const selector of ['#team-text-left', '#team-text-right']) {
      assert(await scoreboard.locator(selector).evaluate(text => {
        const glyph = text.getBoundingClientRect();
        const cell = text.closest('.team-name').getBoundingClientRect();
        return glyph.width > 0 && glyph.height > 0 && glyph.top < cell.bottom && glyph.bottom > cell.top;
      }), `${selector}: live team name must remain inside its cell`);
    }
    await page.evaluate(() => { state.homeScore = 4; render(); fsmBoardRender(); });
    await page.waitForFunction(() => document.querySelector('.sp-row:has([data-settings-cat="teamName"]) iframe')?.contentDocument?.querySelector('#homeScore')?.textContent === '4');
    // 문서는 유지하더라도 현재 경기의 테마 CSS가 함께 바뀌어야 합니다.
    for (const theme of ['superlig', 'ligue1', 'default']) {
      await page.evaluate(theme => applyTheme(theme, null), theme);
      await page.waitForFunction(() => !pendingThemeLink);
      await page.waitForFunction(() => {
        const doc = document.querySelector('.sp-row:has([data-settings-cat="teamName"]) iframe')?.contentDocument;
        const source = document.querySelector('#fsm-theme-link');
        const copy = doc?.querySelector('#fsm-theme-link');
        if (!copy?.sheet || copy.href !== source.href) return false;
        return ['#homeCard', '#team-text-left', '#team-score-left'].every(selector => {
          const expected = getComputedStyle(document.querySelector(selector));
          const actual = doc.defaultView.getComputedStyle(doc.querySelector(selector));
          return expected.color === actual.color && expected.backgroundColor === actual.backgroundColor && expected.backgroundImage === actual.backgroundImage;
        });
      }, null, { timeout: 5000 }).catch(async error => {
        console.error(JSON.stringify(await page.evaluate(() => {
          const doc = document.querySelector('.sp-row:has([data-settings-cat="teamName"]) iframe').contentDocument;
          const read = (root, view) => ({ href: root.querySelector('#fsm-theme-link')?.href, pending: [...root.querySelectorAll('link[data-preview-theme-pending]')].map(link => link.href), values: ['#homeCard', '#team-text-left', '#team-score-left'].map(selector => { const css = view.getComputedStyle(root.querySelector(selector)); return [selector, css.color, css.backgroundColor, css.backgroundImage]; }) });
          return { source: read(document, window), preview: read(doc, doc.defaultView) };
        }),null,2));
        throw error;
      });
      await page.waitForFunction(() => {
        const doc = document.querySelector('.sp-row:has([data-settings-cat="teamName"]) iframe').contentDocument;
        const board = doc.querySelector('.fsm-board');
        const view = doc.defaultView;
        const elements = [...board.querySelectorAll('.scoreboard-main *, .scoreboard-timer *')].filter(el => {
          const css = view.getComputedStyle(el);
          return el.getClientRects().length && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0;
        });
        return elements.every(el => {
          const rect = el.getBoundingClientRect();
          return !rect.width || !rect.height || rect.top >= -1 && rect.bottom <= view.innerHeight + 1;
        });
      }, null, { timeout: 5000 });
      assert(await page.evaluate(() => window.previewDocuments.every(([frame, doc]) => frame.contentDocument === doc)), 'Theme CSS must update without reloading preview documents');
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('.sp-modal').screenshot({ path: 'screenshots/tests/settings-loaded-board.png' });
    for (const category of ['teamName', 'event']) {
      assert.equal(await page.evaluate(async category => {
        const container = document.querySelector(`.sp-row:has([data-settings-cat="${category}"]) .sp-setting-example`);
        const frame = container.querySelector('iframe');
        const view = frame.contentWindow;
        const original = view.addEventListener;
        let added = 0;
        view.addEventListener = function(type, ...args) {
          if (type === 'resize') added++;
          return original.call(this, type, ...args);
        };
        try {
          for (let i = 0; i < 5; i++) {
            container.dataset.renderSignature = '';
            renderSettingsLiveExample(container, category);
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        } finally { view.addEventListener = original; }
        const fit = frame._fitSettingsPreview;
        let calls = 0;
        frame._fitSettingsPreview = () => { calls++; };
        view.dispatchEvent(new view.Event('resize'));
        frame._fitSettingsPreview = fit;
        return added === 0 && calls === 1;
      }, category), true, `${category}: one resize dispatcher must use the latest fitter`);
    }
    assert.deepEqual(errors, []);
    console.log('Settings previews: shared renderers, combined toggles, colors and responsive alignment passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
