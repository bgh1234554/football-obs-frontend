const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { openPage } = require('../tactics/helpers');
(async () => {
 const browser=await chromium.launch();
 try {
  const page=await openPage(browser,{viewport:{width:1920,height:1080}});
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/1637598-lineup.json'),'utf8'));
  fixture.matchInfo.homePrimaryColor='#224466'; fixture.matchInfo.homeNumberColor='#ffffff';
  fixture.matchInfo.awayPrimaryColor='#aa5533'; fixture.matchInfo.awayNumberColor='#eeeeee';
  const load=async id=>page.evaluate(async ({fixture,id})=>{
   fetchFixture=async requested=>{const data=structuredClone(fixture);data.matchInfo.fixtureId=String(requested);return data;};
   await fetchAndApplyFixtureData(id,{silent:true});clearPolling();
  },{fixture,id});
  const a=String(fixture.matchInfo.fixtureId), b=String(Number(a)+1);
  const colors=()=>page.evaluate(()=>Object.fromEntries(['homeBg','homeText','awayBg','awayText'].map(key=>[key,state.colors[key]])));
  const custom={homeBg:'#123456',homeText:'#fefefe',awayBg:'#654321',awayText:'#abcdef'};
  await load(a); await page.evaluate(colors=>commitThemeColors(colors),custom);
  await load(a); assert.deepEqual(await colors(),custom);
  await load(b); assert.notDeepEqual(await colors(),custom);
  await load(a); assert.deepEqual(await colors(),custom);
  await page.reload(); await load(a); assert.deepEqual(await colors(),custom);
  await page.evaluate(()=>resetFixtureTeamColors('home'));
  assert.equal((await colors()).homeBg,'#224466');assert.equal((await colors()).awayBg,custom.awayBg);
  await load(b);await load(a);
  assert.equal((await colors()).homeBg,'#224466');assert.equal((await colors()).awayBg,custom.awayBg);
  await page.evaluate(()=>resetFixtureTeamColors());
  await load(b);await load(a);
  assert.equal((await colors()).homeBg,'#224466');assert.equal((await colors()).awayBg,'#aa5533');
  await page.reload();await load(a);
  assert.equal((await colors()).homeBg,'#224466');
  console.log('PASS fixture-scoped team colors: polling, A/B/A, reload, one-side and full reset');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
