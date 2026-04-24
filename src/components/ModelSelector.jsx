import { useState, useRef, useEffect } from "react";
import { getProxyUrl } from "../api/proxy";
import { getSelectedModel, setSelectedModel } from "../utils/model";

// 모델명 축약 표시
function shortName(id) {
  if (id.includes("opus"))   return id.includes("4-6") ? "Opus 4.6"   : "Opus";
  if (id.includes("sonnet")) return id.includes("4-6") ? "Sonnet 4.6" : id.includes("4-5") ? "Sonnet 4.5" : "Sonnet";
  if (id.includes("haiku"))  return id.includes("4-5") ? "Haiku 4.5"  : "Haiku";
  return id.replace("claude-", "").slice(0, 14);
}

export default function ModelSelector({ onChange }) {
  const [selected, setSelected] = useState(getSelectedModel());
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const proxyUrl = getProxyUrl();
      const base = proxyUrl ? proxyUrl.replace(/\/$/, "") : "";
      const url = base ? `${base}/api/models` : "/api/models";
      const claudeToken = localStorage.getItem("alfred_claude_token") || "";
      const headers = claudeToken ? { "x-claude-token": claudeToken } : {};
      const res = await fetch(url, { headers });
      const data = await res.json();
      const list = (data.data || [])
        .filter(m => m.id.startsWith("claude-"))
        .sort((a, b) => b.id.localeCompare(a.id));
      setModels(list);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open && models.length === 0) fetchModels();
  };

  const handleSelect = (id) => {
    setSelected(id);
    setSelectedModel(id);
    onChange?.(id);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={handleOpen}
        title="모델 선택"
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "4px 10px", borderRadius: "20px",
          background: open ? "#f0f0f0" : "transparent",
          border: "1px solid " + (open ? "#cccccc" : "#e5e5e5"),
          color: "#666666", fontSize: "11px", cursor: "pointer",
          transition: "all 0.2s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#cccccc"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = "#e5e5e5"; }}
      >
        <span style={{ fontSize: "10px", color: "#aaaaaa" }}>◎</span>
        {shortName(selected)}
        <span style={{ fontSize: "8px", color: "#aaaaaa", marginLeft: "2px" }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "#ffffff", border: "1px solid #e5e5e5",
          borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: "6px", minWidth: "230px", zIndex: 1000,
        }}>
          <div style={{ padding: "6px 10px 8px", borderBottom: "1px solid #f0f0f0", marginBottom: "4px" }}>
            <div style={{ fontSize: "10px", color: "#aaaaaa", letterSpacing: "0.08em" }}>MODEL</div>
          </div>

          {loading && (
            <div style={{ padding: "12px 10px", fontSize: "11px", color: "#aaaaaa", textAlign: "center" }}>
              불러오는 중...
            </div>
          )}

          {!loading && models.length === 0 && (
            <div style={{ padding: "8px 10px" }}>
              {["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"].map(id => (
                <ModelRow key={id} id={id} selected={selected} onSelect={handleSelect} />
              ))}
              <div style={{ fontSize: "10px", color: "#cccccc", padding: "6px 2px 0" }}>
                * API 접근 불가 — 기본 목록 표시
              </div>
            </div>
          )}

          {!loading && models.length > 0 && (
            <div style={{ maxHeight: "280px", overflowY: "auto" }}>
              {models.map(m => (
                <ModelRow key={m.id} id={m.id} selected={selected} onSelect={handleSelect} />
              ))}
            </div>
          )}

          {!loading && models.length > 0 && (
            <div style={{ padding: "6px 10px 4px", borderTop: "1px solid #f0f0f0", marginTop: "4px" }}>
              <button onClick={fetchModels} style={{ fontSize: "10px", color: "#aaaaaa", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                ↻ 새로고침
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelRow({ id, selected, onSelect }) {
  const isSelected = id === selected;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "7px 10px", borderRadius: "8px",
        background: isSelected ? "#f5f5f5" : "transparent",
        border: "none", cursor: "pointer", textAlign: "left",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f8f8f8"; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: "12px", color: "#333333", fontFamily: "monospace" }}>{id}</span>
      {isSelected && <span style={{ fontSize: "10px", color: "#4a9e5f", fontWeight: 700 }}>✓</span>}
    </button>
  );
}
