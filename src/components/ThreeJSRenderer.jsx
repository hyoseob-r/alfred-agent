import { useState, useRef, useEffect, useCallback } from "react";
import { streamChatAPI } from "../api/proxy";

const MAX_ITER = 3;

// ── Three.js iframe HTML 빌드 ──────────────────────────────────────────────────
function buildThreeHtml(code) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #111827; overflow: hidden; }
  canvas { display: block; }
  #info { position: absolute; top: 8px; left: 8px; font-size: 10px; color: rgba(255,255,255,0.4); font-family: monospace; pointer-events: none; }
  #status { position: absolute; bottom: 8px; right: 8px; font-size: 10px; color: rgba(255,255,255,0.3); font-family: monospace; }
</style>
</head>
<body>
<div id="info">드래그: 회전 | 스크롤: 줌 | 우클릭: 이동</div>
<div id="status">렌더링 중...</div>
<script src="https://unpkg.com/three@0.134.0/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.134.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://unpkg.com/three@0.134.0/examples/js/exporters/GLTFExporter.js"></script>
<script>
(function() {
  'use strict';
  try {
    // ─── 사용자 생성 코드 시작 ───
${code}
    // ─── 사용자 생성 코드 끝 ───

    document.getElementById('status').textContent = '완료';

    // 2.5초 후 캔버스 캡처 전송
    setTimeout(function() {
      try {
        var canvas = document.querySelector('canvas');
        if (canvas) {
          var dataUrl = canvas.toDataURL('image/png');
          window.parent.postMessage({ type: 'three-capture', dataUrl: dataUrl }, '*');
        }
      } catch(e) {
        window.parent.postMessage({ type: 'three-capture', error: String(e) }, '*');
      }
    }, 2500);

  } catch(e) {
    document.getElementById('status').textContent = '오류: ' + e.message;
    document.body.style.background = '#2a0000';
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff6b6b;font-family:monospace;font-size:12px;text-align:center;padding:20px;';
    el.textContent = '렌더링 오류\\n' + e.message;
    document.body.appendChild(el);
    window.parent.postMessage({ type: 'three-error', error: e.message }, '*');
  }

  // GLTF 내보내기 요청 처리
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'request-gltf') return;
    try {
      var exporter = new THREE.GLTFExporter();
      var sceneToExport = window.__threeScene || window.scene;
      if (!sceneToExport) {
        window.parent.postMessage({ type: 'gltf-error', message: 'scene 변수를 찾을 수 없습니다.' }, '*');
        return;
      }
      exporter.parse(sceneToExport, function(result) {
        var blob;
        if (result instanceof ArrayBuffer) {
          blob = new Blob([result], { type: 'application/octet-stream' });
        } else {
          blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
        }
        var reader = new FileReader();
        reader.onload = function() {
          window.parent.postMessage({ type: 'gltf-ready', data: reader.result }, '*');
        };
        reader.readAsDataURL(blob);
      }, { binary: false });
    } catch(e) {
      window.parent.postMessage({ type: 'gltf-error', message: e.message }, '*');
    }
  });
})();
</script>
</body>
</html>`;
}

// ── Three.js 코드 생성 ────────────────────────────────────────────────────────
async function generateThreeCode(prompt, onChunk) {
  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `다음 설명에 맞는 3D 오브젝트를 Three.js r134 코드로 구현해 주세요.

설명: ${prompt}

=== 구현 규칙 (반드시 준수) ===
- Three.js r134 기본 번들 (window.THREE)만 사용 — import 금지
- THREE.OrbitControls 사용 가능: new THREE.OrbitControls(camera, renderer.domElement)

❌ 절대 사용 금지 (r134 기본 번들에 없음):
  - THREE.RoomEnvironment, THREE.PMREMGenerator 환경맵 설정
  - THREE.EffectComposer, THREE.RenderPass, THREE.UnrealBloomPass 등 후처리
  - THREE.GLTFLoader, THREE.OBJLoader 등 로더 (CDN 미포함)
  - THREE.Sky, THREE.Water, THREE.Reflector 등 examples 전용 클래스
  → 위 클래스들은 r134 기본 번들에 없어서 런타임 오류 발생

