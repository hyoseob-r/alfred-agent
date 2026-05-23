import { useState, useRef, useEffect, useCallback } from "react";
import { streamChatAPI } from "../api/proxy";

const MAX_ITER = 3;

// ── Three.js iframe HTML ──────────────────────────────────────────────────────
function buildThreeHtml(code) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #111827; overflow: hidden; }
  canvas { display: block; }
  #info { position: absolute; top: 8px; left: 8px; font-size: 10px; color: rgba(255,255,255,0.35); font-family: monospace; pointer-events: none; line-height: 1.6; }
  #status { position: absolute; bottom: 8px; right: 8px; font-size: 10px; color: rgba(255,255,255,0.25); font-family: monospace; }
</style>
</head>
<body>
<div id="info">드래그: 회전<br>스크롤: 줌<br>우클릭: 이동</div>
<div id="status">렌더링 중...</div>
<script src="https://unpkg.com/three@0.134.0/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.134.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://unpkg.com/three@0.134.0/examples/js/exporters/GLTFExporter.js"></script>
<script>
(function() {
  'use strict';

  // 애니메이션 제어 — RAF를 가로채서 일시정지/재개
  var __rafAnimating = true;
  var __lastRafCb = null;
  var __origRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(cb) {
    __lastRafCb = cb;
    if (!__rafAnimating) return -1;
    return __origRAF(cb);
  };

  try {
    // ─── 사용자 생성 코드 시작 ───
${code}
    // ─── 사용자 생성 코드 끝 ───

    document.getElementById('status').textContent = '완료';

    // 2.5초 후 자동 캡처 (검증용)
    setTimeout(function() {
      try {
        var r = window.renderer, s = window.__threeScene || window.scene, c = window.camera;
        if (r && s && c) r.render(s, c);
        var cv = document.querySelector('canvas');
        window.parent.postMessage({ type: 'three-capture', dataUrl: cv ? cv.toDataURL('image/png') : null }, '*');
      } catch(e) {
        window.parent.postMessage({ type: 'three-capture', error: String(e) }, '*');
      }
    }, 2500);

  } catch(e) {
    document.getElementById('status').textContent = '오류: ' + e.message;
    document.body.style.background = '#2a0000';
    var errEl = document.createElement('div');
    errEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ff6b6b;font-family:monospace;font-size:12px;text-align:center;padding:20px;max-width:80%;white-space:pre-wrap;';
    errEl.textContent = '렌더링 오류\\n' + e.message;
    document.body.appendChild(errEl);
    window.parent.postMessage({ type: 'three-error', error: e.message }, '*');
  }

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    var d = e.data;

    // 애니메이션 토글
    if (d.type === 'toggle-animation') {
      __rafAnimating = !__rafAnimating;
      if (__rafAnimating && __lastRafCb) {
        var cb = __lastRafCb;
        __origRAF(function resume(t) { cb(t); });
      }
      window.parent.postMessage({ type: 'animation-state', animating: __rafAnimating }, '*');
    }

    // PNG 캡처 (일반)
    if (d.type === 'request-capture') {
      try {
        var r = window.renderer, s = window.__threeScene || window.scene, c = window.camera;
        if (r && s && c) r.render(s, c);
        var cv = document.querySelector('canvas');
        window.parent.postMessage({ type: 'capture-manual', dataUrl: cv ? cv.toDataURL('image/png') : null }, '*');
      } catch(e) { window.parent.postMessage({ type: 'capture-manual', dataUrl: null }, '*'); }
    }

    // PNG 캡처 (투명 배경)
    if (d.type === 'request-capture-transparent') {
      try {
        var r = window.renderer, s = window.__threeScene || window.scene, c = window.camera;
        if (r && s && c) {
          var prevColor = r.getClearColor(new THREE.Color()).getHex();
          var prevAlpha = r.getClearAlpha();
          r.setClearColor(0x000000, 0);
          r.render(s, c);
          var cv = document.querySelector('canvas');
          var dataUrl = cv ? cv.toDataURL('image/png') : null;
          r.setClearColor(prevColor, prevAlpha);
          r.render(s, c);
          window.parent.postMessage({ type: 'capture-transparent', dataUrl: dataUrl }, '*');
        } else {
          window.parent.postMessage({ type: 'capture-transparent', dataUrl: null }, '*');
        }
      } catch(e) { window.parent.postMessage({ type: 'capture-transparent', dataUrl: null }, '*'); }
    }

    // 머테리얼 업데이트
    if (d.type === 'set-material') {
      try {
        var props = d.props;
        var sc = window.__threeScene || window.scene;
        if (!sc) return;
        sc.traverse(function(obj) {
          if (!obj.isMesh || !obj.material) return;
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function(mat) {
            if (props.color !== undefined) mat.color.set(props.color);
            if (props.metalness !== undefined && mat.metalness !== undefined) mat.metalness = +props.metalness;
            if (props.roughness !== undefined && mat.roughness !== undefined) mat.roughness = +props.roughness;
            if (props.opacity !== undefined) { mat.opacity = +props.opacity; mat.transparent = +props.opacity < 1; }
            if (props.wireframe !== undefined) mat.wireframe = !!props.wireframe;
            mat.needsUpdate = true;
          });
        });
        // 정지 상태일 때 수동 렌더
        if (!__rafAnimating) {
          var r = window.renderer, s = window.__threeScene || window.scene, c = window.camera;
          if (r && s && c) r.render(s, c);
        }
      } catch(e) {}
    }

    // GLTF 내보내기
    if (d.type === 'request-gltf') {
      try {
        var exporter = new THREE.GLTFExporter();
        var sc = window.__threeScene || window.scene;
        if (!sc) { window.parent.postMessage({ type: 'gltf-error', message: 'scene 없음' }, '*'); return; }
        exporter.parse(sc, function(result) {
          var blob = result instanceof ArrayBuffer
            ? new Blob([result], { type: 'application/octet-stream' })
            : new Blob([JSON.stringify(result)], { type: 'application/json' });
          var reader = new FileReader();
          reader.onload = function() { window.parent.postMessage({ type: 'gltf-ready', data: reader.result }, '*'); };
          reader.readAsDataURL(blob);
        }, { binary: false });
      } catch(e) { window.parent.postMessage({ type: 'gltf-error', message: e.message }, '*'); }
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
- THREE.OrbitControls 사용 가능 (별도 CDN 로드됨)

❌ 절대 사용 금지 (기본 번들에 없어 런타임 오류 발생):
  THREE.RoomEnvironment, THREE.PMREMGenerator 환경맵,
  THREE.EffectComposer/RenderPass/UnrealBloomPass 등 후처리,
  THREE.GLTFLoader/OBJLoader 등 로더,
  THREE.Sky, THREE.Water, THREE.Reflector 등 examples 전용 클래스

✅ 사용 가능한 것만:
  Geometry: Box, Sphere, Cylinder, Torus, TorusKnot, Cone, Plane, Ring, Tube, Lathe, Shape, Extrude, BufferGeometry
  Material: MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial, MeshBasicMaterial, MeshToonMaterial
  Light: AmbientLight, DirectionalLight, PointLight, SpotLight, HemisphereLight
  기타: Scene, PerspectiveCamera, WebGLRenderer, Mesh, Group, Object3D, Color, Vector3, Euler, Quaternion

반드시 포함 (이 순서대로, 변수명 동일하게):
  var scene = new THREE.Scene();
  window.__threeScene = scene;
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(0x111827, 1);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  // 조명 최소 2개:
  var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  var dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7.5);
  dirLight.castShadow = true;
  scene.add(dirLight);
  // 카메라 위치 (오브젝트 크기에 맞게 조정):
  camera.position.set(0, 1.5, 5);
  camera.lookAt(0, 0, 0);
  // 애니메이션 루프:
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  // 리사이즈:
  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

- 오브젝트를 scene 중심(0,0,0) 근처에 배치
- MeshStandardMaterial 우선 사용 (metalness/roughness로 재질감 표현)
- 기하형태 조합으로 설명한 오브젝트를 최대한 유사하게 구현
- JS 코드만 반환 (HTML/마크다운/설명/코드블록 없음)
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
  let systemText = `[검증 ${iter}/${MAX_ITER}회차] Three.js 렌더링 결과를 분석해 주세요.\n\n원본 설명: ${prompt}\n\n현재 코드:\n\`\`\`js\n${currentCode.slice(0, 5000)}\n\`\`\``;
  if (capturedDataUrl) systemText += "\n\n렌더링 결과:";
  content.push({ type: "text", text: systemText });
  if (capturedDataUrl) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: capturedDataUrl.replace(/^data:image\/png;base64,/, "") } });
  }
  if (referenceImage) {
    const isJpeg = referenceImage.includes("data:image/jpeg") || referenceImage.includes("data:image/jpg");
    content.push({ type: "text", text: "\n목표 참고 이미지:" });
    content.push({ type: "image", source: { type: "base64", media_type: isJpeg ? "image/jpeg" : "image/png", data: referenceImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, "") } });
  }
  content.push({ type: "text", text: `\n분석:\n1. 설명과의 차이 항목별 나열 (형태·색상·비율·재질)\n${referenceImage ? "2. 참고 이미지와의 형태 유사도 평가\n" : ""}- 차이 없으면 마지막 줄에 DONE 만 작성\n- 차이 있으면 수정된 전체 JS 코드만 반환 (마크다운 없음)` });

  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content }],
  }, (delta) => { full += delta; onChunk?.(delta, full); });

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
  if (!code.includes("renderer") && !code.includes("scene")) return { done: true, code: currentCode, analysis: text };
  return { done: false, code, analysis };
}

