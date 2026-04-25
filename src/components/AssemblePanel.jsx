import { useState } from "react";
import AgentCouncilPanel from "./panels/AgentCouncilPanel";
import UTSimPanel from "./panels/UTSimPanel";

export default function AssemblePanel({ user, sessionId, isOwner }) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [showCouncil, setShowCouncil] = useState(false);
  const [showUT, setShowUT] = useState(false);
  const [councilRounds, setCouncilRounds] = useState([]);
  const [councilContext, setCouncilContext] = useState("");

  const canRun = input.trim().length > 0;

  const handleAssemble = () => {
    if (!canRun) return;
    setSubmitted(input.trim());
    setShowCouncil(true);
  };

  const handleUT = () => {
    if (!canRun) return;
    setSubmitted(input.trim());
    setShowUT(true);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 설명 헤더 */}
      <div style={{ padding: "20px 24px 0", background: "#ffffff" }}>
        <div style={{ fontSize: "11px", color: "#aaaaaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>Assemble</div>
        <div style={{ fontSize: "13px", color: "#444444", lineHeight: "1.7", marginBottom: "20px" }}>
          솔루션 아이디어를 입력하면 <strong>19인 전문가·사장님·고객 Council</strong>이 즉시 토론합니다.<br />
          M1~M5 절차 없이 바로 실행합니다.
        </div>

        {/* 파이프라인 흐름 표시 */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "24px", flexWrap: "wrap" }}>
          {[
            { icon: "🔬", label: "사장님 7인", color: "#c0783a" },
            { icon: "👥", label: "고객 5인",   color: "#3a7eb5" },
            { icon: "🎨", label: "전문가 7인", color: "#7b68b5" },
          ].map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: g.color + "12", border: `1px solid ${g.color}44`, borderRadius: "20px" }}>
                <span style={{ fontSize: "12px" }}>{g.icon}</span>
                <span style={{ fontSize: "11px", color: g.color, fontWeight: 600 }}>{g.label}</span>
              </div>
              {i < 2 && <span style={{ fontSize: "10px", color: "#cccccc" }}>→</span>}
            </div>
          ))}
          <span style={{ fontSize: "10px", color: "#cccccc" }}>→</span>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "#11111108", border: "1px solid #cccccc", borderRadius: "20px" }}>
            <span style={{ fontSize: "11px", color: "#555555", fontWeight: 600 }}>3라운드 토론</span>
          </div>
        </div>
      </div>

      {/* 입력 영역 */}
      <div style={{ padding: "0 24px 24px", background: "#ffffff", borderBottom: "1px solid #e5e5e5" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`솔루션 아이디어를 입력하세요.\n\n예시:\n배달앱에서 마감 30분 전 재고 상품을 최대 40% 할인하는 "마감특가관" 기능.\n사장님은 재고 손실 방지, 고객은 할인 혜택을 얻는 Win-Win 구조.`}
          rows={6}
          style={{
            width: "100%", background: "#f8f8f8", border: "1px solid #e5e5e5",
            borderRadius: "12px", padding: "14px 16px", color: "#111111",
            fontSize: "13px", resize: "none", outline: "none", lineHeight: "1.7",
            transition: "border-color 0.2s", boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "#aaaaaa"}
          onBlur={e => e.target.style.borderColor = "#e5e5e5"}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button
            onClick={handleAssemble}
            disabled={!canRun}
            style={{
              flex: 1, padding: "12px 0",
              background: canRun ? "#111111" : "#e5e5e5",
              border: `1px solid ${canRun ? "#333333" : "#cccccc"}`,
              borderRadius: "10px", color: canRun ? "#ffffff" : "#aaaaaa",
              fontSize: "13px", fontWeight: 700, cursor: canRun ? "pointer" : "not-allowed",
              transition: "all 0.2s", letterSpacing: "0.04em",
            }}
            onMouseEnter={e => { if (canRun) e.currentTarget.style.background = "#333333"; }}
            onMouseLeave={e => { if (canRun) e.currentTarget.style.background = "#111111"; }}
          >
            🧑‍🤝‍🧑 Assemble — Council 시작
          </button>
          <button
            onClick={handleUT}
            disabled={!canRun}
            style={{
              padding: "12px 20px",
              background: canRun ? "#f0fff4" : "#f8f8f8",
              border: `1px solid ${canRun ? "#aaeecc" : "#e5e5e5"}`,
              borderRadius: "10px", color: canRun ? "#447755" : "#aaaaaa",
              fontSize: "13px", fontWeight: 600, cursor: canRun ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (canRun) e.currentTarget.style.borderColor = "#77ccaa"; }}
            onMouseLeave={e => { if (canRun) e.currentTarget.style.borderColor = "#aaeecc"; }}
          >
            🧪 UT 시뮬
          </button>
        </div>
      </div>

      {/* 안내 (입력 전) */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
        <div style={{ textAlign: "center", color: "#cccccc" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px", opacity: 0.4 }}>⚖️</div>
          <div style={{ fontSize: "12px", lineHeight: "2" }}>
            아이디어를 입력하고 Assemble을 누르면<br />
            19인이 3라운드로 즉시 검증합니다.
          </div>
        </div>
      </div>

      {showCouncil && submitted && (
        <AgentCouncilPanel
          solutionContent={submitted}
          onClose={() => setShowCouncil(false)}
          user={user}
          sessionId={sessionId}
          isOwner={isOwner}
          initialRounds={councilRounds}
          initialContext={councilContext}
          onRoundsUpdate={(rounds, ctx) => { setCouncilRounds(rounds); if (ctx) setCouncilContext(ctx); }}
        />
      )}
      {showUT && submitted && (
        <UTSimPanel
          solutionContent={submitted}
          onClose={() => setShowUT(false)}
        />
      )}
    </div>
  );
}
