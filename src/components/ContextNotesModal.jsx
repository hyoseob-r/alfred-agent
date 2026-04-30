import { useState, useEffect, useRef } from "react";
import { getSupabase } from "../api/supabase";
import { MarkdownRenderer } from "../utils/markdown";

const TYPE_META = {
  strategy:  { label: "Strategy",  bg: "#f0f6ff", border: "#b3d0f5", color: "#0c74e4", icon: "🧭" },
  decision:  { label: "Decision",  bg: "#fff5f8", border: "#feccdc", color: "#fa0050", icon: "⚡" },
  feedback:  { label: "Feedback",  bg: "#f0fff4", border: "#b3e5c8", color: "#2e7d50", icon: "💬" },
  user_pref: { label: "User Pref", bg: "#fdf6ff", border: "#d9b3f5", color: "#7b1fa2", icon: "👤" },
  worklog:   { label: "Worklog",   bg: "#fffbe6", border: "#ffe082", color: "#b07800", icon: "📋" },
  session:   { label: "Session",   bg: "#f5f5f5", border: "#e0e0e0", color: "#666",    icon: "💾" },
  ai_queue:  { label: "AI Queue",  bg: "#f5f5f5", border: "#e0e0e0", color: "#999",    icon: "🤖" },
  guest_question: { label: "Guest Q", bg: "#fff8f0", border: "#ffd0a0", color: "#b05000", icon: "👤" },
};

const TABS = [
  { id: "all",            label: "전체" },
  { id: "guest_question", label: "👤 Guest 질문" },
  { id: "strategy",       label: "Strategy" },
  { id: "decision",       label: "Decision" },
  { id: "feedback",       label: "Feedback" },
  { id: "user_pref",      label: "User Pref" },
  { id: "worklog",        label: "Worklog" },
];

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function NoteDetail({ note, onBack, onClose }) {
  const tm = TYPE_META[note.type] || TYPE_META["session"];
  return (
    <div style={{ width: "100%", height: "100%", maxWidth: "800px", maxHeight: "88vh", background: "#fff", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 8px 48px rgba(0,0,0,0.28)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <button onClick={onBack} style={{ padding: "4px 10px", border: "1px solid #e5e5e5", borderRadius: "8px", background: "none", color: "#888", fontSize: "11px", cursor: "pointer" }}>← 목록</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title}</div>
          <div style={{ fontSize: "10px", color: "#aaa", marginTop: "1px", display: "flex", gap: "8px" }}>
            {note.created_at && <span>생성 {fmtDate(note.created_at)}</span>}
            {note.updated_at && <span>· 수정 {fmtDate(note.updated_at)}</span>}
            {note.tags?.length > 0 && <span>· {note.tags.map(t => `#${t}`).join(" ")}</span>}
          </div>
        </div>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px", background: tm.bg, border: `1px solid ${tm.border}`, color: tm.color, flexShrink: 0 }}>
          {tm.icon} {tm.label}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <MarkdownRenderer content={note.content || ""} />
      </div>
    </div>
  );
}

export default function ContextNotesModal({ onClose }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getSupabase().then(sb => {
      sb.from("context_notes")
        .select("id,type,title,content,tags,created_at,updated_at")
        .not("type", "in", '("ai_queue","session")')
        .order("updated_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) setNotes(data);
          setLoading(false);
        });
    });
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const filtered = notes
    .filter(n => tab === "all" ? n.type !== "guest_question" : n.type === tab)
    .filter(n => !query || n.title?.toLowerCase().includes(query.toLowerCase()) || n.content?.toLowerCase().includes(query.toLowerCase()));

  const countOf = (type) => type === "all" ? notes.length : notes.filter(n => n.type === type).length;

  if (selected) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
        <NoteDetail note={selected} onBack={() => setSelected(null)} onClose={onClose} />
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{ width: "100%", maxWidth: "560px", background: "#fff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 48px rgba(0,0,0,0.24)" }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#333" }}>🧠 Context Notes</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* 탭 */}
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "4px 10px", borderRadius: "8px", border: "none", background: tab === t.id ? "#111" : "#f0f0f0", color: tab === t.id ? "#fff" : "#888", fontSize: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.15s" }}>
                {t.label}
                <span style={{ fontSize: "9px", background: tab === t.id ? "rgba(255,255,255,0.2)" : "#e0e0e0", color: tab === t.id ? "#fff" : "#999", borderRadius: "10px", padding: "1px 4px" }}>{countOf(t.id)}</span>
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#bbb", fontSize: "13px", pointerEvents: "none" }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="제목 또는 내용 검색..."
              style={{ width: "100%", padding: "8px 12px 8px 30px", border: "1px solid #e5e5e5", borderRadius: "8px", fontSize: "12px", color: "#333", outline: "none", background: "#f8f8f8", fontFamily: "inherit", boxSizing: "border-box" }}
              onFocus={e => e.currentTarget.style.borderColor = "#111"}
              onBlur={e => e.currentTarget.style.borderColor = "#e5e5e5"}
            />
          </div>
        </div>

        {/* 목록 */}
        <div style={{ maxHeight: "440px", overflowY: "auto", padding: "8px" }}>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>검색 결과 없음</div>
          ) : (
            filtered.map(n => {
              const tm = TYPE_META[n.type] || TYPE_META["session"];
              const preview = (n.content || "").replace(/#{1,3}\s/g, "").replace(/\*\*/g, "").slice(0, 80);
              return (
                <button key={n.id} onClick={() => setSelected(n)}
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "10px", border: "1px solid transparent", background: "transparent", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: "10px", transition: "all 0.15s", marginBottom: "2px" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f8f8f8"; e.currentTarget.style.borderColor = "#e5e5e5"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                  <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", background: tm.bg, border: `1px solid ${tm.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
                    {tm.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</div>
                    <div style={{ fontSize: "10px", color: "#999", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", background: tm.bg, border: `1px solid ${tm.border}`, color: tm.color }}>{tm.label}</span>
                    <span style={{ fontSize: "9px", color: "#ccc" }}>{fmtDate(n.updated_at)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid #f0f0f0", fontSize: "10px", color: "#bbb", textAlign: "right" }}>
          {filtered.length}개 노트
        </div>
      </div>
    </div>
  );
}
