import { useState, useEffect } from "react";
import { chatAPI } from "../../api/proxy";
import { COMPARE_PROMPT } from "../../prompts/tools";
import { MarkdownRenderer, openFullView } from "../../utils/markdown";

export default function ComparePanel({ docA, docB, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { runCompare(); }, []);

  const runCompare = async () => {
    setLoading(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 16000,
        system: COMPARE_PROMPT,
        messages: [{
          role: "user",
          content: `[Document A — AI 자동 생성본]\n${docA}\n\n[Document B — 업로드된 기존 문서]\n${docB}`,
        }],
      });
      setResult(data.content?.[0]?.text || "");
    } catch {
      setResult("비교 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "720px", maxHeight: "85vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", color: "#444444", fontWeight: "600" }}>⚖️ 문서 비교 분석</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {result && <button onClick={() => openFullView(result)} style={{ padding: "4px 12px", background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>↗ 새 창</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0", padding: "10px 20px", borderBottom: "1px solid #e5e5e5" }}>
          {[["A", "AI 자동 생성본", "#6c8ebf"], ["B", "업로드 문서", "#7b68b5"]].map(([tag, label, color]) => (
            <div key={tag} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: color + "15", border: `1px solid ${color}44`, borderRadius: "20px", marginRight: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color, fontFamily: "'Pretendard', sans-serif" }}>{tag}</span>
              <span style={{ fontSize: "11px", color: "#777777" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", fontSize: "13px", lineHeight: "1.8", color: "#444444" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 0" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#aaaaaa", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
              <span style={{ color: "#bbbbbb", fontSize: "12px" }}>두 문서를 비교하고 있습니다...</span>
            </div>
          ) : <MarkdownRenderer content={result} />}
        </div>
      </div>
    </div>
  );
}
