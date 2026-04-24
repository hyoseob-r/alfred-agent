import { DataSummaryCard } from "./ChartRenderer";

export default function FilePreview({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "10px 16px 0" }}>
      {files.map((f, i) => (
        <div key={i} style={{ position: "relative" }}>
          {f.type === "pdf" ? (
            <div style={{ width: "64px", height: "64px", borderRadius: "8px", border: "1px solid #d0aaee", background: "#f5f0ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <span style={{ fontSize: "20px" }}>📄</span>
              <span style={{ fontSize: "8px", color: "#7740aa", maxWidth: "56px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{f.name}</span>
            </div>
          ) : f.type === "data" ? (
            <div style={{ height: "64px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #90c890", background: "#eef8ee", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px", minWidth: "80px" }}>
              <span style={{ fontSize: "16px" }}>📊</span>
              <span style={{ fontSize: "8px", color: "#3a8a3a", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              {f.parsed && <span style={{ fontSize: "8px", color: "#3a5a3a" }}>{f.parsed.rows.length}행 · {f.parsed.headers.length}열</span>}
            </div>
          ) : (
            <img src={f.preview} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cccccc" }} />
          )}
          <button onClick={() => onRemove(i)} style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", background: "#111111", border: "1px solid #bbbbbb", color: "#666666", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      ))}
    </div>
  );
}
