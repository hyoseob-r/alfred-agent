import { useState, useEffect, useRef } from "react";
import { chatAPI, streamChatAPI } from "../api/proxy";

const FIGMA_TOKEN_KEY = "figma_pat";
const MAX_ITER = 2;

// ── 포맷 정의 ─────────────────────────────────────────────────────────────────
const FORMATS = [
  { id: "react-yds",       label: "React + YDS",       lang: "jsx" },
  { id: "swiftui",         label: "SwiftUI",           lang: "swift" },
  { id: "compose",         label: "Compose",           lang: "kotlin" },
];

const FORMAT_PROMPT = {
  "html-css": `구현 규칙:
- <!DOCTYPE html>부터 시작하는 완전한 단일 HTML 파일
- Pretendard 폰트: <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet">
- 스펙의 색상·크기·폰트·간격을 최대한 정확하게 구현
- 모든 스타일은 <style> 태그 사용
- 한국어 현실적 콘텐츠
- body { margin: 0; padding: 16px; background: #f5f5f5; font-family: 'Pretendard', sans-serif; }
- 이미지: 반드시 https://picsum.photos/[너비]/[높이]?random=[숫자] 형식의 실제 URL 사용 (예: <img src="https://picsum.photos/80/80?random=1">). src 없는 img 태그 금지.
- ‼️SCROLL-X 가 있는 요소: display:flex; flex-direction:row; flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; 직접 자식: flex-shrink:0
- HTML 코드만 반환, 마크다운·설명 없음`,

  "react-tailwind": `구현 규칙:
- React 함수형 컴포넌트, 파일명 Component.jsx
- Tailwind CSS 클래스만 사용 (스타일 속성 직접 작성 금지)
- 스펙의 색상은 Tailwind 가장 근접한 클래스 또는 arbitrary value 사용 (예: bg-[#FF5733])
- 폰트: font-['Pretendard']
- 한국어 현실적 콘텐츠
- 이미지: 반드시 https://picsum.photos/[너비]/[높이]?random=[숫자] 형식의 실제 URL 사용. src 없는 img 금지.
- ‼️SCROLL-X 가 있는 요소: className="flex overflow-x-auto" 직접 자식: className="flex-shrink-0"
- JSX 코드만 반환, 마크다운·설명 없음`,

  "react-inline": `구현 규칙:
- React 함수형 컴포넌트, 파일명 Component.jsx
- 모든 스타일은 style={{}} inline 객체 사용
- 스펙의 색상·크기·폰트·간격을 픽셀 단위로 정확하게 구현
- 폰트: fontFamily: "'Pretendard', sans-serif"
- 한국어 현실적 콘텐츠
- 이미지: 반드시 https://picsum.photos/[너비]/[높이]?random=[숫자] 형식의 실제 URL 사용. src 없는 img 금지.
- ‼️SCROLL-X 가 있는 컨테이너: style={{ display:"flex", flexDirection:"row", flexWrap:"nowrap", overflowX:"auto", WebkitOverflowScrolling:"touch" }}, 직접 자식 모두: style={{ flexShrink:0 }}
- JSX 코드만 반환, 마크다운·설명 없음`,

  "react-yds": `구현 규칙:
- React 함수형 컴포넌트 (export default function ComponentName)
- 반드시 아래 import 문 사용:
  import { colors, metaTokens } from "./tokens";
- 모든 스타일은 style={{}} inline 객체. 값은 반드시 토큰에서 참조.
- 한국어 현실적 콘텐츠
- 이미지: 반드시 https://picsum.photos/[너비]/[높이]?random=[숫자] 형식의 실제 URL 사용.
- ‼️SCROLL-X 가 있는 컨테이너: style={{ display:"flex", flexDirection:"row", flexWrap:"nowrap", overflowX:"auto", WebkitOverflowScrolling:"touch" }}, 직접 자식 모두: style={{ flexShrink:0 }}
- JSX 코드만 반환, 마크다운·설명 없음

=== YDS 2.0 토큰 참조 ===

[컬러] colors.xxx.yyy.value 형태로 사용
foundation.primary=#fa0050 (요기요 레드/CTA), foundation.primary_i=#ff3072
foundation.secondary=#0c74e4 (파랑), foundation.secondary_i=#1f8bff
foundation.green=#05947f, foundation.yellow=#ffcb2e, foundation.white=#fff, foundation.black=#000
light.primary_a=#fa0050, light.primary_a_100=#feccdc
light.primary_b=#28343c, light.primary_b_100=#dee5ea
light.accent=#0c80e4, light.accent_100=#c5e2fb
light.ygy_green=#05947f, light.ygy_orange=#f04600
gray.gray800=#333333(본문), gray.gray600=#666666, gray.gray400=#999999
gray.gray250=#bfbfbf, gray.gray100=#e5e5e5, gray.gray50=#f2f2f2, gray.gray25=#f6f6f6
background.primary=#ffffff(기본 배경), background.bottom=#f2f2f2
background.dim1=#000000e5, background.dim2=#00000099
variant.primary25=#fff5f8, variant.primary50=#ffe6ee, variant.primary800=#640020
variant.secondary25=#f0f7fa, variant.green25=#f0f7f6, variant.red25=#fef4f4

[타이포] metaTokens.typography.xxx → { size, weight, lineHeight }
meta_sf_10_r: 10/400/14, meta_sf_10_b: 10/700/14
meta_sf_12_r: 12/400/16, meta_sf_12_b: 12/700/16
meta_sf_13_r: 13/400/18, meta_sf_13_b: 13/700/18
meta_sf_14_r: 14/400/19(기본), meta_sf_14_b: 14/700/19
meta_sf_16_r: 16/400/22, meta_sf_16_b: 16/700/22
meta_sf_18_b: 18/700/24, meta_sf_20_b: 20/700/27
meta_sf_24_b: 24/700/32, meta_sf_32_b: 32/700/43
→ 사용법: fontSize:metaTokens.typography.meta_sf_14_r.size, fontWeight:..weight, lineHeight:..lineHeight+"px"

[스페이싱] metaTokens.spacing.meta_sN (px 단위)
meta_s1:2, meta_s2:4, meta_s3:6, meta_s4:8, meta_s5:10, meta_s6:12
meta_s7:16, meta_s8:20, meta_s9:24, meta_s10:28, meta_s11:32, meta_s12:36, meta_s13:40
→ 사용법: padding:metaTokens.spacing.meta_s4 (px 불필요, 숫자값)

[라디우스] metaTokens.radius.xxx (px 단위 숫자)
meta_r0:0, meta_r1:4, meta_r2:8, meta_r3:10, meta_r4:12, meta_r5:16, meta_r6:20, rfull:360
→ 사용법: borderRadius:metaTokens.radius.meta_r4

[그림자] metaTokens.elevation.xxx.css (CSS string)
meta_level_0: none
meta_level_1: "0 1px 8px rgba(25,48,64,0.10), 0 0 2px rgba(25,48,64,0.08)"
meta_level_2: "0 2px 12px rgba(25,48,64,0.24), 0 0 4px rgba(25,48,64,0.12)"
→ 사용법: boxShadow:metaTokens.elevation.meta_level_1.css

[폰트] fontFamily: "'SD Neo Gothic', 'Pretendard', sans-serif"
=========================`,

  "swiftui": `구현 규칙:
- SwiftUI View struct
- 폰트: Font.custom("Pretendard", size:) 사용
- 한국어 현실적 콘텐츠
- YDS 토큰 매핑 (스펙 수치 대신 아래 값 우선 사용):
  [색상] primary:#fa0050 / gray800:#333333 / gray600:#666666 / gray400:#999999 / gray100:#e5e5e5 / gray50:#f2f2f2 / white:#ffffff / black:#000000
  [스페이싱] s1:2 s2:4 s3:6 s4:8 s5:10 s6:12 s7:16 s8:20 s9:24 s10:28 s11:32 s12:36 s13:40 (단위: CGFloat/pt)
  [라디우스] r0:0 r1:4 r2:8 r3:10 r4:12 r5:16 r6:20 rfull:360
  [타이포] size10/12/13/14/16/18/20/24 — weight400(regular)/700(bold) — lineHeight14/16/18/19/22/24/27/32
  [엘리베이션] level1: shadow(color:.black.opacity(0.10), radius:8, x:0, y:1) / level2: shadow(color:.black.opacity(0.24), radius:12, x:0, y:2)
- 색상은 Color(hex:) extension 또는 Color(red:green:blue:) 사용
- ‼️SCROLL-X 가 있는 컨테이너: ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: gap) { children } } ⚠️ HStack에 .frame(maxWidth: .infinity) 금지
- Swift 코드만 반환, 마크다운·설명 없음`,

  "compose": `구현 규칙:
- Jetpack Compose @Composable 함수
- 폰트: FontFamily 커스텀(Pretendard) 또는 MaterialTheme.typography 사용
- 한국어 현실적 콘텐츠
- YDS 토큰 매핑 (스펙 수치 대신 아래 값 우선 사용):
  [색상] primary:0xFFFA0050 / gray800:0xFF333333 / gray600:0xFF666666 / gray400:0xFF999999 / gray100:0xFFE5E5E5 / gray50:0xFFF2F2F2 / white:0xFFFFFFFF / black:0xFF000000
  [스페이싱] s1:2 s2:4 s3:6 s4:8 s5:10 s6:12 s7:16 s8:20 s9:24 s10:28 s11:32 s12:36 s13:40 (단위: dp)
  [라디우스] r0:0 r1:4 r2:8 r3:10 r4:12 r5:16 r6:20 rfull:360
  [타이포] fontSize:10/12/13/14/16/18/20/24.sp — fontWeight:Normal(400)/Bold(700) — lineHeight:14/16/18/19/22/24/27/32.sp
  [엘리베이션] level1: shadow elevation=4.dp / level2: shadow elevation=8.dp
- 색상은 Color(0xFF...) 형식
- ‼️SCROLL-X 가 있는 컨테이너: Row(modifier = Modifier.horizontalScroll(rememberScrollState())) — LazyRow도 가능
- Kotlin 코드만 반환, 마크다운·설명 없음`,
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
  if (!resp.ok) throw new Error(resp.status === 403
    ? `Figma 토큰이 만료되었거나 권한이 없습니다 (403).\n우상단 설정에서 PAT를 새로 발급해 업데이트해 주세요.`
    : `Figma 노드 API ${resp.status}`);
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
function nodeToSpec(node, depth = 0, parentBb = null, parentHasAutoLayout = false, parentIsScrolling = false) {
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
    const pt = node.paddingTop ?? 0, pr = node.paddingRight ?? 0;
    const pb = node.paddingBottom ?? 0, pl = node.paddingLeft ?? 0;
    const hasPad = pt || pr || pb || pl;
    const pad = hasPad ? ` padding:${pt}/${pr}/${pb}/${pl}px` : "";
    const gap = node.itemSpacing ? ` gap:${Math.round(node.itemSpacing)}px` : "";
    const main = node.primaryAxisAlignItems ? ` mainAxis:${node.primaryAxisAlignItems}` : "";
    const cross = node.counterAxisAlignItems ? ` crossAxis:${node.counterAxisAlignItems}` : "";
    lines.push(`${indent}  flex:${dir}${pad}${gap}${main}${cross}`);
  }

  // 스크롤 감지 — overflowDirection / scrollOverflow / clipsContent fallback
  const SCROLL_H_MAP = new Set(["HORIZONTAL", "HORIZONTAL_SCROLLING"]);
  const SCROLL_V_MAP = new Set(["VERTICAL", "VERTICAL_SCROLLING"]);
  const SCROLL_B_MAP = new Set(["HORIZONTAL_AND_VERTICAL", "HORIZONTAL_AND_VERTICAL_SCROLLING"]);

  // 가로 스크롤만 감지 — Figma 명시 값 기준 (세로는 기본값이므로 스펙 불필요)
  let isHScrollContainer = false;
  const ovDir = node.overflowDirection;
  const ovFlow = node.scrollOverflow;
  if (ovDir && ovDir !== "NONE") {
    if (SCROLL_H_MAP.has(ovDir) || SCROLL_B_MAP.has(ovDir)) isHScrollContainer = true;
  }
  if (!isHScrollContainer && ovFlow) {
    if (SCROLL_H_MAP.has(ovFlow) || SCROLL_B_MAP.has(ovFlow)) isHScrollContainer = true;
  }
  // heuristic: HORIZONTAL auto-layout + clipsContent + 자식 총너비가 컨테이너보다 클 때만
  if (!isHScrollContainer && node.clipsContent && hasAutoLayout && node.layoutMode === "HORIZONTAL" && bb) {
    const children = node.children || [];
    const spacing = node.itemSpacing || 0;
    const totalChildW = children.reduce((sum, c) => sum + (c.absoluteBoundingBox?.width || 0), 0)
                        + Math.max(0, children.length - 1) * spacing;
    const containerW = bb.width;
    if (totalChildW > containerW * 1.1) {
      console.log(`[Figma] ‼️SCROLL-X heuristic: "${node.name}" totalChildW=${Math.round(totalChildW)} containerW=${Math.round(containerW)}`);
      isHScrollContainer = true;
    }
  }

  let nodeIsScrolling = false;
  if (isHScrollContainer) {
    console.log(`[Figma] ‼️SCROLL-X detected: "${node.name}" (${bb ? Math.round(bb.width)+'×'+Math.round(bb.height) : '?'}) ovDir=${ovDir} ovFlow=${ovFlow} clipsContent=${node.clipsContent} layoutMode=${node.layoutMode}`);
    lines.push(`${indent}  ‼️SCROLL-X: 가로 스크롤 컨테이너. React→style={{overflowX:"auto",display:"flex",flexDirection:"row",flexWrap:"nowrap"}} 직접자식→flexShrink:0 / SwiftUI→ScrollView(.horizontal,showsIndicators:false){HStack{자식들}} HStack에.frame(maxWidth:.infinity)금지 / Compose→Row(modifier=Modifier.horizontalScroll(rememberScrollState()))`);
    nodeIsScrolling = true;
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
    const childSpec = nodeToSpec(child, depth + 1, bb, hasAutoLayout, nodeIsScrolling);
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
<style>*{box-sizing:border-box;}html,body{margin:0;padding:0;overflow-x:auto;background:#f5f5f5;font-family:'Pretendard',sans-serif;}body{padding:16px;}</style>
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
// 렌더링 후 flex-row 컨테이너 자동 scroll 활성화
(function autoScroll() {
  function fix() {
    document.querySelectorAll('*').forEach(function(el) {
      if (el === document.body || el === document.documentElement) return;
      var cs = window.getComputedStyle(el);
      var isRow = cs.display === 'flex' && (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse');
      if (!isRow) return;
      // flex-wrap:nowrap 강제 (wrap이면 overflow가 안 생겨서 측정 불가)
      el.style.flexWrap = 'nowrap';
      var overflows = el.scrollWidth > el.clientWidth + 4;
      if (overflows) {
        el.style.overflowX = 'auto';
        el.style.webkitOverflowScrolling = 'touch';
        Array.from(el.children).forEach(function(c) { c.style.flexShrink = '0'; });
      }
    });
  }
  [50, 200, 600, 1500].forEach(function(t) { setTimeout(fix, t); });
  document.addEventListener('load', function(e) { if (e.target.tagName === 'IMG') setTimeout(fix, 100); }, true);
})();
// 깨진 이미지 자동 복구
document.addEventListener('error', function(e) {
  if (e.target.tagName !== 'IMG') return;
  var w = Math.round(e.target.offsetWidth) || 80;
  var h = Math.round(e.target.offsetHeight) || 80;
  e.target.src = 'https://picsum.photos/' + w + '/' + h + '?random=' + Math.floor(Math.random() * 200);
  e.target.onerror = null;
}, true);
</script>
</body>
</html>`;
}

// ── HTML에 깨진 이미지 자동 복구 스크립트 inject ─────────────────────────────
const IMG_FALLBACK_SCRIPT = `<script>
(function(){
  function fix(){document.querySelectorAll('*').forEach(function(el){if(el===document.body||el===document.documentElement)return;var cs=window.getComputedStyle(el);var isRow=cs.display==='flex'&&(cs.flexDirection==='row'||cs.flexDirection==='row-reverse');if(!isRow)return;el.style.flexWrap='nowrap';var over=el.scrollWidth>el.clientWidth+4;if(over){el.style.overflowX='auto';el.style.webkitOverflowScrolling='touch';Array.from(el.children).forEach(function(c){c.style.flexShrink='0';});}});}
  [50,200,600,1500].forEach(function(t){setTimeout(fix,t);});
  document.addEventListener('load',function(e){if(e.target.tagName==='IMG')setTimeout(fix,100);},true);
})();
document.addEventListener('error',function(e){
  if(e.target.tagName!=='IMG')return;
  const w=Math.round(e.target.offsetWidth)||80,h=Math.round(e.target.offsetHeight)||80;
  e.target.src='https://picsum.photos/'+w+'/'+h+'?random='+Math.floor(Math.random()*200);
  e.target.onerror=null;
},true);
<\/script>`;

const SCROLL_FIX_STYLE = `<style>html,body{overflow-x:auto!important;}</style>`;

function injectImgFallback(html) {
  if (!html) return html;
  const withScroll = html.includes('</head>')
    ? html.replace('</head>', SCROLL_FIX_STYLE + '</head>')
    : SCROLL_FIX_STYLE + html;
  if (withScroll.includes('</body>')) return withScroll.replace('</body>', IMG_FALLBACK_SCRIPT + '</body>');
  return withScroll + IMG_FALLBACK_SCRIPT;
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
  const [formatId, setFormatId] = useState("react-yds");
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
      console.log("[Figma] scroll lines:", spec.split("\n").filter(l => l.includes("‼️SCROLL-")));

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
              {["react-yds"].includes(formatId) ? (
                <iframe
                  srcDoc={buildReactPreviewHtml(code, formatId)}
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
