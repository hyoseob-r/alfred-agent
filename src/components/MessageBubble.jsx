import { useState, useEffect } from "react";
import { chatAPI } from "../api/proxy";
import { extractChartSpec, FullViewButton, MarkdownRenderer } from "../utils/markdown";
import { ChartRenderer, DataSummaryCard } from "./ChartRenderer";
import { DocActionBar, M3ActionBar } from "./ActionBars";
import ComparePanel from "./panels/ComparePanel";
import UTSimPanel from "./panels/UTSimPanel";

// Council 라운드 헤더 (인라인)
function CouncilRoundHeader({ msg, onResume }) {
  const color = msg.councilColor || "#6c8ebf";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "20px 0 12px 0" }}>
      <div style={{ width: "3px", height: "20px", background: color, borderRadius: "2px", flexShrink: 0 }} />
      <div style={{ fontSize: "11px", fontWeight: 700, color, letterSpacing: "0.15em" }}>
        {msg.councilRound}R — {msg.councilLabel}
        <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "6px" }}>({msg.councilSubtitle})</span>
      </div>
      <div style={{ flex: 1, height: "1px", background: "#e5e5e5" }} />
      {msg.resumeState && onResume && (
        <button
          onClick={onResume}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", background: "#fff8e8", border: "1px solid #e0b040", borderRadius: "14px", color: "#b07000", fontSize: "10px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#fef0c0"; e.currentTarget.style.borderColor = "#c09000"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff8e8"; e.currentTarget.style.borderColor = "#e0b040"; }}
        >
          ▶ 이어하기
        </button>
      )}
    </div>
  );
}

