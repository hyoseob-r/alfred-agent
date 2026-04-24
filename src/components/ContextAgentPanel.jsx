import { useState, useEffect } from "react";

const TYPE_META = {
  feedback:  { label: "Feedback",  color: "#e67e22" },
  decision:  { label: "Decision",  color: "#0c74e4" },
  strategy:  { label: "Strategy",  color: "#059669" },
  user_pref: { label: "User Pref", color: "#7b68b5" },
};

export default function ContextAgentPanel({ open, onClose }) {
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("https://alfred-agent-nine.vercel.app/api/get-context")
      .then(r => r.json())
      .then(d => { setNotes(d.context_notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(680px, 100vw)", zIndex: 400, background: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: "#aaaaaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Persistent Memory</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#111111" }}>🧠 Context Agent</div>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", background: "none", border: "1px solid #e5e5e5", borderRadius: "6px", color: "#aaaaaa", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#aaaaaa"; e.currentTarget.style.color = "#555555"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading && <div style={{ color: "#aaaaaa", fontSize: "13px", textAlign: "center", marginTop: "40px" }}>로딩 중...</div>}
          {!loading && notes && notes.length === 0 && <div style={{ color: "#aaaaaa", fontSize: "13px", textAlign: "center", marginTop: "40px" }}>저장된 지침이 없습니다.</div>}
          {!loading && notes && notes.map((note, i) => {
            const meta = TYPE_META[note.type] || { label: note.type, color: "#888888" };
            return (
              <div key={i} style={{ border: "1px solid #e5e5e5", borderRadius: "10px", marginBottom: "10px", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: meta.color, background: meta.color + "15", padding: "2px 8px", borderRadius: "100px" }}>{meta.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#222222", flex: 1 }}>{note.title}</span>
                  {note.updated_at && <span style={{ fontSize: "10px", color: "#cccccc", flexShrink: 0 }}>{new Date(note.updated_at).toLocaleDateString("ko-KR")}</span>}
                </div>
                <div style={{ padding: "10px 14px" }}>
                  <pre style={{ fontSize: "11px", color: "#555555", lineHeight: "1.7", whiteSpace: "pre-wrap", fontFamily: "'Pretendard', sans-serif", margin: 0 }}>{note.content}</pre>
                  {note.tags && note.tags.length > 0 && (
                    <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {note.tags.map((t, ti) => <span key={ti} style={{ fontSize: "10px", color: "#aaaaaa", background: "#f5f5f5", padding: "2px 7px", borderRadius: "100px" }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