// ── 슬라이더 행 ──────────────────────────────────────────────────────────────
function MatRow({ label, type, value, onChange, min = 0, max = 1, step = 0.01 }) {
  const ROW = { display: "flex", alignItems: "center", gap: "10px", padding: "5px 14px" };
  const LABEL = { fontSize: "11px", color: "#888", minWidth: "68px", flexShrink: 0 };
  return (
    <div style={ROW}>
      <span style={LABEL}>{label}</span>
      {type === "color" && (
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: "36px", height: "24px", border: "none", background: "transparent", cursor: "pointer", padding: 0 }} />
      )}
      {type === "bool" && (
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
          style={{ width: "16px", height: "16px", accentColor: "#a080e0", cursor: "pointer" }} />
      )}
      {type === "range" && (
        <>
          <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "#a080e0", cursor: "pointer" }} />
          <span style={{ fontSize: "11px", color: "#666", minWidth: "32px", textAlign: "right" }}>{Number(value).toFixed(2)}</span>
        </>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ThreeJSRenderer({ prompt, referenceImage: initRefImage }) {
  // 생성 상태
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState("");
  const [code, setCode] = useState("");
  const [threeHtml, setThreeHtml] = useState("");
  const [capturedImg, setCapturedImg] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [genIter, setGenIter] = useState(0);
  const [error, setError] = useState("");
  const [renderKey, setRenderKey] = useState(0);

  // UI 상태
  const [isAnimating, setIsAnimating] = useState(true);
  const [showMatPanel, setShowMatPanel] = useState(false);
  const [matProps, setMatProps] = useState({ color: "#ffffff", metalness: 0.5, roughness: 0.5, opacity: 1.0, wireframe: false });
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 검증 상태
  const [manualRefImage, setManualRefImage] = useState(initRefImage || null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyLog, setVerifyLog] = useState("");
  const [showVerifyLog, setShowVerifyLog] = useState(false);
  const [verifyIters, setVerifyIters] = useState([]);

  // Refs
  const runRef = useRef(false);
  const timerRef = useRef(null);
  const iframeRef = useRef(null);
  const captureResolverRef = useRef(null);   // three-capture (자동)
  const manualCaptureRef = useRef(null);     // capture-manual
  const transpCaptureRef = useRef(null);     // capture-transparent
  const refImgInputRef = useRef(null);

  const sendToIframe = useCallback((msg) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // postMessage 수신
  useEffect(() => {
    const handler = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === "three-capture" && captureResolverRef.current) {
        captureResolverRef.current(d.dataUrl || null);
        captureResolverRef.current = null;
      }
      if (d.type === "three-error") {
        if (captureResolverRef.current) { captureResolverRef.current(null); captureResolverRef.current = null; }
      }
      if (d.type === "capture-manual" && manualCaptureRef.current) {
        manualCaptureRef.current(d.dataUrl || null);
        manualCaptureRef.current = null;
      }
      if (d.type === "capture-transparent" && transpCaptureRef.current) {
        transpCaptureRef.current(d.dataUrl || null);
        transpCaptureRef.current = null;
      }
      if (d.type === "gltf-ready") {
        const a = document.createElement("a"); a.href = d.data; a.download = "object.gltf"; a.click();
      }
      if (d.type === "animation-state") setIsAnimating(d.animating);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // 머테리얼 변경 → iframe 전송
  useEffect(() => {
    if (status === "done") sendToIframe({ type: "set-material", props: matProps });
  }, [matProps, status, sendToIframe]);

  // 캡처 대기 유틸
  const waitFor = (ref, timeout = 5000) => new Promise(resolve => {
    ref.current = resolve;
    setTimeout(() => { if (ref.current) { ref.current(null); ref.current = null; } }, timeout);
  });

  // ── 생성 실행 ──────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setStatus("running"); setError(""); setCode(""); setThreeHtml(""); setCapturedImg(null);
    setVerifyLog(""); setVerifyIters([]); setGenIter(0); setElapsed(0); setIsAnimating(true);
    const startTime = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      // 1. 코드 생성
      setPhase("generate");
      let currentCode = await generateThreeCode(prompt, (partial) => {
        setCode(partial.replace(/^```[\w]*\n?/i, ""));
      });
      setCode(currentCode);

      // 2. iframe 렌더링
      setPhase("render");
      const html = buildThreeHtml(currentCode);
      setThreeHtml(html);
      setRenderKey(k => k + 1);

      // 3. 자동 캡처 대기
      setPhase("capture");
      const captured = await waitFor(captureResolverRef, 6000);
      if (captured) setCapturedImg(captured);

      // 4. 초기 검증 루프 (참고 이미지가 있을 때만)
      if (initRefImage && captured) {
        let capForVerify = captured;
        for (let i = 1; i <= MAX_ITER; i++) {
          setGenIter(i); setPhase("verify");
          setVerifyLog(prev => prev + `▶ 검증 ${i}/${MAX_ITER}회차 분석 중...\n`);
          const result = await verifyAndFix(prompt, currentCode, capForVerify, initRefImage, i, (delta, full) => {
            setVerifyLog(prev => {
              const ls = prev.split("\n");
              const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
              if (hi >= 0) return ls.slice(0, hi + 1).join("\n") + "\n" + full;
              return prev + full;
            });
          });
          const summary = result.analysis || (result.done ? "✅ 수정 불필요" : "🔧 코드 수정 완료");
          setVerifyLog(prev => {
            const ls = prev.split("\n");
            const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
            const hdr = result.done ? `✅ 검증 ${i}/${MAX_ITER}회차` : `🔧 검증 ${i}/${MAX_ITER}회차`;
            if (hi >= 0) return ls.slice(0, hi).join("\n") + (hi > 0 ? "\n" : "") + hdr + "\n" + summary + "\n";
            return prev;
          });
          setVerifyIters(prev => [...prev, { iteration: i, done: result.done }]);
          if (result.done) break;
          currentCode = result.code; setCode(currentCode);
          setThreeHtml(buildThreeHtml(currentCode)); setRenderKey(k => k + 1);
          setPhase("capture");
          const newCap = await waitFor(captureResolverRef, 6000);
          if (newCap) { setCapturedImg(newCap); capForVerify = newCap; }
        }
      }

      setPhase("done"); setStatus("done");
    } catch (e) {
      setError(e.message || "알 수 없는 오류"); setStatus("error");
    } finally {
      runRef.current = false;
      clearInterval(timerRef.current);
    }
  }, [prompt, initRefImage]);

  useEffect(() => { if (status === "idle" && prompt) run(); }, []);

  // ── 수동 검증 ──────────────────────────────────────────────────────────────
  const runVerify = useCallback(async () => {
    if (isVerifying || !manualRefImage) return;
    setIsVerifying(true); setVerifyLog(""); setShowVerifyLog(true); setVerifyIters([]);
    let currentCode = code;

    for (let i = 1; i <= MAX_ITER; i++) {
      // 현재 프레임 캡처
      sendToIframe({ type: "request-capture" });
      const captured = await waitFor(manualCaptureRef, 4000);

      setVerifyLog(prev => prev + `▶ 검증 ${i}/${MAX_ITER}회차 분석 중...\n`);
      const result = await verifyAndFix(prompt, currentCode, captured, manualRefImage, i, (delta, full) => {
        setVerifyLog(prev => {
          const ls = prev.split("\n");
          const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
          if (hi >= 0) return ls.slice(0, hi + 1).join("\n") + "\n" + full;
          return prev + full;
        });
      });
      const summary = result.analysis || (result.done ? "✅ 수정 불필요" : "🔧 코드 수정 완료");
      setVerifyLog(prev => {
        const ls = prev.split("\n");
        const hi = ls.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
        const hdr = result.done ? `✅ 검증 ${i}/${MAX_ITER}회차` : `🔧 검증 ${i}/${MAX_ITER}회차`;
        if (hi >= 0) return ls.slice(0, hi).join("\n") + (hi > 0 ? "\n" : "") + hdr + "\n" + summary + "\n";
        return prev;
      });
      setVerifyIters(prev => [...prev, { iteration: i, done: result.done }]);
      if (result.done) break;
      currentCode = result.code; setCode(currentCode);
      setThreeHtml(buildThreeHtml(currentCode)); setRenderKey(k => k + 1);
      const newCap = await waitFor(captureResolverRef, 6000);
      if (newCap) setCapturedImg(newCap);
    }
    setIsVerifying(false);
  }, [code, prompt, manualRefImage, isVerifying, sendToIframe]);

  // ── 내보내기 ──────────────────────────────────────────────────────────────
  const exportPNG = async (transparent = false) => {
    sendToIframe({ type: transparent ? "request-capture-transparent" : "request-capture" });
    const dataUrl = await waitFor(transparent ? transpCaptureRef : manualCaptureRef, 4000);
    if (!dataUrl) return;
    const a = document.createElement("a"); a.href = dataUrl;
    a.download = transparent ? "object-transparent.png" : "object.png"; a.click();
  };
  const exportGLTF = () => sendToIframe({ type: "request-gltf" });
  const toggleAnimation = () => sendToIframe({ type: "toggle-animation" });
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  const handleRefImgUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setManualRefImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── 스타일 상수 ──────────────────────────────────────────────────────────
  const C = {
    border: "1px solid #1e2530",
    bg: "#0d1117",
    bgMid: "#12121e",
    text: "#a080e0",
    textDim: "#555",
  };
  const btn = (accent = false, small = false) => ({
    padding: small ? "4px 10px" : "5px 14px",
    background: accent ? "#1e1e3e" : "transparent",
    border: `1px solid ${accent ? "#3a3a6e" : "#2a2a3e"}`,
    borderRadius: "12px", fontSize: "11px",
    color: accent ? "#a080e0" : "#555",
    cursor: "pointer", fontWeight: accent ? 600 : 400,
  });

  // ── 상태 바 ───────────────────────────────────────────────────────────────
  const PHASE_LABELS = {
    generate: "코드 생성 중", render: "장면 렌더링 중",
    capture: "캡처 대기", verify: "검증 분석 중", done: "완료",
  };

  // ── iframe ────────────────────────────────────────────────────────────────
  const iframeNode = threeHtml ? (
    <iframe
      key={renderKey}
      ref={iframeRef}
      srcDoc={threeHtml}
      style={{ width: "100%", height: "420px", border: "none", display: "block", background: "#111827" }}
      sandbox="allow-scripts"
      title="3D Preview"
    />
  ) : null;

  return (
    <div style={{ border: C.border, borderRadius: "12px", overflow: "hidden", background: C.bg, fontFamily: "'Pretendard', sans-serif" }}>

      {/* 헤더 */}
      <div style={{ padding: "10px 16px", background: C.bgMid, borderBottom: C.border, display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: C.text }}>🎲 3D 오브젝트</span>
        <span style={{ fontSize: "11px", color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt}</span>
      </div>

      {/* 상태 바 */}
      {status === "running" && (
        <div style={{ padding: "10px 16px", background: C.bg, borderBottom: C.border, display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.text, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
          </div>
          <span style={{ fontSize: "12px", color: C.text, fontWeight: 600 }}>
            {{ generate: "⚙️", render: "🎲", capture: "📸", verify: "🔍", done: "✅" }[phase] || "⏳"} {PHASE_LABELS[phase] || phase}
          </span>
          <span style={{ fontSize: "11px", color: "#333", marginLeft: "auto" }}>
            {elapsed > 0 && `${elapsed}s`}
            {genIter > 0 && phase === "verify" && ` · ${genIter}/${MAX_ITER}회차`}
          </span>
        </div>
      )}

      {/* 오류 */}
      {status === "error" && (
        <div style={{ padding: "14px 16px", color: "#ff6b6b", fontSize: "12px", background: "#1a0000", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>❌ {error}</span>
          <button onClick={() => { runRef.current = false; run(); }} style={{ ...btn(true), color: "#ff8888", borderColor: "#660000" }}>다시 시도</button>
        </div>
      )}

      {/* 3D 뷰포트 */}
      {threeHtml && (
        <div style={{ position: "relative" }}>
          {iframeNode}

          {/* 뷰포트 오버레이 버튼들 */}
          <div style={{ position: "absolute", top: "8px", right: "8px", display: "flex", gap: "6px" }}>
            <button
              onClick={toggleAnimation}
              title={isAnimating ? "일시정지" : "재생"}
              style={{ padding: "4px 10px", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", fontSize: "11px", color: "#ccc", cursor: "pointer", backdropFilter: "blur(6px)" }}
            >
              {isAnimating ? "⏸" : "▶"}
            </button>
            <button
              onClick={() => setExpanded(true)}
              title="전체화면"
              style={{ padding: "4px 10px", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", fontSize: "11px", color: "#ccc", cursor: "pointer", backdropFilter: "blur(6px)" }}
            >
              ⤢
            </button>
          </div>
        </div>
      )}

      {/* 머테리얼 패널 */}
      {status === "done" && showMatPanel && (
        <div style={{ borderTop: C.border, background: "#0a0a14" }}>
          <div style={{ padding: "6px 14px 2px", fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "0.1em" }}>머테리얼 설정</div>
          <MatRow label="색상" type="color" value={matProps.color} onChange={v => setMatProps(p => ({ ...p, color: v }))} />
          <MatRow label="메탈릭" type="range" value={matProps.metalness} onChange={v => setMatProps(p => ({ ...p, metalness: v }))} />
          <MatRow label="거칠기" type="range" value={matProps.roughness} onChange={v => setMatProps(p => ({ ...p, roughness: v }))} />
          <MatRow label="불투명도" type="range" value={matProps.opacity} onChange={v => setMatProps(p => ({ ...p, opacity: v }))} />
          <MatRow label="와이어프레임" type="bool" value={matProps.wireframe} onChange={v => setMatProps(p => ({ ...p, wireframe: v }))} />
          <div style={{ height: "8px" }} />
        </div>
      )}

      {/* 검증 로그 */}
      {verifyLog && showVerifyLog && (
        <div style={{ background: "#0a0a14", borderTop: C.border }}>
          <div style={{ padding: "5px 14px", fontSize: "9px", fontWeight: 700, color: C.textDim, letterSpacing: "0.1em" }}>
            검증 로그 {isVerifying && <span style={{ color: "#f0a000" }}>⏳</span>}
          </div>
          <pre style={{ margin: 0, padding: "8px 14px 12px", fontSize: "11px", color: "#6a8fa6", overflow: "auto", maxHeight: "180px", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}>
            {verifyLog}
          </pre>
        </div>
      )}

      {/* 검증 패널 (수동 참고 이미지 업로드) */}
      {status === "done" && (
        <div style={{ borderTop: C.border, background: "#0a0a14", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: C.textDim, letterSpacing: "0.1em", marginRight: "2px" }}>🔍 검증</span>

          {/* 참고 이미지 */}
          {manualRefImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <img src={manualRefImage} alt="ref" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "6px", border: "1px solid #2a2a3e" }} />
              <button onClick={() => setManualRefImage(null)} style={{ ...btn(false, true), fontSize: "10px", color: "#664" }}>✕</button>
            </div>
          ) : (
            <button onClick={() => refImgInputRef.current?.click()} style={{ ...btn(false, true), color: "#888" }}>
              📎 참고 이미지 업로드
            </button>
          )}
          <input ref={refImgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleRefImgUpload} />

          <button
            onClick={runVerify}
            disabled={isVerifying || !manualRefImage}
            style={{ ...btn(!!manualRefImage && !isVerifying), opacity: !manualRefImage ? 0.4 : 1, cursor: !manualRefImage ? "default" : "pointer" }}
          >
            {isVerifying ? "분석 중..." : "검증 시작"}
          </button>

          {verifyIters.length > 0 && (
            <div style={{ display: "flex", gap: "4px" }}>
              {verifyIters.map((it, i) => (
                <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: it.done ? "#0d3320" : "#332010", color: it.done ? "#44aa66" : "#aa7030" }}>
                  {it.done ? "✓" : `${it.iteration}차`}
                </span>
              ))}
            </div>
          )}

          {verifyLog && (
            <button onClick={() => setShowVerifyLog(v => !v)} style={{ ...btn(false, true) }}>
              {showVerifyLog ? "로그 숨기기" : "로그"}
            </button>
          )}
        </div>
      )}

      {/* 코드 뷰어 */}
      {showCode && code && (
        <div style={{ padding: "14px", background: "#0a0a14", borderTop: C.border }}>
          <pre style={{ background: C.bg, borderRadius: "10px", padding: "14px", fontSize: "11px", color: "#88aaff", overflow: "auto", maxHeight: "320px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5, border: C.border }}>
            {code}
          </pre>
        </div>
      )}

      {/* 코드 스트리밍 미리보기 (생성 중) */}
      {status === "running" && phase === "generate" && code && (
        <div style={{ padding: "8px 14px 4px", background: "#0a0a14", borderTop: C.border }}>
          <pre style={{ margin: 0, fontSize: "10px", color: "#2a4a6a", maxHeight: "60px", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.4 }}>
            {code.slice(-300)}
          </pre>
        </div>
      )}

      {/* 액션 바 */}
      {status === "done" && (
        <div style={{ padding: "10px 14px", background: C.bgMid, borderTop: C.border, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* 머테리얼 */}
          <button onClick={() => setShowMatPanel(v => !v)} style={{ ...btn(showMatPanel), ...(showMatPanel ? { color: C.text, borderColor: "#3a3a6e" } : {}) }}>
            🎨 머테리얼
          </button>

          <div style={{ width: "1px", height: "16px", background: "#2a2a3e", margin: "0 2px" }} />

          {/* 내보내기 */}
          <button onClick={() => exportPNG(false)} style={btn()}>PNG 저장</button>
          <button onClick={() => exportPNG(true)} style={btn()}>PNG (투명)</button>
          <button onClick={exportGLTF} style={btn()}>GLTF 내보내기</button>

          <div style={{ width: "1px", height: "16px", background: "#2a2a3e", margin: "0 2px" }} />

          {/* 기타 */}
          <button onClick={copy} style={{ ...btn(copied), ...(copied ? { color: "#44aa66", borderColor: "#0d3320" } : {}) }}>
            {copied ? "✓ 복사됨" : "코드 복사"}
          </button>
          <button onClick={() => setShowCode(v => !v)} style={btn()}>
            {showCode ? "코드 숨기기" : "코드 보기"}
          </button>
          <button onClick={() => { runRef.current = false; run(); }} style={btn()}>↺ 재생성</button>
        </div>
      )}

      {/* 전체화면 오버레이 */}
      {expanded && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: C.bg, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", background: C.bgMid, borderBottom: C.border, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: C.text }}>🎲 3D 오브젝트</span>
            <span style={{ fontSize: "11px", color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt}</span>
            <button onClick={() => setExpanded(false)} style={{ ...btn(true), color: C.text }}>✕ 닫기</button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <iframe srcDoc={threeHtml} style={{ width: "100%", height: "100%", border: "none" }} sandbox="allow-scripts" title="3D Full" />
          </div>
        </div>
      )}
    </div>
  );
}
