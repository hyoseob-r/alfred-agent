import { useState } from "react";
import { chatAPI } from "../../api/proxy";
import { DECK_PROMPT } from "../../prompts/tools";
import { FullViewButton } from "../../utils/markdown";

function parseSlides(text) {
  return text.split(/\n---\n/).map((part, i) => {
    const lines = part.trim().split("\n");
    const m = lines[0].match(/^#\s+SLIDE\s+(\d+)\s*[···]\s*(.+)$/);
    return {
      number: m ? m[1] : String(i + 1).padStart(2, "0"),
      title: m ? m[2] : lines[0].replace(/^#+\s*/, ""),
      content: lines.slice(1).join("\n").trim(),
    };
  });
}

function SlideCard({ slide }) {
  const isOutline = /outline/i.test(slide.title);
  const lines = slide.content.split("\n");

  const sections = [];
  let cur = null;
  const flush = () => { if (cur) { sections.push(cur); cur = null; } };

  lines.forEach(line => {
    if (!line.trim()) { flush(); return; }
    if (line.trim() === "↓") { flush(); sections.push({ type: "arrow" }); return; }
    const boldKV = line.match(/^\*\*(.+?)\*\*\s+(.+)/);
    const boldH  = line.match(/^\*\*(.+?)\*\*\s*$/);
    const bullet = line.match(/^[-•]\s+(.+)/);
    if (boldKV) {
      if (!cur || cur.type !== "pairs") { flush(); cur = { type: "pairs", items: [] }; }
      cur.items.push({ key: boldKV[1], value: boldKV[2] });
    } else if (boldH) {
      flush(); cur = { type: "section", title: boldH[1], bullets: [] };
    } else if (bullet) {
      if (!cur) cur = { type: "bullets", items: [] };
      if (cur.type === "section") cur.bullets.push(bullet[1]);
      else if (cur.type === "bullets") cur.items.push(bullet[1]);
    } else {
      if (!cur || cur.type !== "text") { flush(); cur = { type: "text", lines: [] }; }
      cur.lines.push(line);
    }
  });
  flush();

  const allItems = sections.flatMap(s => s.items || s.bullets || s.lines || []);

  return (
    <div style={{ flexShrink: 0, width: "280px", height: "380px", background: "#141414", border: "1px solid #2a2a2a", borderRadius: "12px", padding: "22px 20px 18px", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{ fontSize: "10px", color: "#444444", fontFamily: "monospace", marginBottom: "14px", letterSpacing: "0.12em" }}>{slide.number}</div>

      {isOutline ? (
        <div>
          <div style={{ fontSize: "12px", color: "#cc3344", marginBottom: "12px", fontStyle: "italic", letterSpacing: "0.04em" }}>Outline</div>
          {allItems.map((item, i) => (
            <div key={i} style={{ fontSize: "12.5px", color: "#dddddd", lineHeight: "1.9" }}>{i + 1}. {item}</div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", scrollbarWidth: "none" }}>
          {sections.map((s, i) => {
            if (s.type === "arrow") return (
              <div key={i} style={{ color: "#3a3a3a", fontSize: "13px", textAlign: "center", lineHeight: "1", flexShrink: 0 }}>↓</div>
            );
            if (s.type === "section") return (
              <div key={i}>
                <div style={{ fontSize: "10px", color: "#666666", marginBottom: "4px", letterSpacing: "0.08em", fontWeight: 600 }}>{s.title}</div>
                {s.bullets.map((b, j) => (
                  <div key={j} style={{ fontSize: "11px", color: "#cccccc", lineHeight: "1.65", paddingLeft: "8px", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#444444", flexShrink: 0 }}>•</span>{b}
                  </div>
                ))}
              </div>
            );
            if (s.type === "pairs") return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {s.items.map((item, j) => (
                  <div key={j} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "10px", color: "#888888", fontWeight: 600, flexShrink: 0, minWidth: "72px", lineHeight: "1.55", paddingTop: "1px" }}>{item.key}</div>
                    <div style={{ fontSize: "10.5px", color: "#bbbbbb", lineHeight: "1.55" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            );
            if (s.type === "bullets") return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {s.items.map((item, j) => (
                  <div key={j} style={{ fontSize: "11px", color: "#cccccc", lineHeight: "1.65", display: "flex", gap: "6px" }}>
                    <span style={{ color: "#444444", flexShrink: 0 }}>•</span>{item}
                  </div>
                ))}
              </div>
            );
            if (s.type === "text") return (
              <div key={i}>{s.lines.map((l, j) => <div key={j} style={{ fontSize: "11px", color: "#bbbbbb", lineHeight: "1.65" }}>{l}</div>)}</div>
            );
            return null;
          })}
        </div>
      )}

      <div style={{ position: "absolute", bottom: "12px", right: "16px", fontSize: "8px", color: "#2a2a2a", letterSpacing: "0.14em", textTransform: "uppercase" }}>{slide.title}</div>
    </div>
  );
}

const TASK_TYPES = [
  { id: "deck", label: "리뷰 장표", icon: "◻", placeholder: "프로젝트 컨텍스트를 입력하세요. 예: 배달앱 탐색 탭 리뉴얼 — 3040 이탈률 감소, 비주얼 중심 UX 개선" },
];

export default function TasksPanel() {
  const [activeTask, setActiveTask] = useState("deck");
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const PROMPT_MAP = { deck: DECK_PROMPT };

  const run = async () => {
    if (!topic.trim() || loading) return;
    setResult("");
    setLoading(true);
    try {
      const data = await chatAPI({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 4000,
        system: PROMPT_MAP[activeTask],
        messages: [{ role: "user", content: topic }],
      });
      setResult(data.content?.[0]?.text || "결과를 가져오지 못했습니다.");
    } catch {
      setResult("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const slides = result ? parseSlides(result) : [];
  const currentTask = TASK_TYPES.find(t => t.id === activeTask);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #e5e5e5", background: "#ffffff", display: "flex", gap: "8px", alignItems: "center" }}>
        {TASK_TYPES.map(t => (
          <button key={t.id} onClick={() => { setActiveTask(t.id); setResult(""); }}
            style={{ padding: "5px 14px", background: activeTask === t.id ? "#111111" : "#f8f8f8", border: "1px solid", borderColor: activeTask === t.id ? "#333333" : "#cccccc", borderRadius: "20px", color: activeTask === t.id ? "#ffffff" : "#777777", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }}>
            {t.icon} {t.label}
          </button>
        ))}
        <span style={{ fontSize: "10px", color: "#cccccc", marginLeft: "4px" }}>더 많은 태스크 추가 예정</span>
      </div>

      <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", background: "#ffffff" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }}
            placeholder={currentTask?.placeholder || ""}
            rows={2}
            style={{ flex: 1, background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "12px", padding: "10px 14px", color: "#111111", fontSize: "13px", resize: "none", outline: "none", lineHeight: "1.6", transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = "#aaaaaa"}
            onBlur={e => e.target.style.borderColor = "#cccccc"}
          />
          <button onClick={run} disabled={!topic.trim() || loading}
            style={{ padding: "0 22px", background: topic.trim() && !loading ? "#111111" : "#e5e5e5", border: "1px solid", borderColor: topic.trim() && !loading ? "#333333" : "#cccccc", borderRadius: "12px", color: topic.trim() && !loading ? "#ffffff" : "#aaaaaa", fontSize: "13px", cursor: topic.trim() && !loading ? "pointer" : "not-allowed", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {loading ? "생성 중..." : "생성"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 20px", background: "#f5f5f5" }}>
        {loading && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center", color: "#aaaaaa", fontSize: "12px" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#aaaaaa", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
            <span style={{ marginLeft: "8px" }}>장표 생성 중...</span>
          </div>
        )}
        {slides.length > 0 && !loading && (
          <>
            <div style={{ fontSize: "10px", color: "#aaaaaa", marginBottom: "14px", letterSpacing: "0.1em" }}>
              {slides.length} SLIDES · 스크롤하여 확인
            </div>
            <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "12px", scrollbarWidth: "thin", scrollbarColor: "#cccccc transparent" }}>
              {slides.map((slide, i) => <SlideCard key={i} slide={slide} />)}
            </div>
            <div style={{ marginTop: "16px" }}>
              <FullViewButton content={result} />
            </div>
          </>
        )}
        {!result && !loading && (
          <div style={{ textAlign: "center", color: "#cccccc", fontSize: "12px", marginTop: "60px", lineHeight: "2" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3 }}>◻</div>
            프로젝트 컨텍스트를 입력하면<br />
            리뷰용 슬라이드 구조를 자동 생성합니다.
          </div>
        )}
      </div>
    </div>
  );
}
