  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [유틸리티 헬퍼] DOM 조회, 시간 포맷, 숫자 클램핑, 파일 다운로드 등 공통 유틸
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** id로 DOM 엘리먼트를 가져오는 단축 함수 */
  const $ = id => document.getElementById(id);
  /** CSS 커스텀 변수 값을 설정하는 단축 함수 */
  const setCSS = (k,v) => document.documentElement.style.setProperty(k, v);
  /** CSS 커스텀 변수 값을 읽어오는 함수 */
  function getCSS(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  /** 초(sec)를 MM:SS 형식의 문자열로 변환 */
  function fmtClock(sec){ const m=Math.floor(sec/60),s=Math.floor(sec%60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  /** 숫자 v를 [min, max] 범위로 클램프. 유효하지 않으면 fallback 반환 */
  function clampNum(v,min,max,fallback){ const n=Number(v); if(!Number.isFinite(n)) return fallback; return Math.min(max,Math.max(min,n)); }
  /** Blob을 파일로 다운로드시키는 헬퍼 */
  function downloadBlob(filename,blob){ const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),0); }
  /** 문자열을 파일명으로 안전하게 변환 (특수문자 제거, 길이 제한) */
  function slugify(s){ const max_len=200; let name=(s??'').toString().trim(); name=name.replace(/[\u0000-\u001F\u007F]+/g,''); name=name.replace(/[\\/:*?"<>|]/g,''); name=name.replace(/^\.+/,'').replace(/\.+$/,'').replace(/\s+/g,' ').trim(); if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) name='_'+name; if(!name) name='NoNameTemplate'; return name.slice(0,max_len); }
  /** "mm:ss" 또는 "mm" 형식의 문자열을 초 단위 숫자로 파싱 (형식 불일치 시 null 반환) */
  function parseStartTime(v){
    if(!v) return 0;
    v = String(v).trim();
    // 정확히 "숫자" 또는 "숫자:00~59" 형식만 허용 — "1abc", "1:2x", "1:02:03" 등은 null
    const m = /^(\d+)(?::([0-5]?\d))?$/.exec(v);
    if(!m) return null;
    const mm = parseInt(m[1], 10);
    const ss = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    return Math.max(0, mm) * 60 + ss;
  }
  /** SPA 경로 진입에서도 about.md 같은 정적 파일을 항상 루트 기준으로 읽어오기 위한 helper */
  function appAssetPath(fileName){
    const clean = String(fileName || '').replace(/^\/+/, '');
    if(window.location.protocol === 'file:') return `./${clean}`;
    return `/${clean}`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [그린스크린 안전 색상 변환] (Iter 5-7)
  // OBS에서 크로마키(초록색 투명화) 사용 시, 화면 안의 초록 계열 색깔이 함께 투명해지는 문제 방지.
  // greenscreen 모드 ON일 때 이 함수를 거치면 초록 계열만 시안/청록으로 hue shift됨.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * "#RRGGBB"/"#RGB" 또는 "rgb(r,g,b)"/"rgba(r,g,b,a)" 문자열을 {r,g,b,a} 객체로 파싱.
   * 실패 시 null. a는 0~1, 미지정 시 1.
   */
  function parseAnyColor(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (!s) return null;

    // hex
    const hex = s.startsWith('#') ? s.slice(1) : (s.match(/^[0-9a-fA-F]{3,8}$/) ? s : null);
    if (hex) {
      if (hex.length === 3) return { r: parseInt(hex[0]+hex[0],16), g: parseInt(hex[1]+hex[1],16), b: parseInt(hex[2]+hex[2],16), a: 1 };
      if (hex.length === 6) return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: 1 };
      if (hex.length === 8) return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: parseInt(hex.slice(6,8),16)/255 };
    }

    // rgb / rgba
    const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) {
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }

    return null;
  }

  /** {r,g,b} → {h,s,l} (HSL). h:0~360, s/l:0~1 */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s; const l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, l };
  }

  /** {h,s,l} → {r,g,b}. h:0~360, s/l:0~1, 결과 r/g/b: 0~255 */
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1, g1, b1;
    if (h < 60)        { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120)  { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180)  { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240)  { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300)  { r1 = x; g1 = 0; b1 = c; }
    else               { r1 = c; g1 = 0; b1 = x; }
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }

  /** {r,g,b} → "#rrggbb" 16진 문자열 */
  function rgbToHex(r, g, b) {
    const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [팀 컬러 fallback]
  // /fixture 응답 색상이 비어 있을 때 쓰는 프런트 보정 흐름.
  // 1) 서버가 primary/number를 주면 그 값을 우선 사용한다.
  // 2) 둘 다 없으면 팀 로고를 canvas로 읽고, 비슷한 색을 먼저 부류로 묶는다.
  //    가장 큰 색 부류의 최빈 hex를 primary로, 다음 색 부류의 최빈 hex를 number로 쓴다.
  //    한 부류만 잡히면 primary와 더 멀리 대비되는 흰색/검은색을 number로 쓴다.
  //    단, 로고 CDN이 CORS를 허용하지 않으면 픽셀을 읽을 수 없으므로 실패 처리한다.
  // 3) 로고 추출도 실패하면 variables.css의 기본 홈/원정 팀 컬러로 돌아간다.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const TEAM_COLOR_CSS_DEFAULTS = Object.freeze({
    home: Object.freeze({ bg: '#1d4ed8', text: '#ffffff' }),
    away: Object.freeze({ bg: '#ef4444', text: '#ffffff' }),
  });
  // CIELAB Delta E 기준. 20 미만은 팀 배경끼리 비슷하다고 보고,
  // 같은 팀의 primary-number는 45 이상 벌려 swap 이후에도 구분 여유를 남긴다.
  const TEAM_COLOR_SIMILAR_DELTA_E = 20;
  const TEAM_COLOR_DISTINCT_DELTA_E = 45;
  const TEAM_COLOR_MIN_TEXT_CONTRAST = 3;
  const LOGO_PALETTE_CACHE = new Map();

  function normalizeTeamColorHex(value) {
    const rgb = parseAnyColor(value);
    if (!rgb) return null;
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function teamColorComplementHex(value) {
    const rgb = parseAnyColor(value);
    if (!rgb) return null;
    return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
  }

  function teamColorRelativeLuminance(value) {
    const rgb = parseAnyColor(value);
    if (!rgb) return null;
    const channel = n => {
      const v = n / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  function teamColorContrastRatio(a, b) {
    const l1 = teamColorRelativeLuminance(a);
    const l2 = teamColorRelativeLuminance(b);
    if (l1 === null || l2 === null) return 1;
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }

  function teamColorRgbDistance(a, b) {
    const ar = parseAnyColor(a);
    const br = parseAnyColor(b);
    if (!ar || !br) return 0;
    const dr = ar.r - br.r;
    const dg = ar.g - br.g;
    const db = ar.b - br.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 백엔드 FixtureService.resolveNumberColor의 3~4단계와 동일한 체인:
  // 검정/흰색 중 대비가 더 좋은 쪽을 먼저 시도하고, 그마저 3:1 기준 미달이면(중간 톤 회색 등
  // 드문 경우) 보색으로 폴백한다. 가능하면 항상 검정/흰색 중 하나가 되도록 함.
  function teamColorReadableText(value) {
    const bg = normalizeTeamColorHex(value);
    if (!bg) return '#ffffff';
    const blackContrast = teamColorContrastRatio(bg, '#000000');
    const whiteContrast = teamColorContrastRatio(bg, '#ffffff');
    const best = blackContrast >= whiteContrast ? '#000000' : '#ffffff';
    if (Math.max(blackContrast, whiteContrast) >= TEAM_COLOR_MIN_TEXT_CONTRAST) return best;
    return teamColorComplementHex(bg) || best;
  }
  // RGB 거리는 사람이 느끼는 색 차이와 잘 맞지 않으므로, 시각적 유사도는 CIELAB Delta E로 본다.
  // 여기서는 CIE76 거리(유클리드 Delta E)를 쓴다. 구현이 짧고 triangle inequality가 성립해
  // "팀 내부 distinct 기준 > 팀 간 similar 기준" 같은 안전 여유를 계산하기 쉽다.
  function teamColorLab(value) {
    const rgb = parseAnyColor(value);
    if (!rgb) return null;
    const pivotRgb = n => {
      const v = n / 255;
      return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
    };
    const r = pivotRgb(rgb.r);
    const g = pivotRgb(rgb.g);
    const b = pivotRgb(rgb.b);

    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y =  r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    const pivotXyz = n => n > 0.008856 ? Math.cbrt(n) : (7.787 * n) + (16 / 116);
    const fx = pivotXyz(x);
    const fy = pivotXyz(y);
    const fz = pivotXyz(z);
    return {
      l: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function teamColorDeltaE(a, b) {
    const al = teamColorLab(a);
    const bl = teamColorLab(b);
    if (!al || !bl) return null;
    const dl = al.l - bl.l;
    const da = al.a - bl.a;
    const db = al.b - bl.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function teamColorsVisuallySimilar(a, b) {
    const delta = teamColorDeltaE(a, b);
    return delta !== null && delta < TEAM_COLOR_SIMILAR_DELTA_E;
  }

  function teamColorsVisuallyDistinct(a, b) {
    const delta = teamColorDeltaE(a, b);
    if (delta !== null) return delta >= TEAM_COLOR_DISTINCT_DELTA_E;
    return teamColorRgbDistance(a, b) >= 80;
  }

  function readRootCssVariableDeclaration(name) {
    if (typeof document === 'undefined' || !document.styleSheets) return '';
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; }
      catch (_) { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.selectorText !== ':root' || !rule.style) continue;
        const value = rule.style.getPropertyValue(name).trim();
        if (value) return value;
      }
    }
    return '';
  }

  function getDefaultTeamColors(side) {
    const normalizedSide = side === 'away' ? 'away' : 'home';
    const cssNames = normalizedSide === 'away'
      ? { bg: '--away-bg', text: '--away-text' }
      : { bg: '--home-bg', text: '--home-text' };
    const fallback = TEAM_COLOR_CSS_DEFAULTS[normalizedSide];
    return {
      bg: normalizeTeamColorHex(readRootCssVariableDeclaration(cssNames.bg)) || fallback.bg,
      text: normalizeTeamColorHex(readRootCssVariableDeclaration(cssNames.text)) || fallback.text,
    };
  }

  function loadLogoImageForPalette(url, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const finish = fn => value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(finish(reject), timeoutMs, new Error('logo palette timeout'));
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => finish(resolve)(img);
      img.onerror = () => finish(reject)(new Error('logo image load failed'));
      img.src = url;
    });
  }

  // 로고 픽셀을 CIELAB 공간에서 k-means로 클러스터링해 색상 클러스터 목록을 반환한다.
  //
  // [왜 median-cut이 아니라 k-means인가]
  // 작은 아이콘/로고에서 대표 색을 뽑는 용도로는 median-cut류(Android Palette API, ColorThief —
  // 빠르지만 "원본에 없던 색"이 섞여 나올 수 있다고 알려져 있음)보다 k-means가 더 적합하다는 게
  // 색상 정량화 분야에서 일반적으로 통용되는 내용이다. 실제로 Android Palette API의 실제 구현
  // (ColorCutQuantizer, median-cut-by-volume 방식)을 그대로 포팅해서 맨유 로고에 돌려본 결과로
  // 확인했다 — 맨유 로고는 전 픽셀이 B채널 0(빨강 R≈240,G≈0,B=0 / 골드 R≈255,G≈240,B=0)인데,
  // median-cut은 매 분할마다 "R/G/B 중 값의 범위(최댓값-최솟값)가 제일 넓은 축 하나"를 골라
  // 그 축의 인구 중앙값에서 자른다. 이때 R의 범위(0~255)가 G의 범위(0~242)보다 13만큼 근소하게
  // 넓다는 이유만으로 R축을 고르는데, 정작 빨강과 골드를 가르는 축은 G다(R은 둘 다 높음). R로
  // 자르면 안 갈리고, 16번을 분할해도 "반은 빨강 반은 골드"인 박스가 여러 개 남아 그 평균이
  // 실존하지 않는 주황(#f77a00)이 되어버렸다.
  //
  // k-means가 이 문제를 피하는 이유 세 가지:
  // 1) "분할 축을 하나 고르는" 단계 자체가 없다. 픽셀마다 Lab 공간(L=밝기, a=빨강↔초록,
  //    b=노랑↔파랑) 3축을 동시에 써서 모든 중심점까지의 거리를 계산하고 제일 가까운 곳에
  //    배정한다. R 채널 하나만 보면 안 갈리는 색도, 색 전체(a/b, 즉 색상 방향)를 같이 보면
  //    정확히 갈린다.
  // 2) 한 번 정하고 끝이 아니라 계속 고친다(Lloyd's 알고리즘). "배정 -> 중심점 재계산 -> 그 새
  //    중심점 기준으로 전체 재배정"을 더 안 바뀔 때까지 반복하므로, 초반에 애매하게 배정된
  //    픽셀도 중심점이 진짜 빨강/진짜 골드 쪽으로 이동하면서 다음 라운드에 재배정된다.
  //    median-cut은 위에서 아래로 한 번 자르면 되돌릴 방법이 없다.
  // 3) 초기 중심점을 아무렇게나 안 잡는다(아래 farthest-first 참고) — 시작부터 로고 안에서
  //    서로 가장 다르게 생긴 색 근처에서 출발하므로 median-cut처럼 "어디가 진짜 클러스터인지"
  //    전혀 모르는 채로 기계적으로 반씩 자르는 것보다 유리하다.
  //
  // [초기 중심점: 결정적 farthest-first]
  // 확률적 k-means++ 대신 무게가 제일 큰 픽셀에서 시작해 매번 기존 중심점들과 가장 먼 점을
  // 순서대로 추가하는 결정적 방식을 쓴다 — 같은 로고면 페이지를 새로고침해도 항상 같은 팀
  // 컬러가 나와야 하므로 난수를 쓰지 않는다.
  //
  // [k=12인 이유]
  // 20개 팀 로고로 실측 검증한 값. k가 10~11이면 원래 다른 색인 두 클러스터(예: 사우샘프턴의
  // 빨강 vs 진회색)가 하나로 뭉쳐 엉뚱한 색이 1등이 되고, 12 이상부터 16까지는 전부 같은 결과로
  // 안정적이다(턱걸이로 겨우 맞은 경계값이 아니라 안정된 구간이라는 뜻). 유일한 예외는 맨시티 —
  // 방패 안 하늘색이 그라데이션으로 넓게 퍼져 있고 테두리/리본의 남색 계열도 실제로 꽤 넓어서,
  // k를 아무리 조절해도 평균이 하늘색보다 남색 쪽에 더 가깝게 나온다. 이건 알고리즘의 결함이
  // 아니라 그 로고 자체가 실제로 그렇게 칠해져 있기 때문(원본 해상도로 픽셀을 직접 세어 확인함).
  function logoPaletteFamilies(imageData, k = 12, maxIter = 25) {
    const data = imageData.data;

    const pts = [];
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 96) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      pts.push({ r, g, b, weight: alpha / 255, lab: teamColorLab(rgbToHex(r, g, b)) });
    }
    if (!pts.length) return [];

    const labDist2 = (a, b) => {
      const dl = a.l - b.l, da = a.a - b.a, db = a.b - b.b;
      return dl * dl + da * da + db * db;
    };

    // 픽셀 수가 k 이하면 클러스터링할 필요 없이 픽셀 하나하나가 그대로 클러스터.
    if (pts.length <= k) {
      return pts.map(p => {
        const { s, l } = rgbToHsl(p.r, p.g, p.b);
        return { hex: rgbToHex(p.r, p.g, p.b), weight: p.weight, chromatic: s >= 0.12 && l > 0.06 && l < 0.94 };
      }).sort((a, b) => b.weight - a.weight);
    }

    // farthest-first 초기화
    const centroids = [];
    let first = pts[0];
    for (const p of pts) if (p.weight > first.weight) first = p;
    centroids.push({ lab: first.lab });
    while (centroids.length < k) {
      let farthest = null, farthestD = -1;
      for (const p of pts) {
        let minD = Infinity;
        for (const c of centroids) {
          const d = labDist2(p.lab, c.lab);
          if (d < minD) minD = d;
        }
        if (minD > farthestD) { farthestD = minD; farthest = p; }
      }
      centroids.push({ lab: farthest.lab });
    }

    // Lloyd's 알고리즘: 배정 -> 중심점 재계산 반복, 더 이상 배정이 안 바뀌면 종료
    const assign = new Array(pts.length).fill(-1);
    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;
      for (let i = 0; i < pts.length; i++) {
        let best = 0, bestD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = labDist2(pts[i].lab, centroids[c].lab);
          if (d < bestD) { bestD = d; best = c; }
        }
        if (assign[i] !== best) { assign[i] = best; changed = true; }
      }
      if (!changed && iter > 0) break;

      const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));
      for (let i = 0; i < pts.length; i++) {
        const s = sums[assign[i]];
        s.r += pts[i].r * pts[i].weight;
        s.g += pts[i].g * pts[i].weight;
        s.b += pts[i].b * pts[i].weight;
        s.weight += pts[i].weight;
      }
      for (let c = 0; c < centroids.length; c++) {
        if (sums[c].weight === 0) {
          centroids[c].weight = 0;
          continue;
        }
        const r = sums[c].r / sums[c].weight, g = sums[c].g / sums[c].weight, b = sums[c].b / sums[c].weight;
        centroids[c].r = r;
        centroids[c].g = g;
        centroids[c].b = b;
        centroids[c].weight = sums[c].weight;
        centroids[c].lab = teamColorLab(rgbToHex(Math.round(r), Math.round(g), Math.round(b)));
      }
    }

    return centroids
      .filter(c => c.weight > 0)
      .map(c => {
        const r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
        const { s, l } = rgbToHsl(r, g, b);
        return { hex: rgbToHex(r, g, b), weight: c.weight, chromatic: s >= 0.12 && l > 0.06 && l < 0.94 };
      })
      .sort((a, b) => b.weight - a.weight);
  }

  function extractTeamColorsFromLogoImage(img) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const size = 72;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);

    let imageData;
    try { imageData = ctx.getImageData(0, 0, size, size); }
    catch (_) { return null; }

    const families = logoPaletteFamilies(imageData);
    if (!families.length) return null;

    const chromaticFamilies = families.filter(family => family.chromatic);
    const primaryFamily = (chromaticFamilies[0] || families[0]);
    const primary = primaryFamily.hex;
    const numberFamily = families.find(family => (
      family !== primaryFamily &&
      teamColorsVisuallyDistinct(primary, family.hex) &&
      teamColorContrastRatio(primary, family.hex) >= TEAM_COLOR_MIN_TEXT_CONTRAST
    ));

    return {
      bg: primary,
      text: numberFamily?.hex || teamColorReadableText(primary),
    };
  }

  async function extractTeamColorsFromLogo(logoUrl) {
    const url = String(logoUrl || '').trim();
    if (!url) return null;
    if (LOGO_PALETTE_CACHE.has(url)) return LOGO_PALETTE_CACHE.get(url);

    const promise = (async () => {
      try {
        const img = await loadLogoImageForPalette(url);
        return extractTeamColorsFromLogoImage(img);
      } catch (err) {
        console.warn('Failed to extract team colors from logo:', url, err);
        return null;
      }
    })();
    LOGO_PALETTE_CACHE.set(url, promise);
    return promise;
  }

  /**
   * 색상이 "초록 계열"인지 판정.
   * - HSL hue가 60~170° 범위 (노란-초록부터 청록 직전까지)
   * - 채도 ≥ 18% (회색·검정·흰색은 제외)
   * - 명도 5%~95% (순수 흑/백 제외)
   */
  function isGreenLike(input) {
    const rgb = parseAnyColor(input);
    if (!rgb) return false;
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return h >= 60 && h <= 170 && s >= 0.18 && l > 0.05 && l < 0.95;
  }

  /**
   * 강도 프리셋별 hue/S/L 매핑 정의 (Iter 5-7).
   * 안전 순서 (가장 안전 → 가장 위험): strong → moderate → mild → natural.
   * 모든 프리셋은 60~170° 초록을 그대로 두지 않고 다른 영역으로 이동시킨다.
   *
   *   start, end : 입력 hue 60° / 170°에 매핑되는 출력 hue
   *   sScale     : 채도 배율 (1 = 그대로)
   *   lDelta     : 명도 가산값 (음수면 어둡게)
   *   lCap       : 명도 상한값 (있으면 출력 l이 이 값을 넘지 못하게 강제 — 강한 어둡게 효과)
   */
  const CHROMA_SAFE_PRESETS = {
    strong:   { start: 290, end: 330, sScale: 1.00, lDelta:  0.00 },                    // 마젠타/핑크 (default 안전)
    moderate: { start: 215, end: 245, sScale: 0.95, lDelta:  0.00 },                    // 파랑/네이비
    mild:     { start: 175, end: 200, sScale: 0.85, lDelta: -0.08 },                    // 어두운 청록
    // 어두운 포레스트 그린.
    //   - 채도 45%까지 낮추는 이유: 약간의 R 성분이 추가되며 Cr 값이 높아져 chromakey green(Cr=21)과
    //     의 거리가 102→110으로 증가 (default similarity 400 기준, 안전 여유 +8). 시각적으론 G가
    //     여전히 우세해서 "초록"으로 인식됨 (예: #00C424 → #185838 forest green, #15662f → #234d39 pine).
    //   - hue 140~155°는 yellow-green(120°) 대신 약간 teal 쪽으로 — Cb 값이 커져 더 안전.
    //   - lCap 0.22로 명도 강제 (모든 입력이 다크 톤으로 통일).
    natural:  { start: 140, end: 155, sScale: 0.45, lDelta:  0.00, lCap: 0.22 },
  };

  /** 현재 사용자 설정의 그린스크린 강도. 미설정 시 기본 'moderate'. */
  function getGreenscreenIntensity() {
    if (typeof getSetting !== 'function') return 'moderate';
    const v = getSetting('greenscreenIntensity');
    return CHROMA_SAFE_PRESETS[v] ? v : 'moderate';
  }

  /**
   * 그린스크린 안전 변환 — 입력 색이 초록 계열이면 사용자 강도 설정에 따라 다른 영역으로 이동.
   * - 채도/명도/투명도(a)는 그대로 보존 (preset이 sScale/lDelta로 보정 가능)
   * - hex/rgb/rgba 모두 입력 가능, 출력은 hex 또는 rgba (입력에 alpha 있으면 rgba)
   * - 입력이 파싱 불가능하면 원본 그대로 반환 (CSS 변수, 'transparent', linear-gradient 등은 그대로 통과)
   *
   * @param {string} input  hex/rgb/rgba 색상 문자열
   * @param {string=} forcedIntensity  카테고리별 강제 강도 (예: 'strong' 마젠타 고정). 미지정 시 사용자 설정.
   */
  function toChromaSafeColor(input, forcedIntensity) {
    if (!input) return input;
    const rgb = parseAnyColor(input);
    if (!rgb) return input;
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (!(h >= 60 && h <= 170 && s >= 0.18 && l > 0.05 && l < 0.95)) return input;

    const intensity = forcedIntensity && CHROMA_SAFE_PRESETS[forcedIntensity]
      ? forcedIntensity
      : getGreenscreenIntensity();
    const preset = CHROMA_SAFE_PRESETS[intensity] || CHROMA_SAFE_PRESETS.moderate;

    // 60~170° → preset.start~end로 선형 매핑.
    const t = (h - 60) / (170 - 60);   // 0~1
    const newH = preset.start + t * (preset.end - preset.start);
    const newS = Math.max(0, Math.min(1, s * preset.sScale));
    let newL = Math.max(0, Math.min(1, l + preset.lDelta));
    // lCap이 지정되면 그 값을 절대 상한으로 사용 — 'natural'에서 항상 매우 어둡게 강제.
    if (typeof preset.lCap === 'number') newL = Math.min(newL, preset.lCap);
    const out = hslToRgb(newH, newS, newL);

    if (rgb.a < 1) return `rgba(${out.r}, ${out.g}, ${out.b}, ${rgb.a})`;
    return rgbToHex(out.r, out.g, out.b);
  }

  /**
   * linear-gradient(...) 같은 CSS 함수 문자열 안의 색상 토큰을 모두 toChromaSafeColor로 변환.
   * 피치 톤 background처럼 그라디언트인 경우에도 그린 변환이 작동하게 한다.
   * forcedIntensity를 주면 그라디언트 안의 모든 색에 동일 강도 적용.
   */
  function toChromaSafeGradient(input, forcedIntensity) {
    if (!input || typeof input !== 'string') return input;
    return input.replace(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g, match => toChromaSafeColor(match, forcedIntensity));
  }

  /** 그린스크린 모드가 켜져 있는지 — settings-popup.js의 getSetting을 사용. 없으면 false. */
  function isGreenscreenOn() {
    return typeof getSetting === 'function' && getSetting('greenscreen') === 'on';
  }

  /**
   * greenscreen ON일 때만 toChromaSafeColor 적용. OFF면 그대로 반환. 단일 색상용.
   * forcedIntensity로 카테고리별 강도 고정 가능 (예: 이벤트 라벨은 항상 'strong').
   */
  function chromaSafe(input, forcedIntensity) {
    return isGreenscreenOn() ? toChromaSafeColor(input, forcedIntensity) : input;
  }

  /** greenscreen ON일 때만 toChromaSafeGradient 적용. 그라디언트 문자열용. */
  function chromaSafeGradient(input, forcedIntensity) {
    return isGreenscreenOn() ? toChromaSafeGradient(input, forcedIntensity) : input;
  }

