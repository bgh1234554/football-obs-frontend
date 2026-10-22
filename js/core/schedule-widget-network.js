/**
 * API-Sports 위젯은 일정 화면이 보일 때만 원격 데이터를 조회한다.
 * overlay_dashboard.html에서 위젯 스크립트보다 먼저 로드해 fetch를 감싼다.
 *
 * 위젯의 DOM이나 내부 타이머를 제거·수정하지 않고, 전송 직전의 요청만 차단한다.
 * 따라서 숨겨진 동안에도 위젯의 갱신 콜백은 실행될 수 있지만 CDN으로 요청하지 않는다.
 * 일정 화면으로 돌아오면 위젯이 설정된 주기에 따라 보내는 다음 요청부터 다시 통과한다.
 */
(() => {
  // 날짜 목록·경기 상세 등 서로 다른 조회 결과가 섞이지 않도록 요청 URL별로 보관한다.
  const lastGoodResponse = new Map();
  // 허용한 요청은 기존 fetch로 전달한다. 아래에서 window.fetch를 교체해도 재귀 호출하지 않는다.
  const originalFetch = window.fetch.bind(window);

  function widgetFetch(resource, init) {
    // fetch는 문자열·URL·Request를 받을 수 있다. Request는 URL 속성을 따로 읽어야 한다.
    const url = resource instanceof Request ? resource.url : String(resource);
    // CDN 주소를 중복 관리하지 않고 위젯 설정을 기준으로 판단한다.
    // 설정 요소는 본문에 있으므로 이 파일을 로드할 때가 아니라 요청할 때 읽는다.
    const widgetApiBase = document.querySelector('api-sports-widget[data-type="config"]')?.getAttribute('data-url-football');
    let isWidgetCall = false;
    try {
      if (widgetApiBase) isWidgetCall = new URL(url, window.location.href).origin === new URL(widgetApiBase, window.location.href).origin;
    } catch {} // URL 해석 실패 시 이 차단기로 처리하지 않고 기존 fetch의 동작을 따른다.

    // 두 종류의 비활성 상태를 독립적으로 확인한다.
    // 1) document.hidden: 다른 Chrome 탭을 보거나 창을 최소화한 상태.
    //    사이트 내부에서 일정이 선택된 채로 남아 있어도 브라우저가 숨겨지면 차단한다.
    // 2) 일정 화면의 active 클래스: 같은 사이트에서 대시보드·전술판 등으로 이동한 상태.
    //    별도 상태 변수 대신 실제 화면 상태를 확인하며, 본문 생성 전에도 차단한다.
    const blocked = isWidgetCall && (document.hidden || !document.getElementById('page-schedule')?.classList.contains('active'));
    if (blocked) {
      // 마지막 응답으로 위젯 화면을 유지한다. 매번 빈 결과를 주면 기존 목록이 지워질 수 있다.
      // 아직 저장된 응답이 없는 URL만 빈 결과를 반환한다. originalFetch를 호출하지 않으므로
      // 이 분기로 들어온 요청은 CDN과 API-Sports에 전송되지 않는다.
      return Promise.resolve(new Response(lastGoodResponse.get(url) || '{"results":0,"response":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    // 위젯 CDN과 다른 주소를 사용하는 백엔드 경기 불러오기·폴링은 그대로 통과한다.
    // 요청 옵션과 반환 Promise도 유지하며, 이미 전송된 요청을 취소하지는 않는다.
    const request = originalFetch(resource, init);
    if (isWidgetCall) {
      request.then(response => {
        // 위젯이 원래 응답 본문을 읽을 수 있도록 복제본만 소비한다.
        // 복제본 저장 실패가 실제 요청의 성공·실패를 바꾸지 않도록 별도로 처리한다.
        if (response.ok) response.clone().text().then(body => {
          if (body) lastGoodResponse.set(url, body);
        }).catch(() => {});
      }).catch(() => {});
    }
    return request;
  }
  window.fetch = widgetFetch;
})();
