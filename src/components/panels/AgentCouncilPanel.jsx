import { useState, useEffect, useRef } from "react";
import { chatAPI, streamChatAPI } from "../../api/proxy";
import { AGENT_COUNCIL_PROMPTS, SPECIAL_PANEL_AGENTS, SPECIAL_PANEL_PROMPTS } from "../../prompts/council";
import { FACT_CHECK_STANDARD, DEBATE_ROUND_PROMPT } from "../../prompts/council";
import { dbNextCouncilId, dbSaveCouncilSession } from "../../api/supabase";
import { getSelectedModel } from "../../utils/model";
import { MarkdownRenderer, openFullView } from "../../utils/markdown";

export const AGENTS = [
  { id: "ux",              role: "Ms. Designer",     icon: "🎨", color: "#6c8ebf", group: "전문가" },
  { id: "dev",             role: "Mr. Engineer",     icon: "💻", color: "#5a9e8f", group: "전문가" },
  { id: "biz",             role: "Ms. Strategist",   icon: "📊", color: "#c97b3a", group: "전문가" },
  { id: "pm",              role: "Mr. PM",           icon: "🗂️", color: "#7b68b5", group: "전문가" },
  { id: "data",            role: "Ms. Data",         icon: "📈", color: "#4a9e8f", group: "전문가" },
  { id: "marketing",       role: "Mr. Marketing",    icon: "📣", color: "#bf6c6c", group: "전문가" },
  { id: "factchecker",     role: "Dr. Veritas",      icon: "🔍", color: "#888888", group: "전문가" },
  { id: "legal",           role: "Ms. Legal",        icon: "⚖️", color: "#2d6a9f", group: "전문가" },
  { id: "sajang_analyst",  role: "한사장 (구조분석형)", icon: "🔬", color: "#3a6eb5", group: "사장님" },
  { id: "sajang_survive",  role: "김사장 (생존형)",    icon: "😰", color: "#c0783a", group: "사장님" },
  { id: "sajang_growth",   role: "박사장 (성장형)",    icon: "🌱", color: "#4a9e5f", group: "사장님" },
  { id: "sajang_distrust", role: "이사장 (불신형)",    icon: "🤨", color: "#8b5e8b", group: "사장님" },
  { id: "sajang_busy",     role: "최사장 (바쁜형)",    icon: "⏰", color: "#b05050", group: "사장님" },
  { id: "sajang_review",   role: "정사장 (리뷰강박형)", icon: "⭐", color: "#b5903a", group: "사장님" },
  { id: "sajang_resign",   role: "오사장 (체념형)",    icon: "😮‍💨", color: "#777777", group: "사장님" },
  { id: "user_explore",    role: "탐색형 고객",        icon: "🔭", color: "#3a7eb5", group: "소비자" },
  { id: "user_purpose",    role: "목적형 고객",        icon: "🎯", color: "#3a9e6f", group: "소비자" },
  { id: "user_coupon",     role: "쿠폰헌터형 고객",    icon: "🎟️", color: "#b03a8a", group: "소비자" },
  { id: "user_category",   role: "카테고리 단골형 고객", icon: "🔁", color: "#5a7abf", group: "소비자" },
  { id: "user_selective",  role: "선택적 고객",         icon: "🧐", color: "#7a5a3a", group: "소비자" },
];

