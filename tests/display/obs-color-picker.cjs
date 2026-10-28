const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const clickColor = category => page.locator(`input[data-settings-color="${category}"]`).evaluate(el => el.click());
    await page.evaluate(() => { openSettingsPopup(); applySettingsTab('background'); });
    await clickColor('bgColor');
    assert.equal(await page.locator('#obsColorPicker').count(), 0, 'Normal browsers retain the native picker');
    await page.evaluate(() => { window.obsstudio = {}; });
    await clickColor('bgColor');
    const picker = page.locator('#obsColorPicker');
    await picker.waitFor({ state: 'visible' });
    await picker.locator('[data-picker-rgb="0"]').fill('255');
    await picker.locator('[data-picker-rgb="0"]').press('Tab');
    assert((await page.evaluate(() => getSetting('bgColor'))).startsWith('#ff'), JSON.stringify(await page.evaluate(() => ({value:getSetting('bgColor'), hex:document.querySelector('[data-picker-hex]').value, rgb:[...document.querySelectorAll('[data-picker-rgb]')].map(c=>c.value), active:document.activeElement.outerHTML}))));
    const format = picker.locator('.obs-color-format');
    await format.click();
    assert(await picker.locator('[data-picker-fields="hsl"]').isVisible());
    for (const [index, value] of [[0, '120'], [1, '100'], [2, '50']]) {
      await picker.locator(`[data-picker-hsl="${index}"]`).fill(value);
      await picker.locator(`[data-picker-hsl="${index}"]`).press('Tab');
    }
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#00ff00');
    await format.click();
    await picker.locator('[data-picker-hex]').fill('#123456');
    await picker.locator('[data-picker-hex]').press('Tab');
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#123456', 'HEX applies immediately');
    await picker.locator('[data-picker-hex]').fill('#invalid');
    await picker.locator('[data-picker-hex]').press('Tab');
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#123456');
    await picker.locator('[data-picker-hex]').press('Escape');
    assert.equal(await picker.isVisible(), false);
    assert.equal(await page.evaluate(() => getSetting('bgColor')), '#123456', 'Closing retains the selected color');
    await clickColor('bgColor');
    await picker.locator('[data-picker-hue]').fill('120');
    const plane = picker.locator('.obs-color-plane');
    const box = await plane.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .2, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await page.evaluate(() => getSetting('bgColor')), '#123456');
    await plane.focus();
    const beforeArrow = await page.evaluate(() => getSetting('bgColor'));
    await plane.press('ArrowDown');
    assert.notEqual(await page.evaluate(() => getSetting('bgColor')), beforeArrow);
    await page.screenshot({ path: 'screenshots/tests/obs-color-picker.png' });
    await plane.press('Escape');
    await page.evaluate(() => { closeSettingsPopup(); document.getElementById('inHomeBg').click(); });
    await picker.locator('[data-picker-hex]').fill('#654321');
    await picker.locator('[data-picker-hex]').press('Tab');
    assert.equal(await page.evaluate(() => state.colors.homeBg), '#654321');
    await picker.locator('[data-picker-hex]').press('Escape');
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('*')].find(el => typeof el.openColorEditor === 'function');
      chip.openColorEditor({ clientX: 40, clientY: 70 });
      document.querySelector('.team-color-dialog input[type="color"]').click();
    });
    assert.equal(await page.locator('.team-color-dialog').evaluate(el => el.matches(':popover-open')), true, 'The parent team popup stays open');
    await format.click();
    await picker.locator('[data-picker-rgb="0"]').fill('163');
    await picker.locator('[data-picker-rgb="1"]').fill('51');
    await picker.locator('[data-picker-rgb="2"]').fill('89');
    assert.equal(await page.evaluate(() => state.colors.homeBg), '#a33359', 'Quick team colors update while typing');
    const batch = await page.evaluate(async () => {
      const source = document.querySelector('.team-color-dialog input[type="color"]');
      const slider = document.querySelector('[data-picker-hue]');
      let inputs = 0, changes = 0;
      const onInput = () => inputs++;
      const onChange = () => changes++;
      source.addEventListener('input', onInput);
      source.addEventListener('change', onChange);
      try {
        for (let i = 0; i < 120; i++) {
          slider.value = i;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(requestAnimationFrame);
        const preview = { inputs, changes, value: source.value, saved: state.colors.homeBg };
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return { preview, inputs, changes, value: source.value, saved: state.colors.homeBg };
      } finally {
        source.removeEventListener('input', onInput);
        source.removeEventListener('change', onChange);
      }
    });
    assert.equal(batch.preview.inputs, 1, 'A burst of drag events previews once per frame');
    assert.equal(batch.preview.changes, 0, 'Team previews do not persist or fully render');
    assert.notEqual(batch.preview.value, batch.preview.saved, 'The visible color previews before persistence');
    assert.equal(batch.changes, 1, 'Finishing the drag commits once without duplicate writes');
    assert.equal(batch.saved, batch.value, 'The final color is saved immediately');
    await page.screenshot({ path: 'screenshots/tests/obs-color-picker-team.png' });
    await picker.locator('[data-picker-rgb="0"]').press('Escape');
    assert.equal(await page.locator('.team-color-dialog').evaluate(el => el.matches(':popover-open')), true, 'Escape closes only the color picker');
    await page.evaluate(() => document.querySelector('.team-color-dialog').hidePopover());
    await page.evaluate(() => { openSettingsPopup(); applySettingsTab('background'); });
    await clickColor('bgColor');
    const settingsBatch = await page.evaluate(async () => {
      const input = document.querySelector('input[data-settings-color="bgColor"]');
      const slider = document.querySelector('[data-picker-hue]');
      let changes = 0;
      const count = () => changes++;
      input.addEventListener('change', count);
      try {
        for (let i = 0; i < 120; i++) {
          slider.value = i;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(requestAnimationFrame);
        const previewChanges = changes;
        slider.value = 240;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('obsColorPicker').hidePopover();
        return { previewChanges, changes, saved: getSetting('bgColor'), value: input.value };
      } finally { input.removeEventListener('change', count); }
    });
    assert.equal(settingsBatch.previewChanges, 0, 'Settings previews never dispatch change');
    assert.equal(settingsBatch.changes, 1, 'Closing commits the latest settings color once');
    assert.equal(settingsBatch.saved, settingsBatch.value);
    const previews = await page.evaluate(() => {
      const originalSave = saveSettings, originalRender = render, originalLayout = applyLayoutSettings;
      let saves = 0, renders = 0, layouts = 0, events = 0;
      const count = () => events++;
      const before = JSON.stringify(settingsState);
      const storage = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const ratings = document.createElement('div');
      ratings.innerHTML = '<span class="dp-rating">7.5</span><span class="dp-node-rating">7.5</span><span class="dp-rating">8.5</span>';
      document.body.append(ratings);
      saveSettings = () => { saves++; return true; };
      render = () => { renders++; };
      applyLayoutSettings = () => { layouts++; };
      document.addEventListener('settings:change', count);
      try {
        const categories = [...new Set([...document.querySelectorAll('input[data-settings-color]')].map(input => input.dataset.settingsColor))];
        for (const category of categories) {
          const input = document.querySelector(`input[data-settings-color="${category}"]`);
          input.value = '#a33359';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return {
          saves, renders, layouts, events, categories,
          unchanged: before === JSON.stringify(settingsState) && storage === localStorage.getItem(SETTINGS_STORAGE_KEY),
          rated: ratings.children[0].style.background,
          nodeRated: ratings.children[1].style.background,
          unrelated: ratings.children[2].style.background,
          panel: document.documentElement.style.getPropertyValue('--info-panel-rgb'),
          note: document.documentElement.style.getPropertyValue('--note-own-goal')
        };
      } finally {
        saveSettings = originalSave; render = originalRender; applyLayoutSettings = originalLayout;
        document.removeEventListener('settings:change', count); ratings.remove();
      }
    });
    assert.equal(previews.saves + previews.renders + previews.layouts + previews.events, 0, 'Every settings color previews without persistence, full render, layout or change broadcasts');
    assert(previews.unchanged, 'Preview leaves saved settings and localStorage unchanged');
    assert.equal(previews.rated, 'rgb(163, 51, 89)');
    assert.equal(previews.nodeRated, previews.rated);
    assert.equal(previews.unrelated, 'rgb(163, 51, 89)', 'Each rating category receives its own preview');
    assert(previews.panel.length > 0 && previews.note.length > 0);
    await clickColor('bgColor');
    await page.locator('#settingsBgPresetOpen').click();
    assert.equal(await picker.isVisible(), false, 'Clicking outside closes the picker');
    const saved = await page.evaluate(() => getSetting('bgColor'));
    await page.reload();
    assert.equal(await page.evaluate(() => getSetting('bgColor')), saved);
    assert.deepEqual(errors, []);
    console.log('PASS OBS-only picker, RGB/HSL/HEX, live selection, drag, keyboard, light dismiss and persistence');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
