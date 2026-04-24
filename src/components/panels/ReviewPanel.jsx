import { useState, useEffect } from "react";
import { chatAPI } from "../../api/proxy";
import { REVIEW_PROMPT } from "../../prompts/tools";
import { MarkdownRenderer, openFullView } from "../../utils/markdown";
import { ScoreBadge } from "../ChartRenderer";

export default function ReviewPanel({ doc, title, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(null);

  useEffect(() => {
    runReview();
  }, []);

  const runReview = async () => {
    setLoading(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: REVIEW_PROMPT,
        messages: [{ role: "user", content: `다음 문서를 검토해 주십시오:\n\n${doc}` }],
      });
      const text = data.content?.[0]?.text || "";
      setResult(text);
      const match = text.match(/총점[:\s]+(\d+)/);
      if (match) setScore(parseInt(match[1]));
    } catch {
      setResult("검토 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "680px", maxHeight: "85vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", color: "#444444", fontWeight: "600" }}>📋 {title}</span>
            {score !== null && <ScoreBadge score={score} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {result && <button onClick={() => openFullView(result)} style={{ padding: "4px 12px", background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>↗ 새 창</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", fontSize: "13px", lineHeight: "1.8", color: "#444444" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 0" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#aaaaaa", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
              <span style={{ color: "#bbbbbb", fontSize: "12px" }}>검토 중입니다...</span>
            </div>
          ) : <MarkdownRenderer content={result} />}
        </div>
      </div>
    </div>
  );
}
