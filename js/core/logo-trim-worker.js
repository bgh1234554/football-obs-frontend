/**
 * [로고 분석 Worker: 픽셀 읽기와 공통 분석 함수 실행]
 * logo-trim.js가 보낸 분석 요청을 받아 경계와 내부 채우기 마스크를 계산한다.
 * 이미지 디코딩/픽셀 분석이 점수판 전환 등 메인 스레드 작업을 막지 않도록 분리한 경로이며,
 * 분석 기준 자체는 메인 스레드 대체 경로와 같은 logo-trim-analysis.js를 사용한다.
 *
 * 처리 순서:
 *  1. 요청 ID와 URL 또는 전달된 ImageBitmap을 읽는다.
 *  2. URL 경로는 Worker 안에서 가져와 디코딩하고 크기를 검증한다.
 *  3. 픽셀의 그림 경계를 찾고, 요청된 경우 별도 해상도로 내부 채우기 마스크를 만든다.
 *  4. 결과에 원래 ID를 붙여 응답하고, 성공/실패와 관계없이 사용한 비트맵을 닫는다.
 *
 * DOM/CSS 반영, 결과 캐시, Worker 실패 후 대체 경로 선택은 호출자인 logo-trim.js의 책임이다.
 *
 * 요청: { id, url, bitmap, width, height, fill, fillBitmap }
 *   url         PNG 등 래스터 로고면 Worker가 직접 받아(브라우저 캐시 재사용) 이 스레드에서 디코딩한다.
 *               이때 bitmap/width/height는 없고, 원래 크기로 분석한다(메인 스레드 경로와 같음).
 *   bitmap      SVG처럼 메인 스레드에서만 그릴 수 있는 로고를 경계 분석 크기(width x height)로 그린 것
 *   fill        내부 채우기 분석 여부(예외 로고면 false)
 *   fillBitmap  채우기 분석 크기가 경계 분석 크기와 다를 때 메인 스레드가 그 크기로 그려 보낸 로고
 * 응답: { id, bounds, blob, fillFailed } 또는 { id, error }
 */
importScripts('logo-trim-analysis.js');

/**
 * 비트맵을 지정 크기의 OffscreenCanvas에 그린 뒤 픽셀을 읽는다.
 * 메인 스레드 경로의 drawImage -> getImageData와 같은 순서다.
 *
 * @param {ImageBitmap} bitmap 그릴 로고.
 * @param {number} width 캔버스 폭.
 * @param {number} height 캔버스 높이.
 * @returns {{canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, pixels: ImageData}} 캔버스와 픽셀.
 */
function readPixels(bitmap, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx, pixels: ctx.getImageData(0, 0, width, height) };
}

self.onmessage = async ({ data }) => {
  const { id, url, fill } = data;
  let { bitmap, width, height, fillBitmap } = data;
  try {
    if (url) {
      // 메인 스레드에서 createImageBitmap(img)를 쓰면 PNG 디코딩이 메인 스레드에서 일어나 로고당 수십~100ms가
      // 남았다. 같은 URL을 CORS로 받아(화면 <img crossorigin>과 같은 캐시 항목) 여기서 디코딩한다.
      const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logo trim image unavailable');
      bitmap = await createImageBitmap(await response.blob());
      width = bitmap.width;
      height = bitmap.height;
      if (!width || !height) throw new Error('Empty logo dimensions');
      if (width * height > 16 * 1024 * 1024) throw new Error('Logo too large to analyse safely');
    }
    // 그림이 없는 로고는 bounds=null로 응답한다. 경계 탐색 성공과 채우기 성공은 별개이며,
    // 아래 채우기만 실패해도 유효한 경계 결과까지 버리지는 않는다.
    const bounds = LogoTrimAnalysis.findBounds(readPixels(bitmap, width, height).pixels);
    let blob = null, fillFailed = false;
    if (fill && bounds) {
      try {
        const geometry = LogoTrimAnalysis.fillGeometry(bounds);
        // 래스터 로고를 줄여 분석할 때도 메인 스레드 경로처럼 원본을 그 크기로 바로 그린다.
        const { canvas, ctx, pixels } = readPixels(fillBitmap || bitmap, geometry.width, geometry.height);
        const mask = LogoTrimAnalysis.buildFillMask(pixels, geometry.minArea);
        // 채울 내부 영역이 없으면 mask=null이 정상 결과이다. 실제 계산/변환 오류만
        // fillFailed=true로 구분해 호출자가 필요에 따라 채우기 경로를 다시 선택할 수 있게 한다.
        if (mask) {
          ctx.clearRect(0, 0, geometry.width, geometry.height);
          ctx.putImageData(mask, 0, 0);
          blob = await canvas.convertToBlob({ type: 'image/png' });
        }
      } catch (error) {
        fillFailed = true;
      }
    }
    self.postMessage({ id, bounds, blob, fillFailed });
  } catch (error) {
    // 디코딩/경계 분석 단계의 실패는 요청 전체 오류이다. 메시지 ID를 유지해야 여러 분석이
    // 동시에 진행되어도 메인 스레드가 해당 요청만 실패 처리할 수 있다.
    self.postMessage({ id, error: String(error && error.message || error) });
  } finally {
    // 전달받거나 직접 만든 비트맵의 사용은 이 요청에서 끝난다. PNG Blob은 응답에 남기되
    // 비트맵은 닫아 다음 분석까지 디코딩 메모리가 계속 유지되지 않도록 한다.
    bitmap?.close();
    fillBitmap?.close();
  }
};
