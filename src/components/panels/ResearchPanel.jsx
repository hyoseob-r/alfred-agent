import { useState } from "react";
import { chatAPI } from "../../api/proxy";
import { RESEARCH_PROMPT } from "../../prompts/tools";
import { MarkdownRenderer } from "../../utils/markdown";

export default function ResearchPanel() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const DOMAINS = ["배달앱", "퀵커머스", "다크스토어", "푸드딜리버리", "모바일 UX", "IT/테크"];

  const runResearch = async () => {
    if (!topic.trim() || loading) return;
    setResult("");
    setLoading(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: RESEARCH_PROMPT,
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
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runResearch(); } }}
            placeholder="리서치 주제를 입력하세요. 예: 국내 퀵커머스 시장 현황과 전망"
            rows={2}
            style={{ flex: 1, background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "12px", padding: "10px 14px", color: "#111111", fontSize: "13px", resize: "none", outline: "none", lineHeight: "1.6", transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = "#aaaaaa"}
            onBlur={e => e.target.style.borderColor = "#cccccc"}
          />
          <button onClick={runResearch} disabled={!topic.trim() || loading}
            style={{ padding: "0 20px", background: topic.trim() && !loading ? "#111111" : "#e5e5e5", border: "1px solid", borderColor: topic.trim() && !loading ? "#333333" : "#cccccc", borderRadius: "12px", color: topic.trim() && !loading ? "#ffffff" : "#aaaaaa", fontSize: "13px", cursor: topic.trim() && !loading ? "pointer" : "not-allowed", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {loading ? "분석 중..." : "분석 시작"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", scrollbarWidth: "thin", scrollbarColor: "#cccccc transparent" }}>
        {loading && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", color: "#aaaaaa", fontSize: "12px" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#aaaaaa", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
            <span style={{ marginLeft: "8px" }}>리서치 중...</span>
          </div>
        )}
        {result && !loading && <MarkdownRenderer content={result} />}
        {!result && !loading && (
          <div style={{ textAlign: "center", color: "#cccccc", fontSize: "12px", marginTop: "60px", lineHeight: "2" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.4 }}>🔭</div>
            주제를 입력하고 분석을 시작하세요.<br />
            현황 · 트렌드 · 예측 · 장단 분석을 제공합니다.
          </div>
        )}
      </div>
    </div>
  );
}
