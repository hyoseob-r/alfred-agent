import { useState, useRef, useEffect, useCallback } from "react";

// API
import { getProxyUrl, setActiveProxyUrl, PROXY_URL_KEY, streamChatAPI, fetchProxyUrlFromServer, testProxyConnection } from "./api/proxy";
import {
  getSupabase, getSession, signInWithGitHub, signInWithGoogle, signOut,
  newSessionId,
  dbLoadSessions, dbLoadMessages, dbUpsertSession, dbSaveMessages, dbDeleteSession,
  dbLoadCouncilSessions, dbSaveCouncilSession, dbDeleteCouncilSession,
} from "./api/supabase";

// Prompts
import { buildSystemPrompt, STAGES, STAGE_INFO, detectStage } from "./prompts/agent";
import { AGENT_COUNCIL_PROMPTS, FACT_CHECK_STANDARD, DEBATE_ROUND_PROMPT, SPECIAL_PANEL_PROMPTS } from "./prompts/council";
import { ROUND_CONFIG, AGENTS } from "./components/panels/AgentCouncilPanel";
import { getSelectedModel } from "./utils/model";

// Utils
import { fileToBase64, fileToText, isPdf, parseCSV, computeStats } from "./utils/file";

// Components
import ModelSelector from "./components/ModelSelector";
import ProxyStatusModal from "./components/ProxyStatusModal";
import FilePreview from "./components/FilePreview";
import StageProgress from "./components/StageProgress";
import MessageBubble from "./components/MessageBubble";
import AppMenu from "./components/AppMenu";
import AgentsPanel from "./components/AgentsPanel";
import ContextAgentPanel from "./components/ContextAgentPanel";
import HistorySidebar from "./components/HistorySidebar";
import CouncilDetailPanel from "./components/CouncilDetailPanel";
import PapersModal from "./components/PapersModal";
import AgentCouncilPanel from "./components/panels/AgentCouncilPanel";
import FeedbackPanel from "./components/panels/FeedbackPanel";
import { FeedbackButton } from "./components/FeedbackSystem";

const GUEST_LS_KEY = "alfred_guest_sessions";

// 세션 로드 시 저장 타이밍 이슈로 resumeState가 누락된 dangling 라운드 헤더 복구
function fixDanglingCouncilHeaders(msgs) {
  const assembleMsg = [...msgs].reverse().find(m => m.isAssemble && m.assembleContext);
  const solutionContent = assembleMsg?.assembleContext || "";
  const processed = [...msgs];
  for (let i = 0; i < processed.length; i++) {
    const msg = processed[i];
    if (!msg.isCouncilRoundHeader || msg.resumeState) continue;
    const roundNum = msg.councilRound;
    const rest = processed.slice(i + 1);
    const hasAgents = rest.some(m => m.isCouncilAgent && m.councilRound === roundNum);
    const isComplete = rest.some(m => m.isCouncilComplete);
    if (!hasAgents && !isComplete) {
      let cumulativeContext = solutionContent ? ROUND_CONFIG[0].contextIntro + solutionContent : "";
      processed.slice(0, i)
        .filter(m => m.isCouncilAgent && m.councilStatus === "done" && m.content)
        .forEach(m => { cumulativeContext += `\n\n[${m.agentRole} ${m.councilRound}라운드 의견]\n${m.content}`; });
      processed[i] = { ...msg, resumeState: { solutionContent, fromRound: roundNum, fromAgentId: null, agentTimings: [], cumulativeContext } };
    }
  }
  return processed;
}

