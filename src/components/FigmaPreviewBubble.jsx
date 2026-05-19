import { useState, useEffect, useRef } from "react";
import { chatAPIMultimodal } from "../api/proxy";

const FIGMA_TOKEN_KEY = "figma_pat";
const MAX_ITER = 3;

// ── URL 파싱 ──────────────────────────────────────────────────────────────────
function parseFigmaUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.findIndex(p => p === "design" || p === "file");
    if (idx < 0) return null;
    const fileKey = parts[idx + 1];
    const rawNode = u.searchParams.get("node-id");
    const nodeId = rawNode ? rawNode.replace(/-/g, ":") : null;
    return fileKey ? { fileKey, nodeId } : null;
  } catch { return null; }
}

// ── 이미지 압축 (Claude API body 크기 제한 대응) ─────────────────────────────
// srcType: "png" | "jpeg" — 입력 이미지 포맷 (기본 png)
function resizeToJpeg(base64, maxWidth = 800, quality = 0.82, srcType = "png") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => reject(new Error("이미지 변환 실패"));
    img.src = `data:image/${srcType};base64,${base64}`;
  });
}

// ── html2canvas 동적 로드 ─────────────────────────────────────────────────────
async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://html2canvas.hertzen.com/dist/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error("html2canvas 로드 실패"));
    document.head.appendChild(s);
  });
}

// ── Figma 원본 → base64 ───────────────────────────────────────────────────────
async function fetchFigmaBase64(fileKey, nodeId, token) {
  const resp = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!resp.ok) throw new Error(`Figma API ${resp.status} — 토큰을 확인해 주세요.`);
  const data = await resp.json();
  if (data.err) throw new Error(`Figma: ${data.err}`);
  const imgUrl = data.images?.[nodeId];
  if (!imgUrl) throw new Error("Figma 이미지 URL을 받지 못했습니다.");

  const imgResp = await fetch(imgUrl);
  const blob = await imgResp.blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// ── 렌더링 → 스크린샷 base64 ─────────────────────────────────────────────────
async function screenshotHtml(htmlCode) {
  const h2c = await loadHtml2Canvas();

  // <html><head>...</head><body>...</body></html> → body 내용 + style 태그만 추출
  const doc = document.implementation.createHTMLDocument("");
  doc.documentElement.innerHTML = htmlCode;
  const styleContent = Array.from(doc.querySelectorAll("style"))
    .map(s => s.outerHTML).join("\n");
  const linkTags = Array.from(doc.querySelectorAll("link[rel='stylesheet']"))
    .map(l => l.outerHTML).join("\n");
  const bodyHtml = doc.body.innerHTML;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:fixed;left:-9999px;top:0;width:390px;background:#f5f5f5;overflow:hidden;";
  wrapper.innerHTML = linkTags + styleContent + bodyHtml;
  document.body.appendChild(wrapper);

  await new Promise(r => setTimeout(r, 500)); // 폰트/이미지 로딩 대기

  try {
    const canvas = await h2c(wrapper, {
      width: 390,
      useCORS: true,
      allowTaint: true,
      scale: 1,
      logging: false,
    });
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally {
    document.body.removeChild(wrapper);
  }
}

// ── Claude 멀티모달 비교 + 수정 ───────────────────────────────────────────────
async function compareAndFix(figmaB64, renderedB64, currentHtml, iter) {
  const [fJpeg, rJpeg] = await Promise.all([
    resizeToJpeg(figmaB64, 800, 0.82, "png"),
    resizeToJpeg(renderedB64, 800, 0.82, "jpeg"),
  ]);

  const result = await chatAPIMultimodal({
    model: "claude-sonnet-4-6",
    max_tokens: 5000,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `[검증 ${iter}/${MAX_ITER}회차] Figma 원본(이미지 1)과 현재 렌더링(이미지 2)을 비교해 주세요.

시각적 차이(간격·색상·타이포그래피·크기·정렬·보더·그림자)를 분석하고:
- 차이가 없거나 미미하면 첫 줄에 DONE 만 작성
- 차이가 있으면 수정된 전체 HTML만 반환 (설명·마크다운 없음)

현재 HTML:
${currentHtml}`,
        },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fJpeg } },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: rJpeg } },
      ],
    }],
  });

  const text = (result.content?.[0]?.text || "").trim();
  if (text.startsWith("DONE")) return { done: true, html: currentHtml };

  let html = text.replace(/^```html?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Claude가 HTML 대신 오류 텍스트를 반환한 경우 기존 HTML 유지
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    return { done: true, html: currentHtml };
  }
  return { done: false, html };
}

// ── 초기 HTML 생성 (Figma 이미지 참조) ───────────────────────────────────────
async function generateInitialHtml(figmaB64) {
  const jpeg = await resizeToJpeg(figmaB64, 800, 0.82, "png");
  const result = await chatAPIMultimodal({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `이 Figma 디자인을 self-contained HTML로 구현해 주세요.

규칙:
- DOCTYPE html부터 시작하는 완전한 단일 HTML 파일
- Pretendard 폰트: <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
- 모든 스타일 <style> 태그 사용
- 한국어 현실적 콘텐츠
- body { margin: 0; padding: 16px; background: #f5f5f5; font-family: 'Pretendard', sans-serif; }
- 이미지: https://picsum.photos/{w}/{h}?random={n}
- HTML 코드만 반환, 마크다운 없음`,
        },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg } },
      ],
    }],
  });

  const text = (result.content?.[0]?.text || "").trim();
  const html = text.replace(/^```html?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    throw new Error(`HTML 생성 실패: ${html.slice(0, 100)}`);
  }
  return html;
}

