import { useState, useEffect } from "react";
import { queryBigQuery } from "../api/proxy";
import { ChartRenderer, DataSummaryCard } from "./ChartRenderer";

// 메시지에서 ```bq ... ``` 블록 추출
export function extractBQBlocks(content) {
  const blocks = [];
  const regex = /```bq\s*([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const raw = m[1].trim();
    // JSON 파싱 시도 (sql + chartHint 포함)
    try {
      const parsed = JSON.parse(raw);
      if (parsed.sql) { blocks.push(parsed); continue; }
    } catch {}
    // 순수 SQL
    if (raw.toUpperCase().startsWith("SELECT") || raw.toUpperCase().startsWith("WITH")) {
      blocks.push({ sql: raw });
    }
  }
  return blocks;
}

// 데이터에서 자동 차트 스펙 추론
function inferChartSpec(rows, hint) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);

  // hint가 있으면 우선
  if (hint) {
    return {
      type: hint.type || "bar",
      title: hint.title || "",
      xKey: hint.xKey || cols[0],
      yKey: hint.yKey || cols.find(c => typeof rows[0][c] === "number") || cols[1],
      data: rows,
    };
  }

  // 자동 추론
  const numCols = cols.filter(c => typeof rows[0][c] === "number");
  const strCols = cols.filter(c => typeof rows[0][c] === "string");

  if (numCols.length === 0) return null;

  const xKey = strCols[0] || cols[0];
  const yKey = numCols[0];

  // 날짜 패턴 감지 → line chart
  const isTimeSeries = rows.length > 2 && /^\d{4}[-/]/.test(String(rows[0][xKey]));
  const type = isTimeSeries ? "line" : rows.length <= 8 ? "pie" : "bar";

  return { type, title: "", xKey, yKey, data: rows };
}

// 요약 통계 생성
function computeStats(rows) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);
  const stats = {};
  for (const col of cols) {
    const vals = rows.map(r => r[col]).filter(v => v != null);
    const nums = vals.map(Number).filter(n => !isNaN(n));
    if (nums.length > vals.length * 0.5) {
      stats[col] = {
        type: "numeric",
        mean: (nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString("ko-KR", { maximumFractionDigits: 1 }),
        min: Math.min(...nums).toLocaleString("ko-KR"),
        max: Math.max(...nums).toLocaleString("ko-KR"),
      };
    } else {
      const counts = {};
      vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      stats[col] = { type: "categorical", top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5) };
    }
  }
  return stats;
}

export function BQAutoRunner({ content }) {
  const blocks = extractBQBlocks(content);
  if (!blocks.length) return null;
  return blocks.map((block, i) => <BQBlock key={i} block={block} />);
}

function BQBlock({ block }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [chartSpec, setChartSpec] = useState(null);
  const [stats, setStats] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    runQuery();
  }, []);

  async function runQuery() {
    setState("loading");
    try {
      const result = await queryBigQuery(block.sql);
      setRows(result.rows);
      setChartSpec(inferChartSpec(result.rows, block.chart));
      setStats(computeStats(result.rows));
      setState("done");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  return (
    <div style={{ margin: "12px 0", borderRadius: "10px", border: "1px solid #d4e0f0", background: "#f8faff", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#4a6fa5", letterSpacing: "0.06em" }}>
          {state === "loading" ? "⏳ BigQuery 실행 중..." : state === "error" ? "❌ 쿼리 실패" : `📊 ${rows?.length || 0}건 조회`}
        </span>
        {state === "done" && (
          <button onClick={() => setShowTable(!showTable)}
            style={{ marginLeft: "auto", padding: "3px 10px", background: "transparent", border: "1px solid #bbb", borderRadius: "6px", color: "#666", fontSize: "10px", cursor: "pointer" }}>
            {showTable ? "테이블 숨기기" : "테이블 보기"}
          </button>
        )}
      </div>

      {/* SQL 미리보기 */}
      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#6a7a8a", background: "#f0f3f8", borderRadius: "6px", padding: "8px 10px", marginBottom: "10px", maxHeight: "60px", overflow: "hidden", whiteSpace: "pre-wrap" }}>
        {block.sql.length > 200 ? block.sql.slice(0, 200) + "..." : block.sql}
      </div>

      {state === "error" && (
        <div style={{ color: "#c44", fontSize: "12px", padding: "8px", background: "#fff0f0", borderRadius: "6px" }}>
          {error}
          <button onClick={runQuery} style={{ marginLeft: "10px", padding: "3px 10px", background: "#111", color: "#fff", border: "none", borderRadius: "6px", fontSize: "10px", cursor: "pointer" }}>재시도</button>
        </div>
      )}

      {state === "done" && chartSpec && <ChartRenderer spec={chartSpec} />}
      {state === "done" && stats && <DataSummaryCard stats={stats} />}

      {state === "done" && showTable && rows?.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: "10px", borderRadius: "8px", border: "1px solid #ddd", maxHeight: "300px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#eef2f8" }}>
                {Object.keys(rows[0]).map(col => (
                  <th key={col} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 600, borderBottom: "1px solid #ccc", whiteSpace: "nowrap" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, ri) => (
                <tr key={ri} style={{ borderBottom: "1px solid #eee", background: ri % 2 ? "#f8f8fc" : "transparent" }}>
                  {Object.values(row).map((val, ci) => (
                    <td key={ci} style={{ padding: "5px 10px", color: "#333", whiteSpace: "nowrap" }}>
                      {val == null ? "—" : typeof val === "number" ? val.toLocaleString("ko-KR") : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && <div style={{ padding: "6px", textAlign: "center", color: "#888", fontSize: "10px" }}>... 외 {rows.length - 100}건</div>}
        </div>
      )}
    </div>
  );
}
