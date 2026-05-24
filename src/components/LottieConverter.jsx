import { useState, useEffect, useRef, useCallback } from 'react';
import { convertLottieToWebp, extractVP8Chunk, buildAnimatedWebP } from '../lib/lottieToWebp';

let _lottie = null;
async function getLottie() {
  if (_lottie) return _lottie;
  const mod = await import('lottie-web');
  _lottie = mod.default;
  return _lottie;
}

// ── 공통 UI ──────────────────────────────────────────────────────────────────
function Tag({ children }) {
  return <span style={{ padding: '2px 8px', background: '#1e1e1e', border: '1px solid #333', borderRadius: 5, fontSize: 11, color: '#888' }}>{children}</span>;
}
function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${active ? '#7c3aed' : '#333'}`, background: active ? '#7c3aed22' : '#1a1a1a', color: active ? '#a78bfa' : '#666', fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
      {children}
    </button>
  );
}
function ProgressBar({ value }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 6 }}>
        <span>변환 중...</span><span>{value}%</span>
      </div>
      <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: 3, transition: 'width 0.1s' }} />
      </div>
    </div>
  );
}

// ── PNG 시퀀스 → WebP ─────────────────────────────────────────────────────────
function PngToWebp() {
  const [files, setFiles] = useState([]);
  const [fps, setFps] = useState(24);
  const [scale, setScale] = useState(1);
  const [bgColor, setBgColor] = useState('transparent');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [webpUrl, setWebpUrl] = useState(null);
  const [webpSize, setWebpSize] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList) => {
    const pngs = Array.from(fileList)
      .filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!pngs.length) { alert('PNG/JPG 파일이 없습니다'); return; }
    setFiles(pngs);
    setWebpUrl(null);
  };

  const handleConvert = async () => {
    if (!files.length || converting) return;
    setConverting(true); setProgress(0); setWebpUrl(null);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frameDurationMs = 1000 / fps;
      const frames = [];
      let w = 0, h = 0;

      for (let i = 0; i < files.length; i++) {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = URL.createObjectURL(files[i]);
        });

        if (i === 0) {
          w = Math.max(2, Math.round(img.naturalWidth * scale));
          h = Math.max(2, Math.round(img.naturalHeight * scale));
          canvas.width = w;
          canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);
        if (bgColor !== 'transparent') {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);

        const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.9));
        const buf = await blob.arrayBuffer();
        frames.push({ vp8Chunk: extractVP8Chunk(buf), durationMs: frameDurationMs });

        setProgress(Math.round(((i + 1) / files.length) * 100));
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
      }

      const buffer = buildAnimatedWebP(frames, w, h);
      const outBlob = new Blob([buffer], { type: 'image/webp' });
      setWebpSize(outBlob.size);
      setWebpUrl(URL.createObjectURL(outBlob));
    } catch (err) {
      alert('변환 실패: ' + err.message);
    }
    setConverting(false);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = webpUrl;
    a.download = 'animation.webp';
    a.click();
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* 좌: 파일 목록 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1e1e', padding: 20, gap: 14, overflow: 'hidden' }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          style={{ border: `2px dashed ${dragOver ? '#7c3aed' : '#2a2a2a'}`, borderRadius: 12, padding: 24, textAlign: 'center', background: dragOver ? '#1e103040' : 'transparent', transition: 'all 0.2s' }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🖼</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>PNG 시퀀스를 드래그하세요</div>
          <div style={{ fontSize: 10, color: '#444', marginBottom: 12 }}>파일명 순서로 정렬됩니다 (예: frame_001.png, frame_002.png)</div>
          <label style={{ background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            파일 선택
            <input type="file" accept="image/png,image/jpeg,image/gif" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
          </label>
        </div>

        {files.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>{files.length}개 프레임 · 파일명 순 정렬</div>
            {files.slice(0, 50).map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#1a1a1a', borderRadius: 6 }}>
                <span style={{ fontSize: 10, color: '#555', width: 28, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{f.name}</span>
                <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>{(f.size / 1024).toFixed(0)}KB</span>
              </div>
            ))}
            {files.length > 50 && <div style={{ fontSize: 10, color: '#444', textAlign: 'center', padding: 8 }}>+{files.length - 50}개 더...</div>}
          </div>
        )}
      </div>

      {/* 우: 설정 + 결과 */}
      <div style={{ width: 280, flexShrink: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>출력 설정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>FPS</span>
              <div style={{ display: 'flex', gap: 4 }}>{[12, 24, 30].map(v => <Chip key={v} active={fps === v} onClick={() => setFps(v)}>{v}</Chip>)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>스케일</span>
              <div style={{ display: 'flex', gap: 4 }}>{[0.5, 1, 2].map(v => <Chip key={v} active={scale === v} onClick={() => setScale(v)}>{v}x</Chip>)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>배경</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['transparent', '#ffffff', '#000000'].map(c => (
                  <div key={c} onClick={() => setBgColor(c)} style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer', border: `2px solid ${bgColor === c ? '#7c3aed' : '#333'}`, background: c === 'transparent' ? 'repeating-conic-gradient(#444 0% 25%,#222 0% 50%) 0 0/8px 8px' : c }} />
                ))}
              </div>
            </div>
            {files.length > 0 && (
              <div style={{ fontSize: 10, color: '#444', lineHeight: 1.8 }}>
                {files.length}프레임 · {(files.length / fps).toFixed(2)}s
              </div>
            )}
          </div>
        </div>

        <button onClick={handleConvert} disabled={!files.length || converting}
          style={{ width: '100%', padding: '12px 0', background: (!files.length || converting) ? '#1e1e1e' : '#7c3aed', border: 'none', borderRadius: 10, color: (!files.length || converting) ? '#555' : '#fff', fontSize: 13, fontWeight: 700, cursor: (!files.length || converting) ? 'default' : 'pointer' }}>
          {converting ? '변환 중...' : '🔄 WebP로 변환'}
        </button>

        {converting && <ProgressBar value={progress} />}

        {webpUrl && !converting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>변환 완료 ✅</div>
            <img src={webpUrl} alt="result" style={{ width: '100%', borderRadius: 8, border: '1px solid #1e1e1e', background: '#0d0d0d' }} />
            <div style={{ fontSize: 10, color: '#555', textAlign: 'right' }}>{(webpSize / 1024).toFixed(1)}KB</div>
            <button onClick={handleDownload} style={{ width: '100%', padding: '10px 0', background: '#065f46', border: '1px solid #059669', borderRadius: 10, color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ⬇ WebP 다운로드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lottie → WebP ─────────────────────────────────────────────────────────────
function LottieToWebp() {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [webpUrl, setWebpUrl] = useState(null);
  const [webpSize, setWebpSize] = useState(0);
  const [fps, setFps] = useState(30);
  const [scale, setScale] = useState(1);
  const [bgColor, setBgColor] = useState('#ffffff');
  const previewRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    if (!file?.data || !previewRef.current) return;
    if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    previewRef.current.innerHTML = '';
    getLottie().then(lib => {
      const a = lib.loadAnimation({ container: previewRef.current, renderer: 'svg', loop: true, autoplay: true, animationData: JSON.parse(JSON.stringify(file.data)) });
      animRef.current = a;
    });
    return () => { if (animRef.current) { animRef.current.destroy(); animRef.current = null; } };
  }, [file]);

  const handleFile = useCallback((f) => {
    if (!f || !f.name.endsWith('.json')) { alert('.json Lottie 파일만 지원합니다'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.layers) throw new Error('Lottie 형식이 아닙니다');
        const ip = data.ip ?? 0, op = data.op ?? 60, fr = data.fr || 30;
        setFile({ data, name: f.name, info: { w: data.w, h: data.h, fps: fr, frames: Math.round(op - ip), duration: ((op - ip) / fr).toFixed(2), layers: data.layers?.length || 0 } });
        setWebpUrl(null);
      } catch (err) { alert('파싱 실패: ' + err.message); }
    };
    reader.readAsText(f);
  }, []);

  const handleConvert = async () => {
    if (!file?.data || converting) return;
    setConverting(true); setProgress(0); setWebpUrl(null);
    try {
      const buffer = await convertLottieToWebp(file.data, { fps, scale, bgColor }, p => setProgress(Math.round(p * 100)));
      const blob = new Blob([buffer], { type: 'image/webp' });
      setWebpSize(blob.size);
      setWebpUrl(URL.createObjectURL(blob));
    } catch (err) { alert('변환 실패: ' + err.message); }
    setConverting(false);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = webpUrl;
    a.download = (file.name || 'animation').replace(/\.json$/i, '') + '.webp';
    a.click();
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1e1e', padding: 20, gap: 14, overflow: 'hidden' }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          style={{ flex: file ? 1 : undefined, border: `2px dashed ${dragOver ? '#7c3aed' : (file ? 'transparent' : '#2a2a2a')}`, borderRadius: 12, overflow: 'hidden', background: file ? '#0d0d0d' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: file ? 200 : 'auto', padding: file ? 0 : 24, textAlign: 'center', transition: 'all 0.2s', position: 'relative' }}
        >
          {file ? (
            <div ref={previewRef} style={{ width: '100%', height: '100%', minHeight: 200 }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 32 }}>🎬</div>
              <div style={{ fontSize: 13, color: '#666' }}>Lottie JSON 드래그</div>
              <label style={{ background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                파일 선택
                <input type="file" accept=".json" onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
              </label>
            </div>
          )}
          {dragOver && file && (
            <div style={{ position: 'absolute', inset: 0, background: '#1e103080', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#a78bfa', fontWeight: 700 }}>파일 교체</span>
            </div>
          )}
        </div>

        {file?.info && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tag>{file.name}</Tag>
            <Tag>{file.info.w}×{file.info.h}px</Tag>
            <Tag>{file.info.fps}fps</Tag>
            <Tag>{file.info.frames}프레임</Tag>
            <Tag>{file.info.duration}s</Tag>
          </div>
        )}
      </div>

      <div style={{ width: 280, flexShrink: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>출력 설정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>FPS</span>
              <div style={{ display: 'flex', gap: 4 }}>{[15, 24, 30].map(v => <Chip key={v} active={fps === v} onClick={() => setFps(v)}>{v}</Chip>)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>스케일</span>
              <div style={{ display: 'flex', gap: 4 }}>{[0.5, 1, 2].map(v => <Chip key={v} active={scale === v} onClick={() => setScale(v)}>{v}x</Chip>)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#666', width: 60 }}>배경색</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ffffff', '#000000', 'transparent'].map(c => (
                  <div key={c} onClick={() => setBgColor(c)} style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer', border: `2px solid ${bgColor === c ? '#7c3aed' : '#333'}`, background: c === 'transparent' ? 'repeating-conic-gradient(#444 0% 25%,#222 0% 50%) 0 0/8px 8px' : c }} />
                ))}
              </div>
            </div>
            {file?.info && (
              <div style={{ fontSize: 10, color: '#444', lineHeight: 1.8 }}>
                출력: {Math.round(file.info.w * scale)}×{Math.round(file.info.h * scale)}px
              </div>
            )}
          </div>
        </div>

        <button onClick={handleConvert} disabled={!file || converting}
          style={{ width: '100%', padding: '12px 0', background: (!file || converting) ? '#1e1e1e' : '#7c3aed', border: 'none', borderRadius: 10, color: (!file || converting) ? '#555' : '#fff', fontSize: 13, fontWeight: 700, cursor: (!file || converting) ? 'default' : 'pointer' }}>
          {converting ? '변환 중...' : '🔄 WebP로 변환'}
        </button>

        {converting && <ProgressBar value={progress} />}

        {webpUrl && !converting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>변환 완료 ✅</div>
            <img src={webpUrl} alt="result" style={{ width: '100%', borderRadius: 8, border: '1px solid #1e1e1e', background: '#0d0d0d' }} />
            <div style={{ fontSize: 10, color: '#555', textAlign: 'right' }}>{(webpSize / 1024).toFixed(1)}KB</div>
            <button onClick={handleDownload} style={{ width: '100%', padding: '10px 0', background: '#065f46', border: '1px solid #059669', borderRadius: 10, color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ⬇ WebP 다운로드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WebP 플레이어 ─────────────────────────────────────────────────────────────
function WebpPlayer() {
  const [webpUrl, setWebpUrl] = useState(null);
  const [webpName, setWebpName] = useState('');
  const [frames, setFrames] = useState([]);
  const [curFrame, setCurFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(24);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const curFrameRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastTimeRef = useRef(0);

  const decodeWebp = useCallback(async (file) => {
    setLoading(true);
    setIsPlaying(false);
    isPlayingRef.current = false;
    cancelAnimationFrame(rafRef.current);

    try {
      const url = URL.createObjectURL(file);
      setWebpUrl(url);
      setWebpName(file.name);

      // ImageDecoder API (Chrome 94+)
      if (typeof ImageDecoder !== 'undefined') {
        const resp = await fetch(url);
        const decoder = new ImageDecoder({ data: resp.body, type: 'image/webp' });
        await decoder.tracks.ready;
        const track = decoder.tracks.selectedTrack;
        const frameCount = track.frameCount;
        const decoded = [];

        for (let i = 0; i < frameCount; i++) {
          const result = await decoder.decode({ frameIndex: i });
          decoded.push({ bitmap: result.image, duration: result.image.duration ?? (1000 / 24) });
        }
        setFrames(decoded);
        setTotalDuration(decoded.reduce((s, f) => s + (f.duration / 1000), 0));
        setCurFrame(0);
        curFrameRef.current = 0;

        // 첫 프레임 그리기
        if (decoded.length > 0 && canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = decoded[0].bitmap.displayWidth;
          canvas.height = decoded[0].bitmap.displayHeight;
          canvas.getContext('2d').drawImage(decoded[0].bitmap, 0, 0);
        }
        decoder.close();
      } else {
        // fallback: img 태그로 표시 (컨트롤 불가)
        setFrames([]);
        setTotalDuration(0);
      }
    } catch (err) {
      console.error(err);
      setFrames([]);
    }
    setLoading(false);
  }, []);

  // 애니메이션 루프
  useEffect(() => {
    if (!frames.length) return;
    const interval = 1000 / fps;

    const loop = (time) => {
      if (!isPlayingRef.current) return;
      if (time - lastTimeRef.current >= interval) {
        const next = (curFrameRef.current + 1) % frames.length;
        curFrameRef.current = next;
        setCurFrame(next);
        lastTimeRef.current = time;

        if (canvasRef.current && frames[next]) {
          canvasRef.current.getContext('2d').drawImage(frames[next].bitmap, 0, 0);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(rafRef.current);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, fps, frames]);

  const goToFrame = (n) => {
    const f = Math.max(0, Math.min(frames.length - 1, n));
    curFrameRef.current = f;
    setCurFrame(f);
    if (canvasRef.current && frames[f]) {
      canvasRef.current.getContext('2d').drawImage(frames[f].bitmap, 0, 0);
    }
  };

  const handleFile = (file) => {
    if (!file?.type.includes('webp') && !file?.name.endsWith('.webp')) { alert('.webp 파일만 지원합니다'); return; }
    decodeWebp(file);
  };

  const noDecoder = webpUrl && !loading && !frames.length;
  const hasFrames = frames.length > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20, gap: 16 }}>
      {!webpUrl ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, border: `2px dashed ${dragOver ? '#7c3aed' : '#2a2a2a'}`, borderRadius: 16, background: dragOver ? '#1e103040' : 'transparent', transition: 'all 0.2s' }}
        >
          <div style={{ fontSize: 48 }}>▶️</div>
          <div style={{ fontSize: 14, color: '#666' }}>WebP 파일을 드래그하세요</div>
          <label style={{ background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            파일 선택
            <input type="file" accept=".webp,image/webp" onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
          </label>
        </div>
      ) : (
        <>
          {/* 프리뷰 영역 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', borderRadius: 12, overflow: 'hidden', position: 'relative', minHeight: 200 }}>
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, border: '3px solid #333', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 12, color: '#555' }}>프레임 디코딩 중...</span>
              </div>
            )}
            {noDecoder && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img src={webpUrl} alt="webp" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                <div style={{ position: 'absolute', bottom: 12, fontSize: 10, color: '#555', background: '#1a1a1a', padding: '4px 10px', borderRadius: 6 }}>
                  프레임 컨트롤은 Chrome에서만 지원됩니다
                </div>
              </div>
            )}
            {hasFrames && !loading && (
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
            )}
          </div>

          {/* 컨트롤 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {hasFrames && (
              <>
                {/* 시크바 */}
                <div
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    goToFrame(Math.round(pct * (frames.length - 1)));
                  }}
                  style={{ height: 6, background: '#1e1e1e', borderRadius: 3, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                >
                  <div style={{ height: '100%', width: `${((curFrame) / Math.max(1, frames.length - 1)) * 100}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: 3, transition: 'width 0.05s' }} />
                </div>

                {/* 재생 컨트롤 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => goToFrame(curFrame - 1)} style={{ ...btnStyle }}>◀</button>
                  <button onClick={() => { const p = !isPlaying; setIsPlaying(p); isPlayingRef.current = p; }} style={{ ...btnStyle, background: isPlaying ? '#7c3aed22' : '#1a1a1a', border: `1px solid ${isPlaying ? '#7c3aed' : '#333'}`, color: isPlaying ? '#a78bfa' : '#888', minWidth: 60 }}>
                    {isPlaying ? '⏸ 정지' : '▶ 재생'}
                  </button>
                  <button onClick={() => goToFrame(curFrame + 1)} style={{ ...btnStyle }}>▶</button>
                  <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{curFrame + 1} / {frames.length}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[12, 24, 30].map(v => <Chip key={v} active={fps === v} onClick={() => setFps(v)}>{v}fps</Chip>)}
                  </div>
                </div>
              </>
            )}

            {/* 파일 정보 + 교체 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag>{webpName}</Tag>
              {hasFrames && <Tag>{frames.length}프레임</Tag>}
              {totalDuration > 0 && <Tag>{totalDuration.toFixed(2)}s</Tag>}
              <div style={{ flex: 1 }} />
              <label style={{ fontSize: 10, color: '#555', cursor: 'pointer', padding: '4px 10px', border: '1px solid #2a2a2a', borderRadius: 6 }}>
                다른 파일
                <input type="file" accept=".webp,image/webp" onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const btnStyle = { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#888', padding: '5px 10px', cursor: 'pointer', fontSize: 12 };

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'png', label: '🖼 PNG 시퀀스 → WebP' },
  { id: 'lottie', label: '🎬 Lottie → WebP' },
  { id: 'player', label: '▶ WebP 플레이어' },
];

export default function LottieConverter({ onClose }) {
  const [tab, setTab] = useState('png');

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111', color: '#eee', display: 'flex', flexDirection: 'column', fontFamily: 'Space Mono, monospace', zIndex: 200 }}>
      {/* 헤더 */}
      <div style={{ height: 52, background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #333', borderRadius: 7, color: '#888', padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>
          ← 돌아가기
        </button>
        <div style={{ width: 1, height: 20, background: '#2a2a2a' }} />
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? '#7c3aed22' : 'none', border: `1px solid ${tab === t.id ? '#7c3aed' : 'transparent'}`, borderRadius: 7, color: tab === t.id ? '#a78bfa' : '#555', padding: '5px 14px', cursor: 'pointer', fontSize: 11, fontWeight: tab === t.id ? 700 : 400, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {tab === 'png' && <PngToWebp />}
        {tab === 'lottie' && <LottieToWebp />}
        {tab === 'player' && <WebpPlayer />}
      </div>
    </div>
  );
}
