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

