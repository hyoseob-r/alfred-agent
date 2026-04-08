export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { id, type = 'c', topic, rounds, summary } = req.body
  if (!topic || !rounds) return res.status(400).json({ error: 'topic and rounds are required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) {
    return res.status(500).json({ error: 'Server not configured (SUPABASE_SERVICE_ROLE_KEY or COUNCIL_USER_ID missing)' })
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  try {
    let councilId = id

    // id 없으면 새 순번 ID 발급 (#c-00001 형식)
    if (!councilId) {
      const idResp = await fetch(`${supabaseUrl}/rest/v1/rpc/next_council_id`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_type: type }),
      })
      if (!idResp.ok) {
        const err = await idResp.text()
        return res.status(500).json({ error: 'ID 발급 실패: ' + err })
      }
      councilId = await idResp.json() // "#c-00001"
    }

    // upsert (id 충돌 시 덮어쓰기)
    const resp = await fetch(`${supabaseUrl}/rest/v1/council_sessions`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: councilId,
        session_id: null,
        user_id: userId,
        topic: String(topic).slice(0, 200),
        rounds,
        summary: summary || null,
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      console.error('Supabase upsert error:', err)
      return res.status(500).json({ error: err })
    }

    return res.status(200).json({ ok: true, id: councilId })
  } catch (e) {
    console.error('save-council error:', e)
    return res.status(500).json({ error: e.message })
  }
}
