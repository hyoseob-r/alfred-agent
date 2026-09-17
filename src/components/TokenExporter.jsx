import { useState } from "react";
import { generateSwiftUI, generateCompose } from "../utils/tokenCodeGen";

// YDS 토큰 import (storybook의 tokens.js와 동일 구조)
import { metaTokens, colors, typography, spacing } from "./ydsTokens";

const TOKENS = { metaTokens, colors, typography, spacing };

export default function TokenExporter({ onClose }) {
  const [tab, setTab] = useState("swift");
  const [copied, setCopied] = useState(false);

  const code = tab === "swift" ? generateSwiftUI(TOKENS) : generateCompose(TOKENS);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCode() {
    const ext = tab === "swift" ? "swift" : "kt";
    const filename = `YDSTokens.${ext}`;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(900px, 90vw)", maxHeight: "90vh", background: "#1e1e1e", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* 헤더 */}
        <div style={{ padding: "16px 20px", background: "#111", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>YDS 2.0 → Native Code</div>
          <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
            {[{ id: "swift", label: "SwiftUI", icon: "🍎" }, { id: "compose", label: "Compose", icon: "🤖" }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: tab === t.id ? "#3a6fd8" : "#333", color: tab === t.id ? "#fff" : "#999", fontSize: 12, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer" }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={copyCode}
              style={{ padding: "6px 14px", background: copied ? "#22aa55" : "#3a6fd8", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
              {copied ? "✅ 복사됨" : "📋 복사"}
            </button>
            <button onClick={downloadCode}
              style={{ padding: "6px 14px", background: "#555", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
              💾 다운로드
            </button>
            <button onClick={onClose}
              style={{ padding: "6px 10px", background: "transparent", color: "#666", border: "1px solid #444", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* 코드 영역 */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
          <pre style={{ margin: 0, padding: 16, fontSize: 12, fontFamily: "'SF Mono', 'Fira Code', monospace", color: "#d4d4d4", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {code}
          </pre>
        </div>

        {/* 하단 정보 */}
        <div style={{ padding: "10px 20px", background: "#111", display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: "#666" }}>
          <span>{tab === "swift" ? "YDSTokens.swift" : "YDSTokens.kt"}</span>
          <span>·</span>
          <span>{code.split('\n').length}줄</span>
          <span>·</span>
          <span>색상 {Object.keys(TOKENS.colors?.foundation || {}).length + Object.keys(TOKENS.colors?.gray || {}).length}개</span>
          <span>·</span>
          <span>타이포 {TOKENS.typography?.length || 0}개</span>
          <span>·</span>
          <span>스페이싱 {TOKENS.spacing?.length || 0}개</span>
        </div>
      </div>
    </div>
  );
}