✅ 사용 가능한 것만:
  - THREE.Scene, THREE.PerspectiveCamera, THREE.WebGLRenderer
  - THREE.Mesh, THREE.Group, THREE.Object3D
  - 지오메트리: BoxGeometry, SphereGeometry, CylinderGeometry, TorusGeometry, TorusKnotGeometry, ConeGeometry, PlaneGeometry, RingGeometry, TubeGeometry, LatheGeometry, ShapeGeometry, ExtrudeGeometry, BufferGeometry
  - 재질: MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial, MeshBasicMaterial, MeshToonMaterial
  - 조명: AmbientLight, DirectionalLight, PointLight, SpotLight, HemisphereLight
  - THREE.Color, THREE.Vector3, THREE.Matrix4, THREE.Euler, THREE.Quaternion
  - THREE.OrbitControls (별도 CDN에서 로드됨)

반드시 포함:
  1. var scene = new THREE.Scene(); window.__threeScene = scene;
  2. var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  3. var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  4. renderer.setSize(window.innerWidth, window.innerHeight);
  5. renderer.setClearColor(0x111827);
  6. document.body.appendChild(renderer.domElement);
  7. var controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  8. 조명 최소 2개: AmbientLight(0xffffff, 0.5) + DirectionalLight(0xffffff, 1.0)
  9. camera.position.z = 5; (오브젝트 크기에 맞게 조정)
  10. function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); } animate();
  11. window.addEventListener('resize', function() { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

- 오브젝트: scene 중심(0,0,0) 근처에 배치
- 재질: MeshStandardMaterial 또는 MeshPhongMaterial 사용 (광택 포함)
- 기하형태 조합으로 설명한 오브젝트를 최대한 유사하게 구현
- JS 코드만 반환 (HTML/마크다운/설명 없음, 코드 블록도 없음)
================================`,
    }],
  }, (delta) => {
    full += delta;
    onChunk(full);
  });

  return full.replace(/^```[\w]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

// ── 검증 + 수정 ───────────────────────────────────────────────────────────────
async function verifyAndFix(prompt, currentCode, capturedDataUrl, referenceImage, iter, onChunk) {
  const content = [];

  let systemText = `[검증 ${iter}/${MAX_ITER}회차] Three.js 렌더링 결과를 분석해 주세요.\n\n원본 설명: ${prompt}\n\n현재 Three.js 코드:\n\`\`\`js\n${currentCode.slice(0, 5000)}\n\`\`\``;
  if (capturedDataUrl) systemText += "\n\n렌더링 결과 스크린샷:";
  content.push({ type: "text", text: systemText });

  if (capturedDataUrl) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: capturedDataUrl.replace(/^data:image\/png;base64,/, "") },
    });
  }

  if (referenceImage) {
    const isJpeg = referenceImage.includes("data:image/jpeg");
    content.push({ type: "text", text: "\n참고 이미지 (목표 형태):" });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: isJpeg ? "image/jpeg" : "image/png",
        data: referenceImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""),
      },
    });
  }

  content.push({
    type: "text",
    text: `\n분석 지침:
1. 설명과 렌더링 결과의 차이를 항목별로 간단히 나열 (형태, 색상, 비율, 재질 등)
${referenceImage ? "2. 참고 이미지와의 형태 유사도도 평가" : ""}
- 차이가 없거나 충분히 유사하면 마지막 줄에 DONE 만 작성
- 차이가 있으면 수정된 전체 JS 코드만 반환 (마크다운 없음)`,
  });

  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content }],
  }, (delta) => {
    full += delta;
    onChunk?.(delta, full);
  });

  const text = full.trim();
  const lines = text.split("\n").map(l => l.trim());
  const hasDone = lines.some(l => l === "DONE" || l.startsWith("DONE"));

  if (hasDone) {
    const doneIdx = lines.findIndex(l => l === "DONE" || l.startsWith("DONE"));
    return { done: true, code: currentCode, analysis: lines.slice(0, doneIdx).join("\n").trim() };
  }

  const codeBlockMatch = text.match(/```[\w]*\n?([\s\S]*?)\n?```/);
  const rawCode = codeBlockMatch ? codeBlockMatch[1] : text;
  const analysis = codeBlockMatch ? text.slice(0, text.indexOf("```")).trim() : "";
  const code = rawCode.trim();

  if (!code.includes("renderer") && !code.includes("scene")) {
    return { done: true, code: currentCode, analysis: text };
  }
  return { done: false, code, analysis };
}

