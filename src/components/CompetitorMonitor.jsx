import { useState, useEffect, useCallback } from "react";
import { markdownToHtml } from "./MessageBubble";

const API_BASE = "https://alfred-agent-nine.vercel.app/api/competitor-monitor";

const COMPETITORS = {
  baemin_appstore:      { name: "배달의민족", color: "#2AC1BC", icon: "B" },
  coupangeats_appstore: { name: "쿠팡이츠",  color: "#E31837", icon: "C" },
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function formatRelative(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

/* ── 경쟁사 현재 상태 카드 ───────────────────────────────────── */
function CompetitorCard({ sourceId, snapshot }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const cfg = COMPETITORS[sourceId] || { name: sourceId, color: "#666", icon: "?" };

  if (!snapshot) return (
    <div style={{ padding: 20, background: "#fafafa", borderRadius: 14, border: "1px solid #f0f0f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: cfg.color, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cfg.icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>{cfg.name}</span>
      </div>
      <div style={{ fontSize: 12, color: "#bbb" }}>스냅샷 없음 — 스캔을 실행해주세요</div>
    </div>
  );

  return (
    <div style={{ padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #e8e8e8" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: cfg.color, color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{snapshot.trackName || cfg.name}</div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>App Store (KR)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{snapshot.version}</div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>{formatRelative(snapshot.currentVersionReleaseDate)}</div>
        </div>
      </div>

      {/* 메타 정보 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 11, color: "#888" }}>
        <span>업데이트: {formatDate(snapshot.currentVersionReleaseDate)}</span>
        <span>마지막 스캔: {formatDate(snapshot.updated_at)}</span>
      </div>

      {/* 릴리즈 노트 */}
      {snapshot.releaseNotes && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setNotesOpen(!notesOpen)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 12, fontWeight: 600, color: "#555", display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ transform: notesOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▸</span>
            릴리즈 노트
          </button>
          {notesOpen && (
            <div style={{
              marginTop: 8, padding: "12px 14px", background: "#f8f9fa",
              borderRadius: 10, fontSize: 13, color: "#333", lineHeight: 1.8,
              whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #f0f0f0",
            }}>
              {snapshot.releaseNotes}
            </div>
          )}
        </div>
      )}

      {/* 앱 설명 */}
      {snapshot.description && (
        <div>
          <button onClick={() => setDescOpen(!descOpen)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 12, fontWeight: 600, color: "#555", display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ transform: descOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▸</span>
            앱 설명
          </button>
          {descOpen && (
            <div style={{
              marginTop: 8, padding: "12px 14px", background: "#f8f9fa",
              borderRadius: 10, fontSize: 12, color: "#666", lineHeight: 1.7,
              whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid #f0f0f0",
            }}>
              {snapshot.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 변경 히스토리 아이템 ────────────────────────────────────── */
function ChangeItem({ item }) {
  const [open, setOpen] = useState(false);
  const competitor = (item.tags || []).find(t => t === "baemin" || t === "coupangeats");
  const cfg = competitor ? COMPETITORS[competitor + "_appstore"] : { name: "?", color: "#999", icon: "?" };
  const isVersionChange = item.title && item.title.includes("→");

  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
        border: isVersionChange ? "1px solid #ffd54f" : "1px solid #f0f0f0",
        background: isVersionChange ? "#fffde7" : "#fafafa",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 7, background: cfg.color,
          color: "#fff", fontSize: 10, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{cfg.icon}</span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#222" }}>{item.title}</div>
        <div style={{ fontSize: 10, color: "#bbb", whiteSpace: "nowrap" }}>{formatDate(item.date)}</div>
      </div>
      {open && item.detail && (
        <div
          style={{
            marginTop: 10, padding: "12px 14px", background: "#fff",
            borderRadius: 8, border: "1px solid #e8e8e8",
            fontSize: 12, color: "#333", lineHeight: 1.7,
          }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(item.detail) }}
        />
      )}
    </div>
  );
}

/* ── 뉴스 섹션 ──────────────────────────────────────────────── */
function NewsSection({ news }) {
  if (!news) return null;
  const sections = [
    { key: "baemin", label: "배민", color: "#2AC1BC" },
    { key: "coupangeats", label: "쿠팡이츠", color: "#E31837" },
    { key: "industry", label: "배달앱 시장", color: "#666" },
  ];

  const hasAny = sections.some(s => news[s.key]?.length > 0);
  if (!hasAny) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>최신 뉴스</div>
      {sections.map(s => {
        const items = news[s.key];
        if (!items || items.length === 0) return null;
        return (
          <div key={s.key} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: s.color, marginBottom: 6,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: "inline-block" }} />
              {s.label}
            </div>
            {items.map((item, i) => (
              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{
                display: "block", padding: "8px 12px", borderRadius: 8,
                background: "#fff", border: "1px solid #f0f0f0", marginBottom: 4,
                textDecoration: "none", transition: "border-color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#ccc"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#f0f0f0"}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#222", lineHeight: 1.5 }}>{item.title}</div>
                <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
                  {item.source && <span style={{ marginRight: 8 }}>{item.source}</span>}
                  {item.pubDate && new Date(item.pubDate).toLocaleDateString("ko-KR")}
                </div>
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ── 메인 모달 ───────────────────────────────────────────────── */
export default function CompetitorMonitor({ onClose }) {
  const [snapshots, setSnapshots] = useState({});
  const [changes, setChanges] = useState([]);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}?view=dashboard`);
      const data = await res.json();
      if (data.ok) {
        setSnapshots(data.snapshots || {});
        setChanges(data.changes || []);
        setNews(data.news || null);
      } else {
        setError("데이터를 불러오지 못했습니다.");
      }
    } catch (e) {
      setError("API 연결 실패: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(API_BASE, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setScanResult(data);
        await fetchDashboard();
      }
    } catch (e) {
      setError("스캔 오류: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "rgba(0,0,0,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%", maxWidth: 720, maxHeight: "88vh",
        background: "#f5f5f5", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        fontFamily: "'Pretendard', sans-serif",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "18px 24px 14px", background: "#fff",
          borderBottom: "1px solid #eee",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>경쟁사 모니터링</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>배민 / 쿠팡이츠 — 앱스토어 버전 · 릴리즈노트 · 설명 변경 추적</div>
          </div>
          <button onClick={runScan} disabled={scanning} style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            cursor: scanning ? "not-allowed" : "pointer",
            background: scanning ? "#e0e0e0" : "#111", color: scanning ? "#999" : "#fff",
            fontSize: 12, fontWeight: 600,
          }}>{scanning ? "스캔 중..." : "지금 스캔"}</button>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #e5e5e5",
            background: "transparent", cursor: "pointer", fontSize: 14, color: "#999",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>x</button>
        </div>

        {/* 스캔 결과 배너 */}
        {scanResult && (
          <div style={{
            margin: "12px 20px 0", padding: "10px 14px",
            background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0",
            fontSize: 12, color: "#166534",
          }}>
            스캔 완료 ({formatDate(scanResult.scannedAt)}) —{" "}
            {scanResult.results?.map(r =>
              `${r.source}: ${r.status === "change_detected" ? "변경 감지 (v" + r.version + ")" : "변경 없음 (v" + r.version + ")"}`
            ).join(" / ")}
          </div>
        )}

        {error && (
          <div style={{
            margin: "12px 20px 0", padding: "10px 14px",
            background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca",
            fontSize: 12, color: "#991b1b",
          }}>{error}</div>
        )}

        {/* 콘텐츠 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#ccc", fontSize: 13 }}>로딩 중...</div>
          ) : (
            <>
              {/* 현재 상태 카드 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {Object.keys(COMPETITORS).map(sourceId => (
                  <CompetitorCard key={sourceId} sourceId={sourceId} snapshot={snapshots[sourceId]} />
                ))}
              </div>

              {/* 뉴스 */}
              <NewsSection news={news} />

              {/* 변경 히스토리 */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 10 }}>변경 히스토리</div>
                {changes.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#ccc", fontSize: 12 }}>변경 감지 기록 없음</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {changes.map(item => <ChangeItem key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
