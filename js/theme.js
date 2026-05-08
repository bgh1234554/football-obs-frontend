  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [템플릿 관리] 색상·폰트·레이아웃 설정을 템플릿으로 저장·불러오기·내보내기·가져오기
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 현재 state에서 템플릿 객체를 생성 (이름 포함, 색상·폰트·레이아웃 설정 포함) */
  function buildCurrentTemplate(name){
    const bgColor = (typeof getSetting === 'function')
      ? String(getSetting('bgColor') || '').trim()
      : '';
    return { name, colors:{...state.colors}, bgColor, fontFamily:state.fontFamily, logoAlign:state.logoAlign, radiusMode:state.radiusMode, boardWidth:state.boardWidth, homeLogoScale:state.homeLogoScale, awayLogoScale:state.awayLogoScale, homeOutlineEnabled:state.homeOutlineEnabled, awayOutlineEnabled:state.awayOutlineEnabled, homeOutlineWidth:state.homeOutlineWidth, awayOutlineWidth:state.awayOutlineWidth, boardOutlineEnabled:state.boardOutlineEnabled, scoreOutlineEnabled:state.scoreOutlineEnabled, boardOutlineWidth:state.boardOutlineWidth, scoreOutlineWidth:state.scoreOutlineWidth, noteEnabled:state.noteEnabled, noteFontSize:state.noteFontSize };
  }

  function resolveTemplateFontFamily(t){
    const font = sanitizeFontFamily(t?.fontFamily);
    return font || DEFAULT_FONT_FAMILY;
  }

  function resolveTemplateSaveName(nameMaybe){
    const typed = (nameMaybe||'').trim();
    if(typed) return typed;
    return (el.templateSelect?.value||'').trim();
  }

  /** LocalStorage에서 템플릿 목록을 읽어 select 요소에 option으로 채움 (selectedName 있으면 선택 유지) */
  function loadTemplates(selectedName){
    const list = JSON.parse(localStorage.getItem(TKEY)||'[]');
    const prevValue = (selectedName!==undefined) ? selectedName : (el.templateSelect?.value||'');
    el.templateSelect.innerHTML = '';
    const o=document.createElement('option'); o.value=''; o.textContent='로드된 템플릿'; el.templateSelect.appendChild(o);
    list.forEach(t=>{ if(!t||!t.name) return; const x=document.createElement('option'); x.value=t.name; x.textContent=t.name; el.templateSelect.appendChild(x); });
    const stillExists=list.some(t=>t&&t.name===prevValue);
    el.templateSelect.value = stillExists ? prevValue : '';
    return list;
  }

  /** 현재 설정을 주어진 이름으로 LocalStorage에 저장 (동명 템플릿 존재 시 덮어쓰기 확인) */
  function saveTemplate(name){
    name = resolveTemplateSaveName(name);
    if(!name) return alert('템플릿 이름을 입력해주세요.');
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]');
    const exists=list.some(t=>t&&t.name===name);
    if(exists&&!confirm(`"${name}" 템플릿이 이미 있습니다. 덮어쓸까요?`)) return;
    const next=list.filter(t=>t&&t.name!==name);
    next.push(buildCurrentTemplate(name));
    try{ localStorage.setItem(TKEY, JSON.stringify(next)); }
    catch(e){ return alert('저장 공간이 부족합니다.'); }
    loadTemplates(); el.templateSelect.value=name; alert('저장되었습니다.');
  }

  /** 이름 입력란 > 선택된 option 순서로 템플릿을 찾아 LocalStorage에서 삭제 */
  function deleteTemplate(nameMaybe){
    const typed=(el.templateName?.value||'').trim();
    const selected=el.templateSelect?.value||'';
    const name=(typed||nameMaybe||selected||'').trim();
    if(!name){ alert('삭제할 템플릿을 선택하거나 이름을 입력해 주세요.'); return; }
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]');
    if(!list.some(t=>t&&t.name===name)){ alert(`"${name}" 템플릿을 찾을 수 없습니다.`); return; }
    localStorage.setItem(TKEY, JSON.stringify(list.filter(t=>t&&t.name!==name)));
    loadTemplates(); if(el.templateName) el.templateName.value=''; alert(`"${name}" 삭제 완료.`);
  }

  /** 외부 데이터(t)를 LocalStorage 템플릿 목록에 삽입하거나 기존 항목을 덮어씀 */
  function upsertTemplateToLocal(t, askOnDuplicate=true){
    const list=JSON.parse(localStorage.getItem(TKEY)||'[]'); const name=(t?.name||'Imported').toString();
    const idx=list.findIndex(x=>x&&x.name===name);
    if(idx!==-1&&askOnDuplicate){ const ok=confirm(`"${name}" 이미 있음. 덮어쓸까요?`); if(!ok) return{saved:false,replaced:false,name}; }
    const toSave=buildCurrentTemplate(name); Object.assign(toSave, t);
    toSave.fontFamily = resolveTemplateFontFamily(t);
    if(idx!==-1) list[idx]=toSave; else list.push(toSave);
    localStorage.setItem(TKEY, JSON.stringify(list));
    return{saved:true,replaced:(idx!==-1),name};
  }

  /** 이름 입력란이 있으면 해당 템플릿 단건, 없으면 전체 목록을 JSON 파일로 다운로드 */
  async function exportTemplatesFileImpl(){
    const nameInput=(el.templateName?.value||'').trim();
    let dataStr,filename;
    if(nameInput){ dataStr=JSON.stringify(buildCurrentTemplate(nameInput),null,2); filename=`${slugify(nameInput)}.json`; }
    else{ const list=JSON.parse(localStorage.getItem(TKEY)||'[]'); dataStr=JSON.stringify(list,null,2); filename='scoreboard-templates.json'; }
    downloadBlob(filename, new Blob([dataStr],{type:'application/json'}));
  }
  window.exportTemplatesFileImpl = exportTemplatesFileImpl;

  // ━━━ [기본 + 로컬 템플릿 머지 시스템] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // defaultTemplateCache: Theme Templates/Lists.json fetch 결과 캐시 (한 번만 로드).
  // defaultTemplateLoadPromise: in-flight fetch 공유용 — 동시 호출 시 중복 fetch 방지.
  // mergedTemplateCache: default 위에 local override 적용한 최종 목록 (UI 조회 캐시).
  let defaultTemplateCache = null;
  let defaultTemplateLoadPromise = null;
  let mergedTemplateCache = [];
  const TEMPLATE_FALLBACK_LEAGUE_ID = 1;

  /** 템플릿 객체에서 폰트 패밀리를 정규화 후 반환. legacy 키(_fontFamily)도 fallback으로 인식. */
  function resolveTemplateFontFamily(t){
    const font = sanitizeFontFamily(t?.fontFamily ?? t?._fontFamily);
    return font || DEFAULT_FONT_FAMILY;
  }

  /**
   * 템플릿 객체를 깊은 복사(colors는 1-depth, 나머지는 spread).
   * - name이 비었거나 잘못된 객체면 null 반환.
   * - fontFamily 정규화 + legacy _fontFamily 키는 정리.
   * 외부 입력(import JSON, 메모리 캐시 분리)을 안전히 다루기 위한 단일 진입점.
   */
  function cloneTemplateRecord(templateMaybe){
    if(!templateMaybe || typeof templateMaybe !== 'object') return null;
    const name = String(templateMaybe.name || '').trim();
    if(!name) return null;
    const next = { ...templateMaybe, name };
    next.colors = (templateMaybe.colors && typeof templateMaybe.colors === 'object') ? { ...templateMaybe.colors } : {};
    next.fontFamily = resolveTemplateFontFamily(templateMaybe);
    delete next._fontFamily;
    return next;
  }

  /** localStorage(TKEY)의 사용자 로컬 템플릿 목록을 깊은 복사된 배열로 반환. 손상 시 빈 배열. */
  function readLocalTemplates(){
    try{
      const list = JSON.parse(localStorage.getItem(TKEY) || '[]');
      return Array.isArray(list) ? list.map(cloneTemplateRecord).filter(Boolean) : [];
    }catch{
      return [];
    }
  }

  /** 로컬 템플릿 목록을 TKEY에 직렬화 저장. quota 초과 시 호출자가 catch. */
  function writeLocalTemplates(list){
    localStorage.setItem(TKEY, JSON.stringify(list));
  }

  /** 사용자가 마지막으로 선택한 템플릿 이름을 TLASTKEY에 저장. 빈 값이면 키 제거. */
  function setLastSelectedTemplateName(nameMaybe){
    const name = String(nameMaybe || '').trim();
    try{
      if(name) localStorage.setItem(TLASTKEY, name);
      else localStorage.removeItem(TLASTKEY);
    }catch{}
  }

  /** TLASTKEY에서 마지막 선택 템플릿 이름 조회. 없거나 손상되면 빈 문자열. */
  function getLastSelectedTemplateName(){
    try{
      return String(localStorage.getItem(TLASTKEY) || '').trim();
    }catch{
      return '';
    }
  }

  /**
   * Theme Templates/Lists.json을 fetch해 defaultTemplateCache에 채움.
   * 1) 이미 캐시에 배열 있으면 즉시 반환.
   * 2) in-flight Promise 있으면 그것 반환 — 동시 호출이 중복 fetch 방지.
   * 3) 처음 호출이면 fetch 시작 → 응답을 cloneTemplateRecord로 sanitize.
   * 4) 실패 시 빈 배열 캐시(이후 재시도 안 함, 사용자 로컬 템플릿만 사용).
   */
  async function loadDefaultTemplates(){
    if(Array.isArray(defaultTemplateCache)) return defaultTemplateCache;
    if(!defaultTemplateLoadPromise){
      defaultTemplateLoadPromise = fetch(encodeURI(appAssetPath('Theme Templates/Lists.json')))
        .then(res => {
          if(!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(list => {
          defaultTemplateCache = Array.isArray(list) ? list.map(cloneTemplateRecord).filter(Boolean) : [];
          return defaultTemplateCache;
        })
        .catch(err => {
          console.warn('Failed to load default templates from Theme Templates/Lists.json:', err);
          defaultTemplateCache = [];
          return defaultTemplateCache;
        });
    }
    return defaultTemplateLoadPromise;
  }

  /**
   * default 템플릿 위에 local 템플릿을 override 한 최종 목록 반환.
   * Map으로 name 중복 제거 — 같은 이름의 local이 있으면 default를 덮어씀.
   * mergedTemplateCache에도 저장 — getTemplateByName이 동기 조회 가능하게.
   */
  async function getMergedTemplates(){
    const defaults = await loadDefaultTemplates();
    const locals = readLocalTemplates();
    const merged = new Map(defaults.map(t => [t.name, cloneTemplateRecord(t)]));
    locals.forEach(t => merged.set(t.name, t));
    mergedTemplateCache = Array.from(merged.values()).map(cloneTemplateRecord).filter(Boolean);
    return mergedTemplateCache;
  }

  /** mergedTemplateCache에서 이름으로 템플릿 동기 조회. 캐시 비었으면 null. */
  function getTemplateByName(nameMaybe){
    const name = String(nameMaybe || '').trim();
    if(!name) return null;
    return mergedTemplateCache.find(t => t && t.name === name) || null;
  }

  /** 입력값을 finite leagueId로 정규화. NaN/undefined는 null. */
  function normalizeTemplateLeagueId(value){
    const leagueId = Number(value);
    return Number.isFinite(leagueId) ? leagueId : null;
  }

  /**
   * 템플릿이 주어진 leagueId와 매칭되는지 판정.
   * 템플릿의 leagueId는 단일값 또는 배열(여러 리그 공유 시) 모두 허용.
   */
  function templateMatchesLeagueId(templateMaybe, leagueIdMaybe){
    if(!templateMaybe || typeof templateMaybe !== 'object') return false;
    const targetLeagueId = normalizeTemplateLeagueId(leagueIdMaybe);
    if(targetLeagueId == null) return false;
    const rawLeagueIds = Array.isArray(templateMaybe.leagueId)
      ? templateMaybe.leagueId
      : [templateMaybe.leagueId];
    return rawLeagueIds.some(id => normalizeTemplateLeagueId(id) === targetLeagueId);
  }

  /**
   * leagueId로 매칭되는 템플릿 1개 반환.
   * 1) default 캐시에서 leagueId 매칭 시도(기준).
   * 2) 매칭 시 같은 이름의 local override가 있으면 그쪽 우선 반환.
   * 3) 매칭 없거나 캐시 비면 null.
   */
  async function getTemplateByLeagueId(leagueIdMaybe){
    const targetLeagueId = normalizeTemplateLeagueId(leagueIdMaybe);
    if(targetLeagueId == null) return null;

    const mergedList = await getMergedTemplates();
    const mergedMatch = mergedList.find(t => templateMatchesLeagueId(t, targetLeagueId));
    if(mergedMatch) return mergedMatch;

    await loadDefaultTemplates();
    const defaultMatch = defaultTemplateCache.find(t => templateMatchesLeagueId(t, targetLeagueId));
    if(!defaultMatch){
      const fallbackMatch = mergedList.find(t => templateMatchesLeagueId(t, TEMPLATE_FALLBACK_LEAGUE_ID))
        || defaultTemplateCache.find(t => templateMatchesLeagueId(t, TEMPLATE_FALLBACK_LEAGUE_ID))
        || null;
      if(!fallbackMatch) return null;
      const fallbackName = String(fallbackMatch?.name || '').trim();
      if(!fallbackName) return fallbackMatch;
      return mergedList.find(t => t && String(t.name || '').trim() === fallbackName) || fallbackMatch;
    }

    const matchedName = String(defaultMatch?.name || '').trim();
    if(!matchedName) return null;
    return mergedList.find(t => t && String(t.name || '').trim() === matchedName) || defaultMatch;
  }

  /**
   * leagueId 기반 템플릿 자동 적용 (Iter 5-5).
   *
   * 1) leagueId 매칭 템플릿 검색. 없으면 null.
   * 2) 이미 동일 템플릿이 활성이면 force가 아닌 한 no-op (불필요 깜빡임 방지).
   * 3) loadTemplates로 select 옵션 갱신 + 새 템플릿을 선택값으로 set.
   * 4) TLASTKEY에 영속화 + applyTemplate으로 색상/폰트/레이아웃 적용 + render+persist.
   *
   * fixture.js가 silent=false인 fetch 성공 시에만 호출 — 자동 폴링 중에는
   * 사용자가 직접 변경한 컬러를 보호하기 위해 호출하지 않는다.
   */
  async function autoApplyTemplateByLeagueId(leagueIdMaybe, options = {}){
    const template = await getTemplateByLeagueId(leagueIdMaybe);
    if(!template) return null;

    const currentName = String(el.templateSelect?.value || '').trim();
    if(!options.force && currentName === template.name) return template;

    await loadTemplates(template.name);
    if(el.templateSelect) el.templateSelect.value = template.name;
    setLastSelectedTemplateName(template.name);
    applyTemplate(template);
    render();
    persist();
    return template;
  }

  window.getTemplateByLeagueId = getTemplateByLeagueId;
  window.autoApplyTemplateByLeagueId = autoApplyTemplateByLeagueId;

  function resolveTemplateSaveName(nameMaybe){
    const typed = (nameMaybe||'').trim();
    if(typed) return typed;
    return (el.templateSelect?.value||'').trim();
  }

  /**
   * 템플릿 select 요소를 merged 목록으로 다시 채움.
   *
   * 1) getMergedTemplates로 default + local 병합 목록 확보.
   * 2) 기존 선택값 보존(stillExists면 유지, 없어졌으면 빈 값으로).
   * 3) "로드된 템플릿" 플레이스홀더 + 각 템플릿 option 추가.
   * 4) TLASTKEY 동기화 — 선택 살아있으면 그 이름으로, 사라졌으면 비움.
   *
   * @param {string=} selectedName - 명시적으로 선택할 템플릿 이름. undefined면 현재 select 값 유지.
   */
  async function loadTemplates(selectedName){
    const list = await getMergedTemplates();
    const prevValue = (selectedName!==undefined) ? selectedName : (el.templateSelect?.value||'');
    if(el.templateSelect){
      el.templateSelect.innerHTML = '';
      const o=document.createElement('option');
      o.value='';
      o.textContent='로드된 템플릿';
      el.templateSelect.appendChild(o);
      list.forEach(t=>{
        if(!t||!t.name) return;
        const x=document.createElement('option');
        x.value=t.name;
        x.textContent=t.name;
        el.templateSelect.appendChild(x);
      });
      const stillExists=list.some(t=>t&&t.name===prevValue);
      el.templateSelect.value = stillExists ? prevValue : '';
      if(stillExists) setLastSelectedTemplateName(prevValue);
      else if(prevValue) setLastSelectedTemplateName('');
    }
    return list;
  }

  /**
   * 현재 state를 이름 붙여 로컬 템플릿으로 저장.
   *
   * 1) default 캐시 미리 로드 후 이름 결정(입력값 > select 선택값).
   * 2) merged 목록에 같은 이름이 있는지 확인 — 있으면 confirm 창으로 덮어쓰기 의사 묻기.
   *    default와 동명인데 local에 없으면 "기본 템플릿을 로컬 override로 저장" 메시지 분기.
   * 3) 기존 동명 항목 제거 후 새 템플릿 push → writeLocalTemplates로 영속화.
   * 4) loadTemplates로 select 갱신 + 새 이름 선택 + TLASTKEY 영속화.
   */
  async function saveTemplate(name){
    await loadDefaultTemplates();
    name = resolveTemplateSaveName(name);
    if(!name) return alert('템플릿 이름을 입력해 주세요.');
    const localList = readLocalTemplates();
    const mergedList = await getMergedTemplates();
    const localExists = localList.some(t=>t&&t.name===name);
    const defaultExists = defaultTemplateCache.some(t=>t&&t.name===name);
    const mergedExists = mergedList.some(t=>t&&t.name===name);
    if(mergedExists){
      const message = (defaultExists && !localExists)
        ? `"${name}" 기본 템플릿을 현재 설정으로 덮어쓸까요? (로컬 override로 저장됩니다.)`
        : `"${name}" 템플릿이 이미 있습니다. 덮어쓸까요?`;
      if(!confirm(message)) return;
    }
    const next = localList.filter(t=>t&&t.name!==name);
    next.push(buildCurrentTemplate(name));
    try{
      writeLocalTemplates(next);
    }catch(e){
      return alert('저장 공간이 부족합니다.');
    }
    await loadTemplates(name);
    if(el.templateSelect) el.templateSelect.value=name;
    setLastSelectedTemplateName(name);
    alert('저장되었습니다.');
  }

  /**
   * 템플릿 삭제. 이름 입력란 > 인자 > select 선택값 순으로 대상 결정.
   *
   * 1) 이름이 없으면 alert 후 종료.
   * 2) local에도 default에도 없으면 "찾을 수 없음" alert 후 종료.
   * 3) default에만 있으면 — 기본 템플릿 자체는 삭제 불가 (alert).
   * 4) local에서만 제거. default와 동명이고 현재 선택돼 있으면 → default fallback으로 자동 적용.
   * 5) loadTemplates 후 TLASTKEY 갱신.
   */
  async function deleteTemplate(nameMaybe){
    await loadDefaultTemplates();
    const typed=(el.templateName?.value||'').trim();
    const selected=(el.templateSelect?.value||'').trim();
    const name=(typed||nameMaybe||selected||'').trim();
    if(!name){ alert('삭제할 템플릿을 선택하거나 이름을 입력해 주세요.'); return; }
    const localList = readLocalTemplates();
    const localExists = localList.some(t=>t&&t.name===name);
    const defaultExists = defaultTemplateCache.some(t=>t&&t.name===name);
    if(!localExists && !defaultExists){ alert(`"${name}" 템플릿을 찾을 수 없습니다.`); return; }
    if(defaultExists && !localExists){ alert('기본 템플릿은 삭제할 수 없습니다.'); return; }
    writeLocalTemplates(localList.filter(t=>t&&t.name!==name));
    const selectedName = selected === name ? (defaultExists ? name : '') : selected;
    const list = await loadTemplates(selectedName);
    if(defaultExists && selected === name){
      const fallback = list.find(t=>t&&t.name===name);
      if(fallback){
        applyTemplate(fallback);
        render();
        persist();
        setLastSelectedTemplateName(name);
      }
    }else if(selected === name){
      setLastSelectedTemplateName('');
    }
    if(el.templateName) el.templateName.value='';
    alert(defaultExists ? `"${name}" 로컬 저장본을 지우고 기본 템플릿으로 되돌렸습니다.` : `"${name}" 삭제 완료.`);
  }

  /**
   * 로컬 템플릿 일괄 초기화. "리셋" 버튼 핸들러.
   *
   * 1) 로컬이 비어있으면 alert 후 종료.
   * 2) confirm으로 사용자 의사 확인.
   * 3) TKEY 제거 → loadTemplates로 default만 남은 select 재구성.
   * 4) 현재 선택값이 default에도 있으면 그쪽으로 자동 적용, 없으면 빈 선택.
   */
  async function resetTemplates(){
    await loadDefaultTemplates();
    const localList = readLocalTemplates();
    if(localList.length === 0){ alert('초기화할 로컬 템플릿이 없습니다.'); return; }
    if(!confirm('로컬에 저장된 템플릿과 기본 템플릿 변경 사항을 모두 지울까요?')) return;
    try{
      localStorage.removeItem(TKEY);
    }catch(e){
      console.warn('Failed to reset local templates:', e);
    }
    const selected = (el.templateSelect?.value || '').trim();
    const selectedDefaultExists = defaultTemplateCache.some(t=>t&&t.name===selected);
    const list = await loadTemplates(selectedDefaultExists ? selected : '');
    if(selectedDefaultExists){
      const fallback = list.find(t=>t&&t.name===selected);
      if(fallback){
        applyTemplate(fallback);
        render();
        persist();
        setLastSelectedTemplateName(selected);
      }
    }else{
      setLastSelectedTemplateName('');
    }
    if(el.templateName) el.templateName.value = '';
    alert('기본 템플릿만 남기고 로컬 템플릿을 초기화했습니다.');
  }

  /**
   * 외부 템플릿 객체 t를 로컬에 upsert (import JSON에서 호출).
   *
   * 1) 이름 정규화(없으면 'Imported').
   * 2) merged 목록에 같은 이름 있으면 askOnDuplicate=true일 때 confirm. 거절하면 saved:false 반환.
   * 3) 현재 state 기반 base 템플릿에 t 키들 덮어쓰기 → 누락된 필드는 현재 state로 보강.
   * 4) 동명 항목 제거 후 cloneTemplateRecord로 sanitize 한 객체 push.
   * 5) 결과 객체 { saved, replaced, name } 반환.
   */
  async function upsertTemplateToLocal(t, askOnDuplicate=true){
    await loadDefaultTemplates();
    const list = readLocalTemplates();
    const mergedList = await getMergedTemplates();
    const name = String(t?.name || 'Imported').trim() || 'Imported';
    const exists = mergedList.some(x=>x&&x.name===name);
    if(exists && askOnDuplicate){
      const ok = confirm(`"${name}" 템플릿이 이미 있습니다. 덮어쓸까요?`);
      if(!ok) return{saved:false,replaced:false,name};
    }
    const toSave = buildCurrentTemplate(name);
    Object.assign(toSave, t);
    toSave.name = name;
    toSave.fontFamily = resolveTemplateFontFamily(t);
    const next = list.filter(x=>x&&x.name!==name);
    next.push(cloneTemplateRecord(toSave));
    writeLocalTemplates(next);
    return{saved:true,replaced:exists,name};
  }

  /**
   * 템플릿 JSON 파일 다운로드. 이름 입력란이 있으면 현재 state 기반 단일 템플릿,
   * 없으면 merged 전체 목록을 한 파일로 묶어 내보낸다.
   */
  async function exportTemplatesFileImpl(){
    const nameInput=(el.templateName?.value||'').trim();
    let dataStr,filename;
    if(nameInput){
      dataStr=JSON.stringify(buildCurrentTemplate(nameInput),null,2);
      filename=`${slugify(nameInput)}.json`;
    }else{
      const list=await getMergedTemplates();
      dataStr=JSON.stringify(list,null,2);
      filename='scoreboard-templates.json';
    }
    downloadBlob(filename, new Blob([dataStr],{type:'application/json'}));
  }
  window.exportTemplatesFileImpl = exportTemplatesFileImpl;
  loadDefaultTemplates();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [색상/폰트 바인딩] 색상 피커와 HEX 텍스트 입력을 양방향으로 연결하고 폰트 변경 처리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // [색상 id, state.colors 키, CSS 변수명] 매핑 테이블.
  // 'uiBg'는 Iter 5-7에서 설정 팝업으로 이전 — colorMap에서 제거됨.
  window.colorMap = [
    ['inBoardA','boardA','--board-a'],
    ['inBoardB','boardB','--board-b'],
    ['inScoreBg','scoreBg','--score-bg'],
    ['inDigitsColor','digits','--digits-color'],
    ['inMetaColor','meta','--meta-color'],
    ['inExtraColor','extra','--extra-color'],
    ['inHalfBg','halfBg','--half-bg'],
    ['inHalfText','halfText','--half-text'],
    ['inHomeBg','homeBg','--home-bg'],
    ['inHomeText','homeText','--home-text'],
    ['inAwayBg','awayBg','--away-bg'],
    ['inAwayText','awayText','--away-text'],
    ['inOutline','outline','--card-outline'],
    ['pkBaseColor','pkBase','--pk-base'],
    ['inHomeOutline','homeOutline','--home-outline'],
    ['inAwayOutline','awayOutline','--away-outline'],
    ['inNoteText','noteText','--note-text'],
    ['inNoteStroke','noteStroke','--note-stroke'],
  ];

  /** #RGB 또는 #RRGGBB 형식의 HEX 색상 문자열을 정규화. 유효하지 않으면 null 반환 */
  function normalizeHex(v){ if(!v) return null; v=String(v).trim(); if(/^#?[0-9a-fA-F]{3}$/.test(v)){ const h=v.replace('#',''); return '#'+h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; } if(/^#?[0-9a-fA-F]{6}$/.test(v)) return '#'+v.replace('#','').toLowerCase(); return null; }

  /**
   * 색상 피커(input[type=color])와 HEX 텍스트 입력 필드를 양방향으로 연결.
   * 어느 쪽을 변경해도 state, CSS 변수, 상대 필드가 모두 동기화됨.
   */
  // 사용자가 테마 탭에서 직접 만지면 state.teamColorOverride=true로 마킹할 키 목록.
  // applyFixtureToState가 API 컬러로 덮어쓰지 않도록 가드.
  const TEAM_COLOR_KEYS = new Set(['homeBg','homeText','awayBg','awayText']);

  /**
   * 색상 피커와 HEX 텍스트 입력 필드를 양방향으로 연결.
   *
   * 드래그 lag 방지 정책:
   *   - input(드래그 중): CSS 변수 + hex 표시만 즉시 갱신 → 라이브 프리뷰. 무거운 작업 X.
   *   - change(피커 닫힘): state 저장 + persist + render + 라인업/스탯 패널 dispatch 한 번만 실행.
   * 결과: 60fps로 점수판이 즉시 반영되면서도 드래그 도중 lag 없음.
   */
  function bindColorWithHex(colorId, key, cssVar){
    const colorInput=$(colorId); if(!colorInput) return;
    const hexInput=document.createElement('input'); hexInput.type='text'; hexInput.id=colorId+'Hex'; hexInput.placeholder='#RRGGBB'; hexInput.style.width='92px'; hexInput.style.marginLeft='6px'; hexInput.value=state.colors[key]||colorInput.value||'#000000';
    // bootstrap 스타일 적용
    hexInput.style.background='#0b1220'; hexInput.style.color='#e5e7eb'; hexInput.style.border='1px solid #ffffff20'; hexInput.style.borderRadius='10px'; hexInput.style.padding='4px 8px'; hexInput.style.height='36px';
    colorInput.insertAdjacentElement('afterend', hexInput);
    // 'theme:colors-changed' 이벤트 — 라인업/스탯 패널이 받아 재렌더(commit 시점에만 호출).
    const dispatchThemeChange = () => document.dispatchEvent(new CustomEvent('theme:colors-changed', { detail: { key } }));
    const markOverride = () => {
      if (!TEAM_COLOR_KEYS.has(key)) return;
      state.teamColorOverride = true;
      state.teamColorOverrideFixtureId = (typeof getLastFixtureId === 'function') ? getLastFixtureId() : null;
    };

    /** 드래그 중 가벼운 라이브 프리뷰 — CSS 변수와 hex 표시만 갱신. state/persist/render/dispatch 안 함. */
    const previewThemeColor = value => {
      setCSS(cssVar, value);
      hexInput.value = value;
    };

    /** 피커 닫힘/HEX 입력 확정 시 한 번만 실행되는 무거운 commit. */
    const commitThemeColor = (value, syncColorInput = false) => {
      // 동일 값이면 dispatch/render 생략 — 사용자가 피커 열었다 그냥 닫은 경우 효율화.
      const same = state.colors[key] === value;
      state.colors[key] = value;
      setCSS(cssVar, value);
      hexInput.value = value;
      if (syncColorInput) colorInput.value = value;
      markOverride();
      if (same) return;
      persist();
      render();
      dispatchThemeChange();
    };

    // input(드래그): 라이브 프리뷰만. change(피커 닫힘): 최종 commit.
    colorInput.addEventListener('input', e => previewThemeColor(e.target.value));
    colorInput.addEventListener('change', e => commitThemeColor(e.target.value));

    // hex 입력 직접 변경은 피커 드래그가 아니므로 즉시 commit. colorInput.value도 같이 동기화.
    hexInput.addEventListener('change', e => {
      const nv = normalizeHex(e.target.value);
      if (!nv) {
        hexInput.value = state.colors[key];
        alert('HEX 형식은 #RRGGBB 또는 #RGB입니다.');
        return;
      }
      commitThemeColor(nv, true);
    });
  }
  window.colorMap.forEach(([id,key,varName])=>bindColorWithHex(id,key,varName));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [이벤트 바인딩] 각종 UI 컨트롤에 이벤트 리스너를 연결
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // [이벤트 등록] 로고 업로드 (현재 주석 처리됨)
  // el.inHomeLogo?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ state.homeLogo=r.result; render(); }; r.readAsDataURL(f); } });
  // el.inAwayLogo?.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f){ const r=new FileReader(); r.onload=()=>{ state.awayLogo=r.result; render(); }; r.readAsDataURL(f); } });

  // [이벤트 등록] 합계 점수(Aggregate) 토글 및 기준 점수 입력
  el.aggToggle?.addEventListener('change', e=>{ state.aggEnabled=!!e.target.checked; render(); persist(); });
  el.aggHomeBase?.addEventListener('input', e=>{ state.aggHomeBase=Math.max(0,Number(e.target.value)||0); render(); persist(); });
  el.aggAwayBase?.addEventListener('input', e=>{ state.aggAwayBase=Math.max(0,Number(e.target.value)||0); render(); persist(); });

  // [이벤트 등록] 로고 정렬, 모서리 모드, 보드 너비 컨트롤
  el.logoAlign?.addEventListener('change', e=>{ state.logoAlign=e.target.value; render(); persist(); });
  $('radiusMode')?.addEventListener('change', e=>{ state.radiusMode=e.target.value; render(); persist(); });
  $('boardWidth')?.addEventListener('input', e=>{ state.boardWidth=Math.max(10,Number(e.target.value)||1080); render(); persist(); });
  $('boardWidthReset')?.addEventListener('click', ()=>{ state.boardWidth=1080; render(); persist(); });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [수동 모드] 토글 및 입력 이벤트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 수동 모드 ON/OFF 토글.
   * ON 시 안내 다이얼로그를 표시하고, 취소하면 체크박스를 원복한다.
   * OFF 시에는 다이얼로그 없이 즉시 해제된다.
   */
  function toggleManualMode(){
    const checkbox = el.manualModeToggle;
    // 1. 체크박스 상태 기준으로 ON/OFF 방향 결정 (checkbox가 없으면 현재 state 반전)
    const turningOn = checkbox ? checkbox.checked : !state.manualMode;
    // 2. ON 전환 시 안내 confirm — 취소하면 체크박스를 되돌리고 종료
    if(turningOn){
      const ok = confirm(
        '수동 모드를 켜시겠습니까?\n\n' +
        '수동 모드가 ON이면:\n' +
        '- 경기 ID로 API 데이터를 불러와도 점수판에 적용되지 않습니다.\n' +
        '- 팀 이름, 점수, 득점자, 로고를 직접 입력해 사용합니다.\n\n' +
        '이벤트 경기 등 API가 지원되지 않는 경기에 사용하세요.'
      );
      if(!ok){
        if(checkbox) checkbox.checked = false;
        return;
      }
    }
    // 3. state 및 체크박스 UI 반영
    state.manualMode = turningOn;
    if(checkbox) checkbox.checked = turningOn;
    // 4. 수동 모드 입력 섹션 표시/숨김
    el.manualSection.classList.toggle('visible', turningOn);
    // 5. ON 시 현재 state 값을 입력 필드에 미리 채워 넣음
    if(turningOn){
      state.homeLogo = state.homeLogoManual || '';
      state.awayLogo = state.awayLogoManual || '';
      syncManualInputs();
    }else{
      state.homeLogo = '';
      state.awayLogo = '';
    }
    render();
    persist();
  }

  /**
   * 현재 state 값을 수동 모드 입력 필드 전체에 동기화.
   * 수동 모드를 켤 때, 그리고 점수 +/- 버튼 클릭 후 표시값 갱신에 사용한다.
   */
  function syncManualInputs(){
    if(el.manualHomeName) el.manualHomeName.value = state.homeName || '';
    if(el.manualAwayName) el.manualAwayName.value = state.awayName || '';
    if(el.manualHomeScoreVal) el.manualHomeScoreVal.textContent = state.homeScore ?? 0;
    if(el.manualAwayScoreVal) el.manualAwayScoreVal.textContent = state.awayScore ?? 0;
    if(el.extraInput) el.extraInput.value = state.extra ?? 0;
    if(el.manualHomeNote) el.manualHomeNote.value = state.notes.home || '';
    if(el.manualAwayNote) el.manualAwayNote.value = state.notes.away || '';
    if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value = (/^(https?:)?\/\//i.test(state.homeLogoManual || '') ? state.homeLogoManual : '');
    if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value = (/^(https?:)?\/\//i.test(state.awayLogoManual || '') ? state.awayLogoManual : '');
  }

  // [이벤트 등록] 수동 모드 — 팀 이름·득점자 텍스트 입력
  el.manualHomeName?.addEventListener('input', e=>{ state.homeName=e.target.value; render(); persist(); });
  el.manualAwayName?.addEventListener('input', e=>{ state.awayName=e.target.value; render(); persist(); });
  el.manualHomeNote?.addEventListener('input', e=>{ state.notes.home=e.target.value; render(); persist(); });
  el.manualAwayNote?.addEventListener('input', e=>{ state.notes.away=e.target.value; render(); persist(); });

  // [이벤트 등록] 수동 모드 — 점수 +/- 버튼 (0 미만으로 내려가지 않음)
  el.manualHomePlus?.addEventListener('click',  ()=>{ state.homeScore++; syncManualInputs(); render(); persist(); });
  el.manualHomeMinus?.addEventListener('click', ()=>{ state.homeScore=Math.max(0,state.homeScore-1); syncManualInputs(); render(); persist(); });
  el.manualAwayPlus?.addEventListener('click',  ()=>{ state.awayScore++; syncManualInputs(); render(); persist(); });
  el.manualAwayMinus?.addEventListener('click', ()=>{ state.awayScore=Math.max(0,state.awayScore-1); syncManualInputs(); render(); persist(); });
  // [이벤트 등록] 수동 모드 — 점수 초기화
  function resetManualScore(){
    state.homeScore = 0;
    state.awayScore = 0;
    syncManualInputs();
    render();
    persist();
  }
  el.manualResetScore?.addEventListener('click', resetManualScore);

  /**
   * 이미지 파일을 읽어 URL 문자열을 콜백으로 전달.
   * - SVG: readAsText → data:image/svg+xml,{encodeURIComponent} 형식
   *   → 브라우저가 벡터로 렌더링하며, localStorage에도 문자열로 저장 가능
   * - 그 외(PNG 등): readAsDataURL → base64 data URL
   */
  function readLogoFile(file, cb){
    const r = new FileReader();
    if(file.type === 'image/svg+xml'){
      // SVG는 텍스트로 읽어 URL-encoded data URI 생성 (벡터 품질 유지)
      r.onload = ()=> cb('data:image/svg+xml,' + encodeURIComponent(r.result));
      r.readAsText(file);
    } else {
      // PNG 등 래스터 이미지는 base64로 변환
      r.onload = ()=> cb(r.result);
      r.readAsDataURL(file);
    }
  }
  // [이벤트 등록] 수동 모드 — 로고 파일 업로드 (파일 선택 시 URL 입력란 초기화)
  function clearManualLogo(side){
    if(side === 'home'){
      state.homeLogoManual = '';
      if(state.manualMode) state.homeLogo = '';
      if(el.manualHomeLogo) el.manualHomeLogo.value = '';
      if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value = '';
    }else{
      state.awayLogoManual = '';
      if(state.manualMode) state.awayLogo = '';
      if(el.manualAwayLogo) el.manualAwayLogo.value = '';
      if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value = '';
    }
    render();
    persist();
  }
  el.manualHomeLogo?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    readLogoFile(f, url=>{ state.homeLogoManual=url; if(state.manualMode) state.homeLogo=url; if(el.manualHomeLogoUrl) el.manualHomeLogoUrl.value=''; render(); persist(); });
  });
  el.manualAwayLogo?.addEventListener('change', e=>{
    const f=e.target.files?.[0]; if(!f) return;
    readLogoFile(f, url=>{ state.awayLogoManual=url; if(state.manualMode) state.awayLogo=url; if(el.manualAwayLogoUrl) el.manualAwayLogoUrl.value=''; render(); persist(); });
  });
  // [이벤트 등록] 수동 모드 — 로고 URL 직접 입력 (URL 입력 시 파일 선택 초기화)
  el.manualHomeLogoUrl?.addEventListener('change', e=>{
    const url=e.target.value.trim(); if(!url){ clearManualLogo('home'); return; }
    state.homeLogoManual=url; if(state.manualMode) state.homeLogo=url; if(el.manualHomeLogo) el.manualHomeLogo.value=''; render(); persist();
  });
  el.manualAwayLogoUrl?.addEventListener('change', e=>{
    const url=e.target.value.trim(); if(!url){ clearManualLogo('away'); return; }
    state.awayLogoManual=url; if(state.manualMode) state.awayLogo=url; if(el.manualAwayLogo) el.manualAwayLogo.value=''; render(); persist();
  });
  el.manualHomeLogoUrl?.addEventListener('input', e=>{ if(!e.target.value.trim() && state.homeLogoManual) clearManualLogo('home'); });
  el.manualAwayLogoUrl?.addEventListener('input', e=>{ if(!e.target.value.trim() && state.awayLogoManual) clearManualLogo('away'); });
  el.manualHomeLogoClear?.addEventListener('click', ()=> clearManualLogo('home'));
  el.manualAwayLogoClear?.addEventListener('click', ()=> clearManualLogo('away'));

  // [이벤트 등록] 폰트 프리셋, URL 입력, 로컬 폰트 목록, 파일 업로드
  let dynamicFontLink = null;
  let uploadedFontStyle = null;
  function clearRuntimeFontAssets(){
    if(dynamicFontLink){ dynamicFontLink.remove(); dynamicFontLink = null; }
    if(uploadedFontStyle){ uploadedFontStyle.remove(); uploadedFontStyle = null; }
    if(el.fontFile) el.fontFile.value = '';
  }
  function attachDynamicFontLink(url){
    if(!url) return;
    dynamicFontLink=document.createElement('link');
    dynamicFontLink.rel='stylesheet';
    dynamicFontLink.href=url;
    document.head.appendChild(dynamicFontLink);
  }
  function resetFontToDefault(){
    clearRuntimeFontAssets();
    if(el.fontCssUrl) el.fontCssUrl.value = '';
    if(el.systemFonts) el.systemFonts.value = '';
    if(el.fontPreset) el.fontPreset.value = DEFAULT_FONT_FAMILY;
    state.fontFamily = DEFAULT_FONT_FAMILY;
    render();
    persist();
  }
  /** CSS URL과 폰트 패밀리 입력값을 읽어 동적으로 폰트를 적용 */
  function applyFontFromInputs(){
    const url=el.fontCssUrl?.value.trim();
    const fam=sanitizeFontFamily(el.fontFamily?.value);
    if(!url && !fam){ resetFontToDefault(); return; }
    clearRuntimeFontAssets();
    if(el.systemFonts) el.systemFonts.value = '';
    if(url) attachDynamicFontLink(url);
    if(fam) state.fontFamily=fam;
    render();
    persist();
  }
  el.fontPreset?.addEventListener('change', ()=>{
    if(!el.fontPreset.value) return;
    const option=el.fontPreset.selectedOptions?.[0];
    const fam=sanitizeFontFamily(el.fontPreset.value) || DEFAULT_FONT_FAMILY;
    clearRuntimeFontAssets();
    if(el.fontCssUrl) el.fontCssUrl.value = '';
    if(el.systemFonts) el.systemFonts.value = '';
    state.fontFamily=fam;
    attachDynamicFontLink(option?.dataset?.fontUrl?.trim());
    render(); persist();
  });
  if(el.askLocalFonts) el.askLocalFonts.addEventListener('click', async()=>{
    if(!('queryLocalFonts' in window)){ alert('설치 폰트 읽기를 지원하지 않는 환경입니다.'); return; }
    try{ const fonts=await window.queryLocalFonts(); const fams=[...new Set(fonts.map(f=>f.family))].sort(); el.systemFonts.innerHTML=''; fams.forEach(name=>{ const o=document.createElement('option'); o.value=name; o.textContent=name; el.systemFonts.appendChild(o); }); }
    catch(e){ alert('설치 폰트 권한이 거부되었거나 지원되지 않습니다.'); }
  });
  if(el.systemFonts) el.systemFonts.addEventListener('change', e=>{ clearRuntimeFontAssets(); if(el.fontCssUrl) el.fontCssUrl.value = ''; state.fontFamily=sanitizeFontFamily(e.target.value) || DEFAULT_FONT_FAMILY; render(); persist(); });
  if(el.fontFile) el.fontFile.addEventListener('change', e=>{ const f=e.target.files?.[0]; if(!f) return; if(dynamicFontLink){ dynamicFontLink.remove(); dynamicFontLink = null; } const url=URL.createObjectURL(f); const fam=(f.name.replace(/\.[^.]+$/,'')||'Uploaded').replace(/[^A-Za-z0-9 _-]/g,''); const css=`@font-face{font-family:"${fam}";src:url('${url}');font-weight:100 900;font-style:normal;font-display:swap}`; if(uploadedFontStyle) uploadedFontStyle.remove(); uploadedFontStyle=document.createElement('style'); uploadedFontStyle.textContent=css; document.head.appendChild(uploadedFontStyle); if(el.fontCssUrl) el.fontCssUrl.value = ''; if(el.systemFonts) el.systemFonts.value = ''; state.fontFamily=sanitizeFontFamily(`'${fam}', ${DEFAULT_FONT_FAMILY}`) || `'${fam}', ${DEFAULT_FONT_FAMILY}`; render(); persist(); });
  el.applyFont?.addEventListener('click', applyFontFromInputs);
  el.resetFont?.addEventListener('click', resetFontToDefault);
