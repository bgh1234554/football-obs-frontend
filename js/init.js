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
  // 2. 템플릿 목록 select 채우기 + 마지막 선택 템플릿 복원
  const selectedTemplateName = (typeof getLastSelectedTemplateName === 'function')
    ? getLastSelectedTemplateName()
    : '';
  loadTemplates(selectedTemplateName).catch(err => console.warn('Template list load failed:', err));
  if(selectedTemplateName && typeof restoreLastSelectedTemplate === 'function'){
    restoreLastSelectedTemplate();
  }
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

  /** about.md 파일을 fetch하여 markdown-it으로 파싱 + DOMPurify로 sanitize 후 about-rendered에 삽입 */
  const aboutEl = document.getElementById('about-rendered');

  /**
   * 한글 포함 헤딩 텍스트를 anchor id로 변환.
   * markdown-it-anchor의 slugify 옵션으로 주입 — 영어 lowercase + 공백→하이픈 + 한글 보존.
   */
  function aboutSlug(raw) {
    return String(raw)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * about.md 페이지 로드 + 렌더링.
   *
   * 1) markdown-it / markdown-it-anchor / DOMPurify 모두 로드됐는지 가드.
   * 2) markdown-it 인스턴스 생성: HTML 허용 + 자동 링크 + 줄바꿈 변환 활성화.
   *    markdown-it-anchor 플러그인으로 헤딩 id 자동 생성 (aboutSlug 사용).
   * 3) about.md fetch → md.render로 파싱 → DOMPurify.sanitize로 XSS 차단 → innerHTML 주입.
   * 4) 내부 앵커(#section) 클릭은 hash routing과 충돌하지 않게 직접 가로채서 panelBody scrollTop 조정.
   * 5) fetch 실패(보통 file:// 환경)면 안내 문구를 textContent로 안전하게 삽입.
   */
  async function loadAbout(){
    if(!aboutEl) return;
    // markdown-it 글로벌은 'markdownit', markdown-it-anchor의 UMD 글로벌은 'markdownItAnchor' (camelCase).
    const mdAnchorGlobal = window.markdownItAnchor || window.markdownitAnchor;
    if(typeof window.markdownit === 'undefined' || !mdAnchorGlobal || typeof window.DOMPurify === 'undefined'){
      aboutEl.innerHTML = '';
      const p = document.createElement('p');
      p.style.color = 'var(--muted)';
      p.textContent = '마크다운 렌더링 라이브러리(markdown-it / markdown-it-anchor / DOMPurify) 로드 실패';
      aboutEl.appendChild(p);
      return;
    }
    try {
      const res = await fetch(appAssetPath('about.md'));
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      // 1) markdown-it 인스턴스 + 플러그인 체인.
      //    html: about.md 안에 HTML 태그(예: <small>, <br>) 허용 — DOMPurify가 뒤에서 정화.
      //    linkify: 평문 URL 자동 링크화. breaks: 단일 줄바꿈을 <br>로 변환.
      const md = window.markdownit({ html: true, linkify: true, breaks: false });
      md.use(mdAnchorGlobal, { slugify: aboutSlug });

      // 2) ==형광펜== 강조 (markdown-it-mark) → <mark> 태그.
      if (window.markdownitMark) md.use(window.markdownitMark);

      // 3) 약어 정의(*[OBS]: ...) → <abbr> 자동 변환 (markdown-it-abbr).
      if (window.markdownitAbbr) md.use(window.markdownitAbbr);

      // 4) ::: tip / warning / danger / info ::: 콜아웃 박스 (markdown-it-container).
      //    각 종류마다 use() 한 번씩 등록해야 인식된다. validate/render 옵션으로 제목 추출 처리.
      const containerPlugin = window.markdownitContainer;
      if (containerPlugin) {
        ['tip', 'info', 'warning', 'danger'].forEach(name => {
          md.use(containerPlugin, name, {
            validate(params) {
              return params.trim().match(new RegExp('^' + name + '(?:\\s+(.*))?$'));
            },
            render(tokens, idx) {
              const token = tokens[idx];
              const m = token.info.trim().match(new RegExp('^' + name + '(?:\\s+(.*))?$'));
              if (token.nesting === 1) {
                const title = (m && m[1]) ? md.utils.escapeHtml(m[1]) : name.toUpperCase();
                return `<div class="custom-block ${name}"><p class="custom-block-title">${title}</p>\n`;
              }
              return '</div>\n';
            },
          });
        });
      }

      // 5) 마크다운 → HTML → DOMPurify 정화 (custom-block 클래스 등은 ALLOWED_ATTR로 보존).
      const rawHtml = md.render(text);
      aboutEl.innerHTML = window.DOMPurify.sanitize(rawHtml);

      // 3) 내부 앵커(#section) 클릭은 hash routing과 충돌하지 않게 직접 가로채 scroll.
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
      // e.message를 innerHTML에 직접 넣으면 XSS 위험이 있으므로 DOM API로 안전 삽입.
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
