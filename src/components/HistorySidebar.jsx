import { useState } from "react";
import { STAGE_INFO } from "../prompts/agent";

export default function HistorySidebar({ sessions, activeId, onSelect, onNew, onDelete, councilSessions, onSelectCouncil, onDeleteCouncil, open, onClose }) {
  const [tab, setTab] = useState("chat");
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 299, background: "rgba(0,0,0,0.4)" }} />
      <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "260px", zIndex: 300, background: "#ffffff", borderRight: "1px solid #e5e5e5", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#888888", letterSpacing: "0.12em", textTransform: "uppercase" }}>히스토리</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaaaaa", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
        <div style={{ display: "flex", padding: "8px 12px", gap: "4px", borderBottom: "1px solid #e5e5e5" }}>
          {[{ id: "chat", label: "대화", count: sessions.length }, { id: "council", label: "Council", count: councilSessions?.length || 0 }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: "6px 0", background: tab === t.id ? "#111111" : "transparent", border: `1px solid ${tab === t.id ? "#111111" : "#e5e5e5"}`, borderRadius: "6px", color: tab === t.id ? "#ffffff" : "#aaaaaa", fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", transition: "all 0.15s" }}>
              {t.label}
              {t.count > 0 && <span style={{ background: tab === t.id ? "rgba(255,255,255,0.2)" : "#e5e5e5", borderRadius: "10px", padding: "1px 5px", fontSize: "9px", color: tab === t.id ? "#ffffff" : "#888888" }}>{t.count}</span>}
            </button>
          ))}
        </div>
        {tab === "chat" && (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e5e5" }}>
            <button onClick={onNew} style={{ width: "100%", padding: "8px 12px", background: "linear-gradient(135deg, #111111 0%, #333333 100%)", border: "1px solid #555555", borderRadius: "8px", color: "#ffffff", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#999999"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#cccccc"}>
              <span style={{ fontSize: "14px" }}>＋</span> 새 대화 시작
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {tab === "chat" ? (
            <>
              {sessions.length === 0 && (
                <div style={{ padding: "20px 12px", color: "#cccccc", fontSize: "12px", textAlign: "center" }}>저장된 대화가 없습니다</div>
              )}
              {[...sessions].reverse().map(s => (
                <div key={s.id} onClick={() => onSelect(s.id)}
                  style={{ padding: "10px 12px", borderRadius: "8px", marginBottom: "4px", cursor: "pointer", background: s.id === activeId ? "#f0f0f0" : "transparent", border: s.id === activeId ? "1px solid #cccccc" : "1px solid transparent", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", transition: "all 0.15s" }}
                  onMouseEnter={e => { if (s.id !== activeId) e.currentTarget.style.background = "#f8f8f8"; }}
                  onMouseLeave={e => { if (s.id !== activeId) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: s.id === activeId ? "#444444" : "#777777", fontWeight: s.id === activeId ? "600" : "400", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.title || "새 대화"}
                    </div>
                    <div style={{ fontSize: "10px", color: "#cccccc", marginTop: "3px" }}>
                      {new Date(s.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div style={{ fontSize: "10px", color: "#aaaaaa", marginTop: "2px" }}>
                      {STAGE_INFO[s.stage]?.icon} {STAGE_INFO[s.stage]?.label}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                    style={{ background: "none", border: "none", color: "#cccccc", cursor: "pointer", fontSize: "12px", flexShrink: 0, padding: "2px", borderRadius: "4px", transition: "color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#9e5a5a"}
                    onMouseLeave={e => e.currentTarget.style.color = "#cccccc"}>✕</button>
                </div>
              ))}
            </>
          ) : (
            <>
              {(!councilSessions || councilSessions.length === 0) && (
                <div style={{ padding: "20px 12px", color: "#cccccc", fontSize: "12px", textAlign: "center" }}>저장된 Council 토론이 없습니다</div>
              )}
              {(councilSessions || []).map(c => (
                <div key={c.id}
                  onClick={() => { onSelectCouncil(c); onClose(); }}
                  style={{ padding: "10px 12px", borderRadius: "8px", marginBottom: "4px", border: "1px solid transparent", transition: "all 0.15s", cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8f8f8"; e.currentTarget.style.borderColor = "#e5e5e5"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px" }}>⚖️</span>
                    {c.id && <span style={{ background: "#f0f0ff", color: "#7777cc", padding: "1px 5px", borderRadius: "4px", fontSize: "9px", fontFamily: "monospace" }}>{c.id}</span>}
                    <span style={{ fontSize: "9px", color: "#cccccc", marginLeft: "auto" }}>
                      {new Date(c.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#555555", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {c.topic}
                  </div>
                  {c.summary && (
                    <div style={{ fontSize: "10px", color: "#aaaaaa", marginTop: "4px", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {c.summary}
                    </div>
                  )}
                  <div style={{ fontSize: "9px", color: "#cccccc", marginTop: "4px" }}>
                    {c.rounds?.length || 0}라운드
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #e5e5e5" }}>
          <span style={{ fontSize: "10px", color: "#cccccc" }}>Supabase 클라우드 저장 · 이미지/PDF 메타데이터만 보존</span>
        </div>
      </div>
    </>
  );
}
