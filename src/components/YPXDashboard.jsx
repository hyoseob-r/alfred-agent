import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { queryBigQuery } from "../api/proxy";

// ─── 캐시 ─────────────────────────────────────────────────────────────────────
const CACHE_KEY = "ypx_dashboard_cache_v2";
const ORDER_CACHE_KEY = "ypx_order_cache_v2";

const INITIAL_DATA = [{"date":"2025-09-07","classic":23634,"naver":712814,"toss":623287,"direct_ypx":218962},{"date":"2025-09-14","classic":23294,"naver":714251,"toss":624943,"direct_ypx":220248},{"date":"2025-09-21","classic":22959,"naver":715506,"toss":627020,"direct_ypx":220223},{"date":"2025-09-28","classic":22630,"naver":719956,"toss":632051,"direct_ypx":216266},{"date":"2025-10-05","classic":22284,"naver":724122,"toss":636506,"direct_ypx":212836},{"date":"2025-10-12","classic":21973,"naver":733048,"toss":640784,"direct_ypx":209223},{"date":"2025-10-19","classic":21660,"naver":735838,"toss":642952,"direct_ypx":204497},{"date":"2025-10-26","classic":21340,"naver":737238,"toss":643360,"direct_ypx":201110},{"date":"2025-11-02","classic":20985,"naver":747497,"toss":646358,"direct_ypx":201698},{"date":"2025-11-09","classic":20568,"naver":757558,"toss":646379,"direct_ypx":199659},{"date":"2025-11-16","classic":20229,"naver":770270,"toss":646475,"direct_ypx":198381},{"date":"2025-11-23","classic":19931,"naver":774719,"toss":647412,"direct_ypx":199911},{"date":"2025-11-30","classic":19680,"naver":776463,"toss":647784,"direct_ypx":201315},{"date":"2025-12-07","classic":19279,"naver":780039,"toss":648176,"direct_ypx":199175},{"date":"2025-12-14","classic":19007,"naver":791676,"toss":648492,"direct_ypx":203038},{"date":"2025-12-21","classic":18738,"naver":815202,"toss":647780,"direct_ypx":203460},{"date":"2025-12-28","classic":18486,"naver":836587,"toss":648151,"direct_ypx":203876},{"date":"2026-01-04","classic":18226,"naver":851352,"toss":648495,"direct_ypx":204590},{"date":"2026-01-11","classic":18006,"naver":866774,"toss":648939,"direct_ypx":205115},{"date":"2026-01-18","classic":17793,"naver":887554,"toss":649238,"direct_ypx":204200},{"date":"2026-01-25","classic":17612,"naver":902592,"toss":649559,"direct_ypx":206690},{"date":"2026-02-01","classic":17457,"naver":912592,"toss":650036,"direct_ypx":208602},{"date":"2026-02-08","classic":17235,"naver":919061,"toss":650287,"direct_ypx":208732},{"date":"2026-02-15","classic":17000,"naver":915042,"toss":650675,"direct_ypx":209871},{"date":"2026-02-22","classic":16847,"naver":915224,"toss":651058,"direct_ypx":210932},{"date":"2026-03-01","classic":16607,"naver":921116,"toss":651520,"direct_ypx":214398},{"date":"2026-03-08","classic":16413,"naver":928254,"toss":652019,"direct_ypx":220614},{"date":"2026-03-15","classic":16229,"naver":931924,"toss":652301,"direct_ypx":222761},{"date":"2026-03-22","classic":16055,"naver":936882,"toss":652582,"direct_ypx":223868},{"date":"2026-03-29","classic":15895,"naver":957460,"toss":652769,"direct_ypx":221503},{"date":"2026-04-05","classic":15668,"naver":970964,"toss":653012,"direct_ypx":218669},{"date":"2026-04-12","classic":15487,"naver":974096,"toss":653455,"direct_ypx":220846},{"date":"2026-04-19","classic":15309,"naver":975609,"toss":653885,"direct_ypx":222073},{"date":"2026-04-26","classic":15155,"naver":982393,"toss":654175,"direct_ypx":216956},{"date":"2026-05-03","classic":14975,"naver":987700,"toss":654516,"direct_ypx":213161},{"date":"2026-05-10","classic":14795,"naver":988791,"toss":654892,"direct_ypx":213440},{"date":"2026-05-17","classic":14653,"naver":990011,"toss":655103,"direct_ypx":212563},{"date":"2026-05-24","classic":14514,"naver":990061,"toss":655268,"direct_ypx":209583},{"date":"2026-05-31","classic":14422,"naver":990286,"toss":655472,"direct_ypx":212470},{"date":"2026-06-07","classic":14162,"naver":990395,"toss":655570,"direct_ypx":214984},{"date":"2026-06-14","classic":14003,"naver":993261,"toss":655667,"direct_ypx":222066},{"date":"2026-06-21","classic":13850,"naver":996941,"toss":655833,"direct_ypx":225524},{"date":"2026-06-28","classic":13696,"naver":998161,"toss":655964,"direct_ypx":232215},{"date":"2026-07-05","classic":13498,"naver":999974,"toss":656099,"direct_ypx":237654},{"date":"2026-07-12","classic":13344,"naver":1001179,"toss":656201,"direct_ypx":238924},{"date":"2026-07-19","classic":13188,"naver":1001550,"toss":656287,"direct_ypx":240909},{"date":"2026-07-26","classic":13008,"naver":1001962,"toss":656355,"direct_ypx":247044},{"date":"2026-08-02","classic":12871,"naver":1001636,"toss":655961,"direct_ypx":269777},{"date":"2026-08-09","classic":12692,"naver":1003506,"toss":656165,"direct_ypx":273548},{"date":"2026-08-16","classic":12571,"naver":1003719,"toss":656346,"direct_ypx":273126},{"date":"2026-08-23","classic":12448,"naver":1004277,"toss":656492,"direct_ypx":275539},{"date":"2026-08-30","classic":12330,"naver":1004522,"toss":656629,"direct_ypx":280490}];