export const ROUND_CONFIG = [
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

const DEFAULT_ESTIMATE_SEC = 45;

const isRateLimitError = (msg) => {
  const m = (msg || "").toLowerCase();
  return m.includes("429") || m.includes("rate limit") || m.includes("overloaded")
    || m.includes("529") || m === "stream_truncated";
};

export const getAgentsForRound = (round) => AGENTS.filter(a => ROUND_CONFIG[round - 1]?.agentIds.includes(a.id));

export default function AgentCouncilPanel({ solutionContent, onClose, user, sessionId, isOwner, onRoundsUpdate, initialRounds, initialContext }) {
  const [rounds, setRounds] = useState(initialRounds && initialRounds.length > 0 ? initialRounds : []);
  const [currentRound, setCurrentRound] = useState(() => {
    if (initialRounds && initialRounds.length > 0) {
      return Math.max(...initialRounds.map(r => typeof r.round === "number" ? r.round : 0));
    }
    return 1;
  });
  const [currentSteps, setCurrentSteps] = useState([]);
  const [agentQueue, setAgentQueue] = useState([]);
  const [queueProgress, setQueueProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(null); // "manual" | "ratelimit"
  const [pendingNext, setPendingNext] = useState(null);
  const [pausedState, setPausedState] = useState(null);
  const [roundDone, setRoundDone] = useState(() => initialRounds && initialRounds.length > 0);
  const [fullContext, setFullContext] = useState(initialContext || "");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [collapsedRounds, setCollapsedRounds] = useState(() => {
    if (initialRounds && initialRounds.length > 0) {
      const c = {};
      initialRounds.forEach(r => { if (typeof r.round === "number") c[r.round] = true; });
      return c;
    }
    return {};
  });
  const [councilId, setCouncilId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [phase, setPhase] = useState(() => (initialRounds && initialRounds.length > 0) ? "started" : "selecting");
  const [responseMode, setResponseMode] = useState("full"); // "compact" | "full"
  const [selectedIds, setSelectedIds] = useState(() => new Set(AGENTS.map(a => a.id)));
  const activeIdsRef = useRef(new Set(AGENTS.map(a => a.id)));
  const [showPanelEditor, setShowPanelEditor] = useState(false);
  const [specialSteps, setSpecialSteps] = useState([]);
  const [specialDone, setSpecialDone] = useState(false);
  const [agentStartTime, setAgentStartTime] = useState(null);
  const [agentElapsed, setAgentElapsed] = useState(0);
  const abortControllerRef = useRef(null);
  const agentStartRef = useRef(null); // for timing calculation (not subject to stale closure)
  const agentTimingsRef = useRef([]); // completed agent durations (seconds)

  useEffect(() => {
    if (!isRunning || !agentStartTime) { setAgentElapsed(0); return; }
    const t = setInterval(() => setAgentElapsed(Math.floor((Date.now() - agentStartTime) / 1000)), 500);
    return () => clearInterval(t);
  }, [isRunning, agentStartTime]);

  const getEstimatedTime = () => {
    if (agentTimingsRef.current.length === 0) return DEFAULT_ESTIMATE_SEC;
    const sum = agentTimingsRef.current.reduce((a, b) => a + b, 0);
    return Math.round(sum / agentTimingsRef.current.length);
  };

  const AGENT_GROUPS = [
    { label: "사장님", ids: ROUND_CONFIG[0].agentIds },
    { label: "고객",   ids: ROUND_CONFIG[1].agentIds },
    { label: "전문가", ids: ROUND_CONFIG[2].agentIds },
  ];

  const addToQueue = (agent) => setAgentQueue(prev => [...prev, { ...agent, qid: `${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
  const removeFromQueue = (idx) => setAgentQueue(prev => prev.filter((_, i) => i !== idx));
  const moveQueueUp = (idx) => setAgentQueue(prev => { if (idx === 0) return prev; const n = [...prev]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; return n; });
  const moveQueueDown = (idx) => setAgentQueue(prev => { if (idx === prev.length-1) return prev; const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; });

  const handleStart = () => {
    setPhase("started");
    const queue = agentQueue;
    setCurrentSteps(queue.map(a => ({ ...a, status: "waiting", result: "" })));
    runQueueAgent(queue, 0, "다음 전략/솔루션에 대해 각자의 관점에서 평가해 주십시오:\n\n" + solutionContent, []);
  };

  const updateStep = (qid, updates) =>
    setCurrentSteps(prev => prev.map(s => s.qid === qid ? { ...s, ...updates } : s));

  const finishAll = async (context, allSteps) => {
    setFullContext(context);
    const newRounds = [...rounds, { round: 1, steps: allSteps }];
    setRounds(newRounds);
    setRoundDone(true);
    setIsRunning(false);
    setPendingNext(null);
    setAgentStartTime(null);
    onRoundsUpdate?.(newRounds, context);
    if (user?.id && isOwner) {
      setSaveStatus("saving");
      try {
        let cId = councilId;
        if (!cId) { cId = await dbNextCouncilId('a'); setCouncilId(cId); }
        await dbSaveCouncilSession({ id: cId, sessionId, userId: user.id, topic: solutionContent.slice(0, 200), rounds: newRounds, summary: null });
        setSaveStatus("saved");
      } catch (e) { console.error("council save error:", e); setSaveStatus("error"); }
    }
  };

  const runQueueAgent = async (queue, queueIndex, context, existingSteps) => {
    const agent = queue[queueIndex];
    const ac = new AbortController();
    abortControllerRef.current = ac;
    setIsRunning(true);
    setIsPaused(false);
    setPauseReason(null);
    setPausedState(null);
    setPendingNext(null);
    setQueueProgress(queueIndex);
    const now = Date.now();
    setAgentStartTime(now);
    agentStartRef.current = now;
    setCurrentSteps(queue.map((a, i) => {
      if (i < queueIndex) { const done = existingSteps.find(s => s.qid === a.qid); return done ? { ...a, ...done } : { ...a, status: "done", result: "" }; }
      if (i === queueIndex) return { ...a, status: "running", result: "" };
      return { ...a, status: "waiting", result: "" };
    }));
    const basePrompt = AGENT_COUNCIL_PROMPTS[agent.id];
    const modeDirective = responseMode === "compact"
      ? "\n\n---\n\n[응답 형식: 간소화 모드]\n핵심 포인트만 3~5줄 이내. 불릿(•) 위주. 서론/결론 생략. 숫자·수치 있으면 포함. 군더더기 없이."
      : "\n\n---\n\n[응답 형식: 전문 대화형]\n전문가가 실제로 말하듯 자연스럽게. 맥락과 근거를 충분히. 대화체로.";
    const systemPrompt = `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}${modeDirective}`;
    const agentAc = new AbortController();
    const timeoutId = setTimeout(() => agentAc.abort(), 180_000);
    const combinedSignal = AbortSignal.any([ac.signal, agentAc.signal]);
    let result = "";
    let aborted = false;
    let rateLimited = false;
    let timedOut = false;
    try {
      await streamChatAPI(
        { model: getSelectedModel(), max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: context }] },
        (chunk) => { result += chunk; setCurrentSteps(prev => prev.map(s => s.qid === agent.qid ? { ...s, status: "running", result } : s)); },
        combinedSignal
      );
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      if (ac.signal.aborted) { aborted = true; }
      else if (agentAc.signal.aborted) { timedOut = true; }
      else if (isRateLimitError(e.message)) { rateLimited = true; }
      else {
        const errResult = `오류: ${e.message}`;
        setCurrentSteps(prev => prev.map(s => s.qid === agent.qid ? { ...s, status: "error", result: errResult } : s));
        const newSteps = [...existingSteps, { ...agent, result: errResult, status: "error" }];
        setIsRunning(false); setAgentStartTime(null);
        const nextIndex = queueIndex + 1;
        if (nextIndex < queue.length) setPendingNext({ queue, queueIndex: nextIndex, context, existingSteps: newSteps });
        else finishAll(context, newSteps);
        return;
      }
    }
    if (agentStartRef.current) {
      const duration = Math.floor((Date.now() - agentStartRef.current) / 1000);
      if (duration > 2) agentTimingsRef.current.push(duration);
    }
    if (timedOut) {
      const partialResult = result || "⏱ 응답 없음 (타임아웃)";
      setCurrentSteps(prev => prev.map(s => s.qid === agent.qid ? { ...s, status: "done", result: partialResult } : s));
      const newContext = context + (result ? `\n\n[${agent.role} 의견 (부분)]\n${result}` : "");
      const newSteps = [...existingSteps, { ...agent, result: partialResult, status: "done" }];
      setIsRunning(false); setAgentStartTime(null);
      const nextIndex = queueIndex + 1;
      if (nextIndex < queue.length) setPendingNext({ queue, queueIndex: nextIndex, context: newContext, existingSteps: newSteps });
      else finishAll(newContext, newSteps);
      return;
    }
    if (aborted || rateLimited) {
      setCurrentSteps(prev => prev.map(s => s.qid === agent.qid ? { ...s, status: "paused", result } : s));
      const newSteps = [...existingSteps];
      if (result) {
        const newCtx = context + `\n\n[${agent.role} 의견 (부분)]\n${result}`;
        newSteps.push({ ...agent, result, status: "paused" });
        setPausedState({ queue, queueIndex, context: newCtx, existingSteps: newSteps });
      } else {
        setPausedState({ queue, queueIndex, context, existingSteps: newSteps });
      }
      setPauseReason(aborted ? "manual" : "ratelimit");
      setIsPaused(true); setIsRunning(false); setAgentStartTime(null);
      return;
    }
    setCurrentSteps(prev => prev.map(s => s.qid === agent.qid ? { ...s, status: "done", result } : s));
    const newContext = context + `\n\n[${agent.group}·${agent.role} 의견]\n${result}`;
    const newSteps = [...existingSteps, { ...agent, result, status: "done" }];
    setIsRunning(false); setAgentStartTime(null);
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) setPendingNext({ queue, queueIndex: nextIndex, context: newContext, existingSteps: newSteps });
    else finishAll(newContext, newSteps);
  };

  const finishRound = async (roundNum, context, roundSteps) => {
    setFullContext(context);
    const newRounds = [...rounds, { round: roundNum, steps: roundSteps }];
    setRounds(newRounds);
    setRoundDone(true);
    setIsRunning(false);
    setPendingNext(null);
    setAgentStartTime(null);
    onRoundsUpdate?.(newRounds, context);

    if (user?.id && isOwner) {
      setSaveStatus("saving");
      try {
        let cId = councilId;
        if (!cId) { cId = await dbNextCouncilId('a'); setCouncilId(cId); }
        await dbSaveCouncilSession({ id: cId, sessionId, userId: user.id, topic: solutionContent.slice(0, 200), rounds: newRounds, summary: null });
        setSaveStatus("saved");
      } catch (e) { console.error("council save error:", e); setSaveStatus("error"); }
    }
  };

  const runOneAgent = async (roundNum, context, agentIndex, existingSteps) => {
    const roundAgents = getAgentsForRound(roundNum);
    const agent = roundAgents[agentIndex];

    // 비선택 에이전트 스킵
    if (!activeIdsRef.current.has(agent.id)) {
      setCurrentSteps(roundAgents.map((a, i) => {
        if (i < agentIndex) { const done = existingSteps.find(s => s.id === a.id); return done ? { ...a, ...done } : { ...a, status: "done", result: "" }; }
        if (i === agentIndex) return { ...a, status: "skipped", result: "" };
        return { ...a, status: "waiting", result: "" };
      }));
      const newSteps = [...existingSteps, { ...agent, result: "", status: "skipped" }];
      const nextIndex = agentIndex + 1;
      if (nextIndex < roundAgents.length) { runOneAgent(roundNum, context, nextIndex, newSteps); }
      else { finishRound(roundNum, context, newSteps); }
      return;
    }

    const ac = new AbortController();
    abortControllerRef.current = ac;
    setIsRunning(true);
    setIsPaused(false);
    setPauseReason(null);
    setPausedState(null);
    setPendingNext(null);
    const now = Date.now();
    setAgentStartTime(now);
    agentStartRef.current = now;

    setCurrentSteps(roundAgents.map((a, i) => {
      if (i < agentIndex) {
        const done = existingSteps.find(s => s.id === a.id);
        return done ? { ...a, ...done } : { ...a, status: "done", result: "" };
      }
      if (i === agentIndex) return { ...a, status: "running", result: "" };
      return { ...a, status: "waiting", result: "" };
    }));
    const isFactChecker = agent.id === "factchecker";
    const basePrompt = AGENT_COUNCIL_PROMPTS[agent.id];
    const modeDirective = responseMode === "compact"
      ? "\n\n---\n\n[응답 형식: 간소화 모드]\n핵심 포인트만 3~5줄 이내. 불릿(•) 위주. 서론/결론 생략. 숫자·수치 있으면 포함. 군더더기 없이."
      : "\n\n---\n\n[응답 형식: 전문 대화형]\n전문가가 실제로 말하듯 자연스럽게. 맥락과 근거를 충분히. 대화체로.";
    const systemPrompt = isFactChecker
      ? basePrompt + modeDirective
      : roundNum === 1
        ? `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}${modeDirective}`
        : `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}\n\n---\n\n${DEBATE_ROUND_PROMPT}${modeDirective}`;

    // 에이전트별 타임아웃 (180초) — 스트림이 멈춰도 자동으로 다음으로 넘어감
    const agentAc = new AbortController();
    const timeoutId = setTimeout(() => agentAc.abort(), 180_000);
    const combinedSignal = AbortSignal.any([ac.signal, agentAc.signal]);

    let result = "";
    let aborted = false;
    let rateLimited = false;
    let timedOut = false;
    try {
      await streamChatAPI(
        { model: getSelectedModel(), max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: context }] },
        (chunk) => { result += chunk; updateStep(agent.id, { status: "running", result }); },
        combinedSignal
      );
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      if (ac.signal.aborted) {
        aborted = true;
      } else if (agentAc.signal.aborted) {
        timedOut = true;
      } else if (isRateLimitError(e.message)) {
        rateLimited = true;
      } else {
        const errResult = `오류: ${e.message}`;
        updateStep(agent.id, { status: "error", result: errResult });
        const newSteps = [...existingSteps, { ...agent, result: errResult, status: "error" }];
        setIsRunning(false);
        setAgentStartTime(null);
        const nextIndex = agentIndex + 1;
        if (nextIndex < roundAgents.length) {
          setPendingNext({ roundNum, context, agentIndex: nextIndex, existingSteps: newSteps });
        } else {
          finishRound(roundNum, context, newSteps);
        }
        return;
      }
    }

    // record timing for completed or partial responses
    if (agentStartRef.current) {
      const duration = Math.floor((Date.now() - agentStartRef.current) / 1000);
      if (duration > 2) agentTimingsRef.current.push(duration);
    }

    // 타임아웃 → 부분 결과 저장 후 다음 에이전트로 자동 진행
    if (timedOut) {
      const partialResult = result || "⏱ 응답 없음 (타임아웃)";
      updateStep(agent.id, { status: "done", result: result ? partialResult + "\n\n> ⏱ 응답 시간 초과 — 부분 수신" : partialResult });
      const newContext = context + (result ? `\n\n[${agent.role} ${roundNum}라운드 의견 (부분)]\n${result}` : "");
      const newSteps = [...existingSteps, { ...agent, result: partialResult, status: "done" }];
      setIsRunning(false);
      setAgentStartTime(null);
      const nextIndex = agentIndex + 1;
      if (nextIndex < roundAgents.length) {
        setPendingNext({ roundNum, context: newContext, agentIndex: nextIndex, existingSteps: newSteps });
      } else {
        finishRound(roundNum, newContext, newSteps);
      }
      return;
    }

    if (aborted || rateLimited) {
      const reason = aborted ? "manual" : "ratelimit";
      updateStep(agent.id, { status: "paused", result });
      const newSteps = [...existingSteps];
      if (result) {
        const newCtx = context + `\n\n[${agent.role} ${roundNum}라운드 의견 (부분)]\n${result}`;
        newSteps.push({ ...agent, result, status: "paused" });
        setPausedState({ roundNum, context: newCtx, agentIndex, existingSteps: newSteps });
      } else {
        setPausedState({ roundNum, context, agentIndex, existingSteps: newSteps });
      }
      setPauseReason(reason);
      setIsPaused(true);
      setIsRunning(false);
      setAgentStartTime(null);
      return;
    }

    updateStep(agent.id, { status: "done", result });
    const newContext = context + `\n\n[${agent.role} ${roundNum}라운드 의견]\n${result}`;
    const newSteps = [...existingSteps, { ...agent, result, status: "done" }];
    setIsRunning(false);
    setAgentStartTime(null);

    const nextIndex = agentIndex + 1;
    if (nextIndex < roundAgents.length) {
      setPendingNext({ roundNum, context: newContext, agentIndex: nextIndex, existingSteps: newSteps });
    } else {
      finishRound(roundNum, newContext, newSteps);
    }
  };

  const stopCouncil = () => { abortControllerRef.current?.abort(); };

  const resumeCouncil = () => {
    if (!pausedState) return;
    const { queue, queueIndex, context, existingSteps } = pausedState;
    runQueueAgent(queue, queueIndex, context, existingSteps);
  };

  const startRound = (roundNum, baseContext) => {
    setCurrentRound(roundNum);
    setRoundDone(false);
    setPendingNext(null);
    setCurrentSteps(getAgentsForRound(roundNum).map(a => ({ ...a, status: "waiting", result: "" })));
    runOneAgent(roundNum, baseContext, 0, []);
  };

  const startNextRound = async () => {
    if (currentRound >= 3) return;
    const nextRound = currentRound + 1;
    setCollapsedRounds(prev => ({ ...prev, [currentRound]: true }));
    setIsSummarizing(true);
    setRoundDone(false);
    setPendingNext(null);

    const config = ROUND_CONFIG[nextRound - 1];
    let compressedContext = solutionContent;
    try {
      const allPrevText = rounds.map(r =>
        `[${r.round}라운드]\n` + r.steps.map(s => `${s.role}: ${s.result}`).join("\n\n")
      ).join("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
      let summary = "";
      await streamChatAPI(
        { model: getSelectedModel(), max_tokens: 1200,
          system: `당신은 회의 요약 전문가입니다. 멀티라운드 에이전트 토론을 다음 라운드 참가자들이 맥락을 이해할 수 있도록 압축하세요.\n규칙:\n- 각 에이전트의 핵심 주장 1~2줄씩 보존\n- 주요 합의점과 충돌 지점 명시\n- 원본 발언의 핵심 논지는 반드시 유지\n- 한국어로. 절대 중요한 인사이트를 누락하지 말 것.`,
          messages: [{ role: "user", content: `다음 에이전트 토론을 요약해주세요:\n\n${allPrevText}` }] },
        (chunk) => { summary += chunk; }
      );
      compressedContext = `[원래 주제]\n${solutionContent}\n\n[이전 라운드 요약]\n${summary}`;
    } catch { compressedContext = fullContext; }
    finally { setIsSummarizing(false); }

    const nextContext = compressedContext
      + `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      + `[${nextRound}라운드 — ${config.label} (${config.subtitle})]\n`
      + config.contextIntro
      + `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    startRound(nextRound, nextContext);
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
        const specialModeDirective = responseMode === "compact"
          ? "\n\n---\n\n[응답 형식: 간소화 모드]\n핵심 포인트만 3~5줄 이내. 불릿(•) 위주. 서론/결론 생략."
          : "\n\n---\n\n[응답 형식: 전문 대화형]\n전문가가 실제로 말하듯 자연스럽게. 맥락과 근거를 충분히. 대화체로.";
        await streamChatAPI(
          { model: getSelectedModel(), max_tokens: 3000, system: SPECIAL_PANEL_PROMPTS[agent.id] + specialModeDirective, messages: [{ role: "user", content: contextIntro }] },
          (chunk) => { result += chunk; setSpecialSteps(prev => prev.map(s => s.id === agent.id ? { ...s, result } : s)); }
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
    onRoundsUpdate?.(newRounds, fullContext);
    if (user?.id && isOwner && councilId) {
      try { await dbSaveCouncilSession({ id: councilId, sessionId, userId: user.id, topic: solutionContent.slice(0, 200), rounds: newRounds, summary: null }); }
      catch (e) { console.error("special panel save error:", e); }
    }
  };

  const saveToWorklog = async () => {
    setSaveStatus("worklog_saving");
    try {
      const summaryData = await chatAPI({
        model: getSelectedModel(), max_tokens: 600,
        system: `당신은 회의록 작성자입니다. 다음 멀티라운드 에이전트 토론을 3~5줄로 요약하십시오.\n형식:\n- 주요 합의: [한 줄]\n- 핵심 FACT: [한 줄]\n- 최우선 액션: [한 줄]\n- Dr. Veritas 최종 신뢰도: [평균 점수]\n한국어로. 불릿 포인트만.`,
        messages: [{ role: "user", content: fullContext }],
      });
      const summary = summaryData.content?.[0]?.text || "";
      if (user?.id && isOwner) {
        await dbSaveCouncilSession({ id: councilId, sessionId, userId: user.id, topic: solutionContent.slice(0, 200), rounds, summary });
      }
      await fetch("/api/update-worklog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: solutionContent.slice(0, 80), summary }) });
      setSaveStatus("worklog_saved");
    } catch (e) { console.error("worklog save error:", e); setSaveStatus("error"); }
  };

  const retryAgent = async (agent) => {
    const basePrompt = AGENT_COUNCIL_PROMPTS[agent.id];
    const modeDirective = responseMode === "compact"
      ? "\n\n---\n\n[응답 형식: 간소화 모드]\n핵심 포인트만 3~5줄 이내. 불릿(•) 위주. 서론/결론 생략. 숫자·수치 있으면 포함. 군더더기 없이."
      : "\n\n---\n\n[응답 형식: 전문 대화형]\n전문가가 실제로 말하듯 자연스럽게. 맥락과 근거를 충분히. 대화체로.";
    const systemPrompt = `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}${modeDirective}`;
    const updateRoundStep = (updates) =>
      setRounds(prev => prev.map(r => r.round === 1
        ? { ...r, steps: r.steps.map(s => s.qid === agent.qid ? { ...s, ...updates } : s) } : r));
    updateRoundStep({ status: "running", result: "" });
    let result = "";
    try {
      await streamChatAPI(
        { model: getSelectedModel(), max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: fullContext }] },
        (chunk) => { result += chunk; updateRoundStep({ status: "running", result }); }
      );
      updateRoundStep({ status: "done", result });
      setFullContext(prev => prev + `\n\n[${agent.role} 의견 (재시도)]\n${result}`);
    } catch (e) { updateRoundStep({ status: "error", result: `오류: ${e.message}` }); }
  };

  const nextAgentName = pendingNext ? pendingNext.queue?.[pendingNext.queueIndex]?.role : null;

  const estimatedTime = getEstimatedTime();

  const AgentStepView = ({ steps, onRetry }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {steps.map((step) => (
        <div key={step.qid || step.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: step.color + "22",
            border: `1px solid ${step.color}${step.status === "running" ? "cc" : "66"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", flexShrink: 0, marginTop: "2px",
            boxShadow: step.status === "running" ? `0 0 0 3px ${step.color}22, 0 0 12px ${step.color}44` : "none",
            animation: step.status === "running" ? "agentGlow 2s ease-in-out infinite" : "none",
            transition: "box-shadow 0.3s",
          }}>
            {step.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: step.status === "waiting" ? "#aaaaaa" : step.color, marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>{step.role}</div>
            {step.status === "waiting" && (
              <div style={{ padding: "10px 14px", background: "#f8f8f8", border: "1px solid #e5e5e5", borderRadius: "4px 12px 12px 12px", color: "#cccccc", fontSize: "12px" }}>대기 중...</div>
            )}
            {step.status === "skipped" && (
              <div style={{ padding: "8px 14px", background: "#f5f5f5", border: "1px dashed #dddddd", borderRadius: "4px 12px 12px 12px", color: "#bbbbbb", fontSize: "11px" }}>— 건너뜀</div>
            )}
            {step.status === "running" && (
              <div style={{ padding: "14px 16px", background: step.color + "08", border: `1px solid ${step.color}33`, borderRadius: "4px 12px 12px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                    {[0,1,2].map(j => <div key={j} style={{ width: "7px", height: "7px", borderRadius: "50%", background: step.color, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />)}
                    <span style={{ fontSize: "12px", color: step.color, marginLeft: "6px", fontWeight: 500 }}>검토 중...</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "3px", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ fontSize: "26px", fontWeight: 700, color: step.color, lineHeight: 1 }}>{agentElapsed}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: step.color + "aa" }}>s</span>
                    <span style={{ fontSize: "11px", color: step.color + "55", marginLeft: "4px" }}>/ ~{estimatedTime}s</span>
                  </div>
                </div>
                <div style={{ height: "3px", background: step.color + "20", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: `linear-gradient(90deg, ${step.color}88, ${step.color})`, borderRadius: "2px", width: `${Math.min(100, Math.round((agentElapsed / estimatedTime) * 100))}%`, transition: "width 0.5s linear" }} />
                </div>
              </div>
            )}
            {step.status === "paused" && (
              <div style={{ padding: "12px 14px", background: "#fffbea", border: "1px solid #f0c040", borderRadius: "4px 12px 12px 12px" }}>
                <div style={{ fontSize: "10px", color: "#b07800", marginBottom: "6px" }}>⏸ 중단됨{step.result ? " (부분 저장)" : ""}</div>
                {step.result && <MarkdownRenderer content={step.result} />}
              </div>
            )}
            {(step.status === "done" || step.status === "error") && (
              <div style={{ padding: "12px 14px", background: step.status === "error" ? "#fff0f0" : "#ffffff", border: `1px solid ${step.status === "error" ? "#f0aaaa" : step.color + "33"}`, borderRadius: "4px 12px 12px 12px" }}>
                {step.status === "error" && onRetry && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#cc4444" }}>{step.result}</span>
                    <button onClick={() => onRetry(step)} style={{ padding: "4px 12px", background: "#111111", border: "none", borderRadius: "20px", color: "#ffffff", fontSize: "11px", cursor: "pointer", flexShrink: 0, marginLeft: "10px" }}>↺ 재시도</button>
                  </div>
                )}
                {step.status !== "error" && <MarkdownRenderer content={step.result} />}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (phase === "selecting") {
    const GROUPS_SEL = ["사장님", "소비자", "전문가"];
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ width: "100%", maxWidth: "820px", maxHeight: "88vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>⚡ 에이전트 어벤저스 — 토론 순서 설정</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
          </div>
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* 왼쪽: 에이전트 목록 */}
            <div style={{ width: "52%", borderRight: "1px solid #e5e5e5", padding: "14px 16px", overflowY: "auto" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>클릭하면 순서에 추가 (중복 가능)</div>
              {GROUPS_SEL.map(g => {
                const ga = AGENTS.filter(a => a.group === g);
                return (
                  <div key={g} style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#999999", letterSpacing: "0.1em", marginBottom: "7px" }}>{g}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      {ga.map(agent => (
                        <button key={agent.id} onClick={() => addToQueue(agent)}
                          style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", border: `1px solid ${agent.color}55`, background: agent.color + "10", color: agent.color, transition: "all 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.background = agent.color + "22"}
                          onMouseLeave={e => e.currentTarget.style.background = agent.color + "10"}>
                          <span>{agent.icon}</span><span>{agent.role}</span>
                          <span style={{ fontSize: "9px", opacity: 0.5, marginLeft: "1px" }}>+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 오른쪽: 실행 순서 큐 */}
            <div style={{ flex: 1, padding: "14px 16px", overflowY: "auto" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>토론 순서 ({agentQueue.length}명)</div>
              {agentQueue.length === 0 && (
                <div style={{ fontSize: "12px", color: "#cccccc", textAlign: "center", marginTop: "50px", lineHeight: 1.8 }}>← 왼쪽 에이전트를<br/>클릭해 추가하세요</div>
              )}
              {agentQueue.map((agent, idx) => (
                <div key={agent.qid} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 8px", background: "#ffffff", border: `1px solid ${agent.color}33`, borderRadius: "10px", marginBottom: "5px" }}>
                  <span style={{ fontSize: "10px", color: "#cccccc", width: "16px", textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontSize: "14px" }}>{agent.icon}</span>
                  <span style={{ fontSize: "11px", color: agent.color, flex: 1 }}>
                    <span style={{ fontSize: "9px", opacity: 0.45, marginRight: "3px" }}>[{agent.group}]</span>{agent.role}
                  </span>
                  <button onClick={() => moveQueueUp(idx)} disabled={idx === 0}
                    style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#e0e0e0" : "#888888" }}>↑</button>
                  <button onClick={() => moveQueueDown(idx)} disabled={idx === agentQueue.length - 1}
                    style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", cursor: idx === agentQueue.length - 1 ? "default" : "pointer", color: idx === agentQueue.length - 1 ? "#e0e0e0" : "#888888" }}>↓</button>
                  <button onClick={() => removeFromQueue(idx)}
                    style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #f0aaaa", borderRadius: "6px", cursor: "pointer", color: "#cc6666" }}>✕</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[{ id: "compact", label: "⚡ 핵심만" }, { id: "full", label: "📖 전문보기" }].map(m => (
                <button key={m.id} onClick={() => setResponseMode(m.id)}
                  style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", border: `1px solid ${responseMode === m.id ? "#111111" : "#dddddd"}`, background: responseMode === m.id ? "#111111" : "#f8f8f8", color: responseMode === m.id ? "#ffffff" : "#aaaaaa", fontWeight: responseMode === m.id ? 600 : 400, transition: "all 0.15s" }}>
                  {m.label}
                </button>
              ))}
            </div>
            <button onClick={handleStart} disabled={agentQueue.length === 0}
              style={{ padding: "8px 24px", background: agentQueue.length === 0 ? "#cccccc" : "#111111", border: "none", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: agentQueue.length === 0 ? "default" : "pointer", fontWeight: 600 }}>
              시작 → ({agentQueue.length}명)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <style>{`
        @keyframes agentGlow {
          0%, 100% { box-shadow: 0 0 0 3px var(--glow-color, rgba(108,142,191,0.13)), 0 0 10px var(--glow-color, rgba(108,142,191,0.25)); }
          50% { box-shadow: 0 0 0 5px var(--glow-color, rgba(108,142,191,0.2)), 0 0 20px var(--glow-color, rgba(108,142,191,0.4)); }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "720px", maxHeight: "85vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>⚡ 에이전트 어벤저스</span>
            <span style={{ fontSize: "11px", color: "#aaaaaa", marginLeft: "10px" }}>
              {isRunning ? `${currentRound}R 진행 중...`
                : isPaused && pauseReason === "ratelimit" ? "⚠ 응답 제한 (리밋)"
                : isPaused ? "⏸ 중단됨"
                : isSummarizing ? "✦ 압축 중..."
                : specialDone ? "✦ Special Panel 완료"
                : pendingNext ? `${currentRound}R — 다음 대기 중`
                : roundDone ? `${currentRound}R 완료`
                : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!isRunning && (
              <button onClick={() => setResponseMode(m => m === "compact" ? "full" : "compact")}
                style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "10px", cursor: "pointer", border: "1px solid #dddddd", background: "#f8f8f8", color: "#888888", transition: "all 0.15s" }}>
                {responseMode === "compact" ? "⚡ 핵심만" : "📖 전문보기"}
              </button>
            )}
            {!specialDone && (
              <button onClick={() => setShowPanelEditor(true)}
                style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "10px", cursor: "pointer", border: "1px solid #dddddd", background: "#f8f8f8", color: "#888888", transition: "all 0.15s" }}>
                ⚙ 패널 수정
              </button>
            )}
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
              {!collapsedRounds[r.round] && <AgentStepView steps={r.steps} onRetry={(agent) => retryAgent(agent)} />}
            </div>
          ))}

          {(isRunning || isPaused || pendingNext || (currentSteps.length > 0 && rounds.length === 0)) && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6c8ebf", letterSpacing: "0.15em" }}>
                  진행 중 {isRunning ? "●" : ""}
                </div>
                <div style={{ flex: 1, height: "1px", background: "#ddeeff" }} />
                <span style={{ fontSize: "10px", color: "#bbbbbb" }}>{queueProgress + 1} / {agentQueue.length || currentSteps.length}</span>
              </div>
              <AgentStepView steps={currentSteps} />
            </div>
          )}

          {specialSteps.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#888800", letterSpacing: "0.15em" }}>✦ SPECIAL PANEL — Jobs · Musk · Buffett</div>
                <div style={{ flex: 1, height: "1px", background: "#e5e5e5" }} />
              </div>
              <AgentStepView steps={specialSteps} />
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={() => openFullView(rounds.map(r => `# ${r.round}라운드\n\n` + r.steps.map(s => `## ${s.role}\n\n${s.result}`).join("\n\n---\n\n")).join("\n\n═══════════════════\n\n"))}
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

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {isRunning && (
              <button onClick={stopCouncil}
                style={{ padding: "8px 20px", background: "#ffffff", border: "1px solid #cc4444", borderRadius: "20px", color: "#cc4444", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                ⏹ 멈추기
              </button>
            )}
            {isPaused && pauseReason === "ratelimit" && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#b07800" }}>⚠ 리밋 중단 — 같은 패널부터 재개</span>
                <button onClick={resumeCouncil}
                  style={{ padding: "8px 20px", background: "#111111", border: "1px solid #111111", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                  ↺ 재시도
                </button>
              </div>
            )}
            {isPaused && pauseReason === "manual" && (
              <button onClick={resumeCouncil}
                style={{ padding: "8px 20px", background: "#111111", border: "1px solid #111111", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                ▶ 이어가기
              </button>
            )}
{isSummarizing && <span style={{ fontSize: "11px", color: "#aaaaaa" }}>✦ 이전 라운드 압축 중...</span>}
            {pendingNext && !isRunning && !isPaused && !isSummarizing && (
              <button onClick={() => runQueueAgent(pendingNext.queue, pendingNext.queueIndex, pendingNext.context, pendingNext.existingSteps)}
                style={{ padding: "8px 20px", background: "#111111", border: "1px solid #111111", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                ▶ 다음 — {nextAgentName}
              </button>
            )}
            {roundDone && !isRunning && !isPaused && !pendingNext && !specialDone && specialSteps.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12px", color: "#4a9e5f", fontWeight: 600 }}>✅ 완료</span>
                <button onClick={runSpecialPanel}
                  style={{ padding: "8px 18px", background: "linear-gradient(135deg, #111 0%, #333 100%)", border: "1px solid #555", borderRadius: "20px", color: "#fff", fontSize: "12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🍎🚀💰</span> Special Panel 소집
                </button>
              </div>
            )}
            {specialDone && <span style={{ fontSize: "12px", color: "#888800", fontWeight: 600 }}>✦ Special Panel 완료</span>}
          </div>
        </div>
      </div>

      {/* 패널 수정 오버레이 */}
      {showPanelEditor && (() => {
        const GROUPS_ED = ["사장님", "소비자", "전문가"];
        const done = pendingNext?.queueIndex ?? (roundDone ? agentQueue.length : queueProgress);
        const editableQueue = agentQueue.slice(done);
        const addEditorAgent = (agent) => setAgentQueue(prev => [...prev, { ...agent, qid: `${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
        const removeEditorItem = (absIdx) => setAgentQueue(prev => prev.filter((_, i) => i !== absIdx));
        const moveEditorUp = (absIdx) => setAgentQueue(prev => { if (absIdx <= done) return prev; const n = [...prev]; [n[absIdx-1], n[absIdx]] = [n[absIdx], n[absIdx-1]]; return n; });
        const moveEditorDown = (absIdx) => setAgentQueue(prev => { if (absIdx >= prev.length - 1) return prev; const n = [...prev]; [n[absIdx], n[absIdx+1]] = [n[absIdx+1], n[absIdx]]; return n; });
        return (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowPanelEditor(false); }}>
            <div style={{ background: "#ffffff", borderRadius: "14px", padding: "20px", width: "min(700px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#444444" }}>⚙ 토론 순서 수정</span>
                <button onClick={() => setShowPanelEditor(false)} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "16px" }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, overflow: "hidden" }}>
                {/* 왼쪽: 추가할 에이전트 */}
                <div style={{ width: "48%", borderRight: "1px solid #f0f0f0", paddingRight: "14px", overflowY: "auto" }}>
                  <div style={{ fontSize: "10px", color: "#aaaaaa", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "10px" }}>추가 (클릭)</div>
                  {GROUPS_ED.map(g => {
                    const ga = AGENTS.filter(a => a.group === g);
                    return (
                      <div key={g} style={{ marginBottom: "10px" }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, color: "#bbbbbb", letterSpacing: "0.1em", marginBottom: "5px" }}>{g}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {ga.map(a => (
                            <button key={a.id} onClick={() => addEditorAgent(a)}
                              style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", borderRadius: "16px", fontSize: "10px", cursor: "pointer", border: `1px solid ${a.color}44`, background: a.color + "0e", color: a.color }}
                              onMouseEnter={e => e.currentTarget.style.background = a.color + "22"}
                              onMouseLeave={e => e.currentTarget.style.background = a.color + "0e"}>
                              {a.icon} {a.role} <span style={{ opacity: 0.4, fontSize: "8px" }}>+</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 오른쪽: 현재 큐 */}
                <div style={{ flex: 1, paddingLeft: "14px", overflowY: "auto" }}>
                  <div style={{ fontSize: "10px", color: "#aaaaaa", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "10px" }}>전체 순서</div>
                  {agentQueue.map((agent, absIdx) => {
                    const isDone = absIdx < done;
                    return (
                      <div key={agent.qid} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 7px", background: isDone ? "#f8f8f8" : "#ffffff", border: `1px solid ${isDone ? "#e5e5e5" : agent.color + "33"}`, borderRadius: "8px", marginBottom: "4px", opacity: isDone ? 0.5 : 1 }}>
                        <span style={{ fontSize: "9px", color: "#cccccc", width: "14px", textAlign: "right" }}>{absIdx + 1}</span>
                        <span style={{ fontSize: "12px" }}>{agent.icon}</span>
                        <span style={{ fontSize: "10px", color: isDone ? "#aaaaaa" : agent.color, flex: 1 }}>
                          <span style={{ fontSize: "8px", opacity: 0.4, marginRight: "2px" }}>[{agent.group}]</span>{agent.role}
                        </span>
                        {isDone
                          ? <span style={{ fontSize: "9px", color: "#aaaaaa" }}>✓ 완료</span>
                          : <>
                              <button onClick={() => moveEditorUp(absIdx)} disabled={absIdx === done}
                                style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #e5e5e5", borderRadius: "4px", cursor: absIdx === done ? "default" : "pointer", color: absIdx === done ? "#e5e5e5" : "#888888" }}>↑</button>
                              <button onClick={() => moveEditorDown(absIdx)} disabled={absIdx === agentQueue.length - 1}
                                style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #e5e5e5", borderRadius: "4px", cursor: absIdx === agentQueue.length - 1 ? "default" : "pointer", color: absIdx === agentQueue.length - 1 ? "#e5e5e5" : "#888888" }}>↓</button>
                              <button onClick={() => removeEditorItem(absIdx)}
                                style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #f0aaaa", borderRadius: "4px", cursor: "pointer", color: "#cc6666" }}>✕</button>
                            </>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => setShowPanelEditor(false)}
                style={{ padding: "7px 20px", background: "#111111", border: "none", borderRadius: "16px", color: "#ffffff", fontSize: "11px", cursor: "pointer", alignSelf: "flex-end", fontWeight: 600 }}>
                확인
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
