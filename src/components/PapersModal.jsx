import { useState, useEffect, useRef } from "react";
import { getSupabase } from "../api/supabase";

const STATUS_CYCLE = ["in-progress", "hold", "done", "declined", "archived"];
const STATUS_META = {
  "in-progress": { label: "In Progress", bg: "#e8f4e8", border: "#b3e5de", color: "#2e7d32" },
  "hold":        { label: "Hold",        bg: "#fff8e1", border: "#ffe082", color: "#e65100" },
  "declined":    { label: "Declined",    bg: "#fce4ec", border: "#f48fb1", color: "#c62828" },
  "done":        { label: "Done",        bg: "#f3e5f5", border: "#ce93d8", color: "#7b1fa2" },
  "archived":    { label: "History",     bg: "#f5f5f5", border: "#e0e0e0", color: "#9e9e9e" },
};

function useDocStatuses(papers, user) {
  const [statuses, setStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("paper-statuses") || "{}"); } catch { return {}; }
  });

  useEffect(() => {
    if (!user?.id) return;
    getSupabase().then(sb => {
      sb.from("paper_statuses").select("filename,status").eq("user_id", user.id).then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          const remote = {};
          data.forEach(r => { remote[r.filename] = r.status; });
          setStatuses(remote);
          localStorage.setItem("paper-statuses", JSON.stringify(remote));
        }
      });
    });
  }, [user?.id]);

  const getStatus = (p) => statuses[p.filename] ?? p.status ?? "in-progress";
  const setStatus = (p, next) => {
    const updated = { ...statuses, [p.filename]: next };
    setStatuses(updated);
    localStorage.setItem("paper-statuses", JSON.stringify(updated));
    if (!user?.id) return;
    getSupabase().then(sb => {
      sb.from("paper_statuses").upsert(
        { user_id: user.id, filename: p.filename, status: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,filename" }
      ).then(({ error }) => {
        if (error) console.error("paper_statuses upsert error:", error);
      });
    });
  };
  return { getStatus, setStatus };
}

