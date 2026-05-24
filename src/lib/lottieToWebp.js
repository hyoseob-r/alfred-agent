/**
 * Lottie JSON → Animated WebP converter
 * 방식: lottie-web canvas renderer로 프레임별 렌더링 → canvas.toBlob('image/webp') → WebP RIFF 직접 조립
 */
let _lottie = null;
async function getLottie() {
  if (_lottie) return _lottie;
  const mod = await import('lottie-web');
  _lottie = mod.default;
  return _lottie;
}

// ── WebP RIFF 파서 — 단일 프레임 WebP에서 VP8/VP8L 청크 추출 ──────────────────
export function extractVP8Chunk(buffer) {
  const view = new DataView(buffer);
  const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o+1), view.getUint8(o+2), view.getUint8(o+3));

  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('Not a valid WebP file');

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id   = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'VP8 ' || id === 'VP8L') {
      // VP8 청크 전체 복사 (헤더 8바이트 포함)
      const chunk = new Uint8Array(8 + size);
      chunk.set(new Uint8Array(buffer, offset, 8 + size));
      return chunk;
    }
    offset += 8 + size + (size & 1); // 2바이트 패딩
  }
  throw new Error('VP8/VP8L chunk not found');
}

// ── 유틸: 리틀엔디안 24비트 ────────────────────────────────────────────────────
function u24le(val) {
  return new Uint8Array([val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF]);
}

// ── RIFF 청크 빌더 ────────────────────────────────────────────────────────────
function buildChunk(id, data) {
  const enc = new TextEncoder();
  const header = new Uint8Array(8);
  header.set(enc.encode(id.padEnd(4, ' ').slice(0, 4)));
  new DataView(header.buffer).setUint32(4, data.byteLength, true);
  const pad = data.byteLength & 1 ? new Uint8Array(1) : new Uint8Array(0);
  return concat([header, data, pad]);
}

// ── 배열 합치기 ───────────────────────────────────────────────────────────────
function concat(arrays) {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a instanceof Uint8Array ? a : new Uint8Array(a.buffer ?? a), pos);
    pos += a.byteLength;
  }
  return out;
}

// ── Animated WebP RIFF 조립 ───────────────────────────────────────────────────
export function buildAnimatedWebP(frames, width, height) {
  // VP8X 청크: animated flag + canvas 크기
  const vp8x = new Uint8Array(10);
  new DataView(vp8x.buffer).setUint32(0, 0x00000002, true); // flags: animation bit
  vp8x.set(u24le(width - 1), 4);
  vp8x.set(u24le(height - 1), 7);

  // ANIM 청크: 배경색 + 루프 횟수
  const anim = new Uint8Array(6);
  new DataView(anim.buffer).setUint32(0, 0xFFFFFFFF, true); // 흰 배경
  new DataView(anim.buffer).setUint16(4, 0, true);           // 무한 루프

  // ANMF 청크 배열
  const anmfChunks = frames.map(({ vp8Chunk, durationMs }) => {
    const header = new Uint8Array(16);
    // X=0, Y=0 (각 24비트, /2 이므로 그냥 0)
    header.set(u24le(0), 0);              // Frame X / 2
    header.set(u24le(0), 3);              // Frame Y / 2
    header.set(u24le(width - 1), 6);     // Width - 1
    header.set(u24le(height - 1), 9);    // Height - 1
    header.set(u24le(Math.round(durationMs)), 12); // Duration (ms)
    header[15] = 0xC0;                   // Blend=1(no blend) + Dispose=1(to bg)
    return buildChunk('ANMF', concat([header, vp8Chunk]));
  });

  const webpBody = concat([
    buildChunk('VP8X', vp8x),
    buildChunk('ANIM', anim),
    ...anmfChunks,
  ]);

  // RIFF 헤더
  const enc = new TextEncoder();
  const riffHeader = new Uint8Array(12);
  riffHeader.set(enc.encode('RIFF'));
  new DataView(riffHeader.buffer).setUint32(4, webpBody.byteLength + 4, true);
  riffHeader.set(enc.encode('WEBP'), 8);

  return concat([riffHeader, webpBody]).buffer;
}

// ── 메인 변환 함수 ────────────────────────────────────────────────────────────
export async function convertLottieToWebp(animData, { fps = 30, scale = 1, quality = 0.85, bgColor = '#ffffff' } = {}, onProgress) {
  const srcW   = animData.w || 512;
  const srcH   = animData.h || 512;
  const w      = Math.max(2, Math.round(srcW * scale));
  const h      = Math.max(2, Math.round(srcH * scale));
  const srcFps = animData.fr || 30;
  const ip     = animData.ip ?? 0;
  const op     = animData.op ?? 60;
  const totalDuration = (op - ip) / srcFps; // 초
  const totalFrames   = Math.max(1, Math.ceil(totalDuration * fps));
  const frameDurationMs = 1000 / fps;

  // 오프스크린 컨테이너
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;overflow:hidden;pointer-events:none;`;
  document.body.appendChild(container);

  // Lottie 로드 (canvas renderer)
  const lottie = await getLottie();
  const anim = lottie.loadAnimation({
    container,
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: JSON.parse(JSON.stringify(animData)),
    rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
  });

  await new Promise((resolve, reject) => {
    anim.addEventListener('DOMLoaded', resolve);
    setTimeout(() => reject(new Error('Lottie 로드 타임아웃')), 8000);
  });

  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('Canvas 엘리먼트를 찾을 수 없습니다.');
  canvas.width  = w;
  canvas.height = h;
  anim.resize();

  const ctx = canvas.getContext('2d');

  // 프레임별 캡처
  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const t         = i / fps;
    const srcFrame  = Math.min(ip + t * srcFps, op - 0.001);

    // 배경 채우기 (흰 배경으로 투명도 제거)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    anim.goToAndStop(srcFrame, true);

    // 배경 다시 그리기 (lottie가 clearCanvas:true라서 배경이 날아감)
    const imgData = ctx.getImageData(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.putImageData(imgData, 0, 0);

    // WebP blob 캡처
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    const buf  = await blob.arrayBuffer();
    const vp8Chunk = extractVP8Chunk(buf);

    frames.push({ vp8Chunk, durationMs: frameDurationMs });
    onProgress?.((i + 1) / totalFrames);

    // 브라우저 UI 블로킹 방지
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }

  anim.destroy();
  document.body.removeChild(container);

  return buildAnimatedWebP(frames, w, h);
}
