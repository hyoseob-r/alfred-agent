const SUPABASE_URL = "https://atwztuelyhwtohylbypv.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d3p0dWVseWh3dG9oeWxieXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzY2MTMsImV4cCI6MjA4ODg1MjYxM30.xkq6_HIadBh57v6W_puBKf8iP7gGd-1ifYtSfxHc4eY";
export const SCHEMA_VERSION = 2;

const GUEST_LS_KEY = 'alfred_guest_sessions';

let _supabase = null;
export async function getSupabase() {
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

export function migrateMessages(msgs) {
  return (msgs || []).map(m => ({
    ...m,
    files: m.files || (m.images ? m.images.map(img => ({ type: "image", name: img.name || "image", mediaType: img.mediaType })) : []),
    images: undefined,
  }));
}

export function serializeMessages(msgs) {
  return msgs.map(m => ({
    role: m.role,
    content: m.content || "",
    stageLabel: m.stageLabel,
    stageColor: m.stageColor,
    stageIcon: m.stageIcon,
    files: m.files?.map(f => ({ type: f.type, name: f.name, mediaType: f.mediaType })) || [],
  }));
}

export function newSessionId() { return "s_" + Date.now(); }

export async function dbLoadSessions(userId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("sessions")
    .select("id, title, stage, schema_version, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) { console.error("loadSessions:", error); return []; }
  return data || [];
}

export async function dbLoadMessages(sessionId) {
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

export async function dbUpsertSession(session, userId) {
  const sb = await getSupabase();
  await sb.from("sessions").upsert({
    id: session.id, user_id: userId,
    title: session.title, stage: session.stage,
    schema_version: SCHEMA_VERSION, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

export async function dbSaveMessages(sessionId, msgs, userId) {
  const sb = await getSupabase();
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

export async function dbDeleteSession(sessionId) {
  const sb = await getSupabase();
  await sb.from("sessions").delete().eq("id", sessionId);
}

export async function dbNextCouncilId(type = 'a') {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('next_council_id', { p_type: type });
  if (error) throw error;
  return data;
}

export async function dbDeleteCouncilSession(id) {
  const sb = await getSupabase();
  await sb.from("council_sessions").delete().eq("id", id);
}

export async function dbLoadCouncilSessions(userId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from("council_sessions")
    .select("id, topic, summary, created_at, rounds")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) { console.error("loadCouncilSessions:", error); return []; }
  return data || [];
}

export async function dbSaveCouncilSession({ id, sessionId, userId, topic, rounds, summary }) {
  const sb = await getSupabase();
  const { error } = await sb.from("council_sessions").upsert({
    id,
    session_id: sessionId || null,
    user_id: userId,
    topic,
    rounds,
    summary: summary || null,
  }, { onConflict: "id" });
  if (error) console.error("dbSaveCouncilSession:", error);
}

// Guest localStorage helpers
export function guestGetAllSessions() {
  try { return JSON.parse(localStorage.getItem(GUEST_LS_KEY) || '[]'); } catch { return []; }
}
export function guestSaveSession(session) {
  const all = guestGetAllSessions();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) all[idx] = session; else all.unshift(session);
  localStorage.setItem(GUEST_LS_KEY, JSON.stringify(all.slice(0, 30)));
}
export function guestDeleteSession(id) {
  localStorage.setItem(GUEST_LS_KEY, JSON.stringify(guestGetAllSessions().filter(s => s.id !== id)));
}

// Auth helpers
export async function signInWithGitHub() {
  const sb = await getSupabase();
  await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.href } });
}
export async function signInWithGoogle() {
  const sb = await getSupabase();
  await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
}
export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}
export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}
