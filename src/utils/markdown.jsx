// extractChartSpec — parses ```chart ... ``` block from assistant message
export function extractChartSpec(content) {
  const match = content.match(/```chart\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

// openFullView — opens content in a new browser window with styled HTML
export function openFullView(content) {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>전체 보기 — 에이전트 어벤저스</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"/>
<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif}
  body{background:#f5f5f5;color:#333333;min-height:100vh;padding:40px 24px}
  .wrap{max-width:760px;margin:0 auto}
  .header{display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:1px solid #e5e5e5;margin-bottom:28px}
  .avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#111111,#c8c8e0);border:1px solid #cccccc;display:flex;align-items:center;justify-content:center;font-size:13px;color:#444444;flex-shrink:0}
  .title{font-size:13px;color:#888888;letter-spacing:.12em;font-weight:500}
  .copy-btn{margin-left:auto;padding:6px 14px;background:#f8f8f8;border:1px solid #cccccc;border-radius:20px;color:#888888;font-size:11px;cursor:pointer;transition:all .2s}
  .copy-btn:hover{border-color:#aaaaaa;color:#555555}
  h1{font-size:20px;font-weight:700;color:#111111;margin:20px 0 8px;padding-bottom:8px;border-bottom:1px solid #cccccc}
  h2{font-size:15px;font-weight:700;color:#222222;margin:16px 0 4px}
  h3{font-size:13.5px;font-weight:600;color:#444444;margin:12px 0 3px}
  p{color:#333333;line-height:1.8;margin:4px 0;font-size:14px}
  ul{padding-left:0;list-style:none;margin:4px 0}
  ul li{display:flex;gap:8px;color:#333333;line-height:1.7;font-size:14px;margin:2px 0}
  ul li::before{content:"•";color:#888888;flex-shrink:0}
  ol{padding-left:0;list-style:none;counter-reset:li;margin:4px 0}
  ol li{display:flex;gap:8px;color:#333333;line-height:1.7;font-size:14px;margin:2px 0;counter-increment:li}
  ol li::before{content:counter(li)".";color:#888888;flex-shrink:0;min-width:16px}
  hr{border:none;border-top:1px solid #cccccc;margin:14px 0}
  code{background:#e5e5e5;border:1px solid #cccccc;border-radius:4px;padding:1px 6px;font-size:12px;color:#336699;font-family:monospace}
  pre{background:#f8f8f8;border:1px solid #cccccc;border-radius:8px;padding:14px;overflow-x:auto;margin:10px 0}
  pre code{background:none;border:none;padding:0;font-size:12.5px;color:#336699;line-height:1.6}
  blockquote{border-left:3px solid #cccccc;padding-left:12px;color:#666666;font-style:italic;margin:6px 0}
  table{width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #cccccc;border-radius:8px;overflow:hidden}
  thead tr{background:#f0f0f0}
  th{padding:9px 14px;text-align:left;color:#666666;font-weight:600;border-bottom:1px solid #cccccc;font-size:12px;letter-spacing:.04em}
  td{padding:8px 14px;color:#333333;border-bottom:1px solid #e5e5e5;font-size:13.5px;line-height:1.5;vertical-align:top}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:nth-child(even){background:#f5f5f5}
  .callout{display:flex;gap:8px;padding:6px 12px;margin:4px 0;border-radius:6px;font-size:13px;line-height:1.6}
  .callout.ok{background:#edf7f0;border:1px solid #90c8a0}
  .callout.err{background:#fef2f2;border:1px solid #f0a0a0}
  .callout.warn{background:#fefde8;border:1px solid #d4b860}
  strong{font-weight:700;color:#111111}
  em{color:#555555;font-style:italic}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="avatar">A</div>
    <span class="title">에이전트 어벤저스 — 전체 보기</span>
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
    html+='<pre><code>'+(lang?'<span style="color:#888888;font-size:10px;display:block;margin-bottom:6px">'+lang+'</span>':'')+esc(code.join('\\n'))+'</code></pre>';continue;
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

export function FullViewButton({ content }) {
  const THRESHOLD = 800;
  if (!content || content.length < THRESHOLD) return null;
  return (
    <button
      onClick={() => openFullView(content)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        marginTop: "8px", padding: "5px 12px",
        background: "#f8f8f8", border: "1px solid #cccccc",
        borderRadius: "20px", color: "#888888",
        fontSize: "11px", cursor: "pointer",
        transition: "all 0.2s", letterSpacing: "0.04em",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#aaaaaa"; e.currentTarget.style.color = "#555555"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#cccccc"; e.currentTarget.style.color = "#888888"; }}
    >
      ↗ 새 창으로 전체 보기
    </button>
  );
}

export function MarkdownRenderer({ content }) {
  const lines = content.split("\n");
  const elements = [];
  let i = 0;

  const parseInline = (text) => {
    const parts = [];
    const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)|(__(.+?)__)/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[1]) parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#111111" }}>{m[2]}</strong>);
      else if (m[3]) parts.push(<code key={m.index} style={{ background: "#e5e5e5", border: "1px solid #cccccc", borderRadius: "4px", padding: "1px 6px", fontSize: "12px", color: "#336699", fontFamily: "monospace" }}>{m[4]}</code>);
      else if (m[5]) parts.push(<em key={m.index} style={{ color: "#555555", fontStyle: "italic" }}>{m[6]}</em>);
      else if (m[7]) parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#111111" }}>{m[8]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : text;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #cccccc", margin: "12px 0" }} />);
      i++; continue;
    }

    if (line.includes("|") && lines[i + 1]?.includes("|") && /^\s*\|[\s\-|:]+\|\s*$/.test(lines[i + 1])) {
      const headers = line.split("|").map(c => c.trim()).filter(Boolean);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").map(c => c.trim()).filter(Boolean));
        i++;
      }
      elements.push(
        <div key={`table-${i}`} style={{ overflowX: "auto", margin: "12px 0", borderRadius: "8px", border: "1px solid #cccccc" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                {headers.map((h, hi) => (
                  <th key={hi} style={{ padding: "8px 12px", textAlign: "left", color: "#666666", fontWeight: 600, borderBottom: "1px solid #cccccc", whiteSpace: "nowrap", fontSize: "11px", letterSpacing: "0.04em" }}>
                    {parseInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: "1px solid #e5e5e5", background: ri % 2 === 0 ? "transparent" : "#f5f5f5" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "7px 12px", color: "#333333", verticalAlign: "top", lineHeight: "1.5" }}>
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
        <div key={`code-${i}`} style={{ margin: "10px 0", borderRadius: "8px", overflow: "hidden", border: "1px solid #cccccc" }}>
          {lang && <div style={{ background: "#f8f8f8", padding: "4px 12px", fontSize: "10px", color: "#888888", fontFamily: "monospace", borderBottom: "1px solid #e5e5e5", letterSpacing: "0.1em" }}>{lang}</div>}
          <pre style={{ margin: 0, padding: "12px 14px", background: "#f8f8f8", overflowX: "auto", fontSize: "12px", lineHeight: "1.6", color: "#336699", fontFamily: "monospace" }}>
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      continue;
    }

    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h1) { elements.push(<div key={i} style={{ fontSize: "17px", fontWeight: 700, color: "#111111", margin: "18px 0 6px", paddingBottom: "6px", borderBottom: "1px solid #cccccc" }}>{parseInline(h1[1])}</div>); i++; continue; }
    if (h2) { elements.push(<div key={i} style={{ fontSize: "14px", fontWeight: 700, color: "#222222", margin: "14px 0 4px" }}>{parseInline(h2[1])}</div>); i++; continue; }
    if (h3) { elements.push(<div key={i} style={{ fontSize: "13px", fontWeight: 600, color: "#444444", margin: "10px 0 3px" }}>{parseInline(h3[1])}</div>); i++; continue; }

    const bullet = line.match(/^(\s*)([-*•])\s+(.+)/);
    if (bullet) {
      const indent = bullet[1].length;
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: `${indent * 8}px` }}>
          <span style={{ color: "#888888", marginTop: "2px", flexShrink: 0, fontSize: "12px" }}>•</span>
          <span style={{ color: "#333333", lineHeight: "1.6", fontSize: "13.5px" }}>{parseInline(bullet[3])}</span>
        </div>
      );
      i++; continue;
    }

    const numbered = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (numbered) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", margin: "2px 0", paddingLeft: `${numbered[1].length * 8}px` }}>
          <span style={{ color: "#888888", flexShrink: 0, minWidth: "16px", fontSize: "12px" }}>{numbered[2]}.</span>
          <span style={{ color: "#333333", lineHeight: "1.6", fontSize: "13.5px" }}>{parseInline(numbered[3])}</span>
        </div>
      );
      i++; continue;
    }

    const callout = line.match(/^(✅|❌|⚠️)\s+(.+)/);
    if (callout) {
      const icon = callout[1];
      const bg = icon === "✅" ? "#edf7f0" : icon === "❌" ? "#fef2f2" : "#fefde8";
      const border = icon === "✅" ? "#90c8a0" : icon === "❌" ? "#f0a0a0" : "#d4b860";
      elements.push(
        <div key={i} style={{ display: "flex", gap: "8px", padding: "5px 10px", margin: "3px 0", borderRadius: "6px", background: bg, border: `1px solid ${border}` }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span style={{ color: "#333333", fontSize: "13px", lineHeight: "1.6" }}>{parseInline(callout[2])}</span>
        </div>
      );
      i++; continue;
    }

    const bq = line.match(/^>\s+(.+)/);
    if (bq) {
      elements.push(
        <div key={i} style={{ borderLeft: "3px solid #cccccc", paddingLeft: "12px", margin: "6px 0", color: "#666666", fontSize: "13px", fontStyle: "italic" }}>
          {parseInline(bq[1])}
        </div>
      );
      i++; continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: "6px" }} />);
      i++; continue;
    }

    elements.push(
      <div key={i} style={{ color: "#333333", lineHeight: "1.75", fontSize: "13.5px", margin: "1px 0" }}>
        {parseInline(line)}
      </div>
    );
    i++;
  }

  return <div style={{ wordBreak: "break-word" }}>{elements}</div>;
}
