  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [초기화] 페이지 로드 시 저장된 상태를 복원하고 스코어보드를 초기 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. LocalStorage에서 상태 복원
  restore();
  // 1-1. 수동 모드 상태 UI 반영
  if(state.manualMode){
    if(el.manualModeToggle) el.manualModeToggle.checked = true;
    if(el.manualSection) el.manualSection.classList.add('visible');
    syncManualInputs();
  }
  // 2. 템플릿 목록 select 채우기
  loadTemplates();
  // 3. 시계 텍스트 초기화 및 전체 렌더
  el.clock.textContent = fmtClock(state.seconds);
  render();
  syncScoreCol();
  // 4. 배율은 DOM이 렌더된 뒤 적용해야 scrollHeight가 정확함
  requestAnimationFrame(initBoardScale);

  // 5. 창 크기 변경 시 (개발자도구 열고닫기 포함) 득점자 note 위치 재계산
  window.addEventListener('resize', () => autoLayoutNotes());
  if (window.ResizeObserver) {
    const board = $('board');
    if (board) new ResizeObserver(() => autoLayoutNotes()).observe(board);
  }

  /** about.md 파일을 fetch하여 marked.js로 파싱 후 about-rendered 요소에 삽입 */
  const aboutEl = document.getElementById('about-rendered');

  /** 헤딩 텍스트를 앵커 id로 변환 (한글 포함, 공백→하이픈, 특수문자 제거) */
  function aboutSlug(raw) {
    return raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function loadAbout(){
    if(!aboutEl) return;
    if(typeof marked === 'undefined'){
      aboutEl.innerHTML = '<p style="color:var(--muted)">marked.js 로드 실패</p>';
      return;
    }
    try {
      const res = await fetch(appAssetPath('about.md'));
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      // marked v9은 기본적으로 헤딩 id를 생성하지 않으므로 파싱 후 DOM에서 직접 주입
      // TODO: marked v9은 HTML을 sanitize하지 않으므로 about.md가 외부 소스로 교체될 경우 DOMPurify 적용 필요
      aboutEl.innerHTML = marked.parse(text);
      aboutEl.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
        h.id = aboutSlug(h.textContent);
      });

      // hash 라우팅 충돌 방지: 앵커 클릭을 가로채 panelBody scrollTop 직접 조정
      const pageAbout = document.getElementById('page-about');
      const scrollPane = pageAbout?.querySelector('.panelBody');
      const allHeadings = Array.from(aboutEl.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      aboutEl.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const id = decodeURIComponent(a.getAttribute('href').slice(1));
          const target = allHeadings.find(h => h.id === id);
          if(!target || !scrollPane) return;
          const paneRect = scrollPane.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          scrollPane.scrollTop = scrollPane.scrollTop + (targetRect.top - paneRect.top);
        });
      });
    } catch(e) {
      // e.message를 innerHTML에 직접 넣으면 XSS 위험이 있으므로 DOM API로 삽입
      const p = document.createElement('p');
      p.style.color = 'var(--muted)';
      const msg = document.createElement('span');
      msg.textContent = `about.md 로드 실패: ${e.message}`;
      const br = document.createElement('br');
      const small = document.createElement('small');
      small.textContent = '로컬 파일(file://)에서 직접 열면 브라우저 보안 정책상 외부 파일을 불러올 수 없어요. Vercel 배포 환경 또는 로컬 웹서버(예: VS Code Live Server 플러그인)에서 사용하세요.';
      p.append(msg, br, small);
      aboutEl.appendChild(p);
    }
  }

  loadAbout();

