import { useState } from "react";
import { chatAPI } from "../api/proxy";

const FIGMA_TOKEN_KEY = "figma_pat";

function parseFigmaUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const typeIdx = parts.findIndex(p => p === "design" || p === "file");
    if (typeIdx < 0) return null;
    const fileKey = parts[typeIdx + 1];
    if (!fileKey) return null;
    const rawNodeId = u.searchParams.get("node-id");
    const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ":") : null;
    return { fileKey, nodeId };
  } catch { return null; }
}

async function fetchFigmaImage(fileKey, nodeId, token) {
  if (!token || !nodeId) return null;
  try {
    const resp = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.images?.[nodeId] || null;
  } catch { return null; }
}

function TokenInput({ currentToken, onSave, onCancel }) {
  const [val, setVal] = useState(currentToken);
  return (
    <div style={{ padding: "12px 16px", background: "#fafafa", borderBottom: "1px solid #eeeeee", display: "flex", gap: "8px", alignItems: "center" }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Figma Personal Access Token (figd_...)"
        type="password"
        style={{ flex: 1, padding: "7px 10px", border: "1px solid #cccccc", borderRadius: "8px", fontSize: "12px", outline: "none", background: "#ffffff" }}
        onKeyDown={e => e.key === "Enter" && onSave(val)}
        autoFocus
      />
      <button
        onClick={() => onSave(val)}
        style={{ padding: "6px 14px", background: "#111111", border: "none", borderRadius: "8px", color: "#ffffff", fontSize: "11px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
      >저장</button>
      {currentToken && (
        <button
          onClick={() => onSave("")}
          style={{ padding: "6px 10px", background: "transparent", border: "1px solid #dddddd", borderRadius: "8px", color: "#888888", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}
        >삭제</button>
      )}
      <button
        onClick={onCancel}
        style={{ padding: "6px 10px", background: "transparent", border: "none", color: "#aaaaaa", fontSize: "11px", cursor: "pointer" }}
      >✕</button>
    </div>
  );
}

function PreviewLayout({ figmaImageUrl, htmlCode, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div>
      <div style={{ display: "flex", minHeight: "360px", borderBottom: "1px solid #eeeeee" }}>
        {figmaImageUrl && (
          <div style={{ flex: 1, borderRight: "1px solid #eeeeee", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "7px 12px", fontSize: "10px", fontWeight: 700, color: "#9970d8", letterSpacing: "0.1em", background: "#faf8ff", borderBottom: "1px solid #eeeeee" }}>
              🎨 FIGMA 원본
            </div>
            <div style={{ flex: 1, overflow: "auto", background: "#f0f0f4" }}>
              <img src={figmaImageUrl} alt="Figma design" style={{ width: "100%", display: "block" }} />
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "7px 12px", fontSize: "10px", fontWeight: 700, color: "#448844", letterSpacing: "0.1em", background: "#f8fff8", borderBottom: "1px solid #eeeeee" }}>
            ⚡ 렌더링 결과
          </div>
          <iframe
            srcDoc={htmlCode}
            style={{ flex: 1, width: "100%", border: "none", display: "block", minHeight: "340px" }}
            sandbox="allow-scripts"
            title="Figma component preview"
          />
        </div>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={copyCode}
          style={{ padding: "5px 14px", background: copied ? "#f0fff4" : "#f5f5f5", border: `1px solid ${copied ? "#88cc88" : "#dddddd"}`, borderRadius: "12px", fontSize: "11px", color: copied ? "#338833" : "#555555", cursor: "pointer", transition: "all 0.2s", fontWeight: 600 }}
        >
          {copied ? "✓ 복사됨" : "코드 복사"}
        </button>
        <button
          onClick={() => setShowCode(v => !v)}
          style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777777", cursor: "pointer" }}
        >
          {showCode ? "코드 숨기기" : "코드 보기"}
        </button>
        <button
          onClick={onRegenerate}
          style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777777", cursor: "pointer" }}
        >↺ 재생성</button>
      </div>
      {showCode && (
        <div style={{ padding: "0 14px 14px" }}>
          <pre style={{
            background: "#111111", borderRadius: "10px", padding: "14px", fontSize: "11px",
            color: "#88ff88", overflow: "auto", maxHeight: "320px", margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5,
          }}>
            {htmlCode}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function FigmaPreviewBubble({ url }) {
  const [figmaToken, setFigmaToken] = useState(localStorage.getItem(FIGMA_TOKEN_KEY) || "");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [figmaImageUrl, setFigmaImageUrl] = useState(null);
  const [htmlCode, setHtmlCode] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState("");

  const parsed = parseFigmaUrl(url);

  const saveToken = (token) => {
    setFigmaToken(token);
    if (token) localStorage.setItem(FIGMA_TOKEN_KEY, token);
    else localStorage.removeItem(FIGMA_TOKEN_KEY);
    setShowTokenInput(false);
  };

  const generate = async () => {
    setStatus("loading");
    setHtmlCode("");
    setFigmaImageUrl(null);

    let imgUrl = null;
    let imageHint = "";

    if (parsed?.nodeId && figmaToken) {
      imgUrl = await fetchFigmaImage(parsed.fileKey, parsed.nodeId, figmaToken);
      if (imgUrl) {
        setFigmaImageUrl(imgUrl);
        imageHint = `\n\nFigma 디자인 이미지 URL (참고): ${imgUrl}`;
      }
    }

    const prompt = `다음 Figma URL의 컴포넌트를 self-contained HTML로 구현해 주세요.

Figma URL: ${url}${imageHint}

규칙:
- DOCTYPE html부터 시작하는 완전한 단일 HTML 파일
- 외부 의존성 없음 (Pretendard 폰트 CDN만 허용)
- Pretendard 폰트: <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
- 모든 스타일은 <style> 태그 또는 인라인으로
- 현실적인 한국어 콘텐츠로 채울 것
- 모바일 중심 (max-width: 390px, margin: 0 auto)
- body { margin: 0; padding: 16px; background: #f5f5f5; font-family: 'Pretendard', sans-serif; }
- 이미지 자리: https://picsum.photos/{w}/{h}?random={n} 사용
- HTML 코드만 반환, \`\`\` 없이`;

    try {
      const result = await chatAPI({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });

      let code = result.content?.[0]?.text || "";
      // Strip code block markers if present
      code = code.replace(/^```html?\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      if (!code) throw new Error("빈 응답");
      setHtmlCode(code);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  };

  return (
    <div style={{
      margin: "0 0 20px 0",
      background: "#ffffff",
      border: "1px solid #e0d8f4",
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(120,80,200,0.07)",
    }}>
      {/* Header */}
      <div style={{
        padding: "11px 16px",
        background: "linear-gradient(135deg, #f5f0ff 0%, #ede8ff 100%)",
        borderBottom: "1px solid #e0d8f4",
        display: "flex", alignItems: "center", gap: "10px",
      }}>
        <span style={{ fontSize: "15px" }}>🎨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#7740c8", letterSpacing: "0.1em" }}>FIGMA PREVIEW</div>
          <div style={{ fontSize: "11px", color: "#9a70d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>
            {url}
          </div>
        </div>
        <button
          onClick={() => setShowTokenInput(v => !v)}
          style={{
            padding: "4px 10px",
            background: figmaToken ? "#f0fff4" : "#fff8f0",
            border: `1px solid ${figmaToken ? "#88cc88" : "#f0b060"}`,
            borderRadius: "12px",
            color: figmaToken ? "#338833" : "#b07000",
            fontSize: "10px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
          }}
        >
          {figmaToken ? "✓ 토큰 연결됨" : "토큰 설정"}
        </button>
      </div>

      {/* Token input panel */}
      {showTokenInput && (
        <TokenInput currentToken={figmaToken} onSave={saveToken} onCancel={() => setShowTokenInput(false)} />
      )}

      {/* Idle: generate button */}
      {status === "idle" && (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          {!figmaToken && (
            <div style={{ fontSize: "11px", color: "#aaaaaa", marginBottom: "14px", lineHeight: 1.6 }}>
              Figma 토큰 없이도 생성 가능합니다.<br />
              토큰이 있으면 Figma 원본 디자인도 함께 비교할 수 있습니다.
            </div>
          )}
          {!parsed && (
            <div style={{ fontSize: "11px", color: "#cc8844", marginBottom: "12px" }}>
              ⚠ node-id가 없어 특정 컴포넌트를 정확히 가져오기 어렵습니다.
            </div>
          )}
          <button
            onClick={generate}
            style={{
              padding: "10px 28px",
              background: "linear-gradient(135deg, #7740c8 0%, #5520a8 100%)",
              border: "none", borderRadius: "20px",
              color: "#ffffff", fontSize: "13px", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(120,80,200,0.35)",
            }}
          >
            ⚡ 컴포넌트 생성
          </button>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "5px", marginBottom: "12px" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: "#7740c8",
                animation: "pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
          <div style={{ fontSize: "12px", color: "#9970d8" }}>
            {figmaToken && parsed?.nodeId ? "Figma 디자인 읽는 중..." : "컴포넌트 생성 중..."}
          </div>
        </div>
      )}

      {/* Done */}
      {status === "done" && htmlCode && (
        <PreviewLayout
          figmaImageUrl={figmaImageUrl}
          htmlCode={htmlCode}
          onRegenerate={() => setStatus("idle")}
        />
      )}

      {/* Error */}
      {status === "error" && (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#cc4444", marginBottom: "12px" }}>{errorMsg}</div>
          <button
            onClick={() => setStatus("idle")}
            style={{ padding: "7px 18px", background: "#f5f5f5", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", cursor: "pointer" }}
          >
            ↺ 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
