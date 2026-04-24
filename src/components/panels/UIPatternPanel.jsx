import { useState } from "react";
import { chatAPI } from "../../api/proxy";
import { UI_PATTERN_PROMPT } from "../../prompts/tools";
import { MarkdownRenderer, FullViewButton } from "../../utils/markdown";

export default function UIPatternPanel() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const DOMAINS = ["장바구니", "홈 피드", "검색/탐색", "결제 플로우", "온보딩", "알림/피드백"];

  const runPattern = async () => {
    if (!topic.trim() || loading) return;
    setResult("");
    setLoading(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: UI_PATTERN_PROMPT,
        messages: [{ role: "user", content: topic }],
      });
      setResult(data.content?.[0]?.text || "결과를 가져오지 못했습니다.");
    } catch {
      setResult("오류가 발생했습니다. 다시 시도해 주십시오.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", background: "#ffffff" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setTopic(prev => prev ? `${prev}, ${d}` : d)}
              style={{ padding: "4px 10px", background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "20px", color: "#777777", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#999999"; e.currentTarget.style.color = "#555555"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#777777"; }}>
              {d}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runPattern(); } }}
            placeholder="문제 상황을 입력하세요. 예: 퀵커머스 앱 장바구니 이탈률이 높음 — 상품 추가 후 결제까지 단계가 너무 많음"
            rows={2}
            style={{ flex: 1, background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "12px", padding: "10px 14px", color: "#111111", fontSize: "13px", resize: "none", outline: "none", lineHeight: "1.6", transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = "#aaaaaa"}
            onBlur={e => e.target.style.borderColor = "#cccccc"}
          />
          <button onClick={runPattern} disabled={!topic.trim() || loading}
            style={{ padding: "0 20px", background: topic.trim() && !loading ? "#111111" : "#e5e5e5", border: "1px solid", borderColor: topic.trim() && !loading ? "#333333" : "#cccccc", borderRadius: "12px", color: topic.trim() && !loading ? "#ffffff" : "#aaaaaa", fontSize: "13px", cursor: topic.trim() && !loading ? "pointer" : "not-allowed", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {loading ? "생성 중..." : "패턴 제안"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", scrollbarWidth: "thin", scrollbarColor: "#cccccc transparent" }}>
        {loading && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", color: "#aaaaaa", fontSize: "12px" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#aaaaaa", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
            <span style={{ marginLeft: "8px" }}>UI 패턴 분석 중...</span>
          </div>
        )}
        {result && !loading && (
          <>
            <MarkdownRenderer content={result} />
            <FullViewButton content={result} />
          </>
        )}
        {!result && !loading && (
          <div style={{ textAlign: "center", color: "#cccccc", fontSize: "12px", marginTop: "60px", lineHeight: "2" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.4 }}>◈</div>
            문제 상황을 입력하면 3가지 UI 패턴을 제안합니다.<br />
            레이아웃 · UX 원칙 · 적합 상황 · 구현 복잡도를 포함합니다.
          </div>
        )}
      </div>
    </div>
  );
}
