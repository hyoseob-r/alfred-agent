import { useState, useEffect } from "react";

const STATUS_LABELS = {
  new:        { label: "NEW",      color: "#cc4444", bg: "#fff0f0" },
  reviewing:  { label: "검토중",   color: "#cc7700", bg: "#fff8e8" },
  in_progress:{ label: "수정중",   color: "#2266cc", bg: "#f0f4ff" },
  done:       { label: "완료",     color: "#226633", bg: "#f0fff4" },
  deferred:   { label: "나중에",   color: "#888888", bg: "#f5f5f5" },
  ignored:    { label: "무시",     color: "#bbbbbb", bg: "#fafafa" },
};

const TYPE_ICONS = { crash: "💥", manual: "💬" };
const PRIORITY_COLORS = { critical: "#cc4444", high: "#cc7700", normal: "#555", low: "#aaa" };

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function FeedbackItem({ item, onStatusChange, expanded, onToggle }) {
  const status = STATUS_LABELS[item.status] || STATUS_LABELS.new;
  const nextStatuses = Object.entries(STATUS_LABELS).filter(([k]) => k !== item.status);

  return (
    <div style={{
      border: "1px solid #e8e8e8", borderRadius: "12px", marginBottom: "10px",
      background: "#fff", overflow: "hidden",
    }}>
      {/* 헤더 */}
      <div
        onClick={onToggle}
        style={{ padding: "12px 16px", cursor: "pointer", display: "flex", gap: "10px", alignItems: "flex-start" }}
      >
        <span style={{ fontSize: "16px", flexShrink: 0 }}>{TYPE_ICONS[item.type] || "💬"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "2px 7px",
              borderRadius: "10px", color: status.color, background: status.bg,
            }}>{status.label}</span>
            <span style={{ fontSize: "10px", color: PRIORITY_COLORS[item.priority], fontWeight: 600 }}>
              {item.priority === "critical" ? "🔴 긴급" : item.priority === "high" ? "🟡 높음" : ""}
            </span>
            <span style={{ fontSize: "10px", color: "#aaa", marginLeft: "auto" }}>{timeAgo(item.created_at)}</span>
          </div>
          <div style={{ fontSize: "12px", color: "#333", lineHeight: 1.5, wordBreak: "break-word" }}>
            {item.message || <span style={{ color: "#aaa" }}>(메시지 없음)</span>}
          </div>
        </div>
      </div>

      {/* 펼쳐진 상태 */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f0f0f0", padding: "12px 16px" }}>

          {/* 스택 트레이스 */}
          {item.stack_trace && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", marginBottom: "4px" }}>STACK TRACE</div>
              <pre style={{
                fontSize: "10px", color: "#555", background: "#f8f8f8", padding: "8px 10px",
                borderRadius: "6px", overflow: "auto", maxHeight: "120px", lineHeight: 1.5,
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>{item.stack_trace}</pre>
            </div>
          )}

          {/* URL */}
          {item.url && (
            <div style={{ fontSize: "10px", color: "#aaa", marginBottom: "10px" }}>
              🔗 {item.url}
            </div>
          )}

          {/* 코멘트 타임라인 */}
          {item.comments?.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", marginBottom: "6px" }}>조치 히스토리</div>
              {item.comments.map(c => (
                <div key={c.id} style={{
                  display: "flex", gap: "8px", marginBottom: "6px", alignItems: "flex-start",
                }}>
                  <div style={{
                    fontSize: "10px", fontWeight: 700, color: c.author === "claude" ? "#2266cc" : "#226633",
                    flexShrink: 0, marginTop: "1px",
                  }}>
                    {c.author === "claude" ? "🤖 Claude" : "👤 오너"}
                  </div>
                  <div style={{
                    flex: 1, fontSize: "11px", color: "#444", lineHeight: 1.6,
                    background: c.author === "claude" ? "#f0f4ff" : "#f0fff4",
                    padding: "6px 10px", borderRadius: "6px",
                  }}>
                    {c.content}
                    <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}>{timeAgo(c.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 상태 변경 버튼 */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {nextStatuses.map(([k, v]) => (
              <button
                key={k}
                onClick={() => onStatusChange(item.id, k)}
                style={{
                  padding: "4px 10px", borderRadius: "10px", border: `1px solid ${v.color}44`,
                  background: v.bg, color: v.color, fontSize: "10px", fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPanel({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/feedback" : `/api/feedback?status=${filter}`;
      const resp = await fetch(url);
      const data = await resp.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleStatusChange = async (id, status) => {
    await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  };

  const filters = [
    { key: "all", label: "전체" },
    { key: "new", label: "NEW" },
    { key: "reviewing", label: "검토중" },
    { key: "in_progress", label: "수정중" },
    { key: "done", label: "완료" },
    { key: "deferred", label: "나중에" },
  ];

  const newCount = items.filter(i => i.status === "new").length;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: "16px", width: "560px", maxWidth: "95vw",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 16px 48px rgba(0,0,0,0.15)",
      }}>
        {/* 헤더 */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#111" }}>피드백 수집함</span>
            {newCount > 0 && (
              <span style={{ fontSize: "10px", fontWeight: 700, background: "#cc4444", color: "#fff", padding: "2px 7px", borderRadius: "10px" }}>
                {newCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={load} style={{ background: "none", border: "1px solid #e5e5e5", borderRadius: "8px", padding: "4px 10px", fontSize: "11px", cursor: "pointer", color: "#666" }}>새로고침</button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#999" }}>✕</button>
          </div>
        </div>

        {/* 필터 탭 */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: "4px", overflowX: "auto" }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "4px 12px", borderRadius: "20px", border: "none",
                background: filter === f.key ? "#111" : "#f0f0f0",
                color: filter === f.key ? "#fff" : "#666",
                fontSize: "11px", fontWeight: filter === f.key ? 700 : 400,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#aaa", fontSize: "13px", padding: "40px 0" }}>불러오는 중...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", fontSize: "13px", padding: "40px 0" }}>피드백이 없습니다.</div>
          ) : (
            items.map(item => (
              <FeedbackItem
                key={item.id}
                item={item}
                expanded={expanded === item.id}
                onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
