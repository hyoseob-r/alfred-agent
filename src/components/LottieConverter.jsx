import { useState, useEffect, useRef, useCallback } from 'react';
import { convertLottieToWebp } from '../lib/lottieToWebp';

let _lottie = null;
async function getLottie() {
  if (_lottie) return _lottie;
  const mod = await import('lottie-web');
  _lottie = mod.default;
  return _lottie;
}

function Tag({ children }) {
  return <span style={{ padding: '2px 8px', background: '#1e1e1e', border: '1px solid #333', borderRadius: 5, fontSize: 11, color: '#888' }}>{children}</span>;
}
function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}
function ChipBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${active ? '#7c3aed' : '#333'}`, background: active ? '#7c3aed22' : '#1a1a1a', color: active ? '#a78bfa' : '#666', fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 400, transition: 'all 0.15s' }}>
      {children}
    </button>
  );
}

export default function LottieConverter({ onClose }) {
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
    getLottie().then(lottieLib => {
      const a = lottieLib.loadAnimation({
        container: previewRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: JSON.parse(JSON.stringify(file.data)),
      });
      animRef.current = a;
    });
    return () => { if (animRef.current) { animRef.current.destroy(); animRef.current = null; } };
  }, [file]);

  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.layers) throw new Error('Lottie JSON 형식이 아닙니다.');
          const ip = data.ip ?? 0, op = data.op ?? 60, fr = data.fr || 30;
          setFile({ type: 'json', data, name: f.name, info: { w: data.w, h: data.h, fps: fr, frames: Math.round(op - ip), duration: ((op - ip) / fr).toFixed(2), layers: data.layers?.length || 0 } });
          setWebpUrl(null);
        } catch (err) { alert('Lottie JSON 파싱 실패: ' + err.message); }
      };
      reader.readAsText(f);
    } else if (ext === 'webp' || f.type === 'image/webp') {
      setFile({ type: 'webp', url: URL.createObjectURL(f), name: f.name, size: f.size });
      setWebpUrl(null);
    } else {
      alert('.json (Lottie) 또는 .webp 파일만 지원합니다.');
    }
  }, []);

  const handleConvert = async () => {
    if (!file?.data || converting) return;
    setConverting(true); setProgress(0); setWebpUrl(null);
    try {
      const buffer = await convertLottieToWebp(file.data, { fps, scale, bgColor }, (p) => setProgress(Math.round(p * 100)));
      const blob = new Blob([buffer], { type: 'image/webp' });
      setWebpSize(blob.size);
      setWebpUrl(URL.createObjectURL(blob));
    } catch (err) { alert('변환 실패: ' + err.message); }
    setConverting(false);
  };

  const handleDownload = () => {
    if (!webpUrl) return;
    const a = document.createElement('a');
    a.href = webpUrl;
    a.download = (file.name || 'animation').replace(/\.json$/i, '') + '.webp';
    a.click();
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const onFileInput = (e) => { handleFile(e.target.files[0]); e.target.value = ''; };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111', color: '#eee', display: 'flex', flexDirection: 'column', fontFamily: 'Space Mono, monospace', zIndex: 200 }}>
      {/* 헤더 */}
      <div style={{ height: 52, background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #333', borderRadius: 7, color: '#888', padding: '5px 12px', cursor: 'pointer', fontSize: 11 }}>
          ← 돌아가기
        </button>
        <div style={{ width: 1, height: 20, background: '#2a2a2a' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: 12, color: '#fff', letterSpacing: '0.05em' }}>LOTTIE → WEBP 컨버터</span>
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ background: '#7c3aed', border: 'none', borderRadius: 7, color: '#fff', padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
          + 파일 열기
          <input type="file" accept=".json,.webp,image/webp" onChange={onFileInput} style={{ display: 'none' }} />
        </label>
      </div>

      {/* 바디 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {!file ? (
          <div
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, margin: 40, border: `2px dashed ${dragOver ? '#7c3aed' : '#2a2a2a'}`, borderRadius: 20, background: dragOver ? '#1e103040' : 'transparent', transition: 'all 0.2s' }}
          >
            <div style={{ fontSize: 52 }}>🎬</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#888' }}>JSON 또는 WebP 파일을 드래그하세요</div>
            <div style={{ fontSize: 11, color: '#444', textAlign: 'center', lineHeight: 1.8 }}>
              .json — Lottie 애니메이션 (변환 + 미리보기)<br />
              .webp — WebP 이미지/애니메이션 (미리보기)
            </div>
            <label style={{ marginTop: 4, background: '#7c3aed', border: 'none', borderRadius: 10, color: '#fff', padding: '10px 28px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              파일 선택
              <input type="file" accept=".json,.webp,image/webp" onChange={onFileInput} style={{ display: 'none' }} />
            </label>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* 좌: 미리보기 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1e1e', padding: '20px', gap: 14, overflow: 'hidden' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.1em' }}>
                {file.type === 'json' ? '🎬 LOTTIE JSON 미리보기' : '🖼 WEBP 미리보기'}
              </div>
              <div
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                style={{ flex: 1, borderRadius: 12, overflow: 'hidden', background: '#0d0d0d', border: `1px solid ${dragOver ? '#7c3aed' : '#1e1e1e'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, position: 'relative', transition: 'border-color 0.2s' }}
              >
                {file.type === 'json' ? (
                  <div ref={previewRef} style={{ width: '100%', height: '100%', minHeight: 280 }} />
                ) : (
                  <img src={file.url} alt="webp preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                )}
                {dragOver && (
                  <div style={{ position: 'absolute', inset: 0, background: '#1e103080', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
                    <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>파일 교체</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag>{file.name}</Tag>
                {file.type === 'json' && file.info && (<>
                  <Tag>{file.info.w}×{file.info.h}px</Tag>
                  <Tag>{file.info.fps}fps</Tag>
                  <Tag>{file.info.frames}프레임</Tag>
                  <Tag>{file.info.duration}s</Tag>
                  <Tag>{file.info.layers}레이어</Tag>
                </>)}
                {file.type === 'webp' && <Tag>{(file.size / 1024).toFixed(1)}KB</Tag>}
              </div>
            </div>

            {/* 우: 설정 + 결과 */}
            <div style={{ width: 280, flexShrink: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              {file.type === 'json' ? (<>
                <Section title="출력 설정">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#666', width: 60, flexShrink: 0 }}>FPS</span>
                    <div style={{ display: 'flex', gap: 4 }}>{[15, 24, 30].map(v => <ChipBtn key={v} active={fps === v} onClick={() => setFps(v)}>{v}</ChipBtn>)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#666', width: 60, flexShrink: 0 }}>스케일</span>
                    <div style={{ display: 'flex', gap: 4 }}>{[0.5, 1, 2].map(v => <ChipBtn key={v} active={scale === v} onClick={() => setScale(v)}>{v}x</ChipBtn>)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#666', width: 60, flexShrink: 0 }}>배경색</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {['#ffffff', '#000000', 'transparent'].map(c => (
                        <div key={c} onClick={() => setBgColor(c)} style={{ width: 20, height: 20, borderRadius: 4, cursor: 'pointer', border: `2px solid ${bgColor === c ? '#7c3aed' : '#333'}`, background: c === 'transparent' ? 'repeating-conic-gradient(#444 0% 25%,#222 0% 50%) 0 0/8px 8px' : c, transition: 'border-color 0.15s' }} />
                      ))}
                    </div>
                  </div>
                  {file.info && (
                    <div style={{ fontSize: 10, color: '#444', marginTop: 2, lineHeight: 1.8 }}>
                      출력: {Math.round(file.info.w * scale)}×{Math.round(file.info.h * scale)}px · {Math.ceil(parseFloat(file.info.duration) * fps)}프레임
                    </div>
                  )}
                </Section>

                <button
                  onClick={handleConvert} disabled={converting}
                  style={{ width: '100%', padding: '12px 0', background: converting ? '#1e1e1e' : '#7c3aed', border: 'none', borderRadius: 10, color: converting ? '#555' : '#fff', fontSize: 13, fontWeight: 700, cursor: converting ? 'default' : 'pointer', transition: 'background 0.2s' }}
                >
                  {converting ? '변환 중...' : '🔄 WebP로 변환'}
                </button>

                {converting && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 6 }}>
                      <span>프레임 렌더링</span><span>{progress}%</span>
                    </div>
                    <div style={{ height: 5, background: '#1e1e1e', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: 3, transition: 'width 0.15s' }} />
                    </div>
                  </div>
                )}

                {webpUrl && !converting && (
                  <Section title="변환 완료 ✅">
                    <img src={webpUrl} alt="converted" style={{ width: '100%', borderRadius: 8, border: '1px solid #1e1e1e', background: '#0d0d0d' }} />
                    <div style={{ fontSize: 10, color: '#555', textAlign: 'right' }}>{(webpSize / 1024).toFixed(1)}KB</div>
                    <button onClick={handleDownload} style={{ width: '100%', padding: '10px 0', background: '#065f46', border: '1px solid #059669', borderRadius: 10, color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ⬇ WebP 다운로드
                    </button>
                  </Section>
                )}
              </>) : (
                <Section title="WebP 파일">
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                    <div>{file.name}</div>
                    {file.size && <div>{(file.size / 1024).toFixed(1)}KB</div>}
                    <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>애니메이션 WebP는 자동으로 재생됩니다.</div>
                  </div>
                </Section>
              )}

              <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #1e1e1e' }}>
                <label style={{ display: 'block', textAlign: 'center', padding: '8px 0', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 9, color: '#555', fontSize: 11, cursor: 'pointer' }}>
                  📁 다른 파일 열기
                  <input type="file" accept=".json,.webp,image/webp" onChange={onFileInput} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
