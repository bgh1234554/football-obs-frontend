const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
 const browser = await chromium.launch();
 try {
  const page = await openPage(browser, {viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{openSettingsPopup();applySettingsTab('background');});
  const select=page.locator('[data-settings-select="greenscreenIntensity"]');
  await select.evaluate(el=>el.click());
  assert.equal(await page.locator('.obs-select-list').count(),0);
  await page.evaluate(()=>{window.obsstudio={};});
  await select.click();
  const list=page.locator('.obs-select-list');
  await list.waitFor({state:'visible'});
  assert.equal(await list.locator('[role="option"]').count(),await select.locator('option').count());
  await list.getByRole('option',{name:'어두운 시안',exact:true}).click();
  assert.equal(await select.inputValue(),'mild');
  assert.equal(await page.evaluate(()=>getSetting('greenscreenIntensity')),'mild');
  assert.equal(await list.isVisible(),false);
  await select.focus(); await select.press('Enter');
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  assert.equal(await select.inputValue(),'strong');
  await select.click(); await page.keyboard.press('Escape');
  assert.equal(await list.isVisible(),false);
  assert.equal(await select.inputValue(),'strong');
  await select.click();
  await page.screenshot({path:'screenshots/tests/obs-select.png'});
  const bounds=await list.boundingBox(); assert(bounds.y>=0 && bounds.y+bounds.height<=900);
  await page.locator('.sp-section-title:visible').first().click();
  assert.equal(await list.isVisible(),false);
  await page.reload();
  assert.equal(await page.evaluate(()=>getSetting('greenscreenIntensity')),'strong');
  assert.deepEqual(errors,[]);
  console.log('PASS OBS-only select, options, mouse, keyboard, dismissal and persistence');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

