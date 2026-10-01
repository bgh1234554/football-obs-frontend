const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const slots=()=>page.evaluate(()=>lineupPanelState.gridState.slotPlayerIds);
    const select=()=>page.locator('#manualGridFormation');
    for(const side of ['home','away']) {
      await page.evaluate(side=>{
        const lineup={formation:'3-5-2',startXi:Array.from({length:11},(_,i)=>({playerId:i>=9?0:100+i,name:i>=9?'same name':`player ${i}`,number:i+1,grid:buildManualGridValues('3-5-2')[i]})),substitutes:[]};
        const fixture={matchInfo:{fixtureId:`formation-${side}`,homeTeamId:1,awayTeamId:2,homeTeamName:'Home',awayTeamName:'Away'},homeLineup:structuredClone(lineup),awayLineup:structuredClone(lineup),events:[],playerStats:[]};
        applyLineupPanels(fixture);openManualPanel('lineup',side);
      },side);
      const initial=await slots();
      await select().selectOption('5-3-2');
      assert.deepEqual(await slots(),[0,4,1,2,3,8,5,6,7,9,10].map(i=>initial[i]));
      await select().selectOption('3-1-4-2');
      await select().selectOption('3-5-2');
      assert.deepEqual(await slots(),initial);
      await page.locator('.dp-grid-row[data-slot-index="1"]').dragTo(page.locator('.dp-grid-row[data-slot-index="3"]'));
      const moved=await slots();assert.notDeepEqual(moved,initial);
      await select().selectOption('5-3-2');
      assert.deepEqual(await slots(),[0,4,1,2,3,8,5,6,7,9,10].map(i=>moved[i]));
      const savedSlots=await slots();
      await page.locator('#manualPanelSave').click();
      await page.evaluate(side=>openManualPanel('lineup',side),side);
      assert.deepEqual(await slots(),savedSlots,'save/reopen must preserve roles');
      await select().selectOption('3-5-2');assert.deepEqual(await slots(),moved);
      await page.locator('#manualPanelCancel').click();
      await page.evaluate(side=>openManualPanel('lineup',side),side);
      assert.deepEqual(await slots(),savedSlots,'cancel must not modify stored formation');
      await page.locator('#manualPanelCancel').click();
    }
    // The real selector must keep both wings on their side and send CAM beside ST.
    for(const [from,to,expected] of [
      ['4-3-3','3-4-3',[0,2,6,3,1,5,7,4,8,9,10]],
      ['4-2-1-3','3-3-1-3',[0,2,5,3,1,6,4,7,8,9,10]],
      ['4-4-2','4-2-2-2',[0,1,2,3,4,6,7,5,8,9,10]],
      ['4-2-3-1','4-4-2',[0,1,2,3,4,7,5,6,9,8,10]],
      ['4-2-3-1','4-2-2-2',[0,1,2,3,4,5,6,7,9,8,10]],
      ['4-3-3','4-1-4-1',[0,1,2,3,4,6,8,5,7,10,9]],
      ['4-3-3','5-2-3',[0,1,2,6,3,4,5,7,8,9,10]],
      ['4-3-1-2','3-4-1-2',[0,2,6,3,1,5,7,4,8,9,10]],
      ['4-3-2-1','3-4-2-1',[0,2,6,3,1,5,7,4,8,9,10]],
      ['4-5-1','4-4-1-1',[0,1,2,3,4,5,6,7,9,8,10]],
      ['4-2-3-1','3-5-2',[0,2,5,3,1,7,6,9,4,8,10]],
      ['4-3-3','4-3-1-2',[0,1,2,3,4,5,6,7,9,8,10]],
      ['4-4-2','5-4-1',[0,1,2,7,3,4,5,6,9,8,10]],
    ]) {
      await page.evaluate(from=>{
        const lineup={formation:from,startXi:Array.from({length:11},(_,i)=>({playerId:100+i,name:`player ${i}`,grid:buildManualGridValues(from)[i]})),substitutes:[]};
        applyLineupPanels({matchInfo:{fixtureId:`cross-${from}`,homeTeamId:1,awayTeamId:2},homeLineup:lineup,awayLineup:lineup,events:[],playerStats:[]});
        openManualPanel('lineup','home');
      },from);
      const before=await slots();await select().selectOption(to);
      assert.deepEqual(await slots(),expected.map(i=>before[i]));
      await select().selectOption(from);assert.deepEqual(await slots(),before);
      await page.locator('#manualPanelCancel').click();
    }
    await page.evaluate(()=>{
      const from='4-3-3';
      const lineup={formation:from,startXi:Array.from({length:11},(_,i)=>({playerId:300+i,name:`player ${i}`,grid:buildManualGridValues(from)[i]})),substitutes:[]};
      applyLineupPanels({matchInfo:{fixtureId:'formation-chain-drag',homeTeamId:1,awayTeamId:2},homeLineup:lineup,awayLineup:lineup,events:[],playerStats:[]});
      openManualPanel('lineup','home');
    });
    await page.locator('.dp-grid-row[data-slot-index="5"]').dragTo(page.locator('.dp-grid-row[data-slot-index="6"]'));
    const moved=await slots();
    await select().selectOption('5-2-3');
    const direct=await slots();
    assert.deepEqual(direct,[0,1,2,6,3,4,5,7,8,9,10].map(i=>moved[i]));
    await select().selectOption('4-3-3');assert.deepEqual(await slots(),moved);
    await select().selectOption('3-4-3');
    await select().selectOption('5-2-3');
    assert.deepEqual(await slots(),direct,'direct and staged changes must keep the same edited players');
    await page.locator('#manualPanelCancel').click();
    // Full-form inputs and its movement UI use the same mapping without losing partial rows.
    await page.evaluate(()=>{
      applyLineupPanels({matchInfo:{fixtureId:'formation-full',homeTeamId:1,awayTeamId:2},homeLineup:{startXi:[],substitutes:[]},awayLineup:{startXi:[],substitutes:[]},events:[],playerStats:[]});
      openManualPanel('lineup','home');
    });
    const field=(key,i)=>page.locator(`[name="lineup-${key}-${i}"]`);
    const formation=page.locator('#manualLineupFormation');
    await formation.selectOption('4-3-1-2');
    for(let i=0;i<11;i++) {await field('name',i).fill(`person ${i}`);await field('number',i).fill(String(i+1));}
    await field('goals',6).fill('2');await field('assists',6).fill('3');await field('captain',6).check();await field('yellow',6).check();
    await field('name',7).fill('');await field('goals',7).fill('4');
    await formation.selectOption('4-1-2-1-2');
    assert.equal(await field('name',5).inputValue(),'person 6');
    assert.equal(await field('number',5).inputValue(),'7');
    assert.equal(await field('goals',5).inputValue(),'2');assert.equal(await field('assists',5).inputValue(),'3');
    assert(await field('captain',5).isChecked());assert(await field('yellow',5).isChecked());
    assert.equal(await field('name',7).inputValue(),'');assert.equal(await field('goals',7).inputValue(),'4');
    await page.locator('#manualPanelGridToggle').click();
    await select().selectOption('4-3-1-2');
    await page.locator('#manualPanelGridToggle').click();
    assert.equal(await field('name',6).inputValue(),'person 6');assert(await field('captain',6).isChecked());
    await formation.selectOption('4-1-3-2');
    assert.equal(await field('name',5).inputValue(),'person 6','full-form tracks the formation after grid toggle');
    await page.locator('#manualPanelSave').click();
    await page.evaluate(()=>openManualPanel('lineup','home'));
    assert.equal(await field('name',5).inputValue(),'person 6');assert(await field('captain',5).isChecked());
    const screenshotDir = path.join(root, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.locator('.dp-manual-modal').first().screenshot({path:path.join(screenshotDir,'formation-transitions.png')});
    await page.evaluate(()=>{
      closeManualPanel();
      applyLineupPanels({matchInfo:{fixtureId:'formation-cam-forward',homeTeamId:1,awayTeamId:2},homeLineup:{startXi:[],substitutes:[]},awayLineup:{startXi:[],substitutes:[]},events:[],playerStats:[]});
      openManualPanel('lineup','home');
    });
    await formation.selectOption('4-2-3-1');
    await field('name',7).fill('right winger');
    await field('name',8).fill('playmaker');
    await field('name',9).fill('left winger');
    await field('name',10).fill('striker');
    await field('goals',8).fill('2');
    await field('captain',8).check();
    await formation.selectOption('4-4-2');
    assert.equal(await field('name',5).inputValue(),'right winger');
    assert.equal(await field('name',8).inputValue(),'left winger');
    assert.equal(await field('name',9).inputValue(),'playmaker');
    assert.equal(await field('name',10).inputValue(),'striker');
    assert.equal(await field('goals',9).inputValue(),'2');
    assert(await field('captain',9).isChecked());
    await formation.selectOption('4-2-2-2');
    assert.equal(await field('name',7).inputValue(),'right winger');
    assert.equal(await field('name',8).inputValue(),'left winger');
    assert.equal(await field('name',9).inputValue(),'playmaker');
    await formation.selectOption('4-2-3-1');
    assert.equal(await field('name',8).inputValue(),'playmaker');
    assert(await field('captain',8).isChecked());
    assert.deepEqual(errors,[]);
    console.log('PASS: home/away selector, family round trips, manual drag, save/reopen/cancel, full-form stats/captain/partial rows and movement-mode synchronization.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