// Council 에이전트 응답 (인라인 스트리밍)
function CouncilAgentBubble({ msg, onResume }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (msg.councilStatus !== "running") return;
    const start = msg.startedAt || Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [msg.councilStatus, msg.startedAt]);

  const color = msg.agentColor || "#888888";
  const isStopped = msg.councilStatus === "stopped";
  return (
    <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "flex-start" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: color + "22", border: `1px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, marginTop: "2px" }}>
        {msg.agentIcon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color, marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {msg.agentRole}
        </div>
        <div style={{ padding: "12px 14px", background: isStopped ? "#fffbea" : "#ffffff", border: `1px solid ${isStopped ? "#f0c040" : color + "33"}`, borderRadius: "4px 12px 12px 12px" }}>
          {msg.councilStatus === "running" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: msg.content ? "8px" : 0 }}>
              {[0,1,2].map(j => <div key={j} style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />)}
              <span style={{ fontSize: "11px", color, marginLeft: "4px" }}>검토 중...</span>
              <span style={{ fontSize: "11px", color: color + "99", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {elapsed}s <span style={{ color: color + "55" }}>/ ~{msg.estimatedTime || 45}s</span>
              </span>
            </div>
          )}
          {isStopped && !msg.content && (
            <div style={{ fontSize: "10px", color: "#b07800" }}>⏹ 중단됨</div>
          )}
          {isStopped && msg.content && (
            <div style={{ fontSize: "10px", color: "#b07800", marginBottom: "6px" }}>⏸ 부분 응답</div>
          )}
          {msg.content && <MarkdownRenderer content={msg.content} />}
          {isStopped && onResume && msg.resumeState && (
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #f0e0b0" }}>
              <button
                onClick={onResume}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 12px", background: "#fff8e8", border: "1px solid #e0b040", borderRadius: "16px", color: "#b07000", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#fef0c0"; e.currentTarget.style.borderColor = "#c09000"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff8e8"; e.currentTarget.style.borderColor = "#e0b040"; }}
              >
                ▶ 이어하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({ msg, user, sessionId, isOwner, onCouncilUpdate, onCouncilStart, onCouncilResume }) {
  const isUser = msg.role === "user";
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  const [showAssembleUT, setShowAssembleUT] = useState(false);

  const has2pager = !isUser && msg.content && (
    msg.content.includes("문제 정의서") || msg.content.includes("Problem Definition")
  );
  const isM3 = !isUser && msg.stageLabel === "M3 솔루션 설계";

  const handleUploadForCompare = async (uploaded) => {
    if (uploaded.type === "image") {
      const data = await chatAPI({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: "Extract all text content from this document image. Output only the text, preserving structure.",
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: uploaded.mediaType, data: uploaded.data } }, { type: "text", text: "이 문서의 모든 텍스트를 추출해 주십시오." }] }],
      });
      setUploadedDoc({ text: data.content?.[0]?.text || "", name: uploaded.name });
    } else {
      setUploadedDoc({ text: uploaded.data, name: uploaded.name });
    }
    setShowCompare(true);
  };

  // Council 특수 메시지 — 인라인 렌더링
  if (msg.isCouncilRoundHeader) return (
    <CouncilRoundHeader
      msg={msg}
      onResume={msg.resumeState && onCouncilResume ? () => onCouncilResume(msg.resumeState) : null}
    />
  );
  if (msg.isCouncilAgent) return (
    <CouncilAgentBubble
      msg={msg}
      onResume={msg.resumeState && onCouncilResume ? () => onCouncilResume(msg.resumeState) : null}
    />
  );
  if (msg.isCouncilComplete) {
    return (
      <div style={{ margin: "12px 0 20px 48px", padding: "10px 16px", background: "#f0fff4", border: "1px solid #88cc88", borderRadius: "12px", fontSize: "12px", color: "#336633", fontWeight: 600 }}>
        {msg.content}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: (has2pager || isM3) ? "4px" : "16px", gap: "10px", alignItems: "flex-start" }}>
        {!isUser && (
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, #f0f0f5 0%, #e8e8f0 100%)", border: "1px solid #cccccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>A</div>
        )}
        <div style={{ maxWidth: isUser ? "72%" : "calc(100% - 42px)", display: "flex", flexDirection: "column", gap: "6px", alignItems: isUser ? "flex-end" : "flex-start", width: isUser ? undefined : "100%" }}>
          {msg.files?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {msg.files.map((f, i) => f.type === "pdf" ? (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: "#f5f0ff", border: "1px solid #d0aaee", borderRadius: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📄</span>
                  <span style={{ fontSize: "11px", color: "#7740aa" }}>{f.name}</span>
                </div>
              ) : f.type === "data" ? (
                <div key={i} style={{ padding: "6px 12px", background: "#eef8ee", border: "1px solid #90c890", borderRadius: "8px", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: f.stats ? "6px" : 0 }}>
                    <span style={{ fontSize: "14px" }}>📊</span>
                    <span style={{ fontSize: "11px", color: "#3a8a3a" }}>{f.name}</span>
                    {f.parsed && <span style={{ fontSize: "10px", color: "#90c890" }}>{f.parsed.rows.length}행 · {f.parsed.headers.length}열</span>}
                  </div>
                  {f.stats && <DataSummaryCard stats={f.stats} />}
                </div>
              ) : (
                <img key={i} src={f.preview} alt="" style={{ maxWidth: "200px", maxHeight: "200px", objectFit: "cover", borderRadius: "10px", border: "1px solid #cccccc" }} />
              ))}
            </div>
          )}
          {msg.content && (
            <div style={{
              background: isUser ? "linear-gradient(135deg, #111111 0%, #222222 100%)" : "linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)",
              border: isUser ? "1px solid #bbbbbb" : has2pager ? "1px solid #3a5a7a" : "1px solid #cccccc",
              borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              padding: "12px 16px", color: isUser ? "#ffffff" : "#111111", fontSize: "13.5px",
              lineHeight: "1.7", wordBreak: "break-word",
              width: isUser ? undefined : "100%",
            }}>
              {msg.stageLabel && (
                <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: msg.stageColor || "#6c8ebf", marginBottom: "10px", textTransform: "uppercase" }}>
                  {msg.stageIcon} {msg.stageLabel}
                </div>
              )}
              {has2pager && (
                <div style={{ fontSize: "10px", color: "#5a9aaa", marginBottom: "10px", letterSpacing: "0.08em" }}>
                  📄 2-PAGER GENERATED
                </div>
              )}
              {isUser
                ? <div style={{ whiteSpace: "pre-wrap", color: "#f0f0f0", lineHeight: "1.75", fontSize: "13.5px" }}>{msg.content}</div>
                : <MarkdownRenderer content={msg.content} />
              }
            </div>
          )}
          {!isUser && msg.content && (() => {
            const spec = extractChartSpec(msg.content);
            return spec ? <ChartRenderer spec={spec} /> : null;
          })()}
          {!isUser && msg.content && <FullViewButton content={msg.content} />}
        </div>
      </div>

      {has2pager && !isUser && (
        <div style={{ marginBottom: "16px" }}>
          <DocActionBar docContent={msg.content} onUploadForCompare={handleUploadForCompare} />
        </div>
      )}

      {isM3 && (
        <div style={{ marginBottom: "16px" }}>
          <M3ActionBar
            solutionContent={msg.content}
            user={user}
            sessionId={sessionId}
            isOwner={isOwner}
            onCouncilStart={onCouncilStart}
          />
        </div>
      )}

      {/* Assemble — Council 소집 버튼 (인라인 실행) */}
      {msg.isAssemble && !isUser && (
        <div style={{ marginBottom: "16px", marginLeft: "42px", display: "flex", gap: "8px" }}>
          <button
            onClick={() => onCouncilStart?.(msg.assembleContext)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 18px", background: "#111111", border: "1px solid #333333", borderRadius: "20px", color: "#ffffff", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.04em" }}
            onMouseEnter={e => e.currentTarget.style.background = "#333333"}
            onMouseLeave={e => e.currentTarget.style.background = "#111111"}
          >
            ⚡ Council 19인 토론 시작
          </button>
          <button
            onClick={() => setShowAssembleUT(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#f0fff4", border: "1px solid #aaeecc", borderRadius: "20px", color: "#447755", fontSize: "12px", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#77ccaa"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#aaeecc"}
          >
            🧪 UT 시뮬레이션
          </button>
        </div>
      )}

      {showAssembleUT && msg.assembleContext && (
        <UTSimPanel
          solutionContent={msg.assembleContext}
          onClose={() => setShowAssembleUT(false)}
        />
      )}

      {showCompare && uploadedDoc && (
        <ComparePanel
          docA={msg.content}
          docB={uploadedDoc.text}
          onClose={() => setShowCompare(false)}
        />
      )}
    </>
  );
}