// 구독자 수 조회 SQL
const MEMBERSHIP_SQL = (afterDate) =>
  `SELECT week_last_date as date, SUM(yps_revise_subscriber_cnt) as classic, SUM(ypxn_revise_subscriber_cnt) as naver, SUM(ypxt_revise_subscriber_cnt) as toss, SUM(ypx_revise_subscriber_cnt) as direct_ypx FROM \`ygy-datawarehouse.report.yogiyo_weekly_region_subscription_ypx\` WHERE week_last_date > '${afterDate}' GROUP BY week_last_date ORDER BY week_last_date`;

// 주문수 / 평균 주문금액 조회 SQL
// DATE_ADD(...WEEK(MONDAY)..., INTERVAL 6 DAY) → 주의 마지막날(일요일)로 맞춤 (구독자 데이터와 날짜 정렬)
const ORDER_SQL = (afterDate) =>
  `SELECT DATE_ADD(DATE_TRUNC(order_date, WEEK(MONDAY)), INTERVAL 6 DAY) as date,
    SUM(CASE WHEN subscriber_product_cd = 'yogipassxn' THEN \`ORDER\`.success_order_cnt ELSE 0 END) as ord_naver,
    SUM(CASE WHEN subscriber_product_cd = 'yogipassxt' THEN \`ORDER\`.success_order_cnt ELSE 0 END) as ord_toss,
    SUM(CASE WHEN subscriber_product_cd = 'yogipassx'  THEN \`ORDER\`.success_order_cnt ELSE 0 END) as ord_direct,
    SUM(CASE WHEN subscriber_product_cd = 'yogipass'   THEN \`ORDER\`.success_order_cnt ELSE 0 END) as ord_classic,
    SAFE_DIVIDE(SUM(CASE WHEN subscriber_product_cd = 'yogipassxn' THEN gmv_amt ELSE 0 END), NULLIF(SUM(CASE WHEN subscriber_product_cd = 'yogipassxn' THEN \`ORDER\`.success_order_cnt ELSE 0 END),0)) as aov_naver,
    SAFE_DIVIDE(SUM(CASE WHEN subscriber_product_cd = 'yogipassxt' THEN gmv_amt ELSE 0 END), NULLIF(SUM(CASE WHEN subscriber_product_cd = 'yogipassxt' THEN \`ORDER\`.success_order_cnt ELSE 0 END),0)) as aov_toss,
    SAFE_DIVIDE(SUM(CASE WHEN subscriber_product_cd = 'yogipassx'  THEN gmv_amt ELSE 0 END), NULLIF(SUM(CASE WHEN subscriber_product_cd = 'yogipassx'  THEN \`ORDER\`.success_order_cnt ELSE 0 END),0)) as aov_direct,
    SAFE_DIVIDE(SUM(CASE WHEN subscriber_product_cd = 'yogipass'   THEN gmv_amt ELSE 0 END), NULLIF(SUM(CASE WHEN subscriber_product_cd = 'yogipass'   THEN \`ORDER\`.success_order_cnt ELSE 0 END),0)) as aov_classic,
    SUM(CASE WHEN subscriber_product_cd = '*NULL*' THEN \`ORDER\`.success_order_cnt ELSE 0 END) as ord_nonmem,
    SAFE_DIVIDE(SUM(CASE WHEN subscriber_product_cd = '*NULL*' THEN gmv_amt ELSE 0 END), NULLIF(SUM(CASE WHEN subscriber_product_cd = '*NULL*' THEN \`ORDER\`.success_order_cnt ELSE 0 END),0)) as aov_nonmem
  FROM \`ygy-datawarehouse.mart.fact_daily_order_customer\`
  WHERE order_date > '${afterDate}' AND order_date < CURRENT_DATE()
    AND subscriber_product_cd IN ('yogipassxn','yogipassxt','yogipassx','yogipass','*NULL*')
  GROUP BY 1 ORDER BY 1`;

