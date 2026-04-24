import { useState } from "react";
import { AGENT_PROFILES } from "../data/agentProfiles";

export default function AgentsPanel({ open, onClose }) {
  const [expanded, setExpanded] = useState({});
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 399, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(680px, 100vw)", zIndex: 400, background: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e5e5", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: "#aaaaaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Agent Council</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#111111" }}>에이전트 구성원 — 총 {AGENT_PROFILES.reduce((s, g) => s + g.agents.length, 0)}인</div>
          </div>
          <button onClick={onClose} style={{ width: "28px", height: "28px", background: "none", border: "1px solid #e5e5e5", borderRadius: "6px", color: "#aaaaaa", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#aaaaaa"; e.currentTarget.style.color = "#555555"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e5e5"; e.currentTarget.style.color = "#aaaaaa"; }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {AGENT_PROFILES.map((group, gi) => (
            <div key={gi} style={{ marginBottom: "28px" }}>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#222222", marginBottom: "3px" }}>{group.group}</div>
                <div style={{ fontSize: "10px", color: "#aaaaaa" }}>{group.desc}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {group.agents.map((agent) => {
                  const isOpen = expanded[agent.id];
                  return (
                    <div key={agent.id} style={{ border: `1px solid ${isOpen ? agent.color + "55" : "#e5e5e5"}`, borderRadius: "10px", overflow: "hidden", transition: "border-color 0.2s" }}>
                      <button onClick={() => setExpanded(p => ({ ...p, [agent.id]: !p[agent.id] }))}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: isOpen ? agent.color + "08" : "#ffffff", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: agent.color + "20", border: `1.5px solid ${agent.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>{agent.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: agent.color }}>{agent.role}</div>
                          <div style={{ fontSize: "10px", color: "#888888", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.tagline}</div>
                        </div>
                        <span style={{ fontSize: "9px", color: "#cccccc", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "0 14px 12px 56px" }}>
                          {agent.traits.map((t, ti) => (
                            <div key={ti} style={{ display: "flex", gap: "6px", marginBottom: "5px" }}>
                              <span style={{ color: agent.color, fontSize: "10px", flexShrink: 0, marginTop: "1px" }}>•</span>
                              <span style={{ fontSize: "11px", color: "#555555", lineHeight: "1.6" }}>{t}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
