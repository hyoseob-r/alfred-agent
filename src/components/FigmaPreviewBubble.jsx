import { useState, useEffect, useRef } from "react";
import { chatAPI, streamChatAPI } from "../api/proxy";

const FIGMA_TOKEN_KEY = "figma_pat";
const MAX_ITER = 2;

// ── 포맷 정의 ─────────────────────────────────────────────────────────────────
const FORMATS = [
  { id: "react-yds",  label: "React + YDS",  lang: "jsx" },
  { id: "swiftui",    label: "SwiftUI",       lang: "swift" },
  { id: "compose",    label: "Compose",       lang: "kotlin" },
];

const YDS_TOKENS = `
=== YDS 2.0 디자인 토큰 (반드시 반영) ===

[컬러]
primary=#fa0050 (요기요 레드/CTA), primary_i=#ff3072
secondary=#0c74e4 (파랑), secondary_i=#1f8bff
green=#05947f, yellow=#ffcb2e, white=#ffffff, black=#000000
primary_a_100=#feccdc, primary_b=#28343c, primary_b_100=#dee5ea
accent=#0c80e4, accent_100=#c5e2fb
ygy_green=#05947f, ygy_orange=#f04600
gray800=#333333(본문텍스트), gray600=#666666, gray400=#999999
gray250=#bfbfbf, gray100=#e5e5e5, gray50=#f2f2f2, gray25=#f6f6f6
bg_primary=#ffffff, bg_bottom=#f2f2f2
dim1=#000000e5, dim2=#00000099
variant_primary25=#fff5f8, variant_primary50=#ffe6ee, variant_primary800=#640020
variant_secondary25=#f0f7fa, variant_green25=#f0f7f6, variant_red25=#fef4f4

[타이포그래피] size/weight/lineHeight
10r: 10/400/14,  10b: 10/700/14
12r: 12/400/16,  12b: 12/700/16
13r: 13/400/18,  13b: 13/700/18
14r: 14/400/19 (기본),  14b: 14/700/19
16r: 16/400/22,  16b: 16/700/22
18b: 18/700/24,  20b: 20/700/27
24b: 24/700/32,  32b: 32/700/43
폰트: SD Neo Gothic, Pretendard, sans-serif

[스페이싱] (px)
s1:2, s2:4, s3:6, s4:8, s5:10, s6:12
s7:16, s8:20, s9:24, s10:28, s11:32, s12:36, s13:40

[라디우스] (px)
r0:0, r1:4, r2:8, r3:10, r4:12, r5:16, r6:20, rfull:360

[그림자]
level0: none
level1: 0 1px 8px rgba(25,48,64,0.10), 0 0 2px rgba(25,48,64,0.08)
level2: 0 2px 12px rgba(25,48,64,0.24), 0 0 4px rgba(25,48,64,0.12)
================================`;

const SCROLL_RULES_REACT = `- 스크롤 규칙 (반드시 적용):
  * scroll:overflow-x:scroll 또는 "가로 스크롤" → style={{ display:"flex", overflowX:"auto", WebkitOverflowScrolling:"touch" }}, 자식: style={{ flexShrink:0 }}
  * scroll:overflow-y:scroll 또는 "세로 스크롤" → style={{ overflowY:"auto", WebkitOverflowScrolling:"touch" }}
  * scroll:overflow:scroll 또는 "양방향 스크롤" → style={{ overflow:"auto" }}`;

const FORMAT_PROMPT = {
  "react-yds": `구현 규칙:
- React 함수형 컴포넌트 (export default function ComponentName)
- import { colors, metaTokens } from "./tokens"; 반드시 포함
- 모든 스타일은 style={{}} inline 객체. 색상·간격·라디우스·그림자는 반드시 아래 토큰 값으로 참조.
- 한국어 현실적 콘텐츠
- 이미지: https://picsum.photos/[w]/[h]?random=[n] 실제 URL 사용
${SCROLL_RULES_REACT}
${YDS_TOKENS}
[React 토큰 사용법]
색상: colors.foundation.primary.value 또는 "#fa0050" 하드코딩
타이포: fontSize:metaTokens.typography.meta_sf_14_r.size, fontWeight:metaTokens.typography.meta_sf_14_r.weight, lineHeight:metaTokens.typography.meta_sf_14_r.lineHeight+"px"
스페이싱: padding:metaTokens.spacing.meta_s4 (숫자, px 불필요)
라디우스: borderRadius:metaTokens.radius.meta_r4
그림자: boxShadow:metaTokens.elevation.meta_level_1.css
⚠️ 응답 형식: JSX 코드만 반환. 설명·요약·마크다운 코드블록 절대 금지. 첫 줄부터 바로 import로 시작.`,

  "swiftui": `구현 규칙:
- SwiftUI View struct
- 폰트: Font.custom("Pretendard", size:) 또는 .system(size:weight:)
- 스펙 수치를 최대한 정확하게 반영
- 한국어 현실적 콘텐츠
- 스크롤 규칙 (반드시 적용):
  * scroll:overflow-x:scroll 또는 "가로 스크롤" → ScrollView(.horizontal, showsIndicators: false) { HStack(spacing:) { ... }.padding() }
  * scroll:overflow-y:scroll 또는 "세로 스크롤" → ScrollView { VStack { ... } }
  * scroll:overflow:scroll 또는 "양방향 스크롤" → ScrollView([.horizontal, .vertical]) { ... }
${YDS_TOKENS}
[SwiftUI 토큰 사용법]
색상: Color(hex: "fa0050") — hex extension 직접 정의하거나 Color(red:green:blue:) 변환
타이포: .font(.system(size: 14, weight: .regular)) — 토큰 수치 직접 사용
스페이싱: padding(8), spacing: 16 — 토큰 수치 직접 사용
라디우스: .cornerRadius(12) — 토큰 수치 직접 사용
그림자: .shadow(color: Color.black.opacity(0.10), radius: 8, x: 0, y: 1)
⚠️ 응답 형식: Swift 코드만 반환. 설명·요약·마크다운 코드블록 절대 금지. 첫 줄부터 바로 import 또는 struct로 시작.`,

  "compose": `구현 규칙:
- Jetpack Compose @Composable 함수
- Material3 컴포넌트 우선 사용
- 한국어 현실적 콘텐츠
- 스크롤 규칙 (반드시 적용):
  * scroll:overflow-x:scroll 또는 "가로 스크롤" → LazyRow(horizontalArrangement = Arrangement.spacedBy(Xdp)) 또는 Row(modifier = Modifier.horizontalScroll(rememberScrollState()))
  * scroll:overflow-y:scroll 또는 "세로 스크롤" → LazyColumn 또는 Column(modifier = Modifier.verticalScroll(rememberScrollState()))
  * scroll:overflow:scroll 또는 "양방향 스크롤" → Box(modifier = Modifier.horizontalScroll(...).verticalScroll(...))
${YDS_TOKENS}
[Compose 토큰 사용법]
색상: Color(0xFFFA0050) — 토큰 hex 직접 사용
타이포: fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 19.sp
스페이싱: padding(8.dp), Arrangement.spacedBy(16.dp) — 토큰 수치 직접 사용
라디우스: RoundedCornerShape(12.dp) — 토큰 수치 직접 사용
그림자: elevation = 4.dp (Material elevation)
⚠️ 응답 형식: Kotlin 코드만 반환. 설명·요약·마크다운 코드블록 절대 금지. 첫 줄부터 바로 import 또는 @Composable로 시작.`,
};

