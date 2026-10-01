import { useState, useEffect, useCallback } from "react";
import { markdownToHtml } from "./MessageBubble";

const API_BASE = "https://alfred-agent-nine.vercel.app/api/competitor-monitor";

const TAG_COLORS = {
  "version_change": { bg: "#fff3e0", color: "#e65100", label: "버전 변경" },
  "release_notes": { bg: "#e3f2fd", color: "#1565c0", label: "릴리즈노트" },
  "no_change":     { bg: "#f5f5f5", color: "#9e9e9e", label: "변경 없음" },
  "baemin":        { bg: "#e8f5e9", color: "#2e7d32", label: "배민" },
  "coupangeats":   { bg: "#fce4ec", color: "#c62828", label: "쿠팡이츠" },
};

function TagBadge({ tag }) {
  const cfg = TAG_COLORS[tag] || { bg: "#f0f0f0", color: "#666666", label: tag };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "10px",
      fontSize: "10px", fontWeight: 600, background: cfg.bg, color: cfg.color,
      marginRight: "4px", lineHeight: "18px",
    }}>{cfg.label}</span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export default function CompetitorMonitor({ onClose }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}?limit=20`);
      const data = await res.json();
      if (data.ok) {
        setChanges(data.changes || []);
      } else {
        setError("데이터를 불러오지 못했습니다.");
      }
    } catch (e) {
      setError("API 연결 실패: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    setError(null);
    try {
      const res = await fetch(API_BASE, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setScanResult(data);
        // 스캔 후 피드 새로고침
        await fetchChanges();
      } else {
        setError("스캔 실패");
      }
    } catch (e) {
      setError("스캔 API 오류: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  const hasVersionChange = (item) => {
    return item.tags && (item.tags.includes("version_change") || item.tags.includes("release_notes"));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "rgba(0,0,0,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%", maxWidth: "680px", maxHeight: "85vh",
        background: "#ffffff", borderRadius: "16px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        fontFamily: "'Pretendard', sans-serif",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#111111" }}>
              경쟁사 모니터링
            </div>
            <div style={{ fontSize: "11px", color: "#999999", marginTop: "2px" }}>
              배민 / 쿠팡이츠 앱스토어 버전 및 릴리즈노트 변경 감지
            </div>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              padding: "7px 16px", borderRadius: "8px",
              border: "none", cursor: scanning ? "not-allowed" : "pointer",
              background: scanning ? "#e0e0e0" : "#111111",
              color: scanning ? "#999999" : "#ffffff",
              fontSize: "12px", fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {scanning ? "스캔 중..." : "스캔 실행"}
          </button>
          <button onClick={onClose} style={{
            width: "28px", height: "28px", borderRadius: "8px",
            border: "1px solid #e5e5e5", background: "transparent",
            cursor: "pointer", fontSize: "14px", color: "#999999",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>x</button>
        </div>

        {/* Scan Result Banner */}
        {scanResult && (
          <div style={{
            margin: "12px 24px 0", padding: "12px 16px",
            background: "#f0fdf4", borderRadius: "10px",
            border: "1px solid #bbf7d0", fontSize: "12px", color: "#166534",
          }}>
            <div style={{ fontWeight: 600, marginBottom: "6px" }}>
              스캔 완료 — {formatDate(scanResult.scannedAt)}
            </div>
            {scanResult.results && scanResult.results.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "8px",
                marginTop: "4px",
              }}>
                <span style={{ fontWeight: 600 }}>{r.source}</span>
                <span style={{
                  padding: "1px 8px", borderRadius: "8px", fontSize: "10px", fontWeight: 600,
                  background: r.status === "changed" ? "#fff3e0" : "#f5f5f5",
                  color: r.status === "changed" ? "#e65100" : "#9e9e9e",
                }}>
                  {r.status === "changed" ? "변경 감지" : "변경 없음"}
                </span>
                {r.version && <span style={{ color: "#666666" }}>v{r.version}</span>}
                {r.diff && <span style={{ color: "#888888", fontSize: "11px" }}>{r.diff}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            margin: "12px 24px 0", padding: "10px 14px",
            background: "#fef2f2", borderRadius: "8px",
            border: "1px solid #fecaca", fontSize: "12px", color: "#991b1b",
          }}>
            {error}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#cccccc", fontSize: "13px" }}>
              로딩 중...
            </div>
          ) : changes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#cccccc", fontSize: "13px" }}>
              감지된 변경사항이 없습니다. 스캔을 실행해 보세요.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {changes.map(item => {
                const highlighted = hasVersionChange(item);
                const expanded = expandedId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    style={{
                      padding: "14px 16px", borderRadius: "12px",
                      border: highlighted ? "1px solid #ffcc80" : "1px solid #f0f0f0",
                      background: highlighted ? "#fffde7" : "#fafafa",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {/* Title row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                        background: highlighted ? "#ff9800" : "#e0e0e0",
                      }} />
                      <div style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "#111111" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: "10px", color: "#bbbbbb", whiteSpace: "nowrap" }}>
                        {formatDate(item.date)}
                      </div>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div style={{ marginTop: "8px", marginLeft: "16px" }}>
                        {item.tags.map((t, i) => <TagBadge key={i} tag={t} />)}
                      </div>
                    )}

                    {/* Detail (expandable) */}
                    {expanded && item.detail && (
                      <div
                        style={{
                          marginTop: "12px", marginLeft: "16px",
                          padding: "12px 14px", background: "#ffffff",
                          borderRadius: "8px", border: "1px solid #e8e8e8",
                          fontSize: "12px", color: "#333333", lineHeight: 1.7,
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(item.detail) }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
