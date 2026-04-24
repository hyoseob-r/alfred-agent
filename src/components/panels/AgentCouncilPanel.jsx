import { useState, useEffect } from "react";
import { chatAPI, streamChatAPI } from "../../api/proxy";
import { AGENT_COUNCIL_PROMPTS, SPECIAL_PANEL_AGENTS, SPECIAL_PANEL_PROMPTS } from "../../prompts/council";
import { FACT_CHECK_STANDARD, DEBATE_ROUND_PROMPT } from "../../prompts/council";
import { dbNextCouncilId, dbSaveCouncilSession } from "../../api/supabase";
import { MarkdownRenderer, openFullView } from "../../utils/markdown";

const AGENTS = [
  { id: "ux",              role: "Ms. Designer",     icon: "🎨", color: "#6c8ebf" },
  { id: "dev",             role: "Mr. Engineer",     icon: "💻", color: "#5a9e8f" },
  { id: "biz",             role: "Ms. Strategist",   icon: "📊", color: "#c97b3a" },
  { id: "pm",              role: "Mr. PM",           icon: "🗂️", color: "#7b68b5" },
  { id: "data",            role: "Ms. Data",         icon: "📈", color: "#4a9e8f" },
  { id: "marketing",       role: "Mr. Marketing",    icon: "📣", color: "#bf6c6c" },
  { id: "factchecker",     role: "Dr. Veritas",      icon: "🔍", color: "#888888" },
  { id: "legal",           role: "Ms. Legal",        icon: "⚖️", color: "#2d6a9f" },
  { id: "sajang_analyst",  role: "한사장 (구조분석형)", icon: "🔬", color: "#3a6eb5" },
  { id: "sajang_survive",  role: "김사장 (생존형)",    icon: "😰", color: "#c0783a" },
  { id: "sajang_growth",   role: "박사장 (성장형)",    icon: "🌱", color: "#4a9e5f" },
  { id: "sajang_distrust", role: "이사장 (불신형)",    icon: "🤨", color: "#8b5e8b" },
  { id: "sajang_busy",     role: "최사장 (바쁜형)",    icon: "⏰", color: "#b05050" },
  { id: "sajang_review",   role: "정사장 (리뷰강박형)", icon: "⭐", color: "#b5903a" },
  { id: "sajang_resign",   role: "오사장 (체념형)",    icon: "😮‍💨", color: "#777777" },
  { id: "user_explore",    role: "탐색형 고객",        icon: "🔭", color: "#3a7eb5" },
  { id: "user_purpose",    role: "목적형 고객",        icon: "🎯", color: "#3a9e6f" },
  { id: "user_coupon",     role: "쿠폰헌터형 고객",    icon: "🎟️", color: "#b03a8a" },
  { id: "user_category",   role: "카테고리 단골형 고객", icon: "🔁", color: "#5a7abf" },
  { id: "user_selective",  role: "선택적 고객",         icon: "🧐", color: "#7a5a3a" },
];

const ROUND_CONFIG = [
  { round: 1, label: "사장님 반응",   subtitle: "사장님 7인", color: "#c0783a",
    agentIds: ["sajang_analyst","sajang_survive","sajang_growth","sajang_distrust","sajang_busy","sajang_review","sajang_resign"],
    contextIntro: "다음 전략/솔루션에 대한 현장 사장님 반응을 평가해 주십시오:\n\n" },
  { round: 2, label: "소비자 반응",   subtitle: "고객 5인",   color: "#b03a8a",
    agentIds: ["user_explore","user_purpose","user_coupon","user_category","user_selective"],
    contextIntro: "\n위 사장님 반응을 참고하여, 소비자 입장에서 이 전략을 평가해 주십시오.\n" },
  { round: 3, label: "전문가 재평가", subtitle: "전문가 8인", color: "#6c8ebf",
    agentIds: ["ux","dev","biz","pm","data","marketing","legal","factchecker"],
    contextIntro: "\n위 사장님·소비자 반응을 종합하여, 전문가 관점에서 전략의 실현 가능성을 재평가하십시오.\n" },
];

const getAgentsForRound = (round) => AGENTS.filter(a => ROUND_CONFIG[round - 1]?.agentIds.includes(a.id));