const FORMAT_VALIDATE = {
  "html-css":       (s) => s.toLowerCase().includes("<!doctype") || s.toLowerCase().includes("<html"),
  "react-tailwind": (s) => s.includes("export") || s.includes("function") || s.includes("=>"),
  "react-inline":   (s) => s.includes("export") || s.includes("function") || s.includes("=>"),
  "react-yds":      (s) => s.includes("export") || s.includes("function") || s.includes("=>"),
  "swiftui":        (s) => s.includes("struct") || s.includes("View") || s.includes("body"),
  "compose":        (s) => s.includes("@Composable") || s.includes("fun "),
};

// ── URL 파싱 ──────────────────────────────────────────────────────────────────
function parseFigmaUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const idx = parts.findIndex(p => p === "design" || p === "file");
    if (idx < 0) return null;
    const fileKey = parts[idx + 1];
    const rawNode = u.searchParams.get("node-id");
    const nodeId = rawNode ? rawNode.replace(/-/g, ":") : null;
    return fileKey ? { fileKey, nodeId } : null;
  } catch { return null; }
}

// ── Figma 이미지 URL (표시용) ─────────────────────────────────────────────────
async function fetchFigmaImageUrl(fileKey, nodeId, token) {
  const resp = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!resp.ok) throw new Error(`Figma API ${resp.status} — 토큰을 확인해 주세요.`);
  const data = await resp.json();
  if (data.err) throw new Error(`Figma: ${data.err}`);
  const imgUrl = data.images?.[nodeId];
  if (!imgUrl) throw new Error("Figma 이미지 URL을 받지 못했습니다.");
  return imgUrl;
}

// ── Figma 노드 구조 ───────────────────────────────────────────────────────────
async function fetchFigmaNodeData(fileKey, nodeId, token) {
  const resp = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!resp.ok) throw new Error(`Figma 노드 API ${resp.status}`);
  const data = await resp.json();
  const nodes = data.nodes;
  if (!nodes) throw new Error("Figma 노드 데이터 없음");
  const nodeKey = Object.keys(nodes)[0];
  const doc = nodes[nodeKey]?.document;
  // 디버그: 스크롤 관련 필드 확인
  if (doc) {
    console.log("[Figma] overflowDirection:", doc.overflowDirection);
    console.log("[Figma] scrollOverflow:", doc.scrollOverflow);
    console.log("[Figma] clipsContent:", doc.clipsContent);
    console.log("[Figma] layoutMode:", doc.layoutMode);
    console.log("[Figma] primaryAxisSizingMode:", doc.primaryAxisSizingMode);
    console.log("[Figma] overflowDirection raw node:", JSON.stringify({
      overflowDirection: doc.overflowDirection,
      scrollOverflow: doc.scrollOverflow,
      clipsContent: doc.clipsContent,
      layoutMode: doc.layoutMode,
    }));
  }
  return doc;
}

