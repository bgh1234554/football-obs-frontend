// Run: node tests/lineup/lineup-initial-badge.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../..');
const override = process.argv[3] ? path.resolve(process.argv[3]) : root;
const { chromium } = require(path.join(root, 'node_modules/playwright'));

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
    await page.setViewportSize({width:1920,height:950});
    const result = await page.evaluate(() => {
      activatePage('main-big'); setSetting('lineupNode','photo');
      const names=['Samandar Muratbaev','Saidkhon Khamidov','D. Murtazoyev','G. Rizakulov','Ruziboy Fayzullaev','A. Tulkunkbekov','Kuvonchbek Khushvaktov','S. Shodiboev','Mukhammadali Reimov','F. Abdurahmonov','Sardorbek Bakhromov'];
      const grids=['1:1','2:1','2:2','2:3','2:4','3:1','3:2','3:3','4:1','5:1','5:2'];
      const lineup=offset=>({formation:'4-3-1-2',startXi:names.map((name,i)=>({playerId:offset+i,name,number:i===9?17:i+1,grid:grids[i],pos:i===0?'G':'M'})),substitutes:[]});
      applyLineupPanels({matchInfo:{fixtureId:'name-probe',homeTeamId:1,awayTeamId:2,homeTeamName:'우즈벡',awayTeamName:'일본'},homeLineup:lineup(100),awayLineup:lineup(200),events:[],playerStats:[]});
    });
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const resultAfter = await page.evaluate(()=>{
      const panel=document.querySelector('.page.active [data-dp-role="lineup"]');
      const node=panel.querySelector('[data-player-id="108"].dp-lineup-node');
      node.insertAdjacentHTML('beforeend','<span class="dp-node-badge dp-node-sub-in">→117′</span>');
      const read=()=>{
        fitLineupNamePills(panel);
        const el=panel.querySelector('[data-player-id="109"] .dp-lineup-name');
        const rect=getDisplayLayoutRect(el);
        const textRects=getLineupCandidateTextRects(el,rect,rect);
        const badge=node.querySelector('.dp-node-sub-in');
        return {font:parseFloat(getComputedStyle(el).fontSize),lines:getRenderedTextLineCount(el),number:el.querySelector('.dp-lineup-name-num').textContent,parts:[...el.querySelectorAll('.dp-lineup-surname-part')].map(p=>p.textContent),split:el.classList.contains('has-number-line-break'),textCollision:lineupNameCandidateRectCollides(rect,el,[badge],textRects),labelCollision:[...panel.querySelectorAll('.dp-lineup-name')].some(other=>other!==el&&wrapsOverlap(el,other)),fits:canStayWithinLineupNameLayout(el)};
      };
      return [read(),read()];
    });
    for(const result of resultAfter){
      assert.equal(result.lines,3,JSON.stringify(result));
      assert.equal(result.number,'17');
      assert.deepEqual(result.parts,['F.','Abdurahmonov']);
      assert(result.font>7 && result.split && result.fits);
      assert(!result.textCollision && !result.labelCollision,JSON.stringify(result));
    }
    await page.locator('.page.active .lp-lineup').screenshot({path:path.join(root,'screenshots/lineup-initial-badge.png')});
    const tie = await page.evaluate(() => {
      const wrap=document.createElement('div');
      wrap.style.cssText='position:absolute;left:500px;top:300px;display:flex;justify-content:center;width:101px;';
      wrap.innerHTML=buildLineupNameLabelHtml({number:12},'F. Abdurahmonov','dp-lineup-name');
      document.body.appendChild(wrap);
      const el=wrap.firstElementChild;
      fitLineupNameSelf(el);
      const before=el.outerHTML;
      const font=parseFloat(getComputedStyle(el).fontSize);
      const candidate=measureLineupNameCandidateFont(el,null,[],c=>applyLineupNumberLine(c,['F.','Abdurahmonov']),14);
      improveLineupNameWithNumberLine(el,[el],14);
      const result={font,candidate,lines:getRenderedTextLineCount(el),unchanged:before===el.outerHTML};
      wrap.remove();return result;
    });
    assert.equal(tie.candidate,tie.font,JSON.stringify(tie));
    assert.equal(tie.lines,2,JSON.stringify(tie));
    assert(tie.unchanged,'equal-size candidate must retain the two-line label');
    assert.deepEqual(errors,[]);
    console.log('PASS: 4-3-1-2 initial/surname renders on three lines next to 117-minute substitution badge; repeated fitting preserves text, number and safe spacing. Equal font sizes retain two lines.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