export default function AgentCouncilPanel({ solutionContent, onClose, user, sessionId, isOwner }) {
  const [rounds, setRounds] = useState([]);
  const [currentSteps, setCurrentSteps] = useState(getAgentsForRound(1).map(a => ({ ...a, status: "waiting", result: "" })));
  const [currentRound, setCurrentRound] = useState(1);
  const [roundDone, setRoundDone] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [fullContext, setFullContext] = useState("");
  const [conflicts, setConflicts] = useState("");
  const [detectingConflicts, setDetectingConflicts] = useState(false);
  const [collapsedRounds, setCollapsedRounds] = useState({});
  const [councilId, setCouncilId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [specialSteps, setSpecialSteps] = useState([]);
  const [specialDone, setSpecialDone] = useState(false);

  const updateStep = (id, updates) =>
    setCurrentSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

  const runRound = async (roundNum, baseContext) => {
    const roundAgents = getAgentsForRound(roundNum);
    setIsRunning(true);
    setRoundDone(false);
    setCurrentSteps(roundAgents.map(a => ({ ...a, status: "waiting", result: "" })));

    let context = baseContext;
    const roundSteps = [];

    for (const agent of roundAgents) {
      updateStep(agent.id, { status: "running", result: "" });
      try {
        const isFactChecker = agent.id === "factchecker";
        const basePrompt = AGENT_COUNCIL_PROMPTS[agent.id];
        const systemPrompt = isFactChecker
          ? basePrompt
          : roundNum === 1
            ? `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}`
            : `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}\n\n---\n\n${DEBATE_ROUND_PROMPT}`;

        let result = "";
        await streamChatAPI(
          { model: "claude-sonnet-4-5-20251001", max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: context }] },
          (chunk) => {
            result += chunk;
            updateStep(agent.id, { status: "running", result });
          }
        );
        updateStep(agent.id, { status: "done", result });
        context += `\n\n[${agent.role} ${roundNum}라운드 의견]\n${result}`;
        roundSteps.push({ ...agent, result, status: "done" });
      } catch (e) {
        const errMsg = `오류가 발생했습니다: ${e.message}`;
        updateStep(agent.id, { status: "error", result: errMsg });
        roundSteps.push({ ...agent, result: errMsg, status: "error" });
      }
    }

    setFullContext(context);
    const newRounds = [...rounds, { round: roundNum, steps: roundSteps }];
    setRounds(newRounds);
    setRoundDone(true);
    setIsRunning(false);

    if (user?.id && isOwner) {
      setSaveStatus("saving");
      try {
        let cId = councilId;
        if (!cId) {
          cId = await dbNextCouncilId('a');
          setCouncilId(cId);
        }
        await dbSaveCouncilSession({
          id: cId, sessionId, userId: user.id,
          topic: solutionContent.slice(0, 200),
          rounds: newRounds, summary: null,
        });
        setSaveStatus("saved");
      } catch (e) {
        console.error("council save error:", e);
        setSaveStatus("error");
      }
    }
  };

  const runSpecialPanel = async () => {
    setIsRunning(true);
    setSpecialDone(false);
    setSpecialSteps(SPECIAL_PANEL_AGENTS.map(a => ({ ...a, status: "waiting", result: "" })));
    const contextIntro = `\n\n---\n\n## Special Panel 요청\n위 Council 3라운드 전체 토론을 검토하고, 각자의 렌즈로 평가하십시오.\n\n[토론 전문]\n${fullContext}`;
    const newSteps = [];
    for (const agent of SPECIAL_PANEL_AGENTS) {
      setSpecialSteps(prev => prev.map(s => s.id === agent.id ? { ...s, status: "running" } : s));
      let result = "";
      try {
        await streamChatAPI(
          { model: "claude-sonnet-4-6", max_tokens: 3000, system: SPECIAL_PANEL_PROMPTS[agent.id], messages: [{ role: "user", content: contextIntro }] },
          (chunk) => {
            result += chunk;
            setSpecialSteps(prev => prev.map(s => s.id === agent.id ? { ...s, result } : s));
          }
        );
        setSpecialSteps(prev => prev.map(s => s.id === agent.id ? { ...s, status: "done", result } : s));
      } catch (e) {
        result = `오류: ${e.message}`;
        setSpecialSteps(prev => prev.map(s => s.id === agent.id ? { ...s, status: "error", result } : s));
      }
      newSteps.push({ ...agent, result, status: "done" });
    }
    const newRounds = [...rounds, { round: "special", steps: newSteps }];
    setRounds(newRounds);
    setSpecialDone(true);
    setIsRunning(false);
    if (user?.id && isOwner && councilId) {
      try {
        await dbSaveCouncilSession({ id: councilId, sessionId, userId: user.id, topic: solutionContent.slice(0, 200), rounds: newRounds, summary: null });
      } catch (e) { console.error("special panel save error:", e); }
    }
  };

  const detectConflicts = async (context) => {
    setDetectingConflicts(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-5-20251001", max_tokens: 1000,
        system: `당신은 회의 퍼실리테이터입니다. 6인 전문가의 의견에서 핵심 충돌 지점을 3개 이내로 추출하십시오.
형식: "충돌 1: [주제] — [A 주장] vs [B 주장]" 형태로 간결하게. 한국어로.`,
        messages: [{ role: "user", content: context }],
      });
      const result = data.content?.[0]?.text || "";
      setConflicts(result);
      return result;
    } catch {
      return "";
    } finally {
      setDetectingConflicts(false);
    }
  };

  const saveToWorklog = async () => {
    setSaveStatus("worklog_saving");
    try {
      const summaryData = await chatAPI({
        model: "claude-sonnet-4-5-20251001", max_tokens: 600,
        system: `당신은 회의록 작성자입니다. 다음 멀티라운드 에이전트 토론을 3~5줄로 요약하십시오.
형식:
- 주요 합의: [한 줄]
- 핵심 FACT: [한 줄]
- 최우선 액션: [한 줄]
- Dr. Veritas 최종 신뢰도: [평균 점수]
한국어로. 불릿 포인트만.`,
        messages: [{ role: "user", content: fullContext }],
      });
      const summary = summaryData.content?.[0]?.text || "";

      if (user?.id && isOwner) {
        await dbSaveCouncilSession({
          id: councilId, sessionId, userId: user.id,
          topic: solutionContent.slice(0, 200),
          rounds, summary,
        });
      }

      await fetch("/api/update-worklog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: solutionContent.slice(0, 80), summary }),
      });

      setSaveStatus("worklog_saved");
    } catch (e) {
      console.error("worklog save error:", e);
      setSaveStatus("error");
    }
  };

  const startNextRound = () => {
    if (currentRound >= 3) return;
    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    setCollapsedRounds(prev => ({ ...prev, [currentRound]: true }));

    const config = ROUND_CONFIG[nextRound - 1];
    const nextContext = fullContext
      + `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      + `[${nextRound}라운드 — ${config.label} (${config.subtitle})]\n`
      + config.contextIntro
      + `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    runRound(nextRound, nextContext);
  };

  useEffect(() => {
    const config = ROUND_CONFIG[0];
    const initialContext = config.contextIntro + solutionContent;
    runRound(1, initialContext);
  }, []);

  const AgentStepView = ({ steps }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {steps.map((step) => (
        <div key={step.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: step.color + "22", border: `1px solid ${step.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, marginTop: "2px" }}>
            {step.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: step.status === "waiting" ? "#aaaaaa" : step.color, marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>{step.role}</div>
            {step.status === "waiting" && (
              <div style={{ padding: "10px 14px", background: "#f8f8f8", border: "1px solid #e5e5e5", borderRadius: "4px 12px 12px 12px", color: "#cccccc", fontSize: "12px" }}>대기 중...</div>
            )}
            {step.status === "running" && (
              <div style={{ padding: "10px 14px", background: step.color + "0a", border: `1px solid ${step.color}33`, borderRadius: "4px 12px 12px 12px", display: "flex", gap: "6px", alignItems: "center" }}>
                {[0,1,2].map(j => <div key={j} style={{ width: "6px", height: "6px", borderRadius: "50%", background: step.color, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />)}
                <span style={{ fontSize: "12px", color: step.color, marginLeft: "4px" }}>검토 중...</span>
              </div>
            )}
            {(step.status === "done" || step.status === "error") && (
              <div style={{ padding: "12px 14px", background: step.status === "error" ? "#fff0f0" : "#ffffff", border: `1px solid ${step.status === "error" ? "#f0aaaa" : step.color + "33"}`, borderRadius: "4px 12px 12px 12px" }}>
                <MarkdownRenderer content={step.result} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "720px", maxHeight: "85vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>⚡ 에이전트 어벤저스</span>
            <span style={{ fontSize: "11px", color: "#aaaaaa", marginLeft: "10px" }}>
              {isRunning && specialSteps.some(s => s.status === "running")
                ? "✦ Special Panel 진행 중..."
                : isRunning
                  ? `${currentRound}R — ${ROUND_CONFIG[currentRound-1]?.label} (${ROUND_CONFIG[currentRound-1]?.subtitle}) 진행 중...`
                  : specialDone ? "✦ Special Panel 완료"
                  : `${currentRound}R — ${ROUND_CONFIG[currentRound-1]?.label} 완료`}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {rounds.map(r => (
              <button key={r.round} onClick={() => setCollapsedRounds(prev => ({ ...prev, [r.round]: !prev[r.round] }))}
                style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "10px", cursor: "pointer", border: "1px solid #cccccc", background: collapsedRounds[r.round] ? "#f0f0f0" : "#111111", color: collapsedRounds[r.round] ? "#888888" : "#ffffff", transition: "all 0.2s" }}>
                R{r.round}
              </button>
            ))}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px", marginLeft: "4px" }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>

          {rounds.map(r => (
            <div key={r.round}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: ROUND_CONFIG[r.round-1]?.color || "#888888", letterSpacing: "0.15em" }}>
                  {r.round}R — {ROUND_CONFIG[r.round-1]?.label || "심층 토론"} <span style={{ fontWeight: 400, opacity: 0.7 }}>({ROUND_CONFIG[r.round-1]?.subtitle})</span>
                </div>
                <div style={{ flex: 1, height: "1px", background: "#e5e5e5" }} />
                <button onClick={() => setCollapsedRounds(prev => ({ ...prev, [r.round]: !prev[r.round] }))}
                  style={{ fontSize: "10px", color: "#aaaaaa", background: "none", border: "none", cursor: "pointer" }}>
                  {collapsedRounds[r.round] ? "펼치기 ↓" : "접기 ↑"}
                </button>
              </div>
              {!collapsedRounds[r.round] && <AgentStepView steps={r.steps} />}
            </div>
          ))}

          {isRunning && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: ROUND_CONFIG[currentRound-1]?.color || "#6c8ebf", letterSpacing: "0.15em" }}>
                  {currentRound}R — {ROUND_CONFIG[currentRound-1]?.label} ({ROUND_CONFIG[currentRound-1]?.subtitle}) ●
                </div>
                <div style={{ flex: 1, height: "1px", background: "#ddeeff" }} />
              </div>
              <AgentStepView steps={currentSteps} />
            </div>
          )}

          {detectingConflicts && (
            <div style={{ padding: "12px 16px", background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "10px", fontSize: "12px", color: "#888800" }}>
              ⚡ 충돌 지점 분석 중...
            </div>
          )}

          {conflicts && !detectingConflicts && !isRunning && (
            <div style={{ padding: "14px 16px", background: "#fff9e6", border: "1px solid #ffe58f", borderRadius: "10px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#c97b3a", marginBottom: "8px", letterSpacing: "0.1em" }}>⚡ 핵심 충돌 지점</div>
              <MarkdownRenderer content={conflicts} />
            </div>
          )}

          {/* Special Panel 결과 */}
          {specialSteps.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#888800", letterSpacing: "0.15em" }}>
                  ✦ SPECIAL PANEL — Jobs · Musk · Buffett
                </div>
                <div style={{ flex: 1, height: "1px", background: "#e5e5e5" }} />
              </div>
              <AgentStepView steps={specialSteps} />
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={() => openFullView(rounds.map(r => `# ${r.round}라운드\n\n` + r.steps.map(s => `## ${s.role}\n\n${s.result}`).join("\n\n---\n\n")).join("\n\n═══════════════════\n\n"))}
              style={{ padding: "6px 16px", background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
              ↗ 전체 보기
            </button>
            {saveStatus === "saving" && <span style={{ fontSize: "10px", color: "#aaaaaa" }}>저장 중...</span>}
            {saveStatus === "saved" && (
              <button onClick={saveToWorklog} disabled={saveStatus === "worklog_saving" || saveStatus === "worklog_saved"}
                style={{ padding: "6px 14px", background: saveStatus === "worklog_saved" ? "#eeffee" : "#f0f8ff", border: `1px solid ${saveStatus === "worklog_saved" ? "#88cc88" : "#aaccee"}`, borderRadius: "20px", color: saveStatus === "worklog_saved" ? "#448844" : "#336699", fontSize: "11px", cursor: saveStatus === "worklog_saved" ? "default" : "pointer" }}>
                {saveStatus === "worklog_saved" ? "✅ WORKLOG 저장됨" : "📋 WORKLOG에 기록"}
              </button>
            )}
            {saveStatus === "worklog_saving" && <span style={{ fontSize: "10px", color: "#aaaaaa" }}>WORKLOG 업데이트 중...</span>}
            {saveStatus === "error" && <span style={{ fontSize: "10px", color: "#cc4444" }}>저장 오류</span>}
          </div>
          {roundDone && !isRunning && currentRound < 3 && (
            <button onClick={startNextRound}
              style={{ padding: "8px 20px", background: "#111111", border: "1px solid #111111", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>
              {ROUND_CONFIG[currentRound]?.label} → ({ROUND_CONFIG[currentRound]?.subtitle})
            </button>
          )}
          {roundDone && !isRunning && currentRound >= 3 && !specialDone && specialSteps.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#4a9e5f", fontWeight: 600 }}>✅ 19인 완료</span>
              <button onClick={runSpecialPanel}
                style={{ padding: "8px 18px", background: "linear-gradient(135deg, #111 0%, #333 100%)", border: "1px solid #555", borderRadius: "20px", color: "#fff", fontSize: "12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🍎🚀💰</span> Special Panel 소집
              </button>
            </div>
          )}
          {specialDone && (
            <span style={{ fontSize: "12px", color: "#888800", fontWeight: 600 }}>✦ Special Panel 완료</span>
          )}
        </div>
      </div>
    </div>
  );
}
