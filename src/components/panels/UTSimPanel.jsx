import { useState } from "react";
import { chatAPI } from "../../api/proxy";
import { DESIGNER_PROTO_PROMPT, RESEARCHER_UT_PROMPT, PERSONA_SIM_PROMPT, RESEARCHER_ANALYSIS_PROMPT } from "../../prompts/tools";
import { openFullView } from "../../utils/markdown";

const UT_STEP_COLORS = {
  prototype: "#6c8ebf", scenario: "#7b68b5",
  persona_a: "#5a9e8f", persona_b: "#4a8e7f", persona_c: "#3a7e6f",
  analysis: "#c97b3a",
};

export default function UTSimPanel({ solutionContent, onClose }) {
  const STEPS_DEF = [
    { id: "prototype", label: "디자이너 에이전트", sublabel: "HTML 프로토타입 생성", icon: "🎨" },
    { id: "scenario",  label: "리서처 에이전트",  sublabel: "UT 시나리오 + 페르소나 3명 설정", icon: "🔬" },
    { id: "persona_a", label: "페르소나 A",        sublabel: "프로토타입 조작 시뮬레이션", icon: "👤" },
    { id: "persona_b", label: "페르소나 B",        sublabel: "프로토타입 조작 시뮬레이션", icon: "👤" },
    { id: "persona_c", label: "페르소나 C",        sublabel: "프로토타입 조작 시뮬레이션", icon: "👤" },
    { id: "analysis",  label: "리서처 에이전트",  sublabel: "결과 분석 + 인사이트", icon: "📋" },
  ];
  const [steps, setSteps] = useState(STEPS_DEF.map(s => ({ ...s, status: "waiting", result: "" })));
  const [phase, setPhase] = useState("idle");
  const [protoHTML, setProtoHTML] = useState("");
  const [showProto, setShowProto] = useState(false);
  const [verdict, setVerdict] = useState(null);

  const updateStep = (id, updates) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

  const callAgent = async (system, userContent, maxTokens = 3000) => {
    const data = await chatAPI({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: userContent }] });
    return data.content?.[0]?.text || "";
  };

  const runUT = async () => {
    setPhase("running");

    updateStep("prototype", { status: "running" });
    const protoRaw = await callAgent(DESIGNER_PROTO_PROMPT, `솔루션:\n${solutionContent}`, 8000);
    const htmlMatch = protoRaw.match(/<html[\s\S]*?<\/html>/i);
    const html = htmlMatch ? htmlMatch[0] : `<html><body style="font-family:sans-serif;padding:20px;background:#1a1a1a;color:#fff"><h3>프로토타입</h3><p>${solutionContent.slice(0,200)}</p></body></html>`;
    setProtoHTML(html);
    updateStep("prototype", { status: "done", result: "HTML 프로토타입 생성 완료" });

    updateStep("scenario", { status: "running" });
    const scenarioResult = await callAgent(RESEARCHER_UT_PROMPT, `솔루션:\n${solutionContent}`);
    updateStep("scenario", { status: "done", result: scenarioResult });

    const personaBlocks = scenarioResult.split(/## 페르소나 [ABC]:/);
    const taskMatch = scenarioResult.match(/## UT 시나리오\n([\s\S]+?)(?=##|$)/);
    const taskDesc = taskMatch?.[1]?.trim() || "앱을 사용해 목표를 달성해 보십시오.";

    const personaIds = ["persona_a", "persona_b", "persona_c"];
    const personaResults = [];
    for (let i = 0; i < 3; i++) {
      const pid = personaIds[i];
      const personaText = personaBlocks[i + 1] ? `페르소나 ${["A","B","C"][i]}: ${personaBlocks[i + 1].trim()}` : `일반 사용자 페르소나 ${["A","B","C"][i]}`;
      const nameMatch = personaText.match(/^([^\n-]+)/);
      const personaName = nameMatch?.[1]?.trim() || `페르소나 ${["A","B","C"][i]}`;
      updateStep(pid, { status: "running", sublabel: personaName });
      const simResult = await callAgent(
        PERSONA_SIM_PROMPT(personaText),
        `UT 태스크: ${taskDesc}\n\n프로토타입: 앱 메인 화면, 카테고리 탐색, 주요 기능 화면으로 구성되어 있습니다.`
      );
      personaResults.push(simResult);
      updateStep(pid, { status: "done", result: simResult });
    }

    updateStep("analysis", { status: "running" });
    const analysisResult = await callAgent(
      RESEARCHER_ANALYSIS_PROMPT,
      `솔루션:\n${solutionContent}\n\n[페르소나 A 시뮬레이션]\n${personaResults[0]}\n\n[페르소나 B 시뮬레이션]\n${personaResults[1]}\n\n[페르소나 C 시뮬레이션]\n${personaResults[2]}`
    );
    updateStep("analysis", { status: "done", result: analysisResult });

    const vUpper = analysisResult.toUpperCase();
    setVerdict(vUpper.includes("PROCEED") || vUpper.includes("M4") ? "M4" : "M1");
    setPhase("done");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "760px", maxHeight: "90vh", background: "#f5f5f5", border: "1px solid #cccccc", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#444444" }}>🧪 UT 시뮬레이션 파이프라인</span>
            <span style={{ fontSize: "11px", color: "#aaaaaa", marginLeft: "10px" }}>프로토 → 시나리오 → 페르소나 A·B·C → 분석 → 판단</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {phase === "idle" && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ background: "#111111", borderRadius: "12px", padding: "20px", marginBottom: "28px", fontFamily: "monospace", fontSize: "11px", color: "#888888", textAlign: "left", lineHeight: "2.2", letterSpacing: "0.04em" }}>
                {[
                  ["M3 솔루션 설계", "#5a9e8f"],
                  ["디자이너 에이전트 → HTML 프로토타입 생성", "#6c8ebf"],
                  ["리서처 에이전트 → UT 시나리오 + 페르소나 3명 설정", "#7b68b5"],
                  ["페르소나 A, B, C → 각자 프로토타입 조작 시뮬레이션", "#5a9e8f"],
                  ["리서처 에이전트 → 결과 분석 + 인사이트", "#c97b3a"],
                  ["M4로 넘어갈지 M1으로 돌아갈지 판단", "#ffffff"],
                ].map(([text, color], i, arr) => (
                  <div key={i}>
                    <span style={{ color }}>  {text}</span>
                    {i < arr.length - 1 && <div style={{ color: "#333333", paddingLeft: "8px" }}>  ↓</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "12px", color: "#888888", marginBottom: "24px", lineHeight: "1.8" }}>
                6단계 에이전트가 순차 실행됩니다. 약 1-2분이 소요됩니다.
              </div>
              <button onClick={runUT} style={{ padding: "12px 40px", background: "#111111", border: "1px solid #333333", borderRadius: "24px", color: "#ffffff", fontSize: "13px", cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#333333"}
                onMouseLeave={e => e.currentTarget.style.background = "#111111"}>
                UT 파이프라인 시작
              </button>
            </div>
          )}

          {(phase === "running" || phase === "done") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {steps.map((step, i) => {
                const color = UT_STEP_COLORS[step.id];
                return (
                  <div key={step.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0" }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: step.status === "waiting" ? "#f0f0f0" : color + "22", border: `1px solid ${step.status === "waiting" ? "#e5e5e5" : color + "66"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, color: step.status === "done" ? color : "inherit", fontWeight: step.status === "done" ? 700 : 400 }}>
                        {step.status === "done" ? "✓" : step.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: step.status === "waiting" ? "#aaaaaa" : color }}>{step.label}</div>
                        <div style={{ fontSize: "10px", color: "#aaaaaa" }}>{step.sublabel}</div>
                      </div>
                      {step.status === "running" && (
                        <div style={{ display: "flex", gap: "4px" }}>
                          {[0,1,2].map(j => <div key={j} style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${j*0.2}s` }} />)}
                        </div>
                      )}
                      {step.id === "prototype" && step.status === "done" && protoHTML && (
                        <button onClick={() => setShowProto(true)}
                          style={{ padding: "4px 12px", background: "#eef4ff", border: "1px solid #aaccea", borderRadius: "16px", color: "#557799", fontSize: "10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          📱 미리보기
                        </button>
                      )}
                    </div>

                    {step.status === "done" && step.result && step.id !== "prototype" && (
                      <div style={{ marginLeft: "40px", marginBottom: "4px", padding: "10px 12px", background: "#ffffff", border: `1px solid ${color}22`, borderRadius: "8px", maxHeight: "100px", overflowY: "auto" }}>
                        <div style={{ fontSize: "11px", color: "#666666", lineHeight: "1.6" }}>
                          {step.result.slice(0, 400)}{step.result.length > 400 ? "..." : ""}
                        </div>
                      </div>
                    )}

                    {i < steps.length - 1 && (
                      <div style={{ marginLeft: "15px", color: "#cccccc", fontSize: "14px", lineHeight: "1" }}>↓</div>
                    )}
                  </div>
                );
              })}

              {verdict && (
                <div style={{ marginTop: "16px", padding: "16px 20px", borderRadius: "12px", background: verdict === "M4" ? "#edf7f0" : "#fef2f2", border: `1px solid ${verdict === "M4" ? "#90c8a0" : "#f0a0a0"}` }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: verdict === "M4" ? "#4a9a6a" : "#aa4444", marginBottom: "6px" }}>
                    {verdict === "M4" ? "✅ M4 진행 권고" : "↩️ M1 재검토 권고"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666666" }}>
                    {verdict === "M4"
                      ? "UT 결과 기반으로 개선사항 반영 후 POC 빌드를 시작할 수 있습니다."
                      : "핵심 사용자 가정에 오류가 발견되었습니다. 문제 정의를 재검토하십시오."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {phase === "done" && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e5e5", display: "flex", gap: "8px" }}>
            <button onClick={() => openFullView(steps.filter(s => s.result).map(s => `## ${s.label} — ${s.sublabel}\n\n${s.result}`).join("\n\n---\n\n"))}
              style={{ padding: "6px 16px", background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "20px", color: "#888888", fontSize: "11px", cursor: "pointer" }}>
              ↗ 전체 결과 보기
            </button>
          </div>
        )}
      </div>

      {showProto && protoHTML && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#ffffff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#888888", letterSpacing: "0.08em" }}>📱 디자이너 에이전트 프로토타입</span>
              <button onClick={() => setShowProto(false)} style={{ background: "none", border: "none", color: "#888888", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
            <iframe srcDoc={protoHTML} width={375} height={667} style={{ display: "block", border: "none" }} sandbox="allow-scripts" title="ut-prototype" />
          </div>
        </div>
      )}
    </div>
  );
}
