import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { queryBigQuery } from "../api/proxy";

const CACHE_KEY = "ypx_dashboard_cache_v2";
const INITIAL_DATA = [{"date":"2025-09-07","classic":23634,"naver":712814,"toss":623287,"direct_ypx":218962},{"date":"2025-09-14","classic":23294,"naver":714251,"toss":624943,"direct_ypx":220248},{"date":"2025-09-21","classic":22959,"naver":715506,"toss":627020,"direct_ypx":220223},{"date":"2025-09-28","classic":22630,"naver":719956,"toss":632051,"direct_ypx":216266},{"date":"2025-10-05","classic":22284,"naver":724122,"toss":636506,"direct_ypx":212836},{"date":"2025-10-12","classic":21973,"naver":733048,"toss":640784,"direct_ypx":209223},{"date":"2025-10-19","classic":21660,"naver":735838,"toss":642952,"direct_ypx":204497},{"date":"2025-10-26","classic":21340,"naver":737238,"toss":643360,"direct_ypx":201110},{"date":"2025-11-02","classic":20985,"naver":747497,"toss":646358,"direct_ypx":201698},{"date":"2025-11-09","classic":20568,"naver":757558,"toss":646379,"direct_ypx":199659},{"date":"2025-11-16","classic":20229,"naver":770270,"toss":646475,"direct_ypx":198381},{"date":"2025-11-23","classic":19931,"naver":774719,"toss":647412,"direct_ypx":199911},{"date":"2025-11-30","classic":19680,"naver":776463,"toss":647784,"direct_ypx":201315},{"date":"2025-12-07","classic":19279,"naver":780039,"toss":648176,"direct_ypx":199175},{"date":"2025-12-14","classic":19007,"naver":791676,"toss":648492,"direct_ypx":203038},{"date":"2025-12-21","classic":18738,"naver":815202,"toss":647780,"direct_ypx":203460},{"date":"2025-12-28","classic":18486,"naver":836587,"toss":648151,"direct_ypx":203876},{"date":"2026-01-04","classic":18226,"naver":851352,"toss":648495,"direct_ypx":204590},{"date":"2026-01-11","classic":18006,"naver":866774,"toss":648939,"direct_ypx":205115},{"date":"2026-01-18","classic":17793,"naver":887554,"toss":649238,"direct_ypx":204200},{"date":"2026-01-25","classic":17612,"naver":902592,"toss":649559,"direct_ypx":206690},{"date":"2026-02-01","classic":17457,"naver":912592,"toss":650036,"direct_ypx":208602},{"date":"2026-02-08","classic":17235,"naver":919061,"toss":650287,"direct_ypx":208732},{"date":"2026-02-15","classic":17000,"naver":915042,"toss":650675,"direct_ypx":209871},{"date":"2026-02-22","classic":16847,"naver":915224,"toss":651058,"direct_ypx":210932},{"date":"2026-03-01","classic":16607,"naver":921116,"toss":651520,"direct_ypx":214398},{"date":"2026-03-08","classic":16413,"naver":928254,"toss":652019,"direct_ypx":220614},{"date":"2026-03-15","classic":16229,"naver":931924,"toss":652301,"direct_ypx":222761},{"date":"2026-03-22","classic":16055,"naver":936882,"toss":652582,"direct_ypx":223868},{"date":"2026-03-29","classic":15895,"naver":957460,"toss":652769,"direct_ypx":221503},{"date":"2026-04-05","classic":15668,"naver":970964,"toss":653012,"direct_ypx":218669},{"date":"2026-04-12","classic":15487,"naver":974096,"toss":653455,"direct_ypx":220846},{"date":"2026-04-19","classic":15309,"naver":975609,"toss":653885,"direct_ypx":222073},{"date":"2026-04-26","classic":15155,"naver":982393,"toss":654175,"direct_ypx":216956},{"date":"2026-05-03","classic":14975,"naver":987700,"toss":654516,"direct_ypx":213161},{"date":"2026-05-10","classic":14795,"naver":988791,"toss":654892,"direct_ypx":213440},{"date":"2026-05-17","classic":14653,"naver":990011,"toss":655103,"direct_ypx":212563},{"date":"2026-05-24","classic":14514,"naver":990061,"toss":655268,"direct_ypx":209583},{"date":"2026-05-31","classic":14422,"naver":990286,"toss":655472,"direct_ypx":212470},{"date":"2026-06-07","classic":14162,"naver":990395,"toss":655570,"direct_ypx":214984},{"date":"2026-06-14","classic":14003,"naver":993261,"toss":655667,"direct_ypx":222066},{"date":"2026-06-21","classic":13850,"naver":996941,"toss":655833,"direct_ypx":225524},{"date":"2026-06-28","classic":13696,"naver":998161,"toss":655964,"direct_ypx":232215},{"date":"2026-07-05","classic":13498,"naver":999974,"toss":656099,"direct_ypx":237654},{"date":"2026-07-12","classic":13344,"naver":1001179,"toss":656201,"direct_ypx":238924},{"date":"2026-07-19","classic":13188,"naver":1001550,"toss":656287,"direct_ypx":240909},{"date":"2026-07-26","classic":13008,"naver":1001962,"toss":656355,"direct_ypx":247044},{"date":"2026-08-02","classic":12871,"naver":1001636,"toss":655961,"direct_ypx":269777},{"date":"2026-08-09","classic":12692,"naver":1003506,"toss":656165,"direct_ypx":273548},{"date":"2026-08-16","classic":12571,"naver":1003719,"toss":656346,"direct_ypx":273126},{"date":"2026-08-23","classic":12448,"naver":1004277,"toss":656492,"direct_ypx":275539},{"date":"2026-08-30","classic":12330,"naver":1004522,"toss":656629,"direct_ypx":280490}];

