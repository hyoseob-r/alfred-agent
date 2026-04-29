import { Component, useState } from "react";

const FEEDBACK_API = "/api/feedback";

async function submitFeedback(payload) {
  try {
    const resp = await fetch(FEEDBACK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await resp.json();
  } catch (e) {
    console.error("feedback submit failed", e);
    return null;
  }
}

// ─── 전역 에러 트래킹 (window.onerror + unhandledrejection) ──────────────────
let _trackingInstalled = false;

export function installGlobalErrorTracking() {
  if (_trackingInstalled) return;
  _trackingInstalled = true;

  // 일반 JS 런타임 에러
  window.addEventListener("error", (event) => {
    // 이미 ErrorBoundary가 잡은 React 렌더링 에러는 중복 방지
    if (event.error?._fromErrorBoundary) return;
    submitFeedback({
      type: "crash",
      message: `${event.message}\n  at ${event.filename}:${event.lineno}:${event.colno}`,
      stack_trace: event.error?.stack || "",
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
  });

  // 처리 안 된 Promise reject
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason) || "Unhandled Promise Rejection";
    submitFeedback({
      type: "crash",
      message: `[Promise] ${message}`,
      stack_trace: reason?.stack || "",
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
  });
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, feedbackId: null, sent: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  async componentDidCatch(error, info) {
    const result = await submitFeedback({
      type: "crash",
      message: error?.message || "Unknown error",
      stack_trace: (error?.stack || "") + "\n\nComponent Stack:\n" + (info?.componentStack || ""),
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
    if (result?.id) this.setState({ feedbackId: result.id, sent: true });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        position: "fixed", inset: 0, background: "#ffffff", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column",
        gap: "16px", padding: "40px", fontFamily: "Pretendard, sans-serif",
      }}>
        <div style={{ fontSize: "32px" }}>⚠️</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#111" }}>앱에 문제가 발생했습니다</div>
        <div style={{ fontSize: "13px", color: "#666", textAlign: "center", maxWidth: "400px", lineHeight: 1.6 }}>
          {this.state.sent
            ? "크래시 리포트가 자동으로 전송됐습니다. 빠르게 확인 후 수정하겠습니다."
            : "오류 정보를 수집 중입니다..."}
        </div>
        {this.state.feedbackId && (
          <div style={{ fontSize: "11px", color: "#aaa" }}>리포트 ID: {this.state.feedbackId}</div>
        )}
        <div style={{ fontSize: "11px", color: "#999", background: "#f5f5f5", padding: "8px 14px", borderRadius: "8px", maxWidth: "400px", wordBreak: "break-all" }}>
          {this.state.error?.message}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: "10px 24px", background: "#111", color: "#fff", border: "none", borderRadius: "20px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
        >
          새로고침
        </button>
      </div>
    );
  }
}

// ─── 수동 피드백 버튼 + 모달 ──────────────────────────────────────────────────
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    await submitFeedback({
      type: "manual",
      message: message.trim(),
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
    setSending(false);
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setMessage(""); }, 1500);
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(true)}
        title="피드백 보내기"
        style={{
          position: "fixed", bottom: "96px", right: "24px", zIndex: 9000,
          width: "40px", height: "40px", borderRadius: "50%",
          background: "#111", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          transition: "transform 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        💬
      </button>

      {/* 피드백 모달 */}
      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999,
          display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
          padding: "96px 24px",
        }} onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "20px",
            width: "300px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>피드백 보내기</div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#999" }}>✕</button>
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginBottom: "10px", lineHeight: 1.5 }}>
              불편한 점, 버그, 개선 아이디어 무엇이든 좋습니다.
            </div>
            {done ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#44aa66", fontSize: "13px", fontWeight: 600 }}>
                ✓ 전송됐습니다
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="어떤 문제가 있었나요?"
                  rows={4}
                  style={{
                    width: "100%", padding: "10px", border: "1px solid #e5e5e5",
                    borderRadius: "8px", fontSize: "12px", resize: "none",
                    fontFamily: "Pretendard, sans-serif", outline: "none",
                    boxSizing: "border-box", lineHeight: 1.6,
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending || !message.trim()}
                  style={{
                    marginTop: "10px", width: "100%", padding: "10px",
                    background: message.trim() ? "#111" : "#e5e5e5",
                    color: message.trim() ? "#fff" : "#999",
                    border: "none", borderRadius: "10px", fontSize: "12px",
                    fontWeight: 600, cursor: message.trim() ? "pointer" : "default",
                  }}
                >
                  {sending ? "전송 중..." : "보내기"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
