import { useState, useEffect, useRef } from "react";
import { chatAPI, streamChatAPI } from "../api/proxy";

const FIGMA_TOKEN_KEY = "figma_pat";
const MAX_ITER = 2;

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

// ── Figma 이미지 URL (표시용 — 다운로드/인코딩 없음) ─────────────────────────
async function fetchFigmaImageUrl(fileKey, nodeId, token) {
  const resp = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!resp.ok) throw new Error(`Figma API ${resp.status} — 토큰을 확인해 주세요.`);
  const data = await resp.json();
  if (data.err) throw new Error(`Figma: ${data.err}`);
  const imgUrl = data.images?.[nodeId];
  if (!imgUrl) throw new Error("Figma 이미지 URL을 받지 못했습니다.");
  return imgUrl;
}

// ── Figma 노드 구조 데이터 가져오기 ──────────────────────────────────────────
async function fetchFigmaNodeData(fileKey, nodeId, token) {
  const resp = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!resp.ok) throw new Error(`Figma 노드 API ${resp.status}`);
  const data = await resp.json();
  const nodes = data.nodes;
  if (!nodes) throw new Error("Figma 노드 데이터 없음");
  const nodeKey = Object.keys(nodes)[0];
  return nodes[nodeKey]?.document;
}

// ── RGBA 색상 → hex/rgba ──────────────────────────────────────────────────────
function colorStr(c) {
  if (!c) return "transparent";
  const r = Math.round((c.r || 0) * 255);
  const g = Math.round((c.g || 0) * 255);
  const b = Math.round((c.b || 0) * 255);
  const a = c.a !== undefined ? c.a : 1;
  if (a >= 0.99) return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

// ── Figma 노드 → 디자인 스펙 텍스트 (Claude 프롬프트용) ──────────────────────
function nodeToSpec(node, depth = 0) {
  if (!node || depth > 5) return "";
  const indent = "  ".repeat(depth);
  const lines = [];

  const bb = node.absoluteBoundingBox;
  const size = bb ? ` (${Math.round(bb.width)}×${Math.round(bb.height)}px)` : "";
  lines.push(`${indent}[${node.type}] "${node.name}"${size}`);

  // 레이아웃
  if (node.layoutMode && node.layoutMode !== "NONE") {
    const dir = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    const pad = node.paddingTop !== undefined
      ? ` padding:${node.paddingTop}/${node.paddingRight}/${node.paddingBottom}/${node.paddingLeft}px` : "";
    const gap = node.itemSpacing ? ` gap:${Math.round(node.itemSpacing)}px` : "";
    const main = node.primaryAxisAlignItems ? ` mainAxis:${node.primaryAxisAlignItems}` : "";
    const cross = node.counterAxisAlignItems ? ` crossAxis:${node.counterAxisAlignItems}` : "";
    lines.push(`${indent}  flex:${dir}${pad}${gap}${main}${cross}`);
  }

  // 배경색
  const solidFills = (node.fills || []).filter(f => f.visible !== false && f.type === "SOLID");
  if (solidFills.length) lines.push(`${indent}  background:${solidFills.map(f => colorStr(f.color)).join(", ")}`);

  // 테두리
  const solidStrokes = (node.strokes || []).filter(s => s.type === "SOLID");
  if (solidStrokes.length) lines.push(`${indent}  border:${solidStrokes.map(s => `${colorStr(s.color)} ${node.strokeWeight || 1}px`).join(", ")}`);

  // 모서리 반경
  if (node.cornerRadius) lines.push(`${indent}  borderRadius:${node.cornerRadius}px`);

  // 그림자
  (node.effects || []).filter(e => e.visible !== false && e.type === "DROP_SHADOW").forEach(e => {
    lines.push(`${indent}  shadow:${e.offset?.x || 0}px ${e.offset?.y || 0}px ${e.radius || 0}px ${colorStr(e.color)}`);
  });

  // 텍스트
  if (node.type === "TEXT") {
    const s = node.style || {};
    lines.push(`${indent}  text:"${(node.characters || "").slice(0, 80)}"`);
    lines.push(`${indent}  font:${s.fontFamily || "unknown"} weight:${s.fontWeight || 400} size:${s.fontSize || 14}px`);
    if (s.lineHeightPx) lines.push(`${indent}  lineHeight:${Math.round(s.lineHeightPx)}px`);
    if (s.letterSpacing) lines.push(`${indent}  letterSpacing:${s.letterSpacing}px`);
    const textColor = solidFills[0];
    if (textColor) lines.push(`${indent}  color:${colorStr(textColor.color)}`);
    if (s.textAlignHorizontal) lines.push(`${indent}  textAlign:${s.textAlignHorizontal}`);
  }

  // 자식 노드 재귀
  (node.children || []).forEach(child => {
    const childSpec = nodeToSpec(child, depth + 1);
    if (childSpec) lines.push(childSpec);
  });

  return lines.join("\n");
}

// ── 초기 HTML 생성 (프록시 스트리밍 — 크레딧 없음) ───────────────────────────
async function generateInitialHtml(spec, onChunk) {
  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `다음 Figma 디자인 스펙을 self-contained HTML로 구현해 주세요.

=== Figma 디자인 스펙 ===
${spec}
=========================

구현 규칙:
- <!DOCTYPE html>부터 시작하는 완전한 단일 HTML 파일
- Pretendard 폰트: <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
- 스펙의 색상·크기·폰트·간격을 최대한 정확하게 구현
- 모든 스타일은 <style> 태그 사용
- 한국어 현실적 콘텐츠 (스펙의 text 내용 그대로 사용)
- body { margin: 0; padding: 16px; background: #f5f5f5; font-family: 'Pretendard', sans-serif; }
- 이미지 플레이스홀더: https://picsum.photos/{w}/{h}?random={n}
- HTML 코드만 반환, 마크다운·설명 없음`,
    }],
  }, (delta) => {
    full += delta;
    onChunk(full);
  });

  const html = full.replace(/^```html?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    throw new Error(`HTML 생성 실패: ${html.slice(0, 200)}`);
  }
  return html;
}

// ── 스펙 기반 비교/수정 (프록시 — 크레딧 없음) ───────────────────────────────
async function compareAndFix(spec, currentHtml, iter) {
  const result = await chatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `[검증 ${iter}/${MAX_ITER}회차] Figma 스펙과 현재 HTML을 비교해 주세요.

=== Figma 원본 스펙 ===
${spec}
======================

=== 현재 HTML ===
${currentHtml.slice(0, 8000)}
================

스펙과의 차이(색상·폰트·크기·간격·정렬·보더·그림자)를 분석하고:
- 차이가 없거나 미미하면 첫 줄에 DONE 만 작성
- 차이가 있으면 수정된 전체 HTML만 반환 (설명·마크다운 없음)`,
    }],
  });

  const text = (result.content?.[0]?.text || "").trim();
  if (text.startsWith("DONE")) return { done: true, html: currentHtml };

  let html = text.replace(/^```html?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    return { done: true, html: currentHtml };
  }
  return { done: false, html };
}

