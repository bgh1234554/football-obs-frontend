  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [초기화] 페이지 로드 시 저장된 상태를 복원하고 스코어보드를 초기 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. LocalStorage에서 상태 복원
  restore();
  initFsmThemeSelect();
  window.autoApplyTemplateByLeagueId(state.leagueId, state.leagueLogoUrl || null);
  // 폰트 완료 콜백이 init.js 로딩보다 빨라도 저장 상태 복원 전에는 표시하지 않습니다.
  fsmInitialStateReady = true;
  // 1-1. 수동 모드 상태 UI 반영
  if(state.manualMode){
    if(el.manualModeToggle) el.manualModeToggle.checked = true;
    if(el.manualSection) el.manualSection.classList.add('visible');
    syncManualInputs();
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
    if (board) {
      const noteLayoutObserver = new ResizeObserver(() => autoLayoutNotes());
      noteLayoutObserver.observe(board);
      board.querySelectorAll('.scoreboard-main, .scoreboard-timer, .time, .extra-time')
        .forEach(node => noteLayoutObserver.observe(node));
    }
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

  function buildAboutTabs(scrollPane) {
    const groups = [
      ['start', '시작하기'], ['broadcast', 'OBS 송출 환경'],
      ['guide', '데이터 안내'], ['keys', '단축키'],
      ['main', '메인 화면'], ['settings', '설정'], ['theme', '테마'],
      ['schedule', '일정'], ['tactics', '전술판'], ['advanced', '고급'], ['info', '문의 / 기타'],
    ];
    const sections = new Map(groups.map(([key, label]) => {
      const panel = document.createElement('section');
      panel.id = `about-panel-${key}`;
      panel.className = 'about-tab-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `about-tab-${key}`);
      panel.tabIndex = 0;
      return [key, { panel, label }];
    }));
    const nav = document.createElement('div');
    nav.className = 'about-tabs';
    const tabRow = document.createElement('div');
    tabRow.className = 'about-tab-row';
    tabRow.setAttribute('role', 'tablist');
    tabRow.setAttribute('aria-label', '사용 안내');
    nav.append(tabRow);
    // 문서는 그대로 두고 렌더링된 제목을 기준으로 내용만 탭에 나눈다.
    let group = null;
    let featureSection = false;
    for (const node of [...aboutEl.children]) {
      if (node.tagName === 'H2') {
        const title = aboutSlug(node.textContent);
        featureSection = title === '탭별-기능-설명';
        if (title === '목차' || featureSection) {
          group = 'skip';
          node.remove();
          continue;
        }
        group = ['처음-사용하기', '메뉴-바-구성', '주요-기능'].includes(title) ? 'start'
          : ['권장-환경', '송출-방식에-따른-차이'].includes(title) ? 'broadcast'
          : ['주요-안내-사항', '데이터가-없거나-잘못-표시될-때'].includes(title) ? 'guide'
          : title === '주요-키보드-단축키' ? 'keys'
          : title.startsWith('고급-팁') ? 'advanced' : 'info';
      } else if (featureSection && node.tagName === 'H3') {
        const title = aboutSlug(node.textContent);
        group = title.startsWith('메인-탭') ? 'main'
          : title.startsWith('설정-팝업') ? 'settings'
          : title.startsWith('테마-탭') ? 'theme'
          : title.startsWith('일정-확인') ? 'schedule' : 'tactics';
      }
      if (group === 'skip') node.remove();
      else if (group) sections.get(group).panel.append(node);
      else if (node.tagName === 'HR') node.remove();
    }
    function select(panel, { resetScroll = true, focus = false } = {}) {
      for (const { panel: item, button } of sections.values()) {
        const active = item === panel;
        item.hidden = !active;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && focus) button.focus();
      }
      if (resetScroll && scrollPane) scrollPane.scrollTop = 0;
      restoreMenu();
      updateCurrentHeading();
    }
    function closeMenus() {
      for (const { button, menu } of sections.values()) {
        if (!menu) continue;
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    }
    function openMenu(section) {
      closeMenus();
      section.menu.hidden = false;
      section.button.setAttribute('aria-expanded', 'true');
    }
    function restoreMenu() {
      const current = [...sections.values()].find(section => !section.panel.hidden);
      if (current) openMenu(current);
    }
    function updateCurrentHeading() {
      const section = [...sections.values()].find(item => !item.panel.hidden);
      if (!section) return;
      const edge = nav.getBoundingClientRect().bottom + 16;
      let active = section.targets[0];
      for (const heading of section.targets) {
        if (heading.getBoundingClientRect().top <= edge) active = heading;
      }
      if (scrollPane?.clientHeight && scrollPane.scrollTop > 0
          && scrollPane.scrollTop + scrollPane.clientHeight >= scrollPane.scrollHeight - 2) {
        active = section.targets.at(-1);
      }
      for (const [index, link] of [...section.menu.children].entries()) {
        if (section.targets[index] === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
    for (const [key, section] of sections) {
      const item = document.createElement('div');
      item.className = 'about-tab-item';
      item.setAttribute('role', 'presentation');
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `about-tab-${key}`;
      button.textContent = section.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', section.panel.id);
      button.setAttribute('aria-expanded', 'false');
      section.button = button;
      const menu = document.createElement('div');
      menu.id = `about-submenu-${key}`;
      menu.className = 'about-submenu';
      menu.hidden = true;
      menu.setAttribute('role', 'navigation');
      menu.setAttribute('aria-label', `${section.label} 소메뉴`);
      section.menu = menu;
      const headings = [...section.panel.querySelectorAll('h2,h3,h4')];
      // 대표 제목만 하나 있는 탭은 그대로 보여 주고, 세부 제목이 있으면 함께 제공한다.
      const targets = headings.length > 1 && headings[0].tagName === 'H3' ? headings.slice(1) : headings;
      section.targets = targets;
      for (const heading of targets) {
        const link = document.createElement('button');
        link.type = 'button';
        link.textContent = heading.textContent;
        link.className = 'about-submenu-link';
        link.addEventListener('click', () => {
          select(section.panel, { resetScroll: false });
          openMenu(section);
          if (scrollPane) {
            const scale = scrollPane.getBoundingClientRect().height / scrollPane.offsetHeight || 1;
            // 스크롤로 고정 메뉴 위치가 바뀌면 바뀐 경계를 기준으로 한 번 더 맞춘다.
            for (let i = 0; i < 2; i++) {
              scrollPane.scrollTop += (heading.getBoundingClientRect().top - nav.getBoundingClientRect().bottom) / scale - 12;
            }
          }
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          updateCurrentHeading();
        });
        menu.append(link);
      }
      button.addEventListener('click', () => {
        select(section.panel);
        openMenu(section);
        updateCurrentHeading();
      });
      item.addEventListener('mouseenter', () => openMenu(section));
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          openMenu(section);
          menu.querySelector('button')?.focus({ preventScroll: true });
          return;
        }
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const panels = [...sections.values()].map(item => item.panel);
        const index = panels.indexOf(section.panel);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + panels.length) % panels.length;
        closeMenus();
        select(panels[next], { focus: true });
        restoreMenu();
        updateCurrentHeading();
      });
      item.append(button);
      tabRow.append(item);
      nav.append(menu);
    }
    nav.addEventListener('mouseleave', restoreMenu);
    nav.addEventListener('focusout', event => {
      if (!nav.contains(event.relatedTarget)) restoreMenu();
    });
    nav.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      const section = [...sections.values()].find(item => item.menu.contains(event.target) || item.button === event.target);
      restoreMenu();
      section?.button.focus({ preventScroll: true });
    });
    // 문서를 다시 불러와도 바깥 클릭 이벤트가 중복 등록되지 않도록 한다.
    aboutEl.aboutTabsController?.abort();
    aboutEl.aboutTabsController = new AbortController();
    document.addEventListener('pointerdown', event => {
      if (!nav.contains(event.target)) restoreMenu();
    }, { signal: aboutEl.aboutTabsController.signal });
    scrollPane?.addEventListener('scroll', updateCurrentHeading, { passive: true, signal: aboutEl.aboutTabsController.signal });
    window.addEventListener('resize', updateCurrentHeading, { signal: aboutEl.aboutTabsController.signal });
    aboutEl.append(nav, ...[...sections.values()].map(item => item.panel));
    select(sections.get('start').panel, { resetScroll: false });
    restoreMenu();
    updateCurrentHeading();
    return { nav, select };
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
      const tabs = buildAboutTabs(scrollPane);
      const allHeadings = Array.from(aboutEl.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      aboutEl.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          const id = decodeURIComponent(a.getAttribute('href').slice(1));
          const target = allHeadings.find(h => h.id === id);
          if(!target || !scrollPane) return;
          const panel = target.closest('.about-tab-panel');
          if (panel) tabs.select(panel, { resetScroll: false });
          const paneRect = scrollPane.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const scale = paneRect.height / scrollPane.offsetHeight || 1;
          scrollPane.scrollTop += (targetRect.top - tabs.nav.getBoundingClientRect().bottom) / scale - 12;
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