export default function App() {
  const [chatMode, setChatMode] = useState("chat"); // "chat" | "agent"
  const [assembleContext, setAssembleContext] = useState(null); // { content } — Council 소집 시 세팅
  const [messages, setMessages] = useState([]);
  const [agentHistory, setAgentHistory] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState(STAGES.IDLE);
  const [started, setStarted] = useState(true);
  const [pendingImages, setPendingImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = () => { setSidebarOpen(true); if (user?.id) dbLoadCouncilSessions(user.id).then(setCouncilSessions); };
  const [showPapers, setShowPapers] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showContextAgent, setShowContextAgent] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProxySettings, setShowProxySettings] = useState(false);
  const [hasProxy, setHasProxy] = useState(!!getProxyUrl());
  const [proxyUrl, setProxyUrl] = useState(getProxyUrl());
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [councilSessions, setCouncilSessions] = useState([]);
  const [selectedCouncil, setSelectedCouncil] = useState(null);
  const handleCouncilDeleted = (id) => { setCouncilSessions(prev => prev.filter(c => c.id !== id)); setSelectedCouncil(null); };
  const handleSignOut = () => { localStorage.clear(); window.location.href = window.location.origin; };
  const handleCouncilUpdated = (updated) => {
    setCouncilSessions(prev => prev.map(c => c.id === updated.id ? { ...c, topic: updated.topic, summary: updated.summary, rounds: updated.rounds } : c));
    setSelectedCouncil(updated);
  };
  const [user, setUser] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [contextBriefing, setContextBriefing] = useState(null);
  const [selectedModel, setSelectedModelState] = useState(getSelectedModel());
  const [dbSaving, setDbSaving] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingStartRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const importSessionRef = useRef(null);
  const councilDataRef = useRef(null); // { rounds, fullContext }
  const chatTimingsRef = useRef([]); // completed chat response durations (seconds)
  const councilAbortRef = useRef(null);
  const councilNextResolverRef = useRef(null); // "다음" 버튼 대기 Promise resolver
  const councilRuntimeQueueRef = useRef([]); // 런타임 큐 (진행 중 수정 가능)
  const councilProgressRef = useRef(0); // 현재까지 완료된 인덱스
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilWaitingNext, setCouncilWaitingNext] = useState(false); // 다음 에이전트 대기 중
  const [councilNextAgentName, setCouncilNextAgentName] = useState("");
  const [councilRuntimeQueue, setCouncilRuntimeQueue] = useState([]); // UI 표시용 (ref 미러)
  const [councilProgress, setCouncilProgress] = useState(0); // UI 표시용
  const [councilQueueEditor, setCouncilQueueEditor] = useState(false);
  const [councilPending, setCouncilPending] = useState(null); // { content } — 선택 모달 대기
  const [proxyAlert, setProxyAlert] = useState(false);
  const [councilAgentQueue, setCouncilAgentQueue] = useState([]); // 순서 큐 (중복 허용)
  const [councilResponseMode, setCouncilResponseMode] = useState("full");
  const [testCrash, setTestCrash] = useState(false);
  if (testCrash) throw new Error("[TEST CRASH] 의도적 크래시 테스트 — TypeError: Cannot read properties of undefined");

  const exportSession = () => {
    if (!messages.length) return;
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      messages,
      council: councilDataRef.current || null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const n = (parseInt(localStorage.getItem("alfred_export_count") || "0", 10) + 1);
    localStorage.setItem("alfred_export_count", String(n));
    const now = new Date();
    const ts = now.getFullYear().toString()
      + String(now.getMonth()+1).padStart(2,"0")
      + String(now.getDate()).padStart(2,"0")
      + "_"
      + String(now.getHours()).padStart(2,"0")
      + String(now.getMinutes()).padStart(2,"0")
      + String(now.getSeconds()).padStart(2,"0");
    a.download = `alfred_chat_${String(n).padStart(2,"0")}_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSession = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.version === 1 && Array.isArray(data.messages)) {
          setMessages(fixDanglingCouncilHeaders(data.messages));
          if (data.council) councilDataRef.current = data.council;
          setStarted(true);
        }
      } catch {}
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (isOwner || !messages.length) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '세션이 저장되지 않습니다. 저장 후 나가시겠어요?';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isOwner, messages.length]);
  const dragCounter = useRef(0);
  const saveTimerRef = useRef(null);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let authListener = null;
    (async () => {
      try {
        const sb = await getSupabase();
        const checkIsOwner = (u) => {
          if (!u) return false;
          const email = u.email || "";
          const login = u.user_metadata?.user_name || u.user_metadata?.preferred_username || "";
          return email === "hyoseob.r@gmail.com" || login === "hyoseob-r";
        };

        const onLogin = async (u) => {
          const owner = checkIsOwner(u);
          setUser(u);
          setIsOwner(owner);
          setAuthLoading(false);
          if (owner && u?.id) {
            const [s, cs] = await Promise.all([dbLoadSessions(u.id), dbLoadCouncilSessions(u.id)]);
            setSessions(s);
            setCouncilSessions(cs);
          } else {
            setSessions([]);
            setCouncilSessions([]);
            setActiveProxyUrl(null);
            setHasProxy(false);
            setProxyUrl(null);
          }
          if (owner) {
            fetch("https://alfred-agent-nine.vercel.app/api/get-context")
              .then(r => r.json())
              .then(data => { if (data.briefing) setContextBriefing(data.briefing); })
              .catch(() => {});
            const githubLogin = u.user_metadata?.user_name || u.user_metadata?.preferred_username || "";
            if (githubLogin) {
              fetchProxyUrlFromServer(githubLogin).then(async (serverUrl) => {
                const urlToTest = serverUrl || localStorage.getItem(PROXY_URL_KEY);
                if (urlToTest) {
                  const alive = await testProxyConnection(urlToTest);
                  if (alive) { setActiveProxyUrl(urlToTest); setProxyUrl(urlToTest); setHasProxy(true); }
                }
              });
            }
          }
        };

        const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
          const u = session?.user || null;
          if (u) await onLogin(u);
          else { setUser(null); setIsOwner(false); setAuthLoading(false); setSessions([]); setCouncilSessions([]); }
        });
        authListener = subscription;
        const sess = await getSession();
        if (sess?.user) await onLogin(sess.user);
        else { setUser(null); setIsOwner(false); setAuthLoading(false); }
      } catch (e) {
        console.error("Supabase init error:", e);
        setAuthLoading(false);
      }
    })();
    return () => { authListener?.unsubscribe?.(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!loading) { setLoadingElapsed(0); return; }
    const t = setInterval(() => {
      if (loadingStartRef.current) setLoadingElapsed(Math.floor((Date.now() - loadingStartRef.current) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [loading]);

  // 탭 전환 시 히스토리 swap
  const prevChatMode = useRef(chatMode);
  useEffect(() => {
    if (prevChatMode.current === chatMode) return;
    if (prevChatMode.current === "agent") {
      setAgentHistory(messages);
      setMessages(chatHistory);
    } else {
      setChatHistory(messages);
      setMessages(agentHistory);
    }
    prevChatMode.current = chatMode;
  }, [chatMode]);

  // ── Auto-save ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || !activeSessionId || messages.length === 0) return;
    // Council 진행 중엔 저장 스킵 — 완료 후 한 번만 저장
    if (councilRunning) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const createdAt = new Date(parseInt(activeSessionId.split('_')[1]) || Date.now());
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1)}${pad(createdAt.getDate())}`;
      const timeStr = `${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}${pad(createdAt.getSeconds())}`;
      const seq = pad((sessions.length || 0) + 1);
      const title = `alfred_chat_${seq}_${dateStr}_${timeStr}`;
      if (user) {
        setDbSaving(true);
        const giveUp = setTimeout(() => setDbSaving(false), 10000);
        try {
          await dbUpsertSession({ id: activeSessionId, title, stage: currentStage }, user.id);
          await dbSaveMessages(activeSessionId, messages, user.id);
          // 세션 목록은 로컬 상태로 업데이트 (DB 재조회 없음)
          setSessions(prev => {
            const exists = prev.some(s => s.id === activeSessionId);
            const updated = { id: activeSessionId, title, stage: currentStage };
            return exists ? prev.map(s => s.id === activeSessionId ? { ...s, ...updated } : s) : [updated, ...prev];
          });
        } catch (e) { console.error("save error:", e); }
        finally { clearTimeout(giveUp); setDbSaving(false); }
      }
    }, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [messages, councilRunning]);

  const handleFiles = useCallback(async (files) => {
    const supported = Array.from(files).filter(f =>
      f.type.startsWith("image/") || isPdf(f) ||
      f.name?.match(/\.(csv|xlsx|xls|tsv)$/i) ||
      f.type === "text/csv" || f.type.includes("spreadsheet")
    );
    if (!supported.length) return;
    const newFiles = await Promise.all(supported.map(async (file) => {
      if (isPdf(file)) {
        const base64 = await fileToBase64(file);
        return { type: "pdf", name: file.name, base64, mediaType: "application/pdf" };
      }
      if (file.name?.match(/\.(csv|tsv)$/i) || file.type === "text/csv") {
        const text = await fileToText(file);
        const parsed = parseCSV(text);
        const stats = computeStats(parsed);
        return { type: "data", name: file.name, text, parsed, stats };
      }
      if (file.name?.match(/\.(xlsx|xls)$/i)) {
        return { type: "data", name: file.name, text: `[Excel 파일: ${file.name} — 내용 분석을 위해 CSV로 변환하거나 내용을 붙여넣기 해주십시오]`, parsed: null, stats: null };
      }
      const base64 = await fileToBase64(file);
      return { type: "image", name: file.name, base64, preview: URL.createObjectURL(file), mediaType: file.type };
    }));
    setPendingImages(prev => [...prev, ...newFiles]);
  }, []);

  const onDragEnter = useCallback((e) => { e.preventDefault(); dragCounter.current++; if (e.dataTransfer.types.includes("Files")) setIsDragging(true); }, []);
  const onDragOver = useCallback((e) => { e.preventDefault(); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
  const onDrop = useCallback((e) => { e.preventDefault(); dragCounter.current = 0; setIsDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const onPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) handleFiles(files);
  }, [handleFiles]);

  const callClaude = async (userText, files, history) => {
    const buildContent = (text, fls) => {
      if (!fls?.length) return text || "";
      const parts = [];
      fls.forEach(f => {
        if (f.type === "pdf" && f.base64) {
          parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
        } else if (f.type === "image" && f.base64) {
          parts.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.base64 } });
        } else if (f.type === "data" && f.text) {
          const preview = f.text.length > 8000 ? f.text.slice(0, 8000) + "\n...(truncated)" : f.text;
          parts.push({ type: "text", text: `[데이터 파일: ${f.name}]\n${preview}` });
        }
      });
      if (text) parts.push({ type: "text", text });
      return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
    };
    const msgs = [
      ...history.map(m => ({ role: m.role, content: m.files?.length && m.files.some(f => f.base64 || f.text) ? buildContent(m.content, m.files) : (m.content || "") })),
      { role: "user", content: buildContent(userText, files) },
    ];
    let reply = "";
    await streamChatAPI(
      { model: selectedModel, max_tokens: 16000, system: buildSystemPrompt(contextBriefing), messages: msgs },
      (chunk) => {
        reply += chunk;
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], content: reply };
          }
          return updated;
        });
      }
    );
    return reply || "응답을 받지 못했습니다.";
  };

  const startAgent = (restoredMessages = null, restoredStage = null) => {
    const id = newSessionId();
    setActiveSessionId(id);
    if (restoredMessages) {
      setMessages(restoredMessages);
      setCurrentStage(restoredStage || STAGES.M1);
    } else {
      setCurrentStage(STAGES.M1);
      setMessages([{
        role: "assistant",
        content: `안녕하십니까, 주인님.\n\n저는 에이전트 어벤저스입니다.\n\n문제가 충분히 정의되면 2-pager 문서를 자동으로 생성하고,\n6인의 전문가 에이전트(Ms. Designer, Mr. Engineer, Ms. Strategist, Mr. PM, Ms. Data, Mr. Marketing)가 심층 검토합니다.\n\n🔍 M1 → 진짜 문제 발견\n🧭 M2 → UX 구조화\n⚙️ M3 → 솔루션 설계 + 어벤저스 검토\n🛠️ M4 → POC 빌드\n✅ M5 → 검증\n\n어떤 문제를 해결하고 싶으십니까?`,
        stageLabel: STAGE_INFO.m1_discovery.label,
        stageColor: STAGE_INFO.m1_discovery.color,
        stageIcon: STAGE_INFO.m1_discovery.icon,
      }]);
    }
  };

  const selectSession = async (id) => {
    const s = sessions.find(x => x.id === id);
    const msgs = await dbLoadMessages(id);
    setActiveSessionId(id);
    setMessages(fixDanglingCouncilHeaders(msgs));
    setCurrentStage(s?.stage || STAGES.M1);
    setStarted(true);
    setSidebarOpen(false);
  };

  const deleteSession = async (id) => {
    await dbDeleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (id === activeSessionId) {
      setStarted(false);
      setMessages([]);
      setActiveSessionId(null);
      setCurrentStage(STAGES.IDLE);
    }
  };

  const newChat = () => {
    setSidebarOpen(false);
    setStarted(false);
    setMessages([]);
    setActiveSessionId(null);
    setCurrentStage(STAGES.IDLE);
  };

  // agentQueue: [{ id, role, icon, color, group, qid }, ...] — 순서/중복 허용
  // resumeFrom: { solutionContent, queueIndex, agentQueue, agentTimings, cumulativeContext }
  const proceedCouncilNext = () => {
    councilNextResolverRef.current?.();
    councilNextResolverRef.current = null;
    setCouncilWaitingNext(false);
  };

  const runCouncilInChat = async (solutionContent, resumeFrom = null, agentQueue = null, responseMode = "full") => {
    if (councilRunning) return;
    setCouncilRunning(true);
    setCouncilWaitingNext(false);
    const ac = new AbortController();
    councilAbortRef.current = ac;
    const agentTimings = resumeFrom?.agentTimings ? [...resumeFrom.agentTimings] : [];
    let cumulativeContext = resumeFrom?.cumulativeContext || (`다음 주제에 대해 검토해 주십시오:\n\n${solutionContent}`);
    const getEstimate = () => agentTimings.length > 0
      ? Math.round(agentTimings.reduce((a, b) => a + b, 0) / agentTimings.length) : 45;

    const initialQueue = resumeFrom?.agentQueue || agentQueue || AGENTS.map((a, i) => ({ ...a, qid: String(i) }));
    councilRuntimeQueueRef.current = [...initialQueue];
    councilProgressRef.current = resumeFrom?.queueIndex || 0;
    setCouncilRuntimeQueue([...initialQueue]);
    setCouncilProgress(resumeFrom?.queueIndex || 0);

    let qi = resumeFrom?.queueIndex || 0;
    while (qi < councilRuntimeQueueRef.current.length) {
      if (ac.signal.aborted) break;
      const agent = councilRuntimeQueueRef.current[qi];
      councilProgressRef.current = qi;
      setCouncilProgress(qi);

      // 5번째 에이전트마다 컨텍스트 압축
      if (qi > 0 && qi % 5 === 0) {
        let summary = "";
        try {
          await streamChatAPI(
            { model: getSelectedModel(), max_tokens: 1200,
              system: "당신은 회의 요약 전문가입니다. 에이전트 토론을 압축하세요.\n규칙:\n- 각 에이전트 핵심 주장 1~2줄\n- 주요 합의점·충돌 지점 명시\n- 한국어로.",
              messages: [{ role: "user", content: `다음 토론을 요약해주세요:\n\n${cumulativeContext}` }] },
            (chunk) => { summary += chunk; }, ac.signal
          );
        } catch {}
        if (summary) cumulativeContext = `[원래 주제]\n${solutionContent}\n\n[이전 토론 요약]\n${summary}`;
      }

      const isLegend = agent.group === "레전드";
      const isFactChecker = agent.id === "factchecker";
      const basePrompt = isLegend ? SPECIAL_PANEL_PROMPTS[agent.id] : AGENT_COUNCIL_PROMPTS[agent.id];
      const modeDirective = responseMode === "compact"
        ? "\n\n---\n\n[응답 형식: 간소화 모드]\n핵심 포인트만 3~5줄 이내. 불릿(•) 위주. 서론/결론 생략. 숫자·수치 있으면 포함. 군더더기 없이."
        : "\n\n---\n\n[응답 형식: 전문 대화형]\n전문가가 실제로 말하듯 자연스럽게. 맥락과 근거를 충분히. 대화체로.";
      const systemPrompt = isLegend
        ? `${basePrompt}${modeDirective}`
        : isFactChecker
          ? basePrompt + modeDirective
          : `${basePrompt}\n\n---\n\n${FACT_CHECK_STANDARD}\n\n---\n\n${DEBATE_ROUND_PROMPT}${modeDirective}`;

      const startedAt = Date.now();
      const estimatedTime = getEstimate();
      const msgKey = `${agent.qid}-${qi}`;
      setMessages(prev => [...prev, {
        role: "assistant", content: "",
        isCouncilAgent: true, agentId: agent.id, agentRole: agent.role,
        agentIcon: agent.icon, agentColor: agent.color, agentGroup: agent.group,
        msgKey, councilStatus: "running", startedAt, estimatedTime,
      }]);

      let result = "";
      const updateAgentMsg = (updates) => setMessages(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].isCouncilAgent && updated[i].msgKey === msgKey && updated[i].councilStatus !== "stopped") {
            updated[i] = { ...updated[i], ...updates }; break;
          }
        }
        return updated;
      });

      const agentAc = new AbortController();
      const timeoutId = setTimeout(() => agentAc.abort(), 180_000);
      const combinedSignal = AbortSignal.any([ac.signal, agentAc.signal]);

      try {
        await streamChatAPI(
          { model: getSelectedModel(), max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: cumulativeContext }] },
          (chunk) => { result += chunk; updateAgentMsg({ content: result }); },
          combinedSignal
        );
        clearTimeout(timeoutId);
        const dur = Math.floor((Date.now() - startedAt) / 1000);
        if (dur > 2) agentTimings.push(dur);
        updateAgentMsg({ councilStatus: "done" });
        cumulativeContext += `\n\n[${agent.group ? `${agent.group} · ` : ""}${agent.role} 의견]\n${result}`;
      } catch (e) {
        clearTimeout(timeoutId);
        if (ac.signal.aborted || e.message === "STREAM_TRUNCATED") {
          const resumeState = {
            solutionContent, queueIndex: qi, agentQueue: councilRuntimeQueueRef.current,
            agentTimings: [...agentTimings], cumulativeContext,
          };
          if (result) cumulativeContext += `\n\n[${agent.role} 의견 (부분)]\n${result}`;
          updateAgentMsg({ councilStatus: "stopped", resumeState });
          break;
        }
        if (agentAc.signal.aborted) {
          const dur = Math.floor((Date.now() - startedAt) / 1000);
          if (dur > 2) agentTimings.push(dur);
          updateAgentMsg({ councilStatus: "done", content: (result || "⏱ 응답 없음") + (result ? "\n\n> ⏱ 시간 초과 — 부분 수신" : "") });
          if (result) cumulativeContext += `\n\n[${agent.role} 의견 (부분)]\n${result}`;
        } else {
          updateAgentMsg({ content: `오류: ${e.message}`, councilStatus: "error" });
        }
      }

      qi++;
      // 다음 에이전트가 있으면 "다음" 버튼 대기
      if (!ac.signal.aborted && qi < councilRuntimeQueueRef.current.length) {
        const nextAgent = councilRuntimeQueueRef.current[qi];
        setCouncilNextAgentName(`${nextAgent.group ? `[${nextAgent.group}] ` : ""}${nextAgent.role}`);
        setCouncilWaitingNext(true);
        await new Promise(resolve => {
          councilNextResolverRef.current = resolve;
          ac.signal.addEventListener("abort", resolve, { once: true });
        });
        if (ac.signal.aborted) break;
        setCouncilRuntimeQueue([...councilRuntimeQueueRef.current]);
      }
    }

    const finalQueueLen = councilRuntimeQueueRef.current.length;
    if (!ac.signal.aborted) {
      setMessages(prev => [...prev, {
        role: "assistant", content: `✅ 토론이 완료됐습니다. (${finalQueueLen}인)`,
        isCouncilComplete: true,
      }]);
    }
    setCouncilRunning(false);
    setCouncilWaitingNext(false);
    councilNextResolverRef.current = null;
    councilAbortRef.current = null;
    setCouncilRuntimeQueue([]);
    setCouncilProgress(0);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pendingImages.length) || loading) return;
    if (!getProxyUrl()) { setProxyAlert(true); setTimeout(() => setProxyAlert(false), 3500); return; }
    const userText = input.trim();
    const files = [...pendingImages];
    setInput(""); setPendingImages([]);
    // 채팅 모드에서도 첫 메시지 발송 시 세션 ID 생성 (auto-save 활성화)
    if (!activeSessionId && user) setActiveSessionId(newSessionId());
    const newMessages = [...messages, { role: "user", content: userText, files }];
    setMessages(newMessages);
    setLoading(true);
    loadingStartRef.current = Date.now();
    setLoadingElapsed(0);
    try {
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      if (chatMode === "agent") {
        const reply = await callClaude(userText, files, messages);
        const detectedStage = detectStage(reply);
        if (detectedStage) setCurrentStage(detectedStage);
        const stageInfo = detectedStage ? STAGE_INFO[detectedStage] : null;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: reply, stageLabel: stageInfo?.label, stageColor: stageInfo?.color, stageIcon: stageInfo?.icon };
          return updated;
        });
      } else {
        // assemble 트리거 감지
        const isAssembleTrigger = /assemble|어셈블|어쎔블|council\s*시작|에이전트\s*협의|19인\s*토론|토론해보자|토론\s*해봐|토론하자|의논해보자|의논\s*해봐|다같이\s*(봐|보자|검토|얘기)|전문가\s*(불러|의견)|에이전트\s*(불러|소집)|패널\s*(불러|소집)|같이\s*(검토|봐|보자)/i.test(userText);

        const history = messages.map(m => ({ role: m.role, content: m.content }));

        if (isAssembleTrigger) {
          // 알프가 사회자로서 대화 맥락을 Council 브리핑으로 정리
          const contextSummary = messages
            .filter(m => m.content)
            .map(m => `${m.role === "user" ? "사용자" : "Alf"}: ${m.content}`)
            .join("\n\n");

          const ASSEMBLE_SYSTEM = `당신은 알프(Alf)입니다. 사용자가 "assemble"을 요청했습니다.
지금까지의 대화를 검토하여, Council 19인(전문가·사장님·고객)에게 전달할 브리핑을 작성하십시오.

브리핑 형식:
1. 핵심 주제/솔루션 아이디어 (2-3문장)
2. 주요 논점 및 가정 (3-5개 bullet)
3. Council에 검토 요청할 핵심 질문 (2-3개)

마지막 줄에 반드시 다음을 포함하십시오:
"Council을 소집합니다. 아래 버튼을 눌러 19인 토론을 시작하십시오."`;

          let reply = "";
          await streamChatAPI(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 2000,
              system: ASSEMBLE_SYSTEM,
              messages: [{ role: "user", content: `대화 내용:\n\n${contextSummary}\n\n사용자 요청: ${userText}` }],
            },
            (chunk) => {
              reply += chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: reply };
                return updated;
              });
            }
          );

          // 브리핑을 Council context로 세팅 — MessageBubble에서 버튼 렌더링
          const councilContent = reply || contextSummary;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: reply || "Council을 소집합니다.",
              isAssemble: true,
              assembleContext: councilContent,
            };
            return updated;
          });
        } else {
          let reply = "";
          await streamChatAPI(
            {
              model: selectedModel,
              max_tokens: 8000,
              system: `당신은 알프(Alf)입니다. 한국어로 대화합니다. 전략 논의, 아이디어 검토, 질문 답변 등 무엇이든 도와드립니다. 사용자가 'assemble' 또는 '어셈블'이라고 하면 Council 19인 토론을 소집할 수 있다고 안내하십시오.${contextBriefing ? `\n\n---\n\n## 현재 진행 상황 (백로그 / 컨텍스트)\n\n${contextBriefing}` : ""}`,
              messages: [...history, { role: "user", content: userText }],
            },
            (chunk) => {
              reply += chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: reply };
                return updated;
              });
            }
          );
          if (!reply) {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: "오류가 발생했습니다." };
              return updated;
            });
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `오류: ${e.message}` };
        return updated;
      });
    } finally {
      if (loadingStartRef.current) {
        const dur = Math.floor((Date.now() - loadingStartRef.current) / 1000);
        if (dur > 2) chatTimingsRef.current.push(dur);
      }
      setLoading(false);
      loadingStartRef.current = null;
      inputRef.current?.focus();
    }
  };

  const isComposingRef = useRef(false);
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isComposingRef.current) return;
      sendMessage();
    }
  };
  const canSend = !loading && (input.trim().length > 0 || pendingImages.length > 0);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#bbbbbb" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px" }}>A</div>
          <div style={{ fontSize: "12px" }}>연결 중...</div>
        </div>
      </div>
    );
  }

  if (user === null) {
    const GuestProxyGate = () => {
      const [gateStatus, setGateStatus] = useState("idle");
      const installCmd = `curl -fsSL https://alfred-agent-nine.vercel.app/install.sh | bash`;
      const tryConnect = async () => {
        setGateStatus("checking");
        const tryUrl = async (url) => {
          const alive = await testProxyConnection(url);
          if (alive) { setActiveProxyUrl(url); setProxyUrl(url); setHasProxy(true); setUser(false); return true; }
          return false;
        };
        if (await tryUrl("http://localhost:7432")) return;
        const cached = getProxyUrl();
        if (cached && await tryUrl(cached)) return;
        setGateStatus("fail");
      };
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ width: "100%", maxWidth: "460px", background: "#ffffff", borderRadius: "20px", padding: "32px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", fontFamily: "'Pretendard', sans-serif" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#111111", marginBottom: "8px" }}>⚡ 프록시 연결 필요</div>
            <div style={{ fontSize: "13px", color: "#888888", lineHeight: 1.7, marginBottom: "24px" }}>
              비회원 모드는 로컬 프록시가 연결되어야 사용할 수 있습니다.<br />
              프록시 없이는 AI 채팅과 Council 기능을 이용할 수 없습니다.
            </div>
            <div style={{ background: "#f5f5f5", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", color: "#666666", marginBottom: "10px" }}>
                {gateStatus === "checking" ? "🔍 연결 확인 중..." : gateStatus === "fail" ? "⚠ 프록시가 실행 중이 아닙니다. 아래 명령어로 설치 후 다시 시도하세요." : "프록시가 실행 중이라면 아래 버튼을 눌러 연결하세요."}
              </div>
              <button onClick={tryConnect} disabled={gateStatus === "checking"}
                style={{ padding: "8px 20px", background: "#111111", border: "none", borderRadius: "8px", color: "#ffffff", fontSize: "12px", cursor: gateStatus === "checking" ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {gateStatus === "checking" ? "확인 중..." : "자동 감지 및 연결"}
              </button>
            </div>
            <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#666666", marginBottom: "8px" }}>처음 설치하는 경우 (터미널에서 1회 실행)</div>
              <div style={{ background: "#111111", borderRadius: "8px", padding: "10px 14px", fontFamily: "monospace", fontSize: "11px", color: "#88ff88", wordBreak: "break-all", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ flex: 1 }}>{installCmd}</span>
                <button onClick={() => navigator.clipboard.writeText(installCmd)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "4px", padding: "3px 8px", color: "#cccccc", fontSize: "10px", cursor: "pointer", whiteSpace: "nowrap" }}>복사</button>
              </div>
            </div>
            <button onClick={() => setShowProxySettings(false)}
              style={{ marginTop: "20px", width: "100%", padding: "10px", background: "transparent", border: "none", color: "#aaaaaa", fontSize: "12px", cursor: "pointer" }}>
              ← 돌아가기
            </button>
          </div>
        </div>
      );
    };
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 20% 50%, #c8c8e0 0%, #f5f5f5 60%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: "380px", width: "100%", padding: "0 20px" }}>
          <div style={{ fontSize: "80px", fontWeight: "800", color: "#111111", lineHeight: 1, marginBottom: "40px", letterSpacing: "-0.04em", fontFamily: "'Pretendard', sans-serif" }}>A</div>
          <button onClick={signInWithGitHub}
            style={{ width: "100%", padding: "16px 24px", background: "#111111", border: "none", borderRadius: "14px", color: "#ffffff", fontSize: "15px", fontWeight: "700", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", marginBottom: "10px" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#333333"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#111111"; }}>
            GitHub 로그인
          </button>
          <button onClick={() => setShowProxySettings("guest")}
            style={{ width: "100%", padding: "14px 24px", background: "transparent", border: "none", borderRadius: "14px", color: "#888888", fontSize: "14px", fontWeight: "500", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#444444"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#888888"; }}>
            로그인 없이 사용하기
          </button>
        </div>
        {showProxySettings === "guest" && <GuestProxyGate />}
      </div>
    );
  }

  return (
    <>
      <HistorySidebar
        sessions={sessions} activeId={activeSessionId}
        onSelect={selectSession} onNew={newChat} onDelete={deleteSession}
        councilSessions={councilSessions} onSelectCouncil={setSelectedCouncil}
        onDeleteCouncil={async (id) => { await dbDeleteCouncilSession(id); handleCouncilDeleted(id); }}
        open={sidebarOpen} onClose={() => setSidebarOpen(false)}
      />
      {selectedCouncil && (
        <CouncilDetailPanel
          council={selectedCouncil} onClose={() => setSelectedCouncil(null)}
          user={user} isOwner={isOwner}
          onDeleted={handleCouncilDeleted} onUpdated={handleCouncilUpdated}
        />
      )}
      {showPapers && <PapersModal onClose={() => setShowPapers(false)} user={user} />}
      {showProxySettings === true && (
        <ProxyStatusModal
          onClose={() => setShowProxySettings(false)}
          githubLogin={user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || ""}
          proxyUrl={proxyUrl}
          onDetected={(url) => { setProxyUrl(url); setHasProxy(!!url); }}
        />
      )}
      <AgentsPanel open={showAgents} onClose={() => setShowAgents(false)} />
      <ContextAgentPanel open={showContextAgent} onClose={() => setShowContextAgent(false)} />
      {showFeedback && <FeedbackPanel onClose={() => setShowFeedback(false)} />}
      <FeedbackButton />

      <div
        onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f5f5f5", fontFamily: "'Pretendard', sans-serif", color: "#111111", position: "relative" }}
      >
        {isDragging && (
          <div style={{ position: "absolute", inset: 0, zIndex: 100, background: "rgba(6,6,20,0.93)", border: "2px dashed #4a4a9a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "14px", pointerEvents: "none" }}>
            <div style={{ fontSize: "52px", filter: "drop-shadow(0 0 20px #6060c0)" }}>📎</div>
            <div style={{ fontSize: "18px", color: "#9090e0" }}>파일을 여기에 놓으십시오</div>
            <div style={{ fontSize: "11px", color: "#bbbbbb", letterSpacing: "0.12em" }}>PNG · JPG · WEBP · GIF · PDF</div>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: "12px 20px", background: "#ffffff", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={openSidebar} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "transparent", border: "1px solid #e5e5e5", color: "#aaaaaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#777777"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>☰</button>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #111111 0%, #c8c8e0 100%)", border: "1px solid #cccccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "10px", color: "#bbbbbb", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: "6px" }}>
              {dbSaving ? "☁ 저장 중..." : user?.email || user?.user_metadata?.user_name || ""}
            </div>
          </div>
          {isOwner && <button onClick={() => setShowAgents(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #e5e5e5", borderRadius: "8px", color: "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#7b68b5"; e.currentTarget.style.color = "#7b68b5"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>
            <span style={{ fontSize: "11px" }}>🤖</span> Agents
          </button>}
          {isOwner && <button onClick={() => setShowContextAgent(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #e5e5e5", borderRadius: "8px", color: "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#059669"; e.currentTarget.style.color = "#059669"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>
            <span style={{ fontSize: "11px" }}>🧠</span> Context Agent
          </button>}
          {isOwner && <button onClick={() => setShowPapers(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #e5e5e5", borderRadius: "8px", color: "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#fa0050"; e.currentTarget.style.color = "#fa0050"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>
            <span style={{ fontSize: "11px" }}>📄</span> Papers
          </button>}
          {isOwner && <button onClick={() => setShowFeedback(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #e5e5e5", borderRadius: "8px", color: "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#cc4444"; e.currentTarget.style.color = "#cc4444"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>
            <span style={{ fontSize: "11px" }}>💬</span> 피드백
          </button>}
          {isOwner && <button onClick={() => setTestCrash(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #ffcccc", borderRadius: "8px", color: "#cc4444", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fff0f0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
            <span style={{ fontSize: "11px" }}>🧪</span> 크래시 테스트
          </button>}
          <button onClick={() => setShowProxySettings(true)}
            title={hasProxy ? "로컬 프록시 연결됨" : "로컬 프록시 설정"}
            style={{ padding: "5px 10px", background: hasProxy ? "rgba(5,150,105,0.08)" : "transparent", border: `1px solid ${hasProxy ? "#059669" : "#e5e5e5"}`, borderRadius: "8px", color: hasProxy ? "#059669" : "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#059669"; e.currentTarget.style.color = "#059669"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = hasProxy ? "#059669" : "#e5e5e5"; e.currentTarget.style.color = hasProxy ? "#059669" : "#aaaaaa"; }}>
            {hasProxy ? "⚡ 프록시" : "⚙ 프록시"}
          </button>
          <ModelSelector onChange={setSelectedModelState} />
          <AppMenu current="alfred" />
          <button onClick={handleSignOut} style={{ padding: "5px 10px", background: "transparent", border: "1px solid #e5e5e5", borderRadius: "8px", color: "#aaaaaa", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#777777"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>로그아웃</button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* 탭 */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e5e5", background: "#ffffff", padding: "0 20px", flexShrink: 0 }}>
            {[{ id: "chat", label: "Chat" }, { id: "agent", label: "Agent" }].map(tab => (
              <button key={tab.id} onClick={() => setChatMode(tab.id)}
                style={{ padding: "10px 16px", background: "none", border: "none", borderBottom: chatMode === tab.id ? "2px solid #111" : "2px solid transparent", color: chatMode === tab.id ? "#111" : "#aaa", fontSize: "12px", fontWeight: chatMode === tab.id ? "700" : "400", cursor: "pointer", transition: "all 0.15s", marginBottom: "-1px" }}>
                {tab.label}
              </button>
            ))}
          </div>
          {!user && (
            <div style={{ padding: "8px 20px", background: "#fef2f2", borderBottom: "1px solid #fecaca", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px" }}>🔒</span>
              <span style={{ fontSize: "11px", color: "#991b1b", flex: 1 }}>비로그인 상태 — 백로그·히스토리 이용 권한이 없습니다. 대화 내역은 저장되지 않습니다.</span>
              <button onClick={exportSession} disabled={!messages.length}
                style={{ padding: "4px 12px", background: messages.length ? "#991b1b" : "#d4a5a5", border: "none", borderRadius: "20px", color: "#ffffff", fontSize: "11px", cursor: messages.length ? "pointer" : "default", fontWeight: 600, flexShrink: 0 }}>
                💾 세션 저장
              </button>
              <button onClick={() => importSessionRef.current?.click()}
                style={{ padding: "4px 12px", background: "transparent", border: "1px solid #991b1b", borderRadius: "20px", color: "#991b1b", fontSize: "11px", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
                📂 이어가기
              </button>
              <input ref={importSessionRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={e => { importSession(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px", scrollbarWidth: "thin", scrollbarColor: "#cccccc transparent" }}>
            {!messages.length && !user && (
              <div style={{ margin: "40px auto", maxWidth: "440px", background: "#ffffff", border: "1px solid #e5e5e5", borderRadius: "16px", padding: "28px 28px", color: "#555555", lineHeight: 1.7 }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#111111", marginBottom: "16px" }}>🔒 비로그인 상태</div>
                <div style={{ fontSize: "13px", marginBottom: "20px", color: "#666666" }}>
                  백로그, 히스토리, 세션 자동 저장 기능은 로그인 후 이용 가능합니다.<br />
                  지금은 <strong>채팅만 가능</strong>하며, 탭을 닫으면 대화가 모두 사라집니다.
                </div>
                <div style={{ fontSize: "13px", background: "#f8f8f8", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "6px", color: "#111111" }}>⚙ 프록시 설정 필요</div>
                  <div style={{ color: "#666666" }}>우측 상단 <strong>프록시</strong> 버튼을 눌러 로컬 프록시를 연결해야 Claude API를 사용할 수 있습니다.</div>
                </div>
                <div style={{ fontSize: "13px", background: "#f8f8f8", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "6px", color: "#111111" }}>💾 세션 저장 / 이어가기</div>
                  <div style={{ color: "#666666" }}>대화가 끝난 후 상단 <strong>세션 저장</strong>으로 JSON 파일을 다운로드하고, 다음에 <strong>이어가기</strong>로 불러오면 대화를 이어갈 수 있습니다.</div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} user={user} sessionId={activeSessionId} isOwner={isOwner}
                onCouncilStart={(content) => setCouncilPending({ content })}
                onCouncilResume={(resumeState) => runCouncilInChat(resumeState.solutionContent, resumeState)}
                onCouncilStop={() => councilAbortRef.current?.abort()}
                onCouncilUpdate={(rounds, fullContext) => {
                  councilDataRef.current = { rounds, fullContext };
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[i] = { ...updated[i], councilRounds: rounds, councilContext: fullContext };
                    return updated;
                  });
                }} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Council 패널 선택 모달 — 큐 방식 */}
          {councilPending && (() => {
            const GROUPS = ["사장님", "소비자", "전문가", "레전드"];
            const addToQueue = (agent) => setCouncilAgentQueue(prev => [
              ...prev, { ...agent, qid: `${agent.id}-${Date.now()}-${Math.random()}` }
            ]);
            const removeFromQueue = (idx) => setCouncilAgentQueue(prev => prev.filter((_, i) => i !== idx));
            const moveUp = (idx) => setCouncilAgentQueue(prev => {
              if (idx === 0) return prev;
              const next = [...prev]; [next[idx-1], next[idx]] = [next[idx], next[idx-1]]; return next;
            });
            const moveDown = (idx) => setCouncilAgentQueue(prev => {
              if (idx === prev.length - 1) return prev;
              const next = [...prev]; [next[idx], next[idx+1]] = [next[idx+1], next[idx]]; return next;
            });
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ width: "100%", maxWidth: "760px", maxHeight: "90vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>⚡ 에이전트 어벤저스 — 순서 설정</span>
                    <button onClick={() => setCouncilPending(null)} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", gap: 0 }}>
                    {/* 왼쪽: 에이전트 목록 */}
                    <div style={{ width: "55%", borderRight: "1px solid #e5e5e5", padding: "16px", overflowY: "auto" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>클릭하면 순서에 추가됩니다 (중복 가능)</div>
                      {GROUPS.map(g => {
                        const ga = AGENTS.filter(a => a.group === g);
                        return (
                          <div key={g} style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#888888", letterSpacing: "0.1em", marginBottom: "8px" }}>{g}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {ga.map(agent => (
                                <button key={agent.id} onClick={() => addToQueue(agent)}
                                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", border: `1px solid ${agent.color}66`, background: agent.color + "12", color: agent.color, transition: "all 0.15s" }}
                                  onMouseEnter={e => e.currentTarget.style.background = agent.color + "25"}
                                  onMouseLeave={e => e.currentTarget.style.background = agent.color + "12"}>
                                  <span>{agent.icon}</span><span>{agent.role}</span><span style={{ fontSize: "9px", opacity: 0.6 }}>+</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* 오른쪽: 실행 순서 큐 */}
                    <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>실행 순서 ({councilAgentQueue.length}명)</div>
                      {councilAgentQueue.length === 0 && (
                        <div style={{ fontSize: "12px", color: "#cccccc", textAlign: "center", marginTop: "40px" }}>← 왼쪽에서 에이전트를 추가하세요</div>
                      )}
                      {councilAgentQueue.map((agent, idx) => (
                        <div key={agent.qid} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 8px", background: "#ffffff", border: `1px solid ${agent.color}33`, borderRadius: "10px", marginBottom: "6px" }}>
                          <span style={{ fontSize: "10px", color: "#cccccc", width: "16px", textAlign: "right", flexShrink: 0 }}>{idx+1}</span>
                          <span style={{ fontSize: "14px" }}>{agent.icon}</span>
                          <span style={{ fontSize: "11px", color: agent.color, flex: 1 }}>
                            <span style={{ fontSize: "9px", opacity: 0.5, marginRight: "3px" }}>[{agent.group}]</span>{agent.role}
                          </span>
                          <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #dddddd", borderRadius: "6px", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#dddddd" : "#888888" }}>↑</button>
                          <button onClick={() => moveDown(idx)} disabled={idx === councilAgentQueue.length - 1} style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #dddddd", borderRadius: "6px", cursor: idx === councilAgentQueue.length - 1 ? "default" : "pointer", color: idx === councilAgentQueue.length - 1 ? "#dddddd" : "#888888" }}>↓</button>
                          <button onClick={() => removeFromQueue(idx)} style={{ padding: "2px 6px", fontSize: "10px", background: "none", border: "1px solid #f0aaaa", borderRadius: "6px", cursor: "pointer", color: "#cc6666" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {[{ id: "compact", label: "⚡ 핵심만" }, { id: "full", label: "📖 전문보기" }].map(m => (
                        <button key={m.id} onClick={() => setCouncilResponseMode(m.id)}
                          style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", border: `1px solid ${councilResponseMode === m.id ? "#111111" : "#dddddd"}`, background: councilResponseMode === m.id ? "#111111" : "#f8f8f8", color: councilResponseMode === m.id ? "#ffffff" : "#aaaaaa", fontWeight: councilResponseMode === m.id ? 600 : 400 }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { const c = councilPending; setCouncilPending(null); runCouncilInChat(c.content, null, councilAgentQueue, councilResponseMode); }}
                      disabled={councilAgentQueue.length === 0}
                      style={{ padding: "8px 24px", background: councilAgentQueue.length === 0 ? "#cccccc" : "#111111", border: "none", borderRadius: "20px", color: "#ffffff", fontSize: "12px", cursor: councilAgentQueue.length === 0 ? "default" : "pointer", fontWeight: 600 }}>
                      시작 → ({councilAgentQueue.length}명)
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Council 큐 편집 모달 ── */}
          {councilQueueEditor && (() => {
            const GROUPS_RT = ["사장님", "소비자", "전문가", "레전드"];
            // 현재 실행 중인 에이전트까지 항상 잠금 (running 중이면 +1, waiting이면 already +1)
            const done = councilProgressRef.current + 1;
            const notifyQueueChange = (newQ) => {
              const remaining = newQ.slice(done).map((a, i) => `${done + i + 1}. ${a.icon} ${a.role}`).join("\n");
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `⚙ 토론 순서가 변경됐습니다.\n\n**남은 순서 (${newQ.length - done}명)**\n${remaining || "없음"}`,
                isSystemNote: true,
              }]);
            };
            const applyQueue = (newQ, notify = true) => {
              councilRuntimeQueueRef.current = newQ;
              setCouncilRuntimeQueue([...newQ]);
              const nextAgent = newQ[done];
              if (nextAgent) setCouncilNextAgentName(`${nextAgent.group ? `[${nextAgent.group}] ` : ""}${nextAgent.role}`);
              if (notify) notifyQueueChange(newQ);
            };
            const addAgent = (agent) => applyQueue([
              ...councilRuntimeQueueRef.current,
              { ...agent, qid: `${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
            ]);
            const removeItem = (idx) => applyQueue(councilRuntimeQueueRef.current.filter((_, i) => i !== idx));
            const moveUp = (idx) => {
              if (idx <= done) return;
              const n = [...councilRuntimeQueueRef.current]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; applyQueue(n);
            };
            const moveDown = (idx) => {
              if (idx >= councilRuntimeQueueRef.current.length - 1) return;
              const n = [...councilRuntimeQueueRef.current]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; applyQueue(n);
            };
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
                onClick={(e) => { if (e.target === e.currentTarget) setCouncilQueueEditor(false); }}>
                <div style={{ width: "100%", maxWidth: "820px", maxHeight: "88vh", background: "#f5f5f5", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>⚙ 토론 순서 수정 — 진행 중</span>
                    <button onClick={() => setCouncilQueueEditor(false)} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
                  </div>
                  <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                    {/* 왼쪽: 추가 */}
                    <div style={{ width: "48%", borderRight: "1px solid #e5e5e5", padding: "14px 16px", overflowY: "auto" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>추가 (클릭)</div>
                      {GROUPS_RT.map(g => {
                        const ga = AGENTS.filter(a => a.group === g);
                        return (
                          <div key={g} style={{ marginBottom: "12px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#999999", letterSpacing: "0.1em", marginBottom: "6px" }}>{g}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                              {ga.map(a => (
                                <button key={a.id} onClick={() => addAgent(a)}
                                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", borderRadius: "20px", fontSize: "10px", cursor: "pointer", border: `1px solid ${a.color}55`, background: a.color + "10", color: a.color }}
                                  onMouseEnter={e => e.currentTarget.style.background = a.color + "22"}
                                  onMouseLeave={e => e.currentTarget.style.background = a.color + "10"}>
                                  {a.icon} {a.role} <span style={{ opacity: 0.4, fontSize: "8px" }}>+</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* 오른쪽: 전체 큐 */}
                    <div style={{ flex: 1, padding: "14px 16px", overflowY: "auto" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#aaaaaa", letterSpacing: "0.1em", marginBottom: "12px" }}>전체 순서 ({councilRuntimeQueue.length}명)</div>
                      {councilRuntimeQueue.map((agent, idx) => {
                        const isDone = idx < done;
                        return (
                          <div key={agent.qid} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 7px", background: isDone ? "#f5f5f5" : "#ffffff", border: `1px solid ${isDone ? "#e5e5e5" : agent.color + "33"}`, borderRadius: "8px", marginBottom: "4px", opacity: isDone ? 0.5 : 1 }}>
                            <span style={{ fontSize: "9px", color: "#cccccc", width: "14px", textAlign: "right" }}>{idx + 1}</span>
                            <span>{agent.icon}</span>
                            <span style={{ fontSize: "10px", color: isDone ? "#aaaaaa" : agent.color, flex: 1 }}>
                              <span style={{ fontSize: "8px", opacity: 0.4, marginRight: "2px" }}>[{agent.group}]</span>{agent.role}
                            </span>
                            {isDone
                              ? <span style={{ fontSize: "9px", color: "#aaaaaa" }}>✓</span>
                              : <>
                                  <button onClick={() => moveUp(idx)} disabled={idx === done}
                                    style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #e0e0e0", borderRadius: "4px", cursor: idx === done ? "default" : "pointer", color: idx === done ? "#e0e0e0" : "#888888" }}>↑</button>
                                  <button onClick={() => moveDown(idx)} disabled={idx === councilRuntimeQueue.length - 1}
                                    style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #e0e0e0", borderRadius: "4px", cursor: idx === councilRuntimeQueue.length - 1 ? "default" : "pointer", color: idx === councilRuntimeQueue.length - 1 ? "#e0e0e0" : "#888888" }}>↓</button>
                                  <button onClick={() => removeItem(idx)}
                                    style={{ padding: "1px 5px", fontSize: "9px", background: "none", border: "1px solid #f0aaaa", borderRadius: "4px", cursor: "pointer", color: "#cc6666" }}>✕</button>
                                </>
                            }
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setCouncilQueueEditor(false)}
                      style={{ padding: "7px 20px", background: "#111111", border: "none", borderRadius: "16px", color: "#ffffff", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>
                      확인
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {councilRunning && (
            <div style={{ padding: "7px 20px", background: councilWaitingNext ? "#f0fff4" : "#fff8f0", borderTop: `1px solid ${councilWaitingNext ? "#99ddaa" : "#f0e0cc"}`, display: "flex", alignItems: "center", gap: "10px", transition: "all 0.2s" }}>
              {councilWaitingNext ? (
                <>
                  <span style={{ fontSize: "11px", color: "#336644", flex: 1 }}>
                    ✅ 완료 — 다음: <strong>{councilNextAgentName}</strong>
                  </span>
                  <button onClick={() => setCouncilQueueEditor(true)}
                    style={{ padding: "4px 10px", background: "#f8f8f8", border: "1px solid #dddddd", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
                    ⚙ 순서 수정
                  </button>
                  <button onClick={proceedCouncilNext}
                    style={{ padding: "4px 16px", background: "#111111", border: "none", borderRadius: "20px", color: "#ffffff", fontSize: "11px", cursor: "pointer", fontWeight: 700 }}>
                    ▶ 다음
                  </button>
                  <button onClick={() => councilAbortRef.current?.abort()}
                    style={{ padding: "4px 12px", background: "#fff", border: "1px solid #cc4444", borderRadius: "20px", color: "#cc4444", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>
                    ⏹ 중지
                  </button>
                </>
              ) : (
                <>
                  {[0,1,2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#c0783a", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
                  <span style={{ fontSize: "11px", color: "#c0783a", flex: 1 }}>⚡ 토론 진행 중... ({councilProgress + 1}/{councilRuntimeQueue.length})</span>
                  <button onClick={() => setCouncilQueueEditor(true)}
                    style={{ padding: "3px 10px", background: "#f8f8f8", border: "1px solid #dddddd", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
                    ⚙ 순서 수정
                  </button>
                  <button onClick={() => councilAbortRef.current?.abort()}
                    style={{ padding: "3px 12px", background: "#fff", border: "1px solid #cc4444", borderRadius: "20px", color: "#cc4444", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>
                    ⏹ 중지
                  </button>
                </>
              )}
            </div>
          )}
          {loading && (() => {
            const timings = chatTimingsRef.current;
            const chatEstimate = timings.length > 0
              ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
              : 45;
            return (
              <div style={{ padding: "8px 20px 6px", background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#bbbbbb", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
                    <span style={{ fontSize: "11px", color: "#bbbbbb", marginLeft: "5px" }}>응답 생성 중</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "3px", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ fontSize: "22px", fontWeight: 700, color: "#999999", lineHeight: 1 }}>{loadingElapsed}</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#bbbbbb" }}>s</span>
                    <span style={{ fontSize: "11px", color: "#cccccc", marginLeft: "4px" }}>/ ~{chatEstimate}s</span>
                  </div>
                </div>
                <div style={{ height: "2px", background: "#eeeeee", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg, #cccccc, #999999)", borderRadius: "2px", width: `${Math.min(100, Math.round((loadingElapsed / chatEstimate) * 100))}%`, transition: "width 0.5s linear" }} />
                </div>
              </div>
            );
          })()}
          {proxyAlert && (
            <div style={{ padding: "10px 20px", background: "#fff3cd", borderTop: "1px solid #ffc107", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>⚠️</span>
              <span style={{ fontSize: "12px", color: "#664d00", flex: 1 }}>프록시가 연결되지 않았습니다. 우측 상단 <strong>⚙ 프록시</strong> 버튼을 눌러 연결해 주세요.</span>
              <button onClick={() => setProxyAlert(false)} style={{ background: "none", border: "none", color: "#664d00", cursor: "pointer", fontSize: "14px", padding: 0 }}>✕</button>
            </div>
          )}
          <div style={{ background: "#ffffff", borderTop: "1px solid #e5e5e5" }}>
            <FilePreview files={pendingImages} onRemove={(i) => setPendingImages(prev => prev.filter((_, idx) => idx !== i))} />
            {!pendingImages.length && <div style={{ padding: "6px 18px 0" }}><span style={{ fontSize: "10px", color: "#252540" }}>🖼 이미지 · 📄 PDF · 📊 CSV/Excel — 드래그 · 붙여넣기 · 클릭 업로드</span></div>}
            <div style={{ padding: "10px 16px 14px", display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <button onClick={() => fileInputRef.current?.click()} style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#f8f8f8", border: "1px solid #cccccc", color: "#5a5a90", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0, transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#aaaaaa"; e.currentTarget.style.color = "#9090d0"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#5a5a90"; }}>📎</button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.csv,.xlsx,.xls,.tsv,text/csv" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} onPaste={onPaste}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                placeholder={chatMode === "agent" ? "문제나 불편함을 말씀해 주십시오..." : "메시지를 입력하세요..."}
                rows={1}
                style={{ flex: 1, background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "12px", padding: "10px 14px", color: "#111111", fontSize: "13.5px", resize: "none", outline: "none", lineHeight: "1.6", maxHeight: "120px", overflowY: "auto", transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = "#aaaaaa"} onBlur={e => e.target.style.borderColor = "#cccccc"} />
              <button onClick={sendMessage} disabled={!canSend}
                style={{ width: "40px", height: "40px", borderRadius: "50%", background: canSend ? "#111111" : "#e5e5e5", border: "1px solid", borderColor: canSend ? "#333333" : "#cccccc", color: canSend ? "#ffffff" : "#aaaaaa", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, transition: "all 0.2s" }}>↑</button>
            </div>
          </div>
        </div>

        <style>{`
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          * { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif !important; }
          @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
          ::-webkit-scrollbar{width:4px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:#e5e5e5;border-radius:2px}
        `}</style>
      </div>
    </>
  );
}
