const SUPABASE_URL = 'https://atwztuelyhwtohylbypv.supabase.co'

function getHeaders(serviceKey) {
  return {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })
  const headers = getHeaders(serviceKey)

  // POST /api/feedback — 피드백 저장
  if (req.method === 'POST') {
    const { type = 'manual', message, stack_trace, url, user_agent, app_version } = req.body || {}
    const priority = type === 'crash' ? 'critical' : 'normal'

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ type, priority, message, stack_trace, url, user_agent, app_version }),
    })
    const data = await resp.json()
    if (!resp.ok) return res.status(500).json({ error: data })
    return res.status(200).json(data[0])
  }

  // GET /api/feedback — 목록 조회 (오너 전용)
  if (req.method === 'GET') {
    const { status, limit = 50 } = req.query
    let query = `${SUPABASE_URL}/rest/v1/feedback?order=created_at.desc&limit=${limit}`
    if (status) query += `&status=eq.${status}`

    const resp = await fetch(query, { headers })
    const data = await resp.json()
    if (!resp.ok) return res.status(500).json({ error: data })

    // 각 피드백에 코멘트 첨부
    const ids = data.map(f => f.id)
    let comments = []
    if (ids.length > 0) {
      const cResp = await fetch(
        `${SUPABASE_URL}/rest/v1/feedback_comments?feedback_id=in.(${ids.join(',')})&order=created_at.asc`,
        { headers }
      )
      comments = await cResp.json()
    }

    const result = data.map(f => ({
      ...f,
      comments: comments.filter(c => c.feedback_id === f.id),
    }))
    return res.status(200).json(result)
  }

  // PATCH /api/feedback — 상태 변경 (오너 트리아지)
  if (req.method === 'PATCH') {
    const { id, status } = req.body || {}
    if (!id || !status) return res.status(400).json({ error: 'id and status required' })

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/feedback?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ status }),
    })
    const data = await resp.json()
    if (!resp.ok) return res.status(500).json({ error: data })
    return res.status(200).json(data[0])
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