// ── 색상 변환 ─────────────────────────────────────────────────────────────────
function colorStr(c) {
  if (!c) return "transparent";
  const r = Math.round((c.r || 0) * 255);
  const g = Math.round((c.g || 0) * 255);
  const b = Math.round((c.b || 0) * 255);
  const a = c.a !== undefined ? c.a : 1;
  if (a >= 0.99) return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

// ── Figma 노드 → 디자인 스펙 텍스트 ─────────────────────────────────────────
function nodeToSpec(node, depth = 0, parentBb = null, parentHasAutoLayout = false) {
  if (!node || depth > 5) return "";
  const indent = "  ".repeat(depth);
  const lines = [];
  const bb = node.absoluteBoundingBox;
  const size = bb ? ` (${Math.round(bb.width)}×${Math.round(bb.height)}px)` : "";
  lines.push(`${indent}[${node.type}] "${node.name}"${size}`);
  if (depth <= 3) console.log(`[Figma spec] depth=${depth} "${node.name}" layoutMode=${node.layoutMode} overflowDirection=${node.overflowDirection} children=${node.children?.length}`);

  const hasAutoLayout = !!(node.layoutMode && node.layoutMode !== "NONE");

  if (hasAutoLayout) {
    const dir = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    const pad = node.paddingTop !== undefined
      ? ` padding:${node.paddingTop}/${node.paddingRight}/${node.paddingBottom}/${node.paddingLeft}px` : "";
    const gap = node.itemSpacing ? ` gap:${Math.round(node.itemSpacing)}px` : "";
    const main = node.primaryAxisAlignItems ? ` mainAxis:${node.primaryAxisAlignItems}` : "";
    const cross = node.counterAxisAlignItems ? ` crossAxis:${node.counterAxisAlignItems}` : "";
    lines.push(`${indent}  flex:${dir}${pad}${gap}${main}${cross}`);
  }

  // 스크롤 방향 — overflowDirection 또는 interactions에서 추출
  const scrollMap = {
    "HORIZONTAL": "overflow-x:scroll (가로 스크롤)",
    "HORIZONTAL_SCROLLING": "overflow-x:scroll (가로 스크롤)",
    "VERTICAL": "overflow-y:scroll (세로 스크롤)",
    "VERTICAL_SCROLLING": "overflow-y:scroll (세로 스크롤)",
    "HORIZONTAL_AND_VERTICAL": "overflow:scroll (양방향 스크롤)",
    "HORIZONTAL_AND_VERTICAL_SCROLLING": "overflow:scroll (양방향 스크롤)",
  };
  if (node.overflowDirection && node.overflowDirection !== "NONE") {
    lines.push(`${indent}  scroll:${scrollMap[node.overflowDirection] || node.overflowDirection}`);
  } else if (node.clipsContent && hasAutoLayout && node.layoutMode === "HORIZONTAL" && bb) {
    // heuristic: HORIZONTAL + clipsContent + 자식 총너비 > 컨테이너 너비 → 실제 가로 스크롤
    const children = node.children || [];
    const spacing = node.itemSpacing || 0;
    const totalChildW = children.reduce((s, c) => s + (c.absoluteBoundingBox?.width || 0), 0)
                        + Math.max(0, children.length - 1) * spacing;
    if (totalChildW > bb.width * 1.1) {
      lines.push(`${indent}  scroll:overflow-x:scroll (가로 스크롤)`);
    }
  }
  // Figma interactions에서 scroll overflow 추출 (REST API v1 nodes 응답)
  if (node.interactions) {
    node.interactions.forEach(interaction => {
      if (interaction.trigger?.type === "ON_SCROLL" || interaction.actions?.some(a => a.type === "SCROLL_TO")) return;
      // scrollOverflow 속성 직접 체크
    });
  }
  // scrollOverflow 속성 (Figma API 일부 버전)
  if (node.scrollOverflow) {
    const overflowMap = {
      "HORIZONTAL_SCROLLING": "overflow-x:scroll (가로 스크롤)",
      "VERTICAL_SCROLLING": "overflow-y:scroll (세로 스크롤)",
      "HORIZONTAL_AND_VERTICAL_SCROLLING": "overflow:scroll (양방향 스크롤)",
    };
    if (overflowMap[node.scrollOverflow]) {
      lines.push(`${indent}  scroll:${overflowMap[node.scrollOverflow]}`);
    }
  }

  // 절대 위치 정보 — 부모 대비 오버레이 감지
  if (bb && parentBb) {
    const isAbsoluteChild = node.layoutPositioning === "ABSOLUTE" || !parentHasAutoLayout;
    if (isAbsoluteChild) {
      const top = Math.round(bb.y - parentBb.y);
      const left = Math.round(bb.x - parentBb.x);
      lines.push(`${indent}  position:absolute top:${top}px left:${left}px`);
    }
  }
  // 자식이 절대 위치를 가질 수 있는 컨테이너
  if (!hasAutoLayout && (node.children || []).length > 0) {
    lines.push(`${indent}  layout:absolute-container (use position:relative on this element)`);
  }

  const solidFills = (node.fills || []).filter(f => f.visible !== false && f.type === "SOLID");
  if (solidFills.length) lines.push(`${indent}  background:${solidFills.map(f => colorStr(f.color)).join(", ")}`);

  const solidStrokes = (node.strokes || []).filter(s => s.type === "SOLID");
  if (solidStrokes.length) lines.push(`${indent}  border:${solidStrokes.map(s => `${colorStr(s.color)} ${node.strokeWeight || 1}px`).join(", ")}`);

  if (node.cornerRadius) lines.push(`${indent}  borderRadius:${node.cornerRadius}px`);

  (node.effects || []).filter(e => e.visible !== false && e.type === "DROP_SHADOW").forEach(e => {
    lines.push(`${indent}  shadow:${e.offset?.x || 0}px ${e.offset?.y || 0}px ${e.radius || 0}px ${colorStr(e.color)}`);
  });

  if (node.type === "TEXT") {
    const s = node.style || {};
    lines.push(`${indent}  text:"${(node.characters || "").slice(0, 80)}"`);
    lines.push(`${indent}  font:${s.fontFamily || "unknown"} weight:${s.fontWeight || 400} size:${s.fontSize || 14}px`);
    if (s.lineHeightPx) lines.push(`${indent}  lineHeight:${Math.round(s.lineHeightPx)}px`);
    if (s.letterSpacing) lines.push(`${indent}  letterSpacing:${s.letterSpacing}px`);
    const tc = solidFills[0];
    if (tc) lines.push(`${indent}  color:${colorStr(tc.color)}`);
    if (s.textAlignHorizontal) lines.push(`${indent}  textAlign:${s.textAlignHorizontal}`);
  }

  (node.children || []).forEach(child => {
    const childSpec = nodeToSpec(child, depth + 1, bb, hasAutoLayout);
    if (childSpec) lines.push(childSpec);
  });

  return lines.join("\n");
}

// ── React 코드 → iframe HTML 변환 ────────────────────────────────────────────
const YDS_TOKENS_JSON = JSON.stringify({
  metaTokens: {
    typography: { meta_sf_10_r:{size:10,weight:400,lineHeight:14},meta_sf_10_b:{size:10,weight:700,lineHeight:14},meta_sf_12_r:{size:12,weight:400,lineHeight:16},meta_sf_12_b:{size:12,weight:700,lineHeight:16},meta_sf_13_r:{size:13,weight:400,lineHeight:18},meta_sf_13_b:{size:13,weight:700,lineHeight:18},meta_sf_14_r:{size:14,weight:400,lineHeight:19},meta_sf_14_b:{size:14,weight:700,lineHeight:19},meta_sf_16_r:{size:16,weight:400,lineHeight:22},meta_sf_16_b:{size:16,weight:700,lineHeight:22},meta_sf_18_r:{size:18,weight:400,lineHeight:24},meta_sf_18_b:{size:18,weight:700,lineHeight:24},meta_sf_20_r:{size:20,weight:400,lineHeight:27},meta_sf_20_b:{size:20,weight:700,lineHeight:27},meta_sf_24_r:{size:24,weight:400,lineHeight:32},meta_sf_24_b:{size:24,weight:700,lineHeight:32} },
    spacing: { meta_s1:2,meta_s2:4,meta_s3:6,meta_s4:8,meta_s5:10,meta_s6:12,meta_s7:16,meta_s8:20,meta_s9:24,meta_s10:28,meta_s11:32,meta_s12:36,meta_s13:40 },
    radius: { rfull:360,meta_r0:0,meta_r1:4,meta_r2:8,meta_r3:10,meta_r4:12,meta_r5:16,meta_r6:20 },
    elevation: { meta_level_0:{css:"none"},meta_level_1:{css:"0 1px 8px rgba(25,48,64,0.10), 0 0 2px rgba(25,48,64,0.08)"},meta_level_2:{css:"0 2px 12px rgba(25,48,64,0.24), 0 0 4px rgba(25,48,64,0.12)"} },
  },
  colors: {
    foundation: { primary:{value:"#fa0050"},primary_i:{value:"#ff3072"},secondary:{value:"#0c74e4"},secondary_i:{value:"#1f8bff"},green:{value:"#05947f"},yellow:{value:"#ffcb2e"},white:{value:"#ffffff"},black:{value:"#000000"} },
    light: { primary_a:{value:"#fa0050"},primary_a_100:{value:"#feccdc"},primary_b:{value:"#28343c"},primary_b_100:{value:"#dee5ea"},accent:{value:"#0c80e4"},accent_100:{value:"#c5e2fb"},ygy_green:{value:"#05947f"},ygy_orange:{value:"#f04600"} },
    gray: { gray800:{value:"#333333"},gray600:{value:"#666666"},gray400:{value:"#999999"},gray250:{value:"#bfbfbf"},gray100:{value:"#e5e5e5"},gray50:{value:"#f2f2f2"},gray25:{value:"#f6f6f6"} },
    background: { primary:{value:"#ffffff"},bottom:{value:"#f2f2f2"},dim1:{value:"#000000e5"},dim2:{value:"#00000099"} },
    variant: { primary25:{value:"#fff5f8"},primary50:{value:"#ffe6ee"},primary800:{value:"#640020"},secondary25:{value:"#f0f7fa"},green25:{value:"#f0f7f6"},red25:{value:"#fef4f4"},yellow25:{value:"#fff9f0"} },
  },
});

function buildReactPreviewHtml(code, formatId) {
  // 컴포넌트명 추출 (export default function Xxx 또는 마지막 function 선언)
  const nameMatch = code.match(/export\s+default\s+function\s+(\w+)/) || code.match(/function\s+(\w+)\s*\(/g);
  const compName = nameMatch ? (nameMatch[1] || nameMatch[0]?.match(/function\s+(\w+)/)?.[1]) : null;

  // export default 제거 (UMD 환경에서 에러 방지)
  const cleanCode = code
    .replace(/^import\s+.*?;?\s*$/gm, "")   // import 문 제거
    .replace(/export\s+default\s+/g, "")     // export default 제거
    .replace(/export\s+\{[^}]*\}/g, "");     // export { } 제거

  const tailwindScript = formatId === "react-tailwind"
    ? `<script src="https://cdn.tailwindcss.com"></script>` : "";

  const ydsSetup = formatId === "react-yds"
    ? `<script>const _t = ${YDS_TOKENS_JSON}; window.metaTokens = _t.metaTokens; window.colors = _t.colors;</script>` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
${tailwindScript}
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${ydsSetup}
<style>*{box-sizing:border-box;}body{margin:0;padding:16px;background:#f5f5f5;font-family:'Pretendard',sans-serif;}</style>
</head>
<body><div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef } = React;
${formatId === "react-yds" ? "const { metaTokens, colors } = window;" : ""}
${cleanCode}

const _comp = typeof ${compName} !== 'undefined' ? ${compName}
  : typeof Component !== 'undefined' ? Component
  : typeof App !== 'undefined' ? App
  : typeof Preview !== 'undefined' ? Preview
  : () => React.createElement('div', null, '컴포넌트를 찾을 수 없습니다.');

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_comp));
</script>
<script>
// 깨진 이미지 자동 복구
document.addEventListener('error', function(e) {
  if (e.target.tagName !== 'IMG') return;
  const w = Math.round(e.target.offsetWidth) || 80;
  const h = Math.round(e.target.offsetHeight) || 80;
  e.target.src = 'https://picsum.photos/' + w + '/' + h + '?random=' + Math.floor(Math.random() * 200);
  e.target.onerror = null;
}, true);
</script>
</body>
</html>`;
}

// ── HTML에 깨진 이미지 자동 복구 스크립트 inject ─────────────────────────────
const IMG_FALLBACK_SCRIPT = `<script>
document.addEventListener('error',function(e){
  if(e.target.tagName!=='IMG')return;
  const w=Math.round(e.target.offsetWidth)||80,h=Math.round(e.target.offsetHeight)||80;
  e.target.src='https://picsum.photos/'+w+'/'+h+'?random='+Math.floor(Math.random()*200);
  e.target.onerror=null;
},true);
<\/script>`;

function injectImgFallback(html) {
  if (!html) return html;
  if (html.includes('</body>')) return html.replace('</body>', IMG_FALLBACK_SCRIPT + '</body>');
  return html + IMG_FALLBACK_SCRIPT;
}

// ── 코드 생성 (스트리밍) ──────────────────────────────────────────────────────
async function generateCode(spec, formatId, onChunk) {
  const formatLabel = FORMATS.find(f => f.id === formatId)?.label || formatId;
  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `다음 Figma 디자인 스펙을 ${formatLabel} 코드로 구현해 주세요.