function loadCache(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function saveCache(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function mergeData(a, b) {
  const map = {};
  [...a, ...b].forEach(r => { map[r.date] = { ...map[r.date], ...r }; });
  return Object.values(map).sort((x, y) => x.date.localeCompare(y.date));
}
function toMan(n) { return +(n / 10000).toFixed(1); }

// 기간 필터
const RANGES = [
  { id: "1w", label: "1주" },
  { id: "1m", label: "1달" },
  { id: "6m", label: "6개월" },
  { id: "1y", label: "1년" },
];
function filterByRange(data, range) {
  if (!data.length) return data;
  // 기준: 데이터셋의 마지막 날짜 (= 불러올 수 있는 가장 최근 날)
  const ref = new Date(data[data.length - 1].date);
  const cut = new Date(ref);
  if (range === "1w") cut.setDate(cut.getDate() - 7);
  else if (range === "1m") cut.setMonth(cut.getMonth() - 1);
  else if (range === "6m") cut.setMonth(cut.getMonth() - 6);
  else cut.setFullYear(cut.getFullYear() - 1); // 1y
  const cutStr = cut.toISOString().slice(0, 10);
  return data.filter(r => r.date >= cutStr);
}
function xInterval(count) {
  if (count <= 8) return 0;
  if (count <= 20) return 1;
  if (count <= 40) return 3;
  return 7;
}
// Y축 domain: 최솟값~최댓값 + 5% 여백
function yDomain(data, seriesIds) {
  const vals = data.flatMap(r => seriesIds.map(id => r[id]).filter(v => v != null && isFinite(v)));
  if (!vals.length) return ["auto", "auto"];
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn) * 0.08 || mx * 0.05;
  return [mn - pad, mx + pad];
}

// ─── 차트 선택 정의 (그룹 × 시리즈) ─────────────────────────────────────────
const CHART_GROUPS = [
  {
    id: "sub", label: "구독자 수", unit: "만명", ready: true,
    series: [
      { id: "sub_naver",   label: "네이버",  color: "#03C75A", getValue: r => toMan(r.naver) },
      { id: "sub_toss",    label: "토스",    color: "#0064FF", getValue: r => toMan(r.toss) },
      { id: "sub_direct",  label: "직접YPX", color: "#f07030", dash: "4 3", getValue: r => toMan(r.direct_ypx) },
      { id: "sub_classic", label: "클래식",  color: "#aaaaaa", dash: "2 4", getValue: r => toMan(r.classic) },
    ],
  },
  {
    id: "ord", label: "주문 수", unit: "만건", ready: true,
    series: [
      { id: "ord_naver",   label: "네이버",  color: "#03C75A", getValue: r => r.ord_naver != null ? toMan(r.ord_naver) : null },
      { id: "ord_toss",    label: "토스",    color: "#0064FF", getValue: r => r.ord_toss  != null ? toMan(r.ord_toss)  : null },
      { id: "ord_direct",  label: "직접YPX", color: "#f07030", dash: "4 3", getValue: r => r.ord_direct  != null ? toMan(r.ord_direct)  : null },
      { id: "ord_classic", label: "클래식",  color: "#aaaaaa", dash: "2 4", getValue: r => r.ord_classic != null ? toMan(r.ord_classic) : null },
      { id: "ord_nonmem",  label: "논멤버십", color: "#9b59b6", dash: "6 2", getValue: r => r.ord_nonmem != null ? toMan(r.ord_nonmem) : null },
    ],
  },
  {
    id: "aov", label: "평균 주문금액", unit: "원", ready: true,
    series: [
      { id: "aov_naver",   label: "네이버",  color: "#03C75A", getValue: r => r.aov_naver   != null ? Math.round(r.aov_naver)   : null },
      { id: "aov_toss",    label: "토스",    color: "#0064FF", getValue: r => r.aov_toss    != null ? Math.round(r.aov_toss)    : null },
      { id: "aov_direct",  label: "직접YPX", color: "#f07030", dash: "4 3", getValue: r => r.aov_direct  != null ? Math.round(r.aov_direct)  : null },
      { id: "aov_classic", label: "클래식",  color: "#aaaaaa", dash: "2 4", getValue: r => r.aov_classic != null ? Math.round(r.aov_classic) : null },
      { id: "aov_nonmem",  label: "논멤버십", color: "#9b59b6", dash: "6 2", getValue: r => r.aov_nonmem != null ? Math.round(r.aov_nonmem) : null },
    ],
  },
];

const ALL_SERIES = CHART_GROUPS.flatMap(g =>
  g.series.map(s => ({ ...s, groupId: g.id, groupLabel: g.label, unit: g.unit, ready: g.ready }))
);

// ─── 탭 ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "membership", label: "멤버십 현황", icon: "🪪" },
  { id: "orders",     label: "주문 현황",   icon: "🛒" },
  { id: "region",     label: "지역",        icon: "📍" },
  { id: "age",        label: "연령",        icon: "👥" },
];