// ── 상태 표시 바 ──────────────────────────────────────────────────────────────
const PHASES = {
  figma:    { label: "Figma 디자인 읽기",    icon: "🎨" },
  generate: { label: "HTML 컴포넌트 생성",   icon: "⚙️" },
  compare:  { label: "스펙 대조 검증",       icon: "🔍" },
  done:     { label: "완료",                icon: "✅" },
};

function StatusBar({ phase, iteration, elapsed }) {
  const p = PHASES[phase] || {};
  return (
    <div style={{ padding: "10px 16px", background: "#fafafa", borderBottom: "1px solid #eeeeee", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <span style={{ fontSize: "12px", color: "#7740c8", fontWeight: 600 }}>{p.icon} {p.label}</span>
      <span style={{ fontSize: "11px", color: "#bbbbbb", marginLeft: "auto" }}>
        {elapsed > 0 && `${elapsed}s`}
        {iteration > 0 && phase !== "done" && ` · 검증 ${iteration}/${MAX_ITER}회차`}
      </span>
    </div>
  );
}

// ── 완료 결과 ─────────────────────────────────────────────────────────────────
function PreviewResult({ figmaImgUrl, htmlCode, iterations, onRerun }) {
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
      {/* 검증 배지 */}
      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #eeeeee", background: converged ? "#f0fff4" : "#fffbf0" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: converged ? "#338833" : "#b07000" }}>
          {converged ? `✅ ${iterations.length}회 검증 후 수렴` : `⚠ ${MAX_ITER}회 검증 후 종료`}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          {iterations.map((it, i) => (
            <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: it.done ? "#d0f0d8" : "#ffe8d0", color: it.done ? "#337733" : "#a06020" }}>
              {it.done ? "✓" : `${it.iteration}차`}
            </span>
          ))}
        </div>
      </div>

      {/* 원본 vs 결과 */}
      <div style={{ display: "flex", borderBottom: "1px solid #eeeeee" }}>
        {figmaImgUrl && (
          <div style={{ flex: 1, borderRight: "1px solid #eeeeee", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 700, color: "#9970d8", background: "#faf8ff", borderBottom: "1px solid #eeeeee", letterSpacing: "0.1em" }}>FIGMA 원본</div>
            <img src={figmaImgUrl} alt="Figma" style={{ width: "100%", display: "block" }} crossOrigin="anonymous" />
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

      {/* 액션 */}
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
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState("");
  const [iteration, setIteration] = useState(0);
  const [figmaImgUrl, setFigmaImgUrl] = useState(null);
  const [htmlCode, setHtmlCode] = useState("");
  const [iterations, setIterations] = useState([]);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const parsed = parseFigmaUrl(url);
  const runRef = useRef(false);
  const timerRef = useRef(null);

  const run = async () => {
    const tok = localStorage.getItem(FIGMA_TOKEN_KEY) || "";
    if (runRef.current) return;
    runRef.current = true;
    setStatus("running");
    setError("");
    setIterations([]);
    setFigmaImgUrl(null);
    setHtmlCode("");
    setIteration(0);
    setElapsed(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      if (!tok) throw new Error("Figma Personal Access Token이 필요합니다.");
      if (!parsed?.nodeId) throw new Error("URL에 node-id가 없습니다.\nFigma에서 컴포넌트를 선택한 후 URL을 복사해 주세요.");

      // 1. Figma 데이터 로드
      setPhase("figma");
      const [imgUrl, nodeData] = await Promise.all([
        fetchFigmaImageUrl(parsed.fileKey, parsed.nodeId, tok),
        fetchFigmaNodeData(parsed.fileKey, parsed.nodeId, tok),
      ]);
      setFigmaImgUrl(imgUrl);

      const spec = nodeToSpec(nodeData);

      // 2. HTML 생성 (프록시 스트리밍)
      setPhase("generate");
      let html = await generateInitialHtml(spec, (partial) => {
        if (partial.toLowerCase().includes("<!doctype") || partial.toLowerCase().includes("<html")) {
          setHtmlCode(partial.replace(/^```html?\n?/i, ""));
        }
      });
      setHtmlCode(html);

      // 3. 검증 루프
      for (let i = 1; i <= MAX_ITER; i++) {
        setIteration(i);
        setPhase("compare");
        const result = await compareAndFix(spec, html, i);
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
      clearInterval(timerRef.current);
    }
  };

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

      {/* idle */}
      {status === "idle" && (
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "12px", background: "#fffbf0", borderBottom: "1px solid #f0e8cc" }}>
          {!localStorage.getItem(FIGMA_TOKEN_KEY) ? (
            <>
              <span style={{ fontSize: "18px" }}>⚠️</span>
              <div style={{ fontSize: "12px", color: "#a07000", lineHeight: 1.7 }}>
                상단 헤더의 <strong>🎨 Figma</strong> 버튼에서 토큰을 먼저 설정해 주세요.<br />
                설정 후 이 URL을 다시 붙여넣으면 자동으로 시작됩니다.
              </div>
            </>
          ) : !parsed?.nodeId ? (
            <>
              <span style={{ fontSize: "18px" }}>⚠️</span>
              <div style={{ fontSize: "12px", color: "#a07000", lineHeight: 1.7 }}>
                URL에 node-id가 없습니다.<br />
                Figma에서 컴포넌트를 <strong>선택</strong>한 후 URL을 복사해 주세요.
              </div>
            </>
          ) : (
            <button onClick={run} style={{ padding: "8px 20px", background: "#7740c8", border: "none", borderRadius: "16px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              ▶ 시작
            </button>
          )}
        </div>
      )}

      {/* 실행 중 */}
      {status === "running" && (
        <div>
          <StatusBar phase={phase} iteration={iteration} elapsed={elapsed} />
          {htmlCode && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #eeeeee" }}>
              <div style={{ fontSize: "10px", color: "#aaaaaa", marginBottom: "6px" }}>생성 중...</div>
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
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 완료 */}
      {status === "done" && (
        <PreviewResult
          figmaImgUrl={figmaImgUrl}
          htmlCode={htmlCode}
          iterations={iterations}
          onRerun={() => { setStatus("idle"); runRef.current = false; run(); }}
        />
      )}

      {/* 에러 */}
      {status === "error" && (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#cc4444", lineHeight: 1.8, marginBottom: "6px", whiteSpace: "pre-wrap" }}>{error}</div>
          {(error.includes("토큰") || error.includes("Token")) && (
            <div style={{ fontSize: "11px", color: "#888888", marginBottom: "14px" }}>
              상단 헤더의 <strong>🎨 Figma</strong> 버튼에서 토큰을 설정/변경해 주세요.
            </div>
          )}
          {error.includes("프록시") && (
            <div style={{ fontSize: "11px", color: "#888888", marginBottom: "14px" }}>
              우측 상단 프록시 버튼에서 로컬 프록시를 먼저 연결해 주세요.
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