function StatusPicker({ paper, getStatus, setStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = getStatus(paper);
  const sm = STATUS_META[cur] || STATUS_META["in-progress"];

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="상태 변경"
        style={{ fontSize: "9px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px", background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color, cursor: "pointer", whiteSpace: "nowrap" }}>
        {sm.label} ▾
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: "4px", zIndex: 100, minWidth: "120px" }}>
          {STATUS_CYCLE.map(s => {
            const m = STATUS_META[s];
            return (
              <button key={s} onClick={e => { e.stopPropagation(); setStatus(paper, s); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: "7px", width: "100%", padding: "6px 9px", borderRadius: "7px", border: "none", background: cur === s ? m.bg : "transparent", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                onMouseEnter={e => { if (cur !== s) e.currentTarget.style.background = "#f5f5f5"; }}
                onMouseLeave={e => { if (cur !== s) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ fontSize: "11px", fontWeight: cur === s ? 700 : 500, color: cur === s ? m.color : "#555" }}>{m.label}</span>
                {cur === s && <span style={{ marginLeft: "auto", fontSize: "10px", color: m.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PapersModal({ onClose, user }) {
  const [papers, setPapers] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/list-papers")
      .then(r => r.json())
      .then(d => { setPapers(d.papers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const { getStatus, setStatus } = useDocStatuses(papers, user);

  const filtered = papers
    .filter(p => tab === "history" ? getStatus(p) === "archived" : getStatus(p) !== "archived")
    .filter(p => !query || p.title.toLowerCase().includes(query.toLowerCase()) || p.filename.toLowerCase().includes(query.toLowerCase()));

  const activeCount  = papers.filter(p => getStatus(p) !== "archived").length;
  const historyCount = papers.filter(p => getStatus(p) === "archived").length;

  const labelColor = filename => {
    if (filename.startsWith("proposal")) return { bg: "#fff5f8", border: "#feccdc", color: "#fa0050" };
    if (filename.startsWith("mockup"))   return { bg: "#f0f6ff", border: "#b3d0f5", color: "#0c74e4" };
    return { bg: "#f6f6f6", border: "#e5e5e5", color: "#888888" };
  };

  const typeLabel = filename => {
    if (filename.startsWith("proposal")) return "Proposal";
    if (filename.startsWith("mockup"))   return "Mockup";
    return "Document";
  };

  const fmtDate = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3") : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => { if (e.target === e.currentTarget) { if (selected) setSelected(null); else onClose(); } }}>

      {selected ? (
        <div style={{ width: "100%", height: "100%", maxWidth: "1200px", maxHeight: "92vh", background: "#fff", borderRadius: "16px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 8px 48px rgba(0,0,0,0.32)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", gap: "10px", background: "#fff", flexShrink: 0 }}>
            <button onClick={() => setSelected(null)} style={{ padding: "4px 10px", border: "1px solid #e5e5e5", borderRadius: "8px", background: "none", color: "#888", fontSize: "11px", cursor: "pointer" }}>← 목록</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.title}</div>
              <div style={{ fontSize: "10px", color: "#aaa", marginTop: "1px" }}>
                {selected.created && `생성 ${fmtDate(selected.created)}`}
                {selected.created && selected.updated && " · "}
                {selected.updated && `수정 ${fmtDate(selected.updated)}`}
              </div>
            </div>
            <StatusPicker paper={selected} getStatus={getStatus} setStatus={setStatus} />
            <a href={selected.path} target="_blank" rel="noreferrer" style={{ padding: "4px 10px", border: "1px solid #e5e5e5", borderRadius: "8px", background: "none", color: "#888", fontSize: "11px", cursor: "pointer", textDecoration: "none" }}>새 탭 ↗</a>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <iframe src={selected.path} style={{ flex: 1, border: "none", width: "100%" }} title={selected.title} />
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: "520px", background: "#fff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 48px rgba(0,0,0,0.24)" }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#333" }}>📄 Papers</div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: "4px", marginBottom: "10px" }}>
              {[
                { id: "active",  label: "Active",  count: activeCount },
                { id: "history", label: "History", count: historyCount },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ padding: "5px 12px", borderRadius: "8px", border: "none", background: tab === t.id ? "#111" : "#f0f0f0", color: tab === t.id ? "#fff" : "#888", fontSize: "11px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.15s" }}>
                  {t.label}
                  <span style={{ fontSize: "10px", background: tab === t.id ? "rgba(255,255,255,0.2)" : "#e0e0e0", color: tab === t.id ? "#fff" : "#999", borderRadius: "10px", padding: "1px 5px" }}>{t.count}</span>
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#bbb", fontSize: "13px", pointerEvents: "none" }}>🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="문서 검색..."
                style={{ width: "100%", padding: "8px 12px 8px 30px", border: "1px solid #e5e5e5", borderRadius: "8px", fontSize: "12px", color: "#333", outline: "none", background: "#f8f8f8", fontFamily: "inherit" }}
                onFocus={e => e.currentTarget.style.borderColor = "#fa0050"}
                onBlur={e => e.currentTarget.style.borderColor = "#e5e5e5"}
              />
            </div>
          </div>

          <div style={{ maxHeight: "420px", overflowY: "auto", padding: "8px" }}>
            {loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#bbb", fontSize: "12px" }}>검색 결과 없음</div>
            ) : (
              filtered.map(p => {
                const lc = labelColor(p.filename);
                return (
                  <button key={p.filename} onClick={() => setSelected(p)}
                    style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "10px", border: "1px solid transparent", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s", marginBottom: "2px" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#f8f8f8"; e.currentTarget.style.borderColor = "#e5e5e5"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
                    <div style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", background: lc.bg, border: `1px solid ${lc.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
                      {p.filename.startsWith("proposal") ? "📋" : p.filename.startsWith("mockup") ? "🖼" : "📄"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px", display: "flex", gap: "6px" }}>
                        {p.created && <span>생성 {fmtDate(p.created)}</span>}
                        {p.updated && <span>· 수정 {fmtDate(p.updated)}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "20px", background: lc.bg, border: `1px solid ${lc.border}`, color: lc.color }}>{typeLabel(p.filename)}</span>
                      <StatusPicker paper={p} getStatus={getStatus} setStatus={setStatus} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ padding: "10px 16px", borderTop: "1px solid #f0f0f0", fontSize: "10px", color: "#bbb", textAlign: "right" }}>
            {filtered.length}개 문서 · 상태 배지 클릭 → "History" 선택 시 History 탭으로 이동
          </div>
        </div>
      )}
    </div>
  );
}
