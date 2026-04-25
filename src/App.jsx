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

const GUEST_LS_KEY = "alfred_guest_sessions";

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
    a.download = `alfred-session-${new Date().toISOString().slice(0,10)}.json`;
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
          setMessages(data.messages);
          if (data.council) councilDataRef.current = data.council;
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const title = messages.find(m => m.role === "user")?.content?.slice(0, 40) || "새 대화";
      if (user) {
        setDbSaving(true);
        const giveUp = setTimeout(() => setDbSaving(false), 10000);
        try {
          await dbUpsertSession({ id: activeSessionId, title, stage: currentStage }, user.id);
          await dbSaveMessages(activeSessionId, messages, user.id);
          const s = await dbLoadSessions(user.id);
          setSessions(s);
        } catch (e) { console.error("save error:", e); }
        finally { clearTimeout(giveUp); setDbSaving(false); }
      }
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [messages]);

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
    setMessages(msgs);
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

  const sendMessage = async () => {
    if ((!input.trim() && !pendingImages.length) || loading) return;
    const userText = input.trim();
    const files = [...pendingImages];
    setInput(""); setPendingImages([]);
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
        const isAssembleTrigger = /assemble|어셈블|council\s*시작|에이전트\s*협의\s*시작|19인\s*토론/i.test(userText);

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
          <button onClick={() => setUser(false)}
            style={{ width: "100%", padding: "14px 24px", background: "transparent", border: "none", borderRadius: "14px", color: "#888888", fontSize: "14px", fontWeight: "500", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#444444"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#888888"; }}>
            로그인 없이 사용하기
          </button>
        </div>
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
      {showProxySettings && (
        <ProxyStatusModal
          onClose={() => setShowProxySettings(false)}
          githubLogin={user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || ""}
          proxyUrl={proxyUrl}
          onDetected={(url) => { setProxyUrl(url); setHasProxy(!!url); }}
        />
      )}
      <AgentsPanel open={showAgents} onClose={() => setShowAgents(false)} />
      <ContextAgentPanel open={showContextAgent} onClose={() => setShowContextAgent(false)} />

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
                onCouncilUpdate={(rounds, fullContext) => { councilDataRef.current = { rounds, fullContext }; }} />
            ))}
            <div ref={bottomRef} />
          </div>

          {loading && (
            <div style={{ padding: "5px 20px", background: "#fafafa", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "8px" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#bbbbbb", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              <span style={{ fontSize: "11px", color: "#bbbbbb", fontVariantNumeric: "tabular-nums" }}>응답 생성 중 {loadingElapsed}s</span>
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
