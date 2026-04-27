// AI Queue — Storybook ↔ Claude Code 브릿지
// GET  /api/ai-queue?role=claude  → 대기 중인 명령 읽기 (Claude Code용)
// GET  /api/ai-queue?role=browser → 결과 읽기 (Storybook 폴링용)
// POST /api/ai-queue  body: { type:"command"|"result", payload:{...} }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId      = process.env.COUNCIL_USER_ID
  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  const COMMAND_TITLE = '__ai_queue_command__'
  const RESULT_TITLE  = '__ai_queue_result__'

  if (req.method === 'POST') {
    const { type, payload } = req.body
    if (!type || !payload) return res.status(400).json({ error: 'type and payload required' })
    const title   = type === 'command' ? COMMAND_TITLE : RESULT_TITLE
    const content = JSON.stringify(payload)

    // upsert — 같은 title 있으면 update
    const existResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id`,
      { headers }
    )
    const existing = await existResp.json()

    let resp
    if (Array.isArray(existing) && existing.length > 0) {
      resp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`,
        { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ content, type: 'ai_queue', tags: [type] }) }
      )
    } else {
      resp = await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: userId, type: 'ai_queue', title, content, tags: [type] }),
      })
    }
    if (!resp.ok) return res.status(500).json({ error: await resp.text() })
    return res.status(200).json({ ok: true, type })
  }

  if (req.method === 'GET') {
    const role  = req.query.role   // "claude" | "browser"
    const title = role === 'claude' ? COMMAND_TITLE : RESULT_TITLE

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=content,updated_at&limit=1`,
      { headers }
    )
    const rows = await resp.json()
    if (!Array.isArray(rows) || rows.length === 0) return res.status(200).json(null)
    try {
      const payload = JSON.parse(rows[0].content)
      return res.status(200).json({ ...payload, _updatedAt: rows[0].updated_at })
    } catch {
      return res.status(200).json(null)
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