const BQ_SQL = (afterDate) =>
  `SELECT week_last_date as date, SUM(yps_revise_subscriber_cnt) as classic, SUM(ypxn_revise_subscriber_cnt) as naver, SUM(ypxt_revise_subscriber_cnt) as toss, SUM(ypx_revise_subscriber_cnt) as direct_ypx FROM \`ygy-datawarehouse.report.yogiyo_weekly_region_subscription_ypx\` WHERE week_last_date > '${afterDate}' GROUP BY week_last_date ORDER BY week_last_date`;

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch { return []; }
}
function saveCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}
function mergeData(a, b) {
  const map = {};
  [...a, ...b].forEach(r => { map[r.date] = r; });
  return Object.values(map).sort((x, y) => x.date.localeCompare(y.date));
}
function toMan(n) { return +(n / 10000).toFixed(1); }

const SERIES = [
  { key: "네이버멤버십", field: "naver", color: "#03C75A" },
  { key: "토스멤버십",   field: "toss",  color: "#0064FF" },
  { key: "직접YPX",     field: "direct_ypx", color: "#f07030", dash: "4 3" },
  { key: "요기패스클래식", field: "classic", color: "#aaaaaa", dash: "2 4" },
];

export default function YPXDashboard({ onClose }) {
  const [data, setData] = useState([]);
  const [refreshStatus, setRefreshStatus] = useState("idle");

  useEffect(() => {
    const cached = loadCache();
    setData(cached.length ? mergeData(INITIAL_DATA, cached) : INITIAL_DATA);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshStatus("loading");
    const cached = loadCache();
    const lastDate = cached.length ? cached[cached.length - 1].date : "2024-01-01";
    try {
      const result = await queryBigQuery(BQ_SQL(lastDate));
      if (result.rows?.length > 0) {
        const fresh = result.rows.map(r => ({
          date: r.date, classic: +r.classic, naver: +r.naver, toss: +r.toss, direct_ypx: +r.direct_ypx,
        }));
        const merged = mergeData(cached, fresh);
        saveCache(merged);
        setData(mergeData(INITIAL_DATA, merged));
        setRefreshStatus(`+${fresh.length}주`);
      } else {
        setRefreshStatus("최신");
      }
    } catch {
      setRefreshStatus("error");
    }
    setTimeout(() => setRefreshStatus("idle"), 3000);
  }, []);

  const chartData = data.map(r => ({
    date: r.date.slice(5),
    네이버멤버십: toMan(r.naver),
    토스멤버십: toMan(r.toss),
    직접YPX: toMan(r.direct_ypx),
    요기패스클래식: toMan(r.classic),
  }));

  const pctData = data.map(r => {
    const total = r.naver + r.toss + r.direct_ypx + r.classic;
    return {
      date: r.date.slice(5),
      네이버멤버십: +(r.naver / total * 100).toFixed(1),
      토스멤버십: +(r.toss / total * 100).toFixed(1),
      직접YPX: +(r.direct_ypx / total * 100).toFixed(1),
      요기패스클래식: +(r.classic / total * 100).toFixed(1),
    };
  });

  const last = data[data.length - 1];
  const prev4 = data[data.length - 5];

  function kpiDelta(cur, prv) {
    if (!prv) return null;
    const d = cur - prv;
    return <span style={{ fontSize: 11, color: d >= 0 ? "#22aa55" : "#cc3333" }}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(toMan(d))}만
    </span>;
  }

  const btnLabel = { loading: "⏳ 조회 중...", error: "❌ 실패", idle: "🔄 새로고침" }[refreshStatus] ?? `✅ ${refreshStatus}`;

  const kpis = last ? [
    { label: "전체 구독", val: last.naver + last.toss + last.direct_ypx + last.classic, prev: prev4 ? prev4.naver + prev4.toss + prev4.direct_ypx + prev4.classic : null, color: "#1a2742" },
    { label: "네이버 멤버십", val: last.naver, prev: prev4?.naver, color: "#03C75A" },
    { label: "토스 멤버십", val: last.toss, prev: prev4?.toss, color: "#0064FF" },
    { label: "직접 YPX", val: last.direct_ypx, prev: prev4?.direct_ypx, color: "#f07030" },
    { label: "요기패스 클래식", val: last.classic, prev: prev4?.classic, color: "#aaaaaa" },
  ] : [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(860px, 96vw)", height: "100vh", background: "#f4f6fb", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>

        {/* 헤더 */}
        <div style={{ background: "#1a2742", color: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📊 YPX 구독 추이</div>
            <div style={{ fontSize: 11, color: "#8ea8cc", marginTop: 2 }}>네이버 · 토스 · 직접 YPX · 요기패스 클래식 — 주간</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={refresh} disabled={refreshStatus === "loading"}
              style={{ padding: "6px 12px", background: "#3a6fd8", color: "white", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", opacity: refreshStatus === "loading" ? 0.7 : 1 }}>
              {btnLabel}
            </button>
            <button onClick={onClose} style={{ padding: "6px 10px", background: "transparent", color: "#8ea8cc", border: "1px solid #3a4a6a", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

          {/* KPI */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {kpis.map(k => (
              <div key={k.label} style={{ flex: "1 1 120px", background: "white", borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: 10, color: "#999", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{toMan(k.val)}만</div>
                <div style={{ marginTop: 3 }}>{kpiDelta(k.val, k.prev)} <span style={{ fontSize: 10, color: "#bbb" }}>4주전</span></div>
              </div>
            ))}
          </div>

          {/* 구독자 수 차트 */}
          <div style={{ background: "white", borderRadius: 10, padding: "16px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 12 }}>구독자 수 추이 (단위: 만명)</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={7} />
                <YAxis tickFormatter={v => v + "만"} tick={{ fontSize: 9 }} width={42} />
                <Tooltip formatter={(v, name) => [`${v}만명`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SERIES.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.key === "요기패스클래식" ? 1.5 : 2.5} strokeDasharray={s.dash} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 비중 차트 */}
          <div style={{ background: "white", borderRadius: 10, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 12 }}>구성 비중 추이 (%)</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pctData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={7} />
                <YAxis tickFormatter={v => v + "%"} tick={{ fontSize: 9 }} width={36} domain={[0, 100]} />
                <Tooltip formatter={(v, name) => [`${v}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SERIES.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.key === "요기패스클래식" ? 1.5 : 2.5} strokeDasharray={s.dash} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {last && <div style={{ textAlign: "right", fontSize: 10, color: "#bbb", marginTop: 8 }}>
            데이터 기준: {last.date} · 캐시 {data.length}주 · 새로고침 시 마지막 날짜 이후만 조회
          </div>}
        </div>
      </div>
    </div>
  );
}
