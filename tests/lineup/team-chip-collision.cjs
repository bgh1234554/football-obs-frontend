const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost') return route.abort();
      const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/overlay_dashboard.html' : url.pathname));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');
    const geometry = await page.evaluate(() => {
      const host = document.createElement('div');
      host.style.cssText='position:absolute;left:600px;top:200px;width:300px;height:300px;z-index:99999;';
      document.body.appendChild(host);
      const label = document.createElement('div');
      label.style.cssText='position:absolute;left:75px;top:75px;width:30px;height:30px;';
      const node = document.createElement('div');node.className='dp-lineup-node';
      node.style.cssText='left:122px;top:122px;';
      node.innerHTML='<span class="dp-lineup-avatar" style="width:44px;height:44px"></span>';
      host.append(label,node);
      const corner={square:wrapsOverlap(label,node),round:teamChipOverlapsAny(label,[node])};
      label.style.left='100px';label.style.top='100px';
      const trueOverlap=teamChipOverlapsAny(label,[node]);
      label.style.left='69.5px';label.style.top='112px';label.style.width='30px';label.style.height='10px';
      const close=teamChipOverlapsAny(label,[node]);
      label.style.left='68px';const clear=teamChipOverlapsAny(label,[node]);
      label.style.left='75px';label.style.top='75px';label.style.width='30px';label.style.height='30px';
      const badge=document.createElement('span');badge.className='dp-node-badge dp-node-sub-in';
      badge.style.cssText='position:absolute;left:0;top:0;transform:none;width:20px;height:12px;';node.append(badge);
      const badgeOnly={node:teamChipOverlapsAny(label,[node]),badge:teamChipOverlapsAny(label,[badge])};
      const fallback=document.createElement('div');fallback.className='dp-lineup-node';fallback.style.cssText='position:absolute;left:90px;top:90px;transform:none;width:20px;height:20px;';host.append(fallback);
      const missingBody=teamChipOverlapsAny(label,[fallback]);
      host.remove();return {corner,trueOverlap,close,clear,badgeOnly,missingBody};
    });
    assert(geometry.corner.square && !geometry.corner.round, JSON.stringify(geometry));
    assert(geometry.trueOverlap && geometry.close && !geometry.clear, JSON.stringify(geometry));
    assert(!geometry.badgeOnly.node && geometry.badgeOnly.badge && geometry.missingBody, JSON.stringify(geometry));
    await page.evaluate(async () => {
      activatePage('main-big');setSetting('lineupNode','photo');setSetting('splitLineup','on');
      const lineup={formation:'4-3-3',startXi:Array.from({length:11},(_,i)=>({playerId:100+i,name:`선수 ${i}`,number:i+1,photoUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=',grid:buildManualGridValues('4-3-3')[i]})),substitutes:[]};
      applyLineupPanels({matchInfo:{fixtureId:'team-chip-collision',homeTeamId:1,awayTeamId:2,homeTeamName:'노르웨이',awayTeamName:'포르투갈'},homeLineup:lineup,awayLineup:structuredClone(lineup),events:[],playerStats:[]});
      const panel=document.querySelector('.layout-big .lp-lineup');panel.classList.add('lp-width-locked');panel.style.width='358px';
      // 사용자 화면처럼 평점과 교체 배지가 있는 상태도 함께 검사한다.
      for (const node of panel.querySelectorAll('.dp-lineup-node')) {
        const rating=document.createElement('span');rating.className='dp-node-rating';rating.textContent='6.3';node.append(rating);
      }
      const nodes=[...panel.querySelector('.dp-lineup-vertical-pitch').querySelectorAll('.dp-lineup-node')];
      const leftForward=nodes.filter(node=>parseFloat(node.style.top)<20).sort((a,b)=>parseFloat(a.style.left)-parseFloat(b.style.left))[0];
      const substitution=document.createElement('span');substitution.className='dp-node-badge dp-node-sub-in';substitution.textContent='→ 81';leftForward.append(substitution);
      await document.fonts.ready;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fitting = await page.evaluate(() => {
      const panel=document.querySelector('.layout-big .lp-lineup'),pitch=panel.querySelector('.dp-lineup-vertical-pitch');
      const name=pitch.querySelector('.dp-lineup-team-name-tag .dp-lineup-team-name');
      const main=name.closest('.dp-lineup-team-main');
      pitch.style.flex='0 0 auto';pitch.style.height='380px';
      fitBigLineupTeamChips(panel);
      const font=parseFloat(getComputedStyle(name).fontSize);
      const targets=[...pitch.querySelectorAll('.dp-lineup-node,.dp-lineup-name-wrap,.dp-node-badge,.dp-node-rating')];
      const safe=!teamChipOverlapsAny(main,targets);
      const badge=document.createElement('span');badge.className='dp-node-badge dp-node-sub-in';badge.textContent='→ 89';
      const node=pitch.querySelector('.dp-lineup-node');node.append(badge);
      const badgeRect=getDisplayLayoutRect(main),nodeRect=getDisplayLayoutRect(node);
      badge.style.cssText=`position:absolute;left:${badgeRect.right-nodeRect.left-2}px;top:${badgeRect.top-nodeRect.top+2}px;transform:none;width:20px;height:10px;`;
      fitBigLineupTeamChips(panel);
      const badgeProtected=!teamChipOverlapsAny(main,[badge]);
      badge.remove();pitch.style.height='405px';fitBigLineupTeamChips(panel);
      const restored=parseFloat(getComputedStyle(name).fontSize);
      fitBigLineupTeamChips(panel);const repeated=parseFloat(getComputedStyle(name).fontSize);
      return {font,safe,badgeProtected,restored,repeated,padding:getComputedStyle(main).padding};
    });
    assert(fitting.font>=10 && fitting.safe, JSON.stringify(fitting));
    assert(fitting.badgeProtected, JSON.stringify(fitting));
    assert.equal(fitting.restored,11,JSON.stringify(fitting));assert.equal(fitting.repeated,11);
    assert.equal(fitting.padding,'4px 8px');assert.deepEqual(errors,[]);
    console.log(JSON.stringify(fitting));
    await page.evaluate(() => {
      const panel=document.querySelector('.layout-big .lp-lineup');
      panel.querySelector('.dp-lineup-vertical-pitch').style.height='380px';
      fitBigLineupTeamChips(panel);
    });
    fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});
    await page.locator('.layout-big .lp-lineup').screenshot({path:path.join(root,'screenshots/team-chip-collision.png')});
    console.log('PASS: 원 모서리 오탐 제거, 실제 겹침·1px 간격·배지 보호, 노르웨이 폰트 회복, 리사이즈·반복 피팅.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
