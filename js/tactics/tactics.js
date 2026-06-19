  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 선수 토큰 생성] 포메이션 좌표·라인업 데이터로 선수 토큰을 생성·배치
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // -- 포메이션 좌표 (x,y = 피치 내 퍼센트, GK→수비→미드→공격 순)
  // -- 출처: 공개된 포메이션 배치 수학적 비율을 독자적으로 구현
  const TACTICS_FM = {
    "4-4-2":   [{x:5,y:50},{x:14,y:10},{x:14,y:35},{x:14,y:65},{x:14,y:90},{x:27,y:10},{x:27,y:35},{x:27,y:65},{x:27,y:90},{x:40,y:35},{x:40,y:65}],
    "4-3-3":   [{x:5,y:50},{x:14,y:10},{x:14,y:35},{x:14,y:65},{x:14,y:90},{x:27,y:20},{x:27,y:50},{x:27,y:80},{x:40,y:20},{x:40,y:50},{x:40,y:80}],
    "4-2-3-1": [{x:5,y:50},{x:12,y:10},{x:12,y:35},{x:12,y:65},{x:12,y:90},{x:22,y:35},{x:22,y:65},{x:32,y:15},{x:32,y:50},{x:32,y:85},{x:42,y:50}],
    "4-5-1":   [{x:5,y:50},{x:14,y:10},{x:14,y:35},{x:14,y:65},{x:14,y:90},{x:25,y:10},{x:25,y:30},{x:25,y:50},{x:25,y:70},{x:25,y:90},{x:38,y:50}],
    "4-1-4-1": [{x:5,y:50},{x:12,y:10},{x:12,y:35},{x:12,y:65},{x:12,y:90},{x:22,y:50},{x:32,y:10},{x:32,y:35},{x:32,y:65},{x:32,y:90},{x:42,y:50}],
    "4-4-1-1": [{x:5,y:50},{x:12,y:10},{x:12,y:35},{x:12,y:65},{x:12,y:90},{x:22,y:10},{x:22,y:35},{x:22,y:65},{x:22,y:90},{x:32,y:50},{x:42,y:50}],
    "4-3-2-1": [{x:5,y:50},{x:12,y:10},{x:12,y:32},{x:12,y:68},{x:12,y:90},{x:24,y:22},{x:24,y:50},{x:24,y:78},{x:34,y:35},{x:34,y:65},{x:44,y:50}],
    "4-2-2-2": [{x:5,y:50},{x:12,y:10},{x:12,y:35},{x:12,y:65},{x:12,y:90},{x:22,y:35},{x:22,y:65},{x:32,y:35},{x:32,y:65},{x:42,y:35},{x:42,y:65}],
    "4-3-1-2": [{x:5,y:50},{x:14,y:10},{x:14,y:35},{x:14,y:65},{x:14,y:90},{x:26,y:25},{x:26,y:50},{x:26,y:75},{x:36,y:50},{x:44,y:25},{x:44,y:75}],
    "4-1-3-2": [{x:5,y:50},{x:12,y:10},{x:12,y:35},{x:12,y:65},{x:12,y:90},{x:22,y:50},{x:32,y:20},{x:32,y:50},{x:32,y:80},{x:42,y:35},{x:42,y:65}],

    "3-5-2":   [{x:5,y:50},{x:13,y:25},{x:13,y:50},{x:13,y:75},{x:21,y:10},{x:30,y:25},{x:30,y:50},{x:30,y:75},{x:21,y:90},{x:42,y:38},{x:42,y:62}],
    "3-1-4-2": [{x:5,y:50},{x:13,y:25},{x:13,y:50},{x:13,y:75},{x:23,y:50},{x:23,y:10},{x:30,y:35},{x:30,y:65},{x:23,y:90},{x:43,y:35},{x:43,y:65}],
    "3-5-1-1": [{x:5,y:50},{x:11.5,y:25},{x:11.5,y:50},{x:11.5,y:75},{x:18,y:10},{x:25,y:25},{x:25,y:50},{x:25,y:75},{x:18,y:90},{x:33,y:50},{x:43,y:50}],
    "3-4-3":   [{x:5,y:50},{x:13,y:25},{x:13,y:50},{x:13,y:75},{x:25,y:10},{x:25,y:35},{x:25,y:65},{x:25,y:90},{x:41,y:20},{x:41,y:50},{x:41,y:80}],
    "3-4-2-1": [{x:5,y:50},{x:13,y:25},{x:13,y:50},{x:13,y:75},{x:23,y:10},{x:23,y:35},{x:23,y:65},{x:23,y:90},{x:33,y:30},{x:33,y:70},{x:43,y:50}],
    "3-3-1-3": [{x:5,y:50},{x:12,y:25},{x:12,y:50},{x:12,y:75},{x:22,y:25},{x:22,y:50},{x:22,y:75},{x:30,y:50},{x:42,y:25},{x:42,y:50},{x:42,y:75}],
    "3-4-1-2": [{x:5,y:50},{x:13,y:25},{x:13,y:50},{x:13,y:75},{x:22,y:10},{x:22,y:35},{x:22,y:65},{x:22,y:90},{x:31,y:50},{x:42,y:35},{x:42,y:65}],

    "5-4-1":   [{x:5,y:50},{x:15,y:10},{x:15,y:30},{x:15,y:50},{x:15,y:70},{x:15,y:90},{x:27,y:10},{x:27,y:35},{x:27,y:65},{x:27,y:90},{x:41,y:50}],
    "5-3-2":   [{x:5,y:50},{x:17,y:10},{x:17,y:30},{x:17,y:50},{x:17,y:70},{x:17,y:90},{x:29,y:25},{x:29,y:50},{x:29,y:75},{x:41,y:35},{x:41,y:65}],
    "5-2-3":   [{x:5,y:50},{x:17,y:10},{x:17,y:30},{x:17,y:50},{x:17,y:70},{x:17,y:90},{x:29,y:35},{x:29,y:65},{x:41,y:12},{x:41,y:50},{x:41,y:88}],
  };

  // -- 포지션 레이블 (포메이션별)
  const TACTICS_LABELS = {
    "4-4-2":   ['GK','RB','CB','CB','LB','RM','CM','CM','LM','ST','ST'],
    "4-3-3":   ['GK','RB','CB','CB','LB','CM','CM','CM','RW','ST','LW'],
    "4-2-3-1": ['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'],
    "4-5-1":   ['GK','RB','CB','CB','LB','RM','CM','CM','CM','LM','ST'],
    "4-1-4-1": ['GK','RB','CB','CB','LB','DM','RM','CM','CM','LM','ST'],
    "4-4-1-1": ['GK','RB','CB','CB','LB','RM','CM','CM','LM','AM','ST'],
    "4-3-2-1": ['GK','RB','CB','CB','LB','CM','CM','CM','AM','AM','ST'],
    "4-2-2-2": ['GK','RB','CB','CB','LB','DM','DM','AM','AM','ST','ST'],
    "4-3-1-2": ['GK','RB','CB','CB','LB','CM','CM','CM','AM','ST','ST'],
    "4-1-3-2": ['GK','RB','CB','CB','LB','DM','RW','AM','LW','ST','ST'],

    "3-5-2":   ['GK','CB','CB','CB','RM','CM','CM','CM','LM','ST','ST'],
    "3-1-4-2": ['GK','CB','CB','CB','DM','RM','CM','CM','LM','ST','ST'],
    "3-5-1-1": ['GK','CB','CB','CB','RM','CM','CM','CM','LM','AM','ST'],
    "3-4-3":   ['GK','CB','CB','CB','RM','CM','CM','LM','RW','ST','LW'],
    "3-4-2-1": ['GK','CB','CB','CB','RM','CM','CM','LM','AM','AM','ST'],
    "3-3-1-3": ['GK','CB','CB','CB','CM','CM','CM','AM','RW','ST','LW'],
    "3-4-1-2": ['GK','CB','CB','CB','RM','CM','CM','LM','AM','ST','ST'],

    "5-4-1":   ['GK','RWB','CB','CB','CB','LWB','RM','CM','CM','LM','ST'],
    "5-3-2":   ['GK','RWB','CB','CB','CB','LWB','CM','CM','CM','ST','ST'],
    "5-2-3":   ['GK','RWB','CB','CB','CB','LWB','CM','CM','RW','ST','LW'],
  };

  // ---------------------------------------------------------------
  // TODO: 백엔드 연동 시 아래 MOCK_LINEUP을 실제 fetch로 교체
  //
  // 스프링부트 엔드포인트 예정:
  //   GET /api/lineups/{fixtureId}
  //
  // 응답 shape (이 구조에 맞춰 백엔드 구현):
  // {
  //   home: {
  //     teamName: "Liverpool",
  //     formation: "4-3-3",
  //     players: [
  //       { nameKo: "알리송", number: 1, pos: "GK", _isReal: true },
  //       ...  // _isReal: true 를 붙여야 포지션 레이블 대신 이름이 표시됨
  //     ]
  //   },
  //   away: { ... }
  // }
  // ---------------------------------------------------------------

  // -- Fallback mock 데이터 (백엔드 완성 전까지 표시되는 데이터)
  const TACTICS_MOCK_LINEUP = {
    home: {
      teamName: "홈팀",
      formation: "4-3-3",
      players: [
        { nameKo: "GK", number: 1,  pos: "GK" },
        { nameKo: "RB", number: 2,  pos: "RB" },
        { nameKo: "CB", number: 5,  pos: "CB" },
        { nameKo: "CB", number: 4,  pos: "CB" },
        { nameKo: "LB", number: 3,  pos: "LB" },
        { nameKo: "CM", number: 8,  pos: "CM" },
        { nameKo: "CM", number: 6,  pos: "CM" },
        { nameKo: "CM", number: 10, pos: "CM" },
        { nameKo: "RW", number: 7,  pos: "RW" },
        { nameKo: "ST", number: 9,  pos: "ST" },
        { nameKo: "LW", number: 11, pos: "LW" },
      ]
    },
    away: {
      teamName: "어웨이팀",
      formation: "4-3-3",
      players: [
        { nameKo: "GK", number: 1,  pos: "GK" },
        { nameKo: "RB", number: 2,  pos: "RB" },
        { nameKo: "CB", number: 5,  pos: "CB" },
        { nameKo: "CB", number: 4,  pos: "CB" },
        { nameKo: "LB", number: 3,  pos: "LB" },
        { nameKo: "CM", number: 8,  pos: "CM" },
        { nameKo: "CM", number: 6,  pos: "CM" },
        { nameKo: "CM", number: 10, pos: "CM" },
        { nameKo: "RW", number: 7,  pos: "RW" },
        { nameKo: "ST", number: 9,  pos: "ST" },
        { nameKo: "LW", number: 11, pos: "LW" },
      ]
    }
  };

  // -- 현재 전술판 상태 (var: render()보다 늦게 선언되므로 호이스팅 필요)
  var tacticsState = {
    homePositions: [],  // [{x, y}, ...]
    awayPositions: [],
    ballPosition: { x: 50, y: 50 },
    lineup: null,       // tacticsApplyLineup 후 저장
  };

  /** 홈팀 포메이션 좌표를 어웨이 진영으로 미러링 (x=100-x, y=100-y) */
  function tacticsMirror(coords) {
    return coords.map(({x, y}) => ({ x: 100 - x, y: 100 - y }));
  }

  function tacticsNormalizePosition(pos, fallback) {
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };
    }
    return { ...fallback };
  }

  function tacticsSyncPitchLayout() {
    const main = document.getElementById('tactics-main-area');
    const wrap = document.getElementById('tactics-pitch-wrap');
    const pitch = document.getElementById('tactics-pitch');
    if (!main || !wrap || !pitch) return;

    const styles = window.getComputedStyle(wrap);
    const padLeft = parseFloat(styles.paddingLeft) || 0;
    const padRight = parseFloat(styles.paddingRight) || 0;
    const padTop = parseFloat(styles.paddingTop) || 0;
    const padBottom = parseFloat(styles.paddingBottom) || 0;
    const availableHeight = Math.max(0, main.clientHeight - padTop - padBottom);
    const toolbar = document.getElementById('tactics-draw-toolbar');
    const toolbarWidth = toolbar ? Math.ceil(toolbar.getBoundingClientRect().width) : 0;
    const reservedPanelWidth = document.fullscreenElement ? 0 : 240;
    const maxPitchWidth = Math.max(0, main.clientWidth - toolbarWidth - reservedPanelWidth - padLeft - padRight);
    const pitchWidthByHeight = availableHeight * (105 / 68);
    const pitchWidth = maxPitchWidth > 0 ? Math.min(pitchWidthByHeight, maxPitchWidth) : pitchWidthByHeight;
    const pitchHeight = pitchWidth * (68 / 105);

    wrap.style.flex = '0 0 auto';
    wrap.style.width = `${Math.max(0, Math.round(pitchWidth + padLeft + padRight))}px`;
    pitch.style.width = `${Math.max(0, Math.round(pitchWidth))}px`;
    pitch.style.height = `${Math.max(0, Math.round(pitchHeight))}px`;
  }

  /**
   * 라인업 데이터(홈/어웨이 포메이션, 선수 목록)를 받아 전술판에 적용.
   * 백엔드 연동 시에도 이 함수만 호출하면 된다.
   */
  function tacticsApplyLineup(data, options = {}) {
    const preservePositions = !!options.preservePositions;
    const previousLineup = tacticsState.lineup;
    // 1. 포메이션 select UI 동기화
    const homeFm = data.home.formation || '4-3-3';
    const awayFm = data.away.formation || '4-3-3';

    const homeFmSel = document.getElementById('tactics-home-fm');
    const awayFmSel = document.getElementById('tactics-away-fm');
    if (homeFmSel && TACTICS_FM[homeFm]) homeFmSel.value = homeFm;
    if (awayFmSel && TACTICS_FM[awayFm]) awayFmSel.value = awayFm;

    // 2. 포메이션 좌표 계산 (어웨이는 미러링)
    const homeCoords = TACTICS_FM[homeFm] || TACTICS_FM['4-3-3'];
    const awayCoords = tacticsMirror(TACTICS_FM[awayFm] || TACTICS_FM['4-3-3']);
    const nextHomePositions = homeCoords.map(p => ({ ...p }));
    const nextAwayPositions = awayCoords.map(p => ({ ...p }));
    const shouldResetHomePositions = !preservePositions
      || !Array.isArray(tacticsState.homePositions)
      || tacticsState.homePositions.length !== nextHomePositions.length
      || String(previousLineup?.home?.formation || '') !== String(homeFm);
    const shouldResetAwayPositions = !preservePositions
      || !Array.isArray(tacticsState.awayPositions)
      || tacticsState.awayPositions.length !== nextAwayPositions.length
      || String(previousLineup?.away?.formation || '') !== String(awayFm);
    tacticsState.homePositions = shouldResetHomePositions
      ? nextHomePositions
      : nextHomePositions.map((fallback, index) => tacticsNormalizePosition(tacticsState.homePositions[index], fallback));
    tacticsState.awayPositions = shouldResetAwayPositions
      ? nextAwayPositions
      : nextAwayPositions.map((fallback, index) => tacticsNormalizePosition(tacticsState.awayPositions[index], fallback));
    tacticsState.lineup = data;

    // 3. 팀 레이블 — 점수판 팀명과 연동
    const homeLabel = document.getElementById('tactics-home-label');
    const awayLabel = document.getElementById('tactics-away-label');
    if (homeLabel) homeLabel.textContent = state.homeName || data.home.teamName || '홈팀';
    if (awayLabel) awayLabel.textContent = state.awayName || data.away.teamName || '어웨이팀';

    tacticsSyncPitchLayout();
    tacticsRenderTokens();
  }

  /**
   * tacticsState의 좌표를 기반으로 피치 위에 모든 선수 토큰과 공 토큰을 다시 렌더링.
   * 점수판 색상과 포메이션 레이블을 동기화하고 드래그 이벤트를 재등록한다.
   */
  function tacticsRenderTokens() {
    // 1. 기존 토큰 전체 제거
    const pitch = document.getElementById('tactics-pitch');
    if (!pitch) return;
    pitch.querySelectorAll('.tactics-token, .tactics-ball-token').forEach(t => t.remove());

    // 2. 이름 표시·공 표시 옵션 읽기
    const showNames = document.getElementById('tactics-show-names')?.checked ?? true;
    const showBall = document.getElementById('tactics-show-ball')?.checked ?? false;
    const lineup = tacticsState.lineup || TACTICS_MOCK_LINEUP;

    // 3. 현재 선택된 포메이션 기준으로 포지션 레이블 결정
    const homeFm  = document.getElementById('tactics-home-fm')?.value || lineup.home.formation || '4-3-3';
    const awayFm  = document.getElementById('tactics-away-fm')?.value || lineup.away.formation || '4-3-3';
    const homeLabels = TACTICS_LABELS[homeFm] || TACTICS_LABELS['4-3-3'];
    const awayLabels = TACTICS_LABELS[awayFm] || TACTICS_LABELS['4-3-3'];

    // 4. 팀 레이블을 점수판 state와 동기화
    const homeLabel = document.getElementById('tactics-home-label');
    const awayLabel = document.getElementById('tactics-away-label');
    if (homeLabel) homeLabel.textContent = (typeof state !== 'undefined' && state.homeName) || lineup.home.teamName || '홈팀';
    if (awayLabel) awayLabel.textContent = (typeof state !== 'undefined' && state.awayName) || lineup.away.teamName || '어웨이팀';

    // 5. 점수판 state.colors에서 팀 색상 동기화
    // greenscreen 모드 ON일 때 초록 계열 팀 컬러를 시안으로 자동 치환 (Iter 5-7).
    const cs = (typeof chromaSafe === 'function') ? chromaSafe : (v => v);
    const homeColor = {
      bg:     cs(state.colors.homeBg   || '#3B82F6'),
      border: cs(state.colors.homeBg   || '#3B82F6'),
      text:   cs(state.colors.homeText || '#ffffff'),
    };
    const awayColor = {
      bg:     cs(state.colors.awayBg   || '#EF4444'),
      border: cs(state.colors.awayBg   || '#EF4444'),
      text:   cs(state.colors.awayText || '#ffffff'),
    };

    // 6. 홈팀 토큰 생성 — 포지션 레이블은 현재 포메이션 기준으로 덮어씀
    tacticsState.homePositions.forEach((pos, i) => {
      const player = lineup.home.players[i];
      if (!player) return;
      // 실제 선수 이름이 있으면 그대로, 없으면(fallback) 포메이션 레이블
      const label = player._isReal ? player.nameKo : homeLabels[i] || player.pos;
      const tok = tacticsCreateToken(i, pos.x, 100 - pos.y, homeColor, {...player, nameKo: label}, showNames);
      tok.dataset.team = 'home';
      pitch.appendChild(tok);
    });

    // 7. 어웨이팀 토큰 생성 (idx는 11~21로 홈팀과 구분)
    tacticsState.awayPositions.forEach((pos, i) => {
      const player = lineup.away.players[i];
      if (!player) return;
      const label = player._isReal ? player.nameKo : awayLabels[i] || player.pos;
      const tok = tacticsCreateToken(i + 11, pos.x, 100 - pos.y, awayColor, {...player, nameKo: label}, showNames);
      tok.dataset.team = 'away';
      pitch.appendChild(tok);
    });

    // 8. 공 토큰 생성 (옵션이 켜진 경우만)
    if (showBall) {
      const ballPos = tacticsState.ballPosition || { x: 50, y: 50 };
      pitch.appendChild(tacticsCreateBallToken(ballPos.x, 100 - ballPos.y));
    }

    // 9. 드래그 이벤트 재등록 및 다각형 glow 복원
    tacticsDragSetup();
    // 다각형 glow 복원 (토큰 재생성 후)
    if (typeof tdApplyGlows === 'function') tdApplyGlows();
  }

  /**
   * 선수 토큰 div를 생성하여 반환.
   * 원형 번호 표시 div와 이름 배지 div로 구성되며, 이름 배지는 항상 DOM에 존재하고
   * visibility로만 토글해 wrap 높이를 일정하게 유지한다.
   */
  function tacticsCreateToken(idx, x, y, color, player, showNames) {
    const wrap = document.createElement('div');
    wrap.className = 'tactics-token';
    wrap.dataset.idx = idx;
    wrap.dataset.kind = 'player';
    wrap.style.cssText = `
      position:absolute; left:${x}%; top:${y}%;
      transform:translate(-50%,-50%);
      display:flex; flex-direction:column; align-items:center;
      user-select:none; cursor:grab; z-index:10;
      transition:left .15s ease, top .15s ease;
    `;

    const circle = document.createElement('div');
    circle.style.cssText = `
      width:calc(44px * var(--td-scale,1)); height:calc(44px * var(--td-scale,1)); border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:calc(14px * var(--td-scale,1)); color:${color.text};
      background:${color.bg}; border:2px solid ${color.border};
      box-shadow:0 2px 8px rgba(0,0,0,.45);
    `;
    circle.textContent = player.number ?? (idx < 11 ? idx + 1 : idx - 10);
    wrap.appendChild(circle);

    // 배지는 항상 DOM에 존재 — visibility로만 토글해서 wrap 높이를 일정하게 유지
    // (display:none 시 wrap 높이 변동 → translate(-50%,-50%) 중심 틀어짐 방지)
    const badge = document.createElement('div');
    badge.className = 'tactics-name-badge';
    badge.style.cssText = `
      margin-top:2px; padding:1px 6px; border-radius:4px;
      font-size:calc(10px * var(--td-scale,1)); font-weight:600; white-space:nowrap;
      background:rgba(0,0,0,.75); color:#fff;
      visibility:${showNames ? 'visible' : 'hidden'};
    `;
    badge.textContent = player.nameKo || player.pos || '';
    wrap.appendChild(badge);

    return wrap;
  }

  /** 공 토큰 div를 생성하여 반환 (⚽ 이모지, 드래그 가능) */
  function tacticsCreateBallToken(x, y) {
    const wrap = document.createElement('div');
    wrap.className = 'tactics-ball-token';
    wrap.dataset.kind = 'ball';
    wrap.style.cssText = `
      position:absolute; left:${x}%; top:${y}%;
      transform:translate(-50%,-50%);
      display:flex; align-items:center; justify-content:center;
      width:calc(34px * var(--td-scale,1)); height:calc(34px * var(--td-scale,1));
      font-size:calc(24px * var(--td-scale,1)); line-height:1;
      user-select:none; cursor:grab; z-index:15;
      filter: drop-shadow(0 2px 5px rgba(0,0,0,.4));
      transition:left .15s ease, top .15s ease;
    `;
    wrap.textContent = '⚽';
    wrap.title = '드래그해서 공 위치 이동';
    return wrap;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 선택 & 드래그] 토큰 다중 선택, glow 표시, Pointer Events 드래그 처리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 현재 선택된 .tactics-token 엘리먼트 집합
  let tdSelectedTokens = new Set();

  /** 선택된 토큰들에 팀 색상 기반 selection glow(box-shadow) 적용 */
  function tdSelectApplyGlow() {
    // 선택된 토큰에만 selection glow 적용 (나머지는 건드리지 않음)
    tdSelectedTokens.forEach(tok => {
      const circle = tok.querySelector('div');
      if (!circle) return;
      const bg = tok.dataset.team === 'home'
        ? (state.colors.homeBg || '#3B82F6')
        : (state.colors.awayBg || '#EF4444');
      circle.style.boxShadow =
        `0 0 0 2.5px rgba(255,255,255,0.9), 0 0 10px 4px ${bg}, 0 0 22px 8px ${bg}88`;
    });
  }

  /** 선택 집합을 초기화하고 모든 토큰의 glow를 다각형 연결 상태 기준으로 재계산 */
  function tdClearSelection() {
    tdSelectedTokens.clear();
    // polygon glow 포함 전체 glow 재계산
    if (typeof tdApplyGlows === 'function') tdApplyGlows();
  }

  // 드래그 관련 전역 변수
  let tacticsDragging = null;        // 현재 드래그 중인 토큰 엘리먼트
  let tacticsDragOffX = 0, tacticsDragOffY = 0; // 포인터와 토큰 위치 간 오프셋
  let tacticsPitchRect = null;       // 드래그 시작 시점의 피치 BoundingRect

  /** 모든 토큰에 pointerdown 이벤트를 (재)등록하여 드래그를 활성화 */
  function tacticsDragSetup() {
    document.querySelectorAll('.tactics-token, .tactics-ball-token').forEach(tok => {
      tok.removeEventListener('pointerdown', tacticsDragStart);
      tok.addEventListener('pointerdown', tacticsDragStart);
    });
  }

  // 그룹 이동 상태: 다중 선택된 토큰을 한 번에 이동할 때 사용
  let tdGroupDrag = null; // { tokens:[{tok,offX,offY,kind,idx,fromX,fromY}], pitchRect }

  /**
   * 토큰 드래그 시작 핸들러.
   * 다중 선택된 토큰 중 하나를 드래그하면 그룹 이동, 아니면 단일 이동 모드로 진입한다.
   */
  function tacticsDragStart(e) {
    // 1. 이벤트 기본 동작 차단 및 포인터 캡처 설정
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    tacticsDragging = e.currentTarget;
    tacticsPitchRect = document.getElementById('tactics-pitch').getBoundingClientRect();
    const cx = (e.clientX - tacticsPitchRect.left) / tacticsPitchRect.width * 100;
    const cy = (e.clientY - tacticsPitchRect.top)  / tacticsPitchRect.height * 100;

    // 2. 선택 그룹에 포함된 토큰을 드래그하면 그룹 이동 모드
    if (tdSelectedTokens.size > 1 && tdSelectedTokens.has(tacticsDragging)) {
      tdGroupDrag = {
        tokens: [...tdSelectedTokens].map(tok => ({
          tok,
          offX: cx - parseFloat(tok.style.left),
          offY: cy - parseFloat(tok.style.top),
          kind: tok.dataset.kind === 'ball' ? 'ball' : 'player',
          idx:  +tok.dataset.idx,
          fromX: parseFloat(tok.style.left),
          fromY: parseFloat(tok.style.top),
        })),
        pitchRect: tacticsPitchRect,
      };
      tdGroupDrag.tokens.forEach(t => {
        t.tok.style.transition = 'none';
        t.tok.style.zIndex = '50';
      });
    } else {
      // 3. 단일 토큰 드래그 — 선택 해제 후 오프셋 계산 및 undo 데이터 저장
      tdClearSelection();
      tacticsDragging.style.transition = 'none';
      tacticsDragging.style.zIndex = '50';
      tacticsDragOffX = cx - parseFloat(tacticsDragging.style.left);
      tacticsDragOffY = cy - parseFloat(tacticsDragging.style.top);
      tdDragHistoryData = {
        tok: tacticsDragging,
        kind: tacticsDragging.dataset.kind === 'ball' ? 'ball' : 'player',
        idx:  +tacticsDragging.dataset.idx,
        fromX: parseFloat(tacticsDragging.style.left),
        fromY: parseFloat(tacticsDragging.style.top),
      };
    }
    // 4. 전역 pointermove/pointerup 등록
    window.addEventListener('pointermove', tacticsDragMove);
    window.addEventListener('pointerup',   tacticsDragEnd);
  }

  /**
   * 드래그 중 이동하는 토큰에 연결된 다각형/라인 도형의 좌표를 실시간으로 재계산.
   * 도형을 제거하지 않고 points만 업데이트하여 깜빡임을 방지한다.
   */
  function tdUpdateShapesLive(movingIndices) {
    const moving = new Set(movingIndices);
    const formationLock = document.getElementById('tactics-formation-lock')?.checked;
    let changed = false;
    tdDrawings.forEach(d => {
      if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices) {
        if (d.playerIndices.some(i => moving.has(i))) {
          tdRecomputeShapePoints(d);
          changed = true;
        }
      }
      // 대형 유지 ON: 토큰 클릭으로 생성된 원도 실시간으로 따라옴
      if (formationLock && d.type === 'circle' && d.playerIdx !== undefined && moving.has(d.playerIdx)) {
        const tok = document.querySelector(`.tactics-token[data-idx="${d.playerIdx}"]`);
        if (tok) {
          d.cx = parseFloat(tok.style.left) + (d.cx_off || 0);
          d.cy = parseFloat(tok.style.top) + (d.cy_off || 0);
          changed = true;
        }
      }
    });
    if (changed) tdRenderAll();
  }

  /**
   * 드래그 이동 핸들러.
   * 그룹 이동 또는 단일 이동에 따라 토큰 위치를 업데이트하고
   * 연결된 도형도 실시간으로 갱신한다.
   */
  function tacticsDragMove(e) {
    if (!tacticsDragging) return;
    const cx = (e.clientX - tacticsPitchRect.left) / tacticsPitchRect.width  * 100;
    const cy = (e.clientY - tacticsPitchRect.top)  / tacticsPitchRect.height * 100;

    // 1. 그룹 이동 처리 (다중 선택된 토큰 전체 이동)
    if (tdGroupDrag) {
      tdGroupDrag.tokens.forEach(t => {
        const nx = Math.max(1, Math.min(99, cx - t.offX));
        const ny = Math.max(1, Math.min(99, cy - t.offY));
        t.tok.style.left = nx + '%';
        t.tok.style.top  = ny + '%';
        const stored = { x: nx, y: 100 - ny };
        if (t.kind === 'ball') tacticsState.ballPosition = stored;
        else if (t.idx < 11)   tacticsState.homePositions[t.idx] = stored;
        else                    tacticsState.awayPositions[t.idx - 11] = stored;
      });
      tdUpdateShapesLive(tdGroupDrag.tokens.filter(t => t.kind === 'player').map(t => t.idx));
      return;
    }

    // 2. 단일 토큰 이동 처리
    const nx = Math.max(1, Math.min(99, cx - tacticsDragOffX));
    const ny = Math.max(1, Math.min(99, cy - tacticsDragOffY));
    tacticsDragging.style.left = nx + '%';
    tacticsDragging.style.top  = ny + '%';
    const stored = { x: nx, y: 100 - ny };
    if (tacticsDragging.dataset.kind === 'ball') {
      tacticsState.ballPosition = stored;
      return;
    }
    const idx = +tacticsDragging.dataset.idx;
    if (idx < 11) tacticsState.homePositions[idx] = stored;
    else           tacticsState.awayPositions[idx - 11] = stored;
    tdUpdateShapesLive([idx]);
  }

  /**
   * 다각형/라인 도형의 playerIndices에 해당하는 토큰의 현재 위치로 points를 재계산.
   * polygon은 중심점 기준 각도 정렬(모든 선수 꼭짓점 포함), line-connect는 y축 정렬 순서로 재계산한다.
   */
  function tdRecomputeShapePoints(d) {
    const newPts = d.playerIndices.map(idx => {
      const tok = document.querySelector(`.tactics-token[data-idx="${idx}"]`);
      return tok ? { x: parseFloat(tok.style.left), y: parseFloat(tok.style.top) } : null;
    }).filter(Boolean);
    if (d.type === 'polygon') d.points = tdConvexHull(newPts);
    else d.points = newPts.slice().sort((a, b) => a.y - b.y);
  }

  /**
   * 드래그 종료 후, 이동된 토큰이 포함된 다각형/라인 도형을 처리.
   * - 대형 유지 ON이거나 구성원 전체가 이동한 경우: points 재계산
   * - 일부만 이동한 경우: 도형 제거
   */
  function tdRemovePolygonsForMovedTokens(movedIndices) {
    if (!movedIndices.length) return;
    const moved = new Set(movedIndices);
    const formationLock = document.getElementById('tactics-formation-lock')?.checked;
    let needsRender = false;
    for (let i = tdDrawings.length - 1; i >= 0; i--) {
      const d = tdDrawings[i];
      if ((d.type !== 'polygon' && d.type !== 'line-connect') || !d.playerIndices) continue;
      const allMoved = d.playerIndices.every(idx => moved.has(idx));
      const anyMoved = d.playerIndices.some(idx => moved.has(idx));
      if (allMoved || (anyMoved && formationLock)) {
        // 현재 토큰 위치로 points 재계산
        tdRecomputeShapePoints(d);
        needsRender = true;
      } else if (anyMoved) {
        tdDrawings.splice(i, 1);
        needsRender = true;
      }
    }
    if (needsRender) { tdRenderAll(); tdApplyGlows(); }
  }

  /**
   * 드래그 종료 핸들러.
   * 이동 거리가 있으면 undo 히스토리에 기록하고, 영향받은 도형을 재계산한다.
   */
  function tacticsDragEnd() {
    if (tacticsDragging) {
      const movedIndices = [];
      if (tdGroupDrag) {
        // 그룹 이동 undo 기록 — 한 번의 Ctrl+Z로 전체 복원되도록 group-move 단일 액션으로 묶음
        const groupMoves = [];
        tdGroupDrag.tokens.forEach(t => {
          t.tok.style.transition = 'left .15s ease, top .15s ease';
          t.tok.style.zIndex = '10';
          const toX = parseFloat(t.tok.style.left);
          const toY = parseFloat(t.tok.style.top);
          if (Math.abs(toX - t.fromX) > 0.1 || Math.abs(toY - t.fromY) > 0.1) {
            groupMoves.push({ kind: t.kind, idx: t.idx, fromX: t.fromX, fromY: t.fromY, toX, toY });
            if (t.kind === 'player') movedIndices.push(t.idx);
          }
        });
        if (groupMoves.length > 0) tdHistoryPush({ type: 'group-move', moves: groupMoves });
        tdGroupDrag = null;
      } else {
        tacticsDragging.style.transition = 'left .15s ease, top .15s ease';
        tacticsDragging.style.zIndex = '10';
        if (tdDragHistoryData) {
          const toX = parseFloat(tacticsDragging.style.left);
          const toY = parseFloat(tacticsDragging.style.top);
          if (Math.abs(toX - tdDragHistoryData.fromX) > 0.1 || Math.abs(toY - tdDragHistoryData.fromY) > 0.1) {
            tdHistoryPush({ type: 'move', kind: tdDragHistoryData.kind, idx: tdDragHistoryData.idx,
              fromX: tdDragHistoryData.fromX, fromY: tdDragHistoryData.fromY, toX, toY });
            if (tdDragHistoryData.kind === 'player') movedIndices.push(tdDragHistoryData.idx);
          }
          tdDragHistoryData = null;
        }
      }
      tdRemovePolygonsForMovedTokens(movedIndices);
      tacticsDragging = null;
    }
    window.removeEventListener('pointermove', tacticsDragMove);
    window.removeEventListener('pointerup',   tacticsDragEnd);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 포메이션] 포메이션 선택 변경 처리, 전술판 초기화
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 홈/어웨이 포메이션 select 변경 시 호출 — lineup 포메이션을 업데이트하고 전술판 재렌더 */
  function tacticsApplyFm() {
    const homeFm = document.getElementById('tactics-home-fm')?.value || '4-3-3';
    const awayFm = document.getElementById('tactics-away-fm')?.value || '4-3-3';
    const lineup = tacticsState.lineup || TACTICS_MOCK_LINEUP;
    lineup.home.formation = homeFm;
    lineup.away.formation = awayFm;
    tacticsApplyLineup(lineup);
  }

  /** 전술판 전체화면 토글 — requestFullscreen API 사용 */
  function tacticsToggleFullscreen() {
    const page = document.getElementById('page-tactics');
    if (!document.fullscreenElement) {
      page.requestFullscreen().catch(err => console.warn('전체화면 진입 실패:', err));
    } else {
      document.exitFullscreen();
    }
  }

  function syncTacticsFullscreenButtonLabel() {
    const btn = document.getElementById('btn-tactics-fullscreen');
    if (!btn) return;
    btn.textContent = document.fullscreenElement ? '✕ 전체화면 종료' : '⤢ 전체화면 (\\)';
  }

  // [이벤트 등록] 전체화면 상태 변경 시 버튼 텍스트 동기화
  document.addEventListener('fullscreenchange', () => {
    syncTacticsFullscreenButtonLabel();
    tacticsSyncPitchLayout();
  });
  document.addEventListener('DOMContentLoaded', () => {
    syncTacticsFullscreenButtonLabel();
    tacticsSyncPitchLayout();
  });
  window.addEventListener('resize', tacticsSyncPitchLayout);

  /** 전술판 전체 초기화 — 공 위치 중앙으로 리셋, undo/redo 스택 초기화, 드로잉 초기화, 라인업 재렌더 */
  function tacticsReset() {
    tacticsState.ballPosition = { x: 50, y: 50 };
    tdHistory = [];
    tdFuture = [];
    tdDrawings = []; // 캔버스 드로잉도 함께 초기화
    tdRenderAll();
    tacticsApplyLineup(tacticsState.lineup || TACTICS_MOCK_LINEUP);
  }

  // [이벤트 등록] 이름 표시/공 표시 체크박스 토글
  document.getElementById('tactics-show-names')?.addEventListener('change', e => {
    const v = e.target.checked ? 'visible' : 'hidden';
    document.querySelectorAll('.tactics-name-badge').forEach(b => b.style.visibility = v);
  });
  document.getElementById('tactics-show-ball')?.addEventListener('change', tacticsRenderTokens);

  /**
   * 페이지 로드 직후 전술판 초기화 — mock 라인업 적용, select 도구 활성화,
   * 드래그 레이어 비활성화. DOMContentLoaded 또는 즉시 호출.
   */
  function tacticsInitDefaultSelect() {
    tacticsApplyLineup(TACTICS_MOCK_LINEUP);
    tacticsDrawSetTool('select');
    const layer = document.getElementById('tactics-draw-layer');
    if (layer) layer.style.pointerEvents = 'none';
    tacticsDragSetup();
  }

  // tacticsInitDefaultSelect 호출은 tdTool/tdDrawings 등 드로잉 변수 선언 이후로 이동
  // (아래 파일 하단의 "END 전술판 드로잉 도구" 블록 이후에서 실제 호출)

  // [이벤트 등록] 피치 크기 변화 시 --td-scale 갱신 → 토큰/배지/공/지우개 크기 자동 비례
  {
    let tdPitchBaseWidth = 0;
    const tdPitchObserver = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (!tdPitchBaseWidth && w > 0) tdPitchBaseWidth = w;
      const scale = tdPitchBaseWidth > 0 ? w / tdPitchBaseWidth : 1;
      entries[0].target.style.setProperty('--td-scale', scale);
    });
    const pitchEl = document.getElementById('tactics-pitch');
    if (pitchEl) tdPitchObserver.observe(pitchEl);
  }
  {
    const mainObserver = new ResizeObserver(() => {
      tacticsSyncPitchLayout();
    });
    const mainEl = document.getElementById('tactics-main-area');
    if (mainEl) mainObserver.observe(mainEl);
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 레이저 포인터] 굿노트 방식의 레이저 포인터 — 드래그 시 획 생성, 손을 떼면 서서히 소멸
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 레이저 포인터 도구 관련 전역 변수
  let tdTool = 'select';       // select | arrow | line | dashed | box | eraser | ...
  let tdColor = '#ffffff';
  let tdDrawings = [];         // {type, x1,y1,x2,y2, color}
  let tdDrawing = false;
  let tdStart = null;
  let tdPreview = null;
  let tdPencilPoints = [];
  let tdHistory = [];          // undo 스택: {type:'draw'|'erase'|'move'|'flip', ...}
  let tdFuture = [];           // redo 스택 (Ctrl+Y)
  let tdDragHistoryData = null; // 드래그 시작 시 저장

  // ── 레이저 포인터 ──
  // ── 레이저 포인터 (굿노트 방식) ──
  // 클릭+드래그 시 획이 생기고, 뗀 뒤 일정 시간 후 획 단위로 사라짐
  let tdLaserStrokes  = [];    // [{points:[{x,y}], alpha, fadeStart}]
  let tdLaserCurStroke = null; // 현재 그리는 획 (포인터 누른 동안)
  let tdLaserMouseX = 50;
  let tdLaserMouseY = 50;
  let tdLaserLastUp = 0;
  let tdLaserFading = false;
  let tdLaserRAF = null;
  let tdLaserRunning = false;
  const TD_TOKEN_RADIUS_PX         = 22;   // 선수 바둑알 기본 반지름 fallback (px) — 실제 렌더 크기 계산 실패 시 사용
  const TD_CIRCLE_TOKEN_RADIUS_MULT = 1.5; // 바둑알 클릭 시 자동 원 반지름 = 바둑알 반지름 × 이 배율
  const TD_PENCIL_POINT_STEP = 0.45;
  const TD_LASER_IDLE_MS = 750;  // 뗀 뒤 대기 시간
  const TD_LASER_FADE_MS = 300;  // 획 하나가 사라지는 시간
  const TD_LASER_GAP_MS  = 100;  // 획 간 딜레이

  // ── 레이저 색상 설정 ── 색상을 바꾸려면 아래 상수들을 수정하세요 ──
  const TD_LASER_COLOR_CORE   = 'rgba(255,210,200,1)';   // 획 중심 코어 (밝은 흰빛) — 레이저 특유의 빛나는 중심선
  const TD_LASER_COLOR_MID    = 'rgba(255,8,6,0.98)';  // 획 메인 색 (진한 빨강) — 실제로 눈에 보이는 주요 획 색
  // ※ OUTER는 stroke가 거의 안 보이고 shadowBlur만 퍼져야 함. 불투명하게 하면 어두운 테두리가 생김
  const TD_LASER_COLOR_OUTER  = 'rgba(255,80,80,0.12)';  // 외77곽 ambient glow용 — stroke 자체는 거의 안 보임
  const TD_LASER_SHADOW_MID   = '#cc0000';               // MID 레이어 shadowColor — 이 색으로 글로우가 번짐
  const TD_LASER_SHADOW_OUTER = '#ff3030';               // OUTER 레이어 shadowColor — 밝은 빨강이어야 글로우처럼 보임
  const TD_LASER_CURSOR_GLOW  = 'rgba(255,0,0,0.55)';   // 커서 외곽 확산 그래디언트 시작색
  const TD_LASER_CURSOR_RING  = 'rgba(255,0,0,0.95)'; // 커서 링 색

  /** 레이저 포인터 모드 시작 — 스트로크 초기화 및 RAF 루프 시작 */
  function tdLaserStart() {
    tdLaserRunning = true;
    tdLaserStrokes = [];
    tdLaserCurStroke = null;
    tdLaserFading = false;
    const canvas = document.getElementById('td-laser-canvas');
    if (canvas) canvas.style.display = 'block';
    if (!tdLaserRAF) tdLaserRAF = requestAnimationFrame(tdLaserDraw);
  }

  /** 레이저 포인터 모드 종료 — 남은 획은 RAF가 fade 처리 후 자동 정지 */
  function tdLaserStop() {
    tdLaserRunning = false;
    tdLaserCurStroke = null;
    // 획이 남아있으면 RAF가 사라질 때까지 계속 돌다 스스로 종료
  }

  /** 레이저 포인터 눌림 — 새 획(stroke)을 시작하고 현재 획 객체를 초기화 */
  function tdLaserPointerDown(e) {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    // 새 획 시작. 이미 fade 중이었으면 리셋 (다시 쓰기 시작)
    tdLaserFading = false;
    tdLaserStrokes.forEach(s => { s.fadeStart = null; s.alpha = 1; });
    tdLaserCurStroke = { points: [], alpha: 1, fadeStart: null };
    tdLaserStrokes.push(tdLaserCurStroke);
    const pt = tdGetPt(e);
    tdLaserMouseX = pt.x; tdLaserMouseY = pt.y;
    const pts = tdLaserCurStroke.points;
    pts.push({ x: pt.x, y: pt.y });
  }

  /** 레이저 포인터 이동 — hover 시 커서 점 위치 업데이트, 드래그 중이면 획에 점 추가 */
  function tdLaserPointerMove(e) {
    const pt = tdGetPt(e);
    tdLaserMouseX = pt.x; tdLaserMouseY = pt.y;
    if (!tdLaserCurStroke) return; // hover만이면 점만 이동
    const pts = tdLaserCurStroke.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.3) return;
    pts.push({ x: pt.x, y: pt.y });
  }

  /** 레이저 포인터 뗌 — 현재 획을 null로 초기화하고 idle 타이머를 시작 */
  function tdLaserPointerUp() {
    tdLaserCurStroke = null;
    tdLaserLastUp = performance.now();
  }

  /**
   * 레이저 포인터 RAF 드로우 루프.
   * canvas를 매 프레임 지우고 스트로크를 alpha 값 기반으로 페이드 아웃하며 그린다.
   * 커서 점은 레이저 모드 활성 중 항상 표시하고, 모든 획이 사라지면 RAF를 정지한다.
   */
  function tdLaserDraw() {
    // 1. canvas 요소 확인 및 피치 크기와 일치하도록 해상도 설정
    const canvas = document.getElementById('td-laser-canvas');
    if (!canvas) { tdLaserRAF = null; return; }

    const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
    const W = Math.round(pitch.width), H = Math.round(pitch.height);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

    const ctx = canvas.getContext('2d');
    const now = performance.now();
    // 2. 매 프레임 canvas 초기화
    ctx.clearRect(0, 0, W, H);

    // 3. 손을 뗀 뒤 idle 대기 시간이 지나면 획별로 fade 스케줄 등록
    const stoppedIdle = !tdLaserCurStroke
      && tdLaserStrokes.length > 0
      && (now - tdLaserLastUp) > TD_LASER_IDLE_MS;
    if (stoppedIdle && !tdLaserFading) {
      tdLaserFading = true;
      tdLaserStrokes.forEach((s, i) => {
        s.fadeStart = now + i * TD_LASER_GAP_MS;
      });
    }

    // 4. 각 획의 alpha 업데이트 — 현재 그리는 획은 항상 불투명(1)
    for (const s of tdLaserStrokes) {
      if (s === tdLaserCurStroke) { s.alpha = 1; continue; }
      if (s.fadeStart !== null) {
        const elapsed = now - s.fadeStart;
        s.alpha = elapsed < 0 ? 1 : Math.max(0, 1 - elapsed / TD_LASER_FADE_MS);
      }
    }
    // 5. 완전히 사라진 획 제거 (현재 그리는 획은 보존)
    tdLaserStrokes = tdLaserStrokes.filter(s => s === tdLaserCurStroke || s.alpha > 0);

    // 6. 남은 획 그리기 — 2겹 레이어로 레이저 글로우 효과
    // 6a. 중간점 quadratic curve 보간으로 부드러운 획 경로를 생성하는 헬퍼
    const buildPath = (pts) => {
      ctx.moveTo(pts[0].x / 100 * W, pts[0].y / 100 * H);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2 / 100 * W;
        const my = (pts[i].y + pts[i + 1].y) / 2 / 100 * H;
        ctx.quadraticCurveTo(pts[i].x / 100 * W, pts[i].y / 100 * H, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x / 100 * W, last.y / 100 * H);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of tdLaserStrokes) {
      if (s.points.length < 2) continue;
      const pts = s.points;

      // 6b. 레이어 1 — 외곽 ambient glow
      //     strokeStyle(TD_LASER_COLOR_OUTER)이 거의 투명 → stroke 자체는 보이지 않음
      //     shadowBlur만 주변으로 넓게 퍼져서 부드러운 후광을 만듦 (불투명하게 하면 어두운 테두리 생김)
      ctx.globalAlpha = s.alpha * 0.55;
      ctx.lineWidth = 22;
      ctx.shadowColor = TD_LASER_SHADOW_OUTER;
      ctx.shadowBlur = 30;
      ctx.strokeStyle = TD_LASER_COLOR_OUTER;
      ctx.beginPath(); buildPath(pts); ctx.stroke();

      // 6c. 레이어 2 — 메인 빨간 획 (TD_LASER_COLOR_MID) — 굵게 해서 네온 튜브 느낌
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = 7;
      ctx.shadowColor = TD_LASER_SHADOW_MID;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = TD_LASER_COLOR_MID;
      ctx.beginPath(); buildPath(pts); ctx.stroke();

      // 6d. 레이어 3 — 밝은 흰빛 코어 (TD_LASER_COLOR_CORE) — 굵게 해서 뚜렷하게
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = TD_LASER_COLOR_CORE;
      ctx.beginPath(); buildPath(pts); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // 7. 커서 점 — 레이저 모드 활성화 중 항상 표시 (확산 글로우 + 빨간 링 + 흰 코어)
    if (tdLaserRunning) {
      const cx = tdLaserMouseX / 100 * W, cy = tdLaserMouseY / 100 * H;
      // 커서 외곽 확산 (TD_LASER_CURSOR_GLOW)
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
      grd.addColorStop(0, TD_LASER_CURSOR_GLOW);
      grd.addColorStop(1, 'rgba(180,0,0,0)');
      ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
      // 커서 링 (TD_LASER_CURSOR_RING)
      ctx.shadowColor = TD_LASER_SHADOW_MID; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = TD_LASER_CURSOR_RING; ctx.fill();
      // 커서 흰 코어
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 8. 모드 종료 + 모든 획이 사라지면 RAF 정지 및 canvas 숨기기
    if (!tdLaserRunning && tdLaserStrokes.length === 0) {
      canvas.style.display = 'none';
      tdLaserRAF = null;
      return;
    }
    tdLaserRAF = requestAnimationFrame(tdLaserDraw);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 도구 선택 & 색상] 현재 드로잉 도구와 색상을 설정하고 UI 버튼 상태를 갱신
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 현재 드로잉 도구를 설정하고 관련 UI(버튼 활성화, 드래그 레이어 pointerEvents,
   * 지우개 커서, 레이저 시작/정지, 선택 해제)를 일괄 갱신.
   */
  function tacticsDrawSetTool(t) {
    tdTool = t;
    ['select','pencil','arrow','dashed-arrow','line','dashed','box','circle','polygon','line-connect','curve-arrow','curve-dashed-arrow','eraser','laser'].forEach(n => {
      const b = document.getElementById('td-tool-' + n);
      if (b) b.style.background = n === t ? '#1e40af' : '#1e293b';
    });
    const layer = document.getElementById('tactics-draw-layer');
    if (layer) layer.style.pointerEvents = (t === 'select') ? 'none' : 'all';
    // 지우개 커서 표시 여부
    const ec = document.getElementById('td-eraser-cursor');
    if (ec) ec.style.display = t === 'eraser' ? 'block' : 'none';
    // 지우개/레이저일 때 피치 커서 숨기기
    const pitch = document.getElementById('tactics-pitch');
    if (pitch) pitch.style.cursor = (t === 'eraser' || t === 'laser') ? 'none' : '';
    // 레이저
    if (t === 'laser') tdLaserStart();
    else               tdLaserStop();
    if (t !== 'pencil') tdPencilPoints = [];
    // 선택 모드가 아니면 선택 해제
    if (t !== 'select') tdClearSelection();
  }

  /** 현재 드로잉 색상을 설정하고 색상 버튼의 선택 상태(체크 표시, 테두리)를 갱신 */
  function tacticsDrawSetColor(c) {
    tdColor = c;
    document.querySelectorAll('[data-clr]').forEach(btn => {
      btn.textContent = '';
      btn.style.border = '2px solid transparent';
      btn.style.boxShadow = btn.dataset.clr === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,0.2)'
                          : btn.dataset.clr === '#facc15' ? 'inset 0 0 0 1px rgba(0,0,0,0.15)'
                          : btn.dataset.clr === '#1e293b' ? 'inset 0 0 0 1px rgba(255,255,255,0.15)'
                          : '';
    });
    const sel = document.querySelector(`[data-clr="${c}"]`);
    if (sel) {
      sel.textContent = '✓';
      sel.style.color = '#fff';
      sel.style.textShadow = '0 0 3px rgba(0,0,0,0.9),0 0 3px rgba(0,0,0,0.9)';
      sel.style.border = '2px solid rgba(255,255,255,0.95)';
      sel.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.65)';
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 그리기 유틸] 좌표 변환, 볼록 껍질, 색상 헬퍼, 마커, 곡선 제어점 등
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 포인터 이벤트 좌표를 피치 기준 viewBox 퍼센트(0~100)로 변환 */
  function tdGetPt(e, layer) {
    const r = document.getElementById('tactics-pitch').getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)),
      y: Math.max(0, Math.min(100, (e.clientY - r.top)  / r.height * 100)),
    };
  }

  /** 현재 화면에 렌더된 선수 바둑알의 실제 중심/반지름(px)을 반환 */
  function tdGetTokenCircleMetrics(tok, pitchRect) {
    const circDiv = tok?.querySelector('div');
    if (!circDiv) return null;
    const cr = circDiv.getBoundingClientRect();
    return {
      radiusPx: Math.max(cr.width, cr.height) / 2 || TD_TOKEN_RADIUS_PX,
      centerXPx: cr.left + cr.width / 2 - pitchRect.left,
      centerYPx: cr.top + cr.height / 2 - pitchRect.top,
    };
  }

  /**
   * 연필(자유선) 도형의 점 배열에 새 점 추가.
   * 직전 점과의 거리가 minDistance 미만이면 skip — 점 수 폭증 방지(Bezier 매끄럽게 유지).
   */
  function tdAppendPencilPoint(pt, minDistance = TD_PENCIL_POINT_STEP) {
    if (!pt) return;
    const last = tdPencilPoints[tdPencilPoints.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= minDistance) {
      tdPencilPoints.push({ x: pt.x, y: pt.y });
    }
  }

  /**
   * 점 배열이 시각적으로 그릴 만한 stroke인지 — 점 사이 0.5%px 이상 이동이 한 번이라도 있어야 true.
   * 한 점만 찍힌 잘못된 스트로크를 commit 안 하기 위한 가드.
   */
  function tdHasVisiblePencilStroke(points) {
    if (!points || points.length < 2) return false;
    for (let i = 1; i < points.length; i++) {
      if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) >= 0.5) return true;
    }
    return false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - Undo/Redo] 드로잉·이동 액션의 히스토리 관리 (최대 200개)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 새 액션을 undo 스택에 추가. redo 스택은 초기화되고 스택 크기는 200개로 제한 */
  function tdHistoryPush(action) {
    tdHistory.push(action);
    tdFuture = []; // 새 액션이 생기면 redo 스택 초기화
    if (tdHistory.length > 200) tdHistory.shift();
  }

  /** 토큰의 DOM 위치와 tacticsState 좌표를 toX/toY로 업데이트 (undo/redo 공통 사용) */
  function tdApplyMove(tok, action, toX, toY) {
    tok.style.left = toX + '%';
    tok.style.top  = toY + '%';
    const stored = { x: toX, y: 100 - toY };
    if (action.kind === 'ball') tacticsState.ballPosition = stored;
    else if (action.idx < 11)  tacticsState.homePositions[action.idx] = stored;
    else                        tacticsState.awayPositions[action.idx - 11] = stored;
  }

  /**
   * 마지막 액션을 되돌리는 Undo 함수.
   * draw: 도형 제거, erase: 도형 복원, move: 이전 위치로 토큰 이동,
   * group-move: 그룹 전체 이전 위치로 복원, flip: 곡선 컨트롤 포인트 복원.
   * 처리 후 전술판 전체 재렌더.
   */
  function tdUndo() {
    if (tdHistory.length === 0) return;
    // 1. undo 스택에서 마지막 액션을 꺼내 redo 스택에 저장
    const action = tdHistory.pop();
    tdFuture.push(action);
    // 2. 액션 타입별 역방향 처리
    if (action.type === 'draw') {
      for (let i = tdDrawings.length - 1; i >= 0; i--) {
        if (tdDrawings[i] === action.drawing) { tdDrawings.splice(i, 1); break; }
      }
    } else if (action.type === 'erase') {
      tdDrawings.splice(action.index, 0, action.drawing);
    } else if (action.type === 'move') {
      const tok = document.querySelector(
        action.kind === 'ball' ? '.tactics-ball-token' : `.tactics-token[data-idx="${action.idx}"]`
      );
      if (tok) tdApplyMove(tok, action, action.fromX, action.fromY);
      if (action.kind === 'player') {
        tdDrawings.forEach(d => {
          if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices?.includes(action.idx))
            tdRecomputeShapePoints(d);
          if (d.type === 'circle' && d.playerIdx === action.idx) {
            const tok = document.querySelector(`.tactics-token[data-idx="${action.idx}"]`);
            if (tok) {
              d.cx = parseFloat(tok.style.left) + (d.cx_off || 0);
              d.cy = parseFloat(tok.style.top) + (d.cy_off || 0);
            }
          }
        });
      }
    } else if (action.type === 'group-move') {
      action.moves.forEach(m => {
        const tok = document.querySelector(
          m.kind === 'ball' ? '.tactics-ball-token' : `.tactics-token[data-idx="${m.idx}"]`
        );
        if (tok) tdApplyMove(tok, m, m.fromX, m.fromY);
        if (m.kind === 'player') {
          tdDrawings.forEach(d => {
            if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices?.includes(m.idx))
              tdRecomputeShapePoints(d);
            if (d.type === 'circle' && d.playerIdx === m.idx) {
              const t2 = document.querySelector(`.tactics-token[data-idx="${m.idx}"]`);
              if (t2) { d.cx = parseFloat(t2.style.left) + (d.cx_off || 0); d.cy = parseFloat(t2.style.top) + (d.cy_off || 0); }
            }
          });
        }
      });
    } else if (action.type === 'flip') {
      const d = tdDrawings[action.index];
      if (d) { d.cx = action.prevCx; d.cy = action.prevCy; }
    }
    tdRenderAll();
  }

  /**
   * 되돌려진 액션을 다시 적용하는 Redo 함수.
   * draw: 도형 복원, erase: 도형 제거, move/group-move: toX/toY로 이동,
   * flip: 곡선 컨트롤 포인트를 중점 기준으로 다시 반전.
   */
  function tdRedo() {
    if (tdFuture.length === 0) return;
    // 1. redo 스택에서 액션을 꺼내 undo 스택에 저장 (future 초기화 없이 직접 push)
    const action = tdFuture.pop();
    tdHistory.push(action);
    // 2. 액션 타입별 재적용
    if (action.type === 'draw') {
      tdDrawings.push(action.drawing);
    } else if (action.type === 'erase') {
      tdDrawings.splice(action.index, 1);
    } else if (action.type === 'move') {
      const tok = document.querySelector(
        action.kind === 'ball' ? '.tactics-ball-token' : `.tactics-token[data-idx="${action.idx}"]`
      );
      if (tok) tdApplyMove(tok, action, action.toX, action.toY);
      if (action.kind === 'player') {
        tdDrawings.forEach(d => {
          if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices?.includes(action.idx))
            tdRecomputeShapePoints(d);
          if (d.type === 'circle' && d.playerIdx === action.idx) {
            const tok = document.querySelector(`.tactics-token[data-idx="${action.idx}"]`);
            if (tok) {
              d.cx = parseFloat(tok.style.left) + (d.cx_off || 0);
              d.cy = parseFloat(tok.style.top) + (d.cy_off || 0);
            }
          }
        });
      }
    } else if (action.type === 'group-move') {
      action.moves.forEach(m => {
        const tok = document.querySelector(
          m.kind === 'ball' ? '.tactics-ball-token' : `.tactics-token[data-idx="${m.idx}"]`
        );
        if (tok) tdApplyMove(tok, m, m.toX, m.toY);
        if (m.kind === 'player') {
          tdDrawings.forEach(d => {
            if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices?.includes(m.idx))
              tdRecomputeShapePoints(d);
            if (d.type === 'circle' && d.playerIdx === m.idx) {
              const t2 = document.querySelector(`.tactics-token[data-idx="${m.idx}"]`);
              if (t2) { d.cx = parseFloat(t2.style.left) + (d.cx_off || 0); d.cy = parseFloat(t2.style.top) + (d.cy_off || 0); }
            }
          });
        }
      });
    } else if (action.type === 'flip') {
      const d = tdDrawings[action.index];
      if (d) {
        const mx = (d.x1+d.x2)/2, my = (d.y1+d.y2)/2;
        d.cx = 2*mx - action.prevCx;
        d.cy = 2*my - action.prevCy;
      }
    }
    tdRenderAll();
  }

  /**
   * 클릭 위치(viewBox %)에서 가장 위에 그려진 도형의 인덱스를 반환.
   * 없으면 -1 반환. 각 도형 타입별로 최근접 거리를 픽셀 단위로 계산한다.
   *
   * 도형별 hit-test:
   *   curve-arrow / curve-dashed-arrow : Bezier 곡선 위 샘플 t=0..1을 0.04 step으로 훑어 거리 비교.
   *   line / dashed / arrow / dashed-arrow : 점-선분 최근접 거리.
   *   box : 4개 변 각각에 대해 거리 비교 (내부는 hit 아님).
   *   circle : 타원 경계까지의 근사 거리.
   *   polygon / line-connect / pencil : 모든 변(edge)을 점-선분 거리로 비교.
   * THRESH(14px) 이내면 hit으로 간주.
   */
  function tdHitTestAny(px, py) {
    const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
    const W = pitch.width, H = pitch.height;
    const spx = px/100*W, spy = py/100*H;
    const THRESH = 14;
    for (let i = tdDrawings.length - 1; i >= 0; i--) {
      const d = tdDrawings[i];
      const sx1 = d.x1/100*W, sy1 = d.y1/100*H;
      if (d.type === 'curve-arrow' || d.type === 'curve-dashed-arrow') {
        const cx = (d.cx ?? (d.x1+d.x2)/2), cy = (d.cy ?? (d.y1+d.y2)/2);
        const sx2 = d.x2/100*W, sy2 = d.y2/100*H;
        const scx = cx/100*W, scy = cy/100*H;
        for (let t = 0; t <= 1; t += 0.04) {
          const u = 1-t;
          const bx = u*u*sx1 + 2*u*t*scx + t*t*sx2;
          const by = u*u*sy1 + 2*u*t*scy + t*t*sy2;
          if (Math.hypot(bx - spx, by - spy) < THRESH) return i;
        }
      } else if (d.type === 'line' || d.type === 'dashed' || d.type === 'arrow' || d.type === 'dashed-arrow') {
        const sx2 = d.x2/100*W, sy2 = d.y2/100*H;
        // 선분 위 최근접 거리
        const ldx = sx2-sx1, ldy = sy2-sy1;
        const llen2 = ldx*ldx + ldy*ldy;
        if (llen2 < 1) { if (Math.hypot(spx-sx1, spy-sy1) < THRESH) return i; continue; }
        const t = Math.max(0, Math.min(1, ((spx-sx1)*ldx + (spy-sy1)*ldy) / llen2));
        const nx = sx1 + t*ldx, ny = sy1 + t*ldy;
        if (Math.hypot(spx-nx, spy-ny) < THRESH) return i;
      } else if (d.type === 'box') {
        const sx2 = d.x2/100*W, sy2 = d.y2/100*H;
        const rx1 = Math.min(sx1,sx2), ry1 = Math.min(sy1,sy2);
        const rx2 = Math.max(sx1,sx2), ry2 = Math.max(sy1,sy2);
        // 외곽선에서 THRESH 이내
        const inX = spx >= rx1-THRESH && spx <= rx2+THRESH;
        const inY = spy >= ry1-THRESH && spy <= ry2+THRESH;
        const nearL = Math.abs(spx-rx1) < THRESH && inY;
        const nearR = Math.abs(spx-rx2) < THRESH && inY;
        const nearT = Math.abs(spy-ry1) < THRESH && inX;
        const nearB = Math.abs(spy-ry2) < THRESH && inX;
        if (nearL || nearR || nearT || nearB) return i;
      } else if (d.type === 'circle') {
        const rcx = d.cx/100*W, rcy = d.cy/100*H;
        const ra = d.rx/100*W, rb = d.ry/100*H;
        if (ra < 1 || rb < 1) continue;
        // 타원 경계까지 거리 근사
        const ex = (spx-rcx)/ra, ey = (spy-rcy)/rb;
        const dist = Math.abs(Math.sqrt(ex*ex+ey*ey) - 1) * Math.min(ra,rb);
        if (dist < THRESH) return i;
      } else if ((d.type === 'polygon' || d.type === 'line-connect' || d.type === 'pencil') && d.points) {
        // 변(edge)에서 THRESH 이내 (polygon은 닫힌 루프, line-connect는 열린 선)
        const pts = d.points;
        if (pts.length < 2) continue;
        const len = d.type === 'polygon' ? pts.length : pts.length - 1;
        for (let j = 0; j < len; j++) {
          const p1 = pts[j], p2 = pts[(j+1) % pts.length];
          const ex1 = p1.x/100*W, ey1 = p1.y/100*H;
          const ex2 = p2.x/100*W, ey2 = p2.y/100*H;
          const edx = ex2-ex1, edy = ey2-ey1;
          const elen2 = edx*edx + edy*edy;
          if (elen2 < 1) continue;
          const et = Math.max(0, Math.min(1, ((spx-ex1)*edx + (spy-ey1)*edy) / elen2));
          if (Math.hypot(spx - (ex1+et*edx), spy - (ey1+et*edy)) < THRESH) return i;
        }
      }
    }
    return -1;
  }

  /** 색상 문자열을 SVG marker id에 사용 가능한 alphanumeric 문자열로 변환 (#3b82f6 → tdmc3b82f6) */
  function tdColorId(color) {
    return 'tdm' + color.replace(/[^a-zA-Z0-9]/g, '');
  }

  /** SVG defs에 화살표 마커가 없으면 생성하여 추가하고 마커 id를 반환 */
  function tdEnsureMarker(layer, color) {
    const id = tdColorId(color);
    if (layer.querySelector('#' + id)) return id;
    const NS = 'http://www.w3.org/2000/svg';
    let defs = layer.querySelector('defs');
    if (!defs) { defs = document.createElementNS(NS, 'defs'); layer.prepend(defs); }
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '2');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', '0 0, 6 2, 0 4');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    defs.appendChild(marker);
    return id;
  }

  /**
   * 2차 베지어 곡선의 컨트롤 포인트를 자동 계산.
   * 선 길이의 25% 거리에서 수직 방향으로 오프셋하며, 피치 중심(y=50)에서 더 먼 쪽(바깥)을 선택.
   * viewBox % 기준이 아닌 실제 픽셀 크기로 계산하여 종횡비 왜곡을 보정한다.
   */
  function tdCalcCurveCtrl(x1, y1, x2, y2) {
    const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
    const W = pitch.width, H = pitch.height;
    // viewBox % → 화면 픽셀
    const sx1 = x1/100*W, sy1 = y1/100*H;
    const sx2 = x2/100*W, sy2 = y2/100*H;
    const dx = sx2-sx1, dy = sy2-sy1;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 1) return { cx: (x1+x2)/2, cy: (y1+y2)/2 };
    // 왼쪽/오른쪽 수직 단위벡터
    const px = -dy/len, py = dx/len;
    const off = len * 0.25;
    const msx = (sx1+sx2)/2, msy = (sy1+sy2)/2;
    // 두 후보 컨트롤 포인트 (viewBox %)
    const cy1 = (msy + py*off) / H * 100;
    const cy2 = (msy - py*off) / H * 100;
    // 피치 세로 중심(y=50)에서 더 먼 쪽(바깥쪽)을 선택
    const useLeft = Math.abs(cy1 - 50) >= Math.abs(cy2 - 50);
    return {
      cx: useLeft ? (msx + px*off)/W*100 : (msx - px*off)/W*100,
      cy: useLeft ? cy1 : cy2,
    };
  }

  /** HEX 색상(#RRGGBB)을 rgba(r,g,b,alpha) 문자열로 변환 */
  function tdHexRgba(hex, alpha) {
    const h = hex.replace('#','');
    const r = parseInt(h.substring(0,2),16);
    const g = parseInt(h.substring(2,4),16);
    const b = parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - SVG 렌더링] 드로잉 데이터를 SVG 엘리먼트로 생성하고 전체 레이어를 재렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 드로잉 데이터(d)에서 SVG 엘리먼트를 생성하여 반환.
   * isPreview=true이면 일부 도형에 opacity를 적용해 미리보기 효과를 부여한다.
   * 지원 타입: box, circle, polygon, line-connect, pencil, curve-arrow, curve-dashed-arrow,
   *            line, dashed, arrow, dashed-arrow
   */
  function tdMakeEl(d, isPreview) {
    const NS = 'http://www.w3.org/2000/svg';
    const op = (isPreview && d.type !== 'pencil') ? 0.6 : 1;
    const layer = document.getElementById('tactics-draw-layer');

    // box: 반투명 채움 + 외곽선 rect
    if (d.type === 'box') {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', Math.min(d.x1, d.x2));
      r.setAttribute('y', Math.min(d.y1, d.y2));
      r.setAttribute('width', Math.abs(d.x2 - d.x1));
      r.setAttribute('height', Math.abs(d.y2 - d.y1));
      r.setAttribute('fill', tdHexRgba(d.color, 0.18));   // 음영 효과
      r.setAttribute('stroke', d.color);
      r.setAttribute('stroke-width', '0.5');
      r.setAttribute('opacity', op);
      r.setAttribute('rx', '0.3');
      return r;
    }

    // circle: 반투명 채움 + 외곽선 ellipse
    if (d.type === 'circle') {
      const el = document.createElementNS(NS, 'ellipse');
      el.setAttribute('cx', d.cx);
      el.setAttribute('cy', d.cy);
      el.setAttribute('rx', d.rx);
      el.setAttribute('ry', d.ry);
      el.setAttribute('fill', tdHexRgba(d.color, 0.18));
      el.setAttribute('stroke', d.color);
      el.setAttribute('stroke-width', '0.5');
      el.setAttribute('opacity', op);
      return el;
    }

    // polygon: 반투명 채움 + 외곽선 closed polygon
    if (d.type === 'polygon') {
      const pts = d.points.map(p => `${p.x},${p.y}`).join(' ');
      const el = document.createElementNS(NS, 'polygon');
      el.setAttribute('points', pts);
      el.setAttribute('fill', tdHexRgba(d.color, 0.2));
      el.setAttribute('stroke', d.color);
      el.setAttribute('stroke-width', '0.5');
      el.setAttribute('opacity', op);
      return el;
    }

    // line-connect: 채움 없이 선으로만 연결하는 open polyline
    if (d.type === 'line-connect') {
      const pts = d.points.map(p => `${p.x},${p.y}`).join(' ');
      const el = document.createElementNS(NS, 'polyline');
      el.setAttribute('points', pts);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', d.color);
      el.setAttribute('stroke-width', '0.7');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', op);
      return el;
    }

    if (d.type === 'pencil') {
      const pts = (d.points || []).map(p => `${p.x},${p.y}`).join(' ');
      const el = document.createElementNS(NS, 'polyline');
      el.setAttribute('points', pts);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', d.color);
      el.setAttribute('stroke-width', '0.7');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', op);
      return el;
    }

    // curve-arrow / curve-dashed-arrow: 2차 베지어 곡선 + 화살표 마커
    if (d.type === 'curve-arrow' || d.type === 'curve-dashed-arrow') {
      const cx = d.cx ?? (d.x1+d.x2)/2;
      const cy = d.cy ?? (d.y1+d.y2)/2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${d.x1} ${d.y1} Q ${cx} ${cy} ${d.x2} ${d.y2}`);
      path.setAttribute('stroke', d.color);
      path.setAttribute('stroke-width', '0.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', op);
      if (d.type === 'curve-dashed-arrow') path.setAttribute('stroke-dasharray', '1.5 1');
      if (layer) {
        const markerId = tdEnsureMarker(layer, d.color);
        path.setAttribute('marker-end', `url(#${markerId})`);
      }
      return path;
    }

    // line / dashed / arrow / dashed-arrow: 직선 계열 (점선, 화살표 포함)
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', d.x1); line.setAttribute('y1', d.y1);
    line.setAttribute('x2', d.x2); line.setAttribute('y2', d.y2);
    line.setAttribute('stroke', d.color);
    line.setAttribute('stroke-width', '0.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', op);
    if (d.type === 'dashed' || d.type === 'dashed-arrow') line.setAttribute('stroke-dasharray', '1.5 1');
    if ((d.type === 'arrow' || d.type === 'dashed-arrow') && layer) {
      const markerId = tdEnsureMarker(layer, d.color);
      line.setAttribute('marker-end', `url(#${markerId})`);
    }
    return line;
  }

  /**
   * 모든 점을 꼭짓점으로 포함하는 단순 다각형을 만들기 위해
   * 중심점(centroid) 기준 각도 순으로 정렬하여 반환.
   * 3개 미만이면 그대로 반환한다.
   */
  function tdConvexHull(pts) {
    if (pts.length < 3) return pts;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return pts.slice().sort((a, b) =>
      Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );
  }

  /**
   * 전체 토큰의 box-shadow를 재계산하여 적용.
   * polygon/line-connect 도형에 포함된 토큰은 해당 색상의 glow, 선택된 토큰은 selection glow를 표시.
   */
  function tdApplyGlows() {
    // 기존 glow 초기화 (선택된 토큰은 유지)
    document.querySelectorAll('.tactics-token').forEach(tok => {
      if (tdSelectedTokens.has(tok)) return;
      const circle = tok.querySelector('div');
      if (circle) circle.style.boxShadow = '0 2px 8px rgba(0,0,0,.45)';
    });
    // polygon 드로잉에서 playerIndices 수집 후 glow 적용
    const glowMap = {};  // idx → color
    tdDrawings.forEach(d => {
      if ((d.type === 'polygon' || d.type === 'line-connect') && d.playerIndices) {
        d.playerIndices.forEach(i => { glowMap[i] = d.color; });
      }
    });
    Object.entries(glowMap).forEach(([idx, color]) => {
      const tok = document.querySelector(`.tactics-token[data-idx="${idx}"]`);
      if (!tok) return;
      const circle = tok.querySelector('div');
      if (circle) {
        circle.style.boxShadow =
          `0 0 0 3px rgba(255,255,255,0.85),
           0 0 10px 4px ${tdHexRgba(color, 0.7)},
           0 0 20px 6px ${tdHexRgba(color, 0.35)}`;
      }
    });
    // 선택 glow 재적용 (polygon glow에 덮어씌워진 경우 복원)
    tdSelectApplyGlow();
  }

  /** 드래그 중인 선택 사각형 안에 있는 토큰을 임시로 하이라이트 (확정 선택 전 미리보기) */
  function tdHighlightTokensInRect(x1, y1, x2, y2) {
    document.querySelectorAll('.tactics-token').forEach(tok => {
      const tx = parseFloat(tok.style.left);
      const ty = parseFloat(tok.style.top);
      const inside = tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2;
      const circle = tok.querySelector('div');
      if (!circle) return;
      circle.style.boxShadow = inside
        ? `0 0 0 3px rgba(255,255,255,0.85), 0 0 12px 4px ${tdHexRgba(tdColor, 0.7)}`
        : '0 2px 8px rgba(0,0,0,.45)';
    });
  }

  /**
   * SVG 드로잉 레이어를 전체 재렌더링.
   * defs를 제외한 기존 자식 요소를 모두 제거하고 tdDrawings 배열을 순서대로 다시 그린다.
   */
  function tdRenderAll() {
    const layer = document.getElementById('tactics-draw-layer');
    if (!layer) return;
    // defs(마커 정의)는 유지하고 나머지만 제거
    [...layer.children].forEach(c => { if (c.tagName !== 'defs') c.remove(); });
    tdDrawings.forEach(d => layer.appendChild(tdMakeEl(d, false)));
    tdApplyGlows();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 드로잉 레이어 이벤트] pointerdown/move/up으로 도형 그리기, 지우개, 레이저 처리
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // [이벤트 등록] 드로잉 레이어 pointerdown — 도구별 분기 처리
  document.getElementById('tactics-draw-layer')?.addEventListener('pointerdown', e => {
    if (tdTool === 'select') return;
    if (tdTool === 'laser') { tdLaserPointerDown(e); return; }
    e.preventDefault();

    // 원 도구: 선수 바둑알 위 클릭 시 해당 바둑알 중심으로 원 자동 생성
    if (tdTool === 'circle') {
      const pr = document.getElementById('tactics-pitch').getBoundingClientRect();
      const ptX_px = e.clientX - pr.left;
      const ptY_px = e.clientY - pr.top;
      // style.left/top이 아닌 내부 circle div의 실제 화면 중심 사용
      // (wrap에 이름 배지가 있으면 translate(-50%,-50%)가 circle 중심이 아닌 wrap 중심에 맞춰짐)
      const hitTok = [...document.querySelectorAll('.tactics-token')].find(tok => {
        const metrics = tdGetTokenCircleMetrics(tok, pr);
        if (!metrics) return false;
        return Math.hypot(ptX_px - metrics.centerXPx, ptY_px - metrics.centerYPx) < metrics.radiusPx;
      });
      if (hitTok) {
        const metrics = tdGetTokenCircleMetrics(hitTok, pr);
        if (!metrics) return;
        const cx = metrics.centerXPx / pr.width * 100;
        const cy = metrics.centerYPx / pr.height * 100;
        const r_px = metrics.radiusPx * TD_CIRCLE_TOKEN_RADIUS_MULT;
        const cx_off = cx - parseFloat(hitTok.style.left);
        const cy_off = cy - parseFloat(hitTok.style.top);
        const drawing = {
          type: 'circle', cx, cy,
          rx: r_px / pr.width * 100, ry: r_px / pr.height * 100,
          color: tdColor,
          playerIdx: +hitTok.dataset.idx, cx_off, cy_off,
        };
        tdDrawings.push(drawing);
        tdHistoryPush({ type: 'draw', drawing });
        tdRenderAll();
        return; // 드래그 없이 즉시 완료
      }
    }

    e.target.setPointerCapture(e.pointerId);
    tdDrawing = true;
    tdStart = tdGetPt(e);
    tdPencilPoints = [];
    if (tdTool === 'pencil') tdAppendPencilPoint(tdStart, 0);
    tdPreview = null;
  });

  // [이벤트 등록] 드로잉 레이어 pointermove — 지우개 커서, 레이저, 도형 미리보기
  document.getElementById('tactics-draw-layer')?.addEventListener('pointermove', e => {
    // 지우개 커서 위치 업데이트 (드래그 여부 무관)
    if (tdTool === 'eraser') {
      const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
      const ec = document.getElementById('td-eraser-cursor');
      if (ec) {
        ec.style.left = (e.clientX - pitch.left) + 'px';
        ec.style.top  = (e.clientY - pitch.top)  + 'px';
      }
    }
    // 레이저 포인터 — hover 시 점 이동, 클릭+드래그 시 획 추가
    if (tdTool === 'laser') { tdLaserPointerMove(e); return; }
    if (!tdDrawing || tdTool === 'select') return;
    const cur = tdGetPt(e);
    const layer = document.getElementById('tactics-draw-layer');
    if (!layer) return;
    // 지우개: 드래그 중 닿는 도형 지우기
    if (tdTool === 'eraser') {
      const idx = tdHitTestAny(cur.x, cur.y);
      if (idx >= 0) {
        tdHistoryPush({ type: 'erase', index: idx, drawing: tdDrawings[idx] });
        tdDrawings.splice(idx, 1);
        tdRenderAll();
      }
      return;
    }
    if (tdPreview) tdPreview.remove();

    if (tdTool === 'pencil') {
      tdAppendPencilPoint(cur);
      if (tdPencilPoints.length >= 2) {
        tdPreview = tdMakeEl({ type: 'pencil', points: tdPencilPoints, color: tdColor }, true);
        layer.appendChild(tdPreview);
      }
    } else if (tdTool === 'polygon' || tdTool === 'line-connect') {
      // 선택 사각형 미리보기
      const NS = 'http://www.w3.org/2000/svg';
      const r = document.createElementNS(NS, 'rect');
      const rx = Math.min(tdStart.x, cur.x), ry = Math.min(tdStart.y, cur.y);
      r.setAttribute('x', rx);       r.setAttribute('y', ry);
      r.setAttribute('width', Math.abs(cur.x - tdStart.x));
      r.setAttribute('height', Math.abs(cur.y - tdStart.y));
      r.setAttribute('fill', 'rgba(255,255,255,0.04)');
      r.setAttribute('stroke', 'rgba(255,255,255,0.55)');
      r.setAttribute('stroke-width', '0.4');
      r.setAttribute('stroke-dasharray', '2 1');
      tdPreview = r;
      layer.appendChild(tdPreview);
      // 드래그 중 토큰 하이라이트
      tdHighlightTokensInRect(rx, ry, rx + Math.abs(cur.x - tdStart.x), ry + Math.abs(cur.y - tdStart.y));
    } else if (tdTool === 'curve-arrow' || tdTool === 'curve-dashed-arrow') {
      const ctrl = tdCalcCurveCtrl(tdStart.x, tdStart.y, cur.x, cur.y);
      tdPreview = tdMakeEl({type:tdTool, x1:tdStart.x, y1:tdStart.y, x2:cur.x, y2:cur.y, cx:ctrl.cx, cy:ctrl.cy, color:tdColor}, true);
      layer.appendChild(tdPreview);
    } else if (tdTool === 'circle') {
      const pr = document.getElementById('tactics-pitch').getBoundingClientRect();
      const dx_px = (cur.x - tdStart.x) / 100 * pr.width;
      const dy_px = (cur.y - tdStart.y) / 100 * pr.height;
      const r_px = Math.sqrt(dx_px * dx_px + dy_px * dy_px);
      const rx = r_px / pr.width * 100;
      const ry = r_px / pr.height * 100;
      tdPreview = tdMakeEl({type:'circle', cx:tdStart.x, cy:tdStart.y, rx, ry, color:tdColor}, true);
      layer.appendChild(tdPreview);
    } else {
      tdPreview = tdMakeEl({type:tdTool, x1:tdStart.x, y1:tdStart.y, x2:cur.x, y2:cur.y, color:tdColor}, true);
      layer.appendChild(tdPreview);
    }
  });

  // [이벤트 등록] 드로잉 레이어 pointerup — 도형 확정 저장 및 undo 히스토리 기록
  document.getElementById('tactics-draw-layer')?.addEventListener('pointerup', e => {
    if (tdTool === 'laser') { tdLaserPointerUp(); return; }
    if (!tdDrawing || tdTool === 'select') return;
    tdDrawing = false;
    if (tdPreview) { tdPreview.remove(); tdPreview = null; }
    // 지우개: 단일 클릭으로도 지우기
    if (tdTool === 'eraser') {
      const cur = tdGetPt(e);
      const idx = tdHitTestAny(cur.x, cur.y);
      if (idx >= 0) {
        tdHistoryPush({ type: 'erase', index: idx, drawing: tdDrawings[idx] });
        tdDrawings.splice(idx, 1);
        tdRenderAll();
      }
      return;
    }
    const cur = tdGetPt(e);
    const dx = Math.abs(cur.x - tdStart.x), dy = Math.abs(cur.y - tdStart.y);

    // 다른 그리기 도구에서도 곡선 화살표를 클릭만 하면 방향을 뒤집을 수 있게 한다.
    if (dx <= 1 && dy <= 1) {
      const idx = tdHitTestCurve(cur.x, cur.y);
      if (idx >= 0) {
        tdPencilPoints = [];
        tdFlipCurve(idx);
        return;
      }
    }

    if (tdTool === 'pencil') {
      tdAppendPencilPoint(cur, TD_PENCIL_POINT_STEP / 2);
      if (tdHasVisiblePencilStroke(tdPencilPoints)) {
        const drawing = {
          type: 'pencil',
          points: tdPencilPoints.map(p => ({ x: p.x, y: p.y })),
          color: tdColor,
        };
        tdDrawings.push(drawing);
        tdHistoryPush({ type: 'draw', drawing });
        tdRenderAll();
      }
      tdPencilPoints = [];
      return;
    }

    if (tdTool === 'polygon' || tdTool === 'line-connect') {
      // 선택 rect 안의 토큰 수집
      const x1 = Math.min(tdStart.x, cur.x), y1 = Math.min(tdStart.y, cur.y);
      const x2 = Math.max(tdStart.x, cur.x), y2 = Math.max(tdStart.y, cur.y);
      const inRect = [];
      document.querySelectorAll('.tactics-token').forEach(tok => {
        const tx = parseFloat(tok.style.left);
        const ty = parseFloat(tok.style.top);
        if (tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2) {
          inRect.push({ x: tx, y: ty, idx: +tok.dataset.idx, team: tok.dataset.team });
        }
      });
      // 드래그 시작점에 가장 가까운 토큰의 팀만 선택 (DOM 순서 무관)
      let firstTeam = null;
      if (inRect.length > 0) {
        const closest = inRect.reduce((best, t) => {
          const d  = (t.x - tdStart.x) ** 2 + (t.y - tdStart.y) ** 2;
          const bd = (best.x - tdStart.x) ** 2 + (best.y - tdStart.y) ** 2;
          return d < bd ? t : best;
        });
        firstTeam = closest.team;
      }
      const selected = firstTeam ? inRect.filter(t => t.team === firstTeam) : inRect;
      const minPts = tdTool === 'polygon' ? 3 : 2;
      if (selected.length >= minPts) {
        let points;
        if (tdTool === 'polygon') {
          points = tdConvexHull(selected.map(p => ({x: p.x, y: p.y})));
        } else {
          // y 순서로 정렬 (위→아래)
          points = selected.slice().sort((a, b) => a.y - b.y).map(p => ({x: p.x, y: p.y}));
        }
        const drawing = {
          type: tdTool,
          points,
          playerIndices: selected.map(p => p.idx),
          color: tdColor,
        };
        tdDrawings.push(drawing);
        tdHistoryPush({ type: 'draw', drawing });
      } else {
        tdApplyGlows();
      }
      tdRenderAll();
      return;
    }

    if (dx > 1 || dy > 1) {
      let drawing;
      if (tdTool === 'curve-arrow' || tdTool === 'curve-dashed-arrow') {
        const ctrl = tdCalcCurveCtrl(tdStart.x, tdStart.y, cur.x, cur.y);
        drawing = {type:tdTool, x1:tdStart.x, y1:tdStart.y, x2:cur.x, y2:cur.y, cx:ctrl.cx, cy:ctrl.cy, color:tdColor};
      } else if (tdTool === 'circle') {
        const pr = document.getElementById('tactics-pitch').getBoundingClientRect();
        const dx_px = (cur.x - tdStart.x) / 100 * pr.width;
        const dy_px = (cur.y - tdStart.y) / 100 * pr.height;
        const r_px = Math.sqrt(dx_px * dx_px + dy_px * dy_px);
        drawing = {type:'circle', cx:tdStart.x, cy:tdStart.y, rx: r_px/pr.width*100, ry: r_px/pr.height*100, color:tdColor};
      } else {
        drawing = {type:tdTool, x1:tdStart.x, y1:tdStart.y, x2:cur.x, y2:cur.y, color:tdColor};
      }
      tdDrawings.push(drawing);
      tdHistoryPush({ type: 'draw', drawing });
      tdRenderAll();
    }
  });

  /** 드로잉 Undo 외부 호출 래퍼 (버튼 onclick 등에서 사용) */
  function tacticsDrawUndo() {
    tdUndo();
  }

  /** 모든 드로잉·히스토리를 완전 초기화 */
  function tacticsDrawClear() {
    tdDrawings = [];
    tdHistory = [];
    tdFuture = [];
    tdRenderAll();
  }

  /**
   * 클릭 위치(viewBox %)에서 가장 위의 curve-arrow/curve-dashed-arrow 인덱스를 반환.
   * 베지어 곡선 위 포인트를 0.05 간격으로 샘플링해 픽셀 거리가 THRESHOLD 이내인지 확인한다.
   */
  function tdHitTestCurve(px, py) {
    const pitch = document.getElementById('tactics-pitch').getBoundingClientRect();
    const W = pitch.width, H = pitch.height;
    const spx = px/100*W, spy = py/100*H;
    const THRESHOLD = 14; // 픽셀
    // 위에 그린 것부터 탐색 (최근 드로잉 우선)
    for (let i = tdDrawings.length - 1; i >= 0; i--) {
      const d = tdDrawings[i];
      if (d.type !== 'curve-arrow' && d.type !== 'curve-dashed-arrow') continue;
      const cx = d.cx ?? (d.x1+d.x2)/2, cy = d.cy ?? (d.y1+d.y2)/2;
      for (let t = 0; t <= 1; t += 0.05) {
        const u = 1 - t;
        const bx = u*u*d.x1 + 2*u*t*cx + t*t*d.x2;
        const by = u*u*d.y1 + 2*u*t*cy + t*t*d.y2;
        if (Math.hypot(bx/100*W - spx, by/100*H - spy) < THRESHOLD) return i;
      }
    }
    return -1;
  }

  /** 곡선 화살표의 컨트롤 포인트를 시작-끝 중점 기준으로 반전(곡선 방향 전환)하고 undo에 기록 */
  function tdFlipCurve(idx) {
    const d = tdDrawings[idx];
    if (!d) return;
    const prevCx = d.cx ?? (d.x1+d.x2)/2;
    const prevCy = d.cy ?? (d.y1+d.y2)/2;
    const mx = (d.x1+d.x2)/2, my = (d.y1+d.y2)/2;
    d.cx = 2*mx - prevCx;
    d.cy = 2*my - prevCy;
    tdHistoryPush({ type: 'flip', index: idx, prevCx, prevCy });
    tdRenderAll();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [전술판 - 선택 rect] select 모드에서 빈 피치를 드래그해 영역 내 토큰 다중 선택
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let tdSelecting = false;
  let tdSelStart = null;

  /**
   * 선택 사각형 내 토큰 중, 드래그 시작점에 가장 가까운 토큰의 팀(home/away)과
   * 동일한 팀의 토큰만 필터링하여 반환. 두 팀이 동시에 선택되지 않도록 한다.
   */
  function tdFilteredInRect(rx1, ry1, rx2, ry2, startPt) {
    const inRect = [];
    document.querySelectorAll('.tactics-token').forEach(tok => {
      const tx = parseFloat(tok.style.left), ty = parseFloat(tok.style.top);
      if (tx >= rx1 && tx <= rx2 && ty >= ry1 && ty <= ry2) inRect.push(tok);
    });
    if (!inRect.length) return [];
    const closest = inRect.reduce((best, tok) => {
      const tx = parseFloat(tok.style.left), ty = parseFloat(tok.style.top);
      const d  = (tx - startPt.x) ** 2 + (ty - startPt.y) ** 2;
      const bd = (parseFloat(best.style.left) - startPt.x) ** 2 + (parseFloat(best.style.top) - startPt.y) ** 2;
      return d < bd ? tok : best;
    });
    const team = closest.dataset.team;
    return inRect.filter(tok => tok.dataset.team === team);
  }

  // [이벤트 등록] 피치 pointerdown — select 모드에서 빈 공간 클릭 시 선택 rect 시작
  document.getElementById('tactics-pitch')?.addEventListener('pointerdown', e => {
    if (tdTool !== 'select') return;
    if (e.target.closest('.tactics-token, .tactics-ball-token')) return;
    tdSelecting = true;
    tdSelStart = tdGetPt(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    tdClearSelection();
  });

  // [이벤트 등록] 피치 pointermove — 선택 rect 크기 업데이트 및 포함 토큰 하이라이트
  document.getElementById('tactics-pitch')?.addEventListener('pointermove', e => {
    if (!tdSelecting || !tdSelStart) return;
    const cur = tdGetPt(e);
    const pitch = document.getElementById('tactics-pitch');
    const pr = pitch.getBoundingClientRect();
    const rx1 = Math.min(tdSelStart.x, cur.x), ry1 = Math.min(tdSelStart.y, cur.y);
    const rx2 = Math.max(tdSelStart.x, cur.x), ry2 = Math.max(tdSelStart.y, cur.y);
    const rect = document.getElementById('td-select-rect');
    if (rect) {
      rect.style.display = 'block';
      rect.style.left   = (rx1 / 100 * pr.width)  + 'px';
      rect.style.top    = (ry1 / 100 * pr.height) + 'px';
      rect.style.width  = ((rx2 - rx1) / 100 * pr.width)  + 'px';
      rect.style.height = ((ry2 - ry1) / 100 * pr.height) + 'px';
    }
    // 실시간 하이라이트 — 드래그 시작점 기준 가장 가까운 토큰의 팀만
    const highlighted = new Set(tdFilteredInRect(rx1, ry1, rx2, ry2, tdSelStart));
    document.querySelectorAll('.tactics-token').forEach(tok => {
      const circle = tok.querySelector('div');
      if (!circle) return;
      if (highlighted.has(tok)) {
        const bg = tok.dataset.team === 'home' ? (state.colors.homeBg || '#3B82F6') : (state.colors.awayBg || '#EF4444');
        circle.style.boxShadow = `0 0 0 2.5px rgba(255,255,255,0.9), 0 0 10px 4px ${bg}, 0 0 22px 8px ${bg}88`;
      } else {
        circle.style.boxShadow = '0 2px 8px rgba(0,0,0,.45)';
      }
    });
  });

  // [이벤트 등록] 피치 pointerup — 선택 rect 확정 및 tdSelectedTokens에 토큰 추가
  document.getElementById('tactics-pitch')?.addEventListener('pointerup', e => {
    if (!tdSelecting) return;
    tdSelecting = false;
    const rect = document.getElementById('td-select-rect');
    if (rect) rect.style.display = 'none';
    if (!tdSelStart) return;
    const cur = tdGetPt(e);
    const rx1 = Math.min(tdSelStart.x, cur.x), ry1 = Math.min(tdSelStart.y, cur.y);
    const rx2 = Math.max(tdSelStart.x, cur.x), ry2 = Math.max(tdSelStart.y, cur.y);
    const startPt = tdSelStart;
    tdSelStart = null;
    if (rx2 - rx1 < 1 && ry2 - ry1 < 1) { tdClearSelection(); return; }
    tdSelectedTokens.clear();
    tdFilteredInRect(rx1, ry1, rx2, ry2, startPt).forEach(tok => tdSelectedTokens.add(tok));
    tdSelectApplyGlow();
  });

  // [이벤트 등록] 피치 click — select 모드에서 곡선 화살표 클릭 시 방향 반전
  document.getElementById('tactics-pitch')?.addEventListener('click', e => {
    if (tdTool !== 'select') return;
    if (e.target.closest('.tactics-token, .tactics-ball-token')) return;
    const pt = tdGetPt(e);
    const idx = tdHitTestCurve(pt.x, pt.y);
    if (idx >= 0) tdFlipCurve(idx);
  });

  // [이벤트 등록] 지우개 커서 — 피치 영역 밖으로 나가면 숨기고 들어오면 표시
  document.getElementById('tactics-pitch')?.addEventListener('mouseleave', () => {
    const ec = document.getElementById('td-eraser-cursor');
    if (ec) ec.style.display = 'none';
  });
  document.getElementById('tactics-pitch')?.addEventListener('mouseenter', () => {
    if (tdTool !== 'eraser') return;
    const ec = document.getElementById('td-eraser-cursor');
    if (ec) ec.style.display = 'block';
  });

  // [초기화] 초기 색상 버튼 UI 상태 설정 (기본값 흰색)
  tacticsDrawSetColor(tdColor);
  // tdTool/tdDrawings/tdHistory/tdFuture 등 드로잉 변수가 선언된 이후에 호출해야 TDZ 에러 방지
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tacticsInitDefaultSelect, { once: true });
  } else {
    tacticsInitDefaultSelect();
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // END 전술판 드로잉 도구
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