// ── 상태 표시 바 ──────────────────────────────────────────────────────────────
const PHASES = {
  figma:    { label: "Figma 원본 읽기",      icon: "🎨" },
  generate: { label: "초기 컴포넌트 생성",   icon: "⚙️" },
  render:   { label: "렌더링 캡처",          icon: "📸" },
  compare:  { label: "Claude 시각 비교",     icon: "🔍" },
  done:     { label: "검증 완료",            icon: "✅" },
};

function StatusBar({ phase, iteration }) {
  const p = PHASES[phase] || {};
  return (
    <div style={{ padding: "10px 16px", background: "#fafafa", borderBottom: "1px solid #eeeeee", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
      </div>
      <span style={{ fontSize: "12px", color: "#7740c8", fontWeight: 600 }}>{p.icon} {p.label}</span>
      {iteration > 0 && phase !== "done" && (
        <span style={{ fontSize: "11px", color: "#aaaaaa", marginLeft: "auto" }}>검증 {iteration}/{MAX_ITER}회차</span>
      )}
    </div>
  );
}

// ── 최종 프리뷰 ───────────────────────────────────────────────────────────────
function PreviewResult({ figmaB64, htmlCode, iterations, onRerun }) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const converged = iterations[iterations.length - 1]?.done;

  return (
    <div>
      {/* 검증 결과 배지 */}
      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #eeeeee", background: converged ? "#f0fff4" : "#fffbf0" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: converged ? "#338833" : "#b07000" }}>
          {converged ? `✅ ${iterations.length}회 검증 후 수렴` : `⚠ ${MAX_ITER}회 검증 후 종료 (차이 남음)`}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          {iterations.map((it, i) => (
            <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: it.done ? "#d0f0d8" : "#ffe8d0", color: it.done ? "#337733" : "#a06020" }}>
              {it.done ? "✓" : `${it.iteration}차`}
            </span>
          ))}
        </div>
      </div>

      {/* 프리뷰 */}
      <div style={{ display: "flex", borderBottom: "1px solid #eeeeee" }}>
        {figmaB64 && (
          <div style={{ flex: 1, borderRight: "1px solid #eeeeee", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 700, color: "#9970d8", background: "#faf8ff", borderBottom: "1px solid #eeeeee", letterSpacing: "0.1em" }}>FIGMA 원본</div>
            <img src={`data:image/png;base64,${figmaB64}`} alt="Figma" style={{ width: "100%", display: "block" }} />
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 700, color: "#448844", background: "#f8fff8", borderBottom: "1px solid #eeeeee", letterSpacing: "0.1em" }}>렌더링 결과</div>
          <iframe
            srcDoc={htmlCode}
            style={{ flex: 1, width: "100%", minHeight: "360px", border: "none", display: "block" }}
            sandbox="allow-scripts"
            title="Figma preview"
          />
        </div>
      </div>

      {/* 액션바 */}
      <div style={{ padding: "10px 14px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={copy} style={{ padding: "5px 14px", background: copied ? "#f0fff4" : "#f5f5f5", border: `1px solid ${copied ? "#88cc88" : "#dddddd"}`, borderRadius: "12px", fontSize: "11px", color: copied ? "#338833" : "#555", cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>
          {copied ? "✓ 복사됨" : "코드 복사"}
        </button>
        <button onClick={() => setShowCode(v => !v)} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777", cursor: "pointer" }}>
          {showCode ? "코드 숨기기" : "코드 보기"}
        </button>
        <button onClick={onRerun} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777", cursor: "pointer" }}>
          ↺ 재실행
        </button>
      </div>

      {showCode && (
        <div style={{ padding: "0 14px 14px" }}>
          <pre style={{ background: "#111111", borderRadius: "10px", padding: "14px", fontSize: "11px", color: "#88ff88", overflow: "auto", maxHeight: "320px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
            {htmlCode}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function FigmaPreviewBubble({ url }) {
  const [status, setStatus] = useState("idle");  // idle | running | done | error
  const [phase, setPhase] = useState("");
  const [iteration, setIteration] = useState(0);
  const [figmaB64, setFigmaB64] = useState(null);
  const [htmlCode, setHtmlCode] = useState("");
  const [iterations, setIterations] = useState([]);
  const [error, setError] = useState("");

  const parsed = parseFigmaUrl(url);
  const runRef = useRef(false);

  const run = async () => {
    const tok = localStorage.getItem(FIGMA_TOKEN_KEY) || "";
    if (runRef.current) return;
    runRef.current = true;
    setStatus("running");
    setError("");
    setIterations([]);
    setFigmaB64(null);
    setHtmlCode("");
    setIteration(0);

    try {
      if (!tok) throw new Error("Figma Personal Access Token이 필요합니다.");
      if (!parsed?.nodeId) throw new Error("URL에 node-id가 없습니다.\nFigma에서 컴포넌트를 선택한 후 URL을 복사해 주세요.");

      // 1. Figma 원본
      setPhase("figma");
      const fb64 = await fetchFigmaBase64(parsed.fileKey, parsed.nodeId, tok);
      setFigmaB64(fb64);

      // 2. 초기 HTML 생성
      setPhase("generate");
      let html = await generateInitialHtml(fb64);
      setHtmlCode(html);

      // 3. 검증 루프
      for (let i = 1; i <= MAX_ITER; i++) {
        setIteration(i);

        setPhase("render");
        const rb64 = await screenshotHtml(html);

        setPhase("compare");
        const result = await compareAndFix(fb64, rb64, html, i);

        setIterations(prev => [...prev, { iteration: i, done: result.done }]);

        if (result.done) break;
        html = result.html;
        setHtmlCode(html);
      }

      setPhase("done");
      setStatus("done");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    } finally {
      runRef.current = false;
    }
  };

  // 토큰 있고 nodeId 있으면 자동 시작
  useEffect(() => {
    const tok = localStorage.getItem(FIGMA_TOKEN_KEY) || "";
    if (tok && parsed?.nodeId) run();
  }, []);

  return (
    <div style={{ margin: "0 0 20px 0", background: "#ffffff", border: "1px solid #e0d8f4", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 12px rgba(120,80,200,0.07)" }}>

      {/* 헤더 */}
      <div style={{ padding: "11px 16px", background: "linear-gradient(135deg, #f5f0ff 0%, #ede8ff 100%)", borderBottom: "1px solid #e0d8f4", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "15px" }}>🎨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#7740c8", letterSpacing: "0.1em" }}>FIGMA → 자동 검증 프리뷰</div>
          <div style={{ fontSize: "11px", color: "#9a70d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>{url}</div>
        </div>
      </div>

      {/* node-id 없음 경고 */}
      {!parsed?.nodeId && status === "idle" && (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#cc8844", lineHeight: 1.8 }}>
            ⚠ URL에 node-id가 없습니다.<br />
            Figma에서 컴포넌트를 <strong>선택</strong>한 후 URL을 복사해 주세요.
          </div>
        </div>
      )}

      {/* 실행 중 */}
      {status === "running" && (
        <div>
          <StatusBar phase={phase} iteration={iteration} />
          {htmlCode && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #eeeeee" }}>
              <div style={{ fontSize: "10px", color: "#aaaaaa", marginBottom: "6px" }}>현재 생성 중...</div>
              <iframe
                srcDoc={htmlCode}
                style={{ width: "100%", height: "300px", border: "1px solid #eeeeee", borderRadius: "8px", display: "block" }}
                sandbox="allow-scripts"
                title="preview in progress"
              />
            </div>
          )}
          {!htmlCode && (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: "5px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 완료 */}
      {status === "done" && (
        <PreviewResult
          figmaB64={figmaB64}
          htmlCode={htmlCode}
          iterations={iterations}
          onRerun={() => { setStatus("idle"); runRef.current = false; run(); }}
        />
      )}

      {/* 에러 */}
      {status === "error" && (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#cc4444", lineHeight: 1.8, marginBottom: "6px", whiteSpace: "pre-wrap" }}>{error}</div>
          {error.includes("토큰") && (
            <div style={{ fontSize: "11px", color: "#888888", marginBottom: "14px" }}>
              상단 헤더의 <strong>🎨 Figma</strong> 버튼에서 토큰을 설정/변경해 주세요.
            </div>
          )}
          <button
            onClick={() => { setStatus("idle"); runRef.current = false; run(); }}
            style={{ padding: "7px 18px", background: "#f5f5f5", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", cursor: "pointer" }}
          >
            ↺ 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