// ── 상태 바 ───────────────────────────────────────────────────────────────────
function StatusBar({ phase, iter, elapsed }) {
  const PHASES = {
    generate: { label: "Three.js 코드 생성 중", icon: "⚙️" },
    render:   { label: "3D 장면 렌더링 중",     icon: "🎲" },
    capture:  { label: "캔버스 캡처 대기 중",    icon: "📸" },
    verify:   { label: "렌더링 검증 중",          icon: "🔍" },
    done:     { label: "완료",                    icon: "✅" },
  };
  const p = PHASES[phase] || { label: phase, icon: "⏳" };
  return (
    <div style={{ padding: "10px 16px", background: "#0d1117", borderBottom: "1px solid #1e2530", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <span style={{ fontSize: "12px", color: "#a080e0", fontWeight: 600 }}>{p.icon} {p.label}</span>
      <span style={{ fontSize: "11px", color: "#444", marginLeft: "auto" }}>
        {elapsed > 0 && `${elapsed}s`}
        {iter > 0 && phase === "verify" && ` · 검증 ${iter}/${MAX_ITER}회차`}
      </span>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ThreeJSRenderer({ prompt, referenceImage }) {
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState("");
  const [code, setCode] = useState("");
  const [threeHtml, setThreeHtml] = useState("");
  const [capturedImg, setCapturedImg] = useState(null);
  const [verifyLog, setVerifyLog] = useState("");
  const [showVerifyLog, setShowVerifyLog] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [iter, setIter] = useState(0);
  const [verifyIters, setVerifyIters] = useState([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const runRef = useRef(false);
  const timerRef = useRef(null);
  const captureResolverRef = useRef(null);

  // iframe → parent postMessage 수신
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "three-capture") {
        if (captureResolverRef.current) {
          captureResolverRef.current(e.data.dataUrl || null);
          captureResolverRef.current = null;
        }
      }
      if (e.data?.type === "three-error") {
        if (captureResolverRef.current) {
          captureResolverRef.current(null);
          captureResolverRef.current = null;
        }
      }
      if (e.data?.type === "gltf-ready") {
        const a = document.createElement("a");
        a.href = e.data.data;
        a.download = "object.gltf";
        a.click();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const waitForCapture = (timeout = 5000) =>
    new Promise((resolve) => {
      captureResolverRef.current = resolve;
      setTimeout(() => {
        if (captureResolverRef.current) {
          captureResolverRef.current(null);
          captureResolverRef.current = null;
        }
      }, timeout);
    });

  const run = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setStatus("running");
    setError("");
    setCode("");
    setThreeHtml("");
    setCapturedImg(null);
    setVerifyLog("");
    setVerifyIters([]);
    setIter(0);
    setElapsed(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      // 1. Three.js 코드 생성
      setPhase("generate");
      let currentCode = await generateThreeCode(prompt, (partial) => {
        setCode(partial.replace(/^```[\w]*\n?/i, ""));
      });
      setCode(currentCode);

      // 2. iframe 렌더링
      setPhase("render");
      const html = buildThreeHtml(currentCode);
      setThreeHtml(html);

      // 3. 캔버스 캡처 대기
      setPhase("capture");
      const captured = await waitForCapture(6000);
      if (captured) setCapturedImg(captured);

      // 4. 검증 루프 (캡처 또는 참고 이미지가 있을 때)
      if (captured || referenceImage) {
        let capForVerify = captured;
        for (let i = 1; i <= MAX_ITER; i++) {
          setIter(i);
          setPhase("verify");
          setVerifyLog(prev => prev + `▶ 검증 ${i}/${MAX_ITER}회차 분석 중...\n`);

          const result = await verifyAndFix(prompt, currentCode, capForVerify, referenceImage, i, (delta, full) => {
            setVerifyLog(prev => {
              const ls = prev.split("\n");
              const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
              if (hi >= 0) return ls.slice(0, hi + 1).join("\n") + "\n" + full;
              return prev + full;
            });
          });

          const summary = result.analysis || (result.done ? "✅ 수정 불필요 — 설명과 일치" : "🔧 차이 발견, 코드 수정 완료");
          setVerifyLog(prev => {
            const ls = prev.split("\n");
            const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
            const header = result.done ? `✅ 검증 ${i}/${MAX_ITER}회차` : `🔧 검증 ${i}/${MAX_ITER}회차`;
            if (hi >= 0) return ls.slice(0, hi).join("\n") + (hi > 0 ? "\n" : "") + header + "\n" + summary + "\n";
            return prev;
          });

          setVerifyIters(prev => [...prev, { iteration: i, done: result.done }]);
          if (result.done) break;

          // 코드 업데이트 + 재렌더링
          currentCode = result.code;
          setCode(currentCode);
          const newHtml = buildThreeHtml(currentCode);
          setThreeHtml(newHtml);

          setPhase("capture");
          const newCap = await waitForCapture(6000);
          if (newCap) {
            setCapturedImg(newCap);
            capForVerify = newCap;
          }
        }
      }

      setPhase("done");
      setStatus("done");
    } catch (e) {
      setError(e.message || "알 수 없는 오류");
      setStatus("error");
    } finally {
      runRef.current = false;
      clearInterval(timerRef.current);
    }
  }, [prompt, referenceImage]);

  // 마운트 시 자동 실행
  useEffect(() => {
    if (status === "idle" && prompt) run();
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const rerun = () => {
    runRef.current = false;
    run();
  };

  const iframeEl = threeHtml ? (
    <iframe
      key={threeHtml.length} // html 바뀌면 iframe 리마운트
      srcDoc={threeHtml}
      style={{ width: "100%", height: "420px", border: "none", display: "block", background: "#111827" }}
      sandbox="allow-scripts"
      title="3D Preview"
    />
  ) : null;

  return (
    <div style={{ border: "1px solid #2a2a3e", borderRadius: "12px", overflow: "hidden", background: "#0d1117", fontFamily: "'Pretendard', sans-serif" }}>
      {/* 헤더 */}
      <div style={{ padding: "10px 16px", background: "#12121e", borderBottom: "1px solid #1e2530", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#a080e0" }}>🎲 3D 오브젝트</span>
        <span style={{ fontSize: "11px", color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt}</span>
      </div>

      {/* 상태 바 */}
      {status === "running" && <StatusBar phase={phase} iter={iter} elapsed={elapsed} />}

      {/* 오류 */}
      {status === "error" && (
        <div style={{ padding: "16px", color: "#ff6b6b", fontSize: "12px", background: "#1a0000", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>❌ {error}</span>
          <button onClick={rerun} style={{ padding: "3px 10px", background: "#330000", border: "1px solid #660000", borderRadius: "8px", color: "#ff8888", fontSize: "11px", cursor: "pointer" }}>다시 시도</button>
        </div>
      )}

      {/* 3D 프리뷰 */}
      {threeHtml && (
        <div style={{ position: "relative" }}>
          {iframeEl}
          <button
            onClick={() => setExpanded(true)}
            title="전체화면으로 보기"
            style={{ position: "absolute", top: "8px", right: "8px", padding: "4px 10px", background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", fontSize: "10px", color: "#aaa", cursor: "pointer", backdropFilter: "blur(6px)" }}
          >
            ⤢ 크게 보기
          </button>
          {status === "running" && phase === "capture" && (
            <div style={{ position: "absolute", bottom: "8px", left: "8px", fontSize: "10px", color: "rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: "6px" }}>
              캡처 대기 중...
            </div>
          )}
        </div>
      )}

      {/* 참고 이미지 + 캡처 비교 */}
      {status === "done" && (referenceImage || capturedImg) && (
        <div style={{ display: "flex", borderTop: "1px solid #1e2530", background: "#0a0a14" }}>
          {capturedImg && (
            <div style={{ flex: 1, borderRight: referenceImage ? "1px solid #1e2530" : "none" }}>
              <div style={{ padding: "4px 10px", fontSize: "9px", fontWeight: 700, color: "#555", letterSpacing: "0.1em" }}>렌더 결과</div>
              <img src={capturedImg} alt="captured" style={{ width: "100%", display: "block", maxHeight: "120px", objectFit: "contain", background: "#111827" }} />
            </div>
          )}
          {referenceImage && (
            <div style={{ flex: 1 }}>
              <div style={{ padding: "4px 10px", fontSize: "9px", fontWeight: 700, color: "#555", letterSpacing: "0.1em" }}>참고 이미지</div>
              <img src={referenceImage} alt="reference" style={{ width: "100%", display: "block", maxHeight: "120px", objectFit: "contain", background: "#1a1a2e" }} />
            </div>
          )}
        </div>
      )}

      {/* 검증 상태 + 액션 바 */}
      {status === "done" && (
        <div style={{ padding: "10px 14px", background: "#12121e", borderTop: "1px solid #1e2530", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: "#666" }}>
            {verifyIters.length === 0
              ? "생성 완료"
              : verifyIters.every(it => it.done)
                ? `✅ ${verifyIters.length}회 검증 — 수정 없음`
                : `🔧 ${verifyIters.length}회 검증 — 코드 수정됨`}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            {verifyIters.map((it, i) => (
              <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: it.done ? "#0d3320" : "#332010", color: it.done ? "#44aa66" : "#aa7030" }}>
                {it.done ? "✓" : `${it.iteration}차`}
              </span>
            ))}
          </div>
          {verifyLog && (
            <button onClick={() => setShowVerifyLog(v => !v)} style={{ padding: "4px 10px", background: "transparent", border: "1px solid #2a2a3e", borderRadius: "10px", fontSize: "10px", color: "#666", cursor: "pointer" }}>
              {showVerifyLog ? "로그 숨기기" : "검증 로그"}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            <button onClick={copy} style={{ padding: "5px 14px", background: copied ? "#0d3320" : "#1e1e3e", border: `1px solid ${copied ? "#44aa66" : "#3a3a6e"}`, borderRadius: "12px", fontSize: "11px", color: copied ? "#44aa66" : "#a080e0", cursor: "pointer", fontWeight: 600 }}>
              {copied ? "✓ 복사됨" : "코드 복사"}
            </button>
            <button onClick={() => setShowCode(v => !v)} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #2a2a3e", borderRadius: "12px", fontSize: "11px", color: "#555", cursor: "pointer" }}>
              {showCode ? "코드 숨기기" : "코드 보기"}
            </button>
            <button onClick={rerun} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #2a2a3e", borderRadius: "12px", fontSize: "11px", color: "#555", cursor: "pointer" }}>
              ↺ 재생성
            </button>
          </div>
        </div>
      )}

      {/* 검증 로그 */}
      {verifyLog && showVerifyLog && (
        <div style={{ background: "#0a0a14", borderTop: "1px solid #1e2530" }}>
          <pre style={{ margin: 0, padding: "12px 14px", fontSize: "11px", color: "#7a8fa6", overflow: "auto", maxHeight: "220px", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}>
            {verifyLog}
          </pre>
        </div>
      )}

      {/* 코드 뷰어 */}
      {showCode && code && (
        <div style={{ padding: "14px", background: "#0a0a14", borderTop: "1px solid #1e2530" }}>
          <pre style={{ background: "#0d1117", borderRadius: "10px", padding: "14px", fontSize: "11px", color: "#88aaff", overflow: "auto", maxHeight: "320px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5, border: "1px solid #1e2530" }}>
            {code}
          </pre>
        </div>
      )}

      {/* 코드 생성 중 스트리밍 뷰 */}
      {status === "running" && phase === "generate" && code && (
        <div style={{ padding: "14px", background: "#0a0a14", borderTop: "1px solid #1e2530" }}>
          <pre style={{ background: "transparent", margin: 0, fontSize: "10px", color: "#4a6a8a", overflow: "hidden", maxHeight: "80px", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
            {code.slice(-400)}
          </pre>
        </div>
      )}

      {/* 전체화면 오버레이 */}
      {expanded && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#0d1117", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", background: "#12121e", borderBottom: "1px solid #1e2530", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#a080e0" }}>🎲 3D 오브젝트</span>
            <span style={{ fontSize: "11px", color: "#555", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt}</span>
            <button onClick={() => setExpanded(false)} style={{ padding: "5px 14px", background: "#1e1e3e", border: "1px solid #3a3a6e", borderRadius: "8px", fontSize: "12px", color: "#a080e0", cursor: "pointer", fontWeight: 700 }}>
              ✕ 닫기
            </button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <iframe srcDoc={threeHtml} style={{ width: "100%", height: "100%", border: "none" }} sandbox="allow-scripts" title="3D Full" />
          </div>
        </div>
      )}
    </div>
  );
}
