require('../tactics/helpers');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require(path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const root = path.resolve(__dirname, '../..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const dpr of [1,1.25,2]) {
    const page = await browser.newPage({ deviceScaleFactor:dpr, viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      const file = path.join(root, url.pathname === '/' ? 'overlay_dashboard.html' : decodeURIComponent(url.pathname));
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.ttf': 'font/ttf', '.woff': 'font/woff'
      }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('http://localhost/');


    await page.addStyleTag({content:'* {transition:none !important;animation:none !important;} body {background:#302040 !important;background-image:none !important;}'});
    const themes=(await page.evaluate(()=>Object.keys(FSM_THEMES))).filter(theme=>!process.argv[2]||theme===process.argv[2]);
    for(const theme of themes) {
      await page.evaluate(theme=>applyTheme(theme,null),theme);await page.waitForFunction(()=>!pendingThemeLink);
      await page.evaluate(()=>document.fonts.ready);
      for(const width of [1920,1280]) {
        await page.setViewportSize({width,height:1080});
        for(const scale of [50,75,100]) {
          const baselines=[];
          for(const position of ['center','left','right']) {
            await page.evaluate(({scale,position})=>{state.boardScale=scale;state.boardPosition=position;state.noteEnabled=true;state.notes={home:"48' Scorer name",away:"61' Away scorer"};state.homeName='HOME';state.awayName='AWAY';render();fsmBoardRender();},{scale,position});
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            const rects=await page.evaluate(()=>[...document.querySelectorAll('.team-logo')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
            for(let i=0;i<rects.length;i++) {
              const r=rects[i];
              if(position==='center') baselines[i]=r;
              else for(const edge of ['left','right']) {
                const delta=r[edge]-baselines[i][edge];
                assert(Math.abs(delta*dpr-Math.round(delta*dpr))<.001,JSON.stringify({theme,width,scale,position,edge,delta}));
              }
            }
            if(dpr===1&&width===1920&&scale===75) {
              for (let logoIndex=0;logoIndex<rects.length;logoIndex++) {
              const r=rects[logoIndex];
              const png=PNG.sync.read(await page.screenshot({clip:{x:Math.floor(r.left)-2,y:Math.floor(r.top)+4,width:Math.ceil(r.right)-Math.floor(r.left)+4,height:Math.max(1,Math.floor(r.bottom-r.top)-8)}}));
              if(position==='center') baselines[logoIndex].png=png;
              else {
                const ref=baselines[logoIndex].png;assert.equal(png.width,ref.width);assert.equal(png.height,ref.height);
                let different=0,total=0;const changedRows=Array(png.width).fill(0);
                for(let y=0;y<png.height;y++) for(let x=0;x<png.width;x++) {
                  if(x>5&&x<png.width-6) continue;
                  const at=(y*png.width+x)*4;total++;
                  if([0,1,2].some(c=>Math.abs(png.data[at+c]-ref.data[at+c])>3)) {different++;changedRows[x]++;}
                }
                const verticalLine = Math.max(...changedRows) >= png.height * .65;
                // 원형 경계의 미세한 안티앨리어싱과 높이 전반에 걸친 새로운 세로선을 구분합니다.
                if(verticalLine) {fs.writeFileSync('screenshots/tests/position-pixel-center.png',PNG.sync.write(ref));fs.writeFileSync('screenshots/tests/position-pixel-moved.png',PNG.sync.write(png));}
                assert(!verticalLine,JSON.stringify({theme,position,logoIndex,different,total}));
              }
              }
            }
          }
        }
      }
      console.log('PASS position pixel grid',dpr,theme);
    }
    assert.deepEqual(errors,[]);
    await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
