import { useState, useRef, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const AGENT_SYSTEM_PROMPT = `You are a Problem-to-Product Agent — a UX-first product designer and builder.

## Your Core Philosophy
You find the REAL problem, not symptoms. You design solutions that pass UX principles BEFORE business logic. You think from first principles like Elon Musk — erase assumptions, rebuild from fundamentals.

## Image & Document Analysis
When the user shares an image or PDF, immediately and thoroughly analyze it:
- What is shown? (UI, product, sketch, diagram, photo, screenshot, document, report, etc.)
- What problem or pain point is visible or implied?
- What UX issues do you observe (apply all filters below)?
- What opportunities for improvement exist?
For PDFs: extract key content, summarize structure, identify problem areas.
Then continue with your normal workflow based on what you found.

## Data Analysis Mode
When the user shares CSV, Excel, or tabular data, switch to Data Analysis mode:

1. **Auto-detect** column types (numeric, categorical, date, text)
2. **Summary stats**: count, mean, median, min, max, std for numeric columns; value counts for categorical
3. **Key insights**: top 3-5 findings stated in plain Korean, business-relevant
4. **Visualization recommendation**: suggest the best chart type and output the data in this exact JSON block so the UI can render it:

\`\`\`chart
{
  "type": "bar" | "line" | "pie" | "scatter",
  "title": "차트 제목",
  "xKey": "column_name",
  "yKey": "column_name",
  "data": [ { "key": value, ... }, ... ]
}
\`\`\`

5. **UX/Business connection**: link findings back to the problem-to-product workflow if relevant
6. If the data is too large, sample intelligently and note the sample size.
Respond in Korean.

## Mandatory UX Filters (MUST pass before any solution)

### Filter 1-A: Nielsen's 8 Heuristics (PRIMARY — check all 8)
1. Visibility of system status
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency
8. Aesthetic and minimalist design
9. Help users recognize, diagnose, recover from errors

### Filter 1-B: Extra UX Principles (REQUIRED)
- Image-led navigation
- Avoid harsh contrast repetition
- Seamless navigation

### Filter 2: Business Viability (SECONDARY — only after UX passes)
- Market/need, feasibility, value creation

## Your Workflow Stages

### STAGE 1: Problem Discovery (M1)
Run a structured 5-WHY interview. Ask focused questions one at a time.
After sufficient info, output a structured problem definition AND generate a 2-pager document.

### STAGE 2: UX Structuring (M2)
Generate HMW questions, JTBD statement, User journey map. Run ALL UX filters.

### STAGE 3: Solution Architecture (M3)
Generate exactly 3 solution options with UX scores, business scores, complexity, tech stack.

### STAGE 4: POC Build (M4)
4A: Flow + docs, 4B: Prototype, 4C: Working code

### STAGE 5: Validation (M5)
KPIs, test scenarios, next iteration

## 2-Pager Document Format
When generating a 2-pager, use this exact structure:

---
# 문제 정의서 (Problem Definition — 2 Pager)

## 1. 문제 배경
[context, why this matters]

## 2. 타겟 사용자
[who, persona, situation]

## 3. 핵심 페인포인트
[top 3 pain points with severity]

## 4. HMW (How Might We)
[3 reframed opportunity statements]

## 5. JTBD (Jobs To Be Done)
When [situation], I want to [motivation], so I can [outcome]

## 6. UX 필터 검토
[each of the 11 filters with ✅/❌ and notes]

## 7. 비즈니스 타당성
[market, feasibility, value — brief]

## 8. 다음 단계
[recommended action]
---

## 2-Pager Review Scoring
When reviewing a 2-pager document (either self-generated or user-uploaded), score each category:

### A. UX 필터 완성도 (40점)
- Filter 1-A 8개 항목 각 3점 = 24점
- Filter 1-B 3개 항목 각 4점 = 12점
- Extra coherence: 4점

### B. 문서 완성도 (30점)
- 문제 배경 명확성: 5점
- 타겟 사용자 구체성: 5점
- 페인포인트 근거: 5점
- HMW 질 (실행 가능한가): 5점
- JTBD 정확성: 5점
- 다음 단계 실행 가능성: 5점

### C. 비즈니스 타당성 (30점)
- 시장 존재 여부: 10점
- 실현 가능성: 10점
- 가치 창출 명확성: 10점

Total: 100점. Output as structured scorecard with specific improvement recommendations for each ❌ or partial score.

## Output Format Rules
- Always state which STAGE you are in
- UX filter checks: list each with ✅ or ❌
- Ask ONE question at a time
- Direct and concise — no filler
- Flag uncertainty explicitly

## Language
Respond in the same language the user writes in. If Korean, respond in Korean.`;

const REVIEW_PROMPT = `You are a rigorous document reviewer for problem definition documents (2-pagers).

Review the provided document against these three criteria and output a detailed scorecard:

### A. UX 필터 완성도 (40점)
Nielsen 8 heuristics coverage + Extra 3 principles:
1. Visibility of system status (3pt)
3. User control and freedom (3pt)
4. Consistency and standards (3pt)
5. Error prevention (3pt)
6. Recognition rather than recall (3pt)
7. Flexibility and efficiency (3pt)
8. Aesthetic and minimalist design (3pt)
9. Error recovery support (3pt)
Extra-1. Image-led navigation (4pt)
Extra-2. Avoid harsh contrast repetition (4pt)
Extra-3. Seamless navigation (4pt)
Coherence bonus (4pt)

### B. 문서 완성도 (30점)
- 문제 배경 명확성 (5pt)
- 타겟 사용자 구체성 (5pt)
- 페인포인트 근거 (5pt)
- HMW 실행 가능성 (5pt)
- JTBD 정확성 (5pt)
- 다음 단계 실행 가능성 (5pt)

### C. 비즈니스 타당성 (30점)
- 시장 존재 여부 (10pt)
- 실현 가능성 (10pt)
- 가치 창출 명확성 (10pt)

For each item: award points, mark ✅ (full) / ⚠️ (partial) / ❌ (missing), and give a specific 1-line recommendation.

End with:
- 총점: X/100
- 등급: S(90+) / A(80+) / B(70+) / C(60+) / D(below 60)
- 핵심 개선 사항 TOP 3 (most impactful fixes)
- 통과 여부: PASS (70+) / FAIL

Respond in Korean.`;

const COMPARE_PROMPT = `You are comparing two problem definition 2-pager documents.

Document A: [AI-Generated — auto-created by the agent]
Document B: [User-Uploaded — existing document]

Compare them across:
1. UX 필터 커버리지 — which covers UX principles more thoroughly?
2. 문서 완성도 — which is more complete and actionable?
3. 비즈니스 타당성 — which has stronger business grounding?
4. 종합 판단 — which should be used as the base, and what should be merged from each?

For each dimension: score both A and B (out of 10), explain the difference concisely.
End with a MERGED recommendation: "Document A의 [section]과 Document B의 [section]을 합치면 최적입니다."

Respond in Korean.`;

const STAGES = {
  IDLE: "idle",
  M1: "m1_discovery",
  M2: "m2_ux",
  M3: "m3_solution",
  M4: "m4_poc",
  M5: "m5_validation",
};

const STAGE_INFO = {
  idle: { label: "시작", color: "#8b8fa8", icon: "◎" },
  m1_discovery: { label: "M1 문제 발견", color: "#6c8ebf", icon: "🔍" },
  m2_ux: { label: "M2 UX 구조화", color: "#7b68b5", icon: "🧭" },
  m3_solution: { label: "M3 솔루션 설계", color: "#5a9e8f", icon: "⚙️" },
  m4_poc: { label: "M4 POC 빌드", color: "#c97b3a", icon: "🛠️" },
  m5_validation: { label: "M5 검증", color: "#7a9e5a", icon: "✅" },
};

function detectStage(content) {
  const lower = content.toLowerCase();
  if (lower.includes("stage 1") || lower.includes("m1") || lower.includes("문제 발견") || lower.includes("5why")) return STAGES.M1;
  if (lower.includes("stage 2") || lower.includes("m2") || lower.includes("hmw") || lower.includes("jtbd")) return STAGES.M2;
  if (lower.includes("stage 3") || lower.includes("m3") || lower.includes("솔루션")) return STAGES.M3;
  if (lower.includes("stage 4") || lower.includes("m4") || lower.includes("poc")) return STAGES.M4;
  if (lower.includes("stage 5") || lower.includes("m5") || lower.includes("kpi")) return STAGES.M5;
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function isPdf(file) {
  return file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
}

// ── Data Analysis Helpers ────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] || "").trim().replace(/^"|"$/g, "");
      obj[h] = v !== "" && !isNaN(v) ? Number(v) : v;
    });
    return obj;
  });
  return { headers, rows };
}

