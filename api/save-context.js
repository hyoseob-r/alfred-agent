export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type = 'general', title, content, tags = [] } = req.body
  if (!title || !content) return res.status(400).json({ error: 'title and content required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  try {
    // 같은 title이 있으면 content 업데이트 (upsert 흉내)
    const existResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id`,
      { headers }
    )
    const existing = await existResp.json()

    let resp
    if (Array.isArray(existing) && existing.length > 0) {
      // UPDATE
      resp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content, tags, type }),
        }
      )
    } else {
      // INSERT
      resp = await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: userId, type, title, content, tags }),
      })
    }

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(500).json({ error: err })
    }

    return res.status(200).json({ ok: true, title, type })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
