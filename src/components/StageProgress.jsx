import { STAGE_INFO } from "../prompts/agent";

export default function StageProgress({ currentStage }) {
  const stages = ["m1_discovery", "m2_ux", "m3_solution", "m4_poc", "m5_validation"];
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", padding: "10px 16px", background: "#ffffff", borderBottom: "1px solid #e5e5e5", overflowX: "auto" }}>
      {stages.map((s, i) => {
        const info = STAGE_INFO[s];
        const isActive = currentStage === s;
        const isDone = stages.indexOf(currentStage) > i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px", borderRadius: "20px", background: isActive ? info.color + "22" : "transparent", border: isActive ? `1px solid ${info.color}66` : "1px solid transparent", transition: "all 0.3s" }}>
              <span style={{ fontSize: "11px" }}>{info.icon}</span>
              <span style={{ fontSize: "10px", fontWeight: isActive ? "700" : "400", color: isActive ? info.color : isDone ? "#aaaaaa" : "#bbbbbb", fontFamily: "'Pretendard', sans-serif" }}>{info.label}</span>
            </div>
            {i < stages.length - 1 && <div style={{ width: "12px", height: "1px", background: "#e5e5e5", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}