function computeStats(data) {
  if (!data) return null;
  const { headers, rows } = data;
  const stats = {};
  headers.forEach(h => {
    const vals = rows.map(r => r[h]).filter(v => v !== "" && v !== null && v !== undefined);
    const nums = vals.filter(v => typeof v === "number");
    if (nums.length > 0 && nums.length > vals.length * 0.5) {
      const sorted = [...nums].sort((a, b) => a - b);
      stats[h] = {
        type: "numeric", count: nums.length,
        mean: (nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2),
        min: sorted[0], max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
      };
    } else {
      const freq = {};
      vals.forEach(v => { freq[String(v)] = (freq[String(v)] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
      stats[h] = { type: "categorical", count: vals.length, top };
    }
  });
  return stats;
}

const CHART_COLORS = ["#6c8ebf", "#7b68b5", "#5a9e8f", "#c97b3a", "#9e5a9e", "#5a7a9e", "#bf6c6c", "#6cbfb5"];

function ChartRenderer({ spec }) {
  if (!spec || !spec.data?.length) return null;
  const { type, title, xKey, yKey, data } = spec;
  const axisStyle = { fill: "#6060a0", fontSize: 11 };
  const tooltipStyle = { background: "#0e0e22", border: "1px solid #2a2a4a", borderRadius: "8px", fontSize: "12px", color: "#d0d0f0" };
  const commonProps = { data, margin: { top: 8, right: 16, left: 0, bottom: 36 } };
  return (
    <div style={{ margin: "12px 0", padding: "14px 16px", background: "#0a0a1e", border: "1px solid #1e1e3a", borderRadius: "10px", width: "100%" }}>
      {title && <div style={{ fontSize: "12px", fontWeight: 600, color: "#9090c0", marginBottom: "12px", letterSpacing: "0.04em" }}>{title}</div>}
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
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
            <XAxis dataKey={xKey} tick={axisStyle} />
            <YAxis dataKey={yKey} tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data} fill="#6c8ebf" />
          </ScatterChart>
        ) : type === "line" ? (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
            <XAxis dataKey={xKey} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={yKey} stroke="#6c8ebf" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a30" />
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

function DataSummaryCard({ stats }) {
  if (!stats) return null;
  return (
    <div style={{ margin: "10px 0", display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {Object.entries(stats).map(([col, s]) => (
        <div key={col} style={{ padding: "8px 12px", background: "#0e0e22", border: "1px solid #1e1e3a", borderRadius: "8px", minWidth: "130px", flex: "1 1 130px" }}>
          <div style={{ fontSize: "10px", color: "#5a5a8a", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</div>
          {s.type === "numeric" ? (
            <div style={{ fontSize: "11px", color: "#8080b0", lineHeight: "1.7" }}>
              <span style={{ color: "#a0c0f0", fontWeight: 600 }}>{s.mean}</span> 평균<br />
              <span style={{ color: "#6060a0" }}>{s.min} – {s.max}</span>
            </div>
          ) : (
            <div style={{ fontSize: "11px", color: "#8080b0", lineHeight: "1.7" }}>
              {s.top.slice(0, 3).map(([k, v]) => (
                <div key={k} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#a0a0d0" }}>{k}</span> <span style={{ color: "#5a5a8a" }}>({v})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Extracts ```chart ... ``` JSON block from assistant message and renders chart
function extractChartSpec(content) {
  const match = content.match(/```chart\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Full-view new window ─────────────────────────────────────────────────────
function openFullView(content) {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>전체 보기 — Alfred Agent</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"/>
<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif}
  body{background:#060612;color:#d8d8f0;min-height:100vh;padding:40px 24px}
  .wrap{max-width:760px;margin:0 auto}
  .header{display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid #1a1a30;margin-bottom:28px}
  .avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a1a3e,#0d0d2b);border:1px solid #3a3a6a;display:flex;align-items:center;justify-content:center;font-size:13px;color:#c0c0e0;flex-shrink:0}
  .title{font-size:13px;color:#6060a0;letter-spacing:.12em;font-weight:500}
  .copy-btn{margin-left:auto;padding:6px 14px;background:#0e0e22;border:1px solid #2a2a4a;border-radius:20px;color:#6060a0;font-size:11px;cursor:pointer;transition:all .2s}
  .copy-btn:hover{border-color:#4a4a8a;color:#a0a0d0}
  h1{font-size:20px;font-weight:700;color:#f0f0ff;margin:20px 0 8px;padding-bottom:8px;border-bottom:1px solid #2a2a4a}
  h2{font-size:15px;font-weight:700;color:#e0e0ff;margin:16px 0 4px}
  h3{font-size:13.5px;font-weight:600;color:#c8c8f0;margin:12px 0 3px}
  p{color:#d0d0f0;line-height:1.8;margin:4px 0;font-size:14px}
  ul{padding-left:0;list-style:none;margin:4px 0}
  ul li{display:flex;gap:8px;color:#d0d0f0;line-height:1.7;font-size:14px;margin:2px 0}
  ul li::before{content:"•";color:#5a5a9a;flex-shrink:0}
  ol{padding-left:0;list-style:none;counter-reset:li;margin:4px 0}
  ol li{display:flex;gap:8px;color:#d0d0f0;line-height:1.7;font-size:14px;margin:2px 0;counter-increment:li}
  ol li::before{content:counter(li)".";color:#5a5a9a;flex-shrink:0;min-width:16px}
  hr{border:none;border-top:1px solid #2a2a4a;margin:14px 0}
  code{background:#1e1e3a;border:1px solid #3a3a5a;border-radius:4px;padding:1px 6px;font-size:12px;color:#a0c0f0;font-family:monospace}
  pre{background:#0a0a1e;border:1px solid #2a2a4a;border-radius:8px;padding:14px;overflow-x:auto;margin:10px 0}
  pre code{background:none;border:none;padding:0;font-size:12.5px;color:#b0c8f0;line-height:1.6}
  blockquote{border-left:3px solid #3a3a6a;padding-left:12px;color:#9090c0;font-style:italic;margin:6px 0}
  table{width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #2a2a4a;border-radius:8px;overflow:hidden}
  thead tr{background:#14142e}
  th{padding:9px 14px;text-align:left;color:#9090c0;font-weight:600;border-bottom:1px solid #2a2a4a;font-size:12px;letter-spacing:.04em}
  td{padding:8px 14px;color:#d0d0f0;border-bottom:1px solid #1a1a30;font-size:13.5px;line-height:1.5;vertical-align:top}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:nth-child(even){background:#0c0c1e}
  .callout{display:flex;gap:8px;padding:6px 12px;margin:4px 0;border-radius:6px;font-size:13px;line-height:1.6}
  .callout.ok{background:#0e1e14;border:1px solid #1e4a2a}
  .callout.err{background:#1e0e0e;border:1px solid #4a1e1e}
  .callout.warn{background:#1e180a;border:1px solid #4a3a1a}
  strong{font-weight:700;color:#f0f0ff}
  em{color:#c0c0f0;font-style:italic}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="avatar">A</div>
    <span class="title">PROBLEM-TO-PRODUCT AGENT — 전체 보기</span>
    <button class="copy-btn" onclick="navigator.clipboard.writeText(document.querySelector('.content').innerText).then(()=>{this.textContent='복사됨 ✓';setTimeout(()=>{this.textContent='전체 복사'},1500)})">전체 복사</button>
  </div>
  <div class="content" id="content"></div>
</div>
<script>
const raw = ${JSON.stringify(content)};
const lines = raw.split('\\n');
let html = '';
let i = 0;
while(i < lines.length){
  const line = lines[i];
  if(/^---+$/.test(line.trim())){html+='<hr/>';i++;continue;}
  if(line.includes('|') && lines[i+1]?.includes('|') && /^\\s*\\|[\\s\\-|:]+\\|\\s*$/.test(lines[i+1])){
    const headers=line.split('|').map(c=>c.trim()).filter(Boolean);
    i+=2;
    let rows=[];
    while(i<lines.length&&lines[i].includes('|')){rows.push(lines[i].split('|').map(c=>c.trim()).filter(Boolean));i++;}
    html+='<table><thead><tr>'+headers.map(h=>'<th>'+inl(h)+'</th>').join('')+'</tr></thead><tbody>';
    rows.forEach(r=>{html+='<tr>'+r.map(c=>'<td>'+inl(c)+'</td>').join('')+'</tr>';});
    html+='</tbody></table>';continue;
  }
  if(line.startsWith('\`\`\`')){
    const lang=line.slice(3).trim();i++;
    let code=[];
    while(i<lines.length&&!lines[i].startsWith('\`\`\`')){code.push(lines[i]);i++;}i++;
    html+='<pre><code>'+(lang?'<span style="color:#5a5a8a;font-size:10px;display:block;margin-bottom:6px">'+lang+'</span>':'')+esc(code.join('\\n'))+'</code></pre>';continue;
  }
  const m1=line.match(/^#\\s+(.+)/),m2=line.match(/^##\\s+(.+)/),m3=line.match(/^###\\s+(.+)/);
  if(m1){html+='<h1>'+inl(m1[1])+'</h1>';i++;continue;}
  if(m2){html+='<h2>'+inl(m2[1])+'</h2>';i++;continue;}
  if(m3){html+='<h3>'+inl(m3[1])+'</h3>';i++;continue;}
  const bl=line.match(/^\\s*[-*•]\\s+(.+)/);
  if(bl){html+='<ul><li>'+inl(bl[1])+'</li></ul>';i++;continue;}
  const nl=line.match(/^\\s*\\d+\\.\\s+(.+)/);
  if(nl){html+='<ol><li>'+inl(nl[1])+'</li></ol>';i++;continue;}
  const cl=line.match(/^(✅|❌|⚠️)\\s+(.+)/);
  if(cl){const cls=cl[1]==='✅'?'ok':cl[1]==='❌'?'err':'warn';html+='<div class="callout '+cls+'"><span>'+cl[1]+'</span><span>'+inl(cl[2])+'</span></div>';i++;continue;}
  const bq=line.match(/^>\\s+(.+)/);
  if(bq){html+='<blockquote>'+inl(bq[1])+'</blockquote>';i++;continue;}
  if(line.trim()===''){html+='<div style="height:6px"></div>';i++;continue;}
  html+='<p>'+inl(line)+'</p>';i++;
}
function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function inl(t){
  return t
    .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\`(.+?)\`/g,'<code>$1</code>')
    .replace(/\\*(.+?)\\*/g,'<em>$1</em>');
}
document.getElementById('content').innerHTML=html;
</script>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

function FullViewButton({ content }) {
  const THRESHOLD = 800;
  if (!content || content.length < THRESHOLD) return null;
  return (
    <button
      onClick={() => openFullView(content)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        marginTop: "8px", padding: "5px 12px",
        background: "#0e0e22", border: "1px solid #2a2a4a",
        borderRadius: "20px", color: "#6060a0",
        fontSize: "11px", cursor: "pointer",
        transition: "all 0.2s", letterSpacing: "0.04em",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#4a4a8a"; e.currentTarget.style.color = "#a0a0d0"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a4a"; e.currentTarget.style.color = "#6060a0"; }}
    >
      ↗ 새 창으로 전체 보기
    </button>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function MarkdownRenderer({ content }) {
  const lines = content.split("\n");
  const elements = [];
  let i = 0;

  const parseInline = (text) => {
    const parts = [];
    const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)|(__(.+?)__)/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[1]) parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#f0f0ff" }}>{m[2]}</strong>);
      else if (m[3]) parts.push(<code key={m.index} style={{ background: "#1e1e3a", border: "1px solid #3a3a5a", borderRadius: "4px", padding: "1px 6px", fontSize: "12px", color: "#a0c0f0", fontFamily: "monospace" }}>{m[4]}</code>);
      else if (m[5]) parts.push(<em key={m.index} style={{ color: "#c0c0f0", fontStyle: "italic" }}>{m[6]}</em>);
      else if (m[7]) parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#f0f0ff" }}>{m[8]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #2a2a4a", margin: "12px 0" }} />);
      i++; continue;
    }

    // Table detection
    if (line.includes("|") && lines[i + 1]?.includes("|") && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
      const headers = line.split("|").map(c => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").map(c => c.trim()).filter(Boolean);
        rows.push(cells);
        i++;
      }
      elements.push(
        <div key={`table-${i}`} style={{ overflowX: "auto", margin: "12px 0", borderRadius: "8px", border: "1px solid #2a2a4a" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ background: "#14142e" }}>
                {headers.map((h, hi) => (
                  <th key={hi} style={{ padding: "8px 12px", textAlign: "left", color: "#9090c0", fontWeight: 600, borderBottom: "1px solid #2a2a4a", whiteSpace: "nowrap", fontSize: "11px", letterSpacing: "0.04em" }}>
                    {parseInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: "1px solid #1a1a30", background: ri % 2 === 0 ? "transparent" : "#0c0c1e" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "7px 12px", color: "#d0d0f0", verticalAlign: "top", lineHeight: "1.5" }}>
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <div key={`code-${i}`} style={{ margin: "10px 0", borderRadius: "8px", overflow: "hidden", border: "1px solid #2a2a4a" }}>
          {lang && <div style={{ background: "#0e0e20", padding: "4px 12px", fontSize: "10px", color: "#5a5a8a", fontFamily: "monospace", borderBottom: "1px solid #1a1a2a", letterSpacing: "0.1em" }}>{lang}</div>}
          <pre style={{ margin: 0, padding: "12px 14px", background: "#0a0a1e", overflowX: "auto", fontSize: "12px", lineHeight: "1.6", color: "#b0c8f0", fontFamily: "monospace" }}>
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      continue;
    }

    // Headings
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1) { elements.push(<div key={i} style={{ fontSize: "17px", fontWeight: 700, color: "#f0f0ff", margin: "18px 0 6px", paddingBottom: "6px", borderBottom: "1px solid #2a2a4a" }}>{parseInline(h1[1])}</div>); i++; continue; }
    if (h2) { elements.push(<div key={i} style={{ fontSize: "14px", fontWeight: 700, color: "#e0e0ff", margin: "14px 0 4px" }}>{parseInline(h2[1])}</div>); i++; continue; }
    if (h3) { elements.push(<div key={i} style={{ fontSize: "13px", fontWeight: 600, color: "#c8c8f0", margin: "10px 0 3px" }}>{parseInline(h3[1])}</div>); i++; continue; }

    // Bullet list
    const bullet = line.match(/^(\s*)([-*•])\s+(.+)/);
    if (bullet) {
      const indent = bullet[1].length;
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: `${indent * 8}px` }}>
          <span style={{ color: "#5a5a9a", marginTop: "2px", flexShrink: 0, fontSize: "12px" }}>•</span>
          <span style={{ color: "#d0d0f0", lineHeight: "1.6", fontSize: "13.5px" }}>{parseInline(bullet[3])}</span>
        </div>
      );
      i++; continue;
    }

    // Numbered list
    const numbered = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (numbered) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: `${numbered[1].length * 8}px` }}>
          <span style={{ color: "#5a5a9a", flexShrink: 0, minWidth: "16px", fontSize: "12px" }}>{numbered[2]}.</span>
          <span style={{ color: "#d0d0f0", lineHeight: "1.6", fontSize: "13.5px" }}>{parseInline(numbered[3])}</span>
        </div>
      );
      i++; continue;
    }

    // Checklist ✅ ❌ ⚠️ lines — callout style
    const callout = line.match(/^(✅|❌|⚠️)\s+(.+)/);
    if (callout) {
      const icon = callout[1];
      const bg = icon === "✅" ? "#0e1e14" : icon === "❌" ? "#1e0e0e" : "#1e180a";
      const border = icon === "✅" ? "#1e4a2a" : icon === "❌" ? "#4a1e1e" : "#4a3a1a";
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", padding: "5px 10px", margin: "3px 0", borderRadius: "6px", background: bg, border: `1px solid ${border}` }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span style={{ color: "#d0d0f0", fontSize: "13px", lineHeight: "1.6" }}>{parseInline(callout[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Blockquote
    const bq = line.match(/^>\s+(.+)/);
    if (bq) {
      elements.push(
        <div key={i} style={{ borderLeft: "3px solid #3a3a6a", paddingLeft: "12px", margin: "6px 0", color: "#9090c0", fontSize: "13px", fontStyle: "italic" }}>
          {parseInline(bq[1])}
        </div>
      );
      i++; continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: "6px" }} />);
      i++; continue;
    }

    // Normal paragraph
    elements.push(
      <div key={i} style={{ color: "#d8d8f0", lineHeight: "1.75", fontSize: "13.5px", margin: "1px 0" }}>
        {parseInline(line)}
      </div>
    );
    i++;
  }

  return <div style={{ wordBreak: "break-word" }}>{elements}</div>;
}
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBadge({ score, total = 100 }) {
  const pct = Math.round((score / total) * 100);
  const grade = pct >= 90 ? "S" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : "D";
  const color = pct >= 80 ? "#5a9e8f" : pct >= 70 ? "#c97b3a" : "#9e5a5a";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 10px", borderRadius: "12px", background: color + "22", border: `1px solid ${color}66`, fontSize: "11px", fontFamily: "'Pretendard', sans-serif", color }}>
      {grade} · {score}/{total}
    </span>
  );
}

// Review Panel
function ReviewPanel({ doc, title, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(null);

  useEffect(() => {
    runReview();
  }, []);

  const runReview = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          system: REVIEW_PROMPT,
          messages: [{ role: "user", content: `다음 문서를 검토해 주십시오:\n\n${doc}` }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      setResult(text);
      const match = text.match(/총점[:\s]+(\d+)/);
      if (match) setScore(parseInt(match[1]));
    } catch {
      setResult("검토 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,4,16,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "680px", maxHeight: "85vh", background: "#0c0c22", border: "1px solid #2a2a4a", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", color: "#c0c0e0", fontWeight: "600" }}>📋 {title}</span>
            {score !== null && <ScoreBadge score={score} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {result && <button onClick={() => openFullView(result)} style={{ padding: "4px 12px", background: "#0e0e22", border: "1px solid #2a2a4a", borderRadius: "20px", color: "#6060a0", fontSize: "11px", cursor: "pointer" }}>↗ 새 창</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6060a0", cursor: "pointer", fontSize: "18px" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", fontSize: "13px", lineHeight: "1.8", color: "#c0c0e0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 0" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4a4a8a", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
              <span style={{ color: "#4a4a7a", fontSize: "12px" }}>검토 중입니다...</span>
            </div>
          ) : <MarkdownRenderer content={result} />}
        </div>
      </div>
    </div>
  );
}

// Compare Panel
function ComparePanel({ docA, docB, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { runCompare(); }, []);

  const runCompare = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          system: COMPARE_PROMPT,
          messages: [{
            role: "user",
            content: `[Document A — AI 자동 생성본]\n${docA}\n\n[Document B — 업로드된 기존 문서]\n${docB}`,
          }],
        }),
      });
      const data = await response.json();
      setResult(data.content?.[0]?.text || "");
    } catch {
      setResult("비교 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,4,16,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "720px", maxHeight: "85vh", background: "#0c0c22", border: "1px solid #2a2a4a", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", color: "#c0c0e0", fontWeight: "600" }}>⚖️ 문서 비교 분석</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {result && <button onClick={() => openFullView(result)} style={{ padding: "4px 12px", background: "#0e0e22", border: "1px solid #2a2a4a", borderRadius: "20px", color: "#6060a0", fontSize: "11px", cursor: "pointer" }}>↗ 새 창</button>}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6060a0", cursor: "pointer", fontSize: "18px" }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0", padding: "10px 20px", borderBottom: "1px solid #1a1a30" }}>
          {[["A", "AI 자동 생성본", "#6c8ebf"], ["B", "업로드 문서", "#7b68b5"]].map(([tag, label, color]) => (
            <div key={tag} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: color + "15", border: `1px solid ${color}44`, borderRadius: "20px", marginRight: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color, fontFamily: "'Pretendard', sans-serif" }}>{tag}</span>
              <span style={{ fontSize: "11px", color: "#8080b0" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", fontSize: "13px", lineHeight: "1.8", color: "#c0c0e0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 0" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4a4a8a", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
              <span style={{ color: "#4a4a7a", fontSize: "12px" }}>두 문서를 비교하고 있습니다...</span>
            </div>
          ) : <MarkdownRenderer content={result} />}
        </div>
      </div>
    </div>
  );
}

// Document action bar shown when 2-pager is generated
function DocActionBar({ docContent, onUploadForCompare }) {
  const [showReview, setShowReview] = useState(false);
  const fileRef = useRef(null);

  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0 0 42px" }}>
        <button
          onClick={() => setShowReview(true)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#0e1a2e", border: "1px solid #2a4a6a", borderRadius: "20px", color: "#6090c0", fontSize: "11px", cursor: "pointer", fontFamily: "'Pretendard', sans-serif", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#4a8aaa"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#2a4a6a"}
        >
          📋 자동 검토
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#1a0e2e", border: "1px solid #4a2a6a", borderRadius: "20px", color: "#9060c0", fontSize: "11px", cursor: "pointer", fontFamily: "'Pretendard', sans-serif", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#8a4aaa"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#4a2a6a"}
        >
          ⚖️ 기존 문서와 비교
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,.pdf,image/*" style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            let text = "";
            if (file.type.startsWith("image/")) {
              const b64 = await fileToBase64(file);
              onUploadForCompare({ type: "image", data: b64, mediaType: file.type, name: file.name });
            } else {
              text = await fileToText(file);
              onUploadForCompare({ type: "text", data: text, name: file.name });
            }
            e.target.value = "";
          }}
        />
      </div>
      {showReview && <ReviewPanel doc={docContent} title="2-Pager 자동 검토" onClose={() => setShowReview(false)} />}
    </>
  );
}

function FilePreview({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "10px 16px 0" }}>
      {files.map((f, i) => (
        <div key={i} style={{ position: "relative" }}>
          {f.type === "pdf" ? (
            <div style={{ width: "64px", height: "64px", borderRadius: "8px", border: "1px solid #5a3a6a", background: "#1a0e2a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
              <span style={{ fontSize: "20px" }}>📄</span>
              <span style={{ fontSize: "8px", color: "#9060c0", maxWidth: "56px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{f.name}</span>
            </div>
          ) : f.type === "data" ? (
            <div style={{ height: "64px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #3a6a3a", background: "#0e1e0e", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px", minWidth: "80px" }}>
              <span style={{ fontSize: "16px" }}>📊</span>
              <span style={{ fontSize: "8px", color: "#60a060", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              {f.parsed && <span style={{ fontSize: "8px", color: "#4a6a4a" }}>{f.parsed.rows.length}행 · {f.parsed.headers.length}열</span>}
            </div>
          ) : (
            <img src={f.preview} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #3a3a6a" }} />
          )}
          <button onClick={() => onRemove(i)} style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", background: "#1a1a3a", border: "1px solid #4a4a7a", color: "#a0a0c0", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg, onDocReady }) {
  const isUser = msg.role === "user";
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  const has2pager = !isUser && msg.content && (
    msg.content.includes("문제 정의서") || msg.content.includes("Problem Definition")
  );

  const handleUploadForCompare = async (uploaded) => {
    if (uploaded.type === "image") {
      // For image, run OCR-like extraction via Claude
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          system: "Extract all text content from this document image. Output only the text, preserving structure.",
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: uploaded.mediaType, data: uploaded.data } }, { type: "text", text: "이 문서의 모든 텍스트를 추출해 주십시오." }] }],
        }),
      });
      const data = await response.json();
      setUploadedDoc({ text: data.content?.[0]?.text || "", name: uploaded.name });
    } else {
      setUploadedDoc({ text: uploaded.data, name: uploaded.name });
    }
    setShowCompare(true);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: has2pager ? "4px" : "16px", gap: "10px", alignItems: "flex-start" }}>
        {!isUser && (
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", border: "1px solid #3a3a5c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>A</div>
        )}
        <div style={{ maxWidth: isUser ? "72%" : "calc(100% - 42px)", display: "flex", flexDirection: "column", gap: "6px", alignItems: isUser ? "flex-end" : "flex-start", width: isUser ? undefined : "100%" }}>
          {msg.files?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {msg.files.map((f, i) => f.type === "pdf" ? (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", background: "#1a0e2a", border: "1px solid #5a3a6a", borderRadius: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📄</span>
                  <span style={{ fontSize: "11px", color: "#9060c0" }}>{f.name}</span>
                </div>
              ) : f.type === "data" ? (
                <div key={i} style={{ padding: "6px 12px", background: "#0e1e0e", border: "1px solid #3a6a3a", borderRadius: "8px", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: f.stats ? "6px" : 0 }}>
                    <span style={{ fontSize: "14px" }}>📊</span>
                    <span style={{ fontSize: "11px", color: "#60a060" }}>{f.name}</span>
                    {f.parsed && <span style={{ fontSize: "10px", color: "#3a6a3a" }}>{f.parsed.rows.length}행 · {f.parsed.headers.length}열</span>}
                  </div>
                  {f.stats && <DataSummaryCard stats={f.stats} />}
                </div>
              ) : (
                <img key={i} src={f.preview} alt="" style={{ maxWidth: "200px", maxHeight: "200px", objectFit: "cover", borderRadius: "10px", border: "1px solid #3a3a6a" }} />
              ))}
            </div>
          )}
          {msg.content && (
            <div style={{
              background: isUser ? "linear-gradient(135deg, #2a2a4a 0%, #1e1e3a 100%)" : "linear-gradient(135deg, #12122a 0%, #0e0e20 100%)",
              border: isUser ? "1px solid #4a4a7a" : has2pager ? "1px solid #3a5a7a" : "1px solid #2a2a4a",
              borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              padding: "12px 16px", color: "#e0e0f0", fontSize: "13.5px",
              lineHeight: "1.7", wordBreak: "break-word",
              width: isUser ? undefined : "100%",
            }}>
              {msg.stageLabel && (
                <div style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: msg.stageColor || "#6c8ebf", marginBottom: "10px", textTransform: "uppercase" }}>
                  {msg.stageIcon} {msg.stageLabel}
                </div>
              )}
              {has2pager && (
                <div style={{ fontSize: "10px", color: "#4a8aaa", marginBottom: "10px", letterSpacing: "0.08em" }}>
                  📄 2-PAGER GENERATED
                </div>
              )}
              {isUser
                ? <div style={{ whiteSpace: "pre-wrap", color: "#d8d8f0", lineHeight: "1.75", fontSize: "13.5px" }}>{msg.content}</div>
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

      {/* Doc action bar below 2-pager message */}
      {has2pager && !isUser && (
        <div style={{ marginBottom: "16px" }}>
          <DocActionBar docContent={msg.content} onUploadForCompare={handleUploadForCompare} />
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

function StageProgress({ currentStage }) {
  const stages = ["m1_discovery", "m2_ux", "m3_solution", "m4_poc", "m5_validation"];
  return (
    <div style={{ display: "flex", gap: "4px", alignItems: "center", padding: "10px 16px", background: "#08081a", borderBottom: "1px solid #1a1a30", overflowX: "auto" }}>
      {stages.map((s, i) => {
        const info = STAGE_INFO[s];
        const isActive = currentStage === s;
        const isDone = stages.indexOf(currentStage) > i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px", borderRadius: "20px", background: isActive ? info.color + "22" : "transparent", border: isActive ? `1px solid ${info.color}66` : "1px solid transparent", transition: "all 0.3s" }}>
              <span style={{ fontSize: "11px" }}>{info.icon}</span>
              <span style={{ fontSize: "10px", fontWeight: isActive ? "700" : "400", color: isActive ? info.color : isDone ? "#4a4a6a" : "#3a3a5a", fontFamily: "'Pretendard', sans-serif" }}>{info.label}</span>
            </div>
            {i < stages.length - 1 && <div style={{ width: "12px", height: "1px", background: "#1a1a30", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Supabase Client ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://atwztuelyhwtohylbypv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d3p0dWVseWh3dG9oeWxieXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzY2MTMsImV4cCI6MjA4ODg1MjYxM30.xkq6_HIadBh57v6W_puBKf8iP7gGd-1ifYtSfxHc4eY";
const SCHEMA_VERSION = 2;

// Lazy-load Supabase SDK from CDN
let _supabase = null;
async function getSupabase() {
  if (_supabase) return _supabase;
  if (!window.__supabaseLoaded) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.__supabaseLoaded = true;
  }
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _supabase;
}

// ── Migration helper ─────────────────────────────────────────────────────────
function migrateMessages(msgs) {
  return (msgs || []).map(m => ({
    ...m,
    files: m.files || (m.images ? m.images.map(img => ({ type: "image", name: img.name || "image", mediaType: img.mediaType })) : []),
    images: undefined,
  }));
}

function serializeMessages(msgs) {
  return msgs.map(m => ({
    role: m.role,
    content: m.content || "",
    stageLabel: m.stageLabel,
    stageColor: m.stageColor,
    stageIcon: m.stageIcon,
    files: m.files?.map(f => ({ type: f.type, name: f.name, mediaType: f.mediaType })) || [],
  }));
}

function newSessionId() { return "s_" + Date.now(); }

// ── Supabase DB operations ───────────────────────────────────────────────────
async function dbLoadSessions(userId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("sessions")
    .select("id, title, stage, schema_version, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) { console.error("loadSessions:", error); return []; }
  return data || [];
}

async function dbLoadMessages(sessionId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("messages")
    .select("role, content, files_meta, stage_label, stage_color, stage_icon")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) { console.error("loadMessages:", error); return []; }
  return (data || []).map(m => ({
    role: m.role, content: m.content,
    files: migrateMessages([{ files: m.files_meta }])[0]?.files || [],
    stageLabel: m.stage_label, stageColor: m.stage_color, stageIcon: m.stage_icon,
  }));
}

async function dbUpsertSession(session, userId) {
  const sb = await getSupabase();
  await sb.from("sessions").upsert({
    id: session.id, user_id: userId,
    title: session.title, stage: session.stage,
    schema_version: SCHEMA_VERSION, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

async function dbSaveMessages(sessionId, msgs, userId) {
  const sb = await getSupabase();
  // Delete all existing messages for this session, then re-insert
  await sb.from("messages").delete().eq("session_id", sessionId);
  const rows = serializeMessages(msgs).map(m => ({
    session_id: sessionId, user_id: userId,
    role: m.role, content: m.content,
    files_meta: m.files || [],
    stage_label: m.stageLabel || null,
    stage_color: m.stageColor || null,
    stage_icon: m.stageIcon || null,
  }));
  if (rows.length) await sb.from("messages").insert(rows);
}

async function dbDeleteSession(sessionId) {
  const sb = await getSupabase();
  await sb.from("sessions").delete().eq("id", sessionId);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth helpers ─────────────────────────────────────────────────────────────
async function signInWithGitHub() {
  const sb = await getSupabase();
  await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.href } });
}
async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}
async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}
// ─────────────────────────────────────────────────────────────────────────────

function HistorySidebar({ sessions, activeId, onSelect, onNew, onDelete, open, onClose }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 299, background: "rgba(0,0,0,0.4)" }} />
      {/* Panel */}
      <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "260px", zIndex: 300, background: "#08081e", borderRight: "1px solid #1a1a30", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px", borderBottom: "1px solid #1a1a30", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#6060a0", letterSpacing: "0.12em", textTransform: "uppercase" }}>대화 히스토리</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a4a6a", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
        {/* New chat */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a1a30" }}>
          <button onClick={onNew} style={{ width: "100%", padding: "8px 12px", background: "linear-gradient(135deg, #1a1a3a 0%, #12122a 100%)", border: "1px solid #3a3a6a", borderRadius: "8px", color: "#a0a0d0", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#5a5aaa"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#3a3a6a"}>
            <span style={{ fontSize: "14px" }}>＋</span> 새 대화 시작
          </button>
        </div>
        {/* Sessions list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {sessions.length === 0 && (
            <div style={{ padding: "20px 12px", color: "#3a3a5a", fontSize: "12px", textAlign: "center" }}>저장된 대화가 없습니다</div>
          )}
          {[...sessions].reverse().map(s => (
            <div key={s.id} onClick={() => onSelect(s.id)}
              style={{ padding: "10px 12px", borderRadius: "8px", marginBottom: "4px", cursor: "pointer", background: s.id === activeId ? "#14142e" : "transparent", border: s.id === activeId ? "1px solid #2a2a4a" : "1px solid transparent", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", transition: "all 0.15s" }}
              onMouseEnter={e => { if (s.id !== activeId) e.currentTarget.style.background = "#0e0e22"; }}
              onMouseLeave={e => { if (s.id !== activeId) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: s.id === activeId ? "#c0c0e0" : "#8080a0", fontWeight: s.id === activeId ? "600" : "400", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.title || "새 대화"}
                </div>
                <div style={{ fontSize: "10px", color: "#3a3a5a", marginTop: "3px" }}>
                  {new Date(s.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div style={{ fontSize: "10px", color: "#4a4a6a", marginTop: "2px" }}>
                  {STAGE_INFO[s.stage]?.icon} {STAGE_INFO[s.stage]?.label}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                style={{ background: "none", border: "none", color: "#3a3a5a", cursor: "pointer", fontSize: "12px", flexShrink: 0, padding: "2px", borderRadius: "4px", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#9e5a5a"}
                onMouseLeave={e => e.currentTarget.style.color = "#3a3a5a"}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #1a1a30" }}>
          <span style={{ fontSize: "10px", color: "#2a2a4a" }}>Supabase 클라우드 저장 · 이미지/PDF 메타데이터만 보존</span>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState(STAGES.IDLE);
  const [started, setStarted] = useState(false);
  const [pendingImages, setPendingImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [user, setUser] = useState(null);         // Supabase user
  const [authLoading, setAuthLoading] = useState(true); // waiting for session check
  const [dbSaving, setDbSaving] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const saveTimerRef = useRef(null);

  // ── Bootstrap: load Supabase SDK + check auth session ─────────────────────
  useEffect(() => {
    let authListener = null;
    (async () => {
      try {
        const sb = await getSupabase();
        // Listen for auth changes (OAuth redirect callback lands here)
        const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
          const u = session?.user || null;
          setUser(u);
          setAuthLoading(false);
          if (u) {
            const s = await dbLoadSessions(u.id);
            setSessions(s);
          } else {
            setSessions([]);
          }
        });
        authListener = subscription;
        // Initial session check
        const sess = await getSession();
        const u = sess?.user || null;
        setUser(u);
        setAuthLoading(false);
        if (u) {
          const s = await dbLoadSessions(u.id);
          setSessions(s);
        }
      } catch (e) {
        console.error("Supabase init error:", e);
        setAuthLoading(false);
      }
    })();
    return () => { authListener?.unsubscribe?.(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Auto-save to Supabase (debounced 1.5s) ────────────────────────────────
  useEffect(() => {
    if (!started || !activeSessionId || messages.length === 0 || !user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setDbSaving(true);
      try {
        const title = messages.find(m => m.role === "user")?.content?.slice(0, 40) || "새 대화";
        await dbUpsertSession({ id: activeSessionId, title, stage: currentStage }, user.id);
        await dbSaveMessages(activeSessionId, messages, user.id);
        // Refresh sidebar list
        const s = await dbLoadSessions(user.id);
        setSessions(s);
      } catch (e) { console.error("save error:", e); }
      finally { setDbSaving(false); }
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [messages]);

  const handleFiles = useCallback(async (files) => {
    const supported = Array.from(files).filter(f =>
      f.type.startsWith("image/") || isPdf(f) ||
      f.name?.match(/\.(csv|xlsx|xls|tsv)$/i) ||
      f.type === "text/csv" || f.type.includes("spreadsheet")
    );
    if (!supported.length) return;
    const newFiles = await Promise.all(supported.map(async (file) => {
      if (isPdf(file)) {
        const base64 = await fileToBase64(file);
        return { type: "pdf", name: file.name, base64, mediaType: "application/pdf" };
      }
      if (file.name?.match(/\.(csv|tsv)$/i) || file.type === "text/csv") {
        const text = await fileToText(file);
        const parsed = parseCSV(text);
        const stats = computeStats(parsed);
        return { type: "data", name: file.name, text, parsed, stats };
      }
      if (file.name?.match(/\.(xlsx|xls)$/i)) {
        // Read as text fallback (basic) — xlsx binary needs SheetJS; use text summary
        return { type: "data", name: file.name, text: `[Excel 파일: ${file.name} — 내용 분석을 위해 CSV로 변환하거나 내용을 붙여넣기 해주십시오]`, parsed: null, stats: null };
      }
      const base64 = await fileToBase64(file);
      return { type: "image", name: file.name, base64, preview: URL.createObjectURL(file), mediaType: file.type };
    }));
    setPendingImages(prev => [...prev, ...newFiles]);
  }, []);

  const onDragEnter = useCallback((e) => { e.preventDefault(); dragCounter.current++; if (e.dataTransfer.types.includes("Files")) setIsDragging(true); }, []);
  const onDragOver = useCallback((e) => { e.preventDefault(); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
  const onDrop = useCallback((e) => { e.preventDefault(); dragCounter.current = 0; setIsDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const onPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) handleFiles(files);
  }, [handleFiles]);

  const callClaude = async (userText, files, history) => {
    const buildContent = (text, fls) => {
      if (!fls?.length) return text || "";
      const parts = [];
      fls.forEach(f => {
        if (f.type === "pdf" && f.base64) {
          parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
        } else if (f.type === "image" && f.base64) {
          parts.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.base64 } });
        } else if (f.type === "data" && f.text) {
          // Inject CSV data as text — truncate if huge
          const preview = f.text.length > 8000 ? f.text.slice(0, 8000) + "\n...(truncated)" : f.text;
          parts.push({ type: "text", text: `[데이터 파일: ${f.name}]\n${preview}` });
        }
      });
      if (text) parts.push({ type: "text", text });
      return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
    };
    const msgs = [
      ...history.map(m => ({ role: m.role, content: m.files?.length && m.files.some(f => f.base64 || f.text) ? buildContent(m.content, m.files) : (m.content || "") })),
      { role: "user", content: buildContent(userText, files) },
    ];
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 16000, system: AGENT_SYSTEM_PROMPT, messages: msgs }),
    });
    const data = await response.json();
    return data.content?.[0]?.text || "응답을 받지 못했습니다.";
  };

  const startAgent = (restoredMessages = null, restoredStage = null) => {
    const id = newSessionId();
    setActiveSessionId(id);
    setStarted(true);
    if (restoredMessages) {
      setMessages(restoredMessages);
      setCurrentStage(restoredStage || STAGES.M1);
    } else {
      setCurrentStage(STAGES.M1);
      setMessages([{
        role: "assistant",
        content: `안녕하십니까, 주인님.\n\n저는 Problem-to-Product Agent입니다.\n\n문제가 충분히 정의되면 2-pager 문서를 자동으로 생성하고,\n세 가지 기준으로 즉시 검토해드립니다.\n기존에 작성하신 문서가 있다면 비교 분석도 가능합니다.\n\n🔍 M1 → 진짜 문제 발견\n🧭 M2 → UX 구조화\n⚙️ M3 → 솔루션 설계\n🛠️ M4 → POC 빌드\n✅ M5 → 검증\n\n어떤 문제를 해결하고 싶으십니까?`,
        stageLabel: STAGE_INFO.m1_discovery.label,
        stageColor: STAGE_INFO.m1_discovery.color,
        stageIcon: STAGE_INFO.m1_discovery.icon,
      }]);
    }
  };

  const selectSession = async (id) => {
    const msgs = await dbLoadMessages(id);
    const s = sessions.find(x => x.id === id);
    setActiveSessionId(id);
    setMessages(msgs);
    setCurrentStage(s?.stage || STAGES.M1);
    setStarted(true);
    setSidebarOpen(false);
  };

  const deleteSession = async (id) => {
    await dbDeleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (id === activeSessionId) {
      setStarted(false);
      setMessages([]);
      setActiveSessionId(null);
      setCurrentStage(STAGES.IDLE);
    }
  };

  const newChat = () => {
    setSidebarOpen(false);
    setStarted(false);
    setMessages([]);
    setActiveSessionId(null);
    setCurrentStage(STAGES.IDLE);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pendingImages.length) || loading) return;
    const userText = input.trim();
    const files = [...pendingImages];
    setInput(""); setPendingImages([]);
    const newMessages = [...messages, { role: "user", content: userText, files }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await callClaude(userText, files, messages);
      const detectedStage = detectStage(reply);
      if (detectedStage) setCurrentStage(detectedStage);
      const stageInfo = detectedStage ? STAGE_INFO[detectedStage] : null;
      setMessages(prev => [...prev, { role: "assistant", content: reply, stageLabel: stageInfo?.label, stageColor: stageInfo?.color, stageIcon: stageInfo?.icon }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "오류가 발생했습니다. 다시 시도해 주십시오." }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const isComposingRef = useRef(false);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isComposingRef.current) return; // 한글 조합 중이면 전송 차단
      sendMessage();
    }
  };
  const canSend = !loading && (input.trim().length > 0 || pendingImages.length > 0);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#060612", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#4a4a7a" }}>
          <div style={{ fontSize: "28px", marginBottom: "16px" }}>A</div>
          <div style={{ fontSize: "12px" }}>연결 중...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 20% 50%, #0d0d2b 0%, #060612 60%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: "380px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 100%)", border: "1px solid #3a3a6a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 28px", boxShadow: "0 0 40px #3a3a6a44" }}>A</div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#e0e0f0", marginBottom: "8px", letterSpacing: "-0.02em" }}>Alfred Agent</div>
          <div style={{ fontSize: "13px", color: "#4a4a7a", marginBottom: "40px", lineHeight: "1.6" }}>Problem-to-Product · UX-first<br />대화 히스토리는 클라우드에 안전하게 저장됩니다</div>
          <button onClick={signInWithGitHub} style={{ width: "100%", padding: "14px 24px", background: "#1a1a3a", border: "1px solid #3a3a6a", borderRadius: "12px", color: "#e0e0f0", fontSize: "14px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", transition: "all 0.2s", marginBottom: "12px" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#252545"; e.currentTarget.style.borderColor = "#5a5a9a"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#1a1a3a"; e.currentTarget.style.borderColor = "#3a3a6a"; }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub로 로그인
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <>
        <HistorySidebar sessions={sessions} activeId={activeSessionId} onSelect={selectSession} onNew={() => { setSidebarOpen(false); startAgent(); }} onDelete={deleteSession} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 20% 50%, #0d0d2b 0%, #060612 60%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', sans-serif", padding: "20px", position: "relative" }}>
          {/* History button top-left */}
          <button onClick={() => setSidebarOpen(true)} style={{ position: "absolute", top: "16px", left: "16px", display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: "#0e0e22", border: "1px solid #2a2a4a", borderRadius: "8px", color: "#6060a0", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#4a4a8a"; e.currentTarget.style.color = "#a0a0d0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a4a"; e.currentTarget.style.color = "#6060a0"; }}>
            ☰ 히스토리 {sessions.length > 0 && <span style={{ background: "#2a2a4a", borderRadius: "10px", padding: "1px 6px", fontSize: "10px" }}>{sessions.length}</span>}
          </button>
          <div style={{ textAlign: "center", maxWidth: "540px" }}>
            <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 100%)", border: "1px solid #3a3a6a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 28px", boxShadow: "0 0 40px #3a3a6a44" }}>A</div>
            <h1 style={{ fontSize: "28px", fontWeight: "300", color: "#e0e0f0", letterSpacing: "0.06em", marginBottom: "12px" }}>Problem-to-Product</h1>
            <h2 style={{ fontSize: "13px", fontWeight: "400", color: "#6060a0", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "32px" }}>UX-First Agent by Alfred</h2>
            <p style={{ color: "#8080b0", fontSize: "14px", lineHeight: "1.8", marginBottom: "40px" }}>
              문제를 말씀해 주십시오.<br />
              2-pager 자동 생성 · 검토 · 기존 문서 비교까지 합니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "40px", textAlign: "left" }}>
              {["🔍 M1 — 진짜 문제 발견 + 2-pager 자동 생성", "📋 자동 검토 — UX 필터 + 문서 완성도 + 비즈니스 타당성", "⚖️ 기존 문서 비교 — 업로드 후 항목별 차이 분석", "🧭 M2 — UX 구조화 (HMW + JTBD + 여정맵)", "⚙️ M3 — 솔루션 3안 + PRD", "🛠️ M4 → ✅ M5 — POC 빌드 & 검증"].map(s => (
                <div key={s} style={{ padding: "9px 14px", background: "#0e0e22", border: "1px solid #1e1e3a", borderRadius: "8px", color: "#a0a0c0", fontSize: "12px" }}>{s}</div>
              ))}
            </div>
            <button onClick={() => startAgent()} style={{ padding: "14px 48px", background: "linear-gradient(135deg, #1e1e4a 0%, #14143a 100%)", border: "1px solid #4a4a8a", borderRadius: "30px", color: "#c0c0f0", fontSize: "14px", cursor: "pointer", letterSpacing: "0.1em", transition: "all 0.3s" }}
              onMouseEnter={e => e.target.style.borderColor = "#8080d0"} onMouseLeave={e => e.target.style.borderColor = "#4a4a8a"}>
              에이전트 시작
            </button>
          </div>
        </div>
        <style>{`@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');*{font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif!important}`}</style>
      </>
    );
  }

  return (
    <>
      <HistorySidebar sessions={sessions} activeId={activeSessionId} onSelect={selectSession} onNew={newChat} onDelete={deleteSession} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div
        onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#060612", fontFamily: "'Pretendard', sans-serif", color: "#e0e0f0", position: "relative" }}
      >
        {isDragging && (
          <div style={{ position: "absolute", inset: 0, zIndex: 100, background: "rgba(6,6,20,0.93)", border: "2px dashed #4a4a9a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "14px", pointerEvents: "none" }}>
            <div style={{ fontSize: "52px", filter: "drop-shadow(0 0 20px #6060c0)" }}>📎</div>
            <div style={{ fontSize: "18px", color: "#9090e0" }}>파일을 여기에 놓으십시오</div>
            <div style={{ fontSize: "11px", color: "#4a4a7a", letterSpacing: "0.12em" }}>PNG · JPG · WEBP · GIF · PDF</div>
          </div>
        )}

        {/* Header */}
        <div style={{ padding: "12px 20px", background: "#08081a", borderBottom: "1px solid #1a1a30", display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => setSidebarOpen(true)} style={{ width: "28px", height: "28px", borderRadius: "8px", background: "transparent", border: "1px solid #1a1a30", color: "#4a4a6a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a5a"; e.currentTarget.style.color = "#8080a0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a30"; e.currentTarget.style.color = "#4a4a6a"; }}>☰</button>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 100%)", border: "1px solid #3a3a6a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#c0c0e0", letterSpacing: "0.05em" }}>Problem-to-Product Agent</div>
            <div style={{ fontSize: "10px", color: "#4a4a7a", letterSpacing: "0.1em" }}>
              {dbSaving ? "☁ 저장 중..." : user?.email || user?.user_metadata?.user_name || ""}
            </div>
          </div>
          <button onClick={newChat} style={{ padding: "5px 10px", background: "transparent", border: "1px solid #1a1a30", borderRadius: "8px", color: "#4a4a6a", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a5a"; e.currentTarget.style.color = "#8080a0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a30"; e.currentTarget.style.color = "#4a4a6a"; }}>＋ 새 대화</button>
          <button onClick={signOut} style={{ padding: "5px 10px", background: "transparent", border: "1px solid #1a1a30", borderRadius: "8px", color: "#4a4a6a", fontSize: "10px", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a5a"; e.currentTarget.style.color = "#8080a0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a30"; e.currentTarget.style.color = "#4a4a6a"; }}>로그아웃</button>
        </div>

        <StageProgress currentStage={currentStage} />

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px", scrollbarWidth: "thin", scrollbarColor: "#1a1a30 transparent" }}>
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {loading && (
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "16px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", border: "1px solid #3a3a5c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>A</div>
              <div style={{ padding: "12px 16px", background: "linear-gradient(135deg, #12122a 0%, #0e0e20 100%)", border: "1px solid #2a2a4a", borderRadius: "4px 16px 16px 16px", display: "flex", gap: "6px", alignItems: "center" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4a4a8a", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i*0.2}s` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ background: "#08081a", borderTop: "1px solid #1a1a30" }}>
          <FilePreview files={pendingImages} onRemove={(i) => setPendingImages(prev => prev.filter((_, idx) => idx !== i))} />
          {!pendingImages.length && <div style={{ padding: "6px 18px 0" }}><span style={{ fontSize: "10px", color: "#252540" }}>🖼 이미지 · 📄 PDF · 📊 CSV/Excel — 드래그 · 붙여넣기 · 클릭 업로드</span></div>}
          <div style={{ padding: "10px 16px 14px", display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#0e0e22", border: "1px solid #2a2a4a", color: "#5a5a90", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0, transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#4a4a8a"; e.currentTarget.style.color = "#9090d0"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a4a"; e.currentTarget.style.color = "#5a5a90"; }}>📎</button>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.csv,.xlsx,.xls,.tsv,text/csv" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} onPaste={onPaste}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              placeholder="문제나 불편함을 말씀해 주십시오..."
              rows={1}
              style={{ flex: 1, background: "#0e0e22", border: "1px solid #2a2a4a", borderRadius: "12px", padding: "10px 14px", color: "#e0e0f0", fontSize: "13.5px", resize: "none", outline: "none", lineHeight: "1.6", maxHeight: "120px", overflowY: "auto", transition: "border-color 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#4a4a8a"} onBlur={e => e.target.style.borderColor = "#2a2a4a"} />
            <button onClick={sendMessage} disabled={!canSend}
              style={{ width: "40px", height: "40px", borderRadius: "50%", background: canSend ? "linear-gradient(135deg, #2a2a6a 0%, #1a1a4a 100%)" : "#1a1a30", border: "1px solid", borderColor: canSend ? "#5a5aaa" : "#2a2a40", color: canSend ? "#c0c0f0" : "#3a3a5a", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, transition: "all 0.2s" }}>↑</button>
          </div>
        </div>

        <style>{`
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          * { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif !important; }
          @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
          ::-webkit-scrollbar{width:4px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:#1a1a30;border-radius:2px}
        `}</style>
      </div>
    </>
  );
}



