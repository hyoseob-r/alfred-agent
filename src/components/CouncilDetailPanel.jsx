import { useState } from "react";

const AGENTS = [
  { id: "ux",            role: "Ms. Designer",            icon: "🎨", color: "#6c8ebf" },
  { id: "dev",           role: "Mr. Engineer",            icon: "💻", color: "#5a9e8f" },
  { id: "biz",           role: "Ms. Strategist",          icon: "📊", color: "#c97b3a" },
  { id: "pm",            role: "Mr. PM",                  icon: "🗂️", color: "#7b68b5" },
  { id: "data",          role: "Ms. Data",                icon: "📈", color: "#4a9e8f" },
  { id: "marketing",     role: "Mr. Marketing",           icon: "📣", color: "#bf6c6c" },
  { id: "factchecker",   role: "Dr. Veritas",             icon: "🔍", color: "#888888" },
  { id: "legal",         role: "Ms. Legal",               icon: "⚖️", color: "#2d6a9f" },
  { id: "sajang_analyst",  role: "한사장 (구조분석형)",  icon: "🔬", color: "#3a6eb5" },
  { id: "sajang_survive",  role: "김사장 (생존형)",      icon: "😰", color: "#c0783a" },
  { id: "sajang_growth",   role: "박사장 (성장형)",      icon: "🌱", color: "#4a9e5f" },
  { id: "sajang_distrust", role: "이사장 (불신형)",      icon: "🤨", color: "#8b5e8b" },
  { id: "sajang_busy",     role: "최사장 (바쁜형)",      icon: "⏰", color: "#b05050" },
  { id: "sajang_review",   role: "정사장 (리뷰강박형)",  icon: "⭐", color: "#b5903a" },
  { id: "sajang_resign",   role: "오사장 (체념형)",      icon: "😮‍💨", color: "#777777" },
  { id: "user_explore",    role: "탐색형 고객",           icon: "🔭", color: "#3a7eb5" },
  { id: "user_purpose",    role: "목적형 고객",           icon: "🎯", color: "#3a9e6f" },
  { id: "user_coupon",     role: "쿠폰헌터형 고객",      icon: "🎟️", color: "#b03a8a" },
  { id: "user_category",   role: "카테고리 단골형 고객", icon: "🔁", color: "#5a7abf" },
  { id: "user_selective",  role: "선택적 고객",           icon: "🧐", color: "#7a5a3a" },
];