// ─── 차트 선택 컨테이너 ───────────────────────────────────────────────────────
function ChartSelector({ checked, onToggle, orderLoaded }) {
  return (
    <div style={{ background: "white", borderRadius: 10, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: "0.06em", marginBottom: 10 }}>차트 선택</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CHART_GROUPS.map(group => {
          const needsOrder = group.id === "ord" || group.id === "aov";
          const disabled = needsOrder && !orderLoaded;
          return (
            <div key={group.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 80, fontSize: 11, fontWeight: 600, color: disabled ? "#ccc" : "#555", flexShrink: 0 }}>
                {group.label}
                {disabled && <span style={{ fontSize: 9, fontWeight: 400, color: "#ddd", marginLeft: 4 }}>로드 필요</span>}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {group.series.map(s => {
                  const on = checked.has(s.id) && !disabled;
                  return (
                    <button key={s.id} onClick={() => !disabled && onToggle(s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "4px 11px",
                        border: "1.5px solid " + (on ? s.color : "#e0e0e0"),
                        borderRadius: 20, background: on ? s.color + "18" : "#fafafa",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.35 : 1,
                        transition: "all 0.12s",
                      }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? s.color : "#ccc", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: on ? s.color : "#bbb", fontWeight: on ? 700 : 400 }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 차트 카드 ────────────────────────────────────────────────────────────────
function ChartCard({ title, data, activeSeries, yFormatter, tooltipFormatter, height = 280 }) {
  if (activeSeries.length === 0) return null;
  const domain = yDomain(data, activeSeries.map(s => s.id));
  const interval = xInterval(data.length);
  return (
    <div style={{ background: "white", borderRadius: 10, padding: "16px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 12 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={interval} />
          <YAxis tickFormatter={yFormatter} tick={{ fontSize: 9 }} width={52} domain={domain} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend wrapperStyle={{ fontSize: 10 }}
            formatter={id => { const s = ALL_SERIES.find(x => x.id === id); return (s?.groupLabel || "") + " · " + (s?.label || id); }} />
          {activeSeries.map(s => (
            <Line key={s.id} type="monotone" dataKey={s.id}
              stroke={s.color} strokeWidth={s.id.includes("classic") ? 1.5 : 2.5}
              strokeDasharray={s.dash} dot={false} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 멤버십 탭 ───────────────────────────────────────────────────────────────
function MembershipContent({ chartData, checked, refreshStatus, onRefresh }) {
  const [range, setRange] = useState("1y");

  const subData = chartData.filter(r => r.naver != null);
  const last = subData[subData.length - 1];
  const prev4 = subData[subData.length - 5];

  const activeSeries = ALL_SERIES.filter(s => checked.has(s.id) && s.ready);
  const subSeries = activeSeries.filter(s => s.groupId === "sub");
  const ordSeries = activeSeries.filter(s => s.groupId === "ord");
  const aovSeries = activeSeries.filter(s => s.groupId === "aov");

  // 기간 필터 적용
  const filteredData = filterByRange(chartData, range);
  const filteredSubData = filterByRange(subData, range);

  // 각 그룹별 chart data (null 값 그대로 전달 → connectNulls=false로 끊김 표시)
  const qtyData = filteredData.map(r => {
    const row = { date: r.date.slice(5) };
    activeSeries.forEach(s => { row[s.id] = s.getValue(r); });
    return row;
  });

  // 비중 차트 (sub 그룹만)
  const pctData = subSeries.length >= 2 ? filteredSubData.map(r => {
    const total = r.naver + r.toss + r.direct_ypx + r.classic;
    const row = { date: r.date.slice(5) };
    subSeries.forEach(s => {
      const raw = s.id === "sub_naver" ? r.naver : s.id === "sub_toss" ? r.toss : s.id === "sub_direct" ? r.direct_ypx : r.classic;
      row[s.id] = +(raw / total * 100).toFixed(1);
    });
    return row;
  }) : [];

  function delta(cur, prv) {
    if (!prv) return null;
    const d = cur - prv;
    return <span style={{ fontSize: 11, color: d >= 0 ? "#22aa55" : "#cc3333" }}>{d >= 0 ? "▲" : "▼"} {Math.abs(toMan(d))}만</span>;
  }

  const kpis = last ? [
    { label: "전체 구독", val: last.naver + last.toss + last.direct_ypx + last.classic, prev: prev4 ? prev4.naver + prev4.toss + prev4.direct_ypx + prev4.classic : null, color: "#1a2742" },
    { label: "네이버",   val: last.naver,      prev: prev4?.naver,      color: "#03C75A" },
    { label: "토스",     val: last.toss,       prev: prev4?.toss,       color: "#0064FF" },
    { label: "직접YPX",  val: last.direct_ypx, prev: prev4?.direct_ypx, color: "#f07030" },
    { label: "클래식",   val: last.classic,    prev: prev4?.classic,    color: "#aaaaaa" },
  ] : [];

  const btnLabel = { loading: "⏳...", error: "❌ 재시도" }[refreshStatus] ?? (refreshStatus.startsWith("+") ? "✅ " + refreshStatus : "🔄 새로고침");

  // 그룹별 title 생성 (단위 중복 제거)
  const subTitle = subSeries.length > 0 ? "구독자 수 추이 (만명)" : null;
  const ordTitle = ordSeries.length > 0 ? "주문 수 추이 (만건)" : null;
  const aovTitle = aovSeries.length > 0 ? "평균 주문금액 추이 (원)" : null;

  // 혼합 차트 (sub+ord 같이 체크됐을 때): 단위 다르면 별도 차트로
  const mixedGroups = [
    { series: subSeries, title: subTitle, yF: v => v + "만", tipF: (v, id) => { const s = ALL_SERIES.find(x => x.id === id); return [v + "만명", (s?.groupLabel || "") + " · " + (s?.label || "")]; } },
    { series: ordSeries, title: ordTitle, yF: v => v + "만", tipF: (v, id) => { const s = ALL_SERIES.find(x => x.id === id); return [v + "만건", (s?.groupLabel || "") + " · " + (s?.label || "")]; } },
    { series: aovSeries, title: aovTitle, yF: v => v.toLocaleString("ko-KR"), tipF: (v, id) => { const s = ALL_SERIES.find(x => x.id === id); return [v.toLocaleString("ko-KR") + "원", (s?.groupLabel || "") + " · " + (s?.label || "")]; } },
  ].filter(g => g.series.length > 0);

  return (
    <>
      {/* 기간 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {RANGES.map(r => {
          const on = range === r.id;
          return (
            <button key={r.id} onClick={() => setRange(r.id)}
              style={{ padding: "5px 13px", borderRadius: 20, border: "1.5px solid " + (on ? "#3a6fd8" : "#ddd"), background: on ? "#3a6fd8" : "white", color: on ? "white" : "#888", fontSize: 11, fontWeight: on ? 700 : 400, cursor: "pointer", transition: "all 0.12s" }}>
              {r.label}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#bbb", alignSelf: "center" }}>
          {filteredData.length}주 · {filteredData[0]?.date?.slice(2)} ~ {filteredData[filteredData.length - 1]?.date?.slice(2)}
        </span>
      </div>

      {/* KPI + 새로고침 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {kpis.map(k => (
          <div key={k.label} style={{ flex: "1 1 80px", background: "white", borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 10, color: "#999", marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{toMan(k.val)}만</div>
            <div style={{ marginTop: 2 }}>{delta(k.val, k.prev)} <span style={{ fontSize: 10, color: "#bbb" }}>4주전</span></div>
          </div>
        ))}
        <button onClick={onRefresh} disabled={refreshStatus === "loading"}
          style={{ alignSelf: "flex-end", marginLeft: "auto", padding: "8px 14px", background: "#3a6fd8", color: "white", border: "none", borderRadius: 8, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", opacity: refreshStatus === "loading" ? 0.7 : 1 }}>
          {btnLabel}
        </button>
      </div>

      {activeSeries.length === 0 ? (
        <div style={{ background: "white", borderRadius: 10, padding: "60px 0", textAlign: "center", color: "#ccc", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          위 차트 선택에서 항목을 체크하세요
        </div>
      ) : (
        <>
          {/* 그룹별 수량/금액 차트 */}
          {mixedGroups.map(g => (
            <ChartCard key={g.title} title={g.title} data={qtyData} activeSeries={g.series}
              yFormatter={g.yF} tooltipFormatter={g.tipF} />
          ))}

          {/* 비중 차트 — sub 계열이 2개 이상 선택됐을 때만 */}
          {subSeries.length >= 2 && (
            <ChartCard
              title="구독자 비중 추이 (%)"
              data={pctData} activeSeries={subSeries}
              yFormatter={v => v + "%"}
              tooltipFormatter={(v, id) => { const s = ALL_SERIES.find(x => x.id === id); return [v + "%", (s?.label || "") + " 비중"]; }}
              height={220}
            />
          )}
        </>
      )}

      {last && <div style={{ textAlign: "right", fontSize: 10, color: "#bbb", marginTop: 8 }}>
        구독자 기준: {last.date} · 캐시 {subData.length}주
      </div>}
    </>
  );
}

// ─── 준비 중 탭 ──────────────────────────────────────────────────────────────
const TAB_META = {
  orders: { icon: "🛒", title: "주문 현황", desc: "채널·구독유형·할인여부별 주문 수 및 adj.CM 추이" },
  region: { icon: "📍", title: "지역별 현황", desc: "시도별 구독자 수, YPX 침투율, 지역별 주문 증감" },
  age:    { icon: "👥", title: "연령별 현황", desc: "연령대별 구독 비중, 주문 빈도, 이탈 패턴" },
};
function ComingSoon({ tabId }) {
  const m = TAB_META[tabId];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 340, gap: 12 }}>
      <div style={{ fontSize: 36 }}>{m.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>{m.title}</div>
      <div style={{ fontSize: 12, color: "#aaa", maxWidth: 300, textAlign: "center" }}>{m.desc}</div>
      <div style={{ fontSize: 11, color: "#ccc", marginTop: 8 }}>알프레도에게 바로 물어보세요</div>
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
const DEFAULT_CHECKED = new Set(["sub_naver", "sub_toss", "sub_direct", "sub_classic"]);

export default function YPXDashboard({ onClose }) {
  const [activeTab, setActiveTab] = useState("membership");
  const [checked, setChecked] = useState(DEFAULT_CHECKED);
  const [subData, setSubData] = useState([]);   // 구독자 데이터
  const [ordData, setOrdData] = useState([]);   // 주문 데이터
  const [refreshStatus, setRefreshStatus] = useState("idle");
  const [orderLoaded, setOrderLoaded] = useState(false);

  // 구독자 + 주문 데이터 병합 (날짜 키 기준)
  const chartData = (() => {
    if (!ordData.length) return subData;
    return mergeData(subData, ordData);
  })();

  useEffect(() => {
    // 구독자 데이터
    const cachedSub = loadCache(CACHE_KEY);
    setSubData(cachedSub.length ? mergeData(INITIAL_DATA, cachedSub) : INITIAL_DATA);
    // 주문 데이터
    const cachedOrd = loadCache(ORDER_CACHE_KEY);
    if (cachedOrd.length) {
      setOrdData(cachedOrd);
      setOrderLoaded(true);
    }
  }, []);

  const toggleSeries = useCallback((id) => {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshStatus("loading");
    try {
      const cachedSub = loadCache(CACHE_KEY);
      const cachedOrd = loadCache(ORDER_CACHE_KEY);
      const subAfter = cachedSub.length ? cachedSub[cachedSub.length - 1].date : "2024-01-01";
      const ordAfter = cachedOrd.length ? cachedOrd[cachedOrd.length - 1].date : "2025-09-01";

      const [subResult, ordResult] = await Promise.all([
        queryBigQuery(MEMBERSHIP_SQL(subAfter)),
        queryBigQuery(ORDER_SQL(ordAfter)),
      ]);

      let subAdded = 0, ordAdded = 0;

      if (subResult.rows?.length > 0) {
        const fresh = subResult.rows.map(r => ({ date: r.date, classic: +r.classic, naver: +r.naver, toss: +r.toss, direct_ypx: +r.direct_ypx }));
        const merged = mergeData(cachedSub, fresh);
        saveCache(CACHE_KEY, merged);
        setSubData(mergeData(INITIAL_DATA, merged));
        subAdded = fresh.length;
      }

      if (ordResult.rows?.length > 0) {
        const fresh = ordResult.rows.map(r => ({
          date: r.date,
          ord_naver:   r.ord_naver   != null ? +r.ord_naver   : null,
          ord_toss:    r.ord_toss    != null ? +r.ord_toss    : null,
          ord_direct:  r.ord_direct  != null ? +r.ord_direct  : null,
          ord_classic: r.ord_classic != null ? +r.ord_classic : null,
          aov_naver:   r.aov_naver   != null ? +r.aov_naver   : null,
          aov_toss:    r.aov_toss    != null ? +r.aov_toss    : null,
          aov_direct:  r.aov_direct  != null ? +r.aov_direct  : null,
          aov_classic: r.aov_classic != null ? +r.aov_classic : null,
          ord_nonmem:  r.ord_nonmem  != null ? +r.ord_nonmem  : null,
          aov_nonmem:  r.aov_nonmem  != null ? +r.aov_nonmem  : null,
        }));
        const merged = mergeData(cachedOrd, fresh);
        saveCache(ORDER_CACHE_KEY, merged);
        setOrdData(merged);
        setOrderLoaded(true);
        ordAdded = fresh.length;
      }

      if (subAdded === 0 && ordAdded === 0) {
        setRefreshStatus("최신");
      } else {
        setRefreshStatus("+" + (subAdded + ordAdded) + "주");
      }
    } catch (e) {
      console.error(e);
      setRefreshStatus("error");
    }
    setTimeout(() => setRefreshStatus("idle"), 3000);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(900px, 96vw)", height: "100vh", background: "#f4f6fb", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>

        <div style={{ background: "#1a2742", color: "white", padding: "14px 20px", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📊 트렌드 확인</div>
            <div style={{ fontSize: 11, color: "#8ea8cc", marginTop: 2 }}>YPX 핵심 지표 — 주간</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", padding: "6px 10px", background: "transparent", color: "#8ea8cc", border: "1px solid #3a4a6a", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ background: "#111d33", display: "flex", flexShrink: 0 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ padding: "10px 18px", background: "none", border: "none", borderBottom: active ? "2px solid #5b9cf6" : "2px solid transparent", color: active ? "#fff" : "#6a84a8", fontSize: 12, fontWeight: active ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "color 0.15s" }}>
                <span>{tab.icon}</span> {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {activeTab === "membership" && (
            <>
              <ChartSelector checked={checked} onToggle={toggleSeries} orderLoaded={orderLoaded} />
              <MembershipContent chartData={chartData} checked={checked} refreshStatus={refreshStatus} onRefresh={refresh} />
            </>
          )}
          {activeTab !== "membership" && <ComingSoon tabId={activeTab} />}
        </div>
      </div>
    </div>
  );
}
