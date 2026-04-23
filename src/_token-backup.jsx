// 토큰 기능 백업 — 2026-04-23 비활성화

// ── dbLoadClaudeToken (App.jsx 2934~2946) ──────────────────────────────────
async function dbLoadClaudeToken(userId) {
  try {
    const resp = await fetch(`/api/get-token?user_id=${encodeURIComponent(userId)}`);
    if (resp.ok) {
      const { token } = await resp.json();
      if (token) {
        try { localStorage.setItem(LS_CLAUDE_TOKEN_KEY, token); } catch { /* ignore */ }
        return token;
      }
    }
  } catch { /* Supabase 실패 → localStorage 폴백 */ }
  try { return localStorage.getItem(LS_CLAUDE_TOKEN_KEY) || null; } catch { return null; }
}

// ── dbSaveClaudeToken (App.jsx 2947~2958) ──────────────────────────────────
async function dbSaveClaudeToken(userId, token) {
  // localStorage에 즉시 저장 (Supabase 실패해도 유지됨)
  try { localStorage.setItem(LS_CLAUDE_TOKEN_KEY, token); } catch { /* ignore */ }
  // Supabase에도 저장 시도 (best-effort)
  try {
    await fetch('/api/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, token }),
    });
  } catch { /* Supabase 실패해도 localStorage에 저장됨 */ }
}