=== Figma 디자인 스펙 ===
${spec}
=========================

${FORMAT_PROMPT[formatId]}`,
    }],
  }, (delta) => {
    full += delta;
    onChunk(full);
  });

  const code = full.replace(/^```[\w]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const validate = FORMAT_VALIDATE[formatId];
  if (validate && !validate(code)) {
    throw new Error(`코드 생성 실패: ${code.slice(0, 200)}`);
  }
  return code;
}

// ── 검증/수정 (스트리밍) ──────────────────────────────────────────────────────
async function compareAndFix(spec, currentCode, formatId, iter, onChunk) {
  const formatLabel = FORMATS.find(f => f.id === formatId)?.label || formatId;
  let full = "";
  await streamChatAPI({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `[검증 ${iter}/${MAX_ITER}회차] Figma 스펙과 현재 ${formatLabel} 코드를 비교해 주세요.

=== Figma 원본 스펙 ===
${spec}
======================

=== 현재 코드 ===
${currentCode.slice(0, 8000)}
================

1단계: 스펙과의 차이(색상·폰트·크기·간격·정렬·보더·그림자)를 항목별로 간단히 설명 (예: "- 배경색: #fff → #f5f5f5 수정 필요")
2단계:
- 차이가 없거나 미미하면 마지막 줄에 DONE 만 작성
- 차이가 있으면 수정된 전체 코드만 반환 (마크다운 없음)`,
    }],
  }, (delta) => {
    full += delta;
    onChunk?.(delta, full);
  });

  const text = full.trim();
  // DONE이 포함되어 있으면 완료 (마지막 줄 또는 첫 줄)
  const lines = text.split("\n").map(l => l.trim());
  const hasDone = lines.some(l => l === "DONE" || l.startsWith("DONE"));

  if (hasDone) {
    // DONE 앞의 분석 텍스트 추출
    const doneIdx = lines.findIndex(l => l === "DONE" || l.startsWith("DONE"));
    const analysis = lines.slice(0, doneIdx).join("\n").trim();
    return { done: true, code: currentCode, analysis };
  }

  // 코드 블록 추출 (```로 감싸인 경우 처리)
  const codeBlockMatch = text.match(/```[\w]*\n?([\s\S]*?)\n?```/);
  const rawCode = codeBlockMatch ? codeBlockMatch[1] : text;

  // 분석 텍스트는 코드 이전 부분
  const analysis = codeBlockMatch
    ? text.slice(0, text.indexOf("```")).trim()
    : "";

  const code = rawCode.trim();
  const validate = FORMAT_VALIDATE[formatId];
  if (validate && !validate(code)) return { done: true, code: currentCode, analysis: text };
  return { done: false, code, analysis };
}

