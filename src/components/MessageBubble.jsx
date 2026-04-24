import { useState } from "react";
import { chatAPI } from "../api/proxy";
import { extractChartSpec, FullViewButton, MarkdownRenderer } from "../utils/markdown";
import { ChartRenderer, DataSummaryCard } from "./ChartRenderer";
import { DocActionBar, M3ActionBar } from "./ActionBars";
import ComparePanel from "./panels/ComparePanel";

export default function MessageBubble({ msg, user, sessionId, isOwner }) {
  const isUser = msg.role === "user";
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  const has2pager = !isUser && msg.content && (
    msg.content.includes("문제 정의서") || msg.content.includes("Problem Definition")
  );
  const isM3 = !isUser && msg.stageLabel === "M3 솔루션 설계";

  const handleUploadForCompare = async (uploaded) => {
    if (uploaded.type === "image") {
      const data = await chatAPI({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 16000,
        system: "Extract all text content from this document image. Output only the text, preserving structure.",
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: uploaded.mediaType, data: uploaded.data } }, { type: "text", text: "이 문서의 모든 텍스트를 추출해 주십시오." }] }],
      });
      setUploadedDoc({ text: data.content?.[0]?.text || "", name: uploaded.name });
    } else {
      setUploadedDoc({ text: uploaded.data, name: uploaded.name });
    }
    setShowCompare(true);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: (has2pager || isM3) ? "4px" : "16px", gap: "10px", alignItems: "flex-start" }}>
        {!isUser && (
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, #f0f0f5 0%, #e8e8f0 100%)", border: "1px solid #cccccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>A</div>
        )}
        <div style={{ maxWidth: isUser ? "72%" : "calc(100% - 42px)", display: "flex", flexDirection: "column", gap: "6px", alignItems: isUser ? "flex-end" : "flex-start", width: isUser ? undefined : "100%" }}>
          {msg.files?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {msg.files.map((f, i) => f.type === "pdf" ? (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: "#f5f0ff", border: "1px solid #d0aaee", borderRadius: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📄</span>
                  <span style={{ fontSize: "11px", color: "#7740aa" }}>{f.name}</span>
                </div>
              ) : f.type === "data" ? (
                <div key={i} style={{ padding: "6px 12px", background: "#eef8ee", border: "1px solid #90c890", borderRadius: "8px", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: f.stats ? "6px" : 0 }}>
                    <span style={{ fontSize: "14px" }}>📊</span>
                    <span style={{ fontSize: "11px", color: "#3a8a3a" }}>{f.name}</span>
                    {f.parsed && <span style={{ fontSize: "10px", color: "#90c890" }}>{f.parsed.rows.length}행 · {f.parsed.headers.length}열</span>}
                  </div>
                  {f.stats && <DataSummaryCard stats={f.stats} />}
                </div>
              ) : (
                <img key={i} src={f.preview} alt="" style={{ maxWidth: "200px", maxHeight: "200px", objectFit: "cover", borderRadius: "10px", border: "1px solid #cccccc" }} />
              ))}
            </div>
          )}
          {msg.content && (
            <div style={{
              background: isUser ? "linear-gradient(135deg, #111111 0%, #222222 100%)" : "linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)",
              border: isUser ? "1px solid #bbbbbb" : has2pager ? "1px solid #3a5a7a" : "1px solid #cccccc",
              borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              padding: "12px 16px", color: isUser ? "#ffffff" : "#111111", fontSize: "13.5px",
              lineHeight: "1.7", wordBreak: "break-word",
              width: isUser ? undefined : "100%",
            }}>
              {msg.stageLabel && (
                <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: msg.stageColor || "#6c8ebf", marginBottom: "10px", textTransform: "uppercase" }}>
                  {msg.stageIcon} {msg.stageLabel}
                </div>
              )}
              {has2pager && (
                <div style={{ fontSize: "10px", color: "#5a9aaa", marginBottom: "10px", letterSpacing: "0.08em" }}>
                  📄 2-PAGER GENERATED
                </div>
              )}
              {isUser
                ? <div style={{ whiteSpace: "pre-wrap", color: "#f0f0f0", lineHeight: "1.75", fontSize: "13.5px" }}>{msg.content}</div>
                : <MarkdownRenderer content={msg.content} />
              }
            </div>
          )}
          {!isUser && msg.content && (() => {
            const spec = extractChartSpec(msg.content);
            return spec ? <ChartRenderer spec={spec} /> : null;
          })()}
          {!isUser && msg.content && <FullViewButton content={msg.content} />}
        </div>
      </div>

      {has2pager && !isUser && (
        <div style={{ marginBottom: "16px" }}>
          <DocActionBar docContent={msg.content} onUploadForCompare={handleUploadForCompare} />
        </div>
      )}

      {isM3 && (
        <div style={{ marginBottom: "16px" }}>
          <M3ActionBar
            solutionContent={msg.content}
            user={user}
            sessionId={sessionId}
            isOwner={isOwner}
          />
        </div>
      )}

      {showCompare && uploadedDoc && (
        <ComparePanel
          docA={msg.content}
          docB={uploadedDoc.text}
          onClose={() => setShowCompare(false)}
        />
      )}
    </>
  );
}