// ── TokenSwitchModal (App.jsx 2990~3043) ────────────────────────────────────
function TokenSwitchModal({ user, currentToken, onSaved, onClose }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const t = token.trim();
    if (!t.startsWith("sk-ant-oat01-")) {
      setError("올바른 Claude Code OAuth 토큰을 입력해 주십시오. (sk-ant-oat01- 로 시작)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dbSaveClaudeToken(user.id, t);
      onSaved(t);
    } catch (e) {
      setError("저장 중 오류가 발생했습니다: " + e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
      <div style={{ background: "#ffffff", borderRadius: "16px", padding: "32px", maxWidth: "400px", width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#111111", marginBottom: "6px" }}>Claude 토큰 변경</div>
        <div style={{ fontSize: "12px", color: "#888888", marginBottom: "6px", lineHeight: "1.6" }}>
          터미널에서 <code style={{ background: "#f5f5f5", padding: "1px 5px", borderRadius: "4px" }}>claude setup-token</code> 실행 후 발급된 토큰을 입력하세요.
        </div>
        {currentToken && (
          <div style={{ fontSize: "11px", color: "#aaaaaa", marginBottom: "16px", fontFamily: "monospace" }}>
            현재: {currentToken.slice(0, 20)}…
          </div>
        )}
        <input
          type="password" placeholder="sk-ant-oat01-..." value={token}
          onChange={e => { setToken(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          autoFocus
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #e5e5e5", borderRadius: "10px", fontSize: "13px", fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: "8px" }}
        />
        {error && <div style={{ fontSize: "12px", color: "#cc3333", marginBottom: "8px" }}>{error}</div>}
        <button onClick={handleSave} disabled={saving || !token.trim()}
          style={{ width: "100%", padding: "12px", background: saving || !token.trim() ? "#cccccc" : "#111111", border: "none", borderRadius: "10px", color: "#ffffff", fontSize: "14px", fontWeight: "600", cursor: saving || !token.trim() ? "default" : "pointer", marginBottom: "8px" }}>
          {saving ? "저장 중..." : "토큰 교체"}
        </button>
        <button onClick={onClose}
          style={{ width: "100%", padding: "10px", background: "transparent", border: "none", color: "#aaaaaa", fontSize: "13px", cursor: "pointer" }}>
          취소
        </button>
      </div>
    </div>
  );
}

// ── GuestLoginScreen (App.jsx 3045~3081) ─────────────────────────────────────
function GuestLoginScreen({ onLogin, onBack }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = () => {
    const t = token.trim();
    if (!t.startsWith("sk-ant-oat01-")) {
      setError("올바른 Claude Code OAuth 토큰을 입력해 주십시오. (sk-ant-oat01- 로 시작)");
      return;
    }
    onLogin(t);
  };
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 20% 50%, #c8c8e0 0%, #f5f5f5 60%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
      <div style={{ background: "#ffffff", borderRadius: "20px", padding: "40px", maxWidth: "400px", width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: "22px", fontWeight: "700", color: "#111111", marginBottom: "8px" }}>토큰으로 시작하기</div>
        <div style={{ fontSize: "13px", color: "#888888", marginBottom: "28px", lineHeight: "1.6" }}>
          터미널에서 <code style={{ background: "#f5f5f5", padding: "1px 6px", borderRadius: "4px", fontSize: "12px" }}>claude setup-token</code> 실행 후 발급된 토큰을 입력하세요.<br />
          <span style={{ color: "#aaaaaa", fontSize: "11px" }}>데이터는 서버에 저장되지 않습니다.</span>
        </div>
        <input
          type="password" placeholder="sk-ant-oat01-..." value={token}
          onChange={e => { setToken(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={{ width: "100%", padding: "13px", border: "1px solid #e5e5e5", borderRadius: "10px", fontSize: "13px", fontFamily: "'Pretendard', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: "8px" }}
        />
        {error && <div style={{ fontSize: "12px", color: "#cc3333", marginBottom: "8px" }}>{error}</div>}
        <button onClick={handleSubmit} disabled={!token.trim()}
          style={{ width: "100%", padding: "13px", background: !token.trim() ? "#cccccc" : "#111111", border: "none", borderRadius: "10px", color: "#ffffff", fontSize: "14px", fontWeight: "600", cursor: !token.trim() ? "default" : "pointer", marginBottom: "10px" }}>
          시작하기
        </button>
        <button onClick={onBack} style={{ width: "100%", padding: "10px", background: "transparent", border: "none", color: "#aaaaaa", fontSize: "13px", cursor: "pointer" }}>
          뒤로
        </button>
      </div>
    </div>
  );
}

// ── TokenRegistrationScreen (App.jsx 3083~3135) ───────────────────────────────
function TokenRegistrationScreen({ user, onRegistered, onSkip }) {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const t = token.trim();
    if (!t.startsWith("sk-ant-oat01-")) {
      setError("올바른 Claude Code OAuth 토큰을 입력해 주십시오. (sk-ant-oat01- 로 시작)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dbSaveClaudeToken(user.id, t);
      onRegistered(t);
    } catch (e) {
      setError("저장 중 오류가 발생했습니다: " + e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 20% 50%, #c8c8e0 0%, #f5f5f5 60%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "440px", background: "#ffffff", borderRadius: "16px", padding: "36px 32px", boxShadow: "0 4px 40px rgba(0,0,0,0.10)" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #111111 0%, #c8c8e0 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", marginBottom: "20px" }}>A</div>
        <div style={{ fontSize: "18px", fontWeight: "700", color: "#111111", marginBottom: "8px" }}>Claude Code 토큰 등록</div>
        <div style={{ fontSize: "13px", color: "#888888", lineHeight: "1.7", marginBottom: "24px" }}>
          본인의 Claude 구독 크레딧을 사용합니다.<br />
          터미널에서 <code style={{ background: "#f5f5f5", padding: "1px 6px", borderRadius: "4px", fontSize: "12px" }}>claude setup-token</code> 실행 후 발급된 토큰을 입력하세요.
        </div>
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="sk-ant-oat01-..."
          style={{ width: "100%", padding: "12px 14px", border: "1px solid #e5e5e5", borderRadius: "10px", fontSize: "13px", fontFamily: "monospace", color: "#111111", outline: "none", marginBottom: "12px", boxSizing: "border-box" }}
        />
        {error && <div style={{ fontSize: "12px", color: "#cc3333", marginBottom: "12px" }}>{error}</div>}
        <button
          onClick={handleSave}
          disabled={saving || !token.trim()}
          style={{ width: "100%", padding: "13px", background: saving || !token.trim() ? "#cccccc" : "#111111", border: "none", borderRadius: "10px", color: "#ffffff", fontSize: "14px", fontWeight: "600", cursor: saving || !token.trim() ? "default" : "pointer", marginBottom: "10px" }}
        >
          {saving ? "저장 중..." : "등록하기"}
        </button>
        <button
          onClick={onSkip}
          style={{ width: "100%", padding: "10px", background: "transparent", border: "none", color: "#aaaaaa", fontSize: "12px", cursor: "pointer" }}
        >
          나중에 등록 (서버 크레딧 사용)
        </button>
      </div>
    </div>
  );
}
