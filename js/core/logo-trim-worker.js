/**
 * 로고 픽셀 분석 Web Worker(2026-10-17). logo-trim.js가 처음 보는 로고를 분석할 때 픽셀 읽기와
 * 경계·내부 채우기 계산을 이 백그라운드 스레드에서 한다. 메인 스레드에서 하면 로고 하나에 약 100ms씩
 * 화면이 멈춰, 새 경기를 불러올 때 점수판 테마 전환 애니메이션이 끊겼다.
 * 계산은 메인 스레드 경로와 같은 함수(logo-trim-analysis.js)를 쓴다.
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
    const bounds = LogoTrimAnalysis.findBounds(readPixels(bitmap, width, height).pixels);
    let blob = null, fillFailed = false;
    if (fill && bounds) {
      try {
        const geometry = LogoTrimAnalysis.fillGeometry(bounds);
        // 래스터 로고를 줄여 분석할 때도 메인 스레드 경로처럼 원본을 그 크기로 바로 그린다.
        const { canvas, ctx, pixels } = readPixels(fillBitmap || bitmap, geometry.width, geometry.height);
        const mask = LogoTrimAnalysis.buildFillMask(pixels, geometry.minArea);
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
    self.postMessage({ id, error: String(error && error.message || error) });
  } finally {
    bitmap?.close();
    fillBitmap?.close();
  }
};
