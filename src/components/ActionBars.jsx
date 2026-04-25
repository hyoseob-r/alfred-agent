import { useState, useRef } from "react";
import { fileToBase64, fileToText } from "../utils/file";
import ReviewPanel from "./panels/ReviewPanel";
import AgentCouncilPanel from "./panels/AgentCouncilPanel";
import UTSimPanel from "./panels/UTSimPanel";

export function M3ActionBar({ solutionContent, user, sessionId, isOwner }) {
  const [showCouncil, setShowCouncil] = useState(false);
  const [showUT, setShowUT] = useState(false);
  const [councilRounds, setCouncilRounds] = useState([]);
  const [councilContext, setCouncilContext] = useState("");
  const hasProgress = councilRounds.length > 0;
  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0 0 42px" }}>
        <button onClick={() => setShowCouncil(true)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: hasProgress ? "#f0f4ff" : "#f0f4ff", border: `1px solid ${hasProgress ? "#7788cc" : "#aab4ee"}`, borderRadius: "20px", color: "#446699", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#7788cc"}
          onMouseLeave={e => e.currentTarget.style.borderColor = hasProgress ? "#7788cc" : "#aab4ee"}>
          🧑‍🤝‍🧑 에이전트 협의{hasProgress ? ` (${councilRounds.length}R 완료)` : ""}
        </button>
        <button onClick={() => setShowUT(true)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#f0fff4", border: "1px solid #aaeecc", borderRadius: "20px", color: "#447755", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#77ccaa"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#aaeecc"}>
          🧪 UT 시뮬레이션
        </button>
      </div>
      {showCouncil && (
        <AgentCouncilPanel
          solutionContent={solutionContent}
          onClose={() => setShowCouncil(false)}
          user={user}
          sessionId={sessionId}
          isOwner={isOwner}
          initialRounds={councilRounds}
          initialContext={councilContext}
          onRoundsUpdate={(rounds, ctx) => { setCouncilRounds(rounds); if (ctx) setCouncilContext(ctx); }}
        />
      )}
      {showUT && <UTSimPanel solutionContent={solutionContent} onClose={() => setShowUT(false)} />}
    </>
  );
}

export function DocActionBar({ docContent, onUploadForCompare }) {
  const [showReview, setShowReview] = useState(false);
  const fileRef = useRef(null);

  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0 0 42px" }}>
        <button
          onClick={() => setShowReview(true)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#eef4ff", border: "1px solid #aaccea", borderRadius: "20px", color: "#557799", fontSize: "11px", cursor: "pointer", fontFamily: "'Pretendard', sans-serif", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#5a9aaa"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#aaccea"}
        >
          📋 자동 검토
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#f5eeff", border: "1px solid #ccaaee", borderRadius: "20px", color: "#7740aa", fontSize: "11px", cursor: "pointer", fontFamily: "'Pretendard', sans-serif", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#9a5aaa"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#ccaaee"}
        >
          ⚖️ 기존 문서와 비교
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.pdf,image/*" style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.type.startsWith("image/")) {
              const b64 = await fileToBase64(file);
              onUploadForCompare({ type: "image", data: b64, mediaType: file.type, name: file.name });
            } else {
              const text = await fileToText(file);
              onUploadForCompare({ type: "text", data: text, name: file.name });
            }
            e.target.value = "";
          }}
        />
      </div>
      {showReview && <ReviewPanel doc={docContent} title="2-Pager 자동 검토" onClose={() => setShowReview(false)} />}
    </>
  );
}
