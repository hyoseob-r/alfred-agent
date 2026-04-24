import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export const CHART_COLORS = ["#6c8ebf", "#7b68b5", "#5a9e8f", "#c97b3a", "#9e5a9e", "#5a7a9e", "#bf6c6c", "#6cbfb5"];

export function ChartRenderer({ spec }) {
  if (!spec || !spec.data?.length) return null;
  const { type, title, xKey, yKey, data } = spec;
  const axisStyle = { fill: "#888888", fontSize: 11 };
  const tooltipStyle = { background: "#f8f8f8", border: "1px solid #cccccc", borderRadius: "8px", fontSize: "12px", color: "#333333" };
  const commonProps = { data, margin: { top: 8, right: 16, left: 0, bottom: 36 } };
  return (
    <div style={{ margin: "12px 0", padding: "14px 16px", background: "#f8f8f8", border: "1px solid #e5e5e5", borderRadius: "10px", width: "100%" }}>
      {title && <div style={{ fontSize: "12px", fontWeight: 600, color: "#666666", marginBottom: "12px", letterSpacing: "0.04em" }}>{title}</div>}
      <ResponsiveContainer width="100%" height={300}>
        {type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKey || "value"} nameKey={xKey || "name"} cx="50%" cy="50%" outerRadius={80} label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        ) : type === "scatter" ? (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey={xKey} tick={axisStyle} />
            <YAxis dataKey={yKey} tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data} fill="#6c8ebf" />
          </ScatterChart>
        ) : type === "line" ? (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey={xKey} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={yKey} stroke="#6c8ebf" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey={xKey} tick={axisStyle} interval={0} angle={-30} textAnchor="end" height={48} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={yKey} radius={[4,4,0,0]}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function DataSummaryCard({ stats }) {
  if (!stats) return null;
  return (
    <div style={{ margin: "10px 0", display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {Object.entries(stats).map(([col, s]) => (
        <div key={col} style={{ padding: "8px 12px", background: "#f8f8f8", border: "1px solid #e5e5e5", borderRadius: "8px", minWidth: "130px", flex: "1 1 130px" }}>
          <div style={{ fontSize: "10px", color: "#888888", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</div>
          {s.type === "numeric" ? (
            <div style={{ fontSize: "11px", color: "#777777", lineHeight: "1.7" }}>
              <span style={{ color: "#336699", fontWeight: 600 }}>{s.mean}</span> 평균<br />
              <span style={{ color: "#888888" }}>{s.min} – {s.max}</span>
            </div>
          ) : (
            <div style={{ fontSize: "11px", color: "#777777", lineHeight: "1.7" }}>
              {s.top.slice(0, 3).map(([k, v]) => (
                <div key={k} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#555555" }}>{k}</span> <span style={{ color: "#888888" }}>({v})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ScoreBadge({ score, total = 100 }) {
  const pct = Math.round((score / total) * 100);
  const grade = pct >= 90 ? "S" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : "D";
  const color = pct >= 80 ? "#5a9e8f" : pct >= 70 ? "#c97b3a" : "#9e5a5a";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 10px", borderRadius: "12px", background: color + "22", border: `1px solid ${color}66`, fontSize: "11px", fontFamily: "'Pretendard', sans-serif", color }}>
      {grade} · {score}/{total}
    </span>
  );
}
