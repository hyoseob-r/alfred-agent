import { useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from "recharts";
import { queryBigQuery } from "../api/proxy";
import challengeIds from "../data/challenge-ids.json";

const DAYS_KR = ['일','월','화','수','목','금','토'];
function dateLabel(d) {
  const dt = new Date(d + 'T00:00:00+09:00');
  return `${d.slice(5)}(${DAYS_KR[dt.getDay()]})`;
}

const CHALLENGE_SQL = () => {
  const partIds = challengeIds.participants.join(',');
  const allIds = [...challengeIds.participants, ...challengeIds.non_participants_sample].join(',');
  return `
WITH all_targets AS (
  SELECT DISTINCT customer_id FROM UNNEST([${allIds}]) AS customer_id
),
participants AS (
  SELECT DISTINCT customer_id FROM UNNEST([${partIds}]) AS customer_id
),
orders AS (
  SELECT
    o.customer_id,
    DATE(o.order_dt) as order_date,
    o.total_order_amt as order_amt,
    CASE WHEN p.customer_id IS NOT NULL THEN 'P' ELSE 'NP' END as grp
  FROM \`ygy-datawarehouse.edw.lst_order\` o
  INNER JOIN all_targets t ON o.customer_id = t.customer_id
  LEFT JOIN participants p ON o.customer_id = p.customer_id
  WHERE o.order_dt BETWEEN '2026-08-01' AND CURRENT_DATE('+09:00')
)
SELECT
  grp, order_date as dt,
  COUNT(*) as orders,
  COUNT(DISTINCT customer_id) as customers,
  ROUND(SUM(order_amt)) as gmv
FROM orders
GROUP BY grp, order_date
ORDER BY grp, order_date`;
};

const CACHE_KEY = "ypx_challenge_cache_v1";
function loadCache(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function saveCache(key, data) {
  const json = JSON.stringify(data);
  if (json.length > 3000000) { try { localStorage.setItem(key, JSON.stringify(data.slice(-60))); } catch { localStorage.removeItem(key); } return; }
  try { localStorage.setItem(key, json); } catch { localStorage.removeItem(key); }
}

export default function ChallengeContent({ range }) {
  const [data, setData] = useState(() => loadCache(CACHE_KEY));
  const [status, setStatus] = useState("idle");

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await queryBigQuery(CHALLENGE_SQL());
      if (result.rows?.length) {
        const rows = result.rows.map(r => ({ grp: r.grp, dt: r.dt, orders: +r.orders, customers: +r.customers, gmv: +r.gmv }));
        saveCache(CACHE_KEY, rows);
        setData(rows);
        setStatus("+OK");
      } else {
        setStatus("empty");
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ " + (e.message || "오류").slice(0, 50));
    }
    setTimeout(() => setStatus("idle"), 5000);
  }, []);

  if (!data.length) {
    return (
      <div style={{ background: "white", borderRadius: 10, padding: "60px 0", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>미션챌린지 참여자 vs 미참여자 주문 추이</div>
        <div style={{ fontSize: 11, color: "#bbb", marginBottom: 16 }}>참여자 {challengeIds.participants_count.toLocaleString()}명 vs 미참여자 {challengeIds.non_participants_count.toLocaleString()}명</div>
        <button onClick={refresh} disabled={status === "loading"}
          style={{ padding: "10px 20px", background: "#3a6fd8", color: "white", border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", opacity: status === "loading" ? 0.7 : 1 }}>
          {status === "loading" ? "⏳ 불러오는 중..." : "🔄 데이터 새로고침"}
        </button>
      </div>
    );
  }

  // pivot: {dt, p_orders, np_orders, p_customers, np_customers, p_gmv, np_gmv}
  const pData = data.filter(r => r.grp === 'P').sort((a, b) => a.dt.localeCompare(b.dt));
  const npData = data.filter(r => r.grp === 'NP').sort((a, b) => a.dt.localeCompare(b.dt));
  const allDates = [...new Set([...pData.map(r => r.dt), ...npData.map(r => r.dt)])].sort();

  const pMap = Object.fromEntries(pData.map(r => [r.dt, r]));
  const npMap = Object.fromEntries(npData.map(r => [r.dt, r]));

  const chartData = allDates.map(dt => ({
    date: dateLabel(dt),
    rawDate: dt,
    p_orders: pMap[dt]?.orders || 0,
    np_orders: npMap[dt]?.orders || 0,
    np_orders_scaled: Math.round((npMap[dt]?.orders || 0) / 10),
    p_customers: pMap[dt]?.customers || 0,
    np_customers: npMap[dt]?.customers || 0,
    np_customers_scaled: Math.round((npMap[dt]?.customers || 0) / 10),
    p_gmv: Math.round((pMap[dt]?.gmv || 0) / 10000),
    np_gmv: Math.round((npMap[dt]?.gmv || 0) / 10000),
    np_gmv_scaled: Math.round((npMap[dt]?.gmv || 0) / 100000),
  }));

  // KPI
  const beforeP = pData.filter(r => r.dt >= '2026-08-06' && r.dt <= '2026-08-19');
  const duringP = pData.filter(r => r.dt >= '2026-08-20' && r.dt <= '2026-09-01');
  const afterP = pData.filter(r => r.dt >= '2026-09-02');
  const avgBefore = beforeP.length ? Math.round(beforeP.reduce((s, r) => s + r.orders, 0) / beforeP.length) : 0;
  const avgDuring = duringP.length ? Math.round(duringP.reduce((s, r) => s + r.orders, 0) / duringP.length) : 0;
  const avgAfter = afterP.length ? Math.round(afterP.reduce((s, r) => s + r.orders, 0) / afterP.length) : 0;

  const xInterval = chartData.length > 30 ? 2 : chartData.length > 15 ? 1 : 0;

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const raw = payload[0]?.payload;
    return (
      <div style={{ background: "white", border: "1px solid #e5e5e5", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: "#FA0050" }}>참여자: {raw.p_orders}건 / {raw.p_customers}명 / {raw.p_gmv.toLocaleString()}만</div>
        <div style={{ color: "#3498db" }}>미참여자: {(raw.np_orders).toLocaleString()}건 / {raw.np_customers.toLocaleString()}명 / {raw.np_gmv.toLocaleString()}만</div>
      </div>
    );
  };

  return (
    <>
      {/* KPI */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "참여자", val: challengeIds.participants_count.toLocaleString() + "명", color: "#FA0050" },
          { label: "미참여자", val: challengeIds.non_participants_count.toLocaleString() + "명", color: "#3498db" },
          { label: "before 일평균", val: avgBefore + "건/일", color: "#999" },
          { label: "챌린지 일평균", val: avgDuring + "건/일", color: "#FA0050" },
          { label: "after 일평균", val: avgAfter + "건/일", color: avgAfter > avgBefore ? "#22aa55" : "#cc3333" },
          { label: "챌린지 lift", val: (avgDuring > 0 ? "+" + Math.round((avgDuring / avgBefore - 1) * 100) + "%" : "-"), color: "#FA0050" },
        ].map(k => (
          <div key={k.label} style={{ flex: "1 1 100px", background: "white", borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, color: "#999", marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.val}</div>
          </div>
        ))}
        <button onClick={refresh} disabled={status === "loading"}
          style={{ alignSelf: "flex-end", padding: "8px 14px", background: "#3a6fd8", color: "white", border: "none", borderRadius: 8, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
          {status === "loading" ? "⏳..." : status.startsWith("+") ? "✅" : "🔄 새로고침"}
        </button>
      </div>

      {/* 주문 건수 차트 */}
      <div style={{ background: "white", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 4 }}>일별 주문 건수</div>
        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 12 }}>미참여자는 ÷10 스케일 · 툴팁에 실제 값 표시 · 🟨1차 🟧2차</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={xInterval} />
            <YAxis tick={{ fontSize: 9 }} width={40} />
            <Tooltip content={customTooltip} />
            <ReferenceArea x1={dateLabel('2026-08-20')} x2={dateLabel('2026-08-24')} fill="#FFE082" fillOpacity={0.3} />
            <ReferenceArea x1={dateLabel('2026-08-25')} x2={dateLabel('2026-09-01')} fill="#FFAB40" fillOpacity={0.2} />
            <Line type="monotone" dataKey="p_orders" name="참여자" stroke="#FA0050" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="np_orders_scaled" name="미참여자(÷10)" stroke="#3498db" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 주문자 수 차트 */}
      <div style={{ background: "white", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 4 }}>일별 주문자 수 (유니크)</div>
        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 12 }}>미참여자는 ÷10 스케일</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={xInterval} />
            <YAxis tick={{ fontSize: 9 }} width={40} />
            <Tooltip content={customTooltip} />
            <ReferenceArea x1={dateLabel('2026-08-20')} x2={dateLabel('2026-08-24')} fill="#FFE082" fillOpacity={0.3} />
            <ReferenceArea x1={dateLabel('2026-08-25')} x2={dateLabel('2026-09-01')} fill="#FFAB40" fillOpacity={0.2} />
            <Line type="monotone" dataKey="p_customers" name="참여자" stroke="#FA0050" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="np_customers_scaled" name="미참여자(÷10)" stroke="#3498db" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* GMV 차트 */}
      <div style={{ background: "white", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 4 }}>일별 GMV (만원)</div>
        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 12 }}>미참여자는 ÷10 스케일</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={xInterval} />
            <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 9 }} width={50} />
            <Tooltip content={customTooltip} />
            <ReferenceArea x1={dateLabel('2026-08-20')} x2={dateLabel('2026-08-24')} fill="#FFE082" fillOpacity={0.3} />
            <ReferenceArea x1={dateLabel('2026-08-25')} x2={dateLabel('2026-09-01')} fill="#FFAB40" fillOpacity={0.2} />
            <Line type="monotone" dataKey="p_gmv" name="참여자(만원)" stroke="#FA0050" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="np_gmv_scaled" name="미참여자(÷10)" stroke="#3498db" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ textAlign: "right", fontSize: 10, color: "#bbb", marginTop: 8 }}>
        미참여자는 {challengeIds.non_participants_count.toLocaleString()}명 중 5,000명 샘플 · 캐시 {chartData.length}일
      </div>
    </>
  );
}