// ── 프리뷰 패널 (인라인 + 전체화면 공용) ─────────────────────────────────────
function PreviewPanels({ figmaImgUrl, currentCode, formatId, previewHtml, isHtml, isNative, fmt, expanded, onExpand, onCollapse }) {
  const previewContent = (fullscreen = false) => {
    const iframeStyle = fullscreen
      ? { width: "100%", height: "100%", border: "none", display: "block", overflow: "auto" }
      : { width: "100%", minHeight: "360px", border: "none", display: "block" };

    const getIframe = (srcDoc) => (
      <iframe
        srcDoc={srcDoc}
        style={iframeStyle}
        sandbox="allow-scripts"
        title="preview"
        scrolling="yes"
      />
    );

    const panelStyle = fullscreen
      ? { flex: 1, display: "flex", flexDirection: "column", overflow: "auto", minWidth: 0 }
      : { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 };

    return (
      <div style={{ display: "flex", flex: 1, overflow: fullscreen ? "auto" : undefined, borderBottom: fullscreen ? "none" : "1px solid #eeeeee", minHeight: 0 }}>
        {figmaImgUrl && (
          <div style={{ flex: 1, borderRight: "1px solid #eeeeee", display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto" }}>
            <div style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 700, color: "#9970d8", background: "#faf8ff", borderBottom: "1px solid #eeeeee", letterSpacing: "0.1em", flexShrink: 0 }}>FIGMA 원본</div>
            <div style={{ flex: 1, overflow: "auto" }}>
              <img src={figmaImgUrl} alt="Figma" style={{ maxWidth: "100%", display: "block" }} crossOrigin="anonymous" />
            </div>
          </div>
        )}
        <div style={panelStyle}>
          <div style={{ padding: "6px 12px", fontSize: "10px", fontWeight: 700, color: "#448844", background: "#f8fff8", borderBottom: "1px solid #eeeeee", letterSpacing: "0.1em", flexShrink: 0 }}>
            {fmt?.label?.toUpperCase()} 결과
          </div>
          {(isHtml || ["react-tailwind","react-inline","react-yds"].includes(formatId))
            ? getIframe(isHtml ? injectImgFallback(currentCode) : buildReactPreviewHtml(currentCode, formatId))
            : isNative && previewHtml
              ? getIframe(injectImgFallback(previewHtml))
              : isNative
                ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: "12px", background: "#fafafa" }}>HTML 미리보기 생성 중...</div>
                : <pre style={{ flex: 1, margin: 0, padding: "14px", fontSize: "11px", background: "#1a1a2e", color: "#a8d8ea", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>{currentCode}</pre>
          }
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 인라인 프리뷰 + 크게 보기 버튼 */}
      <div style={{ position: "relative" }}>
        {previewContent(false)}
        <button
          onClick={onExpand}
          title="전체화면으로 보기"
          style={{ position: "absolute", top: "8px", right: "8px", padding: "4px 10px", background: "rgba(255,255,255,0.9)", border: "1px solid #dddddd", borderRadius: "8px", fontSize: "10px", color: "#555", cursor: "pointer", fontWeight: 600, backdropFilter: "blur(4px)", zIndex: 10 }}
        >
          ⤢ 크게 보기
        </button>
      </div>

      {/* 전체화면 오버레이 */}
      {expanded && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#ffffff", display: "flex", flexDirection: "column" }}>
          {/* 오버레이 헤더 */}
          <div style={{ padding: "10px 16px", background: "#faf8ff", borderBottom: "1px solid #e0d8f4", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#7740c8" }}>🎨 Figma 미리보기 — {fmt?.label}</span>
            <span style={{ fontSize: "11px", color: "#aaa", flex: 1 }}>전체화면 모드</span>
            <button
              onClick={onCollapse}
              style={{ padding: "5px 14px", background: "#f0ebff", border: "1px solid #c8aaee", borderRadius: "8px", fontSize: "12px", color: "#7740c8", cursor: "pointer", fontWeight: 700 }}
            >
              ✕ 닫기
            </button>
          </div>
          {/* 전체화면 프리뷰 */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            {previewContent(true)}
          </div>
        </div>
      )}
    </>
  );
}

// ── 포맷 선택기 ───────────────────────────────────────────────────────────────
function FormatSelector({ value, onChange, disabled }) {
  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid #eeeeee", background: "#fafafa" }}>
      {FORMATS.map(f => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          disabled={disabled}
          style={{
            padding: "4px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
            cursor: disabled ? "default" : "pointer", transition: "all 0.15s",
            background: value === f.id ? "#7740c8" : "#ffffff",
            color: value === f.id ? "#ffffff" : "#666666",
            border: `1px solid ${value === f.id ? "#7740c8" : "#dddddd"}`,
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ── 상태 바 ───────────────────────────────────────────────────────────────────
function StatusBar({ phase, iteration, elapsed, formatId }) {
  const formatLabel = FORMATS.find(f => f.id === formatId)?.label || "";
  const PHASES = {
    figma:    { label: "Figma 디자인 읽기",              icon: "🎨" },
    generate: { label: `${formatLabel} 코드 생성 중`,   icon: "⚙️" },
    compare:  { label: "스펙 대조 검증",                 icon: "🔍" },
    done:     { label: "완료",                           icon: "✅" },
  };
  const p = PHASES[phase] || {};
  return (
    <div style={{ padding: "10px 16px", background: "#fafafa", borderBottom: "1px solid #eeeeee", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0,1,2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
      </div>
      <span style={{ fontSize: "12px", color: "#7740c8", fontWeight: 600 }}>{p.icon} {p.label}</span>
      <span style={{ fontSize: "11px", color: "#bbbbbb", marginLeft: "auto" }}>
        {elapsed > 0 && `${elapsed}s`}
        {iteration > 0 && phase !== "done" && ` · 검증 ${iteration}/${MAX_ITER}회차`}
      </span>
    </div>
  );
}

// ── Supabase에 컴포넌트 저장 (스토리북 브리지) ───────────────────────────────
async function saveToStorybook(code, figmaUrl) {
  try {
    await fetch("/api/save-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "figma_component",
        title: "figma_component_latest",
        content: JSON.stringify({ code, figmaUrl, savedAt: new Date().toISOString() }),
        tags: ["figma", "react-yds", "live"],
      }),
    });
    return true;
  } catch { return false; }
}

// ── 결과 뷰어 ─────────────────────────────────────────────────────────────────
function PreviewResult({ figmaImgUrl, figmaUrl, code, formatId, spec, iterations, onRerun, onChangeFormat, previewHtml }) {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [currentCode, setCurrentCode] = useState(code);
  const [verifyIters, setVerifyIters] = useState([]);
  const [verifyLog, setVerifyLog] = useState("");
  const [showVerifyLog, setShowVerifyLog] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isHtml = formatId === "html-css";
  const isYds = formatId === "react-yds";
  const isNative = ["swiftui", "compose"].includes(formatId);
  const fmt = FORMATS.find(f => f.id === formatId);

  const runVerify = async () => {
    setVerifying(true);
    setVerifyLog("");
    setShowVerifyLog(true);
    let c = currentCode;
    for (let i = 1; i <= MAX_ITER; i++) {
      setVerifyLog(prev => prev + `▶ 검증 ${i}/${MAX_ITER}회차 분석 중...\n`);
      let streamBuf = "";
      const result = await compareAndFix(spec, c, formatId, i, (delta, full) => {
        streamBuf = full;
        setVerifyLog(prev => {
          // 마지막 "분석 중..." 줄을 실시간 스트림으로 교체
          const lines = prev.split("\n");
          const headerIdx = lines.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
          if (headerIdx >= 0) {
            return lines.slice(0, headerIdx + 1).join("\n") + "\n" + full;
          }
          return prev + full;
        });
      });
      // 완료 후 분석 요약 정리
      const summary = result.analysis
        ? result.analysis
        : result.done ? "✅ 스펙과 일치 — 수정 불필요" : "🔧 차이 발견, 코드 수정 완료";
      setVerifyLog(prev => {
        const lines = prev.split("\n");
        const headerIdx = lines.findLastIndex(l => l.startsWith(`▶ 검증 ${i}`));
        const header = result.done ? `✅ 검증 ${i}/${MAX_ITER}회차` : `🔧 검증 ${i}/${MAX_ITER}회차`;
        if (headerIdx >= 0) {
          return lines.slice(0, headerIdx).join("\n") + (headerIdx > 0 ? "\n" : "") + header + "\n" + summary + "\n";
        }
        return prev;
      });
      setVerifyIters(prev => [...prev, { iteration: i, done: result.done }]);
      if (result.done) break;
      c = result.code;
      setCurrentCode(c);
    }
    setVerifying(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const sendToStorybook = async () => {
    setSending(true);
    await saveToStorybook(currentCode, figmaUrl);
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
    window.open("https://storybook-livid-chi.vercel.app#figma-live", "_blank");
  };

  return (
    <div>
      {/* 포맷 선택 */}
      <FormatSelector value={formatId} onChange={onChangeFormat} disabled={false} />

      {/* 검증 상태 */}
      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #eeeeee", background: "#fafafa" }}>
        <span style={{ fontSize: "11px", color: "#888" }}>
          {verifyIters.length === 0
            ? "생성 완료 — 🔍 스펙 검증으로 코드 자동 수정 가능"
            : verifyIters.every(it => it.done)
              ? `✅ ${verifyIters.length}회 검증 완료 — 수정 없음 (스펙 일치)`
              : `🔧 ${verifyIters.length}회 검증 완료 — 코드 자동 수정됨`}
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          {verifyIters.map((it, i) => (
            <span key={i} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: it.done ? "#d0f0d8" : "#ffe8d0", color: it.done ? "#337733" : "#a06020" }}>
              {it.done ? "✓" : `${it.iteration}차`}
            </span>
          ))}
        </div>
        <button
          onClick={runVerify}
          disabled={verifying}
          style={{ marginLeft: "auto", padding: "4px 12px", background: verifying ? "#eee" : "#f0ebff", border: "1px solid #c8aaee", borderRadius: "10px", fontSize: "11px", color: verifying ? "#aaa" : "#7740c8", cursor: verifying ? "default" : "pointer", fontWeight: 600 }}
        >
          {verifying ? "🔍 분석 중..." : "🔍 스펙 검증"}
        </button>
        {verifyLog && (
          <button
            onClick={() => setShowVerifyLog(v => !v)}
            style={{ padding: "4px 10px", background: "transparent", border: "1px solid #dddddd", borderRadius: "10px", fontSize: "10px", color: "#888", cursor: "pointer", marginLeft: "4px" }}
          >
            {showVerifyLog ? "로그 숨기기" : "로그 보기"}
          </button>
        )}
      </div>

      {/* 검증 로그 */}
      {verifyLog && showVerifyLog && (
        <div style={{ borderBottom: "1px solid #eeeeee", background: "#0d1117" }}>
          <div style={{ padding: "6px 14px", fontSize: "10px", fontWeight: 700, color: "#7740c8", letterSpacing: "0.08em", borderBottom: "1px solid #1e2530" }}>
            검증 로그 {verifying && <span style={{ color: "#f0a000", marginLeft: "6px" }}>⏳ 분석 중</span>}
          </div>
          <pre style={{ margin: 0, padding: "12px 14px", fontSize: "11px", color: "#cdd9e5", background: "transparent", overflow: "auto", maxHeight: "220px", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}>
            {verifyLog}
          </pre>
        </div>
      )}

      {/* 프리뷰 영역 */}
      <PreviewPanels
        figmaImgUrl={figmaImgUrl}
        currentCode={currentCode}
        formatId={formatId}
        previewHtml={previewHtml}
        isHtml={isHtml}
        isNative={isNative}
        fmt={fmt}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
      />

      {/* 액션 */}
      <div style={{ padding: "10px 14px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={copy} style={{ padding: "5px 14px", background: copied ? "#f0fff4" : "#f5f5f5", border: `1px solid ${copied ? "#88cc88" : "#dddddd"}`, borderRadius: "12px", fontSize: "11px", color: copied ? "#338833" : "#555", cursor: "pointer", fontWeight: 600 }}>
          {copied ? "✓ 복사됨" : "코드 복사"}
        </button>
        {isYds && (
          <button
            onClick={sendToStorybook}
            disabled={sending}
            style={{ padding: "5px 14px", background: sent ? "#f0fff4" : "#7740c8", border: `1px solid ${sent ? "#88cc88" : "#7740c8"}`, borderRadius: "12px", fontSize: "11px", color: sent ? "#338833" : "#fff", cursor: sending ? "default" : "pointer", fontWeight: 600, opacity: sending ? 0.7 : 1 }}
          >
            {sent ? "✓ 스토리북 열림" : sending ? "전송 중..." : "📖 스토리북에서 보기"}
          </button>
        )}
        {(isHtml || isNative) && (
          <button onClick={() => setShowCode(v => !v)} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777", cursor: "pointer" }}>
            {showCode ? "코드 숨기기" : `${fmt?.label} 코드 보기`}
          </button>
        )}
        <button onClick={onRerun} style={{ padding: "5px 14px", background: "transparent", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", color: "#777", cursor: "pointer" }}>
          ↺ 처음부터 재생성
        </button>
      </div>

      {(isHtml || isNative) && showCode && (
        <div style={{ padding: "0 14px 14px" }}>
          <pre style={{ background: "#111111", borderRadius: "10px", padding: "14px", fontSize: "11px", color: isNative ? "#a8d8ea" : "#88ff88", overflow: "auto", maxHeight: "320px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
            {currentCode}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function FigmaPreviewBubble({ url }) {
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState("");
  const [iteration, setIteration] = useState(0);
  const [figmaImgUrl, setFigmaImgUrl] = useState(null);
  const [code, setCode] = useState("");
  const [iterations, setIterations] = useState([]);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [formatId, setFormatId] = useState("html-css");
  const [previewHtml, setPreviewHtml] = useState("");

  const parsed = parseFigmaUrl(url);
  const runRef = useRef(false);
  const timerRef = useRef(null);
  const specRef = useRef("");

  const run = async (fmtId = formatId) => {
    const tok = localStorage.getItem(FIGMA_TOKEN_KEY) || "";
    if (runRef.current) return;
    runRef.current = true;
    setStatus("running");
    setError("");
    setIterations([]);
    setFigmaImgUrl(null);
    setCode("");
    setPreviewHtml("");
    setIteration(0);
    setElapsed(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      if (!tok) throw new Error("Figma Personal Access Token이 필요합니다.");
      if (!parsed?.nodeId) throw new Error("URL에 node-id가 없습니다.\nFigma에서 컴포넌트를 선택한 후 URL을 복사해 주세요.");

      // 1. Figma 데이터
      setPhase("figma");
      const [imgUrl, nodeData] = await Promise.all([
        fetchFigmaImageUrl(parsed.fileKey, parsed.nodeId, tok),
        fetchFigmaNodeData(parsed.fileKey, parsed.nodeId, tok),
      ]);
      setFigmaImgUrl(imgUrl);
      const spec = nodeToSpec(nodeData);
      specRef.current = spec;
      console.log("[Figma] spec:\n" + spec);
      console.log("[Figma] scroll lines:", spec.split("\n").filter(l => l.includes("scroll:")));

      // 2. 코드 생성 — 완료 즉시 결과 표시
      setPhase("generate");
      const isNative = ["swiftui", "compose"].includes(fmtId);
      let currentCode;
      if (isNative) {
        // 네이티브 코드 + HTML 미리보기 병렬 생성
        [currentCode] = await Promise.all([
          generateCode(spec, fmtId, (partial) => {
            setCode(partial.replace(/^```[\w]*\n?/i, ""));
          }),
          generateCode(spec, "html-css", () => {})
            .then(html => setPreviewHtml(html))
            .catch(() => {}),
        ]);
      } else {
        currentCode = await generateCode(spec, fmtId, (partial) => {
          setCode(partial.replace(/^```[\w]*\n?/i, ""));
        });
      }
      setCode(currentCode);
      setPhase("done");
      setStatus("done");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    } finally {
      runRef.current = false;
      clearInterval(timerRef.current);
    }
  };

  // 포맷 변경 시 재실행
  const handleChangeFormat = (newFmt) => {
    setFormatId(newFmt);
    setStatus("idle");
    runRef.current = false;
    run(newFmt);
  };

  useEffect(() => {}, []);

  return (
    <div style={{ margin: "0 0 20px 0", background: "#ffffff", border: "1px solid #e0d8f4", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 12px rgba(120,80,200,0.07)" }}>

      {/* 헤더 */}
      <div style={{ padding: "11px 16px", background: "linear-gradient(135deg, #f5f0ff 0%, #ede8ff 100%)", borderBottom: "1px solid #e0d8f4", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "15px" }}>🎨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#7740c8", letterSpacing: "0.1em" }}>FIGMA → 자동 검증 프리뷰</div>
          <div style={{ fontSize: "11px", color: "#9a70d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>{url}</div>
        </div>
      </div>

      {/* idle */}
      {status === "idle" && (
        <div>
          <FormatSelector value={formatId} onChange={setFormatId} disabled={false} />
          <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: "12px", background: "#fffbf0" }}>
            {!localStorage.getItem(FIGMA_TOKEN_KEY) ? (
              <>
                <span style={{ fontSize: "18px" }}>⚠️</span>
                <div style={{ fontSize: "12px", color: "#a07000", lineHeight: 1.7 }}>
                  상단 헤더의 <strong>🎨 Figma</strong> 버튼에서 토큰을 먼저 설정해 주세요.
                </div>
              </>
            ) : !parsed?.nodeId ? (
              <>
                <span style={{ fontSize: "18px" }}>⚠️</span>
                <div style={{ fontSize: "12px", color: "#a07000", lineHeight: 1.7 }}>
                  URL에 node-id가 없습니다.<br />Figma에서 컴포넌트를 <strong>선택</strong>한 후 URL을 복사해 주세요.
                </div>
              </>
            ) : (
              <button onClick={() => run()} style={{ padding: "8px 20px", background: "#7740c8", border: "none", borderRadius: "16px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                ▶ 시작
              </button>
            )}
          </div>
        </div>
      )}

      {/* 실행 중 */}
      {status === "running" && (
        <div>
          <FormatSelector value={formatId} onChange={() => {}} disabled={true} />
          <StatusBar phase={phase} iteration={iteration} elapsed={elapsed} formatId={formatId} />
          {code && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #eeeeee" }}>
              <div style={{ fontSize: "10px", color: "#aaaaaa", marginBottom: "6px" }}>생성 중...</div>
              {["html-css","react-tailwind","react-inline","react-yds"].includes(formatId) ? (
                <iframe
                  srcDoc={formatId === "html-css" ? code : buildReactPreviewHtml(code, formatId)}
                  style={{ width: "100%", height: "300px", border: "1px solid #eeeeee", borderRadius: "8px", display: "block" }}
                  sandbox="allow-scripts"
                  title="preview in progress"
                />
              ) : (
                <pre style={{ margin: 0, padding: "12px", fontSize: "11px", background: "#1a1a2e", color: "#a8d8ea", borderRadius: "8px", overflow: "auto", maxHeight: "300px", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {code}
                </pre>
              )}
            </div>
          )}
          {!code && (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: "5px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7740c8", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 완료 */}
      {status === "done" && (
        <PreviewResult
          figmaImgUrl={figmaImgUrl}
          figmaUrl={url}
          code={code}
          spec={specRef.current}
          formatId={formatId}
          iterations={iterations}
          previewHtml={previewHtml}
          onRerun={() => { setStatus("idle"); runRef.current = false; run(); }}
          onChangeFormat={handleChangeFormat}
        />
      )}

      {/* 에러 */}
      {status === "error" && (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "12px", color: "#cc4444", lineHeight: 1.8, marginBottom: "6px", whiteSpace: "pre-wrap" }}>{error}</div>
          {(error.includes("토큰") || error.includes("Token")) && (
            <div style={{ fontSize: "11px", color: "#888888", marginBottom: "14px" }}>
              상단 헤더의 <strong>🎨 Figma</strong> 버튼에서 토큰을 설정/변경해 주세요.
            </div>
          )}
          {error.includes("프록시") && (
            <div style={{ fontSize: "11px", color: "#888888", marginBottom: "14px" }}>
              우측 상단 프록시 버튼에서 로컬 프록시를 먼저 연결해 주세요.
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px" }}>
            <FormatSelector value={formatId} onChange={(f) => { setFormatId(f); }} disabled={false} />
          </div>
          <button
            onClick={() => { setStatus("idle"); runRef.current = false; run(); }}
            style={{ marginTop: "12px", padding: "7px 18px", background: "#f5f5f5", border: "1px solid #dddddd", borderRadius: "12px", fontSize: "11px", cursor: "pointer" }}
          >
            ↺ 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