function downloadCouncilAsPdf(council) {
  const date = new Date(council.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const roundsHtml = (council.rounds || []).map((round, ri) => {
    const label = round.round ? `${round.round}라운드` : `${ri + 1}라운드`;
    const steps = (round.steps || []).map(step => `
      <div class="step">
        <div class="step-role">${step.role || step.id || ''}</div>
        <div class="step-result">${(step.result || '').replace(/\n/g, '<br>')}</div>
      </div>`).join('');
    return `<div class="round"><div class="round-label">${label}</div>${steps}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${council.topic || 'Council'}</title>
<style>
  body { font-family: 'Pretendard', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px 24px; color: #111; font-size: 13px; line-height: 1.7; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #888; margin-bottom: 24px; }
  .summary { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px; margin-bottom: 24px; white-space: pre-wrap; }
  .round { margin-bottom: 24px; }
  .round-label { font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.1em; padding: 6px 10px; background: #f5f5f5; border-radius: 6px; margin-bottom: 12px; }
  .step { margin-bottom: 14px; padding-left: 12px; border-left: 2px solid #e5e5e5; }
  .step-role { font-size: 11px; font-weight: 700; color: #7b68b5; margin-bottom: 4px; }
  .step-result { font-size: 12px; color: #333; white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${council.topic || 'Council'}</h1>
<div class="meta">${council.id || ''} · ${date} · Alfred Agent</div>
${council.summary ? `<div class="summary"><b>요약</b><br>${council.summary}</div>` : ''}
${roundsHtml}
<script>window.onload = () => window.print();<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

export default function CouncilDetailPanel({ council, onClose, isOwner }) {
  const agentMap = Object.fromEntries(AGENTS.map(a => [a.id, a]));
  const data = council;
  const [collapsed, setCollapsed] = useState({});
  const [expandedSteps, setExpandedSteps] = useState({});
  const toggleStep = (key) => setExpandedSteps(p => ({ ...p, [key]: !p[key] }));

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(640px, 100vw)", zIndex: 400, background: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "10px", color: "#aaaaaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              Council 토론 기록 · {new Date(council.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {council.id && <span style={{ background: "#f0f0ff", color: "#7777cc", padding: "1px 6px", borderRadius: "4px", fontSize: "9px", fontFamily: "monospace" }}>{council.id}</span>}
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#222222", lineHeight: "1.4" }}>
              {data.topic}
            </div>
          </div>
          {!isOwner && (
            <button onClick={() => downloadCouncilAsPdf(council)}
              style={{ padding: "5px 12px", background: "#111", border: "none", borderRadius: "6px", color: "#fff", fontSize: "11px", cursor: "pointer", fontWeight: "600", flexShrink: 0 }}>
              PDF 저장
            </button>
          )}
          <button onClick={onClose}
            style={{ width: "28px", height: "28px", background: "none", border: "1px solid #e5e5e5", borderRadius: "6px", color: "#aaaaaa", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#aaaaaa"; e.currentTarget.style.color = "#555555"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {data.summary && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#888888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>요약</div>
              <div style={{ padding: "12px 16px", background: "#f8f8f8", border: "1px solid #e5e5e5", borderRadius: "10px", minHeight: "44px" }}>
                <div style={{ fontSize: "12px", color: "#444444", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>{data.summary}</div>
              </div>
            </div>
          )}

          {(data.rounds || []).map((round, ri) => {
            const steps = round.steps || [];
            const roundLabel = round.round ? `${round.round}라운드` : (round.id || `${ri + 1}라운드`);
            const isSummaryRound = steps.length === 0 && round.result;
            return (
              <div key={ri} style={{ marginBottom: "16px" }}>
                <button onClick={() => setCollapsed(p => ({ ...p, [ri]: !p[ri] }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f5f5f5", border: "1px solid #e5e5e5", borderRadius: "8px", cursor: "pointer", marginBottom: collapsed[ri] ? 0 : "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#555555" }}>{roundLabel}</span>
                  <span style={{ fontSize: "10px", color: "#aaaaaa" }}>{isSummaryRound ? "요약" : `${steps.length}명 참여`}</span>
                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "#aaaaaa" }}>{collapsed[ri] ? "▼" : "▲"}</span>
                </button>
                {!collapsed[ri] && (
                  isSummaryRound ? (
                    <div style={{ fontSize: "12px", color: "#444444", lineHeight: "1.7", whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eeeeee", borderRadius: "8px", padding: "10px 12px", marginLeft: "8px" }}>
                      {round.result}
                    </div>
                  ) : steps.map((step, si) => {
                    const ag = agentMap[step.id] || { icon: "🤖", color: "#888888", role: step.role || step.id };
                    const stepKey = `${ri}-${si}`;
                    const isOpen = !!expandedSteps[stepKey];
                    return (
                      <div key={si} style={{ marginBottom: "8px", paddingLeft: "8px" }}>
                        <button onClick={() => toggleStep(stepKey)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: isOpen ? ag.color + "08" : "#fafafa", border: `1px solid ${isOpen ? ag.color + "44" : "#eeeeee"}`, borderRadius: isOpen ? "8px 8px 0 0" : "8px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: ag.color + "22", border: `1px solid ${ag.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>{ag.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: ag.color }}>{ag.role}</span>
                            {!isOpen && step.result && (
                              <span style={{ fontSize: "11px", color: "#888888", marginLeft: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", maxWidth: "calc(100% - 80px)", verticalAlign: "middle" }}>
                                {step.result.replace(/\n/g, " ").slice(0, 80)}{step.result.length > 80 ? "…" : ""}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: "10px", color: "#cccccc", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                        </button>
                        {isOpen && (
                          <div style={{ fontSize: "12px", color: "#444444", lineHeight: "1.8", whiteSpace: "pre-wrap", background: "#fafafa", border: `1px solid ${ag.color}33`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px" }}>
                            {step.result}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
