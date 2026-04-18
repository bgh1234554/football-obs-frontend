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
  function slugify(s){ const max_len=200; let name=(s??'').toString().trim(); name=name.replace(/[\u0000-\u001F\u007F]+/g,''); name=name.replace(/[\\/:*?"<>|]/g,''); name=name.replace(/^\.+/,'').replace(/\.+$/,'').replace(/\s+/g,' ').trim(); if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name='_'+name; if(!name) name='NoNameTemplate'; return name.slice(0,max_len); }
  /** "mm:ss" 또는 "mm" 형식의 문자열을 초 단위 숫자로 파싱 (형식 불일치 시 null 반환) */
  function parseStartTime(v){ if(!v) return 0; v=String(v).trim(); if(v.includes(':')){ const[m,s='0']=v.split(':'); const mm=parseInt(m,10),ss=parseInt(s,10); if(Number.isNaN(mm)||Number.isNaN(ss)||ss<0||ss>59) return null; return Math.max(0,mm)*60+ss; } const mm=parseInt(v,10); if(Number.isNaN(mm)) return null; return Math.max(0,mm)*60; }
  /** SPA 경로 진입에서도 about.md 같은 정적 파일을 항상 루트 기준으로 읽어오기 위한 helper */
  function appAssetPath(fileName){
    const clean = String(fileName || '').replace(/^\/+/, '');
    if(window.location.protocol === 'file:') return `./${clean}`;
    return `/${clean}`;
  }

