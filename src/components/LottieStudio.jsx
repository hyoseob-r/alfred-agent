/**
 * LottieStudio — alfred-agent 통합 버전
 * - 오너 계정: edit_sessions 테이블에 히스토리 저장 (HWorld Supabase)
 * - 비오너/비로그인: 로컬 작업만 가능, DB 저장 없음
 * - getSupabase() / isOwner 패턴은 alfred-agent와 동일
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabase } from "../api/supabase";
import LottieConverter from "./LottieConverter";

// lottie-web 동적 로드 (번들 분리 — 초기 로딩 지연 방지)
let _lottie = null;
async function getLottie() {
  if (_lottie) return _lottie;
  const mod = await import("lottie-web");
  _lottie = mod.default;
  return _lottie;
}

const MAX_UNDO = 50;
const UNDO_TTL_MS = 1000 * 60 * 60 * 24;
const AUTO_SAVE_DELAY = 1500;
const CHECKER = "repeating-conic-gradient(#2a2a2a 0% 25%,#1a1a1a 0% 50%) 0 0/20px 20px";
const BG_PRESETS = ["transparent","#ffffff","#000000","#0a0a0f","#f0f0f0","#1a1a2e","#111827","#ff6b6b","#ffeaa7","#6c5ce7"];

// ─────────────────────────────────────────────────────────────
// Lottie 유틸
// ─────────────────────────────────────────────────────────────
function lottieColorToHex(arr) {
  const r = Math.round(Math.min(1, Math.max(0, arr[0] || 0)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, arr[1] || 0)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, arr[2] || 0)) * 255);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function hexToLottieColor(hex) {
  return [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255, 1];
}
function extractColors(data) {
  const entries = []; const seen = new Set();
  function walkLayers(layers, prefix) {
    if (!layers || !Array.isArray(layers)) return;
    layers.forEach((layer, li) => {
      const name = layer.nm || ("L" + li);
      const path = prefix + name;
      if (layer.layers) walkLayers(layer.layers, path + "/");
      if (layer.shapes) walkShapes(layer.shapes, path);
    });
  }
  function walkShapes(shapes, path) {
    if (!shapes || !Array.isArray(shapes)) return;
    shapes.forEach((shape, si) => {
      const name = shape.nm || ("S" + si);
      const sp = path + "/" + name;
      if (shape.ty === "gr" && shape.it) { walkShapes(shape.it, sp); return; }
      if ((shape.ty === "fl" || shape.ty === "st") && shape.c) addEntry(shape.c, sp, shape.ty === "fl" ? "FILL" : "STROKE");
    });
  }
  function addEntry(cp, path, type) {
    if (!cp || cp.k === undefined) return;
    const k = cp.k;
    const key = path + type;
    if (seen.has(key)) return; seen.add(key);
    if (Array.isArray(k) && typeof k[0] === "number") {
      entries.push({ path, type, ref: cp, isKeyframed: false, originalK: [...k], hex: lottieColorToHex(k) });
    } else if (Array.isArray(k) && k.length > 0 && typeof k[0] === "object" && k[0].s) {
      entries.push({ path, type: type + " (anim)", ref: cp, isKeyframed: true, originalK: JSON.parse(JSON.stringify(k)), hex: lottieColorToHex(k[0].s) });
    }
  }
  walkLayers(data.layers, "");
  if (data.assets) data.assets.forEach(a => { if (a.layers) walkLayers(a.layers, "[" + (a.id || "A") + "]/"); });
  return entries;
}
function applyColorToEntry(entry, hex) {
  const c = hexToLottieColor(hex);
  if (!entry.isKeyframed) {
    entry.ref.k[0] = c[0]; entry.ref.k[1] = c[1]; entry.ref.k[2] = c[2];
    if (entry.ref.k.length > 3) entry.ref.k[3] = 1;
  } else {
    entry.ref.k.forEach(kf => {
      if (kf.s) { kf.s[0] = c[0]; kf.s[1] = c[1]; kf.s[2] = c[2]; }
      if (kf.e) { kf.e[0] = c[0]; kf.e[1] = c[1]; kf.e[2] = c[2]; }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DB 헬퍼 (오너 전용, 실패해도 무시)
// ─────────────────────────────────────────────────────────────
async function dbFetchSessions(userId) {
  try {
    const sb = await getSupabase();
    const { data } = await sb.from("edit_sessions").select("*").eq("user_id", userId).order("opened_at", { ascending: false }).limit(100);
    return data || [];
  } catch { return []; }
}
async function dbCreateSession(userId, fileName, fileSize, animInfo, animData) {
  try {
    const sb = await getSupabase();
    const sid = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const now = new Date().toISOString();
    const undoStack = [{ ts: now, data: animData, label: "원본" }];
    const payload = {
      id: sid, user_id: userId, file_name: fileName, file_size: fileSize,
      anim_info: animInfo, opened_at: now, last_edit_at: now,
      final_data: animData, undo_stack: undoStack,
      undo_expires_at: new Date(Date.now() + UNDO_TTL_MS).toISOString(),
      color_snapshot: [], exports: [],
    };
    const { error } = await sb.from("edit_sessions").insert(payload);
    if (!error) return { sid, payload };
  } catch {}
  return null;
}
async function dbAutoSave(sessionId, newData, label = "색상 수정") {
  try {
    const sb = await getSupabase();
    const { data: ex } = await sb.from("edit_sessions").select("undo_stack, undo_expires_at").eq("id", sessionId).single();
    if (!ex) return null;
    const expired = ex.undo_expires_at && new Date(ex.undo_expires_at) < new Date();
    let stack = expired ? [] : (ex.undo_stack || []);
    stack.push({ ts: new Date().toISOString(), data: newData, label });
    if (stack.length > MAX_UNDO) stack = stack.slice(stack.length - MAX_UNDO);
    const now = new Date().toISOString();
    await sb.from("edit_sessions").update({
      final_data: newData, undo_stack: stack, last_edit_at: now,
      undo_expires_at: new Date(Date.now() + UNDO_TTL_MS).toISOString(),
    }).eq("id", sessionId);
    return stack;
  } catch { return null; }
}
async function dbUndo(sessionId) {
  try {
    const sb = await getSupabase();
    const { data: ex } = await sb.from("edit_sessions").select("undo_stack, undo_expires_at").eq("id", sessionId).single();
    if (!ex) return null;
    const stack = ex.undo_stack || [];
    if (stack.length <= 1) return null;
    const newStack = stack.slice(0, -1);
    const prev = newStack[newStack.length - 1];
    await sb.from("edit_sessions").update({ final_data: prev.data, undo_stack: newStack, last_edit_at: new Date().toISOString() }).eq("id", sessionId);
    return { data: prev.data, stack: newStack };
  } catch { return null; }
}
async function dbLoadSession(sessionId) {
  try {
    const sb = await getSupabase();
    const { data } = await sb.from("edit_sessions").select("*").eq("id", sessionId).single();
    return data || null;
  } catch { return null; }
}
async function dbLogExport(sessionId, type) {
  try {
    const sb = await getSupabase();
    const { data: ex } = await sb.from("edit_sessions").select("exports").eq("id", sessionId).single();
    if (!ex) return;
    const exports = [...(ex.exports || []), { type, ts: new Date().toISOString() }];
    await sb.from("edit_sessions").update({ exports }).eq("id", sessionId);
    return exports;
  } catch {}
}
async function dbDeleteSession(sessionId) {
  try {
    const sb = await getSupabase();
    await sb.from("edit_sessions").delete().eq("id", sessionId);
  } catch {}
}
async function dbClearAllSessions(userId) {
  try {
    const sb = await getSupabase();
    await sb.from("edit_sessions").delete().eq("user_id", userId);
  } catch {}
}

// ─────────────────────────────────────────────────────────────
// 하위 컴포넌트들
// ─────────────────────────────────────────────────────────────
function Btn({ children, onClick, accent, style: s = {} }) {
  return (
    <button onClick={onClick} style={{
      width: "34px", height: "34px", borderRadius: "8px",
      border: "1px solid " + (accent ? "#7c6af7" : "#2a2a3e"),
      background: accent ? "#7c6af7" : "#12121e",
      color: "#eee", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "14px", boxShadow: accent ? "0 4px 16px rgba(124,106,247,.4)" : "none",
      ...s,
    }}>{children}</button>
  );
}

function PlayerControls({ isPlaying, isLooping, onPlay, onStop, onStepBack, onStepForward, onLoopToggle, onSpeedChange, onSeek, frameInfo }) {
  return (
    <div style={{ width: "100%", maxWidth: "460px", background: "#12121e", border: "1px solid #2a2a3e", borderRadius: "12px", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div onClick={onSeek} style={{ flex: 1, height: "4px", background: "#2a2a3e", borderRadius: "4px", position: "relative", cursor: "pointer" }}>
          <div style={{ height: "100%", width: frameInfo.pct + "%", background: "linear-gradient(90deg, #7c6af7, #a855f7)", borderRadius: "4px" }} />
          <div style={{ position: "absolute", top: "50%", left: frameInfo.pct + "%", width: "11px", height: "11px", borderRadius: "50%", background: "white", transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px #7c6af7", pointerEvents: "none" }} />
        </div>
        <span style={{ fontSize: "9px", color: "#555", whiteSpace: "nowrap", minWidth: "66px", textAlign: "right" }}>{frameInfo.cur} / {frameInfo.total}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          <Btn onClick={onStepBack}>◂</Btn>
          <Btn onClick={onPlay} accent style={{ width: "42px", height: "42px", fontSize: "16px" }}>{isPlaying ? "⏸" : "▶"}</Btn>
          <Btn onClick={onStepForward}>▸</Btn>
          <Btn onClick={onStop}>■</Btn>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label onClick={onLoopToggle} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "9px", color: "#555", cursor: "pointer", userSelect: "none" }}>
            <div style={{ width: "28px", height: "16px", borderRadius: "8px", background: isLooping ? "#7c6af7" : "#2a2a3e", position: "relative", transition: "background .2s" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "white", position: "absolute", top: "3px", left: "3px", transition: "transform .2s", transform: isLooping ? "translateX(12px)" : "none" }} />
            </div>
            LOOP
          </label>
          <select onChange={e => onSpeedChange(parseFloat(e.target.value))} style={{ background: "#12121e", border: "1px solid #2a2a3e", color: "#aaa", fontSize: "10px", borderRadius: "6px", padding: "2px 6px" }}>
            {[0.25, 0.5, 1, 1.5, 2, 3].map(s => <option key={s} value={s} defaultValue={s === 1}>{s}×</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function RightPanel({ animInfo, colorEntries, onColorChange, onResetColors, bgColor, onBgChange, onExportJSON, onExportOriginal, onExportSVG, onReset, onUndo, canUndo }) {
  const [tab, setTab] = useState("INFO");
  const [customHex, setCustomHex] = useState("");
  const TABS = ["INFO", "COLORS", "BG", "EXPORT"];

  const tabBtn = (t) => ({
    flex: 1, padding: "10px 4px", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase",
    fontFamily: "monospace", background: "transparent", border: "none",
    color: tab === t ? "#7c6af7" : "#444",
    borderBottom: tab === t ? "2px solid #7c6af7" : "2px solid transparent",
    cursor: "pointer",
  });

  return (
    <div style={{ background: "#0d1117", borderLeft: "1px solid #1e2530", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #1e2530", flexShrink: 0 }}>
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={tabBtn(t)}>{t}</button>)}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {tab === "INFO" && (
          <>
            <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#444" }}>ANIMATION INFO</div>
            {animInfo ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {[["FRAMES", animInfo.frames], ["FPS", animInfo.fps], ["DURATION", animInfo.duration + "s"], ["LAYERS", animInfo.layers]].map(([l, v]) => (
                  <div key={l} style={{ background: "#12121e", border: "1px solid #1e2530", borderRadius: "7px", padding: "8px 10px" }}>
                    <div style={{ fontSize: "8px", color: "#444", marginBottom: "2px" }}>{l}</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#ccc" }}>{v || "—"}</div>
                  </div>
                ))}
                <div style={{ gridColumn: "span 2", background: "#12121e", border: "1px solid #1e2530", borderRadius: "7px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "8px", color: "#444", marginBottom: "2px" }}>SIZE</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#ccc" }}>{animInfo.w} × {animInfo.h}px</div>
                </div>
              </div>
            ) : <div style={{ fontSize: "10px", color: "#444", textAlign: "center", padding: "20px 0" }}>파일을 로드하면 정보가 표시됩니다</div>}
          </>
        )}
        {tab === "COLORS" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#444" }}>벡터 색상 편집</div>
              <button onClick={onResetColors} style={{ fontSize: "9px", color: "#555", background: "transparent", border: "1px solid #2a2a3e", padding: "3px 7px", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace" }}>원본 복원</button>
            </div>
            {colorEntries.length === 0
              ? <div style={{ fontSize: "10px", color: "#444", textAlign: "center", padding: "20px 0", border: "1px dashed #2a2a3e", borderRadius: "7px", lineHeight: "1.8" }}>파일을 로드하면<br />색상 목록이 표시됩니다</div>
              : colorEntries.map((entry, idx) => {
                const sp = entry.path.length > 26 ? "…" + entry.path.slice(-23) : entry.path;
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "9px", background: "#12121e", border: "1px solid #1e2530", borderRadius: "8px", padding: "8px 11px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "5px", border: "2px solid rgba(255,255,255,.1)", background: entry.hex, position: "relative", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={entry.hex} onInput={e => onColorChange(idx, e.target.value)} onChange={e => onColorChange(idx, e.target.value)}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", padding: 0, border: "none" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "8px", color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "2px" }} title={entry.path}>{sp}</div>
                      <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#aaa" }}>{entry.hex}</div>
                    </div>
                    <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#555" }}>{entry.type}</span>
                  </div>
                );
              })
            }
          </>
        )}
        {tab === "BG" && (
          <>
            <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#444" }}>BACKGROUND</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "5px" }}>
              {BG_PRESETS.map(c => (
                <div key={c} onClick={() => { onBgChange(c); if (c !== "transparent") setCustomHex(c); }} style={{
                  aspectRatio: "1", borderRadius: "6px", cursor: "pointer",
                  border: bgColor === c ? "2px solid #7c6af7" : "2px solid transparent",
                  background: c === "transparent" ? "repeating-conic-gradient(#555 0% 25%,#333 0% 50%) 0 0/12px 12px" : c,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "9px", color: "#444", flex: 1 }}>커스텀</span>
              <input type="text" value={customHex} placeholder="#ffffff" maxLength={7}
                onChange={e => { setCustomHex(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onBgChange(e.target.value); }}
                style={{ background: "#12121e", border: "1px solid #2a2a3e", color: "#aaa", fontFamily: "monospace", fontSize: "10px", padding: "5px 8px", borderRadius: "6px", width: "82px", outline: "none" }} />
              <input type="color" value={customHex || "#ffffff"} onInput={e => { setCustomHex(e.target.value); onBgChange(e.target.value); }} />
            </div>
          </>
        )}
        {tab === "EXPORT" && (
          <>
            <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#444" }}>EXPORT</div>
            {[["수정된 JSON 다운로드", onExportJSON], ["원본 JSON 다운로드", onExportOriginal], ["현재 프레임 SVG 저장", onExportSVG]].map(([l, fn]) => (
              <button key={l} onClick={fn} style={{ padding: "9px 12px", borderRadius: "7px", fontFamily: "monospace", fontSize: "9px", cursor: "pointer", border: "1px solid #2a2a3e", background: "#12121e", color: "#aaa", textAlign: "left" }}>⤓ {l}</button>
            ))}
          </>
        )}
      </div>
      <div style={{ flexShrink: 0, borderTop: "1px solid #1e2530", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117" }}>
        <button onClick={onUndo} disabled={!canUndo} style={{ padding: "6px 11px", borderRadius: "6px", fontFamily: "monospace", fontSize: "9px", cursor: canUndo ? "pointer" : "not-allowed", border: "1px solid " + (canUndo ? "#7c6af788" : "#2a2a3e"), background: canUndo ? "#7c6af718" : "transparent", color: canUndo ? "#7c6af7" : "#333", opacity: canUndo ? 1 : 0.4 }}>↺ 되돌리기</button>
        <button onClick={onExportJSON} style={{ padding: "6px 11px", borderRadius: "6px", fontFamily: "monospace", fontSize: "9px", cursor: "pointer", border: "1px solid #7c6af788", background: "#7c6af718", color: "#7c6af7" }}>⤓ 내보내기</button>
      </div>
    </div>
  );
}

function LeftSidebar({ sessions, currentSessionId, onLoadSession, onDelete, onClearAll, onNewFile, isOwner }) {
  const [confirmId, setConfirmId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fmtDate = (ts) => { if (!ts) return "—"; const d = new Date(ts); return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0d1117", borderRight: "1px solid #1e2530", overflow: "hidden" }}>
      <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #1e2530", flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#444", letterSpacing: "1.5px", marginBottom: "10px" }}>업로드 내역</div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "8px", borderRadius: "8px", border: "1px dashed #7c6af7", background: "rgba(124,106,247,.06)", color: "#7c6af7", fontFamily: "monospace", fontSize: "10px", cursor: "pointer" }}>
          + 파일 업로드
          <input type="file" accept=".json" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) { onNewFile(f); e.target.value = ""; } }} />
        </label>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {!isOwner && (
          <div style={{ padding: "12px", textAlign: "center", color: "#444", fontSize: "10px", lineHeight: "1.8", border: "1px dashed #1e2530", borderRadius: "7px", margin: "8px 0" }}>
            히스토리는 오너 계정에서만<br />저장됩니다
          </div>
        )}
        {sessions.length === 0 && isOwner && (
          <div style={{ padding: "28px 12px", textAlign: "center", color: "#444", fontSize: "10px", lineHeight: "2" }}>
            <div style={{ fontSize: "20px", marginBottom: "6px", opacity: 0.4 }}>◈</div>아직 업로드 내역이 없습니다
          </div>
        )}
        {sessions.map(sess => {
          const undoCount = (sess.undo_stack?.length || 1) - 1;
          const isCurrent = sess.id === currentSessionId;
          const isConf = confirmId === sess.id;
          return (
            <div key={sess.id} onClick={!isConf ? () => onLoadSession(sess.id) : undefined}
              style={{ padding: "10px", borderRadius: "8px", marginBottom: "4px", cursor: isConf ? "default" : "pointer", border: `1px solid ${isCurrent ? "rgba(124,106,247,.5)" : "transparent"}`, borderLeft: `3px solid ${isCurrent ? "#7c6af7" : "transparent"}`, background: isCurrent ? "rgba(124,106,247,.08)" : "transparent" }}>
              {isConf ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "9px", color: "#444" }}>삭제하시겠습니까?</div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={e => { e.stopPropagation(); onDelete(sess.id); setConfirmId(null); }} style={{ fontSize: "9px", padding: "3px 8px", borderRadius: "4px", border: "1px solid #a855f7", background: "transparent", color: "#a855f7", cursor: "pointer", fontFamily: "monospace" }}>삭제</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(null); }} style={{ fontSize: "9px", padding: "3px 8px", borderRadius: "4px", border: "1px solid #2a2a3e", background: "transparent", color: "#555", cursor: "pointer", fontFamily: "monospace" }}>취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "4px", marginBottom: "5px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: isCurrent ? "#eee" : "#666", wordBreak: "break-all", lineHeight: "1.3", flex: 1 }}>
                      {isCurrent && <span style={{ color: "#7c6af7", marginRight: "4px" }}>●</span>}
                      {(sess.file_name || "Unknown").replace(/\.json$/i, "").slice(0, 20)}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setConfirmId(sess.id); }} style={{ background: "transparent", border: "none", color: "#333", cursor: "pointer", fontSize: "10px", padding: "0 2px" }}>✕</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: "4px" }}>
                    {sess.anim_info && <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#555" }}>{sess.anim_info.frames}f · {sess.anim_info.fps}fps</span>}
                    {sess.anim_info && <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#555" }}>{sess.anim_info.w}×{sess.anim_info.h}</span>}
                    {undoCount > 0 && <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "#1a1a2e", border: "1px solid #f7c76a55", color: "#f7c76a" }}>↺{undoCount}</span>}
                  </div>
                  <div style={{ fontSize: "8px", color: "#333" }}>{fmtDate(sess.last_edit_at || sess.opened_at)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {sessions.length > 0 && isOwner && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid #1e2530", flexShrink: 0 }}>
          {confirmClear ? (
            <div style={{ display: "flex", gap: "6px" }}>
              <span style={{ fontSize: "9px", color: "#444", flex: 1, display: "flex", alignItems: "center" }}>전체 삭제?</span>
              <button onClick={() => { onClearAll(); setConfirmClear(false); }} style={{ fontSize: "9px", padding: "3px 8px", borderRadius: "4px", border: "1px solid #a855f7", background: "transparent", color: "#a855f7", cursor: "pointer", fontFamily: "monospace" }}>확인</button>
              <button onClick={() => setConfirmClear(false)} style={{ fontSize: "9px", padding: "3px 8px", borderRadius: "4px", border: "1px solid #2a2a3e", background: "transparent", color: "#555", cursor: "pointer", fontFamily: "monospace" }}>취소</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} style={{ width: "100%", fontSize: "9px", padding: "5px", borderRadius: "4px", border: "1px solid #2a2a3e", background: "transparent", color: "#444", cursor: "pointer", fontFamily: "monospace" }}>전체 삭제</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function LottieStudio({ user, isOwner, onClose }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [bgColor, setBgColor] = useState("transparent");
  const [animData, setAnimData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [animInfo, setAnimInfo] = useState(null);
  const [colorEntries, setColorEntries] = useState([]);
  const [frameInfo, setFrameInfo] = useState({ cur: 0, total: 0, pct: 0 });
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [toast, setToast] = useState("");
  const [showConverter, setShowConverter] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mountTrigger, setMountTrigger] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [sessions, setSessions] = useState([]);

  const lottieRef = useRef(null);
  const animRef = useRef(null);
  const toastTimer = useRef(null);
  const isLoopingRef = useRef(true);
  const autoSaveTimer = useRef(null);
  const currentSessionIdRef = useRef(null);

  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // 세션 로드 (오너만)
  useEffect(() => {
    if (user && isOwner) dbFetchSessions(user.id).then(setSessions);
  }, [user, isOwner]);

  // lottie 마운트
  useEffect(() => {
    if (!mountTrigger || !lottieRef.current) return;
    const { data, frame, play } = mountTrigger;
    if (animRef.current) { animRef.current.destroy(); animRef.current = null; }
    lottieRef.current.innerHTML = "";
    let a;
    getLottie().then((lottieLib) => {
    a = lottieLib.loadAnimation({ container: lottieRef.current, renderer: "svg", loop: isLoopingRef.current, autoplay: false, animationData: JSON.parse(JSON.stringify(data)) });
    a.addEventListener("enterFrame", () => {
      const c = Math.round(a.currentFrame), t = Math.round(a.totalFrames);
      setFrameInfo({ cur: c, total: t, pct: t > 0 ? (c / t) * 100 : 0 });
    });
    a.addEventListener("complete", () => { if (!isLoopingRef.current) setIsPlaying(false); });
    if (frame > 0) a.goToAndStop(frame, true);
    if (play) { a.play(); setIsPlaying(true); } else setIsPlaying(false);
    animRef.current = a;
    });
  }, [mountTrigger]);

  const showToast = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2400); };
  const triggerMount = (data, frame = 0, play = true) => setMountTrigger({ data, frame, play, ts: Date.now() });
  const reloadAnimation = (data) => {
    const curFrame = animRef.current ? Math.round(animRef.current.currentFrame) : 0;
    const wasPlaying = animRef.current ? !animRef.current.isPaused : false;
    triggerMount(data, curFrame, wasPlaying);
  };

  const scheduleAutoSave = useCallback((data, label) => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const sid = currentSessionIdRef.current;
      if (!sid || !isOwner) return;
      setIsSaving(true);
      const newStack = await dbAutoSave(sid, data, label);
      if (newStack) {
        setUndoStack(newStack);
        setSessions(prev => prev.map(s => s.id === sid ? { ...s, final_data: data, undo_stack: newStack, last_edit_at: new Date().toISOString() } : s));
      }
      setIsSaving(false);
    }, AUTO_SAVE_DELAY);
  }, [isOwner]);

  const loadFile = async (file) => {
    if (!file?.name?.endsWith(".json")) { showToast("❌ .json 파일만 가능합니다"); return; }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const orig = JSON.parse(JSON.stringify(parsed));
      const data = JSON.parse(JSON.stringify(parsed));
      const info = { frames: Math.round(data.op - data.ip), fps: data.fr, duration: ((data.op - data.ip) / data.fr).toFixed(2), layers: data.layers?.length || 0, w: data.w, h: data.h };
      setOriginalData(orig); setAnimData(data); setAnimInfo(info);
      setColorEntries(extractColors(data));
      setUndoStack([{ ts: new Date().toISOString(), data, label: "원본" }]);
      triggerMount(data);
      showToast("✓ " + file.name + " 로드 완료");

      if (isOwner && user) {
        const result = await dbCreateSession(user.id, file.name, file.size, info, data);
        if (result) {
          setCurrentSessionId(result.sid);
          setSessions(prev => [result.payload, ...prev]);
        }
      }
    } catch (e) { showToast("❌ 유효한 Lottie JSON이 아닙니다"); }
  };

  const handleLoadSession = async (sessionId) => {
    const sess = await dbLoadSession(sessionId);
    if (!sess?.final_data) { showToast("❌ 불러오기 실패"); return; }
    const data = sess.final_data;
    const info = sess.anim_info || {};
    setOriginalData(JSON.parse(JSON.stringify(data))); setAnimData(data); setAnimInfo(info);
    setColorEntries(extractColors(data));
    const stack = sess.undo_stack || [{ ts: sess.opened_at, data, label: "원본" }];
    setUndoStack(stack);
    setCurrentSessionId(sessionId);
    triggerMount(data);
    showToast("▶ " + (sess.file_name || "파일") + " 불러오기 완료");
  };

  const handleColorChange = async (idx, hexVal) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hexVal)) return;
    const entries = [...colorEntries];
    applyColorToEntry(entries[idx], hexVal);
    entries[idx].hex = hexVal;
    setColorEntries(entries);
    setAnimData(prev => { if (prev) { reloadAnimation(prev); scheduleAutoSave(prev, "색상 수정"); } return prev; });
  };

  const handleResetColors = () => {
    if (!originalData) return;
    const fresh = JSON.parse(JSON.stringify(originalData));
    setAnimData(fresh); setColorEntries(extractColors(fresh)); reloadAnimation(fresh);
    scheduleAutoSave(fresh, "색상 초기화"); showToast("↺ 색상 원본 복원 완료");
  };

  const handleUndo = async () => {
    if (undoStack.length <= 1) { showToast("↺ 더 이상 되돌릴 수 없습니다"); return; }
    const newStack = undoStack.slice(0, -1);
    const prev = newStack[newStack.length - 1];
    setUndoStack(newStack); setAnimData(prev.data); setColorEntries(extractColors(prev.data)); reloadAnimation(prev.data);
    if (isOwner && currentSessionId) await dbUndo(currentSessionId);
    showToast(`↺ "${prev.label}"로 되돌림`);
  };

  const togglePlay = () => { if (!animRef.current) return; if (animRef.current.isPaused) { animRef.current.play(); setIsPlaying(true); } else { animRef.current.pause(); setIsPlaying(false); } };
  const stopAnim = () => { if (!animRef.current) return; animRef.current.stop(); setIsPlaying(false); };
  const stepBack = () => { if (!animRef.current) return; animRef.current.pause(); setIsPlaying(false); animRef.current.goToAndStop(Math.max(0, animRef.current.currentFrame - 1), true); };
  const stepForward = () => { if (!animRef.current) return; animRef.current.pause(); setIsPlaying(false); animRef.current.goToAndStop(Math.min(animRef.current.totalFrames - 1, animRef.current.currentFrame + 1), true); };
  const handleLoopToggle = () => { const nl = !isLooping; setIsLooping(nl); isLoopingRef.current = nl; if (animRef.current) animRef.current.loop = nl; };
  const handleSpeedChange = (s) => { if (animRef.current) animRef.current.setSpeed(s); };
  const handleSeek = (e) => {
    if (!animRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    animRef.current.goToAndStop(Math.round(pct * animRef.current.totalFrames), true);
    if (isPlaying) animRef.current.play();
  };

  const dl = (data, type, name) => { const b = new Blob([data], { type }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); };
  const exportJSON = async () => { if (!animData) return; dl(JSON.stringify(animData, null, 2), "application/json", "animation_modified.json"); if (isOwner && currentSessionId) { const ex = await dbLogExport(currentSessionId, "수정된 JSON"); if (ex) setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, exports: ex } : s)); } showToast("⤓ 수정된 JSON 저장"); };
  const exportOriginalJSON = async () => { if (!originalData) return; dl(JSON.stringify(originalData, null, 2), "application/json", "animation_original.json"); if (isOwner && currentSessionId) await dbLogExport(currentSessionId, "원본 JSON"); showToast("⤓ 원본 JSON 저장"); };
  const exportFrameSVG = async () => { const svg = lottieRef.current?.querySelector("svg"); if (!svg) return; dl(new XMLSerializer().serializeToString(svg), "image/svg+xml", "frame.svg"); if (isOwner && currentSessionId) await dbLogExport(currentSessionId, "SVG"); showToast("⎘ SVG 저장"); };
  const resetAll = () => { if (animRef.current) { animRef.current.destroy(); animRef.current = null; } setAnimData(null); setOriginalData(null); setAnimInfo(null); setColorEntries([]); setIsPlaying(false); setCurrentSessionId(null); setFrameInfo({ cur: 0, total: 0, pct: 0 }); setMountTrigger(null); setUndoStack([]); if (lottieRef.current) lottieRef.current.innerHTML = ""; showToast("↺ 초기화 완료"); };

  const hasAnimation = !!animData;

  if (showConverter) {
    return <LottieConverter onClose={() => setShowConverter(false)} />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "#0d1117", display: "flex", flexDirection: "column", fontFamily: "'Pretendard', sans-serif" }}>
      {/* 헤더 */}
      <div style={{ padding: "0 16px", height: "48px", background: "#12121e", borderBottom: "1px solid #1e2530", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#a080e0" }}>◈ Lottie Studio</span>
        {isOwner && <span style={{ fontSize: "10px", padding: "2px 8px", background: "#1e1e3e", border: "1px solid #3a3a6e", borderRadius: "6px", color: "#7c6af7" }}>오너</span>}
        {!isOwner && <span style={{ fontSize: "10px", color: "#444" }}>히스토리 저장 없음</span>}
        {isSaving && <span style={{ fontSize: "10px", color: "#555" }}>저장 중...</span>}
        <div style={{ flex: 1 }} />
        <button onClick={resetAll} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #2a2a3e", borderRadius: "8px", color: "#555", fontSize: "11px", cursor: "pointer" }}>↺ 초기화</button>
        <button onClick={() => setShowConverter(true)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid #2a2a3e", borderRadius: "8px", color: "#888", fontSize: "11px", cursor: "pointer" }}>WebP 변환</button>
        <button onClick={onClose} style={{ padding: "5px 14px", background: "#1e1e3e", border: "1px solid #3a3a6e", borderRadius: "8px", color: "#a080e0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>✕ 닫기</button>
      </div>

      {/* 3단 레이아웃 */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 280px", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <LeftSidebar sessions={sessions} currentSessionId={currentSessionId} onLoadSession={handleLoadSession}
          onDelete={async (id) => { await dbDeleteSession(id); setSessions(prev => prev.filter(s => s.id !== id)); showToast("삭제 완료"); }}
          onClearAll={async () => { if (user) await dbClearAllSessions(user.id); setSessions([]); showToast("↺ 전체 삭제 완료"); }}
          onNewFile={loadFile} isOwner={isOwner} />

        {/* 가운데: 프리뷰 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", gap: "18px", overflow: "hidden", borderLeft: "1px solid #1e2530", borderRight: "1px solid #1e2530" }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}>
          <div style={{
            width: "100%", maxWidth: "420px", aspectRatio: "1",
            border: dragOver ? "2px dashed #7c6af7" : (hasAnimation ? "2px solid transparent" : "2px dashed #2a2a3e"),
            borderRadius: "18px", position: "relative", overflow: "hidden",
            background: hasAnimation ? (bgColor === "transparent" ? CHECKER : bgColor) : (dragOver ? "rgba(124,106,247,0.05)" : "#12121e"),
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all .3s",
          }}>
            <div ref={lottieRef} style={{ position: "absolute", inset: 0 }} />
            {dragOver && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(124,106,247,.15)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, borderRadius: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#7c6af7" }}>{hasAnimation ? "↺ 파일 교체" : "파일 드롭"}</div>
              </div>
            )}
            {!hasAnimation && !dragOver && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center", padding: "20px" }}>
                <div style={{ width: "56px", height: "56px", border: "2px solid #2a2a3e", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", color: "#444" }}>◈</div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: "#ccc" }}>Lottie 파일을 드롭하세요</div>
                <div style={{ fontSize: "10px", color: "#444", lineHeight: "1.7" }}>.json 파일 드래그 또는 클릭 선택</div>
                <label style={{ background: "#7c6af7", color: "white", padding: "8px 20px", borderRadius: "7px", fontSize: "10px", cursor: "pointer", display: "inline-block" }}>
                  파일 선택
                  <input type="file" accept=".json" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) loadFile(f); }} />
                </label>
              </div>
            )}
          </div>
          {hasAnimation && (
            <PlayerControls isPlaying={isPlaying} isLooping={isLooping} frameInfo={frameInfo}
              onPlay={togglePlay} onStop={stopAnim} onStepBack={stepBack} onStepForward={stepForward}
              onLoopToggle={handleLoopToggle} onSpeedChange={handleSpeedChange} onSeek={handleSeek} />
          )}
        </div>

        <RightPanel animInfo={animInfo} colorEntries={colorEntries} onColorChange={handleColorChange}
          onResetColors={handleResetColors} bgColor={bgColor} onBgChange={setBgColor}
          onExportJSON={exportJSON} onExportOriginal={exportOriginalJSON} onExportSVG={exportFrameSVG}
          onReset={resetAll} onUndo={handleUndo} canUndo={undoStack.length > 1} />
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#ccc", padding: "9px 16px", borderRadius: "8px", fontSize: "10px", zIndex: 10000, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
